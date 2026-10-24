import type { APIRoute } from 'astro';

// Identifiant du commit reellement construit: le moteur de partage verifie qu'il contient l'article (et son image) avant de poster.
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ sha: process.env.BUILD_SHA ?? null, builtAt: new Date().toISOString() }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
