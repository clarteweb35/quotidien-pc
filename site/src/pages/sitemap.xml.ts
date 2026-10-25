import type { APIRoute } from 'astro';

/** Alias de /sitemap-index.xml: beaucoup d'outils (et de personnes) essaient d'abord /sitemap.xml. */
export const GET: APIRoute = ({ site }) => {
  const loc = new URL('sitemap-0.xml', site).toString();
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${loc}</loc></sitemap></sitemapindex>`,
    { headers: { 'content-type': 'application/xml; charset=utf-8' } },
  );
};
