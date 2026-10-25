// Portraits (fictifs, generes par IA) des annonces de « Rencontres & affinites », decoupes dans sept planches fournies par l'editeur.
// Usage: node scripts/make-rencontres-photos.mjs <planche19> <planche20> <planche21> <planche22> <planche23> <planche24> <planche25> [--controle fichier.png]
// Sortie: site/public/rencontres/<ref en minuscules>.webp (128x160). Chaque entree: ref -> [planche, centre x, centre y, hauteur du cadrage] dans la planche d'origine.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const iControle = args.indexOf('--controle');
const controle = iControle >= 0 ? args.splice(iControle, 2)[1] : null;
const planches = args; // 7 fichiers, indices 0 a 6 = planches 19 a 25
if (planches.length !== 7) { console.error('Usage: node scripts/make-rencontres-photos.mjs <7 planches> [--controle fichier.png]'); process.exit(2); }

const out = path.resolve('site/public/rencontres');
fs.mkdirSync(out, { recursive: true });

const H = 190;
// ref -> [planche (0 = n°19 ... 6 = n°25), x, y, hauteur]
export const portraits = {
  '1': [6, 240, 105, H], '2': [4, 255, 100, H], '3': [0, 1,  1, 0], '4': [3, 1165, 100, H], '5': [0, 1, 1, 0],
  '6': [6, 235, 615, H], '7': [3, 250, 110, H], '8': [5, 1170, 650, H], '9': [6, 700, 105, H], '10': [4, 245, 650, H],
  '11': [2, 1170, 385, H], '12': [2, 700, 110, H], '13': [6, 205, 345, H], '14': [5, 700, 405, H], '15': [0, 1, 1, 0],
  '18': [4, 705, 110, H], '20': [5, 1165, 100, H], '22': [4, 1165, 100, H], '23': [0, 1, 1, 0], '24': [3, 245, 385, H],
  '25': [5, 215, 105, H], '26': [6, 1190, 615, H], '27': [6, 1175, 385, H], '28': [2, 250, 110, H], '29': [5, 1175, 390, H],
  '30': [5, 210, 655, H], '31': [6, 1170, 105, H], '32': [2, 245, 645, H], '34': [6, 705, 390, H], '35': [2, 705, 645, H],
  '36': [2, 1185, 645, H],
  // portraits des annonces hommes/hommes et femmes/femmes (planches 21 a 24)
  'b4-71km': [2, 705, 385, H], 'n7y-16c': [3, 705, 95, H], 't6w-824': [4, 1170, 645, H], 'd8-4x07': [5, 205, 385, H],
  's1k-63b': [3, 1165, 385, H], 'x2k-860s': [3, 245, 640, H],
  'k7-492b': [6, 700, 615, H], 'q3l-058': [2, 245, 390, H], 'x91-t4c': [3, 705, 400, H], 'r2m-71z': [3, 1170, 640, H],
  '4hb-60w': [2, 1165, 100, H], 'v8-d33k': [5, 700, 110, H],
};
// Planches 19 (indice 0) en 5 x 3: la tuile (colonne, ligne) -> centre approximatif du visage
const grille5 = (c, l) => [88 + c * 249 + 117, 55 + l * 226 + 100];
// ref -> [planche, colonne, ligne]
const tuile5 = {
  '3': [0, 2, 2], '5': [0, 4, 1], '15': [0, 2, 0], '23': [0, 3, 0],
  'f9-30qz': [0, 0, 1], 'u4y-70d': [0, 1, 0], 'w6-282ka': [0, 0, 0], 'a5-640zl': [0, 1, 1], 'c2m-47x': [0, 4, 2], 'l5-208rt': [0, 1, 2],
  'j2-559hd': [1, 0, 2], 'g9n-31t': [1, 2, 2],
};
for (const [ref, [pl, c, l]] of Object.entries(tuile5)) { const [x, y] = grille5(c, l); portraits[ref] = [pl, x, y, 190]; }

const meta = await Promise.all(planches.map((f) => sharp(f).metadata()));
const imgs = planches.map((f) => sharp(f));
const larg = 152, haut = 190; // cadrage 4:5
const vignettes = [];
for (const [ref, [pl, cx, cy, h]] of Object.entries(portraits)) {
  const w = Math.round((h * 4) / 5);
  const m = meta[pl];
  const left = Math.max(0, Math.min(m.width - w, Math.round(cx - w / 2)));
  const top = Math.max(0, Math.min(m.height - h, Math.round(cy - h * 0.5)));
  const buf = await imgs[pl].clone().extract({ left, top, width: w, height: h }).resize(128, 160).webp({ quality: 82 }).toBuffer();
  fs.writeFileSync(path.join(out, `${ref}.webp`), buf);
  vignettes.push([ref, buf]);
}
console.log(`${vignettes.length} portraits dans ${out}`);

if (controle) {
  // Planche de controle (reference sous chaque visage) pour verifier les cadrages a l'oeil.
  const cols = 10, cw = 128, ch = 176;
  const lignes = Math.ceil(vignettes.length / cols);
  const compo = await Promise.all(vignettes.map(async ([ref, buf], i) => {
    const png = await sharp(buf).png().toBuffer();
    const label = await sharp({ create: { width: cw, height: 16, channels: 3, background: '#fff' } })
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="16"><text x="3" y="12" font-size="11" font-family="sans-serif">${ref}</text></svg>`), left: 0, top: 0 }]).png().toBuffer();
    return [{ input: png, left: (i % cols) * cw, top: Math.floor(i / cols) * ch }, { input: label, left: (i % cols) * cw, top: Math.floor(i / cols) * ch + 160 }];
  }));
  await sharp({ create: { width: cols * cw, height: lignes * ch, channels: 3, background: '#ffffff' } }).composite(compo.flat()).png().toFile(controle);
}
