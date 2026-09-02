# Plan d'amélioration priorisé, phase 2

Établi le 28 août 2026 en croisant l'état des lieux (docs/etat_des_lieux.md) et le benchmark (docs/benchmark_crm.md). Objectif unique : plus de dossiers signés par conseiller et par mois, moins de temps perdu, moins de relances oubliées.

Échelles : impact production de 1 à 5, effort S (moins de 2 jours), M (2 à 5 jours), L (plus de 5 jours). Les trois premiers items de l'axe concerné sont déjà implémentés en phase 3 (une PR chacun, en attente de validation, aucun merge).

## Les 24 améliorations, par axe

### Axe A, cockpit conseiller : l'accueil répond à « que faire maintenant »

* A1. La file du matin : fusionner Mes actions du jour, les occasions de contact et les RDV du jour en une seule liste ordonnée, avec trois gestes (traiter, reporter, fait). Impact 5, effort M. Dépendances : aucune. Risque : faible, tout existe déjà en pièces détachées. Référence : work list Dynamics, Inbox Close.
* A2. FAIT (PR quick win 1) : les lignes d'Actions immédiates ouvrent la fiche client au lieu de copier un nom. Impact 4, effort S.
* A3. FAIT (PR quick win 2) : chaque KPI de l'accueil mène à la liste qui le compose. Impact 3, effort S.
* A4. Les RDV du jour en tête d'accueil, avec l'heure de Paris et le téléphone : les dossiers au statut RDV calé du jour existent en base et n'apparaissent nulle part en synthèse. Impact 4, effort S. Risque : faible.
* A5. Les relances en retard (next_action_date dépassée) mises en avant dans la file, en tête. Impact 3, effort S. Dépendance : adoption de la prochaine action (voir B2, qui la crée automatiquement).
* A6. Les leads dans le CRM : lire la table leads (524 lignes, alimentée quotidiennement, lue par aucun écran) et en faire la liste de travail « lead entrant, premier appel », à la place de l'iframe comme écran par défaut. Impact 5, effort L. Dépendances : cartographie du pont Lead Room, règles d'attribution. Risque : moyen, double saisie temporaire entre les deux produits pendant la transition.
* A7. Reporter une occasion (à demain, à la semaine, à une date) au lieu de la revoir chaque matin. Impact 3, effort S. Référence : snooze Linear et Superhuman.

### Axe B, vitesse d'exécution

* B1. FAIT (PR quick win 3) : la recherche tolérante aux accents et à l'ordre des mots s'étend au Multi-équipement, aux UCS, aux structureurs et au pilotage RH. Impact 3, effort S.
* B2. Séquences de relance minimales : un gabarit pose une chaîne de prochaines actions datées sur le dossier, l'étape suivante s'arme quand la précédente est faite. Aucune donnée saisie à la main, c'est le gabarit qui écrit. Impact 5, effort M. Risque : faible (pas d'envoi d'email automatique dans cette version). Référence : Attio Sequences, Close Workflows.
* B3. Classement par frecency : les fiches récemment et fréquemment consultées remontent dans la palette et l'annuaire (lib/recents.js existe déjà, il manque le départage dans chercher()). Impact 3, effort S. Référence : Raycast.
* B4. Préchargement de la fiche client au survol de la ligne d'annuaire. Impact 2, effort S. Référence : règle des 100 ms de Superhuman.
* B5. Modèles de notes et d'emails à variables ({nom}, {date_rdv}, {produit}), insérés depuis la palette. Impact 3, effort M. Référence : snippets Raycast.
* B6. Écritures optimistes généralisées aux éditions de fiche (le kanban en a déjà). Impact 3, effort M. Risque : moyen, gestion des conflits.
* B7. Saisie de la précision d'origine dans la modale client (la colonne clients.origine existe, la dérivation tourne, il manque le sélecteur). Impact 2, effort S.
* B8. Raccourcis mono touche sur les listes (J K naviguer, Entrée ouvrir), rappelés dans les infobulles comme chez Linear. Impact 3, effort M.

### Axe C, pilotage

* C1. Comparaison à date égale : « au 28 août, le mois dernier, vous étiez à X dossiers », au lieu de comparer un mois entier à un mois entamé. Impact 4, effort S. Risque : faible, date_signed existe.
* C2. Alerte dossiers qui stagnent : un dossier En cours sans changement depuis N jours remonte dans la file et chez le manager. Impact 4, effort M. Dépendance : vérifier la présence d'un horodatage de dernier changement sur deals, sinon l'ajouter (migration légère à valider).
* C3. Rythme constaté contre rythme nécessaire : projection linéaire du mois vers le palier personnel, « à ce rythme, atterrissage à X pour cent ». Impact 3, effort S. Le palier personnel est déjà en place, jamais l'objectif cabinet.
* C4. Valorisation des encours : alimenter contrat_valorisations (200 contrats, 1 valorisation) et afficher l'encours par client et par conseiller. Impact 4, effort L. Dépendances : source de valorisation (relevés compagnies), processus de mise à jour. Risque : moyen, qualité de données.
* C5. Taux de relance par conseiller chez le manager : actions posées, traitées le jour même, en retard. Impact 3, effort M. Dépendance : B2 (sinon il n'y a rien à mesurer, 0 sur 465 aujourd'hui).
* C6. Complétude des fiches en indicateur d'équipe : la progression du taux de date de naissance (9 pour cent aujourd'hui) et des champs du verrou de signature. Impact 2, effort S.
* C7. Objectifs visibles côté conseiller (son rang, sans les montants des autres) : prudence, à valider avec la direction avant tout affichage. Impact 2, effort M. Risque : social.

### Axe D, moteur IA

* D1. Brief de RDV généré la veille : synthèse du client, dossiers, contrats, origine, points ouverts, rendue dans la file du matin. Impact 5, effort M. Dépendances : clé LLM côté fonctions serverless uniquement, jamais d'agrégat cabinet dans les prompts. Risque : faible si validation humaine systématique.
* D2. Résumé client en un clic sur la fiche (même moteur que D1, déclenché à la demande). Impact 4, effort M.
* D3. Brouillons de relance rédigés depuis le dossier, à relire avant envoi. Impact 3, effort M. Référence : Instant Reply Superhuman.
* D4. Priorisation des leads par score (une fois A6 en place). Impact 4, effort L. Dépendance : A6.
* D5. Analyses d'appels Modjo affichées sur la fiche client. Impact 3, effort M à L. Dépendance : accès API Modjo. Risque : moyen, dépendance externe.
* D6. Enrichissement des fiches à la création et rattrapage du stock : séparer prénom et nom (330 fiches sur 379 ont tout dans le champ nom), normaliser les téléphones. Impact 3, effort M. Risque : à traiter par script réversible, revu avant exécution, jamais de modification silencieuse de données.

## Top 10 détaillé

### 1. A1, la file du matin

Maquette texte (accueil conseiller, premier bloc à l'ouverture) :

┌──────────────────────────────────────────────────────────────┐
│ Ma journée                                    12 à traiter   │
│ ┌ 09h30 · RDV Camille Exemple · PER · brief prêt  [Ouvrir]   │
│ ├ Relance due · Dominique Modèle · AV · posée le 21  [Ouvrir]│
│ ├ En retard (2 j) · Sacha Démo · relancer devis   [Reporter] │
│ ├ Occasion · anniversaire de Lou Prototype demain [Appeler]  │
│ └ Afficher les 8 autres                                      │
└──────────────────────────────────────────────────────────────┘

Tables et colonnes : deals (next_action, next_action_date, date_expected, status), clients (téléphone), générateurs de services/opportunites.js, dossier_relance_log pour tracer les reports.
Critères d'acceptation : la file est le premier bloc de l'accueil ; chaque ligne se traite, se reporte ou s'ouvre en un clic ; une ligne traitée disparaît sans rechargement ; jamais plus de 6 lignes visibles avant « afficher les autres » ; temps entre login et première action mesurable en séance de moins de 30 secondes.
Estimation honnête : 3 à 4 jours, la matière existe (Actions du jour, occasions, RDV), le travail est la fusion, l'ordonnancement et les gestes.

### 2. A6, les leads dans le CRM

Maquette texte (écran Leads, remplaçant l'iframe comme vue par défaut, l'iframe restant accessible) :

┌──────────────────────────────────────────────────────────────┐
│ Leads entrants                        8 nouveaux · 3 à moi   │
│ ┌ Reçu 09:12 · campagne impots_2026 · non appelé  [Appeler]  │
│ ├ Reçu 08:47 · campagne per_sept · 1 appel manqué [Rappeler] │
│ └ …                                                          │
│ Délai moyen premier appel cette semaine : 41 min             │
└──────────────────────────────────────────────────────────────┘

Tables et colonnes : leads (524 lignes vivantes : campagne, horodatage, attribution), calls pour l'horodatage du premier appel, deals pour le rattachement une fois le RDV pris.
Critères d'acceptation : tout lead de la table leads apparaît dans les 5 minutes ; le délai lead vers premier appel est affiché et historisé ; aucun écran ne dépend plus du miroir leads_room figé ; l'iframe Lead Room reste accessible en secours.
Estimation honnête : 6 à 10 jours, dont la moitié en cartographie du pont et des règles d'attribution. À découper : lecture seule d'abord, gestes ensuite.

### 3. B2, séquences de relance minimales

Maquette texte (dans la modale dossier, onglet complet) :

│ Séquence : [Relance devis standard ▾]  [Démarrer]            │
│ Étape 1 · J+2 · appel de suivi           → posée le 30/08    │
│ Étape 2 · J+7 · email de relance         → s'armera ensuite  │
│ Étape 3 · J+15 · dernier contact         → s'armera ensuite  │

Tables et colonnes : nouvelle table sequences (gabarits : nom, étapes, délais), deals.next_action et next_action_date (écrites par la séquence), dossier_relance_log (historique des étapes).
Critères d'acceptation : démarrer une séquence pose l'étape 1 immédiatement ; marquer une étape faite arme la suivante au bon délai ; les étapes apparaissent dans la file du matin ; le taux de dossiers En cours porteurs d'une action passe de 0 sur 465 à plus de la moitié en un mois.
Estimation honnête : 3 à 5 jours, dont les gabarits métier à écrire avec deux conseillers.

### 4. D1, brief de RDV généré la veille

Maquette texte (ligne de la file du matin, dépliée) :

│ 09h30 · RDV Camille Exemple · PER                            │
│ Brief : cliente depuis mai, 2 dossiers (PER signé, AV en     │
│ cours), origine campagne impots_2026, dernier échange le 12. │
│ Points ouverts : justificatif de revenus manquant, question  │
│ sur le plafond fiscal. [Voir la fiche complète]              │

Tables et colonnes : deals (date_expected du lendemain), clients, contrats, client_equipment, leads_room (origine). Fonction serverless dédiée dans api/, clé LLM côté serveur uniquement, aucun agrégat cabinet dans le prompt, mention visible « généré, à vérifier ».
Critères d'acceptation : chaque RDV du lendemain a son brief avant 19 h ; génération de moins de 30 secondes par RDV ; aucune donnée d'un client d'un autre conseiller dans le brief (respect RLS via jeton du conseiller) ; le conseiller peut noter le brief utile ou inutile, taux d'utile suivi.
Estimation honnête : 3 à 4 jours, la difficulté est le choix des données et le ton, pas la technique.

### 5. A4, les RDV du jour en tête d'accueil

Maquette : trois lignes maximum au dessus de la file, « 09h30 Camille Exemple · PER · 06 00 00 00 00 », clic vers le dossier. Tables : deals (status Prévu, date_expected du jour, heure via jourDe et heureDe déjà écrits), clients. Critères : tout RDV du jour visible sans un seul clic ; l'heure affichée est l'heure de Paris (le piège UTC est déjà traité en lib). Estimation : 1 jour.

### 6. C1, comparaison à date égale

Maquette : sous chaque KPI du mois, « au 28 du mois dernier : X » à la place de « vs mois préc. » quand le mois est entamé. Tables : deals (date_signed). Critères : la comparaison porte sur le même nombre de jours écoulés ; le libellé dit explicitement « à date égale » ; l'ancienne comparaison mois plein reste sur la vue annuelle. Estimation : 1 à 2 jours.

### 7. C2, dossiers qui stagnent

Maquette : puce « Stagnants » dans la carte Actions du jour, lignes « En cours depuis 24 j sans mouvement · [Relancer] [Abandonner] ». Tables : deals ; dépend d'un horodatage de dernier changement fiable (à vérifier, sinon migration légère ajoutant une colonne mise à jour par trigger, à valider avant toute exécution). Critères : seuil réglable (21 jours par défaut) ; le manager voit le compte par conseiller ; traiter une ligne la sort de la liste. Estimation : 2 à 3 jours dont la vérification de l'horodatage.

### 8. D2, résumé client en un clic

Maquette : bouton « Résumer » dans l'en-tête de la fiche, panneau de 8 lignes maximum, mention « généré, à vérifier ». Tables : identiques à D1, déclenchement à la demande. Critères : moins de 10 secondes ; le résumé cite ses sources internes (quel dossier, quel contrat) ; jamais de montant d'un autre client. Estimation : 2 jours si D1 est fait (même moteur).

### 9. C4, valorisation des encours

Maquette : sur la fiche client, « Encours estimé : X € au 30/06 » ; chez le manager, l'encours par conseiller. Tables : contrat_valorisations (à alimenter : import de relevés compagnies au format CSV, écran d'import avec prévisualisation), contrats, clients. Critères : chaque valorisation porte sa date ; un encours sans valorisation de moins de 6 mois s'affiche « à actualiser » plutôt qu'un chiffre périmé ; aucun encours agrégé cabinet exposé aux conseillers. Estimation : 6 à 8 jours, la difficulté est le processus d'alimentation, pas l'affichage.

### 10. D6, enrichissement des fiches

Maquette : à la création, le champ nom détecte « Aurélie Exemple » et propose la séparation prénom Aurélie, nom Exemple, à confirmer d'un clic ; un écran de rattrapage liste les 330 fiches concernées avec proposition et validation par lot. Tables : clients (prenom, nom, telephone normalisé). Critères : aucune fiche modifiée sans validation explicite ; opération réversible (journal des valeurs d'origine) ; le stock des fiches sans prénom descend sous 10 pour cent en un mois. Estimation : 2 à 3 jours, le risque est la donnée, pas le code : script relu et testé sur copie avant tout passage.

## Synthèse

Les 5 changements qui augmenteraient le plus la production par conseiller :
1. La file du matin (A1) : la journée commence par une liste à dérouler, pas par une décision.
2. Les leads dans le CRM (A6) : la donnée commerciale la plus fraîche du cabinet (524 leads, alimentée hier) devient enfin visible et actionnable.
3. Les séquences de relance (B2) : la relance cesse de dépendre de la mémoire, la prochaine action passe de 0 sur 465 dossiers à la norme.
4. Le brief de RDV généré (D1) : 15 à 30 minutes de préparation ramenées à 2 minutes de relecture, plusieurs fois par jour.
5. La comparaison à date égale et le rythme (C1, C3) : chaque conseiller sait s'il est en avance ou en retard sans calcul mental, sur son palier personnel.

Métriques pour le prouver, mesurées avant et après :
* temps entre login et première action de travail (cible : moins de 30 secondes) ;
* part des relances traitées le jour même de leur échéance ;
* dossiers créés par conseiller et par semaine ;
* délai moyen entre l'arrivée d'un lead et le premier appel ;
* part des dossiers En cours porteurs d'une prochaine action datée (0 pour cent aujourd'hui).
