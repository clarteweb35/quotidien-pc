import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Date de publication de chaque article (lue dans le front-matter) pour renseigner <lastmod> dans le sitemap.
const lastmod = new Map();
const dir = new URL('./src/content/articles/', import.meta.url);
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const head = fs.readFileSync(new URL(f, dir), 'utf8').slice(0, 1500);
    const slug = /^slug:\s*["']?([^"'\n]+)/m.exec(head)?.[1];
    const date = /^publishedAt:\s*["']?([^"'\n]+)/m.exec(head)?.[1];
    if (slug && date && !isNaN(Date.parse(date))) lastmod.set(slug.trim(), new Date(date.trim()));
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
      filter: (page) => !page.includes('/admin/'),
      serialize(item) {
        const slug = /\/articles\/([^/]+)\/$/.exec(item.url)?.[1];
        if (slug && lastmod.has(slug)) item.lastmod = lastmod.get(slug).toISOString();
        return item;
      },
    }),
  ],
  vite: { server: { fs: { strict: false } } },
});
