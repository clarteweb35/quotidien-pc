import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// LGN_CONTENT_DIR permet de construire le site a partir d'articles ailleurs (simulation, tests).
const base: string | URL = process.env.LGN_CONTENT_DIR
  ? pathToFileURL(path.resolve(process.env.LGN_CONTENT_DIR) + path.sep)
  : './src/content/articles';

const articles = defineCollection({
  loader: glob({ pattern: '*.md', base, generateId: ({ data }) => String(data.slug) }),
  schema: z.object({
    id: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    chapo: z.string(),
    description: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    publishedAt: z.coerce.date(),
    slot: z.string().optional(),
    kind: z.enum(['news', 'evergreen']),
    satire: z.literal(true),
    sources: z.array(z.object({ name: z.string(), title: z.string(), url: z.string().url() })),
    model: z.string().optional(),
    angle: z.string().optional(),
  }),
});

export const collections = { articles };
