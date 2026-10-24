# Architecture — Le Quotidien Presque Certain

## Principe : deux blocs indépendants

```
                    GitHub (dépôt = source de vérité)
 ┌──────────────────────────────────────────────────────────────┐
 │  config/   réglages éditables (calendrier, budget, prompts)   │
 │  data/     état du moteur, quarantaine, coûts, journaux       │
 │  site/src/content/articles/*.md   les articles publiés        │
 └───────────────┬───────────────────────────────┬──────────────┘
                 │                               │
   ① MOTEUR (GitHub Actions)              ② SITE PUBLIC (statique)
   cron toutes les 30 min                 Astro → HTML/CSS pur
   Node 22 + SDK @google/genai            déployé à chaque article
   écrit un .md + l'état, commit          GitHub Pages (par défaut)
                                          ou FTP OVH (option)
                                          domaine OVH → DNS
```

| | Moteur éditorial | Site public |
|---|---|---|
| Rôle | collecter, rédiger, contrôler, écrire l'article | afficher les pages |
| Où | GitHub Actions (aucun serveur à gérer) | GitHub Pages ou hébergement OVH |
| Dépend de l'autre ? | non : il n'écrit que des fichiers dans le dépôt | non : il lit seulement les fichiers |
| Panne | le site reste en ligne avec les articles existants | le moteur continue et accumule les articles |

**Pourquoi ce choix.** Un site statique n'a ni base de données, ni serveur, ni mise à jour de sécurité à suivre. Le dépôt GitHub joue le rôle de CMS et de base de données (fichiers Markdown + JSON), ce qui respecte la consigne de ne pas ajouter de base. Les domaines OVH pointent simplement vers l'hébergement statique.

**Si l'hébergement OVH ne permet pas les tâches planifiées** : cela ne change rien, le moteur ne tourne pas chez OVH. OVH ne sert que de registraire DNS (et, en option, d'hébergement de fichiers statiques via FTP). Passer de GitHub Pages à l'hébergement OVH, c'est changer la variable `DEPLOY_TARGET`, sans rien reconstruire.

## Pourquoi pas un cron OVH, ni un serveur permanent ?

| Option | Verdict |
|---|---|
| Cron de l'hébergement OVH mutualisé | Non retenu : Node/Python rarement disponibles, durée limitée, comportement réel non vérifié. |
| **GitHub Actions `schedule`** | **Retenu.** Gratuit/inclus, secrets intégrés, historique d'exécutions, verrou natif (`concurrency`). Limite connue : le cron peut être retardé ou sauté ; le moteur rattrape les créneaux manqués (fenêtre configurable). Les dépôts publics sont désactivés après 60 jours sans activité : ici le moteur commit chaque jour, donc non concerné. |
| VPS permanent | Réserve : plus fiable sur l'horaire, mais coût et maintenance. À envisager seulement si le retard du cron GitHub devient gênant après observation. |

Consommation Actions : ~34 exécutions/jour × ~1 min ≈ 1 000 min/mois. Dépôt public : illimité. Dépôt privé : à comparer au quota de votre abonnement (à vérifier sur votre compte).

## Composants du moteur (`engine/src/`)

| Composant demandé | Fichier | Rôle |
|---|---|---|
| A. Collecteur | `collector.js` | RSS/Atom, normalisation, URL conservées, flux en erreur ignorés |
| B. Sujets et dédoublonnage | `topics.js`, `store.js` | exclusion des sujets sensibles, similarité des titres, mémoire 14 jours, réserve de thèmes intemporels |
| C. Générateur | `editor.js`, `gemini.js` | SDK officiel, sortie JSON structurée, modèle/paramètres/consignes en configuration |
| D. Validateur | `validator.js`, `editor.js` (relecteur) | contrôles déterministes bloquants + second appel Gemini (aide, jamais preuve) |
| E. Publication | `publisher.js` | écrit le `.md`, le relit pour confirmer, slug unique, idempotent |
| F. Planificateur | `scheduler.js`, `editor.yml` | 8 créneaux Europe/Paris, rattrapage borné, plafond quotidien |
| G. Journal et coûts | `logger.js`, `store.js` (`usage.json`) | JSONL quotidien sans secret, coût par appel, plafonds jour/mois |
| H. Administration | `site/src/pages/admin/` | page statique qui pilote le dépôt via l'API GitHub |

### Cycle d'un créneau

```
créneau dû ─▶ pause ? ─▶ budget ? ─▶ collecte ─▶ sujet (actu sinon thème intemporel)
   ─▶ Gemini (JSON) ─▶ contrôles déterministes ─▶ relecteur Gemini ─▶ écriture du .md ─▶ état « published »
                          │ échec corrigeable                        │ échec persistant
                          └─▶ 1 nouvel essai avec les raisons ───────└─▶ quarantaine + historique des rejets
```

Garanties :
- **Pas de doublon en cas de relance** : l'identifiant d'article dérive du créneau et du sujet ; le créneau est écrit dans le front-matter ; au redémarrage, un article déjà présent pour un créneau est « réconcilié » au lieu d'être recréé (testé).
- **Jamais plus de 8 par jour** : plafond appliqué dans le planificateur, y compris pour les publications manuelles « extra » et pour la libération depuis la quarantaine (testé).
- **Rien ne se perd** : l'état est écrit avant chaque appel externe ; le coût de chaque appel est sauvegardé immédiatement ; un article refusé est conservé en quarantaine.
- **« Publié » = commité** : l'article et l'état sont dans le même commit git. Si le push échoue, ni l'un ni l'autre n'existent : pas d'état incohérent. Le déploiement du site suit ensuite automatiquement.

## Contrôles avant publication

Bloquants (déterministes) : schéma et champs, longueurs (titre, chapô, corps en mots, SEO), paragraphes vides ou répétés, texte tronqué ou non français, HTML/Markdown/liens interdits (le corps est du texte brut, donc pas d'injection), motifs interdits (liste modifiable), citation placée près du nom d'une personne présente dans la source ou dans `protectedNames`, recopie de la source, source `https` obligatoire pour une actu, titre trop proche (≥ 0,70) ou corps trop proche (≥ 0,50) d'un article existant.

Relecteur Gemini : humour, cohérence, risque, citation à une personne réelle, diffamation. Un indicateur `real_person_quote` ou `defamation_risk` bloque même avec un humour de 10/10.

**Limite assumée :** aucun contrôle automatique ne peut garantir qu'un texte n'est pas diffamatoire. Les protections sont en couches (consignes, exclusion des drames, interdiction de citations, relecteur, quarantaine), mais la phase supervisée (voir `INSTALLATION.md`) est indispensable avant de laisser tourner seul.

## Données (`data/`)

| Fichier | Contenu |
|---|---|
| `state.json` | sujets vus/utilisés, état des créneaux, dernier cycle |
| `quarantine.json` | articles bloqués (texte complet) + historique des rejets avec raisons |
| `usage.json` | grand livre des appels (jetons, coût), totaux mensuels |
| `reports/AAAA-MM-JJ.json` | bilan quotidien |
| `logs/AAAA-MM-JJ.jsonl` | journal d'exécution (clé API masquée) |

## Sécurité

- Clé Gemini : secret GitHub `GEMINI_API_KEY`, lue via l'environnement, masquée dans les journaux, jamais présente dans le site.
- Le site est statique : aucune API ni base à attaquer. Le contenu des articles est du texte brut échappé.
- Administration : la page `/admin/` ne contient aucun secret. Elle appelle `api.github.com` avec **votre** jeton à granularité fine, limité à ce dépôt, gardé dans l'onglet (sessionStorage). L'autorité est celle de GitHub (2FA, révocation du jeton). Une CSP restreint la page à `api.github.com`. Un visiteur sans jeton ne peut rien faire.
- Les flux RSS sont traités comme des données : le prompt demande d'ignorer toute instruction qu'ils contiendraient, et la sortie est de toute façon validée.
