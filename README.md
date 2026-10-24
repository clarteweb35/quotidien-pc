# Le Quotidien Presque Certain

Journal satirique français entièrement automatisé : 8 articles par jour rédigés avec l'API Google Gemini, contrôlés automatiquement, publiés sans intervention. Nom et slogan: `config/editorial.json`; logo: `site/src/assets/logo-source.png` (variantes générées par `scripts/make-brand-assets.mjs`).

- **Moteur** : Node 22, exécuté par GitHub Actions (aucun serveur, indépendant de votre ordinateur) — `engine/`
- **Site** : Astro, 100 % statique (GitHub Pages ou FTP OVH) — `site/`
- **Données** : fichiers JSON/Markdown dans le dépôt, pas de base de données — `data/`, `config/`

## Documentation
1. [Architecture et décisions](docs/ARCHITECTURE.md)
2. [Installation et déploiement (GitHub, Gemini, OVH)](docs/INSTALLATION.md)
3. [Exploitation, sauvegarde, diagnostic](docs/EXPLOITATION.md)

## Démarrage local
```
npm ci
npm test
node engine/src/cli.js simulate
npm run site:dev
```

## Arborescence
```
.github/workflows/  editor.yml (cron + moteur) · deploy.yml (site) · ci.yml (tests)
config/             réglages éditables : schedule, engine, editorial, sources, evergreen, safety, categories, control
data/               état, quarantaine, coûts, bilans, journaux (écrits par le moteur)
engine/src/         collector, topics, gemini, editor, validator, publisher, scheduler, pipeline, store, cli…
engine/test/        tests automatisés (node:test)
site/               site Astro + panneau /admin/
docs/               documentation
```
