# État des lieux du CRM Entasis

Phase 0 du plan benchmark et amélioration. Établi le 28 août 2026, en lecture seule sur le code (branche main, commit d05f26f) et sur la base de production (agrégats uniquement, aucune donnée nominative). Tout chiffre de volumétrie date du 28 août 2026.

## 1. Écarts entre le brief et le code réel

Le brief décrivait un projet Next.js dont les tables principales seraient advisors, leads_traites, lead_sequences, bookings et sync_logs. Le code réel contredit ces deux points, le plan est ajusté en conséquence.

* Stack réel : React 18.3 avec Vite 5.4, fichiers .jsx, pas de Next.js. SPA qui parle directement à Supabase (PostgREST) : la RLS Postgres est la seule couche d'autorisation. Déploiement Vercel, avec 5 fonctions serverless dans api/ (seules détentrices de la clé service_role). Tests Vitest (332 verts au 28 août), ESLint (0 erreur).
* Le « nom interne Lead Room » désigne en réalité un AUTRE produit : la plateforme de génération de leads, développée séparément. Ce CRM (entasis-crm-supabase) la consomme de deux façons : un onglet Leads Live qui est une iframe de la Lead Room, et un miroir local leads_room alimenté par un pont, figé depuis le 4 mai 2026.
* Les tables citées par le brief qui existent vraiment ici : leads, calls, campaigns, prospects (héritées du pont Lead Room). Les tables réellement structurantes du CRM sont : clients, deals (les dossiers), dossiers_immo, profiles, objectifs, conseiller_contrats, contrats, activities, acces_log. 49 tables au total dans le schéma public.

## 2. Inventaire des écrans réellement en production

La navigation est organisée en 9 domaines (source unique src/lib/navigation.js), avec des vues conditionnées au rôle (manager, conseiller, RH délégué).

* Accueil : « Mon mois » pour un conseiller (hero d'objectif personnel, KPI du mois, stats cabinet agrégées, Mes actions du jour, Actions immédiates du jour, saisonnalité 12 mois), « Vue cabinet » pour un manager (KPI cabinet, saisonnalité par métrique, classement conseillers).
* Leads Live : iframe de la Lead Room (produit externe).
* Activité : Pipeline (kanban avec glisser déposer et annulation), Prévisionnel ou Management selon le rôle, Agenda, Cockpit ratios.
* Clients : Annuaire (recherche tolérante aux accents et à l'ordre des mots, tri, aperçu latéral, export CSV journalisé, badge d'origine), Dossiers du mois (édition inline du statut et de la priorité), Multi équipement (détection d'opportunités de cross sell), Conformité.
* Immobilier : suivi des dossiers immobiliers (pipeline dédié, fiches dispositifs, partenaires).
* Marchés et Produits : Marchés financiers, UCS Structurés, Allocations types.
* Équipe et RH : Équipe, Pilotage RH, Recrutement (manager ou RH délégué), Smart RH congés, Rémunération.
* Éditorial (manager uniquement) : agent éditorial, newsletters, posts LinkedIn.
* Outils CGP : boîte à outils métier (simulateurs, PER fiscal, fiches).

Transverse, tous écrans : palette de commandes Ctrl ou Cmd K (récents consultés, navigation, fiches, verbes d'action), raccourcis clavier (« / » recherche, « n » nouveau dossier, « ? » aide), liens profonds par hash (#/clients/c/id), notifications, squelettes de chargement, confirmations non bloquantes avec annulation, préférences de filtres mémorisées par conseiller.

## 3. Parcours type d'un conseiller, du login à la signature

Compté dans le code, en interactions (clic, touche, geste). Une session persistée saute l'étape 1.

1. Connexion : email, mot de passe, bouton, soit 3 interactions. Session persistée : 0.
2. Prendre connaissance du jour : écran d'accueil, 0 clic. Les relances posées apparaissent dans Mes actions du jour (chaque ligne ouvre le dossier en 1 clic). Les occasions de contact (anniversaires, fiches à compléter, Madelin) sont dans la carte Actions immédiates : 1 clic copie le téléphone ou le nom, mais n'ouvre PAS la fiche (voir section 6).
3. Traiter les leads : onglet Leads Live, qui charge l'iframe de la Lead Room. Le conseiller travaille donc dans l'autre produit. Quand un lead prend rendez vous, le pont crée automatiquement un brouillon de dossier au statut « RDV calé » dans le CRM : 0 saisie côté conseiller.
4. Créer un dossier : touche « n » (0 clic) ou bouton Nouveau dossier (1 clic). Modale en deux temps : le mode express demande 6 champs (client avec recherche des fiches existantes, produit, montant, statut, conseiller prérempli, mois prérempli), puis Enregistrer. Environ 8 interactions, de l'ordre de 15 secondes. Le mode complet (frais, co conseiller, source, notes, prochaine action) reste accessible dans la même modale.
5. Suivre et relancer : pipeline kanban, changer un statut est 1 geste de glisser déposer (avec annulation), ou 2 clics en édition inline depuis Dossiers du mois. Poser une prochaine action : ouvrir le dossier (1 clic), saisir l'action et sa date (2 champs), Enregistrer. Elle réapparaît d'elle même dans Mes actions du jour à la date choisie.
6. Faire signer : glisser le dossier vers Signé (1 geste). Le verrou de signature exige une fiche client complète (email, téléphone, statut professionnel, profession, revenus, patrimoine) : si la fiche est incomplète, la signature est bloquée et le client apparaît dans « Fiches à compléter ». La signature électronique elle même se fait hors CRM (outils assureurs), le CRM enregistre le statut et la date.
7. Après signature : le dossier alimente la fiche client (timeline, équipement, contrats), le multi équipement recalcule les opportunités, la rémunération du conseiller se met à jour sur son écran Rémunération.

Points de friction résiduels sur ce parcours : l'étape 3 vit dans une iframe (deux produits, deux ergonomies, pas de lien profond entre un lead et sa fiche CRM), et l'étape 2 mélange des listes cliquables et des listes à recopier.

## 4. Le gisement : données présentes en base, absentes de l'interface

Volumétrie relevée le 28 août 2026. C'est la section la plus rentable du document : ces données existent déjà, personne ne les voit.

* Table leads : 524 lignes, dont des lignes créées la veille du relevé. Elle est donc encore alimentée. AUCUN écran du CRM ne la lit (seule la sonde de santé des flux la surveille). L'onglet Leads Live montre l'iframe externe, et le miroir leads_room (109 lignes) est figé depuis le 4 mai. Conséquence mesurable : 216 des 465 dossiers portent un lead_id, mais 26 seulement retrouvent leur ligne dans le miroir, d'où des origines « Lead, campagne inconnue » sur les fiches.
* Table calls : 59 appels (téléphonie Aircall via le pont), dernier au 4 mai, aucun écran. L'historique d'appels d'un client n'apparaît nulle part sur sa fiche.
* clients.date_naissance : renseignée sur 33 fiches sur 379 (9 pour cent). Trois générateurs d'occasions de contact en dépendent (anniversaires, revue d'anniversaire de contrat, compte à rebours des 70 ans) : ils tournent presque à vide.
* Saisies livrées cette année restées vides : next_action 0 dossier sur 465, activities 0 ligne, client_interactions (journal d'échanges) 0 ligne, client_documents 0 ligne. La leçon structurante de ce CRM : ce qui repose sur une saisie volontaire n'est pas rempli, ce qui est dérivé des données existantes marche (l'origine client dérivée couvre 331 fiches sur 379 sans aucune saisie).
* Table contrats : 200 contrats rattachés aux fiches clients, mais 1 seule ligne de valorisation (contrat_valorisations). L'encours réel du portefeuille n'est valorisable nulle part.
* clients.origine : 0 saisie sur 379. La dérivation automatique est en production depuis le 27 août, mais le champ de précision (réseau perso, recommandation, partenaire) n'a pas encore d'interface de saisie.
* Modules vivants sans données : dossiers_immo 0 ligne (l'écran Immobilier est complet mais vide), conformite_dossiers 1 ligne, prospects 0 ligne.
* acces_log : 0 ligne (journalisation des exports livrée le 27 août, en attente des premiers exports).

## 5. Dette repérée

* Monolithe App.jsx : 5 397 lignes. Le pipeline, les dossiers du mois, le prévisionnel, l'équipe, la modale dossier, l'authentification et le routing y cohabitent. 9 modules sont extraits en chargement différé, mais toute évolution du cœur passe par ce fichier.
* Cinq composants portent chacun plus de 1 700 lignes avec leur propre bloc de styles embarqué et leurs helpers locaux : OutilsCGP (2 670), ManagementView (2 514), MultiEquipement (2 160), UcsStructures (2 134), PilotageRH (1 792). Ils vivent à côté de la charte centralisée styles.css, d'où des dérives visuelles possibles à chaque retouche.
* Recherche à deux vitesses : l'annuaire clients bénéficie de la recherche tolérante (accents, ordre des mots, pertinence, surlignage), mais au moins six champs de recherche utilisent encore une comparaison stricte (pipeline, dossiers du mois, multi équipement, conformité, UCS, recrutement) : « aurelie » n'y trouve pas « Aurélie ». 48 fiches clients sur 379 portent un accent dans le nom.
* Nommage bilingue et hérité : deals désigne les dossiers, advisor_code identifie un conseiller par un code texte libre réconcilié via la table advisor_aliases, la valeur lead_room apparaît comme source de dossier. Coût d'entrée pour tout nouveau développeur.
* Données : 12 groupes de fiches clients en doublon connus (dont un faux doublon à ne surtout pas fusionner), 330 fiches sur 379 avec le nom complet dans le champ nom et le prénom vide.
* Qualité : 0 erreur ESLint, 1 avertissement restant, 332 tests. Les écrans principaux ont des squelettes de chargement et des états vides depuis les séries A à D, sans audit exhaustif des écrans secondaires.
* Performance : pas de requête SQL lente identifiée après l'audit du 25 août (index FK ajoutés, policies RLS consolidées). Le coût restant est côté client : l'annuaire assemble 3 requêtes en mémoire (colonnes réduites et rendu paginé depuis la série B), et l'iframe Lead Room recharge l'application externe à chaque visite de l'onglet.

## 6. Écran d'accueil : ce qui est cliquable, ce qui est une impasse

Vérifié dans le code composant par composant (le composant KpiCard n'accepte aucun gestionnaire de clic).

Mène à une liste de travail ou à une action, côté conseiller :

* Chaque ligne de « Mes actions du jour » ouvre le dossier concerné (1 clic).
* La checklist d'accueil d'un nouveau conseiller : chaque étape a un bouton qui mène à l'écran concerné.
* Le bouton Nouveau dossier, la palette de commandes, les badges de compteur de la sidebar (pipeline, immobilier).

À mi chemin, côté conseiller :

* La carte « Actions immédiates du jour » (fiches à compléter, anniversaires, Madelin, épargne enfants, 70 ans) : le clic copie le téléphone ou le nom dans le presse papier, mais n'ouvre ni la fiche ni le dossier. Le conseiller doit rouvrir l'annuaire et rechercher lui même. C'est une liste de travail à moitié branchée, requalification proposée en phase 2.

Impasses (le chiffre s'affiche, rien n'est cliquable) :

* Conseiller : les 4 cartes KPI du mois (PP signée, PP pipeline, PU signée, PU pipeline), les 2 cartes cabinet, les 6 chiffres du hero, le total « occasions », le graphe de saisonnalité (infobulles au survol uniquement).
* Manager : les 5 cartes KPI de la vue cabinet, le classement conseillers (aucune ligne cliquable, vérifié), les graphes.

Autrement dit : sur l'accueil, les chiffres qui donnent envie d'agir (une PP pipeline élevée, un dossier qui manque à l'objectif) ne mènent jamais à la liste des dossiers qui les composent. Les seules vraies listes de travail cliquables sont Mes actions du jour et la checklist.
