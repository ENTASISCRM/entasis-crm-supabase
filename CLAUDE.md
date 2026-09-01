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
npx vitest run           # 345 tests
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

## Où on en est au 1er septembre 2026

### L'onglet Partenaires

L'ancien onglet Immobilier est devenu le domaine **Partenaires**, avec deux
vues : l'**Annuaire** (le carnet du cabinet, dix sept contacts classés en
cinq métiers) et **Immobilier dossiers**, la transmission aux référents,
inchangée.

L'annuaire a été refait trois fois avant de tenir : cartes, puis lignes
denses, puis passe esthétique. Ce qui compte si on y retouche :

* **La densité est un acquis.** On est passé de 2,6 écrans à dérouler pour
  dix sept contacts à environ 1,7. Louis avait dit « on doit scroll 20 ans ».
  Ne pas regagner du décor au prix du scroll.
* **Les coordonnées n'ont pas de cadre permanent.** Quarante rectangles
  gris faisaient formulaire administratif. Le cadre apparaît au survol.
* **Téléphones et adresses sont dans deux colonnes fixes.** Ils tombent au
  même pixel sur toutes les lignes. C'est ce qui sépare un annuaire d'une
  liste bricolée, vérifier après toute modification de la grille.
* **Écrire ouvre Gmail**, jamais `mailto:` : le cabinet est sur Google
  Workspace et un `mailto:` ouvre l'application Mail que personne n'utilise.
* Contrastes tous au seuil AA, mesurés au navigateur. La teinte grise
  tertiaire de la charte passe sous le seuil dès qu'elle porte du texte
  utile, d'où l'usage du gris secondaire ici.

### Les logos des partenaires

Un logo déposé dans `src/assets/logos/` s'affiche automatiquement sur
toutes les lignes de la maison concernée, sans toucher au code. Le nom du
fichier vient du nom de la société, en minuscules, accents retirés,
ponctuation en tirets. Voir le `LISEZMOI.md` du dossier.

**Déjà en place** : `notaire-partenaire.svg` (étude Cédric Deplano),
`asio.png`, `april.png`.

**Manquent encore onze maisons** : Althéra Patrimoine, François 1er,
SwissLife, Generali, Harlay Avocat, Asselio, Irbis, i Kapital, Wemo Reim,
SCPI Log In, SCPI Reason MNK.

### Première tâche à faire : finir les logos

C'est le chantier en cours, à terminer en priorité. En local, contrairement
à la session cloud qui n'avait aucune sortie réseau, l'accès à internet et
aux dossiers de Louis est disponible : les onze fichiers peuvent être
récupérés directement.

**Étape 1, chercher ce qui est déjà sur la machine.** Louis a téléchargé
plusieurs de ces logos. Regarder dans son dossier de téléchargements et sur
son bureau, y compris dans les archives déjà décompressées. Il avait
notamment sous la main Althéra Patrimoine, Generali, Harlay, i Kapital,
SwissLife, Wemo Reim et MNK Partners.

**Étape 2, télécharger ce qui manque.** Les adresses exactes des logos
officiels, relevées dans le fichier fourni par Louis :

| Fichier à produire | Adresse |
| --- | --- |
| `althera-patrimoine.png` | https://althera-patrimoine.com/wp-content/uploads/2022/11/logo-principal-althera-patrimoine.png |
| `francois-1er.png` | https://francois1er.com/wp-content/uploads/2020/07/Logo-Francois-1er-Fin-Pantone-2955C_SMALL.png |
| `asselio.svg` | https://www.asselio.com/wp-content/uploads/2025/12/logo-asselio-partenaires.svg |
| `irbis.svg` | https://www.irbis-finance.com/wp-content/uploads/2024/09/IRBIS-logo-original.svg |
| `i-kapital.webp` | https://i-kapital.fr/wp-content/uploads/2024/07/logo-ikapital-investissement-cabinet.webp |
| `scpi-log-in.jpg` | https://theoreim.com/wp-content/uploads/2022/09/Logo-SCPI-Theoreim-logistique1e.jpg |
| `scpi-reason-mnk.png` | https://mnk-partners.com/wp-content/uploads/2024/11/LOGO_REASON_ORANGE.png |
| `adezio.png` | https://www.adezio.fr/uploads/assets/logo-full.png |

Restent SwissLife, Generali, Harlay Avocat et Wemo Reim, à prendre sur le
site de chaque maison ou sur `brandfetch.com/<domaine>` qui donne les
versions officielles.

**Étape 3, préparer chaque fichier** avec le script ci dessous, puis
renommer la sortie au nom attendu par l'annuaire.

**Étape 4, vérifier à l'écran** avant de pousser : lancer le serveur de
développement, ouvrir l'onglet Partenaires, contrôler que chaque logo est
net, centré, et qu'aucune ligne n'a perdu son monogramme par erreur.

**Étape 5, ouvrir une pull request** et montrer une capture à Louis. Ne
pas fusionner sans son accord.

Deux pièges déjà rencontrés :

* Le logo complet avec le nom écrit dessous devient illisible dans une
  pastille de 32 pixels. Préférer systématiquement le symbole seul quand
  il existe : le carré au H de Harlay, le swoosh de SwissLife, le lion de
  Generali, le carré compact de Wemo Reim.
* Un fichier au fond blanc non détouré fait une tache claire sur la ligne.
  Le script s'en occupe, mais vérifier le résultat.

Pour préparer un fichier téléchargé :

```
python3 scripts/preparer-logos.py ~/Telechargements/swisslife.png
```

Le script détoure le fond, recadre au plus juste, centre dans un carré à
marge constante et exporte en PNG de 256 pixels. Deux points de vigilance :
préférer le symbole seul au logo avec le nom écrit dessous, illisible à 32
pixels, et vérifier le rendu à l'écran avant de pousser.

À savoir sur les noms, deux confusions déjà faites :

* La société de Hugo Busuttil s'appelle **ASIO** (et non Adezio).
* **Asselio est une autre maison**, sous la marque Abeille Assurances.

### Ce qui attend une action de Louis

* **Pull request 71** sur le dépôt `entasis-leadroom` : le correctif de
  l'enrichissement Pappers. Trois défauts : la requête était construite à
  l'envers, les homonymes étaient présentés comme des faits, et la clé
  écrite ne correspondait pas à celle lue par l'écran. Vérifié le 31 août
  au soir, l'ancien code tournait encore, donc la pull request n'est pas
  fusionnée.
* **Pull request 41** sur ce dépôt : un vieux test de design de mai, basé
  sur un état du code périmé. À fermer, ou à refaire sur la base actuelle.
* **Onze logos** à fournir (voir plus haut).

### Onboarding des arrivants du 1er septembre

Cinq personnes : Alois Carini, Charlotte Billard, Hyppolite Morel, Ilana
Zarouk (contrats déjà saisis) et Eliott Bec (stagiaire).

Leurs comptes Lead Room ont été créés et vérifiés, leurs accès envoyés à
Jean Decamps. Le CRM se connecte par Google, donc leur profil se crée à la
première connexion. Un contrôle programmé rattache ensuite le code
conseiller et la fiche contrat.

Attention aux libellés en base : la fiche d'Hyppolite est enregistrée
« MOREL Hyppolite » et celle d'Eliott « Eliott  Bec » avec deux espaces.
Faire les correspondances avec un motif souple, jamais une égalité stricte.

**Aucun mot de passe ne figure dans ce dépôt, et il ne doit jamais y en
avoir.** Ils ont été transmis par message et par courriel uniquement.

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
