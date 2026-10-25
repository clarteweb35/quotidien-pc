# Déploiement du site

Le site est statique (`site/dist`) et construit par `.github/workflows/deploy.yml`.

## Déclencheurs
- push sur `main` touchant `site/**`, `config/categories.json`, `config/editorial.json`, `config/marches.json`, `config/legal.json` ou `package.json` ;
- appel par le workflow du moteur après chaque article publié ;
- planification : 7h15, 12h15 et 17h15 UTC du lundi au vendredi (rafraîchit les cours de la rubrique Économie) ;
- lancement manuel (`workflow_dispatch`).

## Variables du dépôt (Settings → Secrets and variables → Actions → Variables)
| Variable | Rôle |
|---|---|
| `CUSTOM_DOMAIN` | domaine personnalisé (sinon lu dans `site/public/CNAME`) |
| `SITE_URL`, `SITE_BASE` | adresse et base si pas de domaine personnalisé (`/<depot>/`) |
| `DEPLOY_TARGET` | `github-pages` (défaut) ou `ovh-ftp` |
| `OVH_FTP_DIR` | dossier distant (défaut `www/`) |

Secrets pour `ovh-ftp` : `OVH_FTP_HOST`, `OVH_FTP_USER`, `OVH_FTP_PASSWORD`. Voie non testée ici ; voir aussi `INSTALLATION.md`, section 5.

## Domaine
Le domaine actuel est `quotidien-pc.fr` (`site/public/CNAME`). L'adresse du site est détectée automatiquement au build.

## Après un déploiement
1. Ouvrir `/build.json` : il indique le commit construit.
2. Vérifier `/sitemap-index.xml` et `/robots.txt`.
3. Soumettre `https://quotidien-pc.fr/sitemap-index.xml` dans Google Search Console (une seule fois).

## Dépannage
- Cours absents de la rubrique Économie : la source Yahoo a échoué et le cache de 48 h est expiré ; le bloc se masque, le reste du site est intact.
- Build en échec : lancer `npm test` (le test du site reproduit la construction hors ligne).
