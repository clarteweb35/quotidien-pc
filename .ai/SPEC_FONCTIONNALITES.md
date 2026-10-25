# Spécification fonctionnelle — Le Quotidien Presque Certain

À tenir à jour à chaque évolution. Légende : ✅ en ligne · 🚧 prévu · ⚠️ limite connue.

## 1. Moteur éditorial (`engine/`, GitHub Actions)

| Fonction | Détail | État |
|---|---|---|
| Planification | 8 créneaux par jour (Europe/Paris), cron toutes les 30 min, rattrapage borné, plafond `maxPerDay` | ✅ |
| Collecte | flux RSS (`config/sources.json`) : franceinfo, Le Monde (une, éco, pixels, culture, sport, planète, politique, international), Libération, France 24 | ✅ |
| Sujets | exclusion des sujets sensibles, dédoublonnage (similarité des titres), mémoire 14 jours, thèmes intemporels (`evergreen.json`) en secours | ✅ |
| Rotation des rubriques | à chaque créneau, la rubrique la moins publiée sur 36 h est servie (actu de ses flux, sinon thème intemporel de la rubrique, sinon n'importe quel sujet) ; la rubrique est **imposée** au modèle et revérifiée | ✅ |
| Génération | Gemini (SDK officiel), sortie JSON structurée, signature choisie dans le service de la rubrique | ✅ |
| Validation | contrôles déterministes bloquants + relecteur Gemini ; échec => une nouvelle tentative puis quarantaine | ✅ |
| Publication | article `.md` + état dans le même commit, idempotent | ✅ |
| Budget | plafonds jour/mois, coût de chaque appel enregistré | ✅ |
| Purge | `data/logs` 30 jours, `data/reports` 180 jours, quarantaine 30 jours | ✅ |
| Images | illustrations IA (désactivées par défaut, payantes) ; images manuelles `site/src/assets/manual/<réf>.jpg` prioritaires | ✅ |
| Réseaux sociaux | Bluesky actif ; Mastodon et Telegram prêts, désactivés (`config/social.json`) | ✅ |
| Pause | `config/control.json` (`paused`) | ✅ |

## 2. Site public (`site/`, Astro statique)

### 2.1 Pages
| Page | Contenu | État |
|---|---|---|
| Accueil `/` | fil « À l'instant » (titres qui défilent) ; bandeau des cours (sens inverse) ; article à la une ; météo des capitales (bidon, 6 villes) ; 7 dernières nouvelles (pas d'extraits par rubrique : le menu les propose, et la page reste légère) | ✅ |
| Article `/articles/<slug>/` | titre, chapô, signature avec petit portrait, illustration, corps justifié, partage, mots-clés, sources, barre de progression de lecture, JSON-LD `SatiricalArticle` | ✅ |
| Rubrique `/rubrique/<slug>/` | 9 rubriques (dont Éditos) ; bandeaux propres à chaque rubrique (voir 2.3) | ✅ |
| Éditos `/rubrique/editos/` | 9e rubrique, placée **après Compteurs** dans le menu : l'avis complètement débile du rédacteur en chef (Jean-Eudes de la Manchette, seul signataire) sur un fait de société ou de politique internationale. Le moteur la sert comme les autres rubriques (rotation), avec des sujets pris dans les flux société et monde (`sourceCategories`), un format édito imposé dans la consigne et trois thèmes intemporels de secours | ✅ |
| Petites annonces `/petites-annonces/` | rubrique de petites annonces satiriques (menu : après Éditos, avant Jeux). 38 annonces en 8 catégories (32 fictives + 6 « vraies annonces » : Relais de Chaumeré, Clarté Web, Repères de Droit, Arc-en-Ciel Services, Une vie de foot, Tro-Dro — étiquette « Vraie annonce », titre et lien cliquables vers le vrai site, textes réécrits et distincts de ceux des sites, mention de pied adaptée) dans `config/annonces.json` (SSOT), 5 annonceurs récurrents (Cabinet Évidence & Associés, Zéro-Tâche SAS, bureau paritaire de certification des certifications, Agence Espace & Concept, Miraculex®). 4 formats : classique, court (style journal papier), vedette, encart publicitaire (marque, promesse, prix, petits caractères). 3 dessins au trait dans `site/public/annonces/`. Filtres par catégorie + recherche texte (sans rechargement), liens profonds `?cat=` et `?q=`, compteur. « Déposer une annonce » : formulaire qui **ouvre la messagerie** (mailto vers `redaction@`), aucun backend, rien n'est publié automatiquement. Mention « fictives et satiriques » en pied | ✅ |
| Jeux `/jeux/` | dernier élément du menu : **sudoku** jouable (grilles générées dans le navigateur, solution unique, 3 niveaux, vérifier / indice / solution, clavier, chrono), mémory du bureau, plus ou moins « le budget secret », réflexes « le café est prêt ». Tout en local, sans cookie ni requête externe | ✅ |
| Compteurs `/compteurs/` | toutes les jauges : **d'abord les fictives**, **ensuite les réelles** (cours, scores), chaque partie étiquetée | ✅ |
| Rédaction `/redaction/` | Direction (Jean-Eudes de la Manchette), services (portrait de chaque journaliste, photo du bureau « prise à 16 h 53 … 17 h 02, bureaux vides »), Secrétariat, Coulisses (Lucas Dumond), encart de recrutement fictif | ✅ |
| Plan du site, `sitemap.xml` (+ `sitemap-index.xml`, `lastmod` des articles), `robots.txt`, `rss.xml` | référencement et navigation | ✅ |
| Mentions légales | éditeur, hébergeur, contact (`redaction@`), signalement/droit de réponse (`postmaster@`), recrutement fictif, données personnelles | ✅ |
| À propos, 404, tags, `/admin/` (panneau qui pilote le dépôt via l'API GitHub), `/build.json` | | ✅ |

### 2.2 Éléments communs (`Base.astro`)
- Bandeau « Journal satirique », logo, date **et heure de Paris en direct**, menu (8 rubriques + Compteurs).
- Pied de page compact : logo + avertissement satirique + liens (rédaction, à propos, mentions légales, plan du site, RSS) ; dernière ligne : copyright à gauche, « Un site léger et accessible, mesuré le 25 octobre 2026 » et pastilles **EcoIndex A, Website Carbon A, PageSpeed 100** à droite (HTML/CSS pur, liens vers les analyses, aucune image ni requête externe).
- Corps d'article **justifié** (y compris mobile), titres et chapôs non justifiés.
- Animations sobres (CSS pur) : zoom au survol, apparition des cartes, léger zoom de la une, transitions de page (Chrome/Edge), tout coupé si « réduire les animations ».

### 2.3 Bandeaux par rubrique (`Marches`, `Resultats`, `Gimmick`)
Données **réelles** (étiquetées « hors satire », source citée, hors-ligne = masqué, cache 48 h) :

| Où | Bandeau |
|---|---|
| Économie, accueil | cours défilants (CAC 40, indices, valeurs du CAC, euro/dollar, Brent, or) via Yahoo Finance, chaque valeur liée à sa fiche ; en Économie, « À lire ailleurs » (titres du fil éco du Monde) et « Il y a N ans » sous les articles |
| Sport | résultats Ligue 1, Ligue des champions et grands clubs (ESPN, 5 derniers jours) |

Données **fictives** (pastille « Fiction » seulement quand du réel est à côté) :

| Rubrique | Bandeau |
|---|---|
| Économie | gains et pertes PMU : prénom, initiale, ville, « gains de » / « perte de » ; 1 gain sur 3 ; gains 0,10 à 2 € ou 3 à 58 € ; pertes surtout 10 à 98 € (jusqu'à 876 €) ; centimes systématiques |
| Politique | règle rouge → vert de « tweets favorables », curseur avec la tête de Lucas qui bouge toutes les 5 à 11 s ; question du sondage différente à chaque chargement ; « résultats bidon » |
| Monde, accueil | météo des capitales, températures inventées, icônes changeantes dont des emojis sans rapport (cheval, cocktail…) |
| Environnement | compteur d'hectares d'Amazonie rasés depuis minuit (remis à zéro à minuit) |
| Culture | heures de chômage à indemniser aux intermittents ce mois-ci (remis à zéro le 1er) ; bande-annonce « Dans un monde… » ; jauge « je l'ai lu / je l'ai acheté » |
| Société | attente moyenne à la préfecture ; réunions qui auraient pu être un e-mail |
| Tech & Sciences | statut des serveurs (parfois orange) ; mise à jour bloquée à 99 % |
| Sport | « c'est la faute à l'arbitre » depuis minuit ; chrono depuis le dernier « on a manqué de réussite » |
| Compteurs (uniquement) | cafés préparés par Lucas, avec une scène en boucle (prépare, goûte, vide, recommence) |
| Mentions légales | bouton « J'ai lu les mentions légales » qui esquive la souris |

Les compteurs « depuis minuit / ce mois-ci » sont déterministes (même valeur pour tous les visiteurs).

## 3. Référencement, performance, légal
- **Budget EcoIndex** : le score dépend surtout du nombre d'éléments du DOM (formule publique : 100 − 5·(3·Qdom + 2·Qrequêtes + Qpoids)/6). Mesure du 25/10/2026 : 534 éléments = 73 (B) ; pour rester en A, viser **moins de ~350 éléments** sur l'accueil (mesurable avec Chrome sans interface : `document.querySelectorAll('*').length`). Les bandeaux défilants dupliquent leur liste : limiter le nombre de valeurs.
- Sitemap + `lastmod`, canonicals, Open Graph, JSON-LD (`SatiricalArticle`, `WebSite`), plan du site, RSS. Google News volontairement non visé (contenu satirique généré par IA). Soumission du sitemap dans la Search Console : à faire une fois (hors dépôt).
- Images en `srcset`, logo `logo-720.webp`, CSS en ligne. Cache GitHub Pages de 10 min (⚠️ non modifiable sans CDN).
- Éditeur non professionnel (`config/legal.json`) ; passer en professionnel dès qu'il y a des revenus. Encarts d'autopromotion (`config/promos.json`) désactivés et non branchés.

## 4. Limites connues
- Sources non officielles (Yahoo Finance, ESPN) : peuvent changer ou bloquer sans prévenir ; conditions de réutilisation à vérifier si le site prend de l'audience.
- Les cours et scores sont ceux du dernier build ; redéploiement planifié 3 fois par jour en semaine (`deploy.yml`), pas de créneau le week-end.
- Aucun contrôle automatique ne garantit l'absence de diffamation : les protections sont en couches, la supervision humaine reste nécessaire.
- Yves Verts (Environnement) n'a pas de portrait (initiales) ; la photo du bureau Environnement est remplacée par un encart humoristique.
