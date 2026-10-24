import { normalizeText, titleSimilarity } from './util.js';

const TRIGGERS = [
  'annonce', 'rapport', 'reforme', 'lance', 'nouveau', 'nouvelle', 'record', 'etude', 'sondage', 'interdit', 'interdiction',
  'plan', 'comite', 'taxe', 'impot', 'appli', 'application', 'ia', 'intelligence artificielle', 'prix', 'hausse', 'baisse',
  'debat', 'polemique', 'proposition', 'projet de loi', 'commission', 'vote', 'sommet', 'festival', 'greve', 'canicule',
  'reseaux sociaux', 'algorithme', 'selon une etude', 'inflation', 'televisee', 'candidat',
];

/** Compile les mots-cles sensibles: "mot" (entier, pluriel accepte), "pref*" (prefixe), expressions multi-mots. */
export function compileKeywords(list) {
  return list.map((kw) => {
    const prefix = kw.endsWith('*');
    const core = normalizeText(prefix ? kw.slice(0, -1) : kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(prefix ? `(?:^|\\s)${core}` : `(?:^|\\s)${core}s?(?:\\s|$)`);
  });
}

export function findSensitive(text, compiled) {
  const n = ` ${normalizeText(text)} `.trim();
  const hit = compiled.find((re) => re.test(n));
  return hit ? hit.source : null;
}

export function scoreItem(item, { cfg, now, categoryCountsToday = {} }) {
  const ed = cfg.editorial;
  let score = 2;
  if (ed.priorityCategories.includes(item.category)) score += ed.priorityBoost ?? 1.5;
  if (item.publishedAt) {
    const ageH = (now.getTime() - Date.parse(item.publishedAt)) / 3600000;
    score += ageH < 6 ? 1.5 : ageH < 18 ? 1 : 0;
  }
  if (item.summary.length > 60) score += 0.5;
  const n = ` ${normalizeText(item.title + ' ' + item.summary)} `;
  score += Math.min(3, TRIGGERS.filter((t) => n.includes(` ${t} `)).length);
  if (item.title.length < 25) score -= 1;
  score -= 0.7 * (categoryCountsToday[item.category] ?? 0); // diversite des rubriques sur la journee
  return Math.round(score * 100) / 100;
}

/**
 * Choisit le meilleur sujet d'actualite non traite, non sensible et non redondant.
 * Retourne { topic, rejected } ; topic = null si rien de convenable.
 */
export function pickNewsTopic({ items, store, publishedTitles, cfg, now, categoryCountsToday }) {
  const t = cfg.engine.topics;
  const compiled = compileKeywords(cfg.safety.sensitiveTopicKeywords);
  const memoryMs = t.topicMemoryDays * 86400000;
  const usedTitles = Object.values(store.state.topics)
    .filter((x) => x.usedAt && now.getTime() - Date.parse(x.usedAt) < memoryMs)
    .map((x) => x.title);
  const rejected = [];
  const candidates = [];
  for (const it of items) {
    const known = store.topic(it.id);
    if (known?.usedAt || known?.status === 'excluded') continue;
    const sensitive = findSensitive(`${it.title} ${it.summary}`, compiled);
    if (sensitive) {
      store.markTopic(it.id, { title: it.title, url: it.url, category: it.category, seenAt: now.toISOString(), status: 'excluded', reason: 'sensitive' });
      rejected.push({ id: it.id, title: it.title, reason: 'sujet_sensible' });
      continue;
    }
    const near = [...usedTitles, ...publishedTitles].find((x) => titleSimilarity(x, it.title) >= t.dedupSimilarityThreshold);
    if (near) {
      rejected.push({ id: it.id, title: it.title, reason: 'doublon', near });
      continue;
    }
    const score = scoreItem(it, { cfg, now, categoryCountsToday });
    if (score < t.minRelevanceScore) {
      rejected.push({ id: it.id, title: it.title, reason: 'score_insuffisant', score });
      continue;
    }
    candidates.push({ ...it, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return { topic: candidates[0] ?? null, rejected };
}

/** Theme intemporel: jamais un evenement presente comme reel. Evite les themes recents. */
export function pickEvergreen({ store, cfg, now, categoryCountsToday = {}, rng = Math.random }) {
  const memoryMs = cfg.engine.topics.topicMemoryDays * 2 * 86400000;
  const available = cfg.evergreen.filter((e) => {
    const used = store.topic(e.id)?.usedAt;
    return !used || now.getTime() - Date.parse(used) > memoryMs;
  });
  if (!available.length) return null;
  const min = Math.min(...available.map((e) => categoryCountsToday[e.category] ?? 0));
  const pool = available.filter((e) => (categoryCountsToday[e.category] ?? 0) === min);
  const pick = pool[Math.floor(rng() * pool.length)];
  return { id: pick.id, kind: 'evergreen', title: pick.theme, summary: '', url: '', category: pick.category, sourceName: '', publishedAt: null, score: 0 };
}
