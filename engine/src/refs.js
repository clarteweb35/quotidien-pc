import fs from 'node:fs';
import path from 'node:path';

/**
 * Reference courte et lisible d'un article, derivee de son creneau: AAMMJJ-NN
 *   2026-10-24#7   -> 261024-08   (8e creneau du jour)
 *   2026-10-24#x1  -> 261024-X1   (publication supplementaire manuelle)
 * Stable (ne depend que du creneau) et identique cote moteur et cote site (site/src/lib/ref.ts).
 */
export function refFromSlot(slot) {
  const m = /^(\d{4})-(\d{2})-(\d{2})#(.+)$/.exec(String(slot ?? ''));
  if (!m) return null;
  const idx = m[4];
  const tail = /^\d+$/.test(idx) ? String(Number(idx) + 1).padStart(2, '0') : idx.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
  return `${m[1].slice(2)}${m[2]}${m[3]}-${tail}`;
}

export const IMAGE_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png'];

/** Images deposees a la main: { 'REF': 'REF.jpg' } (nom de fichier sans extension, insensible a la casse). */
export function listManualImages(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const ext = path.extname(f).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) out[path.basename(f, path.extname(f)).toUpperCase().replace(/-DESSIN$/, '')] = f; // « -dessin » = dessin de presse
  }
  return out;
}

/** Fichier Markdown de suivi: articles recents encore sans image manuelle, avec une description prete a l'emploi. */
export function renderManualImageList({ articles, manual, cfg, limit = 40 }) {
  const style = cfg.engine.images?.styleGuide ?? '';
  const rows = articles
    .map((a) => ({ ...a, ref: a.ref ?? refFromSlot(a.slot) }))
    .filter((a) => a.ref)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, limit);
  const todo = rows.filter((a) => !manual[a.ref.toUpperCase()]);
  const done = rows.filter((a) => manual[a.ref.toUpperCase()]);
  const lines = [
    '# Images à faire à la main',
    '',
    'Nommez votre image **exactement comme la référence** (ex. `261024-X1.jpg`) et déposez-la dans `site/src/assets/manual/`.',
    'Formats : `.jpg`, `.png`, `.webp` · paysage 16:9 conseillé, 1280 px de large minimum.',
    '',
    `## Sans image (${todo.length})`,
    '',
  ];
  if (!todo.length) lines.push('_Aucune : tous les articles récents ont une image._', '');
  for (const a of todo) {
    lines.push(`### \`${a.ref}\` — ${a.title}`, `- Rubrique : ${a.category}`);
    if (a.imagePrompt) lines.push(`- Description suggérée : ${a.imagePrompt}`);
    if (style) lines.push(`- Style conseillé : ${style}`);
    lines.push('');
  }
  lines.push(`## Déjà illustrés (${done.length})`, '');
  for (const a of done) lines.push(`- \`${a.ref}\` — ${a.title} (${manual[a.ref.toUpperCase()]})`);
  return lines.join('\n') + '\n';
}
