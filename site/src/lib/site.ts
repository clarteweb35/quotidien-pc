import { getCollection, type CollectionEntry } from 'astro:content';
import categoriesFile from '../../../config/categories.json';
import editorial from '../../../config/editorial.json';

export type Article = CollectionEntry<'articles'>;
export const categories = categoriesFile.categories as { slug: string; name: string; description: string; color: string }[];
export const siteName: string = editorial.publicationName;
export const satireNotice: string = editorial.satireNotice;
export const manualImageCredit: string = editorial.manualImageCredit;
export const tagline: string = editorial.tagline;
export const logoName = editorial.logoName as { main: string; sub: string };

/** Construit une URL interne en respectant la base du site (domaine personnalisé ou sous-chemin GitHub Pages). */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export function category(slug: string) {
  return categories.find((c) => c.slug === slug) ?? { slug, name: slug, description: '', color: '#555' };
}

export async function allArticles(): Promise<Article[]> {
  const list = await getCollection('articles');
  return list.sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...opts });
export const formatDate = (d: Date) => fmt({ dateStyle: 'long' }).format(d);
export const formatDateTime = (d: Date) => fmt({ dateStyle: 'long', timeStyle: 'short' }).format(d);
export const readingMinutes = (body = '') => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200));
