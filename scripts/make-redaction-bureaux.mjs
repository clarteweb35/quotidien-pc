// Decoupe la planche 3x3 des bureaux de la redaction (images generees par IA) en neuf photos 800 px.
// Usage: node scripts/make-redaction-bureaux.mjs <planche.png>
// Sortie: site/public/redaction/bureaux/<nom>.webp. Ordre de la planche: ligne par ligne, de gauche a droite.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [file] = process.argv.slice(2);
if (!file) { console.error('Usage: node scripts/make-redaction-bureaux.mjs <planche.png>'); process.exit(2); }
const out = path.resolve('site/public/redaction/bureaux');
fs.mkdirSync(out, { recursive: true });

const names = ['politique', 'economie', 'societe-culture', 'sport', 'faits-divers', 'monde', 'juridique', 'vie-entreprise', 'lucas'];
const { width, height } = await sharp(file).metadata();
const cw = width / 3, ch = height / 3, inset = 4; // 4 px de marge pour ne pas garder le filet blanc entre les cases
for (const [i, name] of names.entries()) {
  const left = Math.round((i % 3) * cw) + inset, top = Math.round(Math.floor(i / 3) * ch) + inset;
  const w = Math.round(cw) - 2 * inset, h = Math.round(ch) - 2 * inset;
  await sharp(file).extract({ left, top, width: Math.min(w, width - left), height: Math.min(h, height - top) })
    .resize(800, 450, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(out, `${name}.webp`));
}
console.log(`${names.length} photos dans ${out}`);
