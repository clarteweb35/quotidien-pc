import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeCtx, cleanup, fakeArticleFor } from './helpers.js';
import { runCycle } from '../src/pipeline.js';
import { checkImagePrompt } from '../src/images.js';
import { parseArticleFile } from '../src/publisher.js';

// 09:05Z = 11:05 Paris: creneaux 1 (09:00, illustre) et 2 (11:00, non illustre) dus.
const imgDir = (ctx) => path.join(ctx.paths.siteRoot, 'public', 'images', 'articles');
const articlesWithImage = (ctx) => ctx.articles().map((f) => parseArticleFile(fs.readFileSync(path.join(ctx.paths.content, f), 'utf8')).fm).filter((fm) => fm.image);

test('image generee, convertie en WebP, referencee par l\'article, et facturee', async () => {
  const ctx = makeCtx();
  await runCycle(ctx);
  const withImg = articlesWithImage(ctx);
  assert.equal(withImg.length, 1);
  assert.equal(withImg[0].slot, '2026-10-24#1');
  assert.ok(withImg[0].imageAlt.length >= 10);
  assert.equal(withImg[0].imageCredit, 'Illustration générée par IA');
  const files = fs.readdirSync(imgDir(ctx));
  assert.equal(files.length, 1);
  assert.equal(files[0], `${withImg[0].slug}.webp`);
  const entry = ctx.store.usage.entries.find((e) => e.purpose === 'image');
  assert.equal(entry.costUsd, ctx.cfg.engine.images.priceUsdPerImage);
  assert.ok(ctx.store.usage.entries.some((e) => e.purpose === 'image_judge'));
  cleanup(ctx);
});

test('echec de l\'API d\'image: l\'article est publie quand meme, sans image', async () => {
  const ctx = makeCtx({ imageScript: () => { const e = new Error('boom'); e.status = 500; throw e; } });
  const r = await runCycle(ctx);
  assert.equal(r.published.length, 2);
  assert.equal(articlesWithImage(ctx).length, 0);
  assert.ok(!fs.existsSync(imgDir(ctx)) || fs.readdirSync(imgDir(ctx)).length === 0);
  cleanup(ctx);
});

test('reponse d\'image vide: article publie sans image', async () => {
  const ctx = makeCtx({ imageScript: () => 'empty' });
  const r = await runCycle(ctx);
  assert.equal(r.published.length, 2);
  assert.equal(articlesWithImage(ctx).length, 0);
  cleanup(ctx);
});

test('le relecteur d\'image refuse (personne reelle, texte, fausse photo): image ecartee, article publie', async () => {
  for (const flag of ['real_person_likeness', 'text_or_logo', 'photorealistic_news_look', 'disturbing']) {
    const ctx = makeCtx({ script: ({ kind }) => (kind === 'image_judge' ? { ok: true, real_person_likeness: false, text_or_logo: false, photorealistic_news_look: false, disturbing: false, problems: [], [flag]: true } : undefined) });
    const r = await runCycle(ctx);
    assert.equal(r.published.length, 2, flag);
    assert.equal(articlesWithImage(ctx).length, 0, flag);
    cleanup(ctx);
  }
});

test('consigne d\'image mentionnant une personne de la source, une photo ou un lien: aucun appel d\'image', async () => {
  const cfg = makeCtx().cfg;
  const topic = { kind: 'news', title: 'Marie Curie annonce un plan', summary: '', url: 'https://x.test' };
  const ok = { image_prompt: 'Une pile de dossiers penchée près d\'une plante verte, vue de dos', image_alt: 'Dessin de dossiers' };
  assert.equal(checkImagePrompt(ok, topic, { ...cfg, images: cfg.engine.images }), null);
  assert.equal(checkImagePrompt({ ...ok, image_prompt: 'Marie Curie devant une pile de dossiers penchée en plein jour' }, topic, { ...cfg, images: cfg.engine.images }), 'consigne_image_personne_reelle');
  assert.equal(checkImagePrompt({ ...ok, image_prompt: 'Une photo réaliste d\'une pile de dossiers penchée sur un bureau' }, topic, { ...cfg, images: cfg.engine.images }), 'consigne_image_photoreel');
  assert.equal(checkImagePrompt({ ...ok, image_prompt: 'Voir https://x.test pour une pile de dossiers penchée sur un bureau' }, topic, { ...cfg, images: cfg.engine.images }), 'consigne_image_markup');
  assert.equal(checkImagePrompt({ ...ok, image_prompt: 'trop court' }, topic, { ...cfg, images: cfg.engine.images }), 'consigne_image_longueur');
});

test('consigne d\'image invalide dans la reponse du redacteur: pas d\'appel image, article publie', async () => {
  const ctx = makeCtx({ script: ({ kind, prompt }) => {
    if (kind !== 'generate') return undefined;
    const a = fakeArticleFor(prompt, ctx.cfg.categories.map((c) => c.slug));
    a.image_prompt = 'Une photo réaliste de la réunion, en haute définition';
    return a;
  } });
  const r = await runCycle(ctx);
  assert.equal(r.published.length, 2);
  assert.equal(ctx.sdk.counters.image, 0);
  cleanup(ctx);
});

test('budget insuffisant pour l\'image: texte publie, aucun appel image', async () => {
  const ctx = makeCtx({ mutateCfg: (c) => { c.engine.budget.dailyUsd = 0.045; } });
  await runCycle(ctx);
  assert.equal(ctx.sdk.counters.image, 0);
  assert.ok(ctx.articles().length >= 1);
  assert.ok(ctx.store.spentOnDate('2026-10-24') <= 0.045);
  cleanup(ctx);
});

test('plafond d\'images par jour respecte', async () => {
  const ctx = makeCtx({ at: '2026-10-24T09:05:00Z', mutateCfg: (c) => { c.engine.images.slotIndexes = [0, 1, 2]; c.engine.images.perDayMax = 1; c.schedule.catchupMinutes = 400; c.schedule.maxPublicationsPerRun = 5; } });
  await runCycle(ctx);
  assert.equal(ctx.articles().length, 3);
  assert.equal(articlesWithImage(ctx).length, 1);
  cleanup(ctx);
});

test('images desactivees: aucun appel image', async () => {
  const ctx = makeCtx({ mutateCfg: (c) => { c.engine.images.enabled = false; } });
  await runCycle(ctx);
  assert.equal(ctx.sdk.counters.image, 0);
  assert.equal(articlesWithImage(ctx).length, 0);
  cleanup(ctx);
});

test('la configuration livree active les images seulement sur une voie gratuite (Cloudflare, 0 USD): aucune depense par defaut', async () => {
  const { loadConfig } = await import('../src/config.js');
  const im = loadConfig().engine.images;
  if (im.enabled) assert.ok(im.api === 'cloudflare' && im.priceUsdPerImage === 0, 'images payantes: ne pas les activer par defaut');
});

test('Cloudflare Workers AI: image decodee (JSON base64), erreurs HTTP portees par .status, secrets requis', async () => {
  const { cloudflareImageBase64 } = await import('../src/cloudflare.js');
  const env = { CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_API_TOKEN: 'tok' };
  let vu;
  const ok = async (url, init) => { vu = { url, init }; return { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ result: { image: 'QUJD' }, success: true }) }; };
  assert.equal(await cloudflareImageBase64({ prompt: 'p', model: '@cf/black-forest-labs/flux-1-schnell', steps: 4, env, fetchFn: ok }), 'QUJD');
  assert.ok(vu.url.endsWith('/accounts/acc/ai/run/@cf/black-forest-labs/flux-1-schnell'));
  assert.equal(vu.init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(vu.init.body), { prompt: 'p', steps: 4 });
  const raw = async () => ({ ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => Buffer.from('ABC') });
  assert.equal(await cloudflareImageBase64({ prompt: 'p', model: 'm', env, fetchFn: raw }), 'QUJD');
  const ko = async () => ({ ok: false, status: 429, text: async () => 'limite' });
  await assert.rejects(cloudflareImageBase64({ prompt: 'p', model: 'm', env, fetchFn: ko }), (e) => e.status === 429);
  await assert.rejects(cloudflareImageBase64({ prompt: 'p', model: 'm', env: {}, fetchFn: ok }), (e) => e.status === 401);
});

test('illustrer un article deja publie: image ajoutee a partir de sa consigne enregistree, sans second passage', async () => {
  const { illustrerExistant } = await import('../src/images.js');
  const { loadExisting } = await import('../src/publisher.js');
  // Le creneau 0 n'est pas illustre (slotIndexes [1, 5]): l'article n'a qu'une consigne d'image.
  const ctx = makeCtx({ at: '2026-10-24T05:05:00Z' });
  await runCycle(ctx);
  const dir = ctx.paths.content;
  let existing = loadExisting(dir, { maxAgeDays: 3650, now: ctx.now() });
  const cible = existing.find((e) => !e.image && e.imagePrompt);
  assert.ok(cible, 'un article sans image avec une consigne');
  const imageDir = path.join(ctx.paths.siteRoot, 'public', 'images', 'articles');
  const r = await illustrerExistant({ ctx, slug: cible.slug, existing, contentDir: dir, imageDir });
  assert.equal(r.ok, true, JSON.stringify(r));
  const fm = parseArticleFile(fs.readFileSync(path.join(dir, cible.file), 'utf8')).fm;
  assert.ok(fm.image && fm.imageCredit && fs.existsSync(path.join(ctx.paths.siteRoot, 'public', fm.image)), 'article relie a son image');
  existing = loadExisting(dir, { maxAgeDays: 3650, now: ctx.now() });
  assert.equal((await illustrerExistant({ ctx, slug: cible.slug, existing, contentDir: dir, imageDir })).reason, 'deja_illustre');
  cleanup(ctx);
});
