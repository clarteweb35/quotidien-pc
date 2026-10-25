import promosFile from '../../../config/promos.json';

export interface Promo { id: string; enabled: boolean; title: string; text: string; cta: string; url: string; placements: string[] }

export const promoLabel: string = promosFile.label;
const all = promosFile.promos as Promo[];

/** Encarts actifs pour un emplacement (vide si la fonction est coupee). */
export function activePromos(placement: 'home' | 'article'): Promo[] {
  if (!promosFile.enabled) return [];
  return all.filter((p) => p.enabled && p.placements.includes(placement) && /^https:\/\//.test(p.url));
}

/** Vrai si au moins un encart peut s'afficher quelque part (pour les mentions legales). */
export const promosActive: boolean = promosFile.enabled && all.some((p) => p.enabled);

/** Choix deterministe (site statique): une meme page affiche toujours le meme encart pour un meme build. */
export function pickPromo(placement: 'home' | 'article', seed: string): Promo | null {
  const list = activePromos(placement);
  if (!list.length) return null;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
