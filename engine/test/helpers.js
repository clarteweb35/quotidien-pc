import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, makePaths } from '../src/config.js';
import { Store } from '../src/store.js';
import { createLogger } from '../src/logger.js';
import { GeminiClient } from '../src/gemini.js';
import { createFakeSdk, fakeFetcher, fakeArticleFor } from '../src/mock.js';

export { fakeArticleFor };

export function makeCtx({ at = '2026-10-24T09:05:00Z', script, imageScript, mutateCfg, fetcher } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lgn-test-'));
  const paths = { ...makePaths(), data: path.join(tmp, 'data'), content: path.join(tmp, 'articles'), siteRoot: path.join(tmp, 'site') };
  const cfg = loadConfig(paths, {});
  cfg.engine.gemini.minDelayBetweenCallsMs = 0;
  cfg.engine.gemini.retryBaseDelayMs = 1;
  cfg.engine.topics.rotateCategories = false; // les tests historiques supposent la categorie du flux; la rotation a ses propres tests
  cfg.schedule.slots = ['07:00', '09:00', '11:00', '13:00', '15:00', '17:30', '19:30', '21:30']; // planning de test fige (8 creneaux), independant de config/schedule.json
  delete cfg.schedule.editoSlot; // l'edito du matin a son propre test
  cfg.schedule.maxPerDay = 8;
  cfg.engine.images.slotIndexes = [1, 5];
  cfg.engine.images.enabled = true; // la config livree les desactive (payantes): les tests les activent explicitement
  mutateCfg?.(cfg);
  let t = Date.parse(at);
  const now = () => new Date(t);
  const store = new Store(paths);
  const logger = createLogger({ dataDir: paths.data, runId: 'test', now, quiet: true });
  const sdk = createFakeSdk({ categories: cfg.categories.map((c) => c.slug), script, imageScript });
  const client = new GeminiClient({ cfg, store, logger, runId: 'test', now, sdk });
  client.sleep = async () => {};
  const ctx = {
    cfg, paths, store, logger, client, now, runId: 'test', sdk, tmp,
    fetcher: fetcher ?? fakeFetcher(at),
    rng: () => 0.3,
    advance: (min) => { t += min * 60000; },
    setTime: (iso) => { t = Date.parse(iso); },
    articles: () => (fs.existsSync(paths.content) ? fs.readdirSync(paths.content).filter((f) => f.endsWith('.md')) : []),
  };
  return ctx;
}

export function cleanup(ctx) {
  fs.rmSync(ctx.tmp, { recursive: true, force: true });
}
