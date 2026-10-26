/** Melange deterministe d'une liste selon le jour (Europe/Paris): meme ordre toute la journee, ordre different le lendemain. */
export const jourParis = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);

export function melangeDuJour(items, sel = "", jour = jourParis()) {
  // graine = hash (FNV-1a) du jour et du sel; generateur mulberry32; melange de Fisher-Yates
  let h = 2166136261;
  for (const c of `${jour}|${sel}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let s = h >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
