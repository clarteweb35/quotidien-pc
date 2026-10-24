import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { allArticles, category, siteName } from '../../lib/site';

// Image de partage par article (1200x630): meme identite que le logo — papier ivoire, filets noirs, rouge sombre,
// logo « Le Quotidien / PRESQUE CERTAIN » en tete, titre en serif. Generee au build, aucun appel externe.
const W = 1200;
const H = 630;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = out[lines - 1].replace(/[\s,.;:!?-]*\S*$/, '') + '…';
  }
  return out;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const articles = await allArticles();
  return articles.map((a) => ({ params: { slug: a.data.slug }, props: { title: a.data.title, cat: category(a.data.category) } }));
};

export const GET: APIRoute = async ({ props }) => {
  const { title, cat } = props as { title: string; cat: { name: string } };
  const logoFile = [path.resolve(process.cwd(), 'public/brand/logo-1100.png'), path.resolve(process.cwd(), 'site/public/brand/logo-1100.png')].find(fs.existsSync);
  if (!logoFile) throw new Error('logo-1100.png introuvable (node scripts/make-brand-assets.mjs)');
  const logo = await sharp(logoFile).resize({ width: 480 }).toBuffer();
  const lines = wrap(title, 27, 4);
  const startY = 415 - (lines.length - 1) * 29;
  const text = lines.map((l, i) => `<text x="${W / 2}" y="${startY + i * 58}" text-anchor="middle">${esc(l)}</text>`).join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#faf7f2"/>
    <rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="#16140f" stroke-width="3"/>
    <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#16140f" stroke-width="1"/>
    <rect x="120" y="226" width="${W - 240}" height="3" fill="#8f1d17"/>
    <text x="${W / 2}" y="266" text-anchor="middle" font-family="Georgia,'DejaVu Serif',serif" font-size="22" letter-spacing="6" fill="#8f1d17">${esc(cat.name.toUpperCase())}</text>
    <g font-family="Georgia,'DejaVu Serif',serif" font-weight="700" font-size="48" fill="#16140f">${text}</g>
    <text x="${W / 2}" y="${H - 62}" text-anchor="middle" font-family="Georgia,'DejaVu Serif',serif" font-size="20" letter-spacing="4" fill="#4a463d">${esc('ARTICLE SATIRIQUE · ' + siteName.toUpperCase())}</text>
  </svg>`);
  const png = await sharp(svg).composite([{ input: logo, left: Math.round((W - 480) / 2), top: 52 }]).png({ compressionLevel: 9 }).toBuffer();
  return new Response(png, { headers: { 'content-type': 'image/png' } });
};
