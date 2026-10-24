/** Schemas JSON envoyes a Gemini (sortie structuree) et validation stricte cote moteur. */

export const QUALITY_KEYS = ['facts_verified', 'fiction_clearly_satirical', 'no_invented_quotes', 'no_personal_attack', 'original_angle', 'no_known_duplicate'];

export function articleSchema(categorySlugs) {
  return {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['ready_for_review', 'rejected'] },
      rejection_reason: { type: 'string' },
      title: { type: 'string' },
      chapo: { type: 'string' },
      category: { type: 'string', enum: categorySlugs },
      tags: { type: 'array', items: { type: 'string' } },
      seo_description: { type: 'string' },
      angle: { type: 'string', description: 'angle humoristique retenu, en une phrase' },
      fictional_elements: { type: 'array', items: { type: 'string' } },
      quality_checks: {
        type: 'object',
        properties: Object.fromEntries(QUALITY_KEYS.map((k) => [k, { type: 'boolean' }])),
        required: QUALITY_KEYS,
      },
      body: {
        type: 'array',
        items: {
          type: 'object',
          properties: { kind: { type: 'string', enum: ['p', 'h2'] }, text: { type: 'string' } },
          required: ['kind', 'text'],
        },
      },
    },
    required: ['status', 'rejection_reason', 'title', 'chapo', 'category', 'tags', 'seo_description', 'angle', 'fictional_elements', 'quality_checks', 'body'],
  };
}

export const judgeSchema = {
  type: 'object',
  properties: {
    humor: { type: 'integer', minimum: 0, maximum: 10 },
    coherence: { type: 'integer', minimum: 0, maximum: 10 },
    risk: { type: 'integer', minimum: 0, maximum: 10 },
    problems: { type: 'array', items: { type: 'string' } },
    real_person_quote: { type: 'boolean', description: 'une citation inventee est attribuee a une personne reelle' },
    defamation_risk: { type: 'boolean', description: 'accusation precise contre une personne ou entite reelle' },
  },
  required: ['humor', 'coherence', 'risk', 'problems', 'real_person_quote', 'defamation_risk'],
};

/** Validation de forme stricte de la reponse de generation. Retourne la liste des erreurs. */
export function checkArticleShape(a, categorySlugs) {
  const errs = [];
  if (!a || typeof a !== 'object' || Array.isArray(a)) return ['reponse_non_objet'];
  const str = (k) => typeof a[k] === 'string';
  if (!['ready_for_review', 'rejected'].includes(a.status)) errs.push('champ_status_invalide');
  if (a.status === 'rejected') return errs; // un rejet n'a pas besoin du reste
  for (const k of ['title', 'chapo', 'category', 'seo_description', 'angle']) if (!str(k)) errs.push(`champ_manquant:${k}`);
  if (str('category') && !categorySlugs.includes(a.category)) errs.push('categorie_inconnue');
  if (!Array.isArray(a.fictional_elements)) errs.push('elements_fictifs_manquants');
  if (!a.quality_checks || QUALITY_KEYS.some((k) => typeof a.quality_checks[k] !== 'boolean')) errs.push('controles_qualite_manquants');
  if (!Array.isArray(a.tags) || a.tags.some((t) => typeof t !== 'string')) errs.push('tags_invalides');
  if (!Array.isArray(a.body) || a.body.length === 0) errs.push('corps_vide');
  else if (a.body.some((b) => !b || !['p', 'h2'].includes(b.kind) || typeof b.text !== 'string')) errs.push('corps_structure_invalide');
  return errs;
}

export function checkJudgeShape(j) {
  if (!j || typeof j !== 'object') return false;
  return ['humor', 'coherence', 'risk'].every((k) => Number.isFinite(j[k]) && j[k] >= 0 && j[k] <= 10) && Array.isArray(j.problems);
}
