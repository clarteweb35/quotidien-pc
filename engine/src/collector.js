import { XMLParser } from 'fast-xml-parser';
import { sha1 } from './util.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true, trimValues: true });

const arr = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => {
  if (x === undefined || x === null) return '';
  if (typeof x === 'object') return String(x['#text'] ?? x['@_href'] ?? '');
  return String(x);
};

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  hellip: '…', ndash: '–', mdash: '—', euro: '€', oelig: 'œ', OElig: 'Œ', agrave: 'à', acirc: 'â', ccedil: 'ç', eacute: 'é', egrave: 'è',
  ecirc: 'ê', euml: 'ë', icirc: 'î', iuml: 'ï', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', uuml: 'ü', Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç',
};

/** Decode les entites HTML (nommees francaises courantes et numeriques); une entite inconnue est supprimee. */
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+[0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 31 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? ' ';
  });
}

export function cleanText(s, max = 400) {
  // Le parseur XML decode un premier niveau d'entites; certains flux (franceinfo) en encodent deux fois: on decode jusqu'a stabilite.
  let t = String(s);
  for (let i = 0; i < 3; i++) {
    const next = decodeEntities(t.replace(/<[^>]*>/g, ' '));
    if (next === t) break;
    t = next;
  }
  return t.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Analyse un document RSS 2.0 ou Atom et retourne des elements normalises. */
export function parseFeed(xml, feed) {
  const doc = parser.parse(xml);
  const out = [];
  const rssItems = arr(doc?.rss?.channel?.item);
  const atomItems = arr(doc?.feed?.entry);
  for (const it of rssItems) {
    out.push({ title: text(it.title), url: text(it.link), summary: text(it.description), published: text(it.pubDate) });
  }
  for (const it of atomItems) {
    const link = arr(it.link).find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? arr(it.link)[0];
    out.push({ title: text(it.title), url: text(link), summary: text(it.summary ?? it.content), published: text(it.updated ?? it.published) });
  }
  return out
    .map((it) => {
      const url = it.url.trim();
      const ts = Date.parse(it.published);
      return {
        id: sha1(url || it.title),
        title: cleanText(it.title, 220),
        summary: cleanText(it.summary, 400),
        url,
        publishedAt: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
        feedId: feed.id,
        sourceName: feed.name,
        category: feed.category,
      };
    })
    .filter((it) => it.title && /^https?:\/\//.test(it.url));
}

async function fetchText(url, { timeoutMs, userAgent }) {
  const res = await fetch(url, {
    headers: { 'user-agent': userAgent, accept: 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Recupere tous les flux actifs. Un flux en erreur est journalise puis ignore.
 * @param fetcher injectable pour les tests: (url) => Promise<string>
 */
export async function collect({ cfg, logger, now = () => new Date(), fetcher }) {
  const c = cfg.engine.collection;
  const get = fetcher ?? ((url) => fetchText(url, { timeoutMs: c.fetchTimeoutMs, userAgent: c.userAgent }));
  const maxAge = c.maxItemAgeHours * 3600 * 1000;
  const feeds = cfg.sources.filter((f) => f.enabled);
  const results = await Promise.allSettled(feeds.map(async (f) => ({ f, items: parseFeed(await get(f.url), f) })));
  const items = [];
  const seen = new Set();
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.warn('collect.feed_failed', { feed: feeds[i].id, error: String(r.reason?.message ?? r.reason).slice(0, 200) });
      return;
    }
    let kept = 0;
    for (const it of r.value.items) {
      if (kept >= c.maxItemsPerFeed) break;
      if (it.publishedAt && now().getTime() - Date.parse(it.publishedAt) > maxAge) continue;
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
      kept++;
    }
    logger.info('collect.feed_ok', { feed: r.value.f.id, parsed: r.value.items.length, kept });
  });
  return items;
}
