import fs from 'node:fs';
import path from 'node:path';
import data from '../../../config/rencontres.json';

export interface Rencontre {
  ref: number; cat: string; profil: string; texte: string; recherche?: string; formule?: string;
  photo?: string; photoAlt?: string;
}

export const page = {
  titre: data.titre, titreSeo: data.titreSeo, descriptionSeo: data.descriptionSeo,
  intro: data.intro, chapeau: data.chapeau, mention: data.mention,
};
export const categories = data.categories as { slug: string; nom: string }[];
export const rencontres = data.annonces as Rencontre[];

/** « RÉF. 007 » : numero d'imprimerie sur trois chiffres, stable (jamais renumerote). */
export const refTexte = (n: number) => `RÉF. ${String(n).padStart(3, '0')}`;

/** Photo facultative: renvoie le chemin seulement si le fichier existe vraiment (sinon l'annonce s'affiche sans portrait). */
export function photoExistante(r: Rencontre): string | null {
  if (!r.photo) return null;
  return fs.existsSync(path.resolve('public', 'rencontres', r.photo)) ? `rencontres/${r.photo}` : null;
}

/** Annonces d'une categorie, par numero croissant; les categories vides ne sont pas affichees. */
export const parCategorie = categories
  .map((c) => ({ ...c, annonces: rencontres.filter((r) => r.cat === c.slug).sort((a, b) => a.ref - b.ref) }))
  .filter((c) => c.annonces.length > 0);
