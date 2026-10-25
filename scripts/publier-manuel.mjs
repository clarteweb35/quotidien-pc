// Publie a la main un ou plusieurs articles ecrits hors du moteur (ex. editos), apres les memes controles deterministes que le moteur.
// Usage: node scripts/publier-manuel.mjs <articles.json> [--dry]
// Le JSON est un tableau d'objets: { slot, topicTitle, article: { status, title, chapo, category, tags, seo_description, angle, body[], author, image_prompt, image_alt, fictional_elements, quality_checks } }
// Le slot manuel est de la forme "2026-10-25#x4" (x = publication supplementaire). Rien n'est publie si un controle echoue.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, makePaths } from '../engine/src/config.js';
import { loadExisting, publishArticle } from '../engine/src/publisher.js';
import { validateArticle } from '../engine/src/validator.js';
import { sha1 } from '../engine/src/util.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('Usage: node scripts/publier-manuel.mjs <articles.json> [--dry]'); process.exit(2); }
const dry = flags.includes('--dry');

const paths = makePaths();
const cfg = loadConfig(paths);
const items = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
let echec = false;

for (const { slot, topicTitle, article } of items) {
  const now = new Date();
  const existing = loadExisting(paths.content, { now });
  const topic = { id: sha1(`manuel|${slot}`), kind: 'evergreen', title: topicTitle ?? article.title, category: article.category, url: '', sourceName: '', summary: '' };
  const res = validateArticle({ article, topic, cfg, existing });
  if (!res.ok) {
    echec = true;
    console.error(`REFUSE ${slot} « ${article.title} »:`);
    for (const i of res.issues) console.error(`  - ${i.code}: ${i.msg}`);
    continue;
  }
  if (dry) { console.log(`OK (a blanc) ${slot} « ${article.title} »`); continue; }
  const pub = publishArticle({ article, topic, id: sha1(`${slot}|${topic.id}`), slotLabel: slot, model: 'redaction-manuelle', now, contentDir: paths.content, existing, author: article.author ?? null });
  console.log(`PUBLIE ${slot} -> ${pub.urlPath} (ref ${pub.ref})`);
}
process.exit(echec ? 1 : 0);
