import data from '../../../config/annonces.json';

export interface Annonce {
  id: string; cat: string; format: 'classique' | 'court' | 'vedette' | 'encart'; ref: string;
  titre: string; accroche?: string; prix?: string; texte: string; conditions?: string;
  annonceur?: string; image?: string; imageAlt?: string;
  reel?: boolean; url?: string; site?: string; lien?: string; // vraie annonce: renvoie vers un vrai site
}
export interface Annonceur { id: string; nom: string; slogan?: string; palette: string }

export const rubrique = { titre: data.titre, accroche: data.accroche, intro: data.intro, mention: data.mention, mentionReelle: data.mentionReelle };
export const categoriesAnnonces = data.categories as { slug: string; name: string }[];
export const annonceurs = new Map((data.annonceurs as Annonceur[]).map((a) => [a.id, a]));
export const annonces = data.annonces as Annonce[];

/** Libelle de la categorie d'une annonce (badge). */
export const nomCategorie = (slug: string) => categoriesAnnonces.find((c) => c.slug === slug)?.name ?? slug;
