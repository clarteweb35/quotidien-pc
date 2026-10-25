// Portrait du redacteur en chef et photo du bureau du service Tech (images generees par IA).
// Usage: node scripts/make-redaction-extras.mjs <portrait-redac-chef.jpg> <bureau-tech.jpg>
import path from 'node:path';
import sharp from 'sharp';

const [chief, tech] = process.argv.slice(2);
if (!chief || !tech) { console.error('Usage: node scripts/make-redaction-extras.mjs <redac-chef> <bureau-tech>'); process.exit(2); }
const out = path.resolve('site/public/redaction');

// Carre autour du visage (le reste de l'image montre des titres de presse reels, volontairement exclus).
await sharp(chief).extract({ left: 555, top: 40, width: 330, height: 330 }).resize(256, 256).webp({ quality: 85 }).toFile(path.join(out, 'jean-eudes-de-la-manchette.webp'));
await sharp(tech).resize(800, 450, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(out, 'bureaux', 'tech.webp'));
console.log('ok');
