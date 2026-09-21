# Entasis Academy, mode entraînement : conception

Décision de Louis, 21 septembre 2026, après avoir vu le premier module en
production : « trop de texte, pas du tout interactif, mets toi en mode
Duolingo ». Trois arbitrages pris le même jour : les leçons longues et le
quiz sont **remplacés** par des sessions d'exercices ; motivation par **XP,
série et maîtrise** (pas de classement d'équipe) ; les **douze modules
semés sont convertis** en decks d'exercices, en plus du deck de la trame de
rendez vous que Louis veut faire apprendre par cœur.

## Ce qui ne change pas

Le socle de la migration 1 reste : modules et versions (brouillon, publié
immuable, archivé), affectations, parcours, journaux, événements, temps
actif par intervalles fusionnés, RLS et fonctions `security definer`,
corrigés jamais lisibles par le client avant la réponse, onglet visible des
conseillers seulement après une première publication, direction et
`academy_admin`. Les tables des leçons, questions, tentatives et révisions
de la première version restent en base sans être lues (nettoyage dans une
migration ultérieure, après validation de Louis).

## Le modèle

Un **module** = un **deck** d'items + un **mémo** d'une page
(`academy_module_versions.memo_md`). Un **item** est un exercice d'un des
huit types, avec son énoncé dans `academy_items.payload` et sa réponse dans
`academy_items_corriges` (aucune policy, `revoke all`).

| Type | payload (lisible) | corrigé (serveur) | réponse du client |
|---|---|---|---|
| `choix` | `{enonce, choix[]}` | `{index}` | index présenté |
| `vrai_faux` | `{enonce}` | `{vrai}` | booléen |
| `multi` | `{enonce, choix[]}` | `{indices[]}` | indices présentés |
| `ordre` | `{enonce, elements[]}` | `{ordre[]}` (indices originaux) | indices présentés dans l'ordre choisi |
| `association` | `{enonce, gauche[], droite[]}` | `{paires[[g,d]]}` | paires (g, d présenté) |
| `trou_choix` | `{phrase avec ___, choix[]}` | `{index}` | index présenté |
| `trou_saisie` | `{phrase avec ___, aide?}` | `{reponses[]}` | texte, normalisé (minuscules, sans accents, espaces réduits) |
| `carte` | `{recto, verso}` | `{}` | `{su: bool}` auto évaluée |

Les choix, éléments et colonne de droite sont **mélangés par le serveur**
à l'ouverture de la session ; l'ordre présenté est mémorisé dans
`academy_entrainements.items` et le client répond en indices présentés.

Chaque item porte une `competence` (courte) qui sert aux notions faibles du
pilotage, une `difficulte` 1 à 3, et `archive_le`.

### Répétition espacée

`academy_forces (profile_id, item_id, force 0..5, prochaine_le, reussites,
echecs, derniere_le)`. Une bonne réponse monte la force d'un cran (plafond
5), une mauvaise la ramène à `least(force, 1)`. Prochaine échéance selon la
force : 10 min, 1 j, 3 j, 7 j, 14 j, 30 j. Une carte « je savais » vaut une
bonne réponse, « à revoir » une mauvaise.

### Session

`academy_demarrer_entrainement(version_id, jeton)` tire 12 items : d'abord
les items dus (force basse et `prochaine_le` passée), puis les items jamais
vus, puis au hasard parmi les autres ; mélange des choix ; crée
`academy_entrainements` et une `academy_sessions` (temps actif).
`academy_repondre(entrainement_id, item_id, reponse)` corrige côté serveur,
enregistre `academy_entrainement_reponses`, met la force à jour, prolonge
l'intervalle d'activité (chaque réponse vaut un battement), et rend
`{correcte, bonne_reponse (présentée), explication}`. Idempotent par
(entrainement, item). `academy_terminer_entrainement(entrainement_id)` clôt
la session : XP (10 par bonne réponse, 5 par carte sue, +20 session
parfaite, +10 première session du jour), série (jours consécutifs avec au
moins une session terminée, en Europe/Paris), maîtrise, événements.

### Maîtrise, couronnes, validation

Par (profil, version) : couronnes 0 à 5 calculées sur les forces des items
non archivés de la version.

| Couronnes | Condition |
|---|---|
| 1 | tous les items vus au moins une fois |
| 2 | 60 % des items à force ≥ 2 |
| 3 | 100 % à force ≥ 2 → **module validé**, attestation interne |
| 4 | 100 % à force ≥ 3 |
| 5 | 100 % à force ≥ 4 |

Statut de l'affectation : `non_commence` (aucune session), `en_cours`,
`valide` (≥ 3 couronnes), `a_revoir` (validé mais plus d'un tiers des items
en retard de révision depuis plus de 7 jours). `academy_maitrise` mémorise
couronnes, XP par version, nombre de sessions, dernière session.
`academy_series (profile_id, serie, meilleure, dernier_jour, objectif_quotidien)`.

### Écrans

* **Aujourd'hui** (remplace Mon parcours) : série, XP du jour, objectif
  quotidien, items dus, decks affectés avec couronnes et « S'entraîner ».
* **Catalogue** : decks publiés avec couronnes et nombre d'items.
* **Deck** (remplace la fiche module) : mémo, maîtrise, « Démarrer une
  session », historique des sessions, attestation.
* **Entraînement** (remplace lecteur et quiz) : plein écran, barre de
  progression, un composant par type, bouton Vérifier, bandeau vert ou rouge
  avec bonne réponse et explication, Continuer, erreurs rejouées en fin de
  session, écran de fin (XP, bons/total, série, couronnes).
* **Mes résultats** : sessions, XP par semaine, items faibles.
* **Pilotage** : indicateurs (actifs, série moyenne, decks validés sur
  obligatoires, items dus, temps actif), tableau par personne (couronnes par
  deck, XP 7 j, série, dernière session), matrice = couronnes, notions
  faibles = compétences des items les moins réussis.
* **Administration** : mémo et items par version (huit formulaires), aperçu
  d'un item, statistiques de réussite par item, publication inchangée.

### Contenu

Deck 1 : « La trame du rendez vous d'audit patrimonial », écrit d'après les
deux pages de Louis (sept étapes, durées, points, documents), une
cinquantaine d'items. Douze decks convertis depuis
`scripts/academy/catalogue/*.json` : chaque deck reprend strictement les
faits des leçons vérifiées, environ 40 items, un mémo d'une page. Tout en
brouillon, à relire par Louis avant publication. La version 1 publiée de
« La méthode Entasis » est archivée à la mise en ligne de la refonte (elle
n'a pas d'items) ; sa version 2 en brouillon porte le deck.
