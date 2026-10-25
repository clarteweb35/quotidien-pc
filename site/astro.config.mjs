import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Date de publication de chaque article (lue dans le front-matter) pour renseigner <lastmod> dans le sitemap.
const lastmod = new Map();
const tagCount = new Map(); // mot-cle -> nombre d'articles (les pages de mots-cles minces sont en noindex, donc hors sitemap)
const dir = new URL('./src/content/articles/', import.meta.url);
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const head = fs.readFileSync(new URL(f, dir), 'utf8').slice(0, 1500);
    const slug = /^slug:\s*["']?([^"'\n]+)/m.exec(head)?.[1];
    const date = /^publishedAt:\s*["']?([^"'\n]+)/m.exec(head)?.[1];
    if (slug && date && !isNaN(Date.parse(date))) lastmod.set(slug.trim(), new Date(date.trim()));
    const tags = /^tags:\s*\[(.*)\]\s*$/m.exec(head)?.[1];
    if (tags) for (const t of JSON.parse(`[${tags}]`)) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }
}

// SITE_URL: URL publique finale (ex: https://legrandnimporte.fr). SITE_BASE: '/' avec un domaine personnalisé,
// '/<depot>/' si le site est servi sous https://<compte>.github.io/<depot>/.
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.com',
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'always' }, // evite la requete CSS bloquante (feuille de quelques Ko)
  integrations: [
    sitemap({
      filter: (page) => {
        if (page.includes('/admin/')) return false;
        const tag = /\/tag\/([^/]+)\/$/.exec(page)?.[1];
        return !tag || (tagCount.get(decodeURIComponent(tag)) ?? 0) >= 3;
      },
      serialize(item) {
        const slug = /\/articles\/([^/]+)\/$/.exec(item.url)?.[1];
        if (slug && lastmod.has(slug)) item.lastmod = lastmod.get(slug).toISOString();
        return item;
      },
    }),
  ],
  vite: { server: { fs: { strict: false } } },
});
