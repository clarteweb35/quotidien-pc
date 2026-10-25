import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';
import cfg from '../../../config/marches.json';

export interface Quote { label: string; kind: string; price: number; change: number; currency: string; time: Date }
export interface Headline { title: string; url: string; date: Date | null }
export interface Anniversary { years: number; date: string; text: string }

export const marchesEnabled: boolean = cfg.enabled;
const OFFLINE = process.env.MARCHES_OFFLINE === '1'; // tests et builds sans reseau
const CACHE = path.resolve('.cache', 'marches.json');
const CACHE_MAX_MS = 48 * 3600 * 1000;

/** Dernier bon resultat (restaure entre deux builds par la CI): evite un bloc vide sur une panne passagere de la source. */
function withCache<T>(key: string, fresh: T[], revive: (x: any) => T): T[] {
  try {
    const file = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
    if (fresh.length) {
      file[key] = { at: Date.now(), items: fresh };
      fs.mkdirSync(path.dirname(CACHE), { recursive: true });
      fs.writeFileSync(CACHE, JSON.stringify(file));
      return fresh;
    }
    const hit = file[key];
    return hit && Date.now() - hit.at < CACHE_MAX_MS ? hit.items.map(revive) : [];
  } catch { return fresh; }
}

const UA = 'Mozilla/5.0 (compatible; QuotidienPC-build)';

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Cotations differees. Une valeur en erreur est ignoree: la construction du site ne doit jamais echouer pour un cours. */
export async function loadQuotes(): Promise<Quote[]> {
  if (!cfg.enabled || OFFLINE) return [];
  const out = await Promise.all(cfg.quotes.map(async (q): Promise<Quote | null> => {
    try {
      const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(q.symbol)}?interval=1d&range=5d`);
      const m = j.chart.result[0].meta;
      const price = Number(m.regularMarketPrice);
      const prev = Number(m.chartPreviousClose ?? m.previousClose);
      if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) return null;
      return { label: q.label, kind: q.kind, price, change: ((price - prev) / prev) * 100, currency: m.currency ?? '', time: new Date(Number(m.regularMarketTime) * 1000) };
    } catch { return null; }
  }));
  return withCache('quotes', out.filter((q): q is Quote => q !== null), (q) => ({ ...q, time: new Date(q.time) }));
}

const arr = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const txt = (x: any): string => String(typeof x === 'object' && x !== null ? x['#text'] ?? '' : x ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Titres et liens uniquement (jamais le texte des articles), renvoyes vers la source. */
export async function loadHeadlines(): Promise<Headline[]> {
  if (!cfg.enabled || OFFLINE) return [];
  const fresh = await fetchHeadlines();
  return withCache('headlines', fresh, (h) => ({ ...h, date: h.date ? new Date(h.date) : null }));
}

async function fetchHeadlines(): Promise<Headline[]> {
  try {
    const res = await fetch(cfg.feedUrl, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml = new XMLParser({ processEntities: true, trimValues: true }).parse(await res.text());
    return arr<any>(xml?.rss?.channel?.item).map((it) => {
      const d = new Date(txt(it.pubDate));
      return { title: txt(it.title), url: txt(it.link), date: isNaN(d.getTime()) ? null : d };
    }).filter((h) => h.title && /^https:\/\//.test(h.url)).slice(0, cfg.headlines);
  } catch { return []; }
}

/** L'anniversaire economique le plus proche d'aujourd'hui (a l'annee pres, dans les deux sens). */
export function anniversary(now = new Date()): Anniversary | null {
  if (!cfg.history.length) return null;
  const day = (m: number, d: number, y: number) => Date.UTC(y, m - 1, d) / 86400000;
  const y = now.getUTCFullYear();
  const today = day(now.getUTCMonth() + 1, now.getUTCDate(), y);
  let best: { dist: number; h: (typeof cfg.history)[number] } | null = null;
  for (const h of cfg.history) {
    const dist = Math.min(...[y - 1, y, y + 1].map((yy) => Math.abs(day(h.month, h.day, yy) - today)));
    if (!best || dist < best.dist) best = { dist, h };
  }
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, best!.h.month - 1, best!.h.day)));
  return { years: y - best!.h.year, date, text: best!.h.text };
}

export const fmtNum = (n: number, digits = 2) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
