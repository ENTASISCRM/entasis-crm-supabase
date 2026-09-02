# CRM Entasis Conseil

Cabinet de gestion de patrimoine parisien, une quinzaine de conseillers.
Ce dépôt est le CRM interne, utilisé tous les jours par l'équipe.

Ce fichier est lu automatiquement au démarrage. Il dit comment on travaille
ici, ce qui est en cours, et ce qui reste à faire.

## Règles de Louis, valables en permanence

Louis Hatton dirige le cabinet. Ces règles ne se discutent pas :

* **Aucune mise en ligne sans son accord.** On développe sur une branche
  dédiée, jamais sur main. On ouvre une pull request, on lui montre, il
  valide. Quand il dit « merge », on merge.
* **La rémunération du cabinet ne sort jamais.** Aucun agrégat de marge ou
  de commission côté conseiller, ni dans le code, ni dans un document du
  dépôt. Un conseiller ne doit pas pouvoir déduire ce que gagne le cabinet.
* **Base de production en lecture seule**, sauf demande explicite de Louis
  pour une opération précise (un onboarding par exemple).
* **Aucune donnée client réelle** dans les documents, les commits ou les
  captures. Pour illustrer, on invente des noms.
* **Français sans aucun tiret** dans les livrables et les messages de
  commit. Les noms de fichiers techniques gardent les leurs.
* **Ne rien casser.** Louis le répète : « casse aucune donnée ni rien ».

## Comment valider avant de pousser

Trois commandes, dans cet ordre. Aucune ne doit régresser :

```
npx eslint src/          # un avertissement préexistant, zéro erreur attendue
npx vitest run           # 475 tests
npx vite build
```

**Et surtout, vérifier à l'écran.** Le harnais de contrôle visuel vit dans
le répertoire de travail temporaire de la session : un script Playwright
simule une session (clé de stockage `entasis-auth-v1`) et intercepte les
appels Supabase avec des données fictives. Voir les scripts existants pour
le motif exact. Une capture vaut mieux qu'une supposition : Louis regarde
le rendu, pas le diff.

## Architecture, ce qu'il faut savoir

* React 18 et Vite 5, fichiers `.jsx`, pas de Next.js.
* Supabase pour la base et l'authentification. **La RLS est la seule
  couche d'autorisation** : ne jamais s'appuyer sur un filtre côté client
  pour protéger une donnée.
* Les écritures passent par `verifierEcriture` (`src/lib/ecriture-verifiee`)
  qui détecte les refus silencieux de la RLS.
* La recherche utilise `correspond()` de `src/lib/recherche` : accents
  ignorés, ordre des mots libre, tolérance à une lettre. Ne jamais
  réintroduire un `includes()` brut sur du texte saisi.
* La navigation est décrite une seule fois dans `src/lib/navigation.js`
  (barre latérale, sous onglets, palette de commandes, liens profonds).
* Déploiement Vercel automatique sur main, et une préversion par pull
  request.

## Où on en est au 2 septembre 2026

Le 1er septembre, Louis a demandé « tout d'un coup » et a fusionné sans
relecture. Tout ce qui suit est en ligne sur main.

### Ce qui est en ligne depuis le 1er septembre

* **Séquences de relance** (plan B2). Dans la modale dossier, un gabarit
  (`src/config/sequencesRelance.js`) pose la chaîne d'étapes datées ; le
  geste Fait de Ma journée arme l'étape suivante (`src/lib/sequences.js`).
  Deux colonnes sur `deals` : `sequence_key`, `sequence_etape`.
* **Dossiers sans mouvement** (plan C2). Bloc sous la file du matin,
  seuil 21 jours, logique dans `src/lib/stagnants.js`.
* **Leads entrants** (plan A6, lecture d'abord). Le domaine Leads lit la
  table `leads` du CRM (`src/components/LeadsEntrants.jsx`), la Lead Room
  reste en seconde vue. Le rapprochement direction « signés là bas, pas
  ici » passe par `api/leads-rapprochement.js`, qui attend deux variables
  Vercel : `LEADROOM_SUPABASE_URL` et `LEADROOM_SUPABASE_SERVICE_ROLE_KEY`.
  **Tant qu'elles ne sont pas posées, le bloc dit « indisponible ».**
* **Rattrapage des fiches** (plan D6). Vue direction « Fiches à
  rattraper » dans Clients : séparation prénom et nom proposée, jamais
  appliquée sans case cochée et confirmation. Heuristiques dans
  `src/lib/noms.js`.
* **Le contrat de rémunération se choisit par ses dates**
  (`api/_lib/contrats.js`), plus par le drapeau `actif` seul. Un
  renouvellement saisi à l'avance prend le relais le jour dit. Le drapeau
  reste une exclusion manuelle et un filet quand rien n'est en poste.
* **L'agenda d'équipe lit les profils** (`api/team-calendar.js`) au lieu
  d'une liste figée qui confondait les conseillers.
* **Le nom d'un profil est mis au propre à sa création** (fonction SQL
  `normaliser_nom_complet`, appelée par `handle_new_user`).
* La fiche client affiche à nouveau tous ses champs (les sections
  repliables s'appellent `form-pliable`, le nom générique `form-section`
  est réservé aux sections plates). Deux modales visaient des classes
  inexistantes : les vrais noms sont `modal-box`, `modal-head`,
  `modal-foot`, et `src/design-system.md` le dit désormais.
* Les quatorze logos partenaires sont en place. Le correctif Pappers du
  Lead Room est déployé (structure regroupée, homonymes signalés).

### Ce qui reste ouvert

* **Contrôle visuel automatique en CI** : chantier lancé le 1er septembre
  (`tests/visuel/`, workflow `controle-visuel.yml`). Vérifier qu'il est
  bien sur main ; sinon il est sur une branche de travail à intégrer.
* **Hyppolite Morel arrive le 14 septembre** : son profil CRM naît à sa
  première connexion Google, il faut alors poser le code `HYPPOLITE` et
  rattacher sa fiche contrat (identifiant
  `8e1bf94e-ce69-448b-abb1-bf57b82f42c2`, libellée « MOREL Hyppolite »).
  Sa fiche contrat démarre au 1er septembre en base alors qu'il arrive le
  14 : Louis n'a pas encore dit s'il faut corriger.
* **Orthographe du nom d'Ilana** : « Zarrouk » sur son compte Google,
  « Zarouk » sur sa fiche contrat. En attente de Louis, rien touché.
* **Pull request 41** sur ce dépôt, vieux test de design de mai : à
  fermer ou à refaire.
* **Le compte Pappers rattaché aux outils de Louis n'a plus de crédits**
  (sans rapport avec la clé du Lead Room).

### L'onglet Partenaires

L'ancien onglet Immobilier est devenu le domaine **Partenaires**, avec deux
vues : l'**Annuaire** (dix sept contacts classés en cinq métiers) et
**Immobilier dossiers**, la transmission aux référents.

Ce qui compte si on y retouche :

* **La densité est un acquis.** Environ 1,7 écran à dérouler pour dix sept
  contacts. Ne pas regagner du décor au prix du scroll.
* **Les coordonnées n'ont pas de cadre permanent.** Le cadre apparaît au
  survol.
* **Téléphones et adresses sont dans deux colonnes fixes.** Ils tombent au
  même pixel sur toutes les lignes, vérifier après toute modification.
* **Écrire ouvre Gmail**, jamais `mailto:`.
* Un logo déposé dans `src/assets/logos/` s'affiche automatiquement (nom
  de la société en minuscules, accents retirés, ponctuation en tirets ;
  voir le `LISEZMOI.md` du dossier et `scripts/preparer-logos.py`).
* Deux confusions déjà faites : la société de Hugo Busuttil s'appelle
  **ASIO** ; **Asselio est une autre maison**, sous la marque Abeille ;
  **Julien Renversé est chez François 1er**, pas chez Asselio.

### Onboarding des arrivants de septembre

Alois Carini, Charlotte Billard, Ilana Zarouk et Eliott Bec sont
finalisés (profil, code conseiller, fiche contrat rattachée). Hyppolite
Morel arrive le 14. Le CRM se connecte par Google, le profil se crée à la
première connexion ; la Lead Room a ses propres comptes.

**Aucun mot de passe ne figure dans ce dépôt, et il ne doit jamais y en
avoir.**

### Une leçon sur les tâches programmées

Une tâche programmée liée à une session peut mourir en silence quand la
session est recyclée : celle du changement de contrat de Quentin n'est
jamais partie. C'est pour cela que le contrat se choisit désormais par ses
dates. Pour toute échéance lointaine, doubler d'un rappel simple.

## Les projets Supabase

* **CRM** : `tvgbblbceqvdtqnbeoik`. Tables principales `deals`, `clients`,
  `profiles`, `conseiller_contrats`, `contrats`, `conformite_dossiers`.
* **Lead Room** : `mtqowhjshvgkpkhnpilb`, application séparée avec **ses
  propres comptes**. Un conseiller a donc deux mots de passe distincts,
  source récurrente d'appels au support. Le bouton « Recevoir un lien
  magique par email » dépanne à tous les coups.
* Le plan d'amélioration recommande de ramener les leads dans le CRM pour
  supprimer cette double connexion : la table `leads` est alimentée
  quotidiennement et n'est lue par aucun écran.

## Les documents de fond

`docs/etat_des_lieux.md`, `docs/benchmark_crm.md` et
`docs/plan_amelioration.md` : l'inventaire de l'existant, un comparatif de
vingt deux CRM et un plan de vingt quatre améliorations priorisées. À lire
avant de proposer une nouvelle fonctionnalité, la réflexion est déjà faite.

`docs/architecture-detaillee.md` : la description technique complète du CRM,
écrans, tables, services. Elle vivait à la racine sous le nom `claude.md`,
qui entrait en collision avec ce fichier ci sur un disque insensible à la
casse : git signalait en permanence neuf cent soixante huit lignes
supprimées, et un `git commit -a` les aurait perdues.
