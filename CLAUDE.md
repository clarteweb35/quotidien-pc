# CLAUDE.md

## Projet

**Le Quotidien Presque Certain** (`quotidien-pc.fr`, éditeur Clarté Web) : journal satirique français automatisé. Le moteur (`engine/`, Node 22) rédige 5 articles par jour avec l'API Gemini, les contrôle, puis les commit dans le dépôt ; le site (`site/`, Astro, 100 % statique) les affiche. Aucun serveur, aucune base : le dépôt Git sert de CMS et de base de données.

Spécification fonctionnelle : [.ai/SPEC_FONCTIONNALITES.md](.ai/SPEC_FONCTIONNALITES.md) (à lire avant toute évolution, et à tenir à jour). Règles d'architecture (SSOT, DRY, KISS, sécurité, garde-fous éditoriaux) et format de revue : [.ai/SYSTEM_PROMPT_GARDIEN_ARCHITECTURE.md](.ai/SYSTEM_PROMPT_GARDIEN_ARCHITECTURE.md). Architecture et décisions : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Exploitation : [docs/EXPLOITATION.md](docs/EXPLOITATION.md). Déploiement : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## Structure

- `engine/src/` : moteur éditorial (collecte RSS, choix du sujet et rotation des rubriques, génération, validation, publication, planification, réseaux sociaux). `engine/test/` : tests `node:test`, dont `site.test.js` qui construit le site hors ligne.
- `config/categories.json` : les rubriques. Options : `menuTete` (affichée juste après « À la une » dans le menu, mise en valeur, ex. Éditos), `sourceCategories` (puise ses sujets dans d'autres rubriques). « Jeux » et « Petites annonces » ne sont pas des rubriques d'articles : pages statiques `site/src/pages/jeux.astro` et `petites-annonces.astro` (données des annonces dans `config/annonces.json`, jamais en dur dans la page). Même principe pour `rencontres.astro` (données dans `config/rencontres.json` ; numéros RÉF. stables : ne jamais renuméroter ni réutiliser un numéro retiré).
- `config/` : tous les réglages éditables (JSON) : `engine`, `schedule`, `editorial`, `categories`, `sources`, `evergreen`, `journalists`, `safety`, `control`, `social`, `legal`, `marches`, `sport`, `promos`, `prompts/`.
- `data/` : état du moteur, quarantaine, coûts, bilans, journaux. **Écrit par le moteur**, jamais à la main (sauf `data/images-manuelles.md`).
- `site/src/` : `pages/` (accueil, articles, rubriques, tags, rédaction, plan du site, mentions légales, admin, flux RSS, sitemap), `components/`, `lib/`, `layouts/Base.astro` (en-tête, menu, pied de page), `styles/global.css`, `content/articles/*.md` (articles publiés).
- `scripts/` : génération des visuels de marque, des portraits et des photos de bureaux (`make-*.mjs`, sources fournies en argument).
- `.github/workflows/` : `editor.yml` (cron du moteur), `annonces.yml` (génération d'annonces à la demande), `deploy.yml` (build et mise en ligne), `ci.yml` (tests), `social.yml`.

## Commandes

- `npm test` : tests du moteur et de la construction du site. À lancer après tout changement.
- `node engine/src/cli.js check-config` : valide la configuration. `node engine/src/cli.js simulate` : journée simulée avec un faux Gemini.
- `npm run site:dev` / `npm run site:build` : site en local / build.
- `MARCHES_OFFLINE=1` : build sans réseau (cours, scores, titres éco masqués) ; utilisé par les tests.

## Règles impératives (contenu)

- Le journal est **satirique et fictif**. Jamais de citation inventée attribuée à une personne réelle, jamais de sujet sensible (drames, faits divers douloureux), jamais présenter une fiction comme un fait réel. Les journalistes sont des **personnages fictifs** ; leurs portraits et les photos de bureaux sont **générés par IA** et signalés comme tels.
- Le **vrai** (cours de bourse, scores sportifs, titres d'actualité) est affiché avec une étiquette « données réelles, hors satire » et un lien vers la source ; le **faux** (compteurs, gains PMU, météo bidon…) ne doit jamais être présenté comme réel. La pastille « Fiction » est obligatoire quand du faux côtoie du vrai (Économie, Sport, accueil, Compteurs).
- Ne jamais afficher un score de qualité (EcoIndex, Website Carbon, PageSpeed) non vérifié : les valeurs et la date sont des constantes dans `Base.astro` (`quality`, `qualityDate`), à mettre à jour après chaque nouvelle mesure.
- Dans Petites annonces, une annonce qui renvoie vers un **vrai site** porte `reel: true` et l'étiquette « Vraie annonce » : elle n'est jamais présentée comme fictive (identification de la publicité, cf. mentions légales).
- Ne pas contourner les contrôles du moteur (validateur, relecteur, quarantaine, plafonds de budget).
- L'adresse `recrutement@quotidien-pc.fr` est **fictive** (précisé dans les mentions légales) ; `redaction@` et `postmaster@` sont réelles.

## Conventions

- Langue : français (UI, commentaires, docs). Vouvoiement dans l'interface.
- Style : CSS dans `global.css` et blocs `<style>` de composants Astro ; JS vanilla, **aucune librairie ni dépendance ajoutée** ; animations en CSS pur, désactivées si l'utilisateur demande de réduire les animations.
- Accessibilité : conserver `aria-*`, `role`, `alt` (les portraits et photos IA ont un alt explicite), liens externes en `rel="noopener"`.
- Performance : garder les scores PageSpeed (99-100) et **EcoIndex : B (80/100, mesure du 26/10, 337 éléments) accepté par l'éditeur ; seuil du A = ~330 éléments sur l'accueil, à ne pas chercher au prix des fonctionnalités** (compter les balises avant de grossir la page ; les bandeaux défilants doublent leur contenu) ; pas d'image ni de script externe, **sauf Google Analytics 4 (`G-XV5HSQ5YKX`), chargé uniquement après acceptation du bandeau de consentement** (jamais d'office : ne pas coller la balise gtag brute dans les pages) ; hauteurs fixes pour les bandeaux animés (pas de décalage de mise en page).
- Commentaires de code courts, en français, qui expliquent le pourquoi.

## Travailler ici (important)

- **Après chaque changement demandé : tester (`npm test`), commiter et pousser sur `main` sans redemander.** Un commit par demande, message court en français. `git pull --rebase` avant le push (le moteur éditorial pousse aussi sur `main`). Ne pas pousser si les tests échouent. Le push déclenche le déploiement GitHub Pages.
- Vérifier visuellement quand c'est possible : `npx astro preview` puis Chrome en mode sans interface (`chrome --headless=new --screenshot=… http://localhost:…/`). Largeur minimale sous Chrome sans interface : 500 px.
- Pièges Windows / shell : dans un `node -e "…"` ou un heredoc non protégé, les **accents graves (backticks) sont interprétés par le shell** ; écrire les scripts dans un fichier ou utiliser les outils Write/Edit. Une apostrophe dans une chaîne `'…'` casse un fichier de test.
- `data/` est écrit par le moteur : après un `git pull`, de nouveaux commits `editor: cycle …` sont normaux.
- Ne jamais lancer de sous-agents ni de workflow multi-agents sans demander d'abord.

## system prompt

Avant implementation lis [.ai/SYSTEM_PROMPT_GARDIEN_ARCHITECTURE.md](.ai/SYSTEM_PROMPT_GARDIEN_ARCHITECTURE.md)

## Agents

Ne jamais lancer de sous-agents ni de workflow multi-agents sans me demander d'abord. Obligatoire, sans exception.

## Niveaux d'action

Je prefixe ma demande par un tag. Sans tag, appliquer `[strict]` par defaut.

- `[consultatif]` — Ne modifie aucun fichier. Explique ce que tu ferais et attends ma validation.
- `[strict]` — Avant de coder : dis quoi, pourquoi, comment, et dans quels fichiers. Puis code.
- `[rapide]` — Code directement, explication minimale. Interdit de toucher a l'architecture (decoupage des fichiers, dependances, build, deploiement). Si le changement l'exige, arrete-toi et repasse en `[strict]`.

## Mise a jour de la spec

Apres tout ajout ou modification de contenu ou de fonctionnalite visible par un visiteur, mettre a jour [.ai/SPEC_FONCTIONNALITES.md](.ai/SPEC_FONCTIONNALITES.md) dans la meme intervention. Ne pas documenter les refactos internes sans impact visible.

**Des qu'une action commence** (avant de modifier le moindre fichier), l'inscrire dans la section "Travaux en cours" en bas de la spec : date, objectif, fichiers concernes, etapes faites / restantes, mises a jour au fil de l'eau. La retirer une fois l'action terminee et mise en ligne. But : ne rien perdre si l'intervention plante.

## Mise en ligne

Apres toute modification du site que je demande : verifier (`npm test`, qui construit aussi le site hors ligne), puis **commiter et pousser sur `main` directement, sans me demander** si je souhaite la mise en ligne (le push deploie le site). Ne commiter que les fichiers de la tache (`git add` nominatif, jamais `git add -A`) : d'autres modifications en attente peuvent exister, les laisser telles quelles. Retirer l'entree de « Travaux en cours » dans le meme commit. Ne vaut que pour le site, pas pour les outils hors depot (ex. ThotSync dans `ressources/`).

## explication du code

Codeur novice. Ne pas etre trop technique dans tes explications de code.

## Reprise de session

Au début de chaque session, lire [.ai/AVANCEMENT.md](.ai/AVANCEMENT.md) (où on en est, prochaine action). Le mettre à jour à la fin de chaque étape.