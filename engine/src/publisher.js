import fs from 'node:fs';
import path from 'node:path';
import { slugify } from './util.js';
import { refFromSlot } from './refs.js';

const FM_KEYS = ['id', 'ref', 'author', 'title', 'chapo', 'description', 'category', 'tags', 'publishedAt', 'slot', 'kind', 'satire', 'sources', 'model', 'angle'];
const IMAGE_DIR = 'images/articles';

export function parseArticleFile(raw) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, '\n'));
  if (!m) throw new Error('Frontmatter introuvable');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    fm[line.slice(0, i).trim()] = JSON.parse(line.slice(i + 1).trim());
  }
  return { fm, body: m[2].trim() };
}

/** Articles deja presents (pour la detection de doublons et l'unicite des slugs). */
export function loadExisting(contentDir, { maxAgeDays = 90, now = new Date() } = {}) {
  if (!fs.existsSync(contentDir)) return [];
  const out = [];
  for (const f of fs.readdirSync(contentDir)) {
    if (!f.endsWith('.md')) continue;
    try {
      const { fm, body } = parseArticleFile(fs.readFileSync(path.join(contentDir, f), 'utf8'));
      if (now.getTime() - Date.parse(fm.publishedAt) > maxAgeDays * 86400000) continue;
      out.push({ id: fm.id, slot: fm.slot, slug: fm.slug ?? f.replace(/\.md$/, ''), title: fm.title, text: body, category: fm.category, publishedAt: fm.publishedAt, image: fm.image, ref: fm.ref ?? refFromSlot(fm.slot), author: fm.author, imagePrompt: fm.imagePrompt, imageAlt: fm.imageAlt, file: f });
    } catch {
      /* fichier illisible ignore: il sera signale par les tests du site */
    }
  }
  return out;
}

function uniqueSlug(base, existing, id) {
  const taken = new Set(existing.filter((e) => e.id !== id).map((e) => e.slug));
  let slug = base || 'article';
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/**
 * Ecrit l'article puis le relit pour confirmer. Idempotent: meme id => meme fichier (ecrasement identique).
 */
export function publishArticle({ article, topic, id, slotLabel, model, now, contentDir, existing, image = null, imageDir = null, author = null }) {
  const date = now.toISOString().slice(0, 10);
  const prior = existing.find((e) => e.id === id);
  const slug = prior ? prior.slug : uniqueSlug(slugify(article.title), existing, id);
  const file = prior ? prior.file : `${date}-${slug}.md`;
  const sources = topic.kind === 'evergreen' ? [] : [{ name: topic.sourceName, title: topic.title, url: topic.url }];
  const fm = {
    id,
    ref: refFromSlot(slotLabel),
    author: author ?? null,
    title: article.title,
    chapo: article.chapo,
    description: article.seo_description,
    category: article.category,
    tags: article.tags,
    publishedAt: now.toISOString(),
    slot: slotLabel,
    kind: topic.kind === 'evergreen' ? 'evergreen' : 'news',
    satire: true,
    sources,
    model,
    angle: article.angle,
  };
  const extra = [`slug: ${JSON.stringify(slug)}`];
  let imageFile = null;
  // Consigne et texte alternatif conserves pour toute illustration deposee plus tard a la main.
  if (article.image_prompt?.trim()) extra.push(`imagePrompt: ${JSON.stringify(article.image_prompt.trim())}`);
  if (!image && article.image_alt?.trim()) extra.push(`imageAlt: ${JSON.stringify(article.image_alt.trim())}`);
  if (image && imageDir) {
    // Fichier ecrit avant l'article: un article ne reference jamais une image absente.
    imageFile = `${slug}.webp`;
    fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, imageFile), image.buffer);
    extra.push(`image: ${JSON.stringify(`${IMAGE_DIR}/${imageFile}`)}`, `imageAlt: ${JSON.stringify(image.alt)}`, `imageCredit: ${JSON.stringify(image.credit)}`);
  }
  const lines = ['---', ...FM_KEYS.map((k) => `${k}: ${JSON.stringify(fm[k])}`), ...extra, '---', ''];
  const body = article.body
    .map((b) => {
      const t = b.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return b.kind === 'h2' ? `## ${t}` : t;
    })
    .join('\n\n');
  const content = lines.join('\n') + body + '\n';

  fs.mkdirSync(contentDir, { recursive: true });
  const target = path.join(contentDir, file);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, target);

  // Confirmation: relecture du fichier ecrit.
  const check = parseArticleFile(fs.readFileSync(target, 'utf8'));
  if (check.fm.id !== id || check.fm.slug !== slug || !check.body) throw new Error(`Confirmation de publication echouee pour ${file}`);
  return { id, ref: fm.ref, slug, file, image: imageFile, urlPath: `/articles/${slug}/`, publishedAt: fm.publishedAt, title: article.title, category: article.category };
}
