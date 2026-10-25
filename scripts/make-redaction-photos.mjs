// Decoupe les portraits (fictifs, generes par IA) de la page /redaction/ a partir des deux planches fournies par l'editeur.
// Usage: node scripts/make-redaction-photos.mjs <planche1.png> <planche2.jpg>
// Sortie: site/public/redaction/<slug-du-nom>.webp (256x256). Les boites sont des carres [gauche, haut, cote] dans la planche.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [sheet1, sheet2] = process.argv.slice(2);
if (!sheet1 || !sheet2) { console.error('Usage: node scripts/make-redaction-photos.mjs <planche1> <planche2>'); process.exit(2); }
const out = path.resolve('site/public/redaction');
fs.mkdirSync(out, { recursive: true });

const slug = (n) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// [planche, gauche, haut, cote]
const crops = {
  'Claire Delatour': [1, 620, 0, 290],
  'Claire Obscur': [2, 233, 0, 235],
  'Hélène Vautrin': [1, 660, 832, 190],
  'Marion Lefebvre': [1, 1135, 560, 270],
  'Alice Renaudin': [2, 1225, 385, 128],
  'Solange Attente': [1, 160, 560, 270],
  'Léa Baudry': [1, 1105, 832, 190],
  'Diane Montrose': [2, 237, 260, 230],
  'Juliette Bellune': [2, 0, 520, 235],
  'Pauline Roussel': [2, 1010, 395, 160],
  'Jeanne Rivard': [2, 470, 0, 230],
  'Maud Kerbrat': [1, 225, 832, 190],
  'Éva Porée': [2, 735, 480, 240],
  'Thomas Varenne': [2, 955, 0, 205],
  'Jean-Michel Démission': [2, 0, 5, 240],
  'Marc Delaroche': [1, 20, 832, 190],
  'Philippe Poche': [2, 1005, 590, 170],
  'Jean Fond': [1, 95, 0, 280],
  'Thomas Théorie': [1, 1330, 832, 190],
  'Hugo Valette': [2, 1172, 520, 235],
  'Léon Algorithme': [2, 0, 260, 250],
  'Rémi Zéro': [1, 625, 560, 270],
  'Alexandre Villedieu': [2, 700, 200, 250],
  'Pierre Ailleurs': [1, 140, 295, 260],
  'Victor Négociation': [2, 470, 520, 230],
  'Martin Deslauriers': [1, 445, 832, 190],
  'Artur Déco': [2, 235, 520, 235],
  'Rémi Censure': [1, 1100, 0, 285],
  'David Lemaître': [2, 1190, 0, 207],
  'Pascal Décisif': [1, 885, 832, 190],
  'Guy Vite': [1, 1120, 285, 270],
  'Lucas Dumond': [2, 470, 237, 235],
};
// Yves Verts: aucune planche disponible, la page affiche un portrait « non communiqué ».

const src = { 1: sharp(sheet1), 2: sharp(sheet2) };
for (const [name, [s, left, top, size]] of Object.entries(crops)) {
  await src[s].clone().extract({ left, top, width: size, height: size }).resize(256, 256, { kernel: 'lanczos3' }).webp({ quality: 82 }).toFile(path.join(out, `${slug(name)}.webp`));
}
console.log(`${Object.keys(crops).length} portraits dans ${out}`);
