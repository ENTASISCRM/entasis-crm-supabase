# Les decks d’Entasis Academy : format, schémas, vérification, génération

Un fichier JSON par deck, nommé par le slug du module
(`trame-rendez-vous-audit.json`, `per-et-retraite.json`…). Ces fichiers sont
la **source** du contenu : les migrations SQL qui les sèment sont générées,
jamais écrites à la main (voir la dernière section).

Règles de la maison, valables dans chaque texte lu à l’écran (énoncés, choix,
explications, mémo, titres et légendes de schémas, textes des SVG) : français,
apostrophe typographique (’), **aucun tiret** (ni cadratin, ni demi cadratin,
ni trait d’union : « rendez vous », « à revoir »), aucun emoji, aucune donnée
client réelle, jamais la rémunération du cabinet.

## Le format JSON d’un deck

```json
{
  "slug": "trame-rendez-vous-audit",
  "titre": "La trame du rendez vous d’audit patrimonial",
  "theme": "methode",
  "niveau": "decouverte",
  "competence": "Dérouler les sept étapes…",
  "objectif": "Savoir par cœur…",
  "duree_minutes": 10,
  "memo_md": "# Mémo\n\n…markdown d’une page…\n\n[schema:frise]\n\n…",
  "schemas": [
    { "cle": "frise", "titre": "Les sept étapes et leurs durées", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\">…</svg>", "legende": "Sept étapes, une heure. Le patrimoine actuel prend le quart du temps." }
  ],
  "items": [ … ]
}
```

* `slug`, `titre`, `theme`, `niveau`, `competence`, `objectif`,
  `duree_minutes` : la fiche du module (posée à la création du module ou
  de sa version brouillon).
* `memo_md` : le mémo d’une page, en markdown (180 à 260 mots). Un
  marqueur `[schema:cle]` place le schéma dans le mémo ; sans marqueur, les
  schémas s’affichent à la fin du mémo.
* `schemas` : facultatif, un tableau de `{ cle, titre, svg, legende }`
  (voir plus bas). Un ou deux schémas par deck.
* `items` : au moins 12 exercices (une quarantaine en pratique), dans
  l’ordre du fichier : l’exercice numéro n du tableau reçoit `ordre = n` en
  base.

### Un exercice (item)

```json
{
  "cle": "i17",
  "type": "choix",
  "competence": "Les durées",
  "difficulte": 1,
  "figure": { "ref": "frise" },
  "payload": { "enonce": "Combien de temps dure le rendez vous d’audit ?", "choix": ["30 minutes", "45 minutes", "1 heure", "1 heure 30"] },
  "corrige": { "index": 2 },
  "explication": "La trame prévoit une heure."
}
```

* `cle` : identifiant unique dans le deck (`i01`, `i02`…), il sert de
  graine au mélange et au nom des captures.
* `type` : l’un des huit types ci dessous.
* `competence` : obligatoire, c’est la notion suivie par le pilotage.
* `difficulte` : 1, 2 ou 3.
* `payload` : l’énoncé et les choix, **jamais la réponse** (la table est
  lisible par les fonctions de tirage).
* `corrige` : la réponse, en **indices originaux** du payload ; elle part
  dans `academy_items_corriges`, illisible en direct.
* `explication` : la ligne lue après la réponse, juste ou fausse.
  Obligatoire sauf pour une carte.
* `figure` : facultatif, voir la section Schémas.

| type | payload | corrige | règles |
|---|---|---|---|
| `choix` | `{ enonce, choix: [4 textes] }` | `{ index }` | exactement 4 choix distincts, `index` de 0 à 3 |
| `vrai_faux` | `{ enonce }` | `{ vrai: true }` ou `false` | booléen, pas une chaîne |
| `multi` | `{ enonce, choix: [4 à 6 textes] }` | `{ indices: [1, 3] }` | au moins une bonne, jamais toutes, indices distincts et dans les choix |
| `ordre` | `{ enonce, elements: [au moins 2] }` | `{ ordre: [0, 1, 2, …] }` | écrire les éléments **dans le bon ordre** et un corrigé identité ; `ordre` est une permutation complète ; le générateur mélange à la génération |
| `association` | `{ enonce, gauche: [n], droite: [n] }` | `{ paires: [[0, 0], [1, 1], …] }` | gauche et droite de même longueur (au moins 2), face à face, corrigé diagonal ; chaque gauche et chaque droite apparaît une fois ; le générateur mélange la colonne droite |
| `trou_choix` | `{ phrase: "… ___ …", choix: [4 textes] }` | `{ index }` | la phrase contient `___`, 4 choix distincts |
| `trou_saisie` | `{ phrase: "… ___ …", aide }` | `{ reponses: ["15", "quinze"] }` | au moins une réponse acceptée, comparaison normalisée (casse, accents) côté serveur |
| `carte` | `{ recto, verso }` | `{}` | pas de corrigé, pas d’explication obligatoire |

Ce sont les règles de l’éditeur d’administration (`src/lib/academy/editeur-items.js`)
et de la correction serveur (`academy_verifier_reponse`) ; le vérificateur
les rejoue sur tout le deck.

## Schémas et figures

### Le modèle

* Au niveau du deck, `schemas` : `[ { cle, titre, svg, legende } ]`.
  `cle` en minuscules, chiffres et soulignés (`frise`, `trois_poches`),
  unique dans le deck. `titre` : une ligne. `legende` : une ou deux
  phrases qui disent ce qu’il faut retenir. `svg` : le dessin, texte
  complet de `<svg …>` à `</svg>`. En base : `academy_module_versions.schemas`.
* Sur un exercice, `figure` :
  * `{ "ref": "frise" }` renvoie à un schéma du deck (le cas courant) ;
  * `{ "svg": "<svg …>…</svg>", "alt": "Ce que dit la figure" }` est une
    figure propre à l’exercice, jamais réutilisée ailleurs.
  En base : `academy_items.payload.figure`. À l’écran, la figure s’affiche
  au dessus de l’énoncé.
* Objectif par deck (spec du 22 septembre) : un ou deux schémas dans le
  mémo, trois à quatre exercices qui s’appuient sur un schéma par `ref`,
  en enrichissant des exercices existants (ajout de `figure`) et en ajoutant
  jusqu’à trois exercices nouveaux de type `choix`, `multi` ou `trou_choix`
  dont l’énoncé renvoie au schéma (« Sur le schéma, quelle étape… »).

### Le guide de style des schémas

* `viewBox="0 0 640 360"` et `xmlns="http://www.w3.org/2000/svg"` sur la
  racine ; pas de `width` ni `height` fixes (le client force
  `width="100%" height="auto"`).
* Premier élément dessiné : le fond blanc plein,
  `<rect x="0" y="0" width="640" height="360" fill="#FFFFFF"/>`.
* Un `<title>` juste après l’ouverture, qui **reprend exactement** le
  `titre` du schéma (lu par les lecteurs d’écran).
* Palette du cabinet, rien d’autre : navy `#162443` (titres, traits
  principaux), gold `#C5A55A` (accent, flèches, surlignage), gold clair
  `#F5EDD8` (fonds d’encadrés), silver `#8A95A8` (traits secondaires,
  légendes), charcoal `#2C3548` (texte courant), blanc `#FFFFFF`.
* Police : `font-family="system-ui, -apple-system, Segoe UI, sans-serif"`
  (sur `<svg>` ou sur chaque `<text>`), tailles de **13 à 20**,
  `text-anchor` pour aligner. Lisible à 320 px de large : rien sous 13,
  pas plus de 8 étiquettes par ligne, aucun texte hors du cadre, pas de
  textes qui se chevauchent.
* Traits 2 px, coins arrondis `rx="8"`.
* Éléments permis : `svg, g, path, rect, circle, ellipse, line, polyline,
  polygon, text, tspan, title, desc, defs, marker, linearGradient,
  radialGradient, stop, clipPath, use` (avec `href="#…"` interne
  seulement). Tout le reste disparaît à l’assainissement client.
* Interdits : `<script>`, `<foreignObject>`, `<image>`, `<style>`,
  `<iframe>`, `<object>`, `<embed>`, attributs `on*`, `javascript:`,
  `data:`, `href` externe, `url(` vers l’extérieur, police externe
  (`@import`, `@font-face`), déclaration XML au milieu du texte.
* Moins de **12 000 caractères** par schéma (le générateur refuse au
  delà ; l’assainisseur client refuse à 24 000).
* Textes en français, sans tiret ni cadratin, apostrophe typographique,
  aucun emoji.

Exemple minimal qui passe la vérification :

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" font-family="system-ui, -apple-system, Segoe UI, sans-serif">
  <title>Les sept étapes et leurs durées</title>
  <rect x="0" y="0" width="640" height="360" fill="#FFFFFF"/>
  <text x="320" y="60" text-anchor="middle" font-size="20" fill="#162443">Une heure, sept étapes</text>
  <rect x="30" y="140" width="80" height="70" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/>
  <text x="70" y="170" text-anchor="middle" font-size="14" fill="#162443">Accueil</text>
  <text x="70" y="195" text-anchor="middle" font-size="13" fill="#2C3548">5 min</text>
</svg>
```

### Modifier un deck déjà semé en base

Les treize decks sont déjà semés en brouillon (migration 7). La migration 9
générée retrouve les exercices existants par `(ordre, type)` et considère
nouveau tout exercice au delà du dernier ordre en base. Donc :

* **on ajoute à la fin, on n’intercale jamais** ; on ne réordonne pas, on
  ne retire pas, on ne change pas le type d’un exercice existant ;
* un exercice nouveau porte **toujours** une `figure` (seuls les exercices
  avec figure entrent dans la migration 9) et un corrigé cohérent ;
* poser `figure` sur un exercice existant suffit : la migration 9 la pose
  sur l’exercice en base s’il n’en a pas déjà une (la sienne est conservée
  sinon) ;
* un schéma dont la `cle` existe déjà en base est remplacé, les autres
  clés sont conservées.

Le vérificateur compare le deck au seed 7 committé (`git show HEAD:…`),
place par place, **sur le type et sur l’énoncé** : la migration 9 ne
reconnaît un exercice qu’à son `(ordre, type)`, deux exercices du même type
se ressemblent donc pour elle et un exercice intercalé ferait poser la
figure sur le voisin. Un exercice intercalé, déplacé, retiré ou dont le
type change est donc une **erreur**. Récrire l’énoncé d’un exercice déjà
semé ne remonte qu’en **avertissement** : c’est permis, mais la migration 9
ne réécrit jamais un exercice existant, la base gardera l’ancien texte (il
faudra passer par l’éditeur d’administration).

## Vérifier

```
node scripts/academy/verifier-schemas.mjs trame-rendez-vous-audit
node scripts/academy/verifier-schemas.mjs            # tous les decks
```

Pour chaque schéma et chaque figure propre : contrôle à sec du guide
(viewBox, xmlns, fond, title, liste blanche, palette, police, tailles,
textes, taille), rendu dans Chromium (Playwright) à 640 et 320 px de large
avec capture dans `tests/visuel/captures/schemas/<slug>-<cle>-<largeur>.png`
(la clé d’une figure propre est la clé de l’exercice), texte hors du cadre
en erreur, textes qui se chevauchent en avertissement. Pour le deck : chaque
`figure.ref` et chaque `[schema:cle]` du mémo pointent vers une clé
existante, chaque exercice a un corrigé cohérent, chaque exercice nouveau
porte une figure. Rapport `OK` / `ERR` ligne par ligne, code de sortie 1 en
cas d’erreur (les avertissements ne comptent pas). **Regarder les captures**
: le vérificateur ne juge pas la clarté du dessin.

Chromium vient de l’installation Playwright du poste
(`~/Library/Caches/ms-playwright`) ; sinon `PLAYWRIGHT_CHROMIUM_PATH` et
`PLAYWRIGHT_MODULE_DIR` comme pour `tests/visuel/controle.mjs`.

Le vérificateur rejoue en plus les règles de l’éditeur d’administration
(`src/lib/academy/editeur-items.js`) quand node sait le charger. Le code de
l’application s’importe sans extension (`from './svg'`), ce que vite résout
et que node ne résout pas : dès qu’un de ces fichiers gagne un import
relatif, le vérificateur l’annonce en première ligne (« l’éditeur
d’administration n’a pas pu être chargé ») et s’en tient à ses propres
règles, qui sont les mêmes. Ce n’est pas une erreur, le contrôle reste
valable ; pour retrouver le double contrôle, il faut écrire l’import avec
son extension côté application.

## Générer

```
node scripts/academy/generer-decks.mjs
```

Écrit, pour chaque deck (mêmes numéros dans les deux jeux) :

* `supabase/migrations/20260921_academy_7_decks_NN_slug.sql` : le seed
  complet d’un deck **neuf** (module ou brouillon sans exercice), mémo,
  schémas et figures compris ; un brouillon qui a déjà des exercices est
  ignoré. Sans schéma nulle part, ces fichiers ressortent à l’identique.
* `supabase/migrations/20260922_academy_9_schemas_NN_slug.sql`, seulement
  pour un deck qui a un schéma ou une figure : complète le brouillon
  courant du module (schémas remplacés par clé, figures posées sur les
  exercices existants, exercices nouveaux insérés avec leur corrigé, ordre
  et association mélangés comme dans le seed). Idempotent. Sans brouillon
  (module absent ou seulement publié), `raise notice` et rien : une version
  publiée ne se modifie pas.

Le générateur s’arrête (rien n’est écrit) sur un schéma de plus de 12 000
caractères, un motif interdit, une clé invalide ou en double, une `ref` vers
un schéma inconnu, une figure sans `alt`. Il avertit quand une migration 9
dépasse 40 000 caractères : elle ne se colle plus dans l’outil MCP
`apply_migration` (alléger les SVG). En pratique une migration 9 pèse 17 à
25 Ko, largement sous la limite.

Les seeds 7, eux, dépassent déjà 40 000 caractères (50 Ko environ une fois
les schémas dedans) : **ils ne se collent pas dans `apply_migration`**, et
c’est sans conséquence ici, puisqu’un deck déjà semé les fait sortir tout
de suite (le brouillon a des exercices). C’est la migration 9 qui travaille.
Seul un environnement neuf a besoin des seeds 7 : ils passent alors par
`supabase db push`, pas par l’outil MCP.

Application sur DEV (`leuqchrianpasianwmjg`, jamais la production) : la
migration 8 (colonne `academy_module_versions.schemas`) **avant** la 9 ; nom
passé à `apply_migration` = nom du fichier sans la date ni `.sql`
(`academy_9_schemas_01_trame_rendez_vous_audit`).

## Ne jamais éditer les SQL générés

Les fichiers `20260921_academy_7_decks_*.sql` et
`20260922_academy_9_schemas_*.sql` portent l’en tête « Genere par
scripts/academy/generer-decks.mjs ». Toute correction se fait dans le JSON
du deck, puis on vérifie et on régénère : une modification directe du SQL
serait écrasée à la génération suivante et rendrait le JSON menteur.

## La séquence d’un agent de contenu

1. Éditer `scripts/academy/decks/<slug>.json` (schémas, figures, exercices
   nouveaux à la fin).
2. `node scripts/academy/verifier-schemas.mjs <slug>` jusqu’à « Aucune
   erreur », et regarder les captures à 320 px.
3. `node scripts/academy/generer-decks.mjs`.
4. `git diff --stat supabase/migrations/` : le seed 7 du deck et sa
   migration 9 bougent, rien d’autre.
5. Ne pas commiter, ne pas appliquer en production : compte rendu à Louis.
