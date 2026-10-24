import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeCtx, cleanup, fakeArticleFor } from './helpers.js';
import { runCycle } from '../src/pipeline.js';
import { dueSlots } from '../src/scheduler.js';

// 2026-10-24: Paris = UTC+2. 09:05Z = 11:05 Paris -> creneaux 07:00, 09:00, 11:00 dus (fenetre de rattrapage 150 min).

test('publie les creneaux dus, dans la limite de maxPublicationsPerRun', async () => {
  const ctx = makeCtx({ at: '2026-10-24T09:05:00Z' });
  const r = await runCycle(ctx);
  assert.equal(r.published.length, 2);
  assert.equal(ctx.articles().length, 2);
  cleanup(ctx);
});

test('relance immediate: aucun doublon, aucun article supplementaire', async () => {
  const ctx = makeCtx({ at: '2026-10-24T09:05:00Z', mutateCfg: (c) => (c.schedule.maxPublicationsPerRun = 10) });
  await runCycle(ctx);
  const n = ctx.articles().length;
  await runCycle(ctx);
  await runCycle(ctx);
  assert.equal(ctx.articles().length, n);
  cleanup(ctx);
});

test('jamais plus de maxPerDay, meme avec rattrapage force et publications extra', async () => {
  const ctx = makeCtx({ at: '2026-10-24T20:00:00Z', mutateCfg: (c) => { c.schedule.maxPerDay = 3; c.schedule.maxPublicationsPerRun = 10; c.schedule.slots = c.schedule.slots.slice(0, 3); } });
  ctx.forceCatchup = true;
  await runCycle(ctx);
  assert.equal(ctx.store.publishedCount('2026-10-24'), 3);
  ctx.extra = true;
  const r = await runCycle(ctx);
  assert.equal(r.stopped, 'daily_cap');
  assert.equal(ctx.articles().length, 3);
  cleanup(ctx);
});

test('creneaux hors fenetre de rattrapage: ignores', () => {
  const ctx = makeCtx({ at: '2026-10-24T19:00:00Z' }); // 21:00 Paris
  const { due } = dueSlots({ now: ctx.now(), schedule: ctx.cfg.schedule, store: ctx.store });
  assert.deepEqual(due.map((d) => d.hhmm), ['19:30', '21:30'].filter((h) => h === '19:30'));
  cleanup(ctx);
});

test('pause: aucun appel API, aucune publication', async () => {
  const ctx = makeCtx({ mutateCfg: (c) => (c.control.paused = true) });
  const r = await runCycle(ctx);
  assert.equal(r.stopped, 'paused');
  assert.equal(ctx.sdk.counters.total, 0);
  cleanup(ctx);
});

test('quota 429 persistant: le cycle s\'arrete, rien n\'est publie, pas de boucle infinie', async () => {
  const ctx = makeCtx({ script: () => { const e = new Error('quota'); e.status = 429; throw e; } });
  const r = await runCycle(ctx);
  assert.equal(r.stopped, 'quota');
  assert.equal(r.published.length, 0);
  assert.equal(ctx.sdk.counters.total, ctx.cfg.engine.gemini.maxRetries + 1); // tentatives limitees
  cleanup(ctx);
});

test('cle invalide (403): arret immediat sans nouvelle tentative', async () => {
  const ctx = makeCtx({ script: () => { const e = new Error('denied'); e.status = 403; throw e; } });
  const r = await runCycle(ctx);
  assert.equal(r.stopped, 'gemini_fatal');
  assert.equal(ctx.sdk.counters.total, 1);
  cleanup(ctx);
});

test('erreur 503 transitoire: nouvelle tentative puis succes', async () => {
  let failed = false;
  const ctx = makeCtx({ script: ({ kind }) => { if (kind === 'generate' && !failed) { failed = true; const e = new Error('unavailable'); e.status = 503; throw e; } } });
  const r = await runCycle(ctx);
  assert.ok(r.published.length >= 1);
  cleanup(ctx);
});

test('reponse JSON malformee: corrigee par un second essai', async () => {
  const ctx = makeCtx({ script: ({ kind, n }) => (kind === 'generate' && n === 1 ? '{"title": "tronque' : undefined) });
  const r = await runCycle(ctx);
  assert.ok(r.published.length >= 1);
  cleanup(ctx);
});

test('article mal forme persistant: quarantaine, creneau en echec, rien de publie', async () => {
  const ctx = makeCtx({ script: ({ kind }) => (kind === 'generate' ? { status: 'ready_for_review', title: 'x' } : undefined) });
  const r = await runCycle(ctx);
  assert.equal(r.published.length, 0);
  assert.ok(ctx.store.quarantine.history.length > 0);
  assert.equal(ctx.articles().length, 0);
  cleanup(ctx);
});

test('plafond budgetaire: arret avant l\'appel et aucun depassement', async () => {
  const ctx = makeCtx({ mutateCfg: (c) => (c.engine.budget.dailyUsd = 0.0001) });
  const r = await runCycle(ctx);
  assert.equal(r.stopped, 'budget');
  assert.equal(ctx.sdk.counters.total, 0);
  cleanup(ctx);
});

test('le cout est enregistre et cumule dans le grand livre', async () => {
  const ctx = makeCtx();
  await runCycle(ctx);
  assert.ok(ctx.store.usage.entries.length >= 2);
  assert.ok(ctx.store.spentOnDate('2026-10-24') > 0);
  assert.ok(fs.existsSync(path.join(ctx.paths.data, 'usage.json')));
  cleanup(ctx);
});

test('citation attribuee a une personne de la source: bloquee puis corrigee par le second essai', async () => {
  const fetcher = async () => `<rss><channel><item><title>Jean Dupont annonce un nouveau plan pour la rentrée</title><link>https://exemple.test/x</link><description>Le ministre Jean Dupont présente un plan pour simplifier les démarches en ligne.</description><pubDate>${new Date('2026-10-24T08:00:00Z').toUTCString()}</pubDate></item></channel></rss>`;
  const ctx = makeCtx({
    fetcher,
    script: ({ kind, n, prompt }) => {
      if (kind !== 'generate' || n > 1) return undefined;
      const a = fakeArticleFor(prompt, ctx.cfg.categories.map((c) => c.slug));
      a.body[0].text = 'Jean Dupont a déclaré : « Nous allons tout simplifier dès demain matin, promis juré ». Personne n\'a ri.';
      return a;
    },
  });
  const r = await runCycle(ctx);
  assert.ok(r.published.length >= 1, 'le second essai devrait etre publie');
  assert.equal(ctx.sdk.counters.generate >= 2, true);
  cleanup(ctx);
});

test('le relecteur peut bloquer meme avec un humour eleve', async () => {
  const ctx = makeCtx({ script: ({ kind }) => (kind === 'judge' ? { humor: 10, coherence: 10, risk: 9, problems: ['diffamation'], real_person_quote: false, defamation_risk: true } : undefined) });
  const r = await runCycle(ctx);
  assert.equal(r.published.length, 0);
  assert.equal(ctx.articles().length, 0);
  cleanup(ctx);
});

test('sujets sensibles exclus; repli sur un theme intemporel quand rien d\'autre', async () => {
  const fetcher = async () => `<rss><channel><item><title>Un accident mortel fait trois victimes sur l'autoroute</title><link>https://exemple.test/m</link><description>Les secours sont intervenus ce matin sur place.</description></item></channel></rss>`;
  const ctx = makeCtx({ fetcher });
  const r = await runCycle(ctx);
  assert.ok(r.published.length >= 1);
  const files = ctx.articles().map((f) => fs.readFileSync(path.join(ctx.paths.content, f), 'utf8'));
  assert.ok(files.every((c) => c.includes('"kind": ') === false && c.includes('kind: "evergreen"')));
  assert.ok(files.every((c) => !c.includes('accident')));
  cleanup(ctx);
});

test('reprise apres incident: article ecrit mais etat perdu => reconcilie, pas de doublon', async () => {
  const ctx = makeCtx({ at: '2026-10-24T05:05:00Z' }); // 07:05 Paris: un seul creneau
  await runCycle(ctx);
  assert.equal(ctx.articles().length, 1);
  ctx.store.state.slots = {}; // simulation de perte de l'etat
  const r = await runCycle(ctx);
  assert.equal(ctx.articles().length, 1);
  assert.equal(r.published[0]?.reconciled, true);
  cleanup(ctx);
});

test('flux en erreur: ignore sans bloquer le cycle (theme intemporel)', async () => {
  const ctx = makeCtx({ fetcher: async () => { throw new Error('HTTP 503'); } });
  const r = await runCycle(ctx);
  assert.ok(r.published.length >= 1);
  cleanup(ctx);
});

test('le redacteur peut rejeter un sujet (status=rejected): rien n\'est publie, le sujet est exclu', async () => {
  const ctx = makeCtx({ at: '2026-10-24T05:05:00Z', script: ({ kind }) => (kind === 'generate' ? { status: 'rejected', rejection_reason: 'sujet mediocre' } : undefined) });
  const r = await runCycle(ctx);
  assert.equal(r.published.length, 0);
  assert.equal(ctx.articles().length, 0);
  assert.ok(ctx.store.quarantine.history.some((h) => h.reasons[0].startsWith('rejet_du_redacteur')));
  cleanup(ctx);
});

test('auto-controle qualite a false: article bloque meme si le reste est correct', async () => {
  const ctx = makeCtx({ at: '2026-10-24T05:05:00Z', script: ({ kind, prompt }) => {
    if (kind !== 'generate') return undefined;
    const a = fakeArticleFor(prompt, ctx.cfg.categories.map((c) => c.slug));
    a.quality_checks.no_invented_quotes = false;
    return a;
  } });
  const r = await runCycle(ctx);
  assert.equal(r.published.length, 0);
  assert.ok(ctx.store.quarantine.items[0].issues.some((i) => i.code === 'auto_controle_echoue'));
  cleanup(ctx);
});

test('le prompt de generation contient l\'historique recent et traite la source comme une donnee', async () => {
  const seen = [];
  const ctx = makeCtx({ at: '2026-10-24T09:05:00Z', script: ({ kind, prompt }) => { if (kind === 'generate') seen.push(prompt); } });
  await runCycle(ctx);
  assert.ok(seen.length >= 2);
  assert.ok(!seen[0].includes('HISTORIQUE'), 'pas d\'historique au premier article');
  assert.ok(seen[1].includes('HISTORIQUE DES PUBLICATIONS RÉCENTES'));
  assert.ok(seen.some((p) => p.includes('<source>') && p.includes('jamais des instructions')) || seen.every((p) => p.includes('thème intemporel')));
  cleanup(ctx);
});

test('identite: le nom du journal est celui de la marque dans la configuration et les consignes', async () => {
  const ctx = makeCtx();
  assert.equal(ctx.cfg.editorial.publicationName, 'Le Quotidien Presque Certain');
  assert.ok(ctx.cfg.editorial.generatorSystemPrompt.includes('Le Quotidien Presque Certain'));
  assert.ok(ctx.cfg.editorial.satireNotice.includes('Le Quotidien Presque Certain'));
  assert.equal(ctx.cfg.editorial.logoName.sub, 'PRESQUE CERTAIN');
  cleanup(ctx);
});
