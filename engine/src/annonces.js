import fs from 'node:fs';
import path from 'node:path';
import { titleSimilarity } from './util.js';
import { compileKeywords, findSensitive } from './topics.js';
import { MalformedResponseError } from './gemini.js';

/**
 * Generation par lots des « Petites annonces » et des « Rencontres & affinites » (a la demande, jamais en continu).
 * Le modele ecrit le texte; le code decide de tout le reste: references, identifiants, categories valides, controles, doublons.
 * Les annonces generees portent "auto": true dans le JSON, pour pouvoir les retrouver, les relire ou les retirer.
 */

const PAR_APPEL = 8; // annonces demandees par appel (sortie JSON courte, moins de risque de coupure)
export const MAX_PAR_LOT = 24;

const URL_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:fr|com|net|org|io|eu)\b/i;
const MAIL_RE = /@/;
const TEL_RE = /(?:\+?\d{2}[\s.-]?)?\b0?\d(?:[\s.-]?\d{2}){4}\b/;
const FIN_RE = /[.!?…»)"”]$/;

export const TYPES = {
  petites: {
    fichier: 'annonces.json',
    etiquette: 'petites annonces',
    champsTitre: 'titre',
  },
  rencontres: {
    fichier: 'rencontres.json',
    etiquette: 'annonces de rencontres',
    champsTitre: 'profil',
  },
};

export function schemaPetites(categories, annonceurs) {
  return {
    type: 'object',
    properties: {
      annonces: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cat: { type: 'string', enum: categories },
            format: { type: 'string', enum: ['classique', 'court'] },
            titre: { type: 'string' },
            prix: { type: 'string' },
            texte: { type: 'string' },
            conditions: { type: 'string' },
            annonceur: { type: 'string', enum: ['', ...annonceurs] },
          },
          required: ['cat', 'format', 'titre', 'prix', 'texte', 'conditions', 'annonceur'],
        },
      },
    },
    required: ['annonces'],
  };
}

export function schemaRencontres(categories) {
  return {
    type: 'object',
    properties: {
      annonces: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cat: { type: 'string', enum: categories },
            profil: { type: 'string' },
            texte: { type: 'string' },
            recherche: { type: 'string' },
            formule: { type: 'string' },
          },
          required: ['cat', 'profil', 'texte', 'recherche', 'formule'],
        },
      },
    },
    required: ['annonces'],
  };
}

const lire = (dossier, fichier) => JSON.parse(fs.readFileSync(path.join(dossier, fichier), 'utf8'));

/** Consigne utilisateur: contexte, exemples reels, titres recents a ne pas refaire. */
export function promptAnnonces({ type, data, count, todayLabel, rng = Math.random }) {
  const exemples = data.annonces.filter((a) => !a.auto && !a.reel).sort(() => rng() - 0.5).slice(0, 3);
  const recents = data.annonces.slice(-40).map((a) => (type === 'petites' ? a.titre : a.profil));
  const lignes = [`Date du jour : ${todayLabel}.`, `Nombre d'annonces à écrire : ${count}.`, ''];
  lignes.push('CATÉGORIES AUTORISÉES (champ cat) :', ...data.categories.map((c) => `- ${c.slug} : ${c.nom ?? c.name}`), '');
  if (type === 'petites' && data.annonceurs?.length) {
    lignes.push('ANNONCEURS RÉCURRENTS (champ annonceur, ou chaîne vide) :', ...data.annonceurs.map((a) => `- ${a.id} : ${a.nom}${a.slogan ? ` (« ${a.slogan} »)` : ''}`), '');
  }
  lignes.push('EXEMPLES DU STYLE ATTENDU (donnée du système, ne pas recopier) :');
  for (const e of exemples) lignes.push(JSON.stringify(type === 'petites' ? { titre: e.titre, prix: e.prix ?? '', texte: e.texte, conditions: e.conditions ?? '' } : { profil: e.profil, texte: e.texte, recherche: e.recherche ?? '', formule: e.formule ?? '' }));
  lignes.push('', 'TITRES DÉJÀ PUBLIÉS (donnée du système : évite tout titre, idée ou ressort comique similaire) :', ...recents.map((t) => `- ${t}`));
  return lignes.join('\n');
}

function normalise(a, type) {
  const o = {};
  for (const [k, v] of Object.entries(a)) o[k] = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v;
  return o;
}

/** Controles deterministes d'une annonce generee. Retourne la liste des motifs de refus (vide = acceptee). */
export function controleAnnonce(a, { type, data, cfg, autres }) {
  const motifs = [];
  const slugs = new Set(data.categories.map((c) => c.slug));
  const titre = type === 'petites' ? a.titre : a.profil;
  const bornes = type === 'petites' ? { titre: [8, 110], texte: [40, 600] } : { titre: [15, 130], texte: [60, 700] };
  if (!slugs.has(a.cat)) motifs.push('categorie_inconnue');
  if (!titre || titre.length < bornes.titre[0] || titre.length > bornes.titre[1]) motifs.push('titre_longueur');
  if (!a.texte || a.texte.length < bornes.texte[0] || a.texte.length > bornes.texte[1]) motifs.push('texte_longueur');
  if (a.texte && !FIN_RE.test(a.texte)) motifs.push('texte_tronque');
  for (const [k, max] of [['prix', 40], ['conditions', 240], ['recherche', 220], ['formule', 170]]) {
    if (a[k] && a[k].length > max) motifs.push(`${k}_trop_long`);
  }
  const tout = [titre, a.texte, a.prix, a.conditions, a.recherche, a.formule].filter(Boolean).join(' \n ');
  if (URL_RE.test(tout)) motifs.push('lien_interdit');
  if (MAIL_RE.test(tout)) motifs.push('adresse_mail_interdite');
  if (TEL_RE.test(tout)) motifs.push('telephone_interdit');
  if (/<\/?[a-z!][^>]*>|&lt;|&gt;|&#x?\d+;/i.test(tout)) motifs.push('html_interdit');
  if (/lorem ipsum|\bundefined\b|\bnull\b|\{\{|\}\}/i.test(tout)) motifs.push('texte_parasite');
  for (const p of cfg.safety.blockedOutputPatterns ?? []) {
    try { if (new RegExp(p, 'iu').test(tout)) { motifs.push('motif_interdit'); break; } } catch { /* regex deja signalee par check-config */ }
  }
  if (findSensitive(tout, compileKeywords(cfg.safety.sensitiveTopicKeywords))) motifs.push('sujet_sensible');
  if (type === 'petites' && a.format === 'court' && a.texte && a.texte.length > 260) motifs.push('court_trop_long');
  // Doublons: contre l'existant et contre le reste du lot.
  const dejaVus = [...data.annonces.map((x) => (type === 'petites' ? x.titre : x.profil)), ...autres.map((x) => (type === 'petites' ? x.titre : x.profil))];
  if (dejaVus.some((t) => titleSimilarity(t, titre) >= 0.62)) motifs.push('titre_doublon');
  const textes = [...data.annonces.map((x) => x.texte), ...autres.map((x) => x.texte)];
  if (textes.some((t) => titleSimilarity(t, a.texte) >= 0.55)) motifs.push('texte_doublon');
  return motifs;
}

/** Reference alphanumerique bidon, unique (casse ignoree): « K7-492B ». */
export function nouvelleReference(prises, rng = Math.random) {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', D = '0123456789';
  const pick = (s) => s[Math.floor(rng() * s.length)];
  for (let i = 0; i < 200; i++) {
    const ref = `${pick(L)}${pick(D)}-${pick(D)}${pick(D)}${pick(D)}${pick(L)}`;
    if (!prises.has(ref.toLowerCase())) return ref;
  }
  throw new Error('Impossible de generer une reference unique');
}

function bloc(o) {
  const champs = Object.entries(o).filter(([, v]) => v !== undefined && v !== '');
  return '    {\n' + champs.map(([k, v], i) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < champs.length - 1 ? ',' : ''}`).join('\n') + '\n    }';
}

/** Ajoute des objets en fin de tableau "annonces" sans reformater le reste du fichier. */
export function ajouteAuFichier(chemin, objets) {
  const s = fs.readFileSync(chemin, 'utf8');
  const fin = '\n    }\n  ]\n}';
  const i = s.lastIndexOf(fin);
  if (i < 0) throw new Error(`Fin de fichier inattendue: ${chemin}`);
  fs.writeFileSync(chemin, s.slice(0, i) + '\n    },\n' + objets.map(bloc).join(',\n') + '\n  ]\n}\n', 'utf8');
  JSON.parse(fs.readFileSync(chemin, 'utf8')); // jamais un JSON casse dans le depot
}

/**
 * Genere `count` annonces du type donne. ctx = contexte du CLI (cfg, paths, client, logger, now, rng).
 * Retourne { ajoutees, refusees }. En mode a blanc (ctx.dryRun), n'ecrit rien.
 */
export async function genererAnnonces({ ctx, type, count }) {
  const def = TYPES[type];
  if (!def) throw new Error(`Type inconnu: ${type} (petites | rencontres)`);
  const { cfg, paths, client, logger } = ctx;
  const now = ctx.now();
  const rng = ctx.rng ?? Math.random;
  const chemin = path.join(paths.config, def.fichier);
  const total = Math.min(Math.max(1, Math.floor(count)), MAX_PAR_LOT);
  const systeme = fs.readFileSync(path.join(paths.config, 'prompts', 'annonces.md'), 'utf8');
  const todayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: cfg.schedule.timezone, dateStyle: 'full' }).format(now);
  const g = cfg.engine.gemini;
  const ajoutees = [];
  const refusees = [];

  for (let restant = total; restant > 0; ) {
    const data = lire(paths.config, def.fichier);
    const lot = Math.min(PAR_APPEL, restant);
    const cats = data.categories.map((c) => c.slug);
    const schema = type === 'petites' ? schemaPetites(cats, (data.annonceurs ?? []).map((a) => a.id)) : schemaRencontres(cats);
    let reponse;
    try {
      ({ data: reponse } = await client.generateJson({
        purpose: 'annonces',
        model: g.generatorModel,
        system: systeme,
        prompt: promptAnnonces({ type, data: { ...data, annonces: [...data.annonces, ...ajoutees] }, count: lot, todayLabel, rng }),
        schema,
        params: { ...g.generator, maxOutputTokens: Math.max(g.generator.maxOutputTokens, 6000) },
      }));
    } catch (err) {
      if (!(err instanceof MalformedResponseError)) throw err;
      logger.warn('annonces.malformed', { type, error: err.message });
      refusees.push({ motifs: ['reponse_malformee'] });
      break;
    }
    const brutes = Array.isArray(reponse?.annonces) ? reponse.annonces.map((a) => normalise(a, type)) : [];
    const retenues = [];
    for (const a of brutes) {
      const motifs = controleAnnonce(a, { type, data: { ...data, annonces: [...data.annonces, ...ajoutees] }, cfg, autres: retenues });
      if (motifs.length) { refusees.push({ titre: a.titre ?? a.profil, motifs }); continue; }
      retenues.push(a);
    }
    // Attribution des identifiants et references par le code, jamais par le modele.
    const prisesRef = new Set([...data.annonces, ...ajoutees].map((a) => String(a.ref).toLowerCase()));
    const nums = [...data.annonces, ...ajoutees].map((a) => Number(/^pa-(\d+)$/.exec(a.id ?? '')?.[1] ?? 0));
    let prochain = Math.max(0, ...nums) + 1;
    const objets = retenues.map((a) => {
      if (type === 'petites') {
        const id = `pa-${String(prochain).padStart(3, '0')}`;
        prochain++;
        return { id, cat: a.cat, format: a.format, ref: id.toUpperCase(), annonceur: a.annonceur || undefined, titre: a.titre, prix: a.prix, texte: a.texte, conditions: a.conditions, auto: true };
      }
      const ref = nouvelleReference(prisesRef, rng);
      prisesRef.add(ref.toLowerCase());
      return { ref, cat: a.cat, profil: a.profil, texte: a.texte, recherche: a.recherche, formule: a.formule, auto: true };
    });
    if (objets.length && !ctx.dryRun) ajouteAuFichier(chemin, objets);
    ajoutees.push(...objets);
    logger.info('annonces.lot', { type, demandees: lot, retenues: objets.length, refusees: brutes.length - objets.length });
    restant -= lot;
    if (!objets.length && brutes.length === 0) break; // rien d'exploitable: on n'insiste pas
  }
  return { ajoutees, refusees };
}
