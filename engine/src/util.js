import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ---------- fichiers ----------

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return structuredClone(fallback);
    throw new Error(`Lecture JSON impossible: ${file} (${err.message})`);
  }
}

/** Ecriture atomique: fichier temporaire puis renommage. */
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export function appendLine(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line + '\n', 'utf8');
}

// ---------- temps (Europe/Paris) ----------

/** Decompose une date en date locale YYYY-MM-DD et minutes depuis minuit, dans le fuseau demande. */
export function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    month: `${p.year}-${p.month}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

export function hhmmToMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Heure invalide: "${hhmm}" (format HH:MM attendu)`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new Error(`Heure invalide: "${hhmm}"`);
  return h * 60 + mi;
}

// ---------- texte ----------

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeText(s) {
  return stripAccents(String(s ?? '').toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(
  'le la les un une des du de d l au aux et ou en a est sont ce cet cette ces qui que quoi dont pour par sur sous dans avec sans il elle ils elles on nous vous je tu se sa son ses leur leurs plus pas ne y mais donc car si apres avant entre vers chez comme tout tous'.split(
    ' ',
  ),
);

export function tokens(s) {
  return normalizeText(s)
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Similarite de titres: max entre Jaccard de mots et Jaccard de bigrammes de caracteres. */
export function titleSimilarity(a, b) {
  const wa = tokens(a);
  const wb = tokens(b);
  const bigrams = (s) => {
    const n = normalizeText(s).replace(/\s/g, '');
    const out = [];
    for (let i = 0; i < n.length - 1; i++) out.push(n.slice(i, i + 2));
    return out;
  };
  return Math.max(jaccard(wa, wb), jaccard(bigrams(a), bigrams(b)));
}

export function shingles(text, size = 4) {
  const w = normalizeText(text).split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i + size <= w.length; i++) out.push(w.slice(i, i + size).join(' '));
  return out;
}

export function bodySimilarity(a, b) {
  return jaccard(shingles(a), shingles(b));
}

export function wordCount(s) {
  return String(s ?? '').split(/\s+/).filter(Boolean).length;
}

export function slugify(s, max = 60) {
  const slug = stripAccents(String(s).toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug;
  return slug.slice(0, max).replace(/-[^-]*$/, '') || slug.slice(0, max);
}

export function sha1(s, len = 12) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, len);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function round(n, d = 6) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
