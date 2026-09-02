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
npx vitest run           # 661 tests
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
* **Complétude des fiches.** Sur l'accueil du conseiller, le bloc
  « Compléter ces fiches » (champs manquants saisissables en ligne,
  `src/components/FichesACompleter.jsx`, logique dans
  `src/lib/completude.js`) ; une jauge sur la fiche client ; la complétude
  par conseiller dans Équipe pour la direction. Mesure du 2 septembre :
  statut renseigné sur 19 % des fiches, revenus 18 %, date de naissance
  9 %, et de 90 % à 0 % selon le conseiller.
* **Campagnes ciblées** (vue direction « Campagnes » dans Clients,
  `src/components/Campagnes.jsx`, logique dans `src/lib/campagnes.js`).
  Six campagnes préconfigurées, critères en direct, et à côté du compte
  de cibles le nombre de clients non évaluables par champ manquant. Lancer
  fige les cibles dans `campagne_cibles` ; le conseiller les traite depuis
  l'accueil (bloc « Campagne »). Tables `campagnes` et `campagne_cibles`,
  RLS : seule la direction crée, chaque conseiller ne voit que ses cibles.
* **Le contrat de rémunération se choisit par ses dates**
  (`api/_lib/contrats.js`), plus par le drapeau `actif` seul. Un
  renouvellement saisi à l'avance prend le relais le jour dit. Le drapeau
  départage deux contrats qui se chevauchent et sert de filet dans le mois
  du départ seulement : un contrat terminé ne compte plus le mois suivant,
  une embauche future ne compte pas avant sa date. Le drapeau n'exclut pas
  à lui seul un contrat en poste : pour écarter une ligne, lui donner une
  date de fin.
* **L'agenda d'équipe lit les profils** (`api/team-calendar.js`) au lieu
  d'une liste figée qui confondait les conseillers.
* **Le nom d'un profil est mis au propre à sa création** (fonction SQL
  `normaliser_nom_complet`, appelée par `handle_new_user`).
* **Un contrôle visuel automatique** joue vingt et un écrans à chaque pull
  request (voir plus bas).
* La fiche client affiche à nouveau tous ses champs (les sections
  repliables s'appellent `form-pliable`, le nom générique `form-section`
  est réservé aux sections plates). Deux modales visaient des classes
  inexistantes : les vrais noms sont `modal-box`, `modal-head`,
  `modal-foot`, et `src/design-system.md` le dit désormais.
* Les quatorze logos partenaires sont en place. Le correctif Pappers du
  Lead Room est déployé (structure regroupée, homonymes signalés).

### L'audit du 2 septembre après midi

Un audit adversarial de tout ce qui avait été mis en ligne dans la journée
(deux workflows, treize auditeurs, trois réfutateurs par constat) a rendu
soixante dix sept constats bruts. Ce qui a été corrigé le jour même :

* **Rémunération, vue direction** : un contrat terminé restait compté tous
  les mois suivants et une embauche future tous les mois précédents (quatre
  contrats terminés en juillet et août comptés en septembre). Le filet du
  contrat actif est désormais borné au mois du départ (`api/_lib/contrats.js`).
* **Trois fonctions Vercel** (agenda d'équipe, rapprochement des leads,
  rémunération) vérifient maintenant `is_active` en plus du rôle, comme la
  fonction SQL `is_manager`.
* **Création de profil** : la restriction de domaine versionnée en mai
  n'avait jamais été appliquée. Un compte Google hors
  `@entasis-conseil.fr` obtient désormais un profil **inactif**, à activer
  dans Pilotage RH ; `normaliser_nom_complet` ne touche plus qu'aux mots
  écrits tout en minuscules (« Paul Le Goff », « Sophie McCarthy » et
  « Sean O'Neil » restent tels quels) ; un conseiller ne peut plus réécrire
  que le statut et la note de ses cibles de campagne. Migration
  `20260902120000_profils_hors_domaine_inactifs_et_noms_v2.sql`, appliquée.
* **Leads** : « Créer le dossier » ne pose plus de `lead_id` depuis la copie
  CRM (identifiant local, inconnu de la Lead Room) ; il n'est plus proposé
  sur un lead pris par un collègue ; le rapprochement direction ouvre le
  dossier existant au lieu d'en créer un second ; une panne de lecture
  s'affiche au lieu de « Aucun lead ».
* **Direction sur son accueil** : les blocs « Compléter ces fiches » et
  « Campagne » s'affichent aussi au manager qui a un code conseiller (57
  fiches lui sont rattachées) ; un conseiller qui suit un lien
  `#/clients/campagnes` ou `#/clients/rattrapage` retombe sur l'annuaire.
* **Fiches à rattraper** : une civilité ou un couple (« Mme », « M et Mme »)
  n'est plus proposé comme prénom sûr, donc jamais précoché.
* **Dossiers sans mouvement** : Abandonner demande confirmation ; un dossier
  qui porte une relance en retard n'est plus montré deux fois (il est déjà
  dans la file du matin).
* **Campagnes et complétude** : « Chef d'entreprise » saisi sans apostrophe
  depuis le Multi équipement était exclu en silence (liste unique, comparaison
  sans ponctuation) ; fourchette d'âge inversée remise à l'endroit ; geste
  « Signé » sur une cible ; erreur de chargement visible ; pagination du
  ciblage ; un rendez vous sans date ne tient plus le premier rang ; le
  score cabinet se calcule sur les scores bruts ; le tableau de complétude
  par conseiller est réservé au manager.
* **Contrôle visuel** : dix huit écrans (plus Leads entrants, Campagnes,
  Fiches à rattraper), une assertion positive par écran (un texte attendu),
  un dossier sans mouvement garanti dans le jeu, et le harnais coupe
  désormais toute requête qui ne va pas au serveur local.
* Un nom de client réel figurait dans deux tests, deux commentaires et un
  document : remplacé par un nom inventé.

Les réfutateurs (trois par constat) ont ensuite confirmé les faits de tous
les constats corrigés et n'ont contredit aucun correctif. Deux retours ont
été appliqués (le badge anniversaire reste affiché tant que la date manque,
même si l'âge est connu) et la seconde synthèse a donné trois alignements
de plus : **le seuil SCPI et la définition de « TNS » sont les mêmes dans
la règle du Multi équipement et dans la campagne** (huit fiches exactement
au seuil, cinq chefs d'entreprise étaient cibles d'un côté et ignorés de
l'autre) ; l'échappement CSV vit dans un seul module (`src/lib/csv-format.js`)
partagé par tous les exports ; la suppression de rattrapage d'une campagne
à moitié écrite est vérifiée ; la liste blanche de la saisie en ligne
(`nettoyerCompletion`) est dans la lib et testée.

Le premier audit a rendu ses derniers verdicts en fin de journée : vingt
sept constats confirmés, vingt deux réfutés, la plupart parce que le
correctif était déjà en ligne. Trois points restaient ouverts sur les
**fiches à rattraper**, corrigés depuis : une ligne retouchée à la main
porte désormais la puce « corrigée » et non plus le jugement de
l'heuristique ; les fiches cochées que la recherche masque sont comptées
dans le bandeau et rappelées dans la confirmation avant d'écrire ; trois
angles morts de la séparation des noms sont fermés (une société comme
« SCI Les Oliviers » ne reçoit plus de prénom, un nom à particule collée en
tête garde son nom entier, un libellé qui finit par une particule n'est
jamais coché d'avance). L'écran a maintenant son test et sa capture. La synthèse finale a encore
donné trois points, traités depuis : un dossier dont la clé de séquence
est posée sans étape le dit à l'écran au lieu d'afficher trois étapes
muettes ; **le nom d'un fichier de migration porte désormais la version
réellement enregistrée en base** (les quatre fichiers du jour étaient
datés à la main et auraient été rejoués par un `supabase db push`) ; le
choix de figer la cible de campagne sur le conseiller principal est écrit
dans la migration.

Ce que l'audit a mis en évidence sans correctif de code :

* **Le 17 septembre, une trentaine de dossiers apparaîtront d'un coup dans
  « Dossiers sans mouvement »** : la migration du 25 août a mis à jour
  159 dossiers et le déclencheur `trg_deals_updated_at` a pris ça pour un
  mouvement. Ce n'est pas un bug ce jour là, c'est un rattrapage. Pour la
  suite, **toute mise à jour de masse dans une migration doit désactiver
  `trg_deals_updated_at` le temps de l'UPDATE** (`alter table deals disable
  trigger trg_deals_updated_at` puis `enable`).
* Deux lignes de `conseiller_contrats` en poste en septembre n'ont aucun
  profil rattaché (dont un stagiaire) : la vue direction les compte sans
  pouvoir les rapprocher de dossiers. À rattacher ou à dater.
* Trois profils existants ont une casse que `normaliser_nom_complet`
  corrigerait ; la fonction ne joue qu'à la création. À corriger à la main
  si Louis le veut.

### Ce qui reste ouvert

* **Contrôle visuel automatique** : en place. `npm run test:visuel` joue
  vingt et un écrans avec une session simulée et des données fictives
  (`tests/visuel/`), et le workflow `controle-visuel.yml` le rejoue à
  chaque pull request en déposant les captures en artefact. En local, il
  faut un serveur `vite preview` sur le port 4173 et Chromium (variable
  `PLAYWRIGHT_CHROMIUM_PATH` si celui de Playwright n'est pas installé).
* **Hyppolite Morel arrive le 14 septembre** : son profil CRM naît à sa
  première connexion Google, il faut alors poser le code `HYPPOLITE` et
  rattacher sa fiche contrat (identifiant
  `8e1bf94e-ce69-448b-abb1-bf57b82f42c2`, libellée « MOREL Hyppolite »).
  Sa date de début est passée au 14 septembre le 2 septembre, sur décision
  de Louis. Reste une incohérence de saisie : la fin est au 1er septembre
  2028 alors que le début est au 14 septembre 2026, à trancher.
* **Une fiche contrat fantôme** : un CDI au 25 mai 2026, sans date de fin,
  sans profil rattaché, avec le drapeau `actif` à faux. Il n'entre dans
  aucun calcul, mais il traîne dans Pilotage RH. À dater ou à retirer.
* **Un dossier porte le co conseiller `MANAGER`**, qui n'est le code de
  personne. Impossible de deviner de qui il s'agit, à corriger à la main.
* **Un nom diverge entre la paie et le CRM** : le bulletin d'un alternant
  écrit son nom sans trait d'union et avec un U là où le CRM met un A. La
  paie fait foi pour l'état civil, mais le nom du CRM s'affiche partout et
  sert de repère à l'équipe : à trancher avec l'intéressé avant de toucher
  au profil.
* **Le CDI de Nans prend le relais le 18 septembre** : son alternance finit
  le 17, le CDI commence le 18 avec le drapeau `actif` à faux. Depuis que
  le contrat se choisit par ses dates, la bascule se fera seule, comme
  celle de Quentin le 1er septembre. Rien à programmer.
* **Un enchaînement de contrats remet l'acquisition de congés à zéro.**
  `joursAcquis` compte les mois depuis la date de début du contrat de
  référence. Le contournement en place est de poser sur le nouveau contrat
  le solde arrêté à la veille (`conges_report` et `conges_report_au`), ce
  qui rend la bascule invisible ; le modèle mériterait tout de même une
  reprise, l'ancienneté devrait suivre la personne et non le contrat.
* **Pull request 41** sur ce dépôt, vieux test de design de mai : à
  fermer ou à refaire.
* **Le compte Pappers rattaché aux outils de Louis n'a plus de crédits**
  (sans rapport avec la clé du Lead Room).

### Le journal des connexions

Onglet **Connexions**, dans le domaine Équipe et RH, pour la direction et la
déléguée RH. Posé le 2 septembre sur demande de Louis, pour la sécurité.

* **Une ligne par connexion réussie, et rien d'autre.** Date, heure, personne,
  IP, ville et pays déduits de cette IP, navigateur. **Rien pendant la
  session** : ni page consultée, ni position, ni durée. « En direct » veut dire
  que la liste se rafraîchit toute seule toutes les 45 secondes, pas qu'on
  suit quelqu'un à la trace.
* **La migration de juin n'avait jamais été appliquée.** `recordLogin()`
  appelait une fonction absente de la base : l'appel échouait en silence depuis
  trois mois et aucune connexion n'était tracée. `auth.audit_log_entries` est
  vide de son côté. L'historique commence donc au 2 septembre.
* **La localisation ne peut venir que du serveur.** Elle est lue dans les en
  têtes que Vercel pose sur la requête (`x-vercel-ip-city`, `-country`), par
  `api/connexion.js` qui vérifie le jeton puis écrit avec la clé de service.
  Un conseiller qui appellerait la fonction d'écriture à la main ne peut ni
  changer son identité, ni déclarer un faux lieu. Le repli `record_login()`
  prend l'IP dans les en têtes PostgREST et n'accepte aucune localisation.
* **Plus aucun appel sortant.** L'ancienne version demandait l'IP publique à
  ipify : l'adresse de chaque collaborateur partait chez un tiers alors que
  notre propre serveur l'a sous les yeux.
* **Conservation six mois**, la durée que recommande la CNIL pour un journal
  de connexion. Purge automatique chaque nuit à 3 h 17 (`pg_cron`, tâche
  `purge-login-audit`). La fonction de purge n'est exécutable que par la clé
  de service : un conseiller ne doit pas pouvoir vider le journal.
* **La lecture passe par `journal_connexions()`**, qui vérifie `is_rh()`. La
  table `login_audit` n'est lisible par personne en direct : RLS active,
  aucune policy. Un conseiller qui suit `#/connexions` retombe sur l'accueil.
* **Deux repères sont signalés** dans le journal : une connexion hors de
  France, et une première connexion depuis une ville jamais vue pour cette
  personne. Ce sont des repères, pas des verdicts : le lieu situe le
  fournisseur d'accès, pas la personne.
* **Reste à faire, côté Louis** : informer l'équipe de l'existence de ce
  journal, de ce qu'il contient et de sa durée de conservation. C'est une
  obligation, pas une politesse, et le CSE doit être consulté. Sans cette
  information, le journal ne serait pas opposable en cas de litige.

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

L'orthographe retenue par Louis est **Zarrouk**, celle de son compte
Google. Sa fiche contrat, qui disait « Zarouk », a été corrigée le
2 septembre.

**Le matricule sert au rattachement**, ce n'est pas un champ décoratif :
Pilotage RH rapproche un contrat d'un profil quand `matricule` égale
`advisor_code`, et le calcul de commission cherche les dossiers par
matricule, libellé du contrat, ou code du profil rattaché.

Le 2 septembre au soir, la fiche RH a été mise au propre en base, sur
demande de Louis :

* **Eliott Bec est finalisé.** Sa fiche contrat n'était rattachée à aucun
  profil, n'avait pas de matricule et portait deux espaces dans son
  libellé : les trois voies de rattachement échouaient en même temps et
  son dossier ne remontait pas dans Rémunération. Profil lié, matricule
  `ELIOTT`, libellé nettoyé.
* **La responsable RH tient la même file que la direction.** Smart RH
  traite le délégué RH comme un manager (`rh_delegue` sur le profil,
  `is_rh()` en base) : il voit l'onglet même sous contrat de mandataire,
  valide, refuse et requalifie. Un écran du contrôle visuel le joue avec un
  profil conseiller délégué RH, pour que ce droit ne se perde pas.
* **La direction change le type d'un congé quand elle veut.** Un sélecteur
  de type se pose sur chaque demande de la file à valider et sur chaque
  absence déjà validée du planning. C'est le type qui décide du décompte :
  seul « Congé payé » entame le solde (`src/lib/conges-solde.js`). Passer un
  congé payé en sans solde accorde donc les dates sans entamer le solde,
  utile quand celui ci ne les couvre pas ; l'inverse les réimpute. Sur une
  absence déjà validée le geste demande confirmation, en disant dans quel
  sens le solde du salarié va bouger.
* **Le solde de congés se recopie du bulletin de salaire, tel quel.** Une
  colonne `conges_report_au` dit à quelle date le solde a été arrêté. Le CRM
  part de ce point, ajoute l'acquisition depuis, et ne décompte que les
  congés pris après. On saisit donc les deux chiffres du bulletin sans
  calcul : le solde et sa date.
  **Sans cette date, le report vaut pour le 1er juin et tous les congés de
  la période sont redécomptés** ; comme la paie les a déjà imputés, il
  fallait alors gonfler le report d'une valeur qui ne correspondait à rien,
  et l'écran affichait « report 31 j » quand le bulletin disait 16.
  **Le solde repris est celui de la période en cours, colonne CP N du
  bulletin**, pas la somme des deux colonnes. Le reliquat CP N moins 1 est
  un acquis de la période précédente, il n'entre pas dans le compteur du
  CRM. Les quatre alternants sont calés sur la colonne CP N de leur
  bulletin d'août, arrêté au 31 août.
  **L'acquisition reprend à la fin du mois calendaire suivant, pas à
  l'anniversaire du contrat.** La paie crédite les 2,5 jours au dernier jour
  du mois travaillé : un bulletin d'août a déjà crédité août. Compter depuis
  l'anniversaire du contrat recréditait ce même mois dès le 1er septembre
  pour qui a démarré un 1er du mois, et deux soldes négatifs du bulletin
  (moins 1,5 et moins 2,5) s'affichaient à 1 et 0 le lendemain. La prochaine
  échéance des quatre alternants est le 30 septembre.
  **Un solde négatif s'affiche tel quel, en rouge et en évidence.** Il est
  normal, ce sont des congés pris par anticipation ; le masquer par un
  arrondi ou une acquisition anticipée fait mentir l'écran.
  **Un contrat qui succède à un autre reprend le solde arrêté à la veille de
  sa prise d'effet**, sinon l'acquisition repart de zéro et le solde recule
  du jour au lendemain. Le CDI qui démarre le 18 septembre porte le solde du
  17, soit 7,5 jours ; il en gagne 2,5 le 30, comme les autres.
* **Qui tient la file ne pose pas ses congés dans Smart RH**, et c'est voulu :
  la colonne de gauche, solde personnel et formulaire de demande, disparaît
  dès que l'écran passe en vue direction. Vaut pour la déléguée RH comme pour
  la direction. Décision de Louis le 2 septembre, ne pas « corriger ».
* **Un commentaire se joint à chaque décision de congé.** Un champ libre dans
  la ligne de la demande à valider, facultatif, valable pour un accord comme
  pour un refus. Il part au salarié dans le mail de décision et reste affiché
  sur sa demande, en gris pour un accord, en rouge pour un refus. Le refus
  demande maintenant confirmation par la fenêtre maison, qui rappelle le
  commentaire ; l'ancien `window.prompt` natif a disparu.
* **Une personne partie sort de Smart RH le 5 du mois suivant.** Un contrat
  qui se termine dans le mois reste affiché jusqu'au 4 du mois d'après, le
  temps de la paie et de la feuille de temps, puis il quitte les compteurs de
  congés et le choix d'un salarié pour une absence (`sortiDesEffectifs` dans
  `src/lib/alertes-contrats.js`). La feuille de temps d'un mois choisi et
  Pilotage RH gardent tout le monde, eux en ont besoin.
* **Les vingt trois fiches contrat ont un matricule.** Sept n'en avaient
  pas. **Le matricule de référence est celui du logiciel de paie**, relevé
  sur le bulletin de salaire : quatre alternants portaient dans le CRM un
  numéro à cinq chiffres qui ne correspondait à rien en paie, ils portent
  désormais le leur. Le matricule suit le salarié et non le contrat : les
  deux fiches d'un même conseiller, alternance puis CDI, portent le même.
  Les autres fiches gardent le code conseiller comme matricule, faute de
  bulletin sous la main ; à corriger quand un bulletin passe.
  Aucune donnée d'un bulletin n'entre dans ce dépôt, matricule mis à part.
* **Hyppolite Morel a son matricule `HYPPOLITE` posé d'avance** : quand son
  profil naîtra à sa première connexion, Pilotage RH le rapprochera tout
  seul de sa fiche. Sa fin de contrat est passée au 14 septembre 2028,
  alignée sur son début.
* **Le libellé d'une fiche contrat suit le nom du profil rattaché.** Un
  même conseiller portait jusqu'à trois orthographes, deux fiches n'avaient
  qu'un prénom. Sans effet sur le rattachement des dossiers, qui passe par
  `advisor_profile_id` puis par le code conseiller.
* **Les deux profils écrits tout en minuscules sont au propre**, via
  `normaliser_nom_complet`.
* **Deux codes co conseiller ne correspondaient à aucun profil** (`DANY`
  au lieu de `DB`, `GIANNIP` au lieu de `GIANNI`) : trois dossiers
  n'apparaissaient pas à leur co conseiller. Corrigés avec
  `trg_deals_updated_at` désactivé le temps de l'UPDATE, pour ne pas les
  sortir du bloc « sans mouvement ».

Alois Carini, Charlotte Billard, Ilana Zarrouk et Eliott Bec sont
finalisés (profil, code conseiller, fiche contrat rattachée). Hyppolite
Morel arrive le 14. Le CRM se connecte par Google, le profil se crée à la
première connexion ; la Lead Room a ses propres comptes.

**Aucun mot de passe ne figure dans ce dépôt, et il ne doit jamais y en
avoir.**

### Deux règles retenues de l'audit

* **Une mise à jour de masse dans une migration ne doit pas compter comme
  un mouvement.** Désactiver `trg_deals_updated_at` le temps de l'UPDATE
  (`alter table deals disable trigger trg_deals_updated_at`, puis `enable`),
  sinon tous les dossiers touchés sortent du bloc « sans mouvement » pour
  vingt et un jours, puis y reviennent le même matin.
* **Le nom d'un fichier de migration doit porter la version enregistrée
  dans `supabase_migrations.schema_migrations`**, pas une date choisie à la
  main. Sinon la migration est rejouée. Vérifier après chaque application :
  `select version, name from supabase_migrations.schema_migrations order by
  version desc limit 5`.

### Une leçon sur les tâches programmées

Une tâche programmée liée à une session peut mourir en silence quand la
session est recyclée : celle du changement de contrat de Quentin n'est
jamais partie. C'est pour cela que le contrat se choisit désormais par ses
dates. Pour toute échéance lointaine, doubler d'un rappel simple.

## Les projets Supabase

* **CRM** : `tvgbblbceqvdtqnbeoik`. Tables principales `deals`, `clients`,
  `profiles`, `conseiller_contrats`, `contrats`, `conformite_dossiers`,
  `campagnes`, `campagne_cibles`.
* **Lead Room** : `mtqowhjshvgkpkhnpilb`, application séparée avec **ses
  propres comptes**. Un conseiller a donc deux mots de passe distincts,
  source récurrente d'appels au support. Le bouton « Recevoir un lien
  magique par email » dépanne à tous les coups.
* Le plan d'amélioration recommande de ramener les leads dans le CRM pour
  supprimer cette double connexion : la table `leads` est alimentée
  quotidiennement et lue par l'écran Leads entrants depuis le 1er septembre.

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
