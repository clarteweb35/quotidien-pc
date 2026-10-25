# Partage automatique sur les réseaux sociaux

Le moteur publie chaque article **illustré** sur les réseaux que vous activez, une seule fois, une fois la page réellement en ligne.

## Règles (réglables dans `config/social.json`)
| Réglage | Valeur actuelle | Rôle |
|---|---|---|
| `onlyWithImage` | `true` | seuls les articles avec une image (déposée à la main ou générée) sont partagés |
| `perDayMax` | 4 | plafond de publications par réseau et par jour |
| `minGapMinutes` | 90 | délai minimal entre deux publications sur un même réseau |
| `windowParis` | 08:00 – 22:30 | pas de publication la nuit |
| `maxAgeHours` | 72 | un article trop ancien n'est plus partagé |
| `maxFailuresPerArticle` | 3 | après 3 échecs sur un réseau, on abandonne cet article pour ce réseau |
| `hashtags` | `#satire` | ajoutés à chaque publication |

Chaque publication contient le titre, la mention « **Article satirique · Le Quotidien Presque Certain** », `#satire`, et le lien avec sa carte (image de partage + titre + chapô).

## Garde-fous
- **Jamais avant la mise en ligne** : le moteur lit `build.json` sur le site en ligne et vérifie que la version publiée contient bien l'article **et** son image (comparaison de commits), puis que la page et son image de partage répondent.
- **Jamais deux fois** : `data/social.json` mémorise chaque envoi, enregistré juste après chaque publication.
- **Un article à la fois** par réseau et par exécution (exécutions : après chaque rédaction ou déploiement, et toutes les 30 minutes).
- **Une panne d'un réseau ne bloque rien** : ni le site, ni les autres réseaux.
- **Essai à blanc** : *Actions → Partage sur les réseaux → Run workflow* avec « dry_run » coché affiche les textes prévus sans rien envoyer.

---

## Bluesky (réseau recommandé pour démarrer)

Bluesky est un réseau social gratuit proche de Twitter/X : on publie de courts messages avec un lien, une image, des #hashtags. Il n'y a pas de validation à demander.

### 1. Créer le compte
1. Allez sur https://bsky.app puis **Create account**.
2. Choisissez l'hébergeur par défaut (**Bluesky Social**), saisissez un e-mail (par exemple `redaction@quotidien-pc.fr`) et un mot de passe.
3. Choisissez un **identifiant** (handle), par exemple `quotidien-pc.bsky.social`. Notez-le exactement.
4. Validez l'e-mail reçu.

### 2. Préparer le profil (important pour la transparence)
- **Nom affiché** : `Le Quotidien Presque Certain`
- **Description** (exemple) : `Journal satirique. Tout est faux, sauf l'envie de rire. Compte automatisé. Éditeur : clarte-web.fr`
- **Photo** : le favicon du site ou un « Q » sur fond ivoire ; **bannière** : l'image de partage par défaut (`site/public/brand/og-default.png`).

### 3. Créer un mot de passe d'application (ne jamais donner votre vrai mot de passe)
1. Dans Bluesky : **Paramètres → Confidentialité et sécurité → Mots de passe d'application** (*Settings → Privacy and security → App passwords*).
2. **Ajouter un mot de passe d'application**, nommez-le `quotidien-pc`, et **copiez** le code `xxxx-xxxx-xxxx-xxxx` (il ne sera plus affiché).

### 4. Donner les accès au moteur (secrets GitHub)
Dépôt → **Settings → Secrets and variables → Actions → New repository secret** (onglet **Secrets**, pas « Variables »), deux fois :
- Nom `BLUESKY_IDENTIFIER` → valeur : votre handle complet (ex. `quotidien-pc.bsky.social`)
- Nom `BLUESKY_APP_PASSWORD` → valeur : le mot de passe d'application

### 5. Tester
1. **Actions → Partage sur les réseaux → Run workflow**, laissez « dry_run » coché : le journal affiche les publications prévues (étape « Partager »).
2. Si tout vous convient, relancez en **décochant** « dry_run » : un premier article part sur Bluesky.
3. Ensuite, c'est automatique.

> Aucune image, aucun article illustré, ou site pas encore à jour : le journal indique la raison (`social.skipped` ou `social.not_ready`) et le moteur réessaiera plus tard.

---

## Telegram (facultatif)
1. Dans Telegram, ouvrez **@BotFather** → `/newbot` → donnez un nom et un identifiant (finissant par `bot`) : il vous remet un **jeton**.
2. Créez un **canal** public (ex. `@quotidien_pc`) puis ajoutez le bot comme **administrateur** avec le droit de publier.
3. Secret GitHub `TELEGRAM_BOT_TOKEN` = le jeton. Dans `config/social.json` : `"telegram": { "enabled": true, "chatId": "@quotidien_pc" }`.

## Mastodon (facultatif)
1. Créez un compte sur une instance francophone (ex. `mastodon.social`).
2. **Préférences → Développement → Nouvelle application** : droit `write:statuses` seulement. Copiez le **jeton d'accès**.
3. Secret GitHub `MASTODON_TOKEN`. Dans `config/social.json` : `"mastodon": { "enabled": true, "instance": "https://mastodon.social" }`.
4. Cochez « Ce compte est automatisé » dans le profil.

## Diagnostic
| Journal (`data/logs/social-AAAA-MM-JJ.jsonl`) | Signification |
|---|---|
| `social.no_active_network` | aucun réseau activé **avec** ses secrets |
| `social.skipped … hors_plage_horaire` | trop tôt ou trop tard dans la journée |
| `social.skipped … espacement` / `plafond_du_jour` | limites respectées, c'est normal |
| `social.not_ready … site_pas_encore_a_jour` | le site en ligne n'a pas encore l'article ou son image |
| `social.not_ready … page_404` / `og_404` | la page ou son image de partage est absente |
| `social.failed … HTTP 401` | identifiant ou mot de passe d'application erroné |
| `social.posted` | publié |
