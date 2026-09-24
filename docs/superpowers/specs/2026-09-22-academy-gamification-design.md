# Entasis Academy, gamification et schémas (22 septembre 2026)

Demande de Louis après sa première session sur la trame (12 exercices,
7 bons, session non terminée, donc aucun XP affiché) : « je n'ai pas eu de
points ni d'XP, gamifie tout ça, rends ça vraiment ludique, mets des
schémas ; je veux le meilleur module de formation possible, pour que ce
soient des tueurs commercialement ». Décisions prises avec lui :
classement **anonyme** (rang et écart, jamais les noms), **animations sans
sons**, schémas dans les mémos **et** exercices illustrés sur les treize
decks, **défis du jour et succès**.

Ce document complète `2026-09-21-academy-entrainement-design.md` ; tout ce
qui n'est pas redit ici reste vrai (correction serveur, réponses en indices
présentés, corrigés fermés, temps actif par battements, aucune donnée client
réelle, la rémunération du cabinet ne sort jamais).

## Principes

1. **Le serveur décide de tout ce qui se compte** : XP, combos, niveaux,
   succès, défis, classement. Le client anime ce que le serveur lui rend,
   il ne calcule rien qui fasse foi. Un helper client peut recalculer une
   valeur pour l'animer (compteur qui monte), jamais pour la substituer.
2. **Récompense immédiate** : chaque réponse rend son XP tout de suite
   (`academy_repondre`), le bilan de fin ajoute les bonus. Plus jamais une
   session jouée sans rien voir monter.
3. **Rien de puéril** : ton professionnel, vocabulaire du cabinet, pas de
   vies ni de cœurs, pas de sons. Des animations courtes, désactivées si
   `prefers-reduced-motion`.
4. **Anonymat du classement** : personne ne voit le nom ni le score d'un
   collègue. On voit son rang, le nombre de participants, l'XP du premier
   et l'XP de la personne juste devant.
5. **Sécurité inchangée** : RLS et fonctions `security definer`, `revoke
   all` sur les tables sensibles, `revoke execute` des helpers internes.
   Un SVG venu de la base est **assaini côté client** avant tout rendu.

## Économie des XP

### Par réponse (`academy_repondre`)

| Réponse | XP |
|---|---|
| bonne réponse (choix, vrai ou faux, multi, ordre, association, trou) | 10 |
| carte « je savais » | 5 |
| mauvaise réponse, carte « à revoir » | 0 |
| **combo** : à partir de la 3e bonne réponse d'affilée dans la session | +5 par bonne réponse tant que le combo tient |

Le combo compte les bonnes réponses consécutives (carte sue comprise) ;
une erreur le remet à zéro. Le rejeu (« On y revient ») ne rapporte rien :
`academy_repondre` rend `deja = true` sans rien recalculer.

Colonnes ajoutées à `academy_entrainement_reponses` : `xp integer not null
default 0` (XP total de la réponse, bonus combo compris) et `combo integer
not null default 0` (valeur du combo après cette réponse, 0 si fausse).

`academy_repondre` rend, en plus de l'existant : `xp_gagne` (XP de cette
réponse), `xp_session` (somme des XP des réponses de la session),
`combo` (combo courant après la réponse), `combo_max` (meilleur combo de
la session). Pour une réponse déjà enregistrée : les valeurs mémorisées et
`deja = true`.

### En fin de session (`academy_terminer_entrainement`)

`xp = somme(reponses.xp) + 20 si parfaite (toutes bonnes, cartes sues
comprises) + 10 si première session terminée du jour (Europe/Paris) +
XP des défis du jour complétés par cette session`.

`resume` rend en plus :

```
xp_detail: { reponses, combo, parfaite, premiere_du_jour, defis, total }
niveau_avant: { niveau, titre, xp_min, xp_suivant, xp_total, progression_pct }
niveau_apres: { ... }            -- même forme
combo_max: 7
succes_debloques: [ { code, titre, description, icone } ]
defis: [ { code, titre, description, cible, progression, fait, xp, fait_par_cette_session } ]
classement: { semaine, rang, participants, xp_moi, xp_premier, xp_devant, ecart_premier }
```

`reponses` = somme des 10 et des 5 ; `combo` = somme des bonus +5 ;
`total` = `xp`. `xp_total_version` reste.

### Niveaux et titres

XP total d'une personne = `sum(academy_entrainements.xp)` (comme
`academy_mon_parcours` le fait déjà). Seuil du niveau n :
`xp_min(n) = 25 × (n − 1) × (n + 2)` :

| niveau | XP minimum | titre |
|---|---|---|
| 1 | 0 | Débutant |
| 2 | 100 | Apprenti |
| 3 | 250 | Initié |
| 4 | 450 | Confirmé |
| 5 | 700 | Solide |
| 6 | 1 000 | Expert |
| 7 | 1 350 | Maître |
| 8 | 1 750 | Mentor |
| 9 | 2 200 | Virtuose |
| 10 et plus | 2 700, puis la formule | Légende |

Fonction SQL `academy_niveau(p_xp integer) returns jsonb` (immutable) :
`{ niveau, titre, xp_min, xp_suivant, xp_total, progression_pct }` où
`progression_pct` = position entre `xp_min` et `xp_suivant` (0 à 100).
Miroir client `src/lib/academy/niveaux.js` (`niveauPour(xp)`, `TITRES`,
`xpMin(n)`) avec un test qui reproduit la table ci dessus ; il ne sert
qu'aux animations (compteur, barre), la valeur affichée en dur vient du
serveur.

### Succès

Table `academy_succes` (catalogue, lisible par `authenticated`) :
`code text primary key, titre, description, icone text, ordre integer,
secret boolean default false`. Table `academy_succes_obtenus`
(`profile_id, code, obtenu_le, entrainement_id`, clé primaire
`(profile_id, code)`, RLS : chacun lit les siens, la direction lit tout,
aucune écriture directe).

Catalogue semé (icône = un mot clé que le client rend en pictogramme, pas
un emoji dans la base) :

| code | titre | condition (vérifiée à la fin d'une session) | icône |
|---|---|---|---|
| premiere_session | Premier pas | première session terminée | pas |
| session_parfaite | Sans faute | une session 12 sur 12 | cible |
| combo_6 | Six d'affilée | combo max ≥ 6 dans une session | eclair |
| premiere_couronne | Première couronne | une couronne sur un deck | couronne |
| deck_valide | Deck validé | trois couronnes sur un deck | bouclier |
| cinq_couronnes | Par cœur | cinq couronnes sur un deck | etoile |
| trois_decks | Trilogie | trois decks validés | livres |
| tous_decks | Encyclopédie | tous les decks publiés validés, au moins cinq | bibliotheque |
| serie_3 | Trois jours | série de 3 jours | flamme |
| serie_7 | Une semaine | série de 7 jours | flamme |
| serie_30 | Un mois | série de 30 jours | flamme |
| dix_sessions | Dix sessions | 10 sessions terminées | compteur |
| cinquante_sessions | Cinquante sessions | 50 sessions terminées | compteur |
| cent_justes | Centurion | 100 réponses justes cumulées | medaille |
| cinq_cents_justes | Marathon | 500 réponses justes cumulées | medaille |
| leve_tot | Lève tôt | session terminée avant 8 h (Europe/Paris) | soleil |
| noctambule | Noctambule | session terminée après 21 h | lune |
| rattrapage | Retour en force | un deck passé de « à revoir » à « validé » | fleche |
| journee_pleine | Journée pleine | les trois défis d'un même jour faits | calendrier |
| niveau_5 | Solide | niveau 5 atteint | palier |
| niveau_10 | Légende | niveau 10 atteint | palier |

`academy_attribuer_succes(p_profile, p_entrainement, p_contexte jsonb)`
(interne, appelée par `terminer`) insère ce qui est nouveau et rend la
liste des codes débloqués. Le contexte porte ce que `terminer` sait déjà
(couronnes avant et après, statut avant et après, combo max, parfaite,
niveau avant et après, défis faits) pour ne pas recalculer.

### Défis du jour

Catalogue en dur dans une fonction `academy_catalogue_defis()` (jsonb) :

| code | titre | cible | XP |
|---|---|---|---|
| sessions_2 | Deux sessions aujourd'hui | 2 sessions terminées | 30 |
| parfaite_1 | Une session parfaite | 1 session 12 sur 12 | 40 |
| justes_15 | Quinze bonnes réponses | 15 réponses justes (sessions terminées) | 30 |
| dus_10 | Dix révisions | 10 réponses justes sur des exercices qui étaient dus | 30 |
| deck_neuf | Un deck de plus | une session sur un deck jamais joué avant aujourd'hui | 25 |
| combo_5 | Combo de cinq | un combo de 5 dans une session | 25 |
| matin_10h | Avant dix heures | une session terminée avant 10 h | 20 |
| deux_decks | Deux decks différents | sessions terminées sur 2 decks différents | 30 |

Chaque jour (Europe/Paris), **les mêmes trois défis pour tout le monde**,
choisis de façon déterministe depuis la date (`md5(jour::text)` → trois
indices distincts du catalogue), pour que le classement de la semaine soit
équitable. `academy_defis_du_jour(p_profile, p_jour)` (interne) rend la
liste avec `progression`, `cible`, `fait`, `xp` ; la progression se calcule
sur les sessions terminées du jour (et, à la fin d'une session, sur celle
qui se termine). Table `academy_defis_faits (profile_id, jour, code,
entrainement_id, xp, fait_le)`, clé `(profile_id, jour, code)` : un défi
crédité une fois, son XP entre dans l'XP de la session qui le complète
(ainsi `sum(entrainements.xp)` reste la seule source de l'XP total).

Pour `dus_10`, `academy_repondre` note sur la réponse si l'exercice était
dû au moment de la réponse (`etait_du boolean`).

### Classement anonyme

`academy_classement_semaine()` (pour la personne connectée) rend
`{ semaine (lundi, date), rang, participants, xp_moi, xp_premier,
xp_devant, ecart_premier }`. Participants : profils actifs `is_staff`
ayant au moins une affectation ou une session (tous les temps). XP de la
semaine = somme des XP des sessions terminées du lundi 0 h (Europe/Paris)
au dimanche. `rang` = 1 + nombre de participants strictement devant ;
`xp_devant` = XP de la personne de rang immédiatement supérieur (null si
premier). **Aucun nom, aucun identifiant d'autrui ne sort.** La direction
garde le pilotage nominatif qu'elle a déjà ; le classement anonyme est
aussi rendu dans `academy_mon_parcours` (clé `classement`) et dans le
résumé de fin de session.

### Ce que rendent les lectures

`academy_mon_parcours` gagne : `niveau` (même forme que `niveau_apres`),
`defis` (les trois du jour avec progression), `classement`,
`succes: { obtenus: n, total: n, recents: [ {code, titre, icone, obtenu_le} ] (3 derniers) }`.
`academy_mes_resultats` gagne `niveau` et `succes: [ tous les codes du
catalogue avec obtenu_le ou null, dans l'ordre ]`.
Nouvelle RPC `academy_mes_succes()` = la même liste complète (pour l'écran
Succès) ; `authenticated` peut l'appeler.

## Schémas

### Modèle

`academy_module_versions.schemas jsonb not null default '[]'` :
`[ { cle, titre, svg, legende } ]`. Sur un item, `payload.figure` vaut
soit `{ ref: 'cle' }` (un schéma de la version), soit `{ svg, alt }`
(figure propre à l'exercice). `academy_presenter_entrainement` rend
`schemas` de la version pour que le client résolve les `ref` ;
`academy_module` et `academy_version_admin` rendent `schemas`.
`academy_enregistrer_version` accepte `schemas` dans le patch (brouillon
seulement, comme le reste) ; `academy_version_immuable` inclut `schemas`
dans le contenu figé ; `academy_nouvelle_version` copie `schemas`.

Le SVG en base n'est pas exécuté tel quel : le client passe tout par
`src/lib/academy/svg.js` (`assainirSvg(texte)`) qui parse en
`image/svg+xml`, ne garde qu'une liste blanche d'éléments (svg, g, path,
rect, circle, ellipse, line, polyline, polygon, text, tspan, title, desc,
defs, marker, linearGradient, radialGradient, stop, clipPath, use avec
href interne `#…` seulement), retire tout attribut `on*`, tout `href` ou
`xlink:href` externe, `style` contenant `url(`, et rejette script,
foreignObject, image, iframe. Il force `role="img"`, `aria-label` (alt ou
titre), `width="100%"`, `height="auto"`, et refuse un texte de plus de
24 000 caractères (rendu remplacé par « Schéma indisponible »). Tests
unitaires avec des SVG hostiles.

### Style des schémas (guide d'auteur)

`viewBox="0 0 640 360"`, fond blanc (`rect` plein), palette du cabinet :
navy `#162443` (titres, traits principaux), gold `#C5A55A` (accent,
flèches, surlignage), gold clair `#F5EDD8` (fonds d'encadrés), silver
`#8A95A8` (traits secondaires, légendes), charcoal `#2C3548` (texte
courant), blanc. Police : `font-family="system-ui, -apple-system, Segoe UI, sans-serif"`,
tailles 13 à 20, `text-anchor` pour aligner. Traits 2 px, coins arrondis
`rx="8"`. Lisible à 320 px de large (rien sous 13 px, pas plus de 8
étiquettes par ligne). Français sans tiret ni cadratin, apostrophe
typographique. Aucun `<image>`, aucune police externe, aucun script,
aucun style externe, moins de 12 000 caractères par schéma. Chaque schéma
a un `titre` (une ligne) et une `legende` (une ou deux phrases qui disent
ce qu'il faut retenir). Un `<title>` dans le SVG reprend le titre.

### Contenu par deck

Un ou deux schémas par deck dans le mémo, et trois à quatre exercices qui
s'appuient sur un schéma (par `ref`), en enrichissant des exercices
existants (ajout de `figure`) et en ajoutant jusqu'à trois exercices
nouveaux de type choix, multi ou trou_choix dont l'énoncé renvoie au
schéma (« Sur le schéma, quelle étape… »). Idées par deck (à adapter) :

* trame : frise des sept étapes avec les durées (5, 10, 10, 15, 10, 5,
  5) ; la liste des documents.
* méthode : les trois temps écoute, étude, accompagnement ; l'ordre de
  l'étude (diagnostic, objectifs, stratégie, moyens).
* découverte : les trois poches (précaution, projets datés, long terme) ;
  tolérance contre capacité.
* PER : la vie d'un versement (déduit à l'entrée, bloqué, imposé à la
  sortie) ; les cas de déblocage.
* assurance vie : enveloppe, fonds en euros, unités de compte ; avant et
  après 70 ans.
* allocation : diversification réelle contre nombre de lignes ; le DIC.
* SCPI : le circuit du loyer ; capital fixe contre capital variable.
* fiscalité : déduction, réduction, crédit sur une même colonne d'impôt.
* protection sociale : indépendant contre assimilé salarié ; la
  soustraction revenu moins IJ.
* transmission : réserve et quotité selon le nombre d'enfants ; les six
  volets du bilan.
* rendez vous : les trois temps de la reformulation ; les deux étages de
  frais.
* dossier : les trois niveaux de réaction ; les quatre croisements.
* CRM : le parcours d'un dossier (statuts) ; « Ma journée ».

### Génération et application

`scripts/academy/decks/*.json` gagnent `schemas` (tableau) et, sur les
items, `figure`. `scripts/academy/generer-decks.mjs` continue d'émettre
les seeds 7 (qui posent `schemas` et `figure` sur un deck neuf) **et**
émet un second jeu `supabase/migrations/20260922_academy_9_schemas_NN_slug.sql`
qui, sur la version **brouillon** courante du module : pose `schemas`,
pose `payload.figure` sur les items existants repérés par `ordre` et
`type`, et insère les items nouveaux (ordre au delà du maximum) avec leur
corrigé (mélange stable pour ordre et association, comme le seed).
Idempotent (un item qui porte déjà `figure` est laissé tel quel, un
schéma déjà présent par `cle` est remplacé). Une version publiée n'est
jamais touchée (trigger `academy_item_fige`) : le script l'ignore avec un
`raise notice`.

## Écrans

Tout en français, apostrophe typographique, sans tiret. Animations en CSS
seulement (`@keyframes`), toutes annulées sous
`@media (prefers-reduced-motion: reduce)`. Aucun son.

### Session (`Entrainement.jsx`)

* En haut : à côté du compteur « 3 sur 12 », un **compteur d'XP de
  session** qui monte par pas (compteur animé côté client vers la valeur
  `xp_session` rendue par le serveur) et une pastille **combo** dès 2
  (« ×2 », « ×3 »…) qui pulse quand elle change. La barre de progression
  devient **segmentée** (un segment par exercice : vert pour bon, rouge
  pour faux, doré pour l'exercice en cours).
* À la correction : bandeau vert « Bonne réponse ! +10 XP » (ou « +15 XP,
  combo ×4 ») avec un **+10** qui flotte et s'estompe ; bandeau rouge
  avec une **secousse** courte de la carte (200 ms) sur erreur ;
  l'explication reste.
* Figure : quand l'item porte `figure`, le schéma (assaini) s'affiche
  au dessus de l'énoncé, dans une `<figure>` avec légende courte, jamais
  plus haut que 45 % de la fenêtre sur téléphone (scroll interne interdit,
  on réduit).
* Écran de fin (bilan) : **confettis** CSS (une centaine de particules,
  1,5 s, aux couleurs du cabinet), puis, ligne par ligne avec un léger
  décalage : réponses (+70), combos (+15), session parfaite (+20),
  première du jour (+10), défis (+30 « Quinze bonnes réponses »), total
  qui monte ; barre de **niveau** qui glisse de `niveau_avant` à
  `niveau_apres` (carte « Niveau 3 · Initié » qui se retourne en cas de
  passage) ; couronnes qui s'allument une à une ; **succès débloqués** en
  cartes ; **classement** en une phrase (« 3e sur 9 cette semaine, 40 XP
  derrière le premier », « Premier de la semaine ! ») ; boutons « Encore
  une session », « Revoir mes erreurs » (rejoue les items ratés seulement,
  via une nouvelle session sur le même deck) et « Retour au deck ».
* Le compteur de session reprend sa valeur à la reprise d'une session
  ouverte (les XP déjà gagnés sont rendus par `demarrer` : ajouter
  `xp_session` et `combo` à `academy_presenter_entrainement`).

### Aujourd'hui (`MonParcours.jsx`)

En tête, une **carte de niveau** : titre, niveau, XP total, barre vers le
niveau suivant (« 70 XP avant Initié »). À côté, la série (flamme animée
quand la série du jour est acquise, éteinte sinon) et l'objectif du jour.
Puis **Défis du jour** : trois cartes, chacune avec titre, barre de
progression, « +30 XP », coche quand fait. Puis **Classement de la
semaine** : rang, participants, écart avec le premier et avec la personne
devant, sans nom, avec une phrase d'encouragement calculée côté client.
Puis les decks (inchangés) et **Succès récents** (trois pictogrammes et un
lien « Tous mes succès »).

### Succès (`Succes.jsx`, route `#/formation/succes`)

Galerie de toutes les cartes du catalogue, débloquées (pictogramme plein,
date) ou verrouillées (grisées, condition en clair), avec le compteur
« 7 sur 21 ». Pictogrammes : composant `Picto` qui rend un SVG inline par
mot clé (pas d'emoji, pas de bibliothèque).

### Mes résultats

Ajoute la carte de niveau et le compteur de succès avec le lien.

### Deck (`ModuleDetail.jsx`) et éditeur

Le mémo rend les schémas (`<figure>` + légende) là où le markdown place
`[schema:cle]`, sinon à la fin du mémo. L'éditeur de version gagne une
section « Schémas » (liste : clé, titre, légende, SVG en textarea,
aperçu assaini en direct, ajouter, retirer) et l'éditeur d'item un champ
« Figure » (choix parmi les schémas de la version, ou SVG propre avec
aperçu). Le CSV d'export ignore les figures.

### Cloche (App.jsx)

Un rappel de type `defis_du_jour` (« 2 défis du jour restants ») quand il
reste au moins un défi et qu'aucune session n'est terminée aujourd'hui,
rendu par `academy_mes_rappels`.

## Base : migration 8 en deux fichiers

`20260922_academy_8_gamification.sql` (colonnes, tables succès et défis,
`academy_niveau`, `academy_catalogue_defis`, `academy_defis_du_jour`,
`academy_attribuer_succes`, `academy_classement_semaine`, seeds du
catalogue de succès) et `20260922_academy_8b_gamification_fonctions.sql`
(remplacement de `academy_repondre`, `academy_terminer_entrainement`,
`academy_presenter_entrainement`, `academy_mon_parcours`,
`academy_mes_resultats`, `academy_mes_rappels`, `academy_module`,
`academy_version_admin`, `academy_enregistrer_version`,
`academy_nouvelle_version`, `academy_version_immuable`, nouvelle
`academy_mes_succes`, droits d'exécution). Chaque fichier sous 40 Ko.
Convention du dépôt : nom du fichier = nom dans `schema_migrations`,
versions notées en tête après application.

Le jeu d'acceptation `scripts/academy/tests-sql/acceptation-entrainement.sql`
gagne les étapes : XP par réponse et combo (une session avec 3 bonnes
d'affilée puis une erreur : 10, 10, 15, 0), reprise d'une session ouverte
rend `xp_session`, bilan avec `xp_detail` cohérent, niveau qui monte,
succès `premiere_session` puis `session_parfaite`, `deck_valide` et
`premiere_couronne`, défis du jour déterministes (deux profils voient les
mêmes trois codes) et un défi crédité une seule fois, classement anonyme
(camille devant noé : rang 1 et 2, `xp_devant`, aucun nom dans le JSON),
`schemas` et `figure` rendus par `demarrer` et `academy_module`, un SVG de
plus de 24 000 caractères refusé par `academy_enregistrer_version`
(`check_violation`).

## Ce qui ne change pas

Forces et couronnes, seuil de validation à trois couronnes, attestation,
`questions_par_quiz` = 12, publication avec relecteur, purge des
intervalles, pilotage nominatif de la direction (qui gagne seulement la
colonne « niveau » et le nombre de succès dans `academy_pilotage` et
`academy_fiche`).
