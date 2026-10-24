import { normalizeText, titleSimilarity, bodySimilarity, wordCount, shingles } from './util.js';
import { checkArticleShape, QUALITY_KEYS } from './schema.js';
import { FAKE_TESTIMONY, journalistNamesIn } from './authors.js';

const CAP = '[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ\'’-]+';
const NAME_RE = new RegExp(`\\b${CAP}(?:[ \\u00a0]+(?:de |du |des |van |von |le |la )?${CAP})+`, 'gu');

export function bodyToText(body) {
  return body.map((b) => b.text).join('\n\n');
}

const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f​﻿]/g, '').replace(/[ \t]+/g, ' ').trim();

/** Nettoyage tolerant avant validation: espaces, doublons de tags, description SEO trop longue. */
export function normalizeArticle(a, cfg) {
  const v = cfg.engine.validation;
  const out = { ...a };
  for (const k of ['title', 'chapo', 'seo_description', 'angle', 'category', 'image_prompt', 'image_alt']) if (typeof out[k] === 'string') out[k] = clean(out[k]);
  if (Array.isArray(out.tags)) {
    out.tags = [...new Set(out.tags.map((t) => clean(t).toLowerCase()).filter((t) => t && t.length <= 30 && /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u.test(t)))].slice(0, v.maxTags);
  }
  if (Array.isArray(out.body)) out.body = out.body.map((b) => ({ ...b, text: clean(b.text) })).filter((b) => b.text);
  if (out.seo_description?.length > v.seoDescriptionMaxChars) {
    out.seo_description = out.seo_description.slice(0, v.seoDescriptionMaxChars - 1).replace(/\s+\S*$/, '') + '…';
  }
  return out;
}

/** Noms propres multi-mots (personnes, organisations) presents dans la source + noms proteges + alias (dernier mot). */
export function protectedAliases(topic, safety) {
  const names = new Set(safety.protectedNames ?? []);
  const src = `${topic?.title ?? ''}. ${topic?.summary ?? ''}`;
  for (const m of src.matchAll(NAME_RE)) names.add(m[0].trim());
  const aliases = new Set();
  for (const n of names) {
    aliases.add(normalizeText(n));
    const parts = n.split(/\s+/);
    const last = parts[parts.length - 1];
    if (last.length >= 4) aliases.add(normalizeText(last));
  }
  return [...aliases].filter(Boolean);
}

function extractQuotes(text) {
  const out = [];
  const re = /«\s?([^»]{8,})\s?»|“([^”]{8,})”|"([^"]{8,})"/g;
  for (const m of text.matchAll(re)) {
    const inner = m[1] ?? m[2] ?? m[3];
    if (wordCount(inner) >= 3) out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function quotesNearNames(text, aliases) {
  const hits = new Set();
  for (const q of extractQuotes(text)) {
    const around = normalizeText(text.slice(Math.max(0, q.start - 140), q.start) + ' ' + text.slice(q.end, q.end + 140));
    for (const a of aliases) if (new RegExp(`(?:^| )${a}(?: |$)`).test(around)) hits.add(a);
  }
  return [...hits];
}

const FR_COMMON = new Set('le la les un une des du de et est que qui dans pour sur avec pas plus au aux ce cette nous vous ils elles son sa ses leur mais ou donc'.split(' '));

/**
 * Controles deterministes. Retourne { ok, issues:[{code,msg}] }.
 * `existing` = [{ id, title, text }] des articles deja publies (pour les doublons).
 */
export function validateArticle({ article, topic, cfg, existing = [], protectedExtra = [] }) {
  const v = cfg.engine.validation;
  const issues = [];
  const add = (code, msg) => issues.push({ code, msg });

  const shape = checkArticleShape(article, cfg.categories.map((c) => c.slug));
  if (shape.length) {
    shape.forEach((e) => add(`forme:${e}`, `Reponse non conforme au schema (${e})`));
    return { ok: false, issues };
  }

  // Auto-declarations du modele: un "false" honnete bloque; un "true" ne prouve rien (les controles ci-dessous restent seuls juges).
  const failedSelf = QUALITY_KEYS.filter((k) => article.quality_checks[k] === false);
  if (failedSelf.length) add('auto_controle_echoue', `Auto-controle du redacteur en echec: ${failedSelf.join(', ')}`);
  if (article.fictional_elements.length === 0 && topic?.kind !== 'evergreen') add('elements_fictifs_vides', 'Aucun element fictif declare: la nature satirique doit etre explicite');

  const text = bodyToText(article.body);
  const all = [article.title, article.chapo, article.seo_description, ...article.tags, text].join('\n');

  const len = (s, min, max, code, label) => {
    if (s.length < min) add(`${code}_trop_court`, `${label}: ${s.length} caracteres (minimum ${min})`);
    if (s.length > max) add(`${code}_trop_long`, `${label}: ${s.length} caracteres (maximum ${max})`);
  };
  len(article.title, v.titleMinChars, v.titleMaxChars, 'titre', 'Titre');
  len(article.chapo, v.chapoMinChars, v.chapoMaxChars, 'chapo', 'Chapo');
  if (!article.seo_description) add('seo_vide', 'Description SEO vide');
  if (article.tags.length === 0) add('tags_vides', 'Aucun tag');

  const words = wordCount(text);
  if (words < v.bodyMinWords) add('corps_trop_court', `Corps: ${words} mots (minimum ${v.bodyMinWords})`);
  if (words > v.bodyMaxWords) add('corps_trop_long', `Corps: ${words} mots (maximum ${v.bodyMaxWords})`);
  const paras = article.body.filter((b) => b.kind === 'p');
  if (paras.length < 4) add('paragraphes_insuffisants', `${paras.length} paragraphes (minimum 4)`);
  if (paras.some((p) => wordCount(p.text) < 5)) add('paragraphe_vide_ou_minuscule', 'Paragraphe de moins de 5 mots');
  if (new Set(paras.map((p) => normalizeText(p.text))).size < paras.length) add('paragraphes_repetes', 'Paragraphes identiques');
  const ws = normalizeText(text).split(' ').filter(Boolean);
  if (ws.length && new Set(ws).size / ws.length < 0.35) add('texte_repetitif', 'Vocabulaire trop repetitif');
  const frRatio = ws.filter((w) => FR_COMMON.has(w)).length / Math.max(ws.length, 1);
  if (frRatio < 0.12) add('langue_suspecte', 'Le texte ne semble pas etre du francais');
  if (!/[.!?…»)"”]$/.test(article.body[article.body.length - 1].text)) add('texte_tronque', 'Le dernier paragraphe semble coupe');
  if (/lorem ipsum|\[\.\.\.\]|\btodo\b|\{\{|\}\}|\bundefined\b|\bnull\b/i.test(all)) add('texte_parasite', 'Marque de gabarit ou texte parasite');

  // Securite du contenu: texte brut uniquement.
  if (/<\/?[a-z!][^>]*>|&lt;|&gt;|&#x?\d+;/i.test(all)) add('html_interdit', 'Balise HTML ou entite detectee');
  if (/https?:\/\/|www\.|\]\(|javascript:|data:text/i.test(all)) add('lien_interdit', 'Lien ou URL dans le texte');
  if (/(^|\n)\s*(#{1,6}\s|>\s|[-*]\s|\d+\.\s)|\*\*|__|`/.test(all)) add('markdown_interdit', 'Syntaxe Markdown detectee');
  for (const p of cfg.safety.blockedOutputPatterns) {
    if (new RegExp(p, 'iu').test(normalizeText(all)) || new RegExp(p, 'iu').test(all)) add('motif_interdit', `Motif interdit: ${p}`);
  }

  // La signature est un personnage fictif: elle ne figure pas dans le texte et n'a ni enquete ni rencontre de temoin.
  if (FAKE_TESTIMONY.test(all)) add('signature_temoignage_invente', 'Le texte pretend a une enquete, un envoye special ou un temoin rencontre: la signature est fictive, ne pas inventer de temoignage');
  const named = journalistNamesIn(text + ' ' + article.chapo, cfg);
  if (named.length) add('signature_dans_le_texte', `Nom de journaliste de la redaction cite dans le texte (${named.join(', ')}): ne pas les mettre en scene`);

  // Citations attribuees a des personnes reelles (noms issus de la source ou liste protegee).
  const aliases = [...protectedAliases(topic, cfg.safety), ...protectedExtra.map(normalizeText)];
  const quoted = quotesNearNames(text + '\n' + article.chapo, aliases);
  if (quoted.length) add('citation_personne_reelle', `Citation placee pres de ${quoted.join(', ')}: ne cite aucun propos a une personne reelle`);

  // Recopie de la source (on s'inspire, on ne reproduit pas).
  if (topic?.summary) {
    const srcSh = new Set(shingles(topic.summary, 7));
    if (shingles(text, 7).some((s) => srcSh.has(s))) add('copie_source', 'Passage recopie de la source');
  }

  // Articles satiriques lies a l'actualite: la source doit etre conservee.
  if (topic?.kind !== 'evergreen' && !/^https:\/\//.test(topic?.url ?? '')) add('source_manquante', 'Article lie a l\'actualite sans URL de source https');

  // Repetitions avec les articles existants.
  for (const e of existing) {
    const ts = titleSimilarity(article.title, e.title);
    if (ts >= v.titleSimilarityBlock) { add('titre_trop_proche', `Titre trop proche de "${e.title}" (${ts.toFixed(2)})`); break; }
  }
  for (const e of existing) {
    const bs = bodySimilarity(text, e.text);
    if (bs >= v.bodySimilarityBlock) { add('corps_trop_proche', `Corps trop proche de "${e.title}" (${bs.toFixed(2)})`); break; }
  }

  return { ok: issues.length === 0, issues };
}

/** Texte de retour envoye a Gemini lors de l'unique nouvelle tentative. */
export function feedbackFor(issues) {
  return issues.map((i) => `- ${i.msg}`).join('\n');
}
