import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, hhmmToMinutes } from './util.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Chemins du projet. LGN_DATA_DIR / LGN_CONTENT_DIR permettent de rediriger les ecritures (simulation, tests). */
export function makePaths(root = ROOT, env = process.env) {
  return {
    root,
    config: path.join(root, 'config'),
    data: env.LGN_DATA_DIR ? path.resolve(env.LGN_DATA_DIR) : path.join(root, 'data'),
    content: env.LGN_CONTENT_DIR
      ? path.resolve(env.LGN_CONTENT_DIR)
      : path.join(root, 'site', 'src', 'content', 'articles'),
  };
}

function num(v, name) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Variable ${name} invalide: "${v}"`);
  return n;
}

export function loadConfig(paths = makePaths(), env = process.env) {
  const f = (name) => readJson(path.join(paths.config, name));
  const cfg = {
    engine: f('engine.json'),
    schedule: f('schedule.json'),
    editorial: f('editorial.json'),
    categories: f('categories.json').categories,
    sources: f('sources.json').feeds,
    evergreen: f('evergreen.json').themes,
    safety: f('safety.json'),
    control: f('control.json'),
  };
  // Les consignes de redaction sont des fichiers Markdown (config/prompts/), plus faciles a relire et a modifier.
  const prompt = (file) => fs.readFileSync(path.join(paths.config, file), 'utf8').trim();
  cfg.editorial.generatorSystemPrompt = prompt(cfg.editorial.generatorPromptFile);
  cfg.editorial.judgeSystemPrompt = prompt(cfg.editorial.judgePromptFile);
  // Surcharges par variables d'environnement (sans modifier le depot).
  if (env.GEMINI_MODEL) cfg.engine.gemini.generatorModel = env.GEMINI_MODEL;
  if (env.GEMINI_JUDGE_MODEL) cfg.engine.gemini.judgeModel = env.GEMINI_JUDGE_MODEL;
  if (env.BUDGET_DAILY_USD) cfg.engine.budget.dailyUsd = num(env.BUDGET_DAILY_USD, 'BUDGET_DAILY_USD');
  if (env.BUDGET_MONTHLY_USD) cfg.engine.budget.monthlyUsd = num(env.BUDGET_MONTHLY_USD, 'BUDGET_MONTHLY_USD');
  if (env.ENGINE_PAUSED === 'true') cfg.control.paused = true;
  return cfg;
}

/** Retourne la liste des problemes de configuration (vide = OK). */
export function checkConfig(cfg) {
  const problems = [];
  const s = cfg.schedule;
  try {
    const mins = s.slots.map(hhmmToMinutes);
    if (new Set(mins).size !== mins.length) problems.push('schedule.slots contient des doublons');
    if (s.slots.length > s.maxPerDay) problems.push(`schedule: ${s.slots.length} creneaux pour un maximum de ${s.maxPerDay}/jour`);
  } catch (e) {
    problems.push(`schedule: ${e.message}`);
  }
  if (!(s.maxPerDay >= 1)) problems.push('schedule.maxPerDay doit etre >= 1');
  const prices = cfg.engine.gemini.pricesUsdPerMillionTokens;
  for (const m of [cfg.engine.gemini.generatorModel, cfg.engine.gemini.judgeModel]) {
    if (!prices[m]) problems.push(`Aucun tarif configure pour le modele "${m}" (engine.json > gemini.pricesUsdPerMillionTokens)`);
  }
  const slugs = new Set(cfg.categories.map((c) => c.slug));
  for (const t of cfg.evergreen) if (!slugs.has(t.category)) problems.push(`evergreen ${t.id}: rubrique inconnue "${t.category}"`);
  for (const f of cfg.sources) if (!slugs.has(f.category)) problems.push(`source ${f.id}: rubrique inconnue "${f.category}"`);
  for (const c of cfg.editorial.priorityCategories) if (!slugs.has(c)) problems.push(`priorityCategories: rubrique inconnue "${c}"`);
  if (!(cfg.engine.budget.dailyUsd > 0) || !(cfg.engine.budget.monthlyUsd > 0)) problems.push('budget: plafonds quotidien et mensuel doivent etre > 0');
  if (!cfg.editorial.satireNotice?.trim()) problems.push('editorial.satireNotice est vide');
  if (!cfg.editorial.generatorSystemPrompt || cfg.editorial.generatorSystemPrompt.length < 500) problems.push('prompts/generator.md vide ou trop court');
  if (!cfg.editorial.judgeSystemPrompt) problems.push('prompts/judge.md vide');
  if (!cfg.editorial.generatorSystemPrompt.includes(cfg.editorial.publicationName)) problems.push('prompts/generator.md ne mentionne pas le nom du journal');
  for (const p of cfg.safety.blockedOutputPatterns) {
    try {
      new RegExp(p, 'iu');
    } catch {
      problems.push(`safety.blockedOutputPatterns: regex invalide ${p}`);
    }
  }
  return problems;
}
