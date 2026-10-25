import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/config.js';

const legal = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/legal.json'), 'utf8'));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'qpc-site-'));
const build = spawnSync('npx', ['astro', 'build', '--outDir', out], {
  cwd: path.join(ROOT, 'site'), shell: true, encoding: 'utf8',
  env: { ...process.env, MARCHES_OFFLINE: '1', SITE_URL: 'https://example.com', SITE_BASE: '/' },
});
const page = (p) => fs.readFileSync(path.join(out, p, 'index.html'), 'utf8');

test('le site se construit sans reseau', () => {
  assert.equal(build.status, 0, build.stdout + build.stderr);
});

test('mentions legales: contact editeur et adresse de signalement distincts', () => {
  const html = page('mentions-legales');
  assert.ok(html.includes(`mailto:${legal.contactEmail}`));
  assert.ok(html.includes(`mailto:${legal.reportEmail}`));
});

test('rubrique economie: se construit, et le bloc marches est masque sans donnees', () => {
  const html = page('rubrique/economie');
  assert.ok(html.includes('Économie'));
  assert.ok(!html.includes('class="marches"'));
});

test('chaque rubrique et la page d\'accueil existent', () => {
  const cats = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/categories.json'), 'utf8')).categories;
  for (const c of cats) assert.ok(fs.existsSync(path.join(out, 'rubrique', c.slug, 'index.html')), c.slug);
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
});

test('referencement: plan du site, sitemap date, robots et donnees structurees', () => {
  assert.ok(page('plan-du-site').includes('Tous les articles'));
  const sitemap = fs.readFileSync(path.join(out, 'sitemap-0.xml'), 'utf8');
  assert.ok(sitemap.includes('/plan-du-site/'));
  assert.ok(/<lastmod>/.test(sitemap), 'lastmod des articles');
  assert.ok(!sitemap.includes('/admin/'));
  assert.ok(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8').includes('sitemap-0.xml'), 'alias /sitemap.xml');
  assert.ok(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8').includes('Sitemap:'));
  assert.ok(page('.').includes('"@type":"WebSite"'));
});

test('jeux et editos: pages construites et menu complet', () => {
  assert.ok(page('jeux').includes('Sudoku'));
  assert.ok(page('rubrique/editos').includes('Éditos'));
  const menu = page('.');
  assert.ok(menu.indexOf('>Compteurs<') < menu.indexOf('>Éditos<') && menu.indexOf('>Éditos<') < menu.indexOf('>Jeux<'), 'ordre du menu: Compteurs, Éditos, Jeux');
});

test('petites annonces: page, menu, donnees coherentes et mention obligatoire', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/annonces.json'), 'utf8'));
  const slugs = new Set(data.categories.map((c) => c.slug));
  assert.ok(data.annonces.length >= 20, 'au moins 20 annonces');
  assert.equal(new Set(data.annonces.map((a) => a.id)).size, data.annonces.length, 'identifiants uniques');
  for (const a of data.annonces) {
    assert.ok(slugs.has(a.cat), `categorie inconnue: ${a.id}`);
    if (a.annonceur) assert.ok(data.annonceurs.some((x) => x.id === a.annonceur), `annonceur inconnu: ${a.id}`);
    if (a.image) assert.ok(fs.existsSync(path.join(ROOT, 'site/public/annonces', a.image)), `image absente: ${a.image}`);
  }
  const html = page('petites-annonces');
  assert.ok(html.includes('Toutes les annonces') && html.includes('Déposer une annonce'));
  assert.ok(html.includes('coïncidence presque certaine'), 'mention fictive');
  assert.equal((html.match(/class="pa pa-/g) || []).length, data.annonces.length);
  // Les vraies annonces sont toujours etiquetees, avec lien https cliquable et texte visible.
  const vraies = data.annonces.filter((a) => a.reel);
  assert.ok(vraies.length >= 6);
  for (const a of vraies) {
    assert.match(a.url, /^https:\/\//, a.id);
    assert.ok(html.includes(`href="${a.url}"`), `lien absent: ${a.id}`);
  }
  assert.equal((html.match(/>Vraie annonce</g) || []).length, vraies.length);
  assert.ok(html.includes('Seules font exception'), 'la mention signale les vraies annonces');
  assert.ok(page('.').includes('>Petites annonces<'), 'lien dans le menu');
});

test.after(() => fs.rmSync(out, { recursive: true, force: true }));
