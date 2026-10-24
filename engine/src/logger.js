import path from 'node:path';
import { appendLine } from './util.js';

export function redact(text) {
  return String(text)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]') // cles Google API
    .replace(/ghp_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}/g, '[REDACTED]')
    .replace(/(api[_-]?key|token|authorization|secret|password)(["'\s:=]+)[^\s"',}]{8,}/gi, '$1$2[REDACTED]');
}

/** Journal JSONL (un fichier par jour) + sortie console. Les secrets sont masques. */
export function createLogger({ dataDir, runId, now = () => new Date(), quiet = false, filePrefix = '' }) {
  const entries = [];
  function log(level, event, fields = {}) {
    const ts = now().toISOString();
    const entry = { ts, runId, level, event, ...fields };
    const line = redact(JSON.stringify(entry));
    entries.push(JSON.parse(line));
    try {
      appendLine(path.join(dataDir, 'logs', `${filePrefix}${ts.slice(0, 10)}.jsonl`), line);
    } catch {
      /* le journal ne doit jamais faire echouer un cycle */
    }
    if (!quiet) {
      const extra = Object.keys(fields).length ? ' ' + redact(JSON.stringify(fields)) : '';
      (level === 'error' ? console.error : console.log)(`[${level}] ${event}${extra}`);
    }
  }
  return {
    info: (e, f) => log('info', e, f),
    warn: (e, f) => log('warn', e, f),
    error: (e, f) => log('error', e, f),
    entries,
  };
}
