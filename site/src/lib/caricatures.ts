import data from '../data/caricatures.json';

export interface Caricature {
  date: string; titre: string; legende: string; alt: string; image: string; credit: string; publishedAt: string;
  source: { name: string; title: string; url: string };
}

/** « Le dessin du jour », du plus recent au plus ancien (fichier ecrit par le moteur, jamais a la main). */
export const caricatures = (data as Caricature[]).slice().sort((a, b) => b.date.localeCompare(a.date));
