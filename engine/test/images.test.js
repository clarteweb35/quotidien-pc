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
