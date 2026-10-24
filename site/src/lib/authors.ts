import journalistsFile from '../../../config/journalists.json';
import { categories } from './site';

export interface Journalist { name: string; desk: string; active: boolean; beat: string; bio: string }
export const journalists = journalistsFile.journalists as Journalist[];

export const authorSlug = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function journalist(name?: string): Journalist | null {
  return name ? journalists.find((j) => j.name === name) ?? null : null;
}

/** « Service politique », « Service tech & sciences »... */
export function deskLabel(slug: string): string {
  const c = categories.find((x) => x.slug === slug);
  return `Service ${(c?.name ?? slug).toLowerCase()}`;
}

/** Equipe active, rubrique par rubrique (le premier est le titulaire du service). */
export function roster() {
  return categories
    .map((c) => ({ cat: c, label: deskLabel(c.slug), people: journalists.filter((j) => j.active && j.desk === c.slug) }))
    .filter((d) => d.people.length);
}
