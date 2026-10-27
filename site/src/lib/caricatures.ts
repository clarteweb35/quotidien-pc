import fs from 'node:fs';
import data from '../data/caricatures.json';
import { typo } from './typo.js';

export interface Caricature {
  date: string; titre: string; legende: string; alt: string; image: string; credit: string; publishedAt: string;
  source: { name: string; title: string; url: string };
}

/** « Le dessin du jour », du plus recent au plus ancien (fichier ecrit par le moteur, jamais a la main). */
// QPC_CARICATURES: fichier de remplacement, utilise uniquement par les tests du site
const source = (process.env.QPC_CARICATURES ? JSON.parse(fs.readFileSync(process.env.QPC_CARICATURES, 'utf8')) : data) as Caricature[];
export const caricatures = source.map((c) => ({ ...c, titre: typo(c.titre), legende: typo(c.legende) })).sort((a, b) => b.date.localeCompare(a.date));
