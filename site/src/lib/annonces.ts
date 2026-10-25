import data from '../../../config/annonces.json';

export interface Annonce {
  id: string; cat: string; format: 'classique' | 'court' | 'vedette' | 'encart'; ref: string;
  titre: string; accroche?: string; prix?: string; texte: string; conditions?: string;
  annonceur?: string; image?: string; imageAlt?: string; imageType?: 'portrait';
  reel?: boolean; url?: string; site?: string; lien?: string; // vraie annonce: renvoie vers un vrai site
}
export interface Annonceur { id: string; nom: string; slogan?: string; palette: string; logo?: string }

export interface Partenaire {
  nom: string; mention: string; slogan: string; texte: string; details: { label: string; texte: string }[];
  citation: string; auteur: string; image: string; imageAlt: string; lien: string; lienTexte: string;
}
export const partenaire = (data as { partenaire?: Partenaire }).partenaire ?? null;

export const rubrique = { titre: data.titre, accroche: data.accroche, intro: data.intro, mention: data.mention, mentionReelle: data.mentionReelle };
export const categoriesAnnonces = data.categories as { slug: string; name: string }[];
export const annonceurs = new Map((data.annonceurs as Annonceur[]).map((a) => [a.id, a]));
export const annonces = data.annonces as Annonce[];

/** Libelle de la categorie d'une annonce (badge). */
export const nomCategorie = (slug: string) => categoriesAnnonces.find((c) => c.slug === slug)?.name ?? slug;
