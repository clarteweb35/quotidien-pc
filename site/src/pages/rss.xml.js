import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import editorial from '../../../config/editorial.json';

export async function GET(context) {
  const articles = (await getCollection('articles')).sort((a, b) => b.data.publishedAt - a.data.publishedAt).slice(0, 50);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return rss({
    title: editorial.publicationName,
    description: 'Journal satirique. Tous les articles sont des fictions humoristiques.',
    site: context.site,
    customData: '<language>fr-fr</language>',
    items: articles.map((a) => ({
      title: a.data.title,
      description: `${a.data.chapo} (Article satirique.)`,
      pubDate: a.data.publishedAt,
      link: `${base}/articles/${a.data.slug}/`,
      categories: [a.data.category, ...a.data.tags],
    })),
  });
}
