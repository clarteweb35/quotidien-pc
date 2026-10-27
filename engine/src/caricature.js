import fs from 'node:fs';
import path from 'node:path';
import { zonedParts, hhmmToMinutes, normalizeText } from './util.js';
import { collect } from './collector.js';
import { pickNewsTopic } from './topics.js';
import { illustrate, checkImagePrompt } from './images.js';
import { protectedAliases } from './validator.js';

/**
 * « Le dessin du jour »: une caricature par jour inspiree d'un fait d'actualite mondiale.
 * Memes garde-fous que les illustrations: personnages generiques (jamais une personne reelle), aucun texte dans l'image,
 * relecture de l'image par le modele de relecture. Un echec n'a aucune consequence sur les articles.
 */

export const MAX_ESSAIS = 3;

export const caricatureSchema = {
  type: 'object',
  properties: {
    titre: { type: 'string', description: 'titre court du dessin, drole' },
    legende: { type: 'string', description: "legende satirique d'une phrase, sans citation attribuee a une personne" },
    scene: { type: 'string', description: 'description visuelle de la scene a dessiner, 400 caracteres maximum, sans texte ecrit, personnages generiques' },
    alt: { type: 'string', description: 'texte alternatif decrivant le dessin, 150 caracteres maximum' },
  },
  required: ['titre', 'legende', 'scene', 'alt'],
};

const SYSTEM = `Tu es le dessinateur de presse du « Quotidien Presque Certain », journal satirique français. Chaque jour tu imagines UN dessin de presse caricatural à partir d'un fait d'actualité mondiale.
Règles absolues : ta scène met en jeu des personnages GÉNÉRIQUES (un ministre en costume, un robot, un pigeon, une foule de petites silhouettes) : jamais une personne réelle, jamais son nom, jamais sa ressemblance. Pas de texte écrit dans l'image, pas de logo, pas de drapeau détaillé, pas de photo. Aucun sujet de drame, de violence ou de mort : tu te moques de l'absurdité des situations, jamais des victimes. La légende est une seule phrase satirique, sans citation attribuée à qui que ce soit et sans nom de personne.
Tu réponds uniquement selon le schéma JSON.`;

/** Coupe proprement (au dernier mot) un texte trop long: le modele depasse parfois les limites, ce n'est pas un motif de refus. */
function coupe(texte, max) {
  const t = String(texte ?? '').trim();
  if (t.length <= max) return t;
  const c = t.slice(0, max - 1);
  const i = c.lastIndexOf(' ');
  return `${(i > max * 0.6 ? c.slice(0, i) : c).replace(/[,;:s]+$/, '')}…`;
}

function verifier(d, topic, cfg) {
  const c = cfg.engine.caricature;
  const titre = String(d.titre ?? '').trim();
  const legende = String(d.legende ?? '').trim();
  if (titre.length < 8 || titre.length > 90) return 'titre_longueur';
  if (legende.length < 20 || legende.length > c.legendeMaxChars) return 'legende_longueur';
  if (/https?:\/\/|<|>/.test(`${titre} ${legende}`)) return 'markup';
  const n = ` ${normalizeText(`${titre} ${legende}`)} `;
  if (protectedAliases(topic, cfg.safety).filter((a) => a.length >= 4).some((a) => n.includes(` ${a} `))) return 'personne_reelle_dans_le_texte';
  return checkImagePrompt({ image_prompt: d.scene, image_alt: d.alt }, topic, cfg);
}

/**
 * Tente la caricature du jour si l'heure est venue et si elle n'est pas deja parue. Ne leve jamais d'erreur.
 * @returns {Promise<{published:boolean, reason?:string}|null>} null = rien a faire
 */
export async function runCaricature(ctx, items = null, { force = false } = {}) {
  const { cfg, store, logger, client, paths } = ctx;
  const c = cfg.engine.caricature;
  if (!c?.enabled || !cfg.engine.images?.enabled || cfg.control.paused) return null;
  const now = ctx.now();
  const { date, minutes } = zonedParts(now, cfg.schedule.timezone);
  const depart = hhmmToMinutes(c.at);
  if (!force && (minutes < depart || minutes - depart > c.catchupMinutes)) return null; // force: lancement manuel, hors horaire
  store.state.caricatures ??= {};
  const prev = store.state.caricatures[date];
  if (prev?.status === 'published' || (!force && (prev?.attempts ?? 0) >= MAX_ESSAIS)) return null;
  const marque = (patch) => { store.state.caricatures[date] = { ...store.state.caricatures[date], ...patch }; store.save(); };
  marque({ status: 'in_progress', attempts: (prev?.attempts ?? 0) + 1 });

  try {
    items ??= await collect({ cfg, logger, now: ctx.now, fetcher: ctx.fetcher });
    const { topic } = pickNewsTopic({ items, store, publishedTitles: [], cfg, now, categoryCountsToday: {}, onlyCategory: c.category });
    if (!topic) { marque({ status: 'failed', lastError: 'aucun_sujet' }); logger.warn('caricature.no_topic', { date }); return { published: false, reason: 'aucun_sujet' }; }

    const { data } = await client.generateJson({
      purpose: 'caricature',
      model: cfg.engine.gemini.generatorModel,
      system: SYSTEM,
      prompt: `Fait d'actualité mondiale du jour : « ${topic.title} ». ${topic.summary ?? ''}\nImagine le dessin du jour.`,
      schema: caricatureSchema,
      params: { temperature: 1, maxOutputTokens: 1024 },
    });
    data.scene = coupe(data.scene, cfg.engine.images.promptMaxChars);
    data.alt = coupe(data.alt, 160);
    const refus = verifier(data, topic, cfg);
    if (refus) { marque({ status: 'failed', lastError: refus }); logger.warn('caricature.refused', { date, reason: refus }); return { published: false, reason: refus }; }

    const cfgImage = { ...cfg, engine: { ...cfg.engine, images: { ...cfg.engine.images, styleGuide: c.styleGuide, credit: c.credit } } };
    const image = await illustrate({ client, cfg: cfgImage, article: { title: data.titre, image_prompt: data.scene, image_alt: data.alt }, topic, logger, slotKey: `caricature#${date}` });
    if (!image) { marque({ status: 'failed', lastError: 'image_indisponible' }); return { published: false, reason: 'image_indisponible' }; }

    const siteRoot = paths.siteRoot ?? path.join(paths.root, 'site');
    const rel = `images/caricatures/${date}.webp`;
    const fichierImage = ctx.dryRun ? path.join(paths.data, 'dry-run', rel) : path.join(siteRoot, 'public', rel);
    fs.mkdirSync(path.dirname(fichierImage), { recursive: true });
    fs.writeFileSync(fichierImage, image.buffer);
    const fichierJson = ctx.dryRun ? path.join(paths.data, 'dry-run', 'caricatures.json') : path.join(siteRoot, 'src', 'data', 'caricatures.json');
    fs.mkdirSync(path.dirname(fichierJson), { recursive: true });
    const liste = fs.existsSync(fichierJson) ? JSON.parse(fs.readFileSync(fichierJson, 'utf8')) : [];
    const entree = { date, titre: data.titre.trim(), legende: data.legende.trim(), alt: image.alt, image: rel, credit: image.credit, publishedAt: now.toISOString(), source: { name: topic.sourceName ?? '', title: topic.title, url: topic.url ?? '' } };
    fs.writeFileSync(fichierJson, JSON.stringify([entree, ...liste.filter((e) => e.date !== date)], null, 2) + '\n');
    store.markTopic(topic.id, { title: topic.title, url: topic.url, category: topic.category, seenAt: now.toISOString(), status: 'used', usedAt: now.toISOString() });
    marque({ status: 'published', lastError: null });
    logger.info('caricature.ok', { date, titre: entree.titre });
    return { published: true };
  } catch (err) {
    marque({ status: 'failed', lastError: `${err.name}: ${String(err.message).slice(0, 200)}` });
    logger.warn('caricature.error', { date, error: String(err.message).slice(0, 200) });
    return { published: false, reason: 'erreur' };
  }
}
