#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig, checkConfig, makePaths } from './config.js';
import { Store } from './store.js';
import { createLogger } from './logger.js';
import { GeminiClient } from './gemini.js';
import { runCycle, writeDailyReport, buildReport } from './pipeline.js';
import { createFakeSdk, fakeFetcher } from './mock.js';
import { zonedParts, hhmmToMinutes } from './util.js';
import { listManualImages, renderManualImageList } from './refs.js';
import { runSocial, activeNetworks } from './social.js';
import { genererAnnonces, TYPES as TYPES_ANNONCES, MAX_PAR_LOT } from './annonces.js';
import { loadExisting, publishArticle } from './publisher.js';
import { validateArticle } from './validator.js';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function buildContext({ mock = false, dryRun = false, now = () => new Date(), paths = makePaths(), quietLogs = false } = {}) {
  const cfg = loadConfig(paths);
  const problems = checkConfig(cfg);
  if (problems.length) throw new Error('Configuration invalide:\n - ' + problems.join('\n - '));
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(2).toString('hex')}`;
  const store = new Store(paths, { persist: !dryRun, persistUsage: true });
  const logger = createLogger({ dataDir: paths.data, runId, now, quiet: quietLogs });
  const sdk = mock ? createFakeSdk({ categories: cfg.categories.map((c) => c.slug) }) : undefined;
  const client = new GeminiClient({ cfg, store, logger, runId, now, sdk });
  return { cfg, paths, store, logger, client, now, runId, dryRun, fetcher: mock ? fakeFetcher(now().toISOString()) : undefined, rng: Math.random };
}

function printReport(r) {
  console.log(`\n=== Bilan ${r.date} : ${r.publishedCount}/${r.target} articles publiés ===`);
  for (const s of r.slots) console.log(`  ${String(s.hhmm).padEnd(7)} ${String(s.status).padEnd(12)} tentatives=${s.attempts ?? 0}${s.lastError ? '  (' + s.lastError + ')' : ''}`);
  console.log(`  Rejets du jour: ${r.rejections} | En quarantaine: ${r.quarantined}`);
  console.log(`  API: ${r.api.calls} appels, ${r.api.inputTokens} jetons entrée, ${r.api.outputTokens} sortie, ${r.api.costUsd} USD (plafond jour ${r.api.dailyCapUsd}) | mois ${r.api.monthCostUsd}/${r.api.monthlyCapUsd} USD`);
}

async function main() {
  switch (cmd) {
    case 'run': {
      const mock = flag('mock');
      if (!mock && !process.env.GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY absente. Utilisez --mock pour tester sans API.');
        process.exit(2);
      }
      const ctx = buildContext({ mock, dryRun: flag('dry-run') });
      ctx.extra = flag('extra');
      ctx.count = Number(opt('count') ?? 1);
      ctx.spacingMs = Math.min(Math.max(Number(opt('spacing') ?? 0), 0), 10) * 60000; // minutes entre deux articles (0 a 10)
      ctx.forceCatchup = flag('force-catchup');
      const release = ctx.store.acquireLock();
      try {
        const result = await runCycle(ctx);
        const report = writeDailyReport(ctx);
        ctx.store.save();
        printReport(report);
        console.log(`\nCycle: ${result.published.length} publié(s), ${result.failed.length} échec(s)${result.stopped ? ', arrêt: ' + result.stopped : ''}`);
        if (result.stopped === 'gemini_fatal') process.exitCode = 1;
      } finally {
        release();
      }
      break;
    }

    case 'simulate': {
      // Journee complete simulee: faux Gemini, faux flux, repertoires temporaires. Aucune publication reelle.
      const date = opt('date') ?? new Date().toISOString().slice(0, 10);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lgn-sim-'));
      const paths = { ...makePaths(), data: path.join(tmp, 'data'), content: path.join(tmp, 'articles'), siteRoot: path.join(tmp, 'site') };
      let t = Date.parse(`${date}T00:00:00Z`) - 2 * 3600e3;
      const now = () => new Date(t);
      const ctx = buildContext({ mock: true, now, paths, quietLogs: !flag('verbose') });
      ctx.rng = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
      let runs = 0;
      for (let i = 0; i < 52; i++, t += 30 * 60e3) {
        ctx.runId = `sim-${i}`;
        await runCycle(ctx);
        runs++;
      }
      const day = zonedParts(new Date(Date.parse(`${date}T12:00:00Z`)), ctx.cfg.schedule.timezone).date;
      printReport(buildReport({ store: ctx.store, cfg: ctx.cfg, date: day, existing: loadExisting(paths.content, { now: now() }) }));
      console.log(`\n${runs} exécutions simulées. Fichiers: ${tmp}`);
      if (!flag('keep')) fs.rmSync(tmp, { recursive: true, force: true });
      break;
    }

    case 'report': {
      const paths = makePaths();
      const cfg = loadConfig(paths);
      const store = new Store(paths, { persist: false });
      const date = args[1] && /^\d{4}-\d{2}-\d{2}$/.test(args[1]) ? args[1] : zonedParts(new Date(), cfg.schedule.timezone).date;
      printReport(buildReport({ store, cfg, date, existing: loadExisting(paths.content) }));
      break;
    }

    case 'refs': {
      // Liste les references d'articles et indique lesquels attendent une image deposee a la main.
      const paths = makePaths();
      const cfg = loadConfig(paths);
      const manual = listManualImages(path.join(paths.siteRoot, 'src', 'assets', 'manual'));
      process.stdout.write(renderManualImageList({ articles: loadExisting(paths.content), manual, cfg }));
      break;
    }

    case 'social': {
      // Partage des articles illustres sur les reseaux actifs. --dry-run: affiche les publications sans rien envoyer.
      const paths = makePaths();
      const cfg = loadConfig(paths);
      const runId = `social-${Date.now()}`;
      const logger = createLogger({ dataDir: paths.data, runId, filePrefix: 'social-' });
      const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
      const siteBaseP = process.env.SITE_BASE || '/';
      if (!siteUrl) throw new Error('SITE_URL absente (adresse publique du site)');
      logger.info('social.start', { networks: activeNetworks(cfg, process.env), dryRun: flag('dry-run') });
      const r = await runSocial({ cfg, paths, logger, siteBase: `${siteUrl}${siteBaseP}`, dryRun: flag('dry-run') });
      console.log(`\nPartage: ${r.posted.length} publié(s), ${r.skipped.length} ignoré(s), ${r.failed.length} échec(s)`);
      break;
    }

    case 'annonces': {
      // Generation a la demande: node engine/src/cli.js annonces --type petites|rencontres [--count 8] [--dry-run] [--mock]
      const type = opt('type');
      if (!TYPES_ANNONCES[type]) { console.error('Usage: annonces --type petites|rencontres [--count N] [--dry-run] [--mock]'); process.exit(2); }
      const mock = flag('mock');
      if (!mock && !process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY absente. Utilisez --mock pour tester sans API.'); process.exit(2); }
      const ctx = buildContext({ mock, dryRun: flag('dry-run') });
      const release = ctx.store.acquireLock();
      try {
        const count = Math.min(Math.max(Number(opt('count') ?? 8), 1), MAX_PAR_LOT);
        const { ajoutees, refusees } = await genererAnnonces({ ctx, type, count });
        ctx.store.saveUsage();
        console.log(`${ajoutees.length} annonce(s) ${flag('dry-run') ? 'générée(s) à blanc' : 'ajoutée(s)'} (${TYPES_ANNONCES[type].etiquette}), ${refusees.length} refusée(s).`);
        for (const a of ajoutees) console.log(`  + ${a.ref ?? a.id} ${a.titre ?? a.profil}`);
        for (const r of refusees) console.log(`  - ${r.titre ?? '(réponse inexploitable)'}: ${r.motifs.join(', ')}`);
      } finally {
        release();
      }
      break;
    }

    case 'check-config': {
      const problems = checkConfig(loadConfig());
      if (problems.length) {
        console.error('Problèmes:\n - ' + problems.join('\n - '));
        process.exit(1);
      }
      console.log('Configuration valide.');
      break;
    }

    case 'alerts': {
      // Sortie 0 = RAS ; 3 = alerte (le workflow ouvre un ticket). Texte ecrit dans --out.
      const paths = makePaths();
      const cfg = loadConfig(paths);
      const store = new Store(paths, { persist: false });
      const now = new Date();
      const { date, minutes } = zonedParts(now, cfg.schedule.timezone);
      const msgs = [];
      const last = store.state.lastRun;
      if (last?.stopped && last.stopped !== 'paused') msgs.push(`Dernier cycle interrompu : **${last.stopped}** (${last.at}).`);
      const late = cfg.schedule.slots.filter((h, i) => {
        const s = store.slot(date, i);
        return s?.status !== 'published' && minutes - hhmmToMinutes(h) > cfg.schedule.catchupMinutes + 60;
      });
      if (late.length && !cfg.control.paused) msgs.push(`Créneaux du ${date} non publiés après rattrapage : ${late.join(', ')}.`);
      const spent = store.spentOnDate(date);
      if (spent > cfg.engine.budget.dailyUsd * 0.8) msgs.push(`Budget du jour consommé à ${Math.round((spent / cfg.engine.budget.dailyUsd) * 100)} %.`);
      const q = store.quarantine.items.filter((i) => i.status === 'quarantined').length;
      if (q >= 10) msgs.push(`${q} articles en quarantaine : une revue est nécessaire.`);
      if (msgs.length) {
        const text = msgs.map((m) => `- ${m}`).join('\n');
        if (opt('out')) fs.writeFileSync(opt('out'), text + '\n');
        console.log(text);
        process.exit(3);
      }
      console.log('Aucune alerte.');
      break;
    }

    case 'quarantine': {
      const sub = args[1];
      const paths = makePaths();
      const store = new Store(paths);
      if (sub === 'list' || !sub) {
        for (const i of store.quarantine.items) console.log(`${i.id}  ${i.status.padEnd(12)} ${i.createdAt.slice(0, 16)}  ${i.article.title}\n    raisons: ${i.issues.map((x) => x.code).join(', ')}`);
        break;
      }
      const item = store.findQuarantine(args[2]);
      if (!item) throw new Error(`Article introuvable en quarantaine: ${args[2]}`);
      if (sub === 'drop') {
        item.status = 'dropped';
        store.save();
        console.log('Article écarté.');
      } else if (sub === 'release') {
        // Validation humaine: on rejoue les controles deterministes, puis publication dans la limite du plafond quotidien.
        const ctx = buildContext({ mock: true });
        const existing = loadExisting(paths.content);
        const det = validateArticle({ article: item.article, topic: item.topic, cfg: ctx.cfg, existing });
        const hard = det.issues.filter((i) => !i.code.startsWith('titre_trop') && !i.code.startsWith('corps_trop_proche') && i.code !== 'citation_personne_reelle');
        if (hard.length) throw new Error('Controles bloquants: ' + hard.map((i) => i.code).join(', '));
        const now = new Date();
        const { date } = zonedParts(now, ctx.cfg.schedule.timezone);
        if (store.publishedCount(date) >= ctx.cfg.schedule.maxPerDay) throw new Error('Plafond quotidien atteint');
        const pub = publishArticle({ article: item.article, topic: item.topic, id: item.id, slotLabel: `${date}#x-rel-${item.id}`, model: 'quarantine-release', now, contentDir: paths.content, existing });
        store.setSlot(date, `x-rel-${item.id}`, { status: 'published', articleId: item.id, publishedAt: pub.publishedAt });
        item.status = 'released';
        store.save();
        console.log(`Publié: ${pub.urlPath}`);
      } else throw new Error('Usage: quarantine list | release <id> | drop <id>');
      break;
    }

    default:
      console.log(`Usage: node engine/src/cli.js <commande>
  run [--dry-run] [--extra [--count N] [--spacing MIN]] [--force-catchup] [--mock]   Exécute un cycle (créneaux dus ; --extra --count 8 --spacing 3 = 8 articles espacés de 3 min)
  simulate [--date AAAA-MM-JJ] [--keep] [--verbose]       Journée complète simulée (faux Gemini, aucun effet réel)
  report [AAAA-MM-JJ]                                     Bilan quotidien
  check-config                                            Valide la configuration
  refs                                                    Références des articles et images à déposer à la main
  social [--dry-run]                                      Partage les articles illustrés sur les réseaux actifs
  alerts [--out fichier]                                  Code 3 si une alerte est active
  quarantine list | release <id> | drop <id>              Gestion de la quarantaine`);
  }
}

main().catch((err) => {
  console.error(`Erreur: ${err.message}`);
  process.exit(1);
});
