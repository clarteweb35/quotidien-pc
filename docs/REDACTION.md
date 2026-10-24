# Les journalistes (signatures fictives)

Fichier unique : `config/journalists.json` — pour chacun : `name`, `desk` (rubrique), `beat` (spécialité), `bio`, `active`.

## Règles appliquées par le moteur
1. **Un journaliste = une rubrique principale.** Un article n'est signé que par un membre actif du service de sa rubrique.
2. **La signature n'est jamais tirée au hasard.** Gemini choisit, dans la liste de la rubrique (nom et spécialité), celui dont la spécialité correspond le mieux au sujet. S'il se trompe ou s'il omet, **le premier journaliste actif du service (le titulaire)** signe. L'événement `author.default` est alors écrit dans le journal.
3. **La signature ne fabrique ni source ni témoignage.** Le moteur bloque (quarantaine, un nouvel essai) tout article qui :
   - prétend à un envoyé spécial, un reporter sur place, des personnes « rencontrées » ou « interrogées » par la rédaction ;
   - cite dans son texte le nom d'un journaliste de la rédaction.
4. **Transparence** : la page `/redaction/` et la page « À propos » précisent que les signatures sont fictives ; chaque article affiche « Par <nom> · Service <rubrique> · Lecture : N min ».

## Activer ou ajouter des journalistes
- Passez `"active": true` pour faire entrer un nom de la réserve (23 noms y sont déjà). L'ordre dans le fichier compte : le premier actif d'un service en est le titulaire.
- Un nom actif doit être unique ; chaque rubrique doit garder au moins un journaliste actif (sinon `check-config` échoue).
- Conseil : avancez par petites vagues (3 à 4 par rubrique au départ, comme maintenant) pour que les lecteurs retrouvent leurs repères.
- Avant d'activer un nom, vérifiez qu'il ne correspond pas à un journaliste connu (recherche web de « prénom nom »).
