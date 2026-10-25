// Vignettes des petites annonces (photographies d'objets fournies par l'editeur), redimensionnees pour l'affichage (2x de 96 px).
// Usage: node scripts/make-annonces-images.mjs <chaise> <patate> <trophee> <parfum>
// Sortie: site/public/annonces/{chaise,patate,trophee,parfum}.webp
// Le fond blanc est masque a l'affichage (mix-blend-mode: multiply); le trophee, fourni avec un damier de transparence incruste,
// est nettoye ici: les pixels gris/blancs presque neutres redeviennent blancs.
import path from 'node:path';
import sharp from 'sharp';

const [chaise, patate, trophee, parfum] = process.argv.slice(2);
if (!parfum) { console.error('Usage: node scripts/make-annonces-images.mjs <chaise> <patate> <trophee> <parfum>'); process.exit(2); }
const out = path.resolve('site/public/annonces');
const cote = 192;

async function vignette(src, nom) {
  await sharp(src).flatten({ background: '#ffffff' }).resize(cote, cote, { fit: 'inside' }).webp({ quality: 84 }).toFile(path.join(out, nom));
}

async function sansDamier(src, nom) {
  const { data, info } = await sharp(src).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (Math.min(r, g, b) > 215 && Math.max(r, g, b) - Math.min(r, g, b) < 14) data[i] = data[i + 1] = data[i + 2] = 255;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).resize(cote, cote, { fit: 'inside' }).webp({ quality: 84 }).toFile(path.join(out, nom));
}

await vignette(chaise, 'chaise.webp');
await vignette(patate, 'patate.webp');
await sansDamier(trophee, 'trophee.webp');
await vignette(parfum, 'parfum.webp');
console.log('4 vignettes dans', out);
