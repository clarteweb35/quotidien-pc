import sharp from 'sharp';
import { zonedParts, normalizeText, round } from './util.js';
import { protectedAliases } from './validator.js';

/**
 * Illustration facultative d'un article (Gemini image). Principe: une image n'est JAMAIS un motif de blocage.
 * Toute erreur (budget, quota, refus du modele, image douteuse) => null => l'article garde sa couverture typographique.
 */

export const imageJudgeSchema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true si l\'image est publiable telle quelle' },
    real_person_likeness: { type: 'boolean', description: 'visage ou silhouette evoquant une personne reelle identifiable' },
    text_or_logo: { type: 'boolean', description: 'texte lisible, logo ou marque visibles' },
    photorealistic_news_look: { type: 'boolean', description: 'ressemble a une vraie photo d\'actualite pouvant tromper' },
    disturbing: { type: 'boolean', description: 'violence, nudite, contenu choquant' },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'real_person_likeness', 'text_or_logo', 'photorealistic_news_look', 'disturbing', 'problems'],
};

/** Controle du texte de consigne image fourni par le redacteur, avant tout appel payant. */
export function checkImagePrompt(article, topic, cfg) {
  const im = cfg.images ?? cfg.engine.images;
  const p = String(article.image_prompt ?? '').trim();
  const alt = String(article.image_alt ?? '').trim();
  if (p.length < 20 || p.length > im.promptMaxChars) return 'consigne_image_longueur';
  if (alt.length < 10 || alt.length > 160) return 'texte_alternatif_longueur';
  if (/https?:\/\/|<|>/.test(p + alt)) return 'consigne_image_markup';
  const n = ` ${normalizeText(p)} `;
  if (/\b(photo|photographie|photorealiste|realiste|hyperrealiste|portrait de|ressemblant)\b/.test(n)) return 'consigne_image_photoreel';
  const names = protectedAliases(topic, cfg.safety).filter((a) => a.length >= 4);
  if (names.some((a) => n.includes(` ${a} `))) return 'consigne_image_personne_reelle';
  return null;
}

function buildImagePrompt(article, im) {
  return [im.styleGuide, `Scène à illustrer : ${article.image_prompt.trim()}`, im.constraints].join('\n');
}

function extractBase64(res) {
  if (res?.output_image?.data) return res.output_image.data; // API Interactions
  const parts = res?.candidates?.[0]?.content?.parts ?? []; // generateContent
  return parts.find((p) => p.inlineData?.data)?.inlineData.data ?? null;
}

async function callImageModel(client, im, prompt) {
  const ai = client.ai;
  if (im.api === 'generateContent') {
    return ai.models.generateContent({
      model: im.model,
      contents: prompt,
      config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: im.aspectRatio, imageSize: im.imageSize }, httpOptions: { timeout: im.timeoutMs } },
    });
  }
  return ai.interactions.create({
    model: im.model,
    input: prompt,
    response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: im.aspectRatio, image_size: im.imageSize },
  });
}

/** L'image est-elle prevue pour ce creneau, et le plafond du jour est-il respecte ? */
export function imageWanted({ cfg, slot, existing, now }) {
  const im = cfg.engine.images;
  if (!im?.enabled) return false;
  if (!im.slotIndexes.includes(slot.idx)) return false;
  const day = zonedParts(now, cfg.schedule.timezone).date;
  const done = existing.filter((e) => e.image && zonedParts(new Date(e.publishedAt), cfg.schedule.timezone).date === day).length;
  return done < im.perDayMax;
}

/**
 * @returns {Promise<{buffer:Buffer, alt:string, credit:string}|null>}
 */
export async function illustrate({ client, cfg, article, topic, logger, slotKey }) {
  const im = cfg.engine.images;
  const reason = checkImagePrompt(article, topic, { ...cfg, images: im });
  if (reason) {
    logger.warn('image.skipped', { slot: slotKey, reason });
    return null;
  }
  try {
    client.assertBudget(im.priceUsdPerImage + 0.002); // image + sa relecture
  } catch (e) {
    logger.warn('image.skipped', { slot: slotKey, reason: 'budget', error: e.message });
    return null;
  }

  let raw = null;
  for (let attempt = 0; attempt <= im.maxRetries && !raw; attempt++) {
    try {
      const wait = client.lastCallAt + cfg.engine.gemini.minDelayBetweenCallsMs - Date.now();
      if (wait > 0) await client.sleep(wait);
      client.lastCallAt = Date.now();
      const res = await callImageModel(client, im, buildImagePrompt(article, im));
      raw = extractBase64(res);
      // L'image est facturee des qu'elle est produite (ou meme refusee en sortie): on enregistre avant de la juger.
      const { date, month } = zonedParts(client.now(), cfg.schedule.timezone);
      client.store.recordUsage({
        ts: client.now().toISOString(), date, month, runId: client.runId, purpose: 'image', model: im.model,
        params: { aspectRatio: im.aspectRatio, imageSize: im.imageSize }, inputTokens: 0, outputTokens: 0, costUsd: round(im.priceUsdPerImage),
      });
      client.store.saveUsage();
      if (!raw) logger.warn('image.empty', { slot: slotKey, attempt: attempt + 1 });
    } catch (err) {
      const status = err?.status ?? err?.code;
      logger.warn('image.error', { slot: slotKey, attempt: attempt + 1, status: status ?? 'network', error: String(err.message).slice(0, 200) });
      if ([400, 401, 403, 404].includes(status)) return null; // inutile de reessayer
      await client.sleep(cfg.engine.gemini.retryBaseDelayMs * 2 ** attempt);
    }
  }
  if (!raw) return null;

  let buffer;
  try {
    buffer = await sharp(Buffer.from(raw, 'base64'))
      .resize({ width: im.outputWidth, height: Math.round((im.outputWidth * 9) / 16), fit: 'cover' })
      .webp({ quality: im.webpQuality })
      .toBuffer();
  } catch (err) {
    logger.warn('image.invalid', { slot: slotKey, error: String(err.message).slice(0, 200) });
    return null;
  }

  // Relecture de l'image par le modele de relecture (aide a la decision, jamais une preuve).
  try {
    const { data } = await client.generateJson({
      purpose: 'image_judge',
      model: cfg.engine.gemini.judgeModel,
      system: 'Tu contrôles une illustration destinée à un journal satirique français. Tu réponds uniquement selon le schéma. Sois strict : au moindre doute sur une personne réelle reconnaissable, un texte ou logo lisible, un rendu de fausse photo d\'actualité ou un contenu choquant, mets ok=false.',
      prompt: `Illustration de l'article « ${article.title} ». Scène demandée : ${article.image_prompt}`,
      schema: imageJudgeSchema,
      params: cfg.engine.gemini.judge,
      image: { mimeType: 'image/webp', data: buffer.toString('base64') },
    });
    if (!data.ok || data.real_person_likeness || data.text_or_logo || data.photorealistic_news_look || data.disturbing) {
      logger.warn('image.rejected', { slot: slotKey, problems: (data.problems ?? []).slice(0, 5), flags: { person: data.real_person_likeness, text: data.text_or_logo, photo: data.photorealistic_news_look, disturbing: data.disturbing } });
      return null;
    }
  } catch (err) {
    logger.warn('image.judge_unavailable', { slot: slotKey, error: String(err.message).slice(0, 200) });
    return null; // sans relecture exploitable, on ne publie pas l'image
  }

  logger.info('image.ok', { slot: slotKey, bytes: buffer.length, costUsd: im.priceUsdPerImage });
  return { buffer, alt: article.image_alt.trim(), credit: im.credit };
}
