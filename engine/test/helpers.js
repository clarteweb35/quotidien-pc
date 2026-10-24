import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, makePaths } from '../src/config.js';
import { Store } from '../src/store.js';
import { createLogger } from '../src/logger.js';
import { GeminiClient } from '../src/gemini.js';
import { createFakeSdk, fakeFetcher, fakeArticleFor } from '../src/mock.js';

export { fakeArticleFor };

export function makeCtx({ at = '2026-10-24T09:05:00Z', script, mutateCfg, fetcher } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lgn-test-'));
  const paths = { ...makePaths(), data: path.join(tmp, 'data'), content: path.join(tmp, 'articles') };
  const cfg = loadConfig(paths, {});
  cfg.engine.gemini.minDelayBetweenCallsMs = 0;
  cfg.engine.gemini.retryBaseDelayMs = 1;
  mutateCfg?.(cfg);
  let t = Date.parse(at);
  const now = () => new Date(t);
  const store = new Store(paths);
  const logger = createLogger({ dataDir: paths.data, runId: 'test', now, quiet: true });
  const sdk = createFakeSdk({ categories: cfg.categories.map((c) => c.slug), script });
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
