// Logos des annonceurs recurrents et portraits des coachs de « Petites annonces » (images fictives generees par IA, fournies par l'editeur).
// Usage: node scripts/make-annonces-logos.mjs <concept> <bpcc> <evidence> <coach> <consultant>
// Sortie dans site/public/annonces/: concept.webp, bpcc.webp, evidence.webp (logos ronds 192 px), coach-noms.webp et consultant.webp (portraits 168x210).
// Les coordonnees de recadrage correspondent aux planches 1408 x 768 fournies (cercle centre en 704,385; portrait sans sa legende).
import path from 'node:path';
import sharp from 'sharp';

const [concept, bpcc, evidence, coach, consultant] = process.argv.slice(2);
if (!consultant) { console.error('Usage: node scripts/make-annonces-logos.mjs <concept> <bpcc> <evidence> <coach> <consultant>'); process.exit(2); }
const out = path.resolve('site/public/annonces');

const rond = (src, box, nom) => sharp(src).extract(box).resize(192, 192).webp({ quality: 88 }).toFile(path.join(out, nom));
await rond(concept, { left: 409, top: 90, width: 590, height: 590 }, 'concept.webp');
await rond(bpcc, { left: 409, top: 95, width: 590, height: 590 }, 'bpcc.webp');
// Logo du cabinet: image deja au format carre (268 x 255), fond blanc.
await sharp(evidence).flatten({ background: '#ffffff' }).resize(192, 192, { fit: 'contain', background: '#ffffff' }).webp({ quality: 88 }).toFile(path.join(out, 'evidence.webp'));

const portrait = (src, box, nom) => sharp(src).extract(box).resize(168, 210).webp({ quality: 86 }).toFile(path.join(out, nom));
await portrait(coach, { left: 459, top: 47, width: 490, height: 612 }, 'coach-noms.webp'); // sans la legende « Coach en noms concrets »
await portrait(consultant, { left: 459, top: 47, width: 490, height: 612 }, 'consultant.webp');
console.log('5 images dans', out);
