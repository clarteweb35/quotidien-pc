import { sha1 } from './util.js';

/** SDK Gemini factice (meme interface que @google/genai) pour la simulation et les tests. Aucun reseau, aucun cout. */

const SENTENCES = [
  'Les services concernés ont immédiatement réagi en créant une cellule de réflexion chargée d\'examiner la question sous tous les angles, y compris ceux qui n\'existent pas.',
  'Selon un porte-parole fictif, la situation est parfaitement sous contrôle, ce qui explique que personne n\'ait pu la contrôler jusqu\'ici.',
  'Une habitante de Quimper, interrogée sur le sujet, a simplement haussé les épaules avant de retourner à sa conversation sur la météo.',
  'Des experts autoproclamés ont aussitôt annoncé que la question était complexe, ce qui reste leur conclusion la plus constante depuis vingt ans.',
  'Le calendrier prévoit une première réunion pour préparer la réunion suivante, laquelle statuera sur l\'opportunité de se réunir encore.',
  'Un rapport de quatre cents pages recommande donc, dans sa conclusion, la rédaction d\'un rapport complémentaire en trois exemplaires.',
  'Les réseaux sociaux se sont enflammés pendant près de onze minutes avant de passer, avec le même enthousiasme, à une histoire de chat.',
  'Un syndicat imaginaire a salué une avancée historique tout en réclamant, par principe, des garanties supplémentaires sur les garanties.',
  'Dans les couloirs, on assure que le dossier avance à pas de loup, un loup visiblement fatigué et muni d\'un ticket de stationnement.',
  'Le budget nécessaire est évalué à une somme considérable, arrondie à la hausse pour donner à chacun le sentiment d\'avoir été consulté.',
  'Les riverains, eux, demandent surtout qu\'on leur explique pourquoi la solution la plus simple est toujours celle qu\'on essaie en dernier.',
  'Un consultant en transformation a présenté un diaporama de quarante pages dont la dernière contenait une flèche pointant vers le futur.',
  'Une commission spéciale a été installée dans une salle dont personne ne retrouve plus la clé, ce qui retarde sensiblement les travaux.',
  'À la fin de la journée, tout le monde s\'est félicité du travail accompli, sans qu\'il soit possible de dire lequel exactement.',
  'Le ministère de l\'Absurde, entité parfaitement fictive, a confirmé suivre le dossier avec une attention modérée et une tasse de café tiède.',
  'Plusieurs spécialistes recommandent de ne rien changer tant que l\'on n\'aura pas établi un calendrier pour décider quand en reparler.',
  'Le public, partagé entre indifférence et fatigue, a salué l\'initiative d\'un applaudissement poli, presque administratif.',
  'Une étude réalisée auprès de personnes imaginaires révèle que neuf sur dix préfèrent que le problème se règle tout seul pendant le week-end.',
  'Le porte-parole a rappelé que la méthode reposait sur trois piliers : l\'écoute, la concertation et un quatrième pilier encore à définir.',
  'On notera enfin que la solution retenue présente l\'avantage considérable de ne déranger absolument personne, y compris le problème.',
  'Pour célébrer l\'événement, un buffet de petits fours a été organisé, dont l\'inventaire a donné lieu à un nouveau groupe de travail.',
  'Les observateurs les plus avertis y voient le signe d\'un tournant, ou d\'un rond-point, les deux se ressemblant beaucoup à cette heure.',
];

export function seededPick(seed, n) {
  let h = parseInt(sha1(seed, 8), 16) || 1;
  const pool = [...SENTENCES];
  const out = [];
  while (out.length < n && pool.length) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const base = pool.splice(h % pool.length, 1)[0].split(' ');
    // Mot propre a l'article tous les 5 mots: evite que deux articles simules se ressemblent (artefact du faux modele).
    out.push(base.flatMap((w, i) => (i % 5 === 4 ? [w, `zz${(h >> (i % 7)) % 997}`] : [w])).join(' '));
  }
  return out;
}

export function fakeArticleFor(prompt, categories) {
  const title = (/(?:Titre|THÈME) : (.+)/.exec(prompt)?.[1] ?? 'un sujet quelconque').trim();
  const seed = sha1(prompt);
  const cat = categories.includes(/RUBRIQUE SUGGÉRÉE : (\S+)/.exec(prompt)?.[1]) ? /RUBRIQUE SUGGÉRÉE : (\S+)/.exec(prompt)[1] : categories[0];
  const short = title.split(/\s+/).slice(0, 6).join(' ');
  const body = seededPick(seed, 17).map((text, i) => ({ kind: i === 4 ? 'h2' : 'p', text: i === 4 ? 'Une situation parfaitement maîtrisée' : text }));
  body.splice(5, 0, { kind: 'p', text: `Retour sur le sujet du jour, à savoir ${short}, qui occupe désormais l'essentiel des conversations de machine à café dans un rayon de trente kilomètres.` });
  return {
    status: 'ready_for_review',
    rejection_reason: '',
    fictional_elements: ['cellule de réflexion imaginaire', 'porte-parole fictif'],
    author: '',
    image_prompt: "Une salle de réunion vide où une pile de dossiers penche dangereusement près d'une plante verte, vue de dos",
    image_alt: "Dessin d'une salle de réunion vide et d'une pile de dossiers penchée",
    quality_checks: { facts_verified: true, fiction_clearly_satirical: true, no_invented_quotes: true, no_personal_attack: true, original_angle: true, no_known_duplicate: true },
    title: `Simulation ${seed.slice(0, 4)} : ${short} préoccupe une cellule de réflexion imaginaire`,
    chapo: `Une cellule de réflexion tout droit sortie de notre imagination s'empare de la question avec le plus grand sérieux, pour une fois.`,
    category: cat,
    tags: ['simulation', 'satire', cat],
    seo_description: `Article de simulation généré sans appel à l'API, à partir du sujet : ${short}.`.slice(0, 150),
    angle: 'fausse gravité administrative',
    body,
  };
}

/**
 * @param {{script?:(req:{kind:'generate'|'judge', n:number, prompt:string})=>any}} opts
 * script peut retourner: un objet (reponse JSON), une chaine (texte brut), ou lever une erreur ({status}).
 */
export function createFakeSdk({ categories, script, imageScript } = {}) {
  const counters = { generate: 0, judge: 0, image: 0, image_judge: 0, total: 0 };
  return {
    counters,
    interactions: {
      async create({ input }) {
        counters.image++;
        const custom = imageScript ? await imageScript({ n: counters.image, prompt: input }) : undefined;
        if (custom === 'empty') return {};
        const sharp = (await import('sharp')).default;
        const png = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#8f1d17' } }).png().toBuffer();
        return { output_image: { data: png.toString('base64'), mime_type: 'image/png' } };
      },
    },
    models: {
      async generateContent({ model, contents, config }) {
        const props = config.responseJsonSchema?.properties ?? {};
        const kind = props.real_person_likeness ? 'image_judge' : props.humor ? 'judge' : 'generate';
        counters[kind]++;
        counters.total++;
        let payload;
        const custom = script ? script({ kind, n: counters[kind], prompt: contents, model }) : undefined;
        if (custom !== undefined) payload = custom;
        else if (kind === 'image_judge') payload = { ok: true, real_person_likeness: false, text_or_logo: false, photorealistic_news_look: false, disturbing: false, problems: [] };
        else if (kind === 'judge') payload = { humor: 7, coherence: 8, risk: 1, problems: [], real_person_quote: false, defamation_risk: false };
        else payload = fakeArticleFor(contents, categories);
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
        return {
          text,
          candidates: [{ finishReason: payload?.__finish ?? 'STOP' }],
          usageMetadata: { promptTokenCount: Math.ceil(contents.length / 3) + 400, candidatesTokenCount: Math.ceil(text.length / 3), thoughtsTokenCount: 0 },
        };
      },
    },
  };
}

/** Flux RSS factices pour la simulation: aucune requete reseau. */
export function fakeFetcher(nowIso = new Date().toISOString()) {
  const item = (t, d, n) => `<item><title>${t}</title><link>https://exemple.test/a/${n}</link><description>${d}</description><pubDate>${new Date(nowIso).toUTCString()}</pubDate></item>`;
  const xml = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>${items.join('')}</channel></rss>`;
  const cache = {};
  return async (url) => {
    cache[url] ??= xml([
      item('Le gouvernement annonce un nouveau plan pour simplifier les formulaires administratifs', 'Un rapport propose de réduire le nombre de justificatifs demandés aux usagers lors des démarches en ligne.', sha1(url + 'a', 6)),
      item('Une étude révèle que les Français passent trop de temps en réunion', 'Selon un sondage publié ce matin, la réunion reste le premier poste de dépense de temps dans les entreprises.', sha1(url + 'b', 6)),
      item('Un accident mortel sur une route nationale fait trois victimes', 'Les secours sont intervenus ce matin.', sha1(url + 'c', 6)),
    ]);
    return cache[url];
  };
}
