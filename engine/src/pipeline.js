import path from 'node:path';
import { zonedParts, sha1, writeJson, round, sleep } from './util.js';
import { collect } from './collector.js';
import { pickNewsTopic, pickEvergreen } from './topics.js';
import { generateArticle, judgeArticle, judgeIssues, pickAngle } from './editor.js';
import { validateArticle, normalizeArticle, feedbackFor } from './validator.js';
import { publishArticle, loadExisting } from './publisher.js';
import { illustrate, imageWanted } from './images.js';
import { resolveAuthor } from './authors.js';
import { listManualImages, renderManualImageList } from './refs.js';
import fs from 'node:fs';
import { dueSlots, expireSlots } from './scheduler.js';
import { BudgetExceededError, QuotaError, FatalGeminiError, UnavailableError, MalformedResponseError } from './gemini.js';

const frDate = (d, tz) => new Intl.DateTimeFormat('fr-FR', { timeZone: tz, dateStyle: 'full' }).format(d);

/**
 * Un cycle: determine les creneaux dus, puis pour chacun collecte -> sujet -> generation -> controles -> publication.
 * Chaque etape est journalisee. Les echecs d'un creneau ne perdent jamais les articles deja publies.
 */
export async function runCycle(ctx) {
  const { cfg, store, logger, now: nowFn, paths } = ctx;
  const now = nowFn();
  const tz = cfg.schedule.timezone;
  const result = { runId: ctx.runId, at: now.toISOString(), published: [], failed: [], stopped: null };

  if (cfg.control.paused) {
    logger.warn('cycle.paused', { reason: cfg.control.pauseReason });
    result.stopped = 'paused';
    return result;
  }

  store.prune(zonedParts(now, tz).date, cfg);
  const expired = ctx.forceCatchup ? 0 : expireSlots({ now, schedule: cfg.schedule, store });
  if (expired) logger.warn('cycle.slots_abandoned', { count: expired });

  let slots;
  const { date, due, remainingToday } = dueSlots({ now, schedule: cfg.schedule, store, force: ctx.forceCatchup });
  if (ctx.extra) {
    // Publication supplementaire manuelle: toujours limitee par maxPerDay.
    if (remainingToday <= 0) {
      logger.warn('cycle.daily_cap_reached', { date, max: cfg.schedule.maxPerDay });
      result.stopped = 'daily_cap';
      return result;
    }
    // Jusqu'a ctx.count articles (1 a 8) dans ce lancement, sans jamais depasser le plafond quotidien.
    const wanted = Math.max(1, Math.min(Number(ctx.count) || 1, 8, remainingToday));
    const used = Object.keys(store.state.slots[date] ?? {}).filter((k) => /^x\d+$/.test(k)).map((k) => Number(k.slice(1)));
    const first = (used.length ? Math.max(...used) : 0) + 1;
    slots = Array.from({ length: wanted }, (_, i) => ({ idx: `x${first + i}`, hhmm: 'manuel', key: `${date}#x${first + i}` }));
  } else {
    slots = due;
  }
  logger.info('cycle.start', { date, due: slots.map((s) => s.key), remainingToday, dryRun: !!ctx.dryRun });
  if (!slots.length) return result;

  let items = null;
  try {
    items = await collect({ cfg, logger, now: nowFn, fetcher: ctx.fetcher });
    logger.info('collect.done', { items: items.length });
  } catch (err) {
    logger.error('collect.failed', { error: err.message });
    items = [];
  }

  for (const slot of slots) {
    try {
      const out = await processSlot(ctx, slot, items);
      (out.published ? result.published : result.failed).push(out);
      // Rafale espacee: pause entre deux articles pour que les heures de publication ne soient pas identiques.
      if (ctx.extra && ctx.spacingMs > 0 && slot !== slots[slots.length - 1]) {
        logger.info('cycle.spacing', { waitMinutes: ctx.spacingMs / 60000 });
        await (ctx.sleep ?? sleep)(ctx.spacingMs);
      }
    } catch (err) {
      // Erreurs qui interrompent tout le cycle (budget, quota, cle invalide).
      if (err instanceof BudgetExceededError) result.stopped = 'budget';
      else if (err instanceof QuotaError) result.stopped = 'quota';
      else if (err instanceof UnavailableError) result.stopped = 'gemini_unavailable';
      else if (err instanceof FatalGeminiError) result.stopped = 'gemini_fatal';
      else throw err;
      logger.error('cycle.stopped', { reason: result.stopped, error: err.message });
      store.setSlot(date, slot.idx, { status: 'failed', lastError: `${result.stopped}: ${err.message}`.slice(0, 300) });
      break;
    }
  }
  store.state.lastRun = { at: now.toISOString(), runId: ctx.runId, published: result.published.length, stopped: result.stopped };
  store.save();
  return result;
}

async function processSlot(ctx, slot, items) {
  const { cfg, store, logger, client, paths } = ctx;
  const now = ctx.now();
  const tz = cfg.schedule.timezone;
  const { date } = zonedParts(now, tz);
  const v = cfg.engine.validation;
  const contentDir = ctx.dryRun ? path.join(paths.data, 'dry-run') : paths.content;
  const existing = loadExisting(paths.content, { now });

  // Reprise apres incident: un article portant deja ce creneau existe => ne jamais en creer un second.
  const done = existing.find((e) => e.slot === slot.key);
  if (done) {
    logger.warn('slot.reconciled', { slot: slot.key, articleId: done.id });
    store.setSlot(date, slot.idx, { status: 'published', articleId: done.id });
    return { slot: slot.key, published: true, reconciled: true, id: done.id };
  }

  const prev = store.slot(date, slot.idx);
  store.setSlot(date, slot.idx, { status: 'in_progress', attempts: (prev?.attempts ?? 0) + 1, startedAt: now.toISOString() });
  store.save(); // la tentative est enregistree avant tout appel externe

  const categoryCountsToday = {};
  for (const e of existing) {
    if (zonedParts(new Date(e.publishedAt), tz).date === date) categoryCountsToday[e.category] = (categoryCountsToday[e.category] ?? 0) + 1;
  }

  // --- choix du sujet ---
  let topic = null;
  const { topic: news, rejected } = pickNewsTopic({
    items,
    store,
    publishedTitles: existing.map((e) => e.title),
    cfg,
    now,
    categoryCountsToday,
  });
  logger.info('topic.selection', { slot: slot.key, candidates: items.length, rejected: rejected.length, chosen: news?.title ?? null, score: news?.score });
  if (news) topic = { ...news, kind: 'news' };
  else if (cfg.engine.topics.evergreenWhenNoTopic) {
    topic = pickEvergreen({ store, cfg, now, categoryCountsToday, rng: ctx.rng });
    if (topic) logger.warn('topic.evergreen_fallback', { slot: slot.key, theme: topic.title });
  }
  if (!topic) return fail(ctx, slot, 'aucun_sujet', [{ code: 'aucun_sujet', msg: 'Aucun sujet disponible' }]);
  store.markTopic(topic.id, { title: topic.title, url: topic.url, category: topic.category, seenAt: now.toISOString(), status: 'in_progress' });

  const angle = pickAngle(cfg, ctx.rng);
  const id = sha1(`${slot.key}|${topic.id}`);
  let feedback = '';
  let usedModel = cfg.engine.gemini.generatorModel;
  let last = null; // dernier article genere, conserve en quarantaine si tout echoue
  let lastIssues = [];
  let lastJudge = null;

  for (let attempt = 1; attempt <= v.maxGenerationAttempts; attempt++) {
    let article;
    try {
      ({ article, model: usedModel } = await generateArticle({ client, cfg, topic, angle, feedback, todayLabel: frDate(now, tz), recentTitles: existing.slice().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, cfg.editorial.recentTitlesInPrompt ?? 30).map((e) => e.title) }));
    } catch (err) {
      if (!(err instanceof MalformedResponseError)) throw err;
      lastIssues = [{ code: 'reponse_malformee', msg: err.message }];
      feedback = `Ta réponse précédente était inexploitable (${err.message}). Respecte strictement le schéma JSON et reste dans les limites de longueur.`;
      logger.warn('generate.malformed', { slot: slot.key, attempt, error: err.message });
      continue;
    }

    if (article.status === 'rejected') {
      logger.warn('generate.refused', { slot: slot.key, reason: String(article.rejection_reason).slice(0, 200) });
      store.markTopic(topic.id, { status: 'excluded', reason: 'refused_by_model' });
      store.addRejection({ ts: now.toISOString(), slot: slot.key, topic: topic.title, stage: 'generation', reasons: [`rejet_du_redacteur: ${String(article.rejection_reason).slice(0, 200)}`] });
      return fail(ctx, slot, 'sujet_refuse_par_le_modele', []);
    }

    article = normalizeArticle(article, cfg);
    last = article;
    const det = validateArticle({ article, topic, cfg, existing });
    if (!det.ok) {
      lastIssues = det.issues;
      logger.warn('validate.deterministic_failed', { slot: slot.key, attempt, issues: det.issues.map((i) => i.code) });
      feedback = feedbackFor(det.issues);
      continue;
    }

    let judge;
    try {
      ({ judge } = await judgeArticle({ client, cfg, article, topic }));
    } catch (err) {
      if (!(err instanceof MalformedResponseError)) throw err;
      lastIssues = [{ code: 'juge_indisponible', msg: err.message }];
      logger.warn('judge.malformed', { slot: slot.key, attempt, error: err.message });
      continue; // sans evaluation exploitable, on ne publie pas
    }
    lastJudge = judge;
    const ji = judgeIssues(judge, cfg);
    logger.info('judge.result', { slot: slot.key, attempt, humor: judge.humor, coherence: judge.coherence, risk: judge.risk, issues: ji.map((i) => i.code) });
    if (ji.length) {
      lastIssues = ji;
      feedback = feedbackFor(ji);
      continue;
    }

    // --- publication ---
    let image = null;
    if (imageWanted({ cfg, slot, existing, now })) image = await illustrate({ client, cfg, article, topic, logger, slotKey: slot.key });
    const imageDir = ctx.dryRun ? path.join(paths.data, 'dry-run', 'images') : path.join(paths.siteRoot ?? path.join(paths.root, 'site'), 'public', 'images', 'articles');
    const signed = resolveAuthor({ proposed: article.author, category: article.category }, cfg);
    if (signed && !signed.chosenByModel) logger.warn('author.default', { slot: slot.key, proposed: article.author ?? null, used: signed.name });
    const pub = publishArticle({ article, topic, id, slotLabel: slot.key, model: usedModel, now, contentDir, existing, image, imageDir, author: signed?.name ?? null });
    if (!ctx.dryRun) {
      store.setSlot(date, slot.idx, { status: 'published', articleId: id, publishedAt: pub.publishedAt, topicId: topic.id, lastError: null });
      store.markTopic(topic.id, { status: 'used', usedAt: now.toISOString() });
      store.save();
    }
    logger.info('publish.ok', { slot: slot.key, id, slug: pub.slug, url: pub.urlPath, attempt, dryRun: !!ctx.dryRun });
    return { slot: slot.key, published: true, ...pub };
  }

  // Echec: l'article est conserve en quarantaine (rien n'est perdu) avec l'historique des raisons.
  const reasons = lastIssues.map((i) => i.code);
  if (last) {
    store.addQuarantine({
      id, createdAt: now.toISOString(), slotKey: slot.key, topic, article: last, issues: lastIssues, judge: lastJudge, status: 'quarantined',
      retries: 0,
    });
  }
  store.addRejection({ ts: now.toISOString(), slot: slot.key, topic: topic.title, stage: 'validation', reasons, messages: lastIssues.map((i) => i.msg).slice(0, 8) });
  store.markTopic(topic.id, { status: 'rejected' });
  logger.warn('slot.quarantined', { slot: slot.key, reasons });
  return fail(ctx, slot, reasons.join(','), lastIssues);
}

function fail(ctx, slot, reason, issues) {
  const { store, logger } = ctx;
  const { date } = zonedParts(ctx.now(), ctx.cfg.schedule.timezone);
  store.setSlot(date, slot.idx, { status: 'failed', lastError: String(reason).slice(0, 300) });
  store.save();
  logger.warn('slot.failed', { slot: slot.key, reason });
  return { slot: slot.key, published: false, reason, issues };
}

/** Bilan quotidien de production. */
export function buildReport({ store, cfg, date, existing }) {
  const slots = cfg.schedule.slots.map((hhmm, idx) => ({ idx, hhmm, ...(store.slot(date, idx) ?? { status: 'pending', attempts: 0 }) }));
  const extras = Object.entries(store.state.slots[date] ?? {}).filter(([k]) => k.startsWith('x')).map(([k, s]) => ({ idx: k, hhmm: 'manuel', ...s }));
  const usage = store.usage.entries.filter((e) => e.date === date);
  const published = existing.filter((e) => e.publishedAt && e.slot?.startsWith(date));
  return {
    date,
    target: cfg.schedule.maxPerDay,
    publishedCount: store.publishedCount(date),
    articles: published.map((e) => ({ id: e.id, ref: e.ref, title: e.title, category: e.category, slug: e.slug })),
    slots: [...slots, ...extras],
    rejections: store.quarantine.history.filter((h) => h.ts.startsWith(date)).length,
    quarantined: store.quarantine.items.filter((i) => i.status === 'quarantined').length,
    api: {
      calls: usage.length,
      inputTokens: usage.reduce((s, e) => s + e.inputTokens, 0),
      outputTokens: usage.reduce((s, e) => s + e.outputTokens, 0),
      costUsd: round(usage.reduce((s, e) => s + e.costUsd, 0)),
      dailyCapUsd: cfg.engine.budget.dailyUsd,
      monthCostUsd: store.spentInMonth(date.slice(0, 7)),
      monthlyCapUsd: cfg.engine.budget.monthlyUsd,
    },
    paused: cfg.control.paused,
    lastRun: store.state.lastRun,
  };
}

export function writeDailyReport(ctx) {
  const { cfg, store, paths, now } = ctx;
  const { date } = zonedParts(now(), cfg.schedule.timezone);
  const report = buildReport({ store, cfg, date, existing: loadExisting(paths.content, { now: now() }) });
  if (!ctx.dryRun) {
    writeJson(path.join(paths.data, 'reports', `${date}.json`), report);
    // Liste de suivi des images a deposer a la main (references, descriptions suggerees).
    const articles = loadExisting(paths.content, { now: now() });
    const manual = listManualImages(path.join(paths.siteRoot ?? path.join(paths.root, 'site'), 'src', 'assets', 'manual'));
    fs.mkdirSync(paths.data, { recursive: true });
    fs.writeFileSync(path.join(paths.data, 'images-manuelles.md'), renderManualImageList({ articles, manual, cfg }));
  }
  return report;
}
