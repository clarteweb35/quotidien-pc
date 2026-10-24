import { normalizeText } from './util.js';

/** Journalistes actifs d'une rubrique, dans l'ordre du fichier (le premier est le titulaire du service). */
export function activeRoster(cfg, desk) {
  return (cfg.journalists ?? []).filter((j) => j.active && j.desk === desk);
}

export function deskLabel(cfg, desk) {
  const c = cfg.categories.find((x) => x.slug === desk);
  return `Service ${(c?.name ?? desk).toLowerCase()}`;
}

/**
 * Signature d'un article. Jamais tiree au hasard: le redacteur choisit parmi les journalistes de la rubrique selon le sujet;
 * si son choix est absent ou invalide, le titulaire du service signe. Retourne { name, chosenByModel } ou null.
 */
export function resolveAuthor({ proposed, category }, cfg) {
  const roster = activeRoster(cfg, category);
  if (!roster.length) return null;
  const match = roster.find((j) => normalizeText(j.name) === normalizeText(proposed ?? ''));
  return match ? { name: match.name, chosenByModel: true } : { name: roster[0].name, chosenByModel: false };
}

/** Bloc de consigne: l'equipe (fictive) par rubrique, avec specialites. */
export function rosterPrompt(cfg) {
  const lines = ['ÉQUIPE RÉDACTIONNELLE (journalistes fictifs). Dans `author`, écris exactement le nom d\'un journaliste du service de la rubrique que tu retiens, celui dont la spécialité correspond le mieux au sujet ; en cas de doute, le premier de la liste :'];
  for (const c of cfg.categories) {
    const r = activeRoster(cfg, c.slug);
    if (r.length) lines.push(`- ${c.slug} : ${r.map((j) => `${j.name} (${j.beat})`).join(' ; ')}`);
  }
  return lines.join('\n');
}

/** Un article ne doit pas pretendre que la signature a enquete, rencontre un temoin ou ete sur place: elle est fictive. */
export const FAKE_TESTIMONY = /notre (envoy[eé]e?|reporter|correspondante?)( sp[eé]ciale?| sur place)|nous avons (rencontr[eé]|interrog[eé]|enqu[eê]t[eé])|(notre|nos) (enqu[eê]te|reporters?) (a |ont )?(r[eé]v[eé]l|constat)/i;

/** Noms de journalistes (actifs) apparaissant dans un texte. */
export function journalistNamesIn(text, cfg) {
  const n = ` ${normalizeText(text)} `;
  return (cfg.journalists ?? []).filter((j) => j.active && n.includes(` ${normalizeText(j.name)} `)).map((j) => j.name);
}
