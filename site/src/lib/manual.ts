import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import { refOf } from './ref';
import { url, siteName, type Article } from './site';

// Images deposees a la main dans src/assets/manual/, nommees exactement comme la reference de l'article (ex. 261024-X1.jpg).
const files = import.meta.glob<ImageMetadata>('/src/assets/manual/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}', { eager: true, import: 'default' });
const byRef = new Map(
  Object.entries(files).map(([key, meta]) => [key.split('/').pop()!.replace(/\.[^.]+$/, '').toUpperCase(), { key, meta }]),
);

export function manualEntry(article: Article) {
  const ref = refOf(article.data);
  return ref ? byRef.get(ref.toUpperCase()) ?? null : null;
}

export interface Illustration { src: string; width: number; height: number; alt: string; credit: string; manualKey: string | null }

/** Illustration d'un article: image deposee a la main (prioritaire), sinon image generee par le moteur, sinon rien. */
export async function illustration(article: Article, width: number, manualCredit: string): Promise<Illustration | null> {
  const d = article.data;
  const alt = d.imageAlt ?? `Illustration : ${d.title}`;
  const manual = manualEntry(article);
  if (manual) {
    // Recadrage 16:9 au centre (une image portrait est coupee), sans jamais agrandir l'original.
    const w = Math.min(width, manual.meta.width);
    const h = Math.round((w * 9) / 16);
    const img = await getImage({ src: manual.meta, width: w, height: h, fit: 'cover', position: 'center', format: 'webp', quality: 80 });
    return { src: img.src, width: w, height: h, alt, credit: manualCredit, manualKey: manual.key };
  }
  if (d.image) return { src: url(d.image), width: 1280, height: 720, alt, credit: d.imageCredit ?? 'Illustration générée par IA', manualKey: null };
  return null;
}
