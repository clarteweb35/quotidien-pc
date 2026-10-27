/**
 * Generation d'image par Cloudflare Workers AI (API REST, sans dependance).
 * Secrets: CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN (jeton avec la permission « Workers AI »).
 * Les modeles FLUX renvoient du JSON { result: { image: <base64> } }; les modeles Stable Diffusion renvoient l'image brute.
 * Toute erreur HTTP est levee avec .status, comme pour Gemini, pour que images.js applique les memes regles de nouvel essai.
 */
export async function cloudflareImageBase64({ prompt, model, steps, timeoutMs = 90000, env = process.env, fetchFn = globalThis.fetch }) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    const e = new Error('CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN absent de l\'environnement');
    e.status = 401;
    throw e;
  }
  const res = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...(steps ? { steps } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300);
    const e = new Error(`Cloudflare Workers AI HTTP ${res.status}: ${body}`);
    e.status = res.status;
    throw e;
  }
  if ((res.headers.get('content-type') ?? '').startsWith('image/')) return Buffer.from(await res.arrayBuffer()).toString('base64');
  const json = await res.json();
  return json?.result?.image ?? null;
}
