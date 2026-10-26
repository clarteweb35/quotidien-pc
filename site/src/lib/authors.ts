import fs from 'node:fs';
import path from 'node:path';
import journalistsFile from '../../../config/journalists.json';
import { categories } from './site';

export interface Journalist { name: string; desk: string; active: boolean; beat: string; bio: string; age?: number }
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

/** Personnel hors signatures (secrétariat...): affiche sur la page redaction, jamais utilise par le moteur. */
export const support = (journalistsFile as { support?: { name: string; section: string; role: string; bio: string }[] }).support ?? [];

/** Portrait (fictif, genere par IA) de la redaction: public/redaction/<slug>.webp, sinon null. */
export function portrait(name: string): string | null {
  const file = `${authorSlug(name)}.webp`;
  return fs.existsSync(path.resolve('public', 'redaction', file)) ? `redaction/${file}` : null;
}

/** Photo (fictive, generee par IA) du bureau de chaque service: public/redaction/bureaux/<nom>.webp. */
export const bureauByDesk: Record<string, string> = {
  politique: 'politique', tech: 'tech', economie: 'economie', societe: 'societe-culture', culture: 'societe-culture', sport: 'sport', monde: 'monde',
};
/** Bureau de Lucas, montre dans « Coulisses ». */
export const lucasBureau = { alt: "Un minuscule bureau sous un escalier, entouré de piles de cartons d'archives et d'une mer de tasses" };

/** Heure de prise de vue de chaque photo de bureau (16 h 53 pour la premiere, une minute de plus a chaque photo, 17 h 02 pour la derniere). */
export const bureauTime: Record<string, string> = {
  politique: '16 h 53', economie: '16 h 54', 'societe-culture': '16 h 55', tech: '16 h 56', monde: '16 h 57', sport: '16 h 58',
  secretariat: '16 h 59', lucas: '17 h 02',
};
export const shotCaption = (file: string) => `Photographie prise à ${bureauTime[file]} : les bureaux étaient vides.`;
