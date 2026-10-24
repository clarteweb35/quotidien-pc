// Genere les variantes web du logo a partir de site/src/assets/logo-source.png (fourni par l'editeur).
// Usage: node scripts/make-brand-assets.mjs   (resultats commites dans site/public/brand/)
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'site/src/assets/logo-source.png');
const out = path.join(root, 'site/public/brand');
const IVORY = { r: 250, g: 247, b: 242 };

// Logo d'en-tete: fond blanc du fichier source ramene a l'ivoire du site (multiplication), largeur 1100 px (affiche en 550 px, ecrans 2x).
const header = await sharp(src).resize({ width: 1100 }).linear(1.04, 0).flatten({ background: IVORY }).toBuffer();
// Multiplication du blanc par l'ivoire pour que le fond se confonde avec le papier.
const ivoryLayer = await sharp({ create: { width: 1100, height: Math.round((724 / 2172) * 1100), channels: 3, background: IVORY } }).png().toBuffer();
const logo = await sharp(header).composite([{ input: ivoryLayer, blend: 'multiply' }]).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
await sharp(logo).toFile(path.join(out, 'logo-1100.png'));
await sharp(logo).webp({ quality: 88 }).toFile(path.join(out, 'logo-1100.webp'));

// Image de partage par defaut 1200x630: logo centre sur papier ivoire, filets rouge sombre, mention satirique.
const W = 1200, H = 630;
const logoOg = await sharp(src).resize({ width: 1000 }).linear(1.04, 0).toBuffer();
const logoMeta = await sharp(logoOg).metadata();
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="rgb(250,247,242)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#16140f" stroke-width="3"/>
  <rect x="50" y="50" width="${W - 100}" height="${H - 100}" fill="none" stroke="#16140f" stroke-width="1"/>
  <text x="${W / 2}" y="${H - 78}" text-anchor="middle" font-family="Georgia, 'DejaVu Serif', serif" font-size="22" letter-spacing="4" fill="#8f1d17">JOURNAL SATIRIQUE · TOUT EST FAUX, SAUF L'ENVIE DE RIRE</text>
</svg>`);
await sharp(svg)
  .composite([{ input: logoOg, left: Math.round((W - 1000) / 2), top: Math.round((H - logoMeta.height) / 2) - 20, blend: 'multiply' }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, 'og-default.png'));

console.log('Assets de marque generes dans', out);
