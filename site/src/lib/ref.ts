/** Reference courte d'un article (AAMMJJ-NN), derivee du creneau. Meme logique que engine/src/refs.js. */
export function refFromSlot(slot?: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})#(.+)$/.exec(slot ?? '');
  if (!m) return null;
  const idx = m[4];
  const tail = /^\d+$/.test(idx) ? String(Number(idx) + 1).padStart(2, '0') : idx.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
  return `${m[1].slice(2)}${m[2]}${m[3]}-${tail}`;
}

export const refOf = (d: { ref?: string; slot?: string }): string | null => d.ref ?? refFromSlot(d.slot);
