import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE_URL: URL publique finale (ex: https://legrandnimporte.fr). SITE_BASE: '/' avec un domaine personnalisé,
// '/<depot>/' si le site est servi sous https://<compte>.github.io/<depot>/.
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.com',
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => !page.includes('/admin/') })],
  vite: { server: { fs: { strict: false } } },
});
