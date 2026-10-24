# Ajouter vos propres images

Chaque article a une **référence** du type `261024-08` (date AAMMJJ + numéro du créneau du jour) ou `261024-X1` (article lancé à la main). Vous créez l'image, vous la nommez comme la référence, vous la déposez : le site fait le reste. Aucun code à toucher.

## 1. Trouver la référence
- Sur la page de l'article : sous le titre, après « Satire », vous voyez **Réf. 261024-X1**.
- Ou dans le dépôt : le fichier `data/images-manuelles.md` liste les articles récents sans image, avec leur référence, leur rubrique et **une description d'image proposée** (à copier dans votre outil de création) ainsi que le style conseillé. Il est mis à jour à chaque exécution du moteur.

## 2. Préparer l'image
- Nom : exactement la référence + l'extension, par exemple `261024-X1.jpg` (majuscules ou minuscules, peu importe).
- Formats : `.jpg`, `.jpeg`, `.png`, `.webp`.
- Format paysage 16:9, 1280 px de large au minimum. Inutile de la compresser : le site la convertit en WebP et en fait une version pour l'article (1280 px), une pour les cartes (800 px) et une pour le partage sur les réseaux.
- Poids conseillé : moins de 10 Mo.

## 3. La déposer sur GitHub (depuis le navigateur)
1. Ouvrez https://github.com/clarteweb35/quotidien-pc/tree/main/site/src/assets/manual
2. **Add file → Upload files**, glissez l'image.
3. **Commit changes** (directement sur `main`).
4. Le site se reconstruit tout seul (environ 2 minutes, onglet *Actions → Déploiement du site*). Rechargez ensuite avec Ctrl+F5.

Pour remplacer une image : déposez un fichier du même nom. Pour la retirer : supprimez le fichier ; l'article retrouve sa couverture typographique.

## Ce qui s'affiche
- L'image remplace la couverture typographique sur la une, les cartes, la page de l'article et l'image de partage (avec le logo en bandeau).
- Une légende est affichée sous l'image : « Illustration : Le Quotidien Presque Certain — illustration satirique, sans rapport avec des faits réels ». Pour la changer, modifiez `manualImageCredit` dans `config/editorial.json`.
- Le texte alternatif (accessibilité) est celui proposé par la rédaction automatique, sinon « Illustration : <titre> ».

## Bonnes pratiques
- Si votre image est générée par une IA ou représente une personne réelle, ne la présentez pas comme une photo : mentionnez-le dans la légende (`manualImageCredit`), et évitez tout visage de personne réelle ou toute fausse photo d'actualité.
- Vérifiez que vous avez les droits sur l'image (créée par vous, ou libre de droits avec la mention requise).
- Vous pouvez ajouter l'image **avant** la publication si vous connaissez la référence du créneau (par ex. `261025-03` pour le 3e créneau du 25 octobre) : elle apparaîtra dès que l'article existera.

## Pièges rencontrés
- **Le bon dossier** est `site/src/assets/manual/` (et non `site/public/`) : seul ce dossier est optimisé (WebP, tailles adaptées) et rattaché à l'article par sa référence.
- **Les fichiers `.jfif`** (export fréquent des outils d'images) sont du JPEG : renommez-les en `.jpg` (`261024-X1.jfif` → `261024-X1.jpg`). Le site ne lit pas l'extension `.jfif`.
- **Une image portrait** est recadrée au centre en 16:9 : vous perdez le haut et le bas. Demandez à votre outil un format paysage 16:9 (1408×768 convient très bien).
- Les images étant générées par IA, la légende affichée est « Illustration générée par IA · Le Quotidien Presque Certain » (réglable : `manualImageCredit` dans `config/editorial.json`).
