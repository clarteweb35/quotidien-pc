import data from '../../../config/annonces.json';

export interface Annonce {
  id: string; cat: string; format: 'classique' | 'court' | 'vedette' | 'encart'; ref: string;
  titre: string; accroche?: string; prix?: string; texte: string; conditions?: string;
  annonceur?: string; image?: string; imageAlt?: string; imageType?: 'portrait';
  solde?: boolean; // titre affiche « façon soldes »: rouge, gras, defilant
  pub?: boolean; // annonce reutilisable comme publicite fictive dans les articles
  reel?: boolean; url?: string; site?: string; lien?: string; // vraie annonce: renvoie vers un vrai site
}
export interface Annonceur { id: string; nom: string; slogan?: string; palette: string; logo?: string; legende?: boolean /* logo + nom en legende dessous, sans le nom en en-tete */ }

export interface Partenaire {
  nom: string; mention: string; slogan: string; texte: string; details: { label: string; texte: string }[];
  citation: string; auteur: string; image: string; imageAlt: string; lien?: string; lienTexte?: string;
}
export const partenaire = (data as { partenaire?: Partenaire }).partenaire ?? null;

export const manchetteRencontres = (data as { manchetteRencontres?: { texte: string; lienTexte: string; lien: string; image: string; imageAlt: string } }).manchetteRencontres ?? null;

export const rubrique = { titre: data.titre, accroche: data.accroche, intro: data.intro, mention: data.mention, mentionReelle: data.mentionReelle };
export const categoriesAnnonces = data.categories as { slug: string; name: string }[];
export const annonceurs = new Map((data.annonceurs as Annonceur[]).map((a) => [a.id, a]));
export const annonces = data.annonces as Annonce[];

/** Libelle de la categorie d'une annonce (badge). */
export const nomCategorie = (slug: string) => categoriesAnnonces.find((c) => c.slug === slug)?.name ?? slug;

/** Publicites fictives (annonces marquees "pub", hors vraies annonces), sous une forme compacte pour le tirage au sort a chaque chargement. */
export interface PubCompacte { id: string; marque: string; logo: string; legende: boolean; solde: boolean; titre: string; accroche: string; prix: string; texte: string; conditions: string }
export const pubsCompactes: PubCompacte[] = annonces.filter((a) => a.pub && !a.reel).map((a) => {
  const ann = a.annonceur ? annonceurs.get(a.annonceur) : undefined;
  return { id: a.id, marque: ann?.nom ?? '', logo: ann?.logo ?? '', legende: !!ann?.legende, solde: !!a.solde, titre: a.titre, accroche: a.accroche ?? '', prix: a.prix ?? '', texte: a.texte, conditions: a.conditions ?? '' };
});
