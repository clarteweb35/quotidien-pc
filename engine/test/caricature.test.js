import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeCtx, cleanup } from './helpers.js';
import { runCaricature } from '../src/caricature.js';

// 10:40Z = 11:40 Paris (heure d'hiver du 25/10 au 28/03): le dessin du jour est du.
const AU_MOMENT = '2026-10-27T10:45:00Z';
const jsonDu = (ctx) => path.join(ctx.paths.siteRoot, 'src', 'data', 'caricatures.json');

test('dessin du jour: publie une fois par jour (image + entree), pas avant l\'heure', async () => {
  const tot = makeCtx({ at: '2026-10-27T08:00:00Z' });
  assert.equal(await runCaricature(tot), null, 'avant 11 h 40: rien');
  cleanup(tot);

  const ctx = makeCtx({ at: AU_MOMENT });
  const r = await runCaricature(ctx);
  assert.equal(r?.published, true, JSON.stringify(r));
  const liste = JSON.parse(fs.readFileSync(jsonDu(ctx), 'utf8'));
  assert.equal(liste.length, 1);
  assert.equal(liste[0].date, '2026-10-27');
  assert.ok(liste[0].legende.length >= 20 && liste[0].alt.length >= 10);
  assert.ok(fs.existsSync(path.join(ctx.paths.siteRoot, 'public', liste[0].image)), 'image ecrite');
  assert.equal(await runCaricature(ctx), null, 'une seule fois par jour');
  assert.equal(JSON.parse(fs.readFileSync(jsonDu(ctx), 'utf8')).length, 1);
  cleanup(ctx);
});

test('dessin du jour: consigne avec une personne reelle ou legende trop courte: refuse, rien de publie', async () => {
  for (const payload of [
    { titre: 'Titre assez long', legende: 'Trop court', scene: 'Un globe terrestre en bonnet de nuit entouré de silhouettes anonymes', alt: 'Dessin de globe en bonnet' },
    { titre: 'Titre assez long', legende: 'Une légende suffisamment longue pour passer le contrôle', scene: 'Une photo réaliste de bureaux vides et de dossiers penchés', alt: 'Dessin de bureaux vides' },
  ]) {
    const ctx = makeCtx({ at: AU_MOMENT, script: ({ kind }) => (kind === 'caricature' ? payload : undefined) });
    const r = await runCaricature(ctx);
    assert.equal(r?.published, false);
    assert.ok(!fs.existsSync(jsonDu(ctx)), 'rien n\'est ecrit');
    cleanup(ctx);
  }
});

test('dessin du jour: images coupees ou dessin desactive: aucun appel', async () => {
  const ctx = makeCtx({ at: AU_MOMENT, mutateCfg: (c) => { c.engine.caricature.enabled = false; } });
  assert.equal(await runCaricature(ctx), null);
  assert.equal(ctx.sdk.counters.caricature, 0);
  cleanup(ctx);
});

test('dessin du jour: texte alternatif ou scene trop longs: coupes proprement, pas refuses', async () => {
  const long = 'Un globe terrestre coiffé de bonnets de nuit entouré de petites silhouettes anonymes qui se passent un dossier épais sans jamais le lire, '.repeat(6);
  const ctx = makeCtx({ at: AU_MOMENT, script: ({ kind }) => (kind === 'caricature' ? { titre: 'Un titre assez long', legende: 'Une légende suffisamment longue pour passer le contrôle', scene: long, alt: long } : undefined) });
  const r = await runCaricature(ctx);
  assert.equal(r?.published, true, JSON.stringify(r));
  const [e] = JSON.parse(fs.readFileSync(jsonDu(ctx), 'utf8'));
  assert.ok(e.alt.length <= 160 && e.alt.endsWith('…'), 'alt coupe');
  cleanup(ctx);
});

test('dessin du jour: modele principal indisponible (503): bascule sur le modele de secours', async () => {
  const ctx = makeCtx({
    at: AU_MOMENT,
    mutateCfg: (c) => { c.engine.gemini.generatorModel = 'gemini-3.8-flash'; c.engine.gemini.generatorFallbackModel = 'gemini-3.6-flash'; },
    script: ({ kind, model }) => { if (kind === 'caricature' && model === 'gemini-3.8-flash') { const e = new Error('surcharge'); e.status = 503; throw e; } },
  });
  const r = await runCaricature(ctx);
  assert.equal(r?.published, true, JSON.stringify(r));
  assert.ok(ctx.logger.entries.some((e) => e.event === 'caricature.fallback_model'));
  cleanup(ctx);
});
