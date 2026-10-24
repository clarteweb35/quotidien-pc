import { GoogleGenAI } from '@google/genai';
import { sleep, zonedParts, round } from './util.js';

export class BudgetExceededError extends Error {
  constructor(msg) { super(msg); this.name = 'BudgetExceededError'; }
}
/** Quota/limite de debit epuise apres les nouvelles tentatives: on arrete le cycle. */
export class QuotaError extends Error {
  constructor(msg) { super(msg); this.name = 'QuotaError'; }
}
/** Cle invalide, permission refusee, modele inconnu: inutile de reessayer. */
export class FatalGeminiError extends Error {
  constructor(msg) { super(msg); this.name = 'FatalGeminiError'; }
}
/** Reponse vide, tronquee ou non conforme au JSON: defaut corrigeable par un nouvel essai. */
export class MalformedResponseError extends Error {
  constructor(msg) { super(msg); this.name = 'MalformedResponseError'; }
}

const RETRYABLE = new Set([408, 500, 502, 503, 504]);

export function computeCostUsd(prices, model, inputTokens, outputTokens) {
  const p = prices[model];
  if (!p) throw new FatalGeminiError(`Aucun tarif configure pour le modele "${model}"`);
  return round((inputTokens * p.input + outputTokens * p.output) / 1_000_000);
}

/**
 * Client Gemini (SDK officiel @google/genai) avec: sortie JSON structuree, nouvelles tentatives limitees,
 * respect d'un delai minimal entre appels, mesure des jetons, plafonds budgetaires quotidien et mensuel.
 * La cle API n'est lue que depuis l'environnement et n'est jamais journalisee.
 */
export class GeminiClient {
  constructor({ cfg, store, logger, runId, now = () => new Date(), apiKey = process.env.GEMINI_API_KEY, sdk }) {
    if (!sdk && !apiKey) throw new FatalGeminiError('GEMINI_API_KEY absente de l\'environnement');
    this.cfg = cfg;
    this.store = store;
    this.logger = logger;
    this.runId = runId;
    this.now = now;
    this.ai = sdk ?? new GoogleGenAI({ apiKey });
    this.lastCallAt = 0;
    this.sleep = sleep;
  }

  budgetStatus() {
    const tz = this.cfg.schedule.timezone;
    const { date, month } = zonedParts(this.now(), tz);
    const b = this.cfg.engine.budget;
    return {
      date,
      month,
      dayUsd: this.store.spentOnDate(date),
      monthUsd: this.store.spentInMonth(month),
      dayCap: b.dailyUsd,
      monthCap: b.monthlyUsd,
    };
  }

  assertBudget(estimateUsd) {
    const s = this.budgetStatus();
    if (s.dayUsd + estimateUsd > s.dayCap) {
      throw new BudgetExceededError(`Plafond quotidien atteint (${s.dayUsd.toFixed(4)} + ~${estimateUsd.toFixed(4)} > ${s.dayCap} USD)`);
    }
    if (s.monthUsd + estimateUsd > s.monthCap) {
      throw new BudgetExceededError(`Plafond mensuel atteint (${s.monthUsd.toFixed(4)} + ~${estimateUsd.toFixed(4)} > ${s.monthCap} USD)`);
    }
  }

  /**
   * @param {{purpose:string, model:string, system:string, prompt:string, schema:object, params:object}} req
   * @returns {Promise<{data:object, usage:object}>}
   */
  async generateJson({ purpose, model, system, prompt, schema, params }) {
    const g = this.cfg.engine.gemini;
    let text = prompt;
    if (text.length > g.maxInputChars) {
      this.logger.warn('gemini.input_truncated', { purpose, from: text.length, to: g.maxInputChars });
      text = text.slice(0, g.maxInputChars);
    }
    const prices = g.pricesUsdPerMillionTokens;
    // Estimation pessimiste avant l'appel: 1 jeton ~ 3 caracteres, sortie au maximum autorise.
    const estimate = computeCostUsd(prices, model, Math.ceil((text.length + system.length) / 3), params.maxOutputTokens);
    this.assertBudget(estimate);

    const { extraConfig = {}, ...gen } = params;
    const config = {
      ...extraConfig,
      systemInstruction: system,
      temperature: gen.temperature,
      maxOutputTokens: gen.maxOutputTokens,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      httpOptions: { timeout: g.requestTimeoutMs },
    };

    let lastErr;
    for (let attempt = 0; attempt <= g.maxRetries; attempt++) {
      const wait = this.lastCallAt + g.minDelayBetweenCallsMs - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastCallAt = Date.now();
      try {
        const res = await this.ai.models.generateContent({ model, contents: text, config });
        return this.#handle(res, { purpose, model, params: gen, prices });
      } catch (err) {
        if (err instanceof MalformedResponseError || err instanceof BudgetExceededError || err instanceof FatalGeminiError) throw err;
        lastErr = err;
        const status = err?.status ?? err?.code;
        if (status === 401 || status === 403 || status === 404 || status === 400) {
          throw new FatalGeminiError(`Gemini HTTP ${status}: ${String(err.message).slice(0, 300)}`);
        }
        const retryable = status === 429 || RETRYABLE.has(status) || !status; // pas de statut = erreur reseau/timeout
        if (!retryable || attempt === g.maxRetries) break;
        const delay = g.retryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 1000);
        this.logger.warn('gemini.retry', { purpose, status: status ?? 'network', attempt: attempt + 1, delayMs: delay });
        await this.sleep(delay);
      }
    }
    const status = lastErr?.status ?? lastErr?.code;
    if (status === 429) throw new QuotaError(`Quota Gemini epuise ou limite de debit (HTTP 429): ${String(lastErr.message).slice(0, 200)}`);
    throw new FatalGeminiError(`Echec Gemini apres ${g.maxRetries + 1} tentatives: ${String(lastErr?.message).slice(0, 300)}`);
  }

  #handle(res, { purpose, model, params, prices }) {
    const u = res.usageMetadata ?? {};
    const inputTokens = u.promptTokenCount ?? 0;
    // Les jetons de reflexion sont factures comme des jetons de sortie.
    const outputTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
    const costUsd = computeCostUsd(prices, model, inputTokens, outputTokens);
    const { date, month } = zonedParts(this.now(), this.cfg.schedule.timezone);
    const usage = { ts: this.now().toISOString(), date, month, runId: this.runId, purpose, model, params, inputTokens, outputTokens, costUsd };
    this.store.recordUsage(usage);
    this.store.saveUsage(); // le cout est persiste immediatement, meme si le cycle echoue ensuite
    this.logger.info('gemini.call', { purpose, model, inputTokens, outputTokens, costUsd });

    const finish = res.candidates?.[0]?.finishReason;
    const raw = res.text;
    if (!raw) throw new MalformedResponseError(`Reponse vide (finishReason=${finish ?? 'inconnu'})`);
    if (finish && finish !== 'STOP') throw new MalformedResponseError(`Generation interrompue (finishReason=${finish})`);
    try {
      return { data: JSON.parse(raw), usage };
    } catch {
      throw new MalformedResponseError('Reponse non conforme: JSON invalide');
    }
  }
}
