import fs from 'node:fs';
import path from 'node:path';
import cfg from '../../../config/sport.json';

export interface Match { league: string; date: Date; home: string; away: string; hs: number; as: number }

export const sportEnabled: boolean = cfg.enabled;
const OFFLINE = process.env.MARCHES_OFFLINE === '1'; // tests et builds sans reseau
const CACHE = path.resolve('.cache', 'sport.json');
const CACHE_MAX_MS = 48 * 3600 * 1000;

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function day(league: string, date: string): Promise<any[]> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${date}`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; QuotidienPC-build)' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    return ((await res.json()) as any).events ?? [];
  } catch { return []; }
}

/** Resultats termines des derniers jours: Ligue 1 et Ligue des champions en entier, autres ligues limitees aux grands clubs. */
export async function loadResults(): Promise<Match[]> {
  if (!cfg.enabled || OFFLINE) return [];
  const now = Date.now();
  const dates = Array.from({ length: cfg.days }, (_, i) => ymd(new Date(now - i * 86400000)));
  const out: Match[] = [];
  await Promise.all(cfg.leagues.flatMap((l) => dates.map(async (d) => {
    for (const e of await day(l.id, d)) {
      const c = e.competitions?.[0];
      if (!c || !e.status?.type?.completed || c.competitors?.length !== 2) continue;
      const home = c.competitors.find((x: any) => x.homeAway === 'home') ?? c.competitors[0];
      const away = c.competitors.find((x: any) => x.homeAway === 'away') ?? c.competitors[1];
      const big = cfg.bigClubs.some((n) => n === home.team.displayName || n === away.team.displayName);
      if (!l.allMatches && !big) continue;
      const hs = Number(home.score), as = Number(away.score);
      if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
      out.push({ league: l.label, date: new Date(e.date), home: home.team.shortDisplayName ?? home.team.displayName, away: away.team.shortDisplayName ?? away.team.displayName, hs, as });
    }
  })));
  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  const fresh = out.slice(0, cfg.max);
  try {
    const file = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
    if (fresh.length) {
      fs.mkdirSync(path.dirname(CACHE), { recursive: true });
      fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), items: fresh }));
      return fresh;
    }
    return file.items && Date.now() - file.at < CACHE_MAX_MS ? file.items.map((m: any) => ({ ...m, date: new Date(m.date) })) : [];
  } catch { return fresh; }
}

export const fmtDay = (d: Date) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(d);
