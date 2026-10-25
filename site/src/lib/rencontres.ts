import fs from 'node:fs';
import path from 'node:path';
import data from '../../../config/rencontres.json';

export interface Rencontre {
  ref: number | string; cat: string; profil: string; texte: string; recherche?: string; formule?: string;
  photo?: string; photoAlt?: string;
}

export const page = {
  titre: data.titre, titreSeo: data.titreSeo, descriptionSeo: data.descriptionSeo,
  intro: data.intro, chapeau: data.chapeau, mention: data.mention,
};
export const categories = data.categories as { slug: string; nom: string }[];
export const rencontres = data.annonces as Rencontre[];

/** « RÉF. 007 » (numeros d'imprimerie) ou « RÉF. K7-492B » (codes alphanumeriques bidon): la reference est stable et n'est jamais renumerotee. */
export const refTexte = (ref: number | string) => `RÉF. ${typeof ref === 'number' ? String(ref).padStart(3, '0') : ref}`;

/** Identifiant d'ancre stable: #ref-001 ou #ref-k7-492b. */
export const ancreRef = (ref: number | string) => `ref-${typeof ref === 'number' ? String(ref).padStart(3, '0') : ref.toLowerCase()}`;

/** Photo facultative: renvoie le chemin seulement si le fichier existe vraiment (sinon l'annonce s'affiche sans portrait). */
export function photoExistante(r: Rencontre): string | null {
  if (!r.photo) return null;
  return fs.existsSync(path.resolve('public', 'rencontres', r.photo)) ? `rencontres/${r.photo}` : null;
}

/** Annonces d'une categorie, dans l'ordre du fichier; les categories vides ne sont pas affichees. */
export const parCategorie = categories
  .map((c) => ({ ...c, annonces: rencontres.filter((r) => r.cat === c.slug) })) // ordre du fichier
  .filter((c) => c.annonces.length > 0);
