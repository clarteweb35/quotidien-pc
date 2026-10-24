# Installation et déploiement

Rien n'a encore été déployé : ces étapes sont à exécuter par vous (compte GitHub, OVH, Google). Le code et les tests locaux ont été vérifiés (voir README).

## 1. Mettre le projet sur GitHub

1. Dépôt prévu : `https://github.com/clarteweb35/quotidien-pc` (créez-le vide sur GitHub s'il n'existe pas ; public recommandé : Actions illimitées ; privé possible, vérifiez votre quota de minutes et la disponibilité de Pages sur votre offre).
2. Depuis le dossier du projet :
   ```
   git add .
   git commit -m "Initial"
   git push -u origin main
   ```
   (le dépôt local est déjà initialisé avec ce `origin` ; rien n'a été poussé)
   ```
   ```
3. Dépôt → **Settings → Actions → General** : *Workflow permissions* = **Read and write permissions**.

## 2. Configurer Gemini

1. Ouvrez Google AI Studio (aistudio.google.com) → *Get API key* → créez une clé.
2. Dépôt → **Settings → Secrets and variables → Actions → New repository secret** : nom `GEMINI_API_KEY`, valeur = la clé.
3. **Vérifiez les tarifs et le quota** du modèle choisi sur https://ai.google.dev/gemini-api/docs/pricing, puis ajustez `config/engine.json` :
   - `gemini.generatorModel` / `judgeModel` (au 24/10/2026, la page de tarifs listait notamment `gemini-3.8-flash` et `gemini-3.5-flash-lite` ; **vérifiez qu'ils sont toujours disponibles**) ;
   - `pricesUsdPerMillionTokens` : le moteur refuse de démarrer si un modèle n'a pas de tarif. Les valeurs fournies sont **prudentes** (tarif annoncé le plus élevé) ;
   - `budget.dailyUsd` / `monthlyUsd` : plafonds du moteur (arrêt automatique).
4. Le plafond du moteur ne remplace pas une alerte côté Google : activez aussi une alerte de budget dans la console Google Cloud liée à la clé.
5. Ne comptez pas sur un quota gratuit : le moteur compte tous les appels au tarif payant.

## 3. Variables du dépôt (site)

**Settings → Secrets and variables → Actions → Variables** :

| Variable | Valeur |
|---|---|
| `SITE_URL` | `https://votre-domaine.fr` ; pour un premier essai sans domaine : `https://clarteweb35.github.io` |
| `SITE_BASE` | `/` avec domaine personnalisé ; `/quotidien-pc/` pour l'essai sur `clarteweb35.github.io/quotidien-pc/` |
| `CUSTOM_DOMAIN` | `votre-domaine.fr` (optionnel) |
| `DEPLOY_TARGET` | laissez vide (GitHub Pages) ou `ovh-ftp` |

## 4. Activer GitHub Pages

**Settings → Pages → Build and deployment → Source : GitHub Actions.**
Lancez ensuite **Actions → Déploiement du site → Run workflow** : le site (vide au départ) est mis en ligne.

## 5. Brancher votre domaine OVH

Espace client OVH → **Noms de domaine → votre domaine → Zone DNS**.

1. Supprimez les enregistrements A/AAAA par défaut du domaine nu qui pointent vers l'hébergement OVH (si vous n'utilisez pas cet hébergement pour autre chose).
2. Ajoutez, pour le domaine nu (`votre-domaine.fr`), quatre enregistrements **A** : `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
3. Ajoutez un **CNAME** `www` → `<compte>.github.io.`
4. Dépôt → **Settings → Pages → Custom domain** : saisissez le domaine, attendez la vérification DNS, cochez **Enforce HTTPS** (peut prendre quelques minutes à quelques heures).
5. Recommandé : vérifiez le domaine dans vos paramètres GitHub (*Settings → Pages* du compte) pour éviter qu'un tiers le revendique.

Les adresses IP de GitHub Pages sont celles de la documentation GitHub à ma connaissance : comparez-les avec la page officielle « Managing a custom domain for your GitHub Pages site » avant de les saisir.

### Variante : héberger le site sur votre hébergement OVH
Si vous préférez servir le site depuis OVH (même sans cron) :
1. Secrets : `OVH_FTP_HOST`, `OVH_FTP_USER`, `OVH_FTP_PASSWORD` ; variable `OVH_FTP_DIR` (ex. `www/`).
2. Variable `DEPLOY_TARGET` = `ovh-ftp`.
3. Le domaine pointe alors vers OVH (DNS par défaut). Cette voie n'a **pas été testée** ici.

## 6. Mentions légales
Éditez `site/src/pages/mentions-legales.astro` : éditeur, directeur de la publication, contact, hébergeur. C'est une obligation légale en France.

## 7. Jeton pour le panneau d'administration

1. GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate*.
2. *Repository access* : **seulement ce dépôt**. Permissions : **Contents : Read and write**, **Actions : Read and write**. Durée courte (90 jours) puis renouvelez.
3. Ouvrez `https://votre-domaine.fr/admin/`, saisissez `compte/depot` et le jeton.

## 8. Mise en service progressive (obligatoire)

| Phase | Action | Critère de passage |
|---|---|---|
| 0. Local | `npm ci`, `npm test`, `node engine/src/cli.js simulate` | tout vert |
| 1. Simulation | admin → *Essai à blanc* (ou Actions → Run workflow → `dry-run`) : vrais appels Gemini, **aucun article publié** ; brouillons dans `data/dry-run/` | vous relisez 5 à 10 brouillons : ton, risques, coût réel dans `data/usage.json` |
| 2. Article de test | `ENGINE_PAUSED` non, lancez *Générer un article supplémentaire* une fois | l'article apparaît sur le site, mention satirique visible, RSS correct |
| 3. Supervisé | laissez le cron actif **1 à 2 semaines**, relisez chaque jour le bilan et la quarantaine | pas de contenu problématique, coût conforme, créneaux tenus |
| 4. Autonome | réduisez la surveillance aux alertes (tickets GitHub « alerte-moteur ») | |

Pour tester sans rien publier : mettez `"paused": true` dans `config/control.json` (ou bouton *Suspendre*).

## 9. Marque et nom de domaine (à faire avant la mise en ligne)

Vérifications déjà tentées (indicatives, **sans valeur juridique**) :
- Domaines : une interrogation RDAP (registre) ne trouve aucun enregistrement pour `lequotidienpresquecertain.fr/.com`, `presquecertain.fr/.com`, `quotidienpresquecertain.fr` et `quotidien-presque-certain.fr` (réponse « introuvable »). Ils semblent donc libres : **confirmez et réservez-les sans attendre chez OVH**.
- Marque : aucune publication intitulée « Le Quotidien Presque Certain » trouvée par recherche web. En revanche « Quotidien » / « Le Quotidien » désignent déjà des médias connus (émission *Quotidien* de TMC/TF1 ; quotidien luxembourgeois *Le Quotidien*, ancien titre de presse valenciennois). Le risque ne porte pas sur le nom complet, mais sur la proximité de « Le Quotidien » avec ces titres, d'autant que votre journal pratique la parodie de presse.
- Non vérifiable ici : la base INPI interrogeable, TMview (EUIPO) et la base OMPI n'ont pas pu être consultées de façon fiable.

À faire : recherche d'antériorités sur data.inpi.fr, TMview et WIPO Global Brand Database (classes 9, 16, 35, 38, 41 ; termes « QUOTIDIEN », « PRESQUE CERTAIN »), puis avis d'un conseil en propriété intellectuelle avant dépôt de marque et lancement commercial.
