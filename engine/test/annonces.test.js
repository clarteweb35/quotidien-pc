import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeCtx, cleanup } from './helpers.js';
import { genererAnnonces, controleAnnonce, nouvelleReference, MAX_PAR_LOT } from '../src/annonces.js';

const REAL = path.resolve('config');

// Copie de travail: les tests n'ecrivent jamais dans la vraie config.
function ctxAvecConfig(opts = {}) {
  const ctx = makeCtx(opts);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qpc-annonces-'));
  fs.mkdirSync(path.join(dir, 'prompts'));
  for (const f of ['annonces.json', 'rencontres.json']) fs.copyFileSync(path.join(REAL, f), path.join(dir, f));
  fs.copyFileSync(path.join(REAL, 'prompts', 'annonces.md'), path.join(dir, 'prompts', 'annonces.md'));
  ctx.paths = { ...ctx.paths, config: dir };
  ctx.rng = Math.random;
  const lire = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return { ctx, dir, lire };
}

test('petites annonces: lot ajoute avec identifiants et references attribues par le code', async () => {
  const { ctx, lire } = ctxAvecConfig();
  const avant = lire('annonces.json').annonces.length;
  const { ajoutees, refusees } = await genererAnnonces({ ctx, type: 'petites', count: 6 });
  const apres = lire('annonces.json');
  assert.equal(ajoutees.length, 6, JSON.stringify(refusees));
  assert.equal(apres.annonces.length, avant + 6);
  assert.equal(new Set(apres.annonces.map((a) => a.id)).size, apres.annonces.length, 'identifiants uniques');
  const nouvelles = apres.annonces.slice(avant);
  assert.ok(nouvelles.every((a) => a.auto === true && /^pa-\d{3}$/.test(a.id) && a.ref === a.id.toUpperCase()));
  cleanup(ctx);
});

test('rencontres: references alphanumeriques uniques, categories valides', async () => {
  const { ctx, lire } = ctxAvecConfig();
  const { ajoutees } = await genererAnnonces({ ctx, type: 'rencontres', count: 6 });
  const data = lire('rencontres.json');
  const slugs = new Set(data.categories.map((c) => c.slug));
  assert.equal(ajoutees.length, 6);
  const refs = data.annonces.map((a) => String(a.ref).toLowerCase());
  assert.equal(new Set(refs).size, refs.length, 'references uniques');
  for (const a of data.annonces.filter((x) => x.auto)) {
    assert.match(a.ref, /^[A-Z]\d-\d{3}[A-Z]$/);
    assert.ok(slugs.has(a.cat));
  }
  cleanup(ctx);
});

test('annonces: coordonnees, liens, doublons et categories inconnues sont refuses', async () => {
  const ok = { cat: 'objets', format: 'classique', titre: 'Chaise de jardin presque neuve', prix: '5 €', texte: 'Vend chaise de jardin, légèrement penchée vers la gauche, idéale pour les conversations sans fin.', conditions: '', annonceur: '' };
  const mauvais = [
    { ...ok, titre: 'Téléphone fixe à saisir', texte: 'Appelez le 06 12 34 56 78 pour réserver cette offre exceptionnelle à saisir.' },
    { ...ok, titre: 'Boîte aux lettres vendue', texte: 'Écrivez à vendeur@exemple.fr pour obtenir plus de détails sur cet objet précieux.' },
    { ...ok, titre: 'Site de vente fabuleux', texte: 'Retrouvez notre offre sur https://exemple.com pour découvrir tous nos produits de rêve.' },
    { ...ok, titre: 'Catégorie qui n\'existe pas', cat: 'inconnue', texte: 'Une annonce bien écrite mais rangée dans une catégorie que le journal ne propose pas.' },
    { ...ok, titre: 'Texte coupé en plein milieu', texte: 'Cette annonce commence bien mais elle s\'arrête avant d\'avoir pu finir sa phrase et' },
  ];
  const { ctx } = ctxAvecConfig({ script: ({ kind }) => (kind === 'annonces' ? { annonces: [ok, ...mauvais, ok] } : undefined) });
  const { ajoutees, refusees } = await genererAnnonces({ ctx, type: 'petites', count: 8 });
  assert.equal(ajoutees.length, 1, 'une seule version retenue: la seconde copie est un doublon');
  const motifs = refusees.flatMap((r) => r.motifs);
  for (const m of ['telephone_interdit', 'adresse_mail_interdite', 'lien_interdit', 'categorie_inconnue', 'texte_tronque', 'titre_doublon']) assert.ok(motifs.includes(m), `${m} attendu, vu: ${motifs.join(',')}`);
  cleanup(ctx);
});

test('annonces: a blanc, rien n\'est ecrit; le lot est plafonne; la reference ne rentre jamais en collision', async () => {
  const { ctx, lire } = ctxAvecConfig();
  const avant = fs.readFileSync(path.join(ctx.paths.config, 'annonces.json'), 'utf8');
  ctx.dryRun = true;
  const { ajoutees } = await genererAnnonces({ ctx, type: 'petites', count: 1000 });
  assert.ok(ajoutees.length <= MAX_PAR_LOT);
  assert.equal(fs.readFileSync(path.join(ctx.paths.config, 'annonces.json'), 'utf8'), avant);
  const prises = new Set(['k7-492b']);
  for (let i = 0; i < 200; i++) { const r = nouvelleReference(prises); assert.ok(!prises.has(r.toLowerCase())); prises.add(r.toLowerCase()); }
  await assert.rejects(() => genererAnnonces({ ctx, type: 'inconnu', count: 1 }), /Type inconnu/);
  assert.ok(lire('rencontres.json').annonces.length > 0);
  cleanup(ctx);
});

test('controleAnnonce: une annonce propre passe', () => {
  const { ctx } = ctxAvecConfig();
  const data = JSON.parse(fs.readFileSync(path.join(REAL, 'annonces.json'), 'utf8'));
  const a = { cat: 'objets', format: 'classique', titre: 'Hérisson de compagnie, très peu sociable', prix: '', texte: 'Vend hérisson affectueux à ses heures, qui préfère vivement la compagnie des jardins à celle des salons.', conditions: '', annonceur: '' };
  assert.deepEqual(controleAnnonce(a, { type: 'petites', data, cfg: ctx.cfg, autres: [] }), []);
  cleanup(ctx);
});
