import { zonedParts, hhmmToMinutes } from './util.js';

export const MAX_ATTEMPTS_PER_SLOT = 3;

/**
 * Creneaux a traiter maintenant, du plus ancien au plus recent.
 * Un creneau est du s'il est passe, dans la fenetre de rattrapage, non publie et pas epuise.
 * Le nombre de publications du jour est plafonne par maxPerDay (jamais de rattrapage au-dela).
 */
export function dueSlots({ now, schedule, store, force = false }) {
  const { date, minutes } = zonedParts(now, schedule.timezone);
  const remainingToday = schedule.maxPerDay - store.publishedCount(date);
  if (remainingToday <= 0) return { date, due: [], remainingToday: 0 };
  const due = [];
  schedule.slots.forEach((hhmm, idx) => {
    const start = hhmmToMinutes(hhmm);
    const s = store.slot(date, idx);
    if (s && (s.status === 'published' || s.status === 'abandoned')) return;
    if ((s?.attempts ?? 0) >= MAX_ATTEMPTS_PER_SLOT) return;
    if (minutes < start) return;
    if (!force && minutes - start > schedule.catchupMinutes) return;
    due.push({ idx, hhmm, key: `${date}#${idx}`, lateByMin: minutes - start });
  });
  due.sort((a, b) => b.lateByMin - a.lateByMin);
  return { date, due: due.slice(0, Math.min(remainingToday, schedule.maxPublicationsPerRun)), remainingToday };
}

/** Marque comme abandonnes les creneaux dont la fenetre de rattrapage est depassee (pour le bilan). */
export function expireSlots({ now, schedule, store }) {
  const { date, minutes } = zonedParts(now, schedule.timezone);
  let n = 0;
  schedule.slots.forEach((hhmm, idx) => {
    const s = store.slot(date, idx);
    if (s?.status === 'published' || s?.status === 'abandoned') return;
    if (minutes - hhmmToMinutes(hhmm) > schedule.catchupMinutes) {
      store.setSlot(date, idx, { status: 'abandoned', lastError: s?.lastError ?? 'fenetre_de_rattrapage_depassee' });
      n++;
    }
  });
  return n;
}
