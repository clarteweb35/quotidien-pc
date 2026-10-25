import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, round } from './util.js';

const EMPTY_STATE = { version: 1, topics: {}, slots: {}, lastRun: null };
const EMPTY_QUARANTINE = { items: [], history: [] };
const EMPTY_USAGE = { entries: [], monthly: {} };

/** Stockage JSON versionne dans le depot (aucune base de donnees supplementaire). */
export class Store {
  constructor(paths, { persist = true, persistUsage = true } = {}) {
    this.paths = paths;
    this.persist = persist;
    this.persistUsage = persistUsage;
    this.files = {
      state: path.join(paths.data, 'state.json'),
      quarantine: path.join(paths.data, 'quarantine.json'),
      usage: path.join(paths.data, 'usage.json'),
    };
    this.state = readJson(this.files.state, EMPTY_STATE);
    this.quarantine = readJson(this.files.quarantine, EMPTY_QUARANTINE);
    this.usage = readJson(this.files.usage, EMPTY_USAGE);
  }

  // ----- creneaux -----
  slot(date, idx) {
    return this.state.slots[date]?.[idx] ?? null;
  }
  setSlot(date, idx, patch) {
    this.state.slots[date] ??= {};
    this.state.slots[date][idx] = { ...(this.state.slots[date][idx] ?? { attempts: 0 }), ...patch };
    return this.state.slots[date][idx];
  }
  publishedCount(date) {
    return Object.values(this.state.slots[date] ?? {}).filter((s) => s.status === 'published').length;
  }

  // ----- sujets -----
  topic(id) {
    return this.state.topics[id] ?? null;
  }
  markTopic(id, patch) {
    this.state.topics[id] = { ...(this.state.topics[id] ?? {}), ...patch };
  }

  // ----- quarantaine / historique des rejets -----
  addRejection(entry) {
    this.quarantine.history.push(entry);
    if (this.quarantine.history.length > 500) this.quarantine.history.splice(0, this.quarantine.history.length - 500);
  }
  addQuarantine(item) {
    this.quarantine.items.push(item);
  }
  findQuarantine(id) {
    return this.quarantine.items.find((i) => i.id === id) ?? null;
  }

  // ----- consommation API -----
  recordUsage(entry) {
    this.usage.entries.push(entry);
    const m = (this.usage.monthly[entry.month] ??= { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 });
    m.costUsd = round(m.costUsd + entry.costUsd);
    m.inputTokens += entry.inputTokens;
    m.outputTokens += entry.outputTokens;
    m.calls += 1;
  }
  spentOnDate(date) {
    return round(this.usage.entries.filter((e) => e.date === date).reduce((s, e) => s + e.costUsd, 0));
  }
  spentInMonth(month) {
    return this.usage.monthly[month]?.costUsd ?? 0;
  }

  /** Purge les donnees anciennes pour garder des fichiers legers. */
  prune(todayIso, cfg) {
    const day = (iso) => Date.parse(iso + 'T00:00:00Z');
    const t = day(todayIso);
    const older = (iso, days) => t - day(iso) > days * 86400000;
    const memDays = Math.max(cfg.engine.topics.topicMemoryDays * 3, 30);
    for (const [id, tp] of Object.entries(this.state.topics)) {
      if (tp.seenAt && older(tp.seenAt.slice(0, 10), memDays)) delete this.state.topics[id];
    }
    for (const d of Object.keys(this.state.slots)) if (older(d, 60)) delete this.state.slots[d];
    const qd = cfg.engine.retention.quarantineDays;
    this.quarantine.items = this.quarantine.items.filter((i) => i.status === 'quarantined' || !older(i.createdAt.slice(0, 10), qd));
    this.usage.entries = this.usage.entries.filter((e) => !older(e.date, 62));
    if (this.persist) this.pruneFiles(todayIso, cfg.engine.retention);
  }

  /** Supprime les journaux (logDays) et bilans quotidiens (reportDays) trop anciens; le nom du fichier porte la date. */
  pruneFiles(todayIso, retention) {
    const t = Date.parse(todayIso + 'T00:00:00Z');
    for (const [dir, days] of [['logs', retention.logDays], ['reports', retention.reportDays ?? 180]]) {
      const folder = path.join(this.paths.data, dir);
      if (!fs.existsSync(folder)) continue;
      for (const f of fs.readdirSync(folder)) {
        const m = /^(?:[a-z-]+)?(\d{4}-\d{2}-\d{2})\.(?:jsonl|json)$/.exec(f);
        if (m && t - Date.parse(m[1] + 'T00:00:00Z') > days * 86400000) fs.rmSync(path.join(folder, f), { force: true });
      }
    }
  }

  /** Le cout reel d'un appel est toujours enregistre, meme en simulation a blanc (dry-run). */
  saveUsage() {
    if (this.persistUsage) writeJson(this.files.usage, this.usage);
  }

  save() {
    if (!this.persist) return;
    writeJson(this.files.state, this.state);
    writeJson(this.files.quarantine, this.quarantine);
    writeJson(this.files.usage, this.usage);
  }

  /** Verrou local contre les executions simultanees (en plus du groupe de concurrence GitHub). */
  acquireLock(maxAgeMs = 20 * 60 * 1000) {
    if (!this.persist) return () => {};
    const lock = path.join(this.paths.data, '.lock');
    fs.mkdirSync(this.paths.data, { recursive: true });
    try {
      const age = Date.now() - fs.statSync(lock).mtimeMs;
      if (age < maxAgeMs) throw new Error(`Verrou actif (${Math.round(age / 1000)}s): une autre execution est en cours`);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    fs.writeFileSync(lock, String(process.pid));
    return () => fs.rmSync(lock, { force: true });
  }
}
