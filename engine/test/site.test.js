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
  env: { ...process.env, MARCHES_OFFLINE: '1', SITE_URL: 'https://example.com', SITE_BASE: '/', QPC_CARICATURES: path.join(ROOT, 'engine/test/fixtures/caricatures.json') },
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
  assert.ok(menu.indexOf('>Éditos<') < menu.indexOf('>Petites annonces<') && menu.indexOf('>Petites annonces<') < menu.indexOf('>Rencontres<') && menu.indexOf('>Rencontres<') < menu.indexOf('>Jeux<'), 'ordre du menu: Éditos, Petites annonces, Rencontres, Jeux');
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

test('accueil: La dernière manchette de la Manchette; articles: publicite fictive tiree des petites annonces', () => {
  const home = page('.');
  assert.ok(home.includes('La dernière manchette de la Manchette') && home.includes('href="/rubrique/editos/"'), 'manchette de l\'edito du jour');
  assert.ok(home.indexOf('La dernière manchette de la Manchette') < home.indexOf('class="flash"'), 'la manchette est au-dessus du fil À l\'instant');
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
  const css = fs.readFileSync(path.join(ROOT, 'site/src/styles/global.css'), 'utf8');
  assert.ok(/\.article \{ max-width: none/.test(css) && /\.prose \{ max-width: none/.test(css), 'articles et redaction aussi larges que le menu');
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
  for (const pg of ['.', 'rubrique/sport', 'rubrique/editos']) assert.ok(page(pg).includes('La dernière manchette de la Manchette'), `manchette sur ${pg}`);
  for (const pg of ['redaction', 'jeux', 'petites-annonces', 'rencontres']) assert.ok(!page(pg).includes('La dernière manchette de la Manchette'), `pas de manchette sur ${pg}`);
  assert.ok(!fs.existsSync(path.join(out, 'compteurs')), 'la page Compteurs est supprimee');
  assert.ok(page('.').indexOf('La dernière manchette de la Manchette') < page('.').indexOf('<main'), 'la manchette est au-dessus du contenu, sous le menu');
  assert.equal((page('.').match(/La dernière manchette de la Manchette</g) || []).length, 1, 'une seule manchette par page');
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
  assert.ok(h.includes('localStorage.getItem("frappe")'), 'frappe du menu rejouee au plus toutes les 12 h');
  assert.ok(h.includes('--fin:'), 'fin de la frappe du menu exposee au titre de l\'edito');
  assert.ok(h.includes('Pourquoi le dimanche devrait être transféré au mardi') || h.includes('class="mm-titre"'), 'le titre de l\'edito est dans le HTML (lisible sans JS)');
});

test('Yves Verts: annonce en Rencontres (hommes/hommes) liee a sa fiche, et inversement; annonces sans image signalees', () => {
  const rc = page('rencontres');
  assert.ok(rc.includes('Annonce déposée par') && rc.includes('href="/redaction/#yves-verts"'), 'annonce -> fiche de la redaction');
  assert.ok(rc.includes("Pas d'image fournie"), 'annonces sans portrait signalees');
  const rd = page('redaction');
  assert.ok(rd.includes('Son annonce dans') && rd.includes('href="/rencontres/#ref-n7y-16c"'), 'fiche -> annonce');
  assert.ok(fs.existsSync(path.join(ROOT, 'site/public/redaction/yves-verts.webp')), 'portrait d\'Yves Verts');
  const ann = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/annonces.json'), 'utf8'));
  assert.ok(!JSON.stringify(ann).includes('Teflon'), 'marque parodiee: Peflon');
});

test("mesure d'audience GA4: derriere le consentement, jamais chargee d'office", () => {
  const legal2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/legal.json'), 'utf8'));
  const id = legal2.analytics.measurementId;
  assert.match(id, /^G-[A-Z0-9]{6,12}$/);
  for (const pg of ['.', 'redaction', 'jeux']) {
    const h = page(pg);
    assert.ok(h.includes('id="consent"') && h.includes('data-open-consent'), `bandeau de consentement et lien « Gérer mes cookies » sur ${pg}`);
    assert.ok(!h.includes('src="https://www.googletagmanager.com'), `aucune balise gtag chargee d'office sur ${pg}`);
    assert.ok(h.includes(id), 'identifiant present seulement dans le script de consentement');
  }
  assert.ok(page('mentions-legales').includes('Google'), "mentions legales: mesure d'audience decrite");
});

test('petites annonces: les encarts gardent un fond sombre (texte clair lisible)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'site/src/styles/global.css'), 'utf8');
  assert.ok(css.includes('.pa-colonnes .pa:not(.pa-encart):not(.pa-vedette)'), "le fond clair ne s'applique pas aux encarts");
  assert.ok(!/.pa-colonnes .pa {[^}]*background/.test(css), 'aucune regle generique de fond sur .pa-colonnes .pa');
});

test("menu: la frappe ne laisse aucun rognage une fois terminee (Éditos et Petites annonces complets)", () => {
  const css = fs.readFileSync(path.join(ROOT, 'site/src/styles/global.css'), 'utf8');
  assert.ok(/.nav a { animation: frappe [^;]*backwards/.test(css), 'animation du menu en fill-mode backwards');
  const h = page('.');
  assert.ok(h.includes('>Éditos<') && h.includes('>Petites annonces<'), 'libelles complets dans le HTML');
});

test('Yves Verts: 32 ans sur sa fiche et sur son annonce, recherche modifiee', () => {
  assert.ok(page('redaction').includes('Yves Verts</strong>, 32 ans'), 'age sur la fiche');
  const rc = page('rencontres');
  assert.ok(rc.includes('Homme 32 ans, journaliste au service environnement') && rc.includes('Homme + de 85 ans, riche et malade.'), 'annonce');
});

test('rencontres: introduction pleine largeur, sommaire centre, encart petites annonces; legende de Lucas', () => {
  const rc = page('rencontres');
  assert.ok(rc.includes('class="card encart-annonces"'), 'encart petites annonces sur Rencontres');
  const css = fs.readFileSync(path.join(ROOT, 'site/src/pages/rencontres.astro'), 'utf8');
  assert.ok(/\.rc-intro \{[^}]*max-width: none/.test(css), 'introduction sur toute la longueur');
  assert.ok(/\.rc-sommaire ul \{[^}]*justify-content: center/.test(css), 'sommaire centre');
  assert.ok(page('redaction').includes('la génération Z refusant de faire des heures supplémentaires non payées'), 'legende de Lucas');
  assert.ok(page('jeux').includes('encart-annonces'), 'encart sur jeux');
});

test('petites annonces: logos en grand (haut/duo), colonnes equilibrees par script', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/annonces.json'), 'utf8'));
  const st = Object.fromEntries(data.annonceurs.map((a) => [a.id, a.logoStyle]));
  assert.deepEqual([st.trobo, st.teflonhuman, st.evidence, st.zerotache, st.levide], ['haut', 'haut', 'haut', 'duo', 'filigrane']);
  const html = page('petites-annonces');
  assert.ok(html.includes('class="pa-contenu"') && html.includes('lg-haut') && html.includes('lg-duo'), 'structure des encarts');
  assert.ok(!html.includes('class="pa-marque" data-astro-cid-') || !/pa-marque[^>]*>Agile TroBo/.test(html), 'plus de texte « Agile TroBo » au-dessus du logo');
  assert.ok(html.includes('equilibre'), 'script d\'equilibrage des colonnes');
});

test('menu: trois onglets tricolores de meme taille; frappe a la premiere connexion seulement', () => {
  const h = page('.');
  for (const c of ['bleu', 'blanc', 'rouge']) assert.ok(h.includes(`onglet-li onglet-${c}`), `onglet ${c}`);
  const css = fs.readFileSync(path.join(ROOT, 'site/src/styles/global.css'), 'utf8');
  assert.ok(/.nav a.onglet { width: 112px/.test(css), 'onglets de meme largeur');
  assert.ok(h.includes('sans-frappe') && /location.pathname[^;]*!==/.test(h), 'frappe seulement sur la premiere page (accueil), une fois');
  assert.ok(h.includes('class="rang-une"') && h.indexOf('class="rang-tete"') < h.indexOf('>Politique<'), 'A la une en avant, Editos juste apres');
  assert.ok(!h.includes('href="/compteurs/"'), 'plus de lien vers Compteurs');
});

test('article: texte en une seule colonne, sur toute la largeur', () => {
  const css = fs.readFileSync(path.join(ROOT, 'site/src/styles/global.css'), 'utf8');
  assert.ok(!/.article .body {[^}]*column-(width|count)/.test(css), 'jamais de colonnes dans le texte des articles');
  assert.ok(css.includes('@media (max-width: 760px)'), 'regles pour petit ecran');
});

test('article: colonne de droite avec des renvois vers les autres articles', () => {
  const slug = fs.readdirSync(path.join(out, 'articles')).find((d) => d !== 'index.html');
  const html = fs.readFileSync(path.join(out, 'articles', slug, 'index.html'), 'utf8');
  assert.ok(html.includes('class="cote-rc"') && html.indexOf('cote-rc') < html.indexOf('À lire aussi'), 'encart Rencontres en haut de la colonne');
  assert.ok(html.indexOf('class="tags"') > html.indexOf('class="meta"') && html.indexOf('class="tags"') < html.indexOf('id="share-top"'), 'mots-cles entre la date et Partager');
  assert.ok(html.includes('cote-suit'), 'seul À lire aussi suit la lecture');
  assert.ok(html.includes('class="article-grille"') && html.includes('class="cote"'), 'colonne laterale');
  assert.ok(/class="cote-bloc"[^>]*>s*<h2[^>]*>À lire aussi/.test(html) || html.includes('À lire aussi'), 'renvois');
});

test('en-tete: heure et decomptes avant la presidentielle et avant Noel', () => {
  const h = page('.');
  assert.ok(/J-[0-9]+ avant la présidentielle/.test(h) && /J-[0-9]+ avant Noël/.test(h), 'decomptes sous le logo');
  assert.ok(h.includes('id="clock"'), 'heure');
});

test('petites annonces et rencontres: ordre different chaque jour, stable dans la journee', async () => {
  const { melangeDuJour } = await import('../../site/src/lib/melange.js');
  const l = Array.from({ length: 40 }, (_, i) => i);
  const j1 = melangeDuJour(l, 'x', '2026-10-26');
  assert.deepEqual(j1, melangeDuJour(l, 'x', '2026-10-26'), 'stable pendant la journee');
  assert.notDeepEqual(j1, melangeDuJour(l, 'x', '2026-10-27'), 'change le lendemain');
  assert.deepEqual([...j1].sort((x, y) => x - y), l, 'aucune annonce perdue ni dupliquee');
  assert.notDeepEqual(j1, l, 'ordre mele');
});

test('mobile: barre du bas (entrees rapides + Menu aux trois traits) qui ouvre le menu complet', () => {
  const h = page('.');
  assert.ok(h.includes('class="barre-bas"') && h.includes('id="barre-menu"') && h.includes('aria-controls="nav-principal"') && h.includes('id="nav-principal"'), 'barre du bas et menu complet');
  const css = fs.readFileSync(path.join(ROOT, 'site/src/styles/global.css'), 'utf8');
  assert.ok(/.barre-bas { display: none; }/.test(css) && /.consent { bottom: 66px; }/.test(css), 'barre cachee hors mobile; bandeau cookies au-dessus');
});

test('Caricatures: page du dessin du jour, entree de menu, plan du site', () => {
  const h = page('caricatures');
  assert.ok(h.includes('Le dessin du jour'), 'page caricatures');
  assert.ok(page('.').includes('>Caricatures<'), 'entree de menu');
  assert.ok(page('plan-du-site').includes('caricatures/'), 'plan du site');
});

test('Pierre Fusain, dessinateur: fiche, annonce de Rencontres liee, signature du dessin du jour', () => {
  const r = page('redaction');
  assert.ok(r.includes('Pierre Fusain</strong>, 57 ans') && r.includes('Le dessinateur'), 'fiche');
  assert.ok(r.includes('rencontres/#ref-f5-231n'), 'lien vers son annonce');
  const rc = page('rencontres');
  assert.ok(rc.includes('F5-231N') && rc.includes('id="ref-f5-231n"'), 'annonce de Rencontres');
  assert.ok(page('caricatures').includes('redaction/#pierre-fusain'), 'signature du dessin du jour');
});

test('accueil: l edito et le dessin du jour cote a cote, lien vers Caricatures; pas sur les autres pages', () => {
  const h = page('.');
  assert.ok(h.includes('une-duo') && h.includes('cari-une') && h.includes('Le monde au bord du formulaire'), 'dessin du jour a la une');
  assert.ok(h.indexOf('id="mm-etiquette"') > 0 && h.indexOf('id="mm-etiquette"') < h.indexOf('id="cari-une-etiquette"'), 'edito puis dessin');
  assert.ok(/href="[^"]*caricatures\/"/.test(h), 'renvoi vers la page Caricatures');
  assert.ok(!page('rubrique/sport').includes('id="cari-une-etiquette"'), 'seulement a la une');
  assert.ok(page('caricatures').includes('Le monde au bord du formulaire'), 'la page Caricatures montre le dessin');
});

test.after(() => fs.rmSync(out, { recursive: true, force: true }));
