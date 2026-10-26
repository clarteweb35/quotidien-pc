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
  for (const a of data.annonceurs) if (a.logo) assert.ok(fs.existsSync(path.join(ROOT, 'site/public/annonces', a.logo)), `logo absent: ${a.logo}`);
  const html = page('petites-annonces');
  assert.ok(html.includes('Toutes les annonces') && html.includes('Déposer une annonce'));
  assert.ok(html.includes('coïncidence presque certaine'), 'mention fictive');
  assert.ok(html.includes('sélectionnées par Madame de Valmorin') && html.includes('href="/rencontres/"'), 'annonce de renvoi vers les rencontres');
  assert.ok(!html.includes('Partenaire officiel') || html.includes('class="pa-agence"'), 'sur Petites annonces, l\'agence est une annonce (pa-agence), pas le grand bandeau');
  assert.ok(html.includes('class="pa-agence"') && html.indexOf('class="pa-agence"') < html.indexOf('class="pa pa-'), 'l\'agence est l\'annonce noire en tete de liste');
  assert.ok(data.annonceurs.find((a) => a.id === 'miraculex').logo, 'logo Miraculex');
  assert.ok(fs.existsSync(path.join(ROOT, 'site/public/annonces', data.partenaire.image)), 'portrait du partenaire');
  assert.equal((html.match(/class="pa pa-/g) || []).length, data.annonces.length);
  assert.equal((html.match(/id="pub-def"/g) || []).length, 1, 'une seule pub defilante');
  assert.ok(html.includes('pa-solde') && html.includes('-100 % sur tout le magasin'), 'titre facon soldes');
  assert.ok(!/class="pa-marque"[^>]*>Miraculex/.test(html) && html.includes('<figcaption>Miraculex®</figcaption>'), 'Miraculex: nom en legende sous le logo, plus en en-tete');
  for (const id of ['trobo', 'vortex']) assert.ok(data.annonceurs.find((a) => a.id === id).logo, `logo ${id}`);
  assert.equal(data.annonces.find((a) => a.id === 'pa-026').annonceur, 'vortex');
  assert.equal(data.annonces.find((a) => a.id === 'pa-028').annonceur, 'nouvellasecure');
  for (const a of data.annonceurs) if (a.logo) assert.ok(fs.existsSync(path.join(ROOT, 'site/public/annonces', a.logo)), `logo absent: ${a.logo}`);
  assert.ok(html.indexOf('id="pa-liste"') < html.indexOf('id="pub-def"') && html.indexOf('id="pub-def"') < html.indexOf('id="pa-liste-2"'), 'la pub defilante est au milieu des annonces');
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

test('rencontres: references uniques, photos existantes, page et menu', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/rencontres.json'), 'utf8'));
  const refs = data.annonces.map((a) => a.ref);
  assert.equal(new Set(refs).size, refs.length, 'references uniques');
  assert.ok(refs.every((r) => (Number.isInteger(r) && r > 0) || /^[A-Z0-9][A-Z0-9-]{3,11}$/.test(r)), 'references: entier ou code alphanumerique');
  assert.equal(new Set(refs.map((r) => String(r).toLowerCase())).size, refs.length, 'ancres uniques');
  const slugs = new Set(data.categories.map((c) => c.slug));
  for (const a of data.annonces) {
    assert.ok(slugs.has(a.cat), `categorie inconnue: RÉF. ${a.ref}`);
    if (a.photo) assert.ok(fs.existsSync(path.join(ROOT, 'site/public/rencontres', a.photo)), `photo absente: ${a.photo}`);
  }
  assert.ok(data.descriptionSeo.length <= 160, 'meta description <= 160 caracteres');
  const html = page('rencontres');
  assert.equal((html.match(/class="rc-ref/g) || []).length, data.annonces.length);
  assert.ok(html.includes('RÉF. 001') && html.includes('fictives et satiriques'));
  assert.ok(html.includes('Partenaire officiel des petites annonces du cœur') && html.includes('Madame de Valmorin') && html.includes('class="agence-citation"'), 'bandeau partenaire sur la page Rencontres');
  assert.ok(!html.includes('Parcourir les petites annonces du journal') && html.includes('Ici, des algorithmes froids'), 'textes du bandeau');
  assert.ok(!/href="(mailto|tel):/.test(html.slice(html.indexOf('rc-sommaire'), html.indexOf('rc-mention'))), 'aucun lien vers des coordonnees');
  assert.ok(page('.').includes('href="/rencontres/"'), 'lien dans le menu');
});

test('accueil: La Manchette de la Manchette; articles: publicite fictive tiree des petites annonces', () => {
  const home = page('.');
  assert.ok(home.includes('La Manchette de la Manchette') && home.includes('href="/rubrique/editos/"'), 'manchette de l\'edito du jour');
  assert.ok(home.indexOf('La Manchette de la Manchette') < home.indexOf('class="flash"'), 'la manchette est au-dessus du fil À l\'instant');
  assert.ok(home.includes('sélectionnées par Madame de Valmorin') && home.includes('href="/rencontres/"'), 'bandeau Rencontres sur l\'accueil');
  const debut = home.indexOf('Dernières nouvelles');
  const apresTitre = home.slice(debut);
  const avantBandeau = apresTitre.slice(0, apresTitre.indexOf('class="bandeau-rc'));
  assert.equal((avantBandeau.match(/<article class="card/g) || []).length, 6, 'le bandeau Rencontres vient après les 6 premières dernières nouvelles');
  assert.ok(debut > 0 && !home.slice(debut).includes('class="card edito'), 'pas d\'edito dans Dernières nouvelles');
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/annonces.json'), 'utf8'));
  assert.ok(data.annonces.filter((a) => a.pub && !a.reel).length >= 5, 'au moins 5 annonces utilisables comme publicites');
  const slug = fs.readdirSync(path.join(ROOT, 'site/src/content/articles')).find((f) => f.endsWith('.md'));
  const fm = fs.readFileSync(path.join(ROOT, 'site/src/content/articles', slug), 'utf8');
  const s = /^slug: "([^"]+)"/m.exec(fm)[1];
  const art = page(`articles/${s}`);
  assert.ok(art.includes('Publicité fictive') && art.includes('href="/petites-annonces/#pa-'), 'publicite fictive dans l\'article');
  assert.ok(art.indexOf('Publicité fictive') < art.indexOf('class="kicker"'), 'la pub est au-dessus de la rubrique, sous le menu');
  assert.ok(/manchette-globale[^"]*colonne/.test(art), 'sur un article, la manchette suit la colonne de lecture');
});

test('contenu: jamais plus d\'un edito par jour (heure de Paris)', () => {
  const dir = path.join(ROOT, 'site/src/content/articles');
  const parJour = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!/^category: "editos"/m.test(t)) continue;
    const at = /^publishedAt: "([^"]+)"/m.exec(t)[1];
    const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(at));
    parJour[jour] = (parJour[jour] ?? 0) + 1;
  }
  for (const [jour, n] of Object.entries(parJour)) assert.ok(n <= 1, `${n} editos le ${jour}`);
});

test('SEO: mots-cles minces en noindex et hors sitemap, lectures proches, schema Article', () => {
  const dir = path.join(ROOT, 'site/src/content/articles');
  const compte = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const tags = /^tags:\s*\[(.*)\]\s*$/m.exec(fs.readFileSync(path.join(dir, f), 'utf8'))?.[1];
    if (tags) for (const t of JSON.parse(`[${tags}]`)) compte.set(t, (compte.get(t) ?? 0) + 1);
  }
  const mince = [...compte].find(([, n]) => n < 3)[0];
  const solide = [...compte].find(([, n]) => n >= 3)?.[0];
  assert.ok(page(`tag/${mince}`).includes('content="noindex, follow"'), 'mot-cle mince en noindex, follow');
  const sitemap = fs.readFileSync(path.join(out, 'sitemap-0.xml'), 'utf8');
  assert.ok(!sitemap.includes(`/tag/${encodeURIComponent(mince)}/`), 'mot-cle mince hors sitemap');
  if (solide) assert.ok(!page(`tag/${solide}`).includes('noindex'), 'mot-cle fourni indexable');
  const slug = /^slug: "([^"]+)"/m.exec(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((x) => x.endsWith('.md'))), 'utf8'))[1];
  const art = page(`articles/${slug}`);
  assert.ok(art.includes('À lire aussi') && art.includes('"@type":"Article"') && !art.includes('SatiricalArticle'), 'lectures proches et schema Article');
});

test('maillage interne: manchette partout, fil d\'Ariane, precedent/suivant, liens vers les fiches', () => {
  for (const pg of ['.', 'redaction', 'jeux', 'compteurs', 'rubrique/sport', 'petites-annonces']) assert.ok(page(pg).includes('La Manchette de la Manchette'), `manchette sur ${pg}`);
  assert.ok(page('.').indexOf('La Manchette de la Manchette') < page('.').indexOf('<main'), 'la manchette est au-dessus du contenu, sous le menu');
  assert.equal((page('.').match(/La Manchette de la Manchette</g) || []).length, 1, 'une seule manchette par page');
  const dir = path.join(ROOT, 'site/src/content/articles');
  const slug = /^slug: "([^"]+)"/m.exec(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((x) => x.endsWith('.md'))), 'utf8'))[1];
  const art = page(`articles/${slug}`);
  assert.ok(art.includes('aria-label="Fil d\'Ariane"') || art.includes('Fil d&#39;Ariane'), 'fil d\'Ariane');
  assert.ok(page('.').includes('href="/redaction/#'), 'signature cliquable sur les cartes');
  // Encart « Petites annonces » (taille d'une carte) et bandeau Rencontres sur les pages qui listent des articles
  for (const pg of ['.', 'rubrique/societe', 'rubrique/sport']) {
    const h = page(pg);
    assert.ok(h.includes('class="card encart-annonces"') && h.includes('href="/petites-annonces/"'), `encart petites annonces sur ${pg}`);
    assert.ok(h.includes('sélectionnées par Madame de Valmorin'), `bandeau rencontres sur ${pg}`);
  }
  const soc = page('rubrique/societe');
  const avant = soc.slice(0, soc.indexOf('class="bandeau-rc'));
  assert.equal((avant.match(/<article class="card/g) || []).length, 3, 'bandeau apres 3 articles (rubrique de 4 articles ou plus)');
  assert.ok(page('redaction').includes('Derniers articles') || page('redaction').includes('Derniers éditos'), 'articles de chaque journaliste');
});

test('menu tape a la machine et titre de l\'edito: balisage prevu, accessible sans JavaScript', () => {
  const h = page('.');
  assert.ok(/<a [^>]*style="--n:\d+;--t:[\d.]+s"/.test(h), 'entrees du menu avec duree de frappe');
  assert.ok(h.includes('sessionStorage.getItem("frappe")'), 'drapeau une fois par session');
  assert.ok(h.includes('--fin:'), 'fin de la frappe du menu exposee au titre de l\'edito');
  assert.ok(h.includes('Pourquoi le dimanche devrait être transféré au mardi') || h.includes('class="mm-titre"'), 'le titre de l\'edito est dans le HTML (lisible sans JS)');
});

test.after(() => fs.rmSync(out, { recursive: true, force: true }));
