import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { typo } from './lib/typo.js';

// LGN_CONTENT_DIR permet de construire le site a partir d'articles ailleurs (simulation, tests).
const base: string | URL = process.env.LGN_CONTENT_DIR
  ? pathToFileURL(path.resolve(process.env.LGN_CONTENT_DIR) + path.sep)
  : './src/content/articles';

const schema = z.object({
    id: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().transform(typo), // espaces insecables: jamais de « : » en debut de ligne
    chapo: z.string().transform(typo),
    description: z.string().transform(typo),
    category: z.string(),
    tags: z.array(z.string()),
    publishedAt: z.coerce.date(),
    slot: z.string().optional(),
    kind: z.enum(['news', 'evergreen']),
    satire: z.literal(true),
    sources: z.array(z.object({ name: z.string(), title: z.string(), url: z.string().url() })),
    model: z.string().optional(),
    angle: z.string().optional(),
    ref: z.string().optional(),
    author: z.string().optional(),
    coauthor: z.string().optional(), // second signataire (article écrit à deux)
    imagePrompt: z.string().optional(),
    image: z.string().regex(/^images\/articles\/[a-z0-9-]+\.webp$/).optional(),
    imageAlt: z.string().optional(),
    imageCredit: z.string().optional(),
});

const articles = defineCollection({
  loader: glob({ pattern: '*.md', base, generateId: ({ data }) => String(data.slug) }),
  schema,
});

// Articles ecrits a la main, relus sur /test/ puis deplaces dans articles/ pour etre publies.
const enAttente = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/en-attente', generateId: ({ data }) => String(data.slug) }),
  schema,
});

export const collections = { articles, enAttente };
