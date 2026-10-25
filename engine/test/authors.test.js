import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeCtx, cleanup, fakeArticleFor } from './helpers.js';
import { runCycle } from '../src/pipeline.js';
import { resolveAuthor, activeRoster, rosterPrompt, deskLabel } from '../src/authors.js';
import { validateArticle, normalizeArticle } from '../src/validator.js';
import { parseArticleFile } from '../src/publisher.js';
import { checkConfig } from '../src/config.js';

const fm = (ctx) => ctx.articles().map((f) => parseArticleFile(fs.readFileSync(path.join(ctx.paths.content, f), 'utf8')).fm);

test('chaque rubrique a des journalistes actifs, sans doublon de nom', () => {
  const cfg = makeCtx().cfg;
  assert.deepEqual(checkConfig(cfg), []);
  // Les editos n'ont qu'un signataire: le redacteur en chef.
  for (const c of cfg.categories) assert.ok(activeRoster(cfg, c.slug).length >= (c.slug === 'editos' ? 1 : 3), c.slug);
  assert.equal(deskLabel(cfg, 'tech'), 'Service tech & sciences');
  assert.ok(rosterPrompt(cfg).includes('Claire Delatour'));
  assert.ok(!rosterPrompt(cfg).includes('Sophie Valençay'), 'les journalistes en reserve ne sont pas proposes');
});

test('signature: choix valide respecte (accents/casse ignores), sinon titulaire du service, jamais un autre service', () => {
  const cfg = makeCtx().cfg;
  assert.deepEqual(resolveAuthor({ proposed: 'jean-michel demission', category: 'politique' }, cfg), { name: 'Jean-Michel Démission', chosenByModel: true });
  assert.deepEqual(resolveAuthor({ proposed: 'Léa Baudry', category: 'politique' }, cfg), { name: 'Claire Delatour', chosenByModel: false });
  assert.deepEqual(resolveAuthor({ proposed: 'Sophie Valençay', category: 'politique' }, cfg), { name: 'Claire Delatour', chosenByModel: false }); // reserve
  assert.deepEqual(resolveAuthor({ proposed: undefined, category: 'sport' }, cfg), { name: 'David Lemaître', chosenByModel: false });
});

test('les articles publies sont signes par un journaliste de leur rubrique', async () => {
  const ctx = makeCtx({ mutateCfg: (c) => { c.schedule.maxPublicationsPerRun = 5; c.schedule.catchupMinutes = 400; } });
  await runCycle(ctx);
  const list = fm(ctx);
  assert.ok(list.length >= 3);
  for (const a of list) {
    const j = ctx.cfg.journalists.find((x) => x.name === a.author);
    assert.ok(j && j.active && j.desk === a.category, `${a.author} / ${a.category}`);
  }
  cleanup(ctx);
});

test('le choix du redacteur est conserve quand il est valide', async () => {
  const ctx = makeCtx({ at: '2026-10-24T05:05:00Z', script: ({ kind, prompt }) => {
    if (kind !== 'generate') return undefined;
    const a = fakeArticleFor(prompt, ctx.cfg.categories.map((c) => c.slug));
    a.category = 'economie';
    a.author = 'Philippe Poche';
    return a;
  } });
  await runCycle(ctx);
  assert.equal(fm(ctx)[0].author, 'Philippe Poche');
  cleanup(ctx);
});

test('le prompt de generation contient l\'equipe', async () => {
  const seen = [];
  const ctx = makeCtx({ script: ({ kind, prompt }) => { if (kind === 'generate') seen.push(prompt); } });
  await runCycle(ctx);
  assert.ok(seen[0].includes('ÉQUIPE RÉDACTIONNELLE') && seen[0].includes('Marion Lefebvre'));
  cleanup(ctx);
});

test('garde-fous: faux temoignage et nom de journaliste dans le texte sont refuses', () => {
  const ctx = makeCtx();
  const topic = { kind: 'evergreen', title: 'x', summary: '', url: '' };
  const base = () => normalizeArticle(fakeArticleFor('Titre : un sujet\nRUBRIQUE SUGGÉRÉE : societe', ctx.cfg.categories.map((c) => c.slug)), ctx.cfg);
  const codes = (a) => validateArticle({ article: a, topic, cfg: ctx.cfg }).issues.map((i) => i.code);
  assert.deepEqual(codes(base()), []);
  for (const bad of ['Notre envoyé spécial sur place a constaté que tout allait bien dans la salle.', 'Nous avons rencontré plusieurs habitants qui confirment cette version des faits.', 'Notre enquête a révélé que personne ne savait vraiment pourquoi.']) {
    const a = base(); a.body[0].text = bad;
    assert.ok(codes(a).includes('signature_temoignage_invente'), bad);
  }
  const b = base(); b.body[1].text = 'Comme l\'expliquait Marion Lefebvre hier soir, la situation reste parfaitement sous contrôle dans tout le pays.';
  assert.ok(codes(b).includes('signature_dans_le_texte'));
  cleanup(ctx);
});
