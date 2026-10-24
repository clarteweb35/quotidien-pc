import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCtx, cleanup, fakeArticleFor } from './helpers.js';
import { validateArticle, normalizeArticle } from '../src/validator.js';
import { redact } from '../src/logger.js';
import { parseFeed } from '../src/collector.js';
import { computeCostUsd } from '../src/gemini.js';

const topic = { kind: 'news', title: 'Marie Curie annonce un plan', summary: 'Le plan de Marie Curie vise à simplifier.', url: 'https://exemple.test/a', sourceName: 'Test', category: 'societe' };

function base(ctx, patch = {}) {
  const a = fakeArticleFor('Titre : quelque chose de neuf\nRUBRIQUE SUGGÉRÉE : societe', ctx.cfg.categories.map((c) => c.slug));
  return normalizeArticle({ ...a, ...patch }, ctx.cfg);
}
const codes = (r) => r.issues.map((i) => i.code);

test('un article correct passe', () => {
  const ctx = makeCtx();
  const r = validateArticle({ article: base(ctx), topic, cfg: ctx.cfg });
  assert.deepEqual(codes(r), []);
  cleanup(ctx);
});

test('HTML, liens et Markdown sont refuses', () => {
  const ctx = makeCtx();
  for (const [bad, code] of [
    ['<script>alert(1)</script>', 'html_interdit'],
    ['<img src=x onerror=alert(1)>', 'html_interdit'],
    ['Voir https://evil.example/x pour la suite de cette histoire', 'lien_interdit'],
    ['[cliquez](javascript:alert(1))', 'lien_interdit'],
    ['**gras interdit** dans un texte brut qui devrait rester brut et simple', 'markdown_interdit'],
  ]) {
    const a = base(ctx);
    a.body[0].text = bad;
    assert.ok(codes(validateArticle({ article: a, topic, cfg: ctx.cfg })).includes(code), bad);
  }
  cleanup(ctx);
});

test('longueurs, champs vides et categorie inconnue', () => {
  const ctx = makeCtx();
  assert.ok(codes(validateArticle({ article: base(ctx, { title: 'Court' }), topic, cfg: ctx.cfg })).includes('titre_trop_court'));
  assert.ok(codes(validateArticle({ article: { ...base(ctx), body: [] }, topic, cfg: ctx.cfg })).some((c) => c.startsWith('forme:')));
  assert.ok(codes(validateArticle({ article: { ...base(ctx), category: 'inconnue' }, topic, cfg: ctx.cfg })).includes('forme:categorie_inconnue'));
  const short = base(ctx);
  short.body = short.body.slice(0, 3);
  assert.ok(codes(validateArticle({ article: short, topic, cfg: ctx.cfg })).includes('corps_trop_court'));
  cleanup(ctx);
});

test('titre et corps trop proches d\'un article existant', () => {
  const ctx = makeCtx();
  const a = base(ctx);
  const existing = [{ id: 'old', title: a.title, text: a.body.map((b) => b.text).join('\n\n') }];
  const c = codes(validateArticle({ article: a, topic, cfg: ctx.cfg, existing }));
  assert.ok(c.includes('titre_trop_proche') && c.includes('corps_trop_proche'));
  cleanup(ctx);
});

test('citation pres du nom d\'une personne de la source: refusee', () => {
  const ctx = makeCtx();
  const a = base(ctx);
  a.body[1].text = 'Marie Curie a affirmé : « Je promets que tout sera résolu avant la fin de la semaine prochaine ». Personne ne la croit.';
  assert.ok(codes(validateArticle({ article: a, topic, cfg: ctx.cfg })).includes('citation_personne_reelle'));
  a.body[1].text = 'Un porte-parole fictif a affirmé : « Je promets que tout sera résolu avant la fin de la semaine prochaine ». Personne ne le croit.';
  assert.ok(!codes(validateArticle({ article: a, topic, cfg: ctx.cfg })).includes('citation_personne_reelle'));
  cleanup(ctx);
});

test('article d\'actualite sans source https: refuse', () => {
  const ctx = makeCtx();
  assert.ok(codes(validateArticle({ article: base(ctx), topic: { ...topic, url: 'http://x' }, cfg: ctx.cfg })).includes('source_manquante'));
  assert.ok(!codes(validateArticle({ article: base(ctx), topic: { ...topic, kind: 'evergreen', url: '' }, cfg: ctx.cfg })).includes('source_manquante'));
  cleanup(ctx);
});

test('la cle API est masquee dans les journaux', () => {
  assert.ok(!redact('erreur key=AIzaSyA1234567890abcdefghijklmnopqrstuv fin').includes('AIzaSy'));
  assert.ok(!redact('{"apiKey":"abcdefghijkl123456"}').includes('abcdefghijkl'));
  assert.ok(!redact('token=sk-secretvalue12345 suite').includes('secretvalue'));
  assert.ok(redact('token=sk-secretvalue12345 suite').endsWith(' suite'));
});

test('calcul de cout et modele sans tarif', () => {
  const prices = { m: { input: 1, output: 2 } };
  assert.equal(computeCostUsd(prices, 'm', 1_000_000, 500_000), 2);
  assert.throws(() => computeCostUsd(prices, 'inconnu', 1, 1));
});

test('analyse RSS et Atom', () => {
  const feed = { id: 'f', name: 'F', category: 'societe' };
  const rss = '<rss><channel><item><title>A &amp; B</title><link>https://x.test/1</link><description>&lt;p&gt;Résumé&lt;/p&gt;</description><pubDate>Sat, 24 Oct 2026 08:00:00 GMT</pubDate></item><item><title>Sans lien</title></item></channel></rss>';
  const items = parseFeed(rss, feed);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'A & B');
  assert.ok(!items[0].summary.includes('<'));
  const atom = '<feed><entry><title>T</title><link rel="alternate" href="https://x.test/2"/><updated>2026-10-24T08:00:00Z</updated></entry></feed>';
  assert.equal(parseFeed(atom, feed)[0].url, 'https://x.test/2');
});
