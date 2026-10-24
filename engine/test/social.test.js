import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makeCtx, cleanup } from './helpers.js';
import { runCycle } from '../src/pipeline.js';
import { runSocial, composePost, blueskyFacets, graphemeCount, activeNetworks, loadSocialState } from '../src/social.js';

const BASE = 'https://site.test/qpc/';
const ENV = { BLUESKY_IDENTIFIER: 'qpc.bsky.social', BLUESKY_APP_PASSWORD: 'xxxx-xxxx-xxxx-xxxx' };
const logger = { info() {}, warn() {}, error() {} };

async function pngBuf() {
  return sharp({ create: { width: 1200, height: 630, channels: 3, background: '#faf7f2' } }).png().toBuffer();
}

/** Faux Internet: site en ligne + API Bluesky. `bsky.calls` garde tout ce qui est envoye. */
async function fakeWorld({ buildSha = 'abc', pageStatus = 200, recordStatus = 200 } = {}) {
  const png = await pngBuf();
  const bsky = { calls: [] };
  const fetchFn = async (url, init = {}) => {
    const u = String(url);
    const reply = (status, body, binary) => ({
      ok: status < 400,
      status,
      text: async () => (binary ? '' : JSON.stringify(body ?? {})),
      arrayBuffer: async () => binary ?? Buffer.alloc(0),
    });
    if (u === `${BASE}build.json`) return reply(200, { sha: buildSha });
    if (u.startsWith(`${BASE}articles/`)) return reply(pageStatus, {});
    if (u.startsWith(`${BASE}og/`)) return reply(200, {}, png);
    if (u.includes('bsky.social')) {
      bsky.calls.push({ url: u, init });
      if (u.endsWith('createSession')) return reply(200, { accessJwt: 'jwt', did: 'did:plc:test' });
      if (u.endsWith('uploadBlob')) return reply(200, { blob: { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/jpeg', size: 1000 } });
      if (u.endsWith('createRecord')) {
        return recordStatus === 200 ? reply(200, { uri: `at://did:plc:test/app.bsky.feed.post/${bsky.calls.length}` }) : reply(recordStatus, { error: 'boom' });
      }
    }
    throw new Error(`URL inattendue: ${u}`);
  };
  return { fetchFn, bsky };
}

async function setup({ images = ['261024-X2'], count = 3, mutateSocial } = {}) {
  const ctx = makeCtx({ at: '2026-10-24T09:05:00Z' });
  ctx.extra = true;
  ctx.count = count;
  await runCycle(ctx);
  const dir = path.join(ctx.paths.siteRoot, 'src', 'assets', 'manual');
  fs.mkdirSync(dir, { recursive: true });
  for (const r of images) fs.writeFileSync(path.join(dir, `${r}.jpg`), 'x');
  if (mutateSocial) mutateSocial(ctx.cfg.social);
  const run = async (when, opts = {}) => {
    const world = opts.world ?? (await fakeWorld(opts.worldOpts));
    const res = await runSocial({
      cfg: ctx.cfg, paths: ctx.paths, logger, now: new Date(when), env: ENV, fetchFn: world.fetchFn,
      git: opts.git ?? (() => 'abc'), siteBase: BASE, dryRun: opts.dryRun,
    });
    return { res, world };
  };
  return { ctx, run };
}

const record = (world) => JSON.parse(world.bsky.calls.find((c) => c.url.endsWith('createRecord')).init.body).record;

test("publie sur Bluesky seulement l'article illustre: carte de lien, vignette, mention satirique, une seule fois", async () => {
  const { ctx, run } = await setup();
  const { res, world } = await run('2026-10-24T11:00:00Z');
  assert.equal(res.posted.length, 1);
  assert.equal(res.posted[0].ref, '261024-X2');
  const rec = record(world);
  assert.ok(rec.text.includes('Article satirique') && rec.text.includes('#satire') && rec.text.includes(`${BASE}articles/`));
  assert.equal(rec.embed.external.uri, rec.facets.find((f) => f.features[0].$type.endsWith('#link')).features[0].uri);
  assert.ok(rec.embed.external.thumb, 'vignette envoyee');
  assert.deepEqual(rec.langs, ['fr']);
  const state = loadSocialState(ctx.paths.data);
  assert.equal(Object.values(state.posted)[0].bluesky.ref, '261024-X2');
  // relance (5 minutes puis 3 heures plus tard): aucun doublon
  assert.equal((await run('2026-10-24T11:05:00Z')).res.posted.length, 0);
  assert.equal((await run('2026-10-24T14:00:00Z')).res.posted.length, 0);
  cleanup(ctx);
});

test("sans image: rien n'est publie", async () => {
  const { ctx, run } = await setup({ images: [] });
  const { res, world } = await run('2026-10-24T11:00:00Z');
  assert.equal(res.posted.length, 0);
  assert.equal(world.bsky.calls.length, 0);
  cleanup(ctx);
});

test('espacement, plafond quotidien et un seul article par execution', async () => {
  const { ctx, run } = await setup({
    images: ['261024-X1', '261024-X2', '261024-X3'],
    mutateSocial: (s) => { s.perDayMax = 2; s.minGapMinutes = 60; },
  });
  assert.equal((await run('2026-10-24T11:00:00Z')).res.posted.length, 1);
  const tooSoon = await run('2026-10-24T11:30:00Z');
  assert.equal(tooSoon.res.posted.length, 0);
  assert.ok(tooSoon.res.skipped.some((s) => s.reason === 'espacement'));
  assert.equal((await run('2026-10-24T12:30:00Z')).res.posted.length, 1);
  const capped = await run('2026-10-24T14:00:00Z');
  assert.equal(capped.res.posted.length, 0);
  assert.ok(capped.res.skipped.some((s) => s.reason === 'plafond_du_jour'));
  cleanup(ctx);
});

test("le site en ligne n'est pas a jour (commit manquant) ou la page est absente: on attend", async () => {
  const { ctx, run } = await setup();
  const behind = await run('2026-10-24T11:00:00Z', {
    git: (args) => { if (args[0] === 'merge-base') throw new Error('not ancestor'); return 'newsha'; },
    worldOpts: { buildSha: 'old' },
  });
  assert.equal(behind.res.posted.length, 0);
  assert.ok(behind.res.skipped.some((s) => s.reason === 'site_pas_encore_a_jour'));
  const down = await run('2026-10-24T11:00:00Z', { worldOpts: { pageStatus: 404 } });
  assert.equal(down.res.posted.length, 0);
  assert.ok(down.res.skipped.some((s) => s.reason === 'page_404'));
  cleanup(ctx);
});

test('hors plage horaire (nuit a Paris): rien', async () => {
  const { ctx, run } = await setup();
  const { res, world } = await run('2026-10-24T22:30:00Z'); // 00:30 a Paris
  assert.equal(res.posted.length, 0);
  assert.equal(world.bsky.calls.length, 0);
  cleanup(ctx);
});

test('echec Bluesky: compte, retente, puis abandonne apres 3 echecs; aucune erreur ne remonte', async () => {
  const { ctx, run } = await setup();
  for (const t of ['11:00', '12:40', '14:20']) {
    const { res } = await run(`2026-10-24T${t}:00Z`, { worldOpts: { recordStatus: 500 } });
    assert.equal(res.failed.length, 1);
  }
  const after = await run('2026-10-24T16:00:00Z');
  assert.equal(after.res.failed.length + after.res.posted.length, 0);
  assert.equal(Object.values(loadSocialState(ctx.paths.data).failures)[0], 3);
  cleanup(ctx);
});

test('essai a blanc: aucun appel au reseau, aucun etat enregistre', async () => {
  const { ctx, run } = await setup();
  const { res, world } = await run('2026-10-24T11:00:00Z', { dryRun: true });
  assert.equal(res.posted.length, 1);
  assert.equal(res.posted[0].dryRun, true);
  assert.equal(world.bsky.calls.length, 0);
  assert.deepEqual(loadSocialState(ctx.paths.data).posted, {});
  cleanup(ctx);
});

test('reseaux actifs: configuration ET secrets requis', () => {
  const cfg = makeCtx().cfg;
  assert.deepEqual(activeNetworks(cfg, {}), []);
  assert.deepEqual(activeNetworks(cfg, ENV), ['bluesky']);
  cfg.social.networks.telegram = { enabled: true, chatId: '@qpc' };
  assert.deepEqual(activeNetworks(cfg, { ...ENV, TELEGRAM_BOT_TOKEN: 't' }), ['bluesky', 'telegram']);
  cfg.social.networks.mastodon = { enabled: true, instance: '' };
  assert.ok(!activeNetworks(cfg, { ...ENV, MASTODON_TOKEN: 't' }).includes('mastodon'));
});

test('texte: 300 graphemes maximum, mention satirique, facettes en octets UTF-8 (accents, emojis)', () => {
  const cfg = makeCtx().cfg;
  const url = 'https://site.test/qpc/articles/un-slug-tres-long-pour-voir/';
  const long = { title: 'Élections « en ligne » : un protocole officiel exigera une dissertation en trois parties avant chaque tweet politique, sans exception ni dérogation 🎭 '.repeat(3) };
  const { text } = composePost({ article: long, url, cfg });
  assert.ok(graphemeCount(text) <= 300, String(graphemeCount(text)));
  assert.ok(text.includes('Article satirique') && text.endsWith(url) && text.includes('…'));
  const facets = blueskyFacets(text, url, '#satire');
  const bytes = new TextEncoder().encode(text);
  const link = facets.find((f) => f.features[0].$type.endsWith('#link'));
  assert.equal(new TextDecoder().decode(bytes.slice(link.index.byteStart, link.index.byteEnd)), url);
  const tag = facets.find((f) => f.features[0].$type.endsWith('#tag'));
  assert.equal(new TextDecoder().decode(bytes.slice(tag.index.byteStart, tag.index.byteEnd)), '#satire');
});
