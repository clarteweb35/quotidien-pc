// Portraits de Veronique Edavina et Fabienne Poche + photo du bureau d'accueil (images generees par IA).
// Usage: node scripts/make-redaction-secretariat.mjs <veronique.jpg> <fabienne.jpg> <accueil.jpg>
import path from 'node:path';
import sharp from 'sharp';

const [veronique, fabienne, accueil] = process.argv.slice(2);
if (!accueil) { console.error('Usage: node scripts/make-redaction-secretariat.mjs <veronique> <fabienne> <accueil>'); process.exit(2); }
const out = path.resolve('site/public/redaction');
const portrait = (src, box, name) => sharp(src).extract(box).resize(256, 256).webp({ quality: 85 }).toFile(path.join(out, name));

await portrait(veronique, { left: 520, top: 0, width: 380, height: 380 }, 'veronique-edavina.webp');
await portrait(fabienne, { left: 560, top: 20, width: 320, height: 320 }, 'fabienne-poche.webp');
await sharp(accueil).resize(800, 450, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(out, 'bureaux', 'secretariat.webp'));
console.log('ok');
