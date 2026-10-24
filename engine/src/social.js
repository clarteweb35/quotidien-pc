import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { readJson, writeJson, zonedParts, hhmmToMinutes } from './util.js';
import { loadExisting } from './publisher.js';
import { listManualImages, IMAGE_EXTENSIONS } from './refs.js';

/**
 * Partage automatique des articles (avec image) sur les reseaux.
 * Principes: jamais avant que la page soit reellement en ligne a jour; une seule publication par article et par reseau;
 * plafond quotidien; espacement minimal; une panne d'un reseau ne bloque ni le site ni les autres reseaux.
 */

const graphemes = (s) => [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(s)];
export const graphemeCount = (s) => graphemes(s).length;

function truncate(s, max) {
  const g = graphemes(s);
  return g.length <= max ? s : g.slice(0, Math.max(0, max - 1)).map((x) => x.segment).join('').trimEnd() + '…';
}

/** Texte de la publication: titre, mention satirique explicite, hashtags, lien. */
export function composePost({ article, url, cfg, maxGraphemes = 300 }) {
  const notice = `Article satirique · ${cfg.editorial.publicationName}`;
  const tags = cfg.social.hashtags.join(' ');
  const tail = `\n\n${notice}${tags ? `\n${tags}` : ''}\n${url}`;
  const room = maxGraphemes - graphemeCount(tail);
  const text = `${truncate(article.title, room)}${tail}`;
  return { text, notice, tags };
}

/** Facettes Bluesky (lien, hashtag): positions en OCTETS UTF-8. */
export function blueskyFacets(text, url, tags) {
  const enc = new TextEncoder();
  const facets = [];
  const add = (needle, feature) => {
    const i = text.lastIndexOf(needle);
    if (i < 0) return;
    const byteStart = enc.encode(text.slice(0, i)).length;
    facets.push({ index: { byteStart, byteEnd: byteStart + enc.encode(needle).length }, features: [feature] });
  };
  add(url, { $type: 'app.bsky.richtext.facet#link', uri: url });
  for (const t of tags.split(/\s+/).filter((x) => x.startsWith('#'))) add(t, { $type: 'app.bsky.richtext.facet#tag', tag: t.slice(1) });
  return facets;
}

// ---------- adaptateurs (fetch injectable) ----------

async function call(fetchFn, url, init, label) {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(30000) });
  const body = await res.text();
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${body.slice(0, 200)}`);
  try { return JSON.parse(body); } catch { return {}; }
}

export const adapters = {
  async bluesky({ cfg, env, fetchFn, text, url, article, thumb, now }) {
    const service = cfg.social.networks.bluesky.service.replace(/\/$/, '');
    const session = await call(fetchFn, `${service}/xrpc/com.atproto.server.createSession`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: env.BLUESKY_IDENTIFIER, password: env.BLUESKY_APP_PASSWORD }),
    }, 'bluesky.createSession');
    const auth = { authorization: `Bearer ${session.accessJwt}` };
    let thumbBlob;
    if (thumb) {
      const up = await call(fetchFn, `${service}/xrpc/com.atproto.repo.uploadBlob`, { method: 'POST', headers: { ...auth, 'content-type': 'image/jpeg' }, body: thumb }, 'bluesky.uploadBlob');
      thumbBlob = up.blob;
    }
    const record = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: now.toISOString(),
      langs: ['fr'],
      facets: blueskyFacets(text, url, cfg.social.hashtags.join(' ')),
      embed: {
        $type: 'app.bsky.embed.external',
        external: { uri: url, title: truncate(article.title, 120), description: truncate(article.chapo ?? '', 280), ...(thumbBlob ? { thumb: thumbBlob } : {}) },
      },
    };
    const out = await call(fetchFn, `${service}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
    }, 'bluesky.createRecord');
    return { id: out.uri };
  },

  async mastodon({ cfg, env, fetchFn, text, article }) {
    const base = cfg.social.networks.mastodon.instance.replace(/\/$/, '');
    const out = await call(fetchFn, `${base}/api/v1/statuses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.MASTODON_TOKEN}`, 'content-type': 'application/json', 'idempotency-key': `qpc-${article.id}` },
      body: JSON.stringify({ status: text, visibility: 'public', language: 'fr' }),
    }, 'mastodon.statuses');
    return { id: out.url ?? out.id };
  },

  async telegram({ cfg, env, fetchFn, text }) {
    const out = await call(fetchFn, `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.social.networks.telegram.chatId, text, disable_web_page_preview: false }),
    }, 'telegram.sendMessage');
    return { id: String(out.result?.message_id ?? '') };
  },
};

const REQUIRED_SECRETS = {
  bluesky: ['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD'],
  mastodon: ['MASTODON_TOKEN'],
  telegram: ['TELEGRAM_BOT_TOKEN'],
};

/** Reseaux reellement utilisables: actives dans la config ET secrets presents. */
export function activeNetworks(cfg, env) {
  return Object.keys(adapters).filter((n) => {
    const c = cfg.social.networks[n];
    if (!c?.enabled) return false;
    if (n === 'mastodon' && !c.instance) return false;
    if (n === 'telegram' && !c.chatId) return false;
    return REQUIRED_SECRETS[n].every((k) => env[k]);
  });
}

// ---------- etat, eligibilite ----------

export function loadSocialState(dataDir) {
  return readJson(path.join(dataDir, 'social.json'), { posted: {}, failures: {} });
}
export function saveSocialState(dataDir, state) {
  writeJson(path.join(dataDir, 'social.json'), state);
}

/** Image de l'article: fichier depose a la main (par reference) ou image du moteur. Retourne les chemins a verifier dans git. */
export function imageInfo(article, manual, paths) {
  const ref = (article.ref ?? '').toUpperCase();
  if (ref && manual[ref]) return { kind: 'manual', file: path.join(paths.siteRoot, 'src', 'assets', 'manual', manual[ref]) };
  if (article.image) return { kind: 'engine', file: path.join(paths.siteRoot, 'public', article.image) };
  return null;
}

function inWindow(now, cfg) {
  const { minutes } = zonedParts(now, cfg.schedule.timezone);
  const w = cfg.social.windowParis;
  return minutes >= hhmmToMinutes(w.from) && minutes <= hhmmToMinutes(w.to);
}

/**
 * Decide quoi publier maintenant: au plus UN article par reseau et par execution.
 * @returns {{network:string, article:object}[]} + raisons des refus dans `skipped`
 */
export function planPosts({ articles, manual, state, cfg, now, networks, paths }) {
  const plan = [];
  const skipped = [];
  const tz = cfg.schedule.timezone;
  const today = zonedParts(now, tz).date;
  if (!inWindow(now, cfg)) return { plan, skipped: [{ reason: 'hors_plage_horaire' }] };
  const maxAge = cfg.social.maxAgeHours * 3600 * 1000;

  for (const network of networks) {
    const mine = Object.entries(state.posted).flatMap(([id, byNet]) => (byNet[network] ? [{ id, at: byNet[network].at }] : []));
    const todayCount = mine.filter((m) => zonedParts(new Date(m.at), tz).date === today).length;
    if (todayCount >= cfg.social.perDayMax) { skipped.push({ network, reason: 'plafond_du_jour' }); continue; }
    const last = mine.reduce((mx, m) => Math.max(mx, Date.parse(m.at)), 0);
    if (last && now.getTime() - last < cfg.social.minGapMinutes * 60000) { skipped.push({ network, reason: 'espacement' }); continue; }

    const candidates = articles
      .filter((a) => now.getTime() - Date.parse(a.publishedAt) <= maxAge)
      .filter((a) => !state.posted[a.id]?.[network])
      .filter((a) => (state.failures[`${a.id}:${network}`] ?? 0) < cfg.social.maxFailuresPerArticle)
      .map((a) => ({ a, img: imageInfo(a, manual, paths) }))
      .filter((x) => !cfg.social.onlyWithImage || x.img)
      .sort((x, y) => String(y.a.publishedAt).localeCompare(String(x.a.publishedAt)));
    if (candidates[0]) plan.push({ network, article: candidates[0].a, img: candidates[0].img });
    else skipped.push({ network, reason: 'aucun_article_eligible' });
  }
  return { plan, skipped };
}

// ---------- verification que le site est en ligne et a jour ----------

export function gitOut(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** Commit le plus recent ayant modifie l'article ou son image (celui que le site en ligne doit contenir). */
export function neededSha(article, img, paths, git = gitOut) {
  const files = [path.join(paths.content, article.file), img?.file].filter(Boolean).map((f) => path.relative(paths.root, f));
  try { return git(['log', '-1', '--format=%H', '--', ...files], paths.root) || null; } catch { return null; }
}

export async function liveCheck({ siteBase, article, needSha, fetchFn, git = gitOut, root }) {
  // 1. Le site en ligne a-t-il ete construit apres le dernier changement de cet article / de son image ?
  let build;
  try { build = await call(fetchFn, `${siteBase}build.json`, {}, 'build.json'); } catch { return { ok: false, reason: 'build.json_indisponible' }; }
  if (!build.sha) return { ok: false, reason: 'build.json_sans_sha' };
  if (needSha && build.sha !== needSha) {
    try { git(['merge-base', '--is-ancestor', needSha, build.sha], root); } catch { return { ok: false, reason: 'site_pas_encore_a_jour' }; }
  }
  // 2. La page et son image de partage repondent.
  const pageUrl = `${siteBase}articles/${article.slug}/`;
  const page = await fetchFn(pageUrl, { signal: AbortSignal.timeout(20000) });
  if (!page.ok) return { ok: false, reason: `page_${page.status}` };
  const og = await fetchFn(`${siteBase}og/${article.slug}.png`, { signal: AbortSignal.timeout(30000) });
  if (!og.ok) return { ok: false, reason: `og_${og.status}` };
  const png = Buffer.from(await og.arrayBuffer());
  const thumb = await sharp(png).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return { ok: true, pageUrl, thumb };
}

// ---------- orchestration ----------

export async function runSocial({ cfg, paths, logger, now = new Date(), env = process.env, fetchFn = fetch, git = gitOut, siteBase, dryRun = false }) {
  const result = { posted: [], skipped: [], failed: [] };
  if (!cfg.social.enabled) { logger.info('social.disabled'); return result; }
  const networks = activeNetworks(cfg, env);
  if (!networks.length) { logger.info('social.no_active_network'); return result; }
  if (!siteBase) throw new Error('siteBase manquant (SITE_URL / SITE_BASE)');
  const base = siteBase.endsWith('/') ? siteBase : `${siteBase}/`;

  const articles = loadExisting(paths.content, { now });
  const manual = listManualImages(path.join(paths.siteRoot, 'src', 'assets', 'manual'));
  const state = loadSocialState(paths.data);
  const { plan, skipped } = planPosts({ articles, manual, state, cfg, now, networks, paths });
  result.skipped = skipped;
  for (const s of skipped) logger.info('social.skipped', s);

  for (const { network, article, img } of plan) {
    const key = `${article.id}:${network}`;
    try {
      const need = neededSha(article, img, paths, git);
      const live = await liveCheck({ siteBase: base, article, needSha: need, fetchFn, git, root: paths.root });
      if (!live.ok) { logger.warn('social.not_ready', { network, ref: article.ref, reason: live.reason }); result.skipped.push({ network, reason: live.reason }); continue; }
      const { text } = composePost({ article, url: live.pageUrl, cfg, maxGraphemes: network === 'bluesky' ? 300 : 480 });
      if (dryRun) { logger.info('social.dry_run', { network, ref: article.ref, text }); result.posted.push({ network, ref: article.ref, dryRun: true, text }); continue; }
      const out = await adapters[network]({ cfg, env, fetchFn, text, url: live.pageUrl, article, thumb: live.thumb, now });
      state.posted[article.id] = { ...(state.posted[article.id] ?? {}), [network]: { at: now.toISOString(), id: out.id, ref: article.ref } };
      saveSocialState(paths.data, state); // enregistre apres chaque envoi: jamais de doublon en cas d'interruption
      logger.info('social.posted', { network, ref: article.ref, id: out.id });
      result.posted.push({ network, ref: article.ref, id: out.id });
    } catch (err) {
      state.failures[key] = (state.failures[key] ?? 0) + 1;
      saveSocialState(paths.data, state);
      logger.warn('social.failed', { network, ref: article.ref, attempts: state.failures[key], error: String(err.message).slice(0, 200) });
      result.failed.push({ network, ref: article.ref, error: err.message });
    }
  }
  return result;
}

export { IMAGE_EXTENSIONS };
