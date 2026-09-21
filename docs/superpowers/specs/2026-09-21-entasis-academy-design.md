# Entasis Academy : conception

Date : 21 septembre 2026. Brief de Louis : `Prompt_Claude_Code_Entasis_Academy.md`.
Chemin : architectural (nouveau sous système du CRM). Ce document fixe les
choix ; le plan d exécution est dans `docs/superpowers/plans/`.

## 1. Ce que l on construit

Une rubrique **Formation** dans le CRM, pour deux publics :

* le collaborateur (tout profil actif) : Mon parcours, Catalogue, Lecteur de
  formation, Quiz, Mes résultats ;
* la direction et l administrateur formation : Pilotage des formations,
  Administration des contenus.

Douze modules rédigés en français (trois microleçons, un cas pratique, dix
questions corrigées chacun), trois parcours qui les réutilisent, un suivi de
progression honnête (activité observée, réalisation, acquisition démontrée
par les réponses), des révisions à J+7 et J+30, un historique daté.

Rien n est déployé en production par ce travail : les migrations sont livrées
et appliquées sur le projet Supabase de développement (`entasis-crm-DEV`,
`leuqchrianpasianwmjg`), jamais sur `tvgbblbceqvdtqnbeoik`.

## 2. Constats sur le dépôt qui dictent les choix

* La RLS est la seule couche d autorisation. Le rôle n a que deux valeurs,
  `manager` et `advisor` ; les droits supplémentaires sont des drapeaux
  booléens sur `profiles` (`rh_delegue`, `acces_pnl`) gardés par
  `prevent_role_escalation()`.
* Il n existe aucune hiérarchie d équipe en base : le « périmètre » d un
  manager est le cabinet entier. On ne l invente pas.
* Le CRM est une application sans serveur : les lectures passent par
  Supabase sous RLS, les écritures ciblées par `verifierEcriture`, les
  opérations sensibles par des fonctions SQL `security definer` réservées
  (modèle `journal_connexions`, `enregistrer_connexion_serveur`).
* Les migrations sont appliquées par MCP, puis renommées avec la version
  enregistrée dans `supabase_migrations.schema_migrations`. Aucun
  `supabase db push`.
* La navigation vit dans `src/lib/navigation.js`, les écrans lourds sont
  chargés par `React.lazy`, le rendu d un domaine est un conditionnel dans
  `App.jsx`, le profil descend par props, il n y a pas de contexte React.
* Le rendu markdown existe (`marked` + `DOMPurify`, `EditorialHub`), les
  graphiques passent par `react-chartjs-2`, l export CSV par
  `src/lib/export-csv.js` (échappement anti injection, journal).
* Le contrôle visuel Playwright renvoie `{}` à toute route `/api` non
  simulée et un jeu de tables fictives ; chaque écran a une assertion.
* Aucun cron Vercel, `pg_cron` en prod seulement (pas sur le projet DEV) ;
  la leçon du dépôt est de préférer un prédicat sur des dates à un job.

## 3. Décisions

### 3.1 Rôles

| Rôle du brief | Réalisation |
|---|---|
| Collaborateur | tout profil actif (`is_staff()`), ses données par `profile_id = auth.uid()` |
| Manager | `is_manager()` ; périmètre = cabinet entier (documenté, pas de table d équipe) |
| Administrateur formation | nouveau drapeau `profiles.academy_admin` + `est_admin_academy()` = `is_manager()` ou drapeau, profil actif ; bloc ajouté à `prevent_role_escalation()` en repartant du texte lu en production le 21/09/2026 |
| Direction | `is_manager()` ; jamais `est_direction_pnl()`, réservé à la rémunération |

La consultation des corrigés est restreinte séparément : la table des
corrigés n est lisible par personne en direct.

### 3.2 Correction côté serveur, sans fonction Vercel

Le tirage et la correction sont des fonctions SQL `security definer`
exécutées dans Postgres avec l identité `auth.uid()` : le navigateur ne
reçoit jamais les bonnes réponses avant soumission, le score est calculé en
base, la soumission est idempotente par identifiant de tentative. Cela
respecte la règle du dépôt (« application sans serveur ») et n ajoute aucune
variable Vercel. Les battements d activité sont horodatés par `now()` de
Postgres, jamais par une durée envoyée par le client.

### 3.3 Versions immuables

Un module a des versions. Une version publiée ne change plus (déclencheur
`before update` qui refuse). Modifier un module publié crée un brouillon
(nouvelle version, copie des leçons et des questions). Les tentatives, les
réponses et les révisions référencent la version et les questions de cette
version. Archiver une version ne supprime rien.

### 3.4 Statuts et retard

Statut d une affectation : `non_commence`, `en_cours`, `a_revoir`, `valide`.
Le retard est un indicateur distinct : `echeance < aujourd hui` et non
validé. Une révision manquée ou échouée passe le statut à `a_revoir` sans
effacer la validation ni l attestation.

### 3.5 Mesure de l activité

* une session par ouverture de leçon, un jeton client unique (idempotence) ;
* un battement toutes les 30 s, envoyé seulement si la page est visible et
  qu une interaction a eu lieu depuis moins de 120 s ;
* en base, `academy_battement()` prolonge l intervalle courant si le dernier
  battement date de moins de 45 s, sinon ouvre un nouvel intervalle. Une
  coupure réseau ne se rattrape pas ;
* la durée active se calcule en SQL par fusion des intervalles d une même
  personne, toutes sessions et onglets confondus : deux onglets ne comptent
  pas double ;
* la règle des 120 s peut sous estimer une lecture attentive : l écran le dit.

Aucune capture, aucune frappe, aucune webcam. Une notice « Données suivies »
est affichée au collaborateur.

### 3.6 Révisions

À la validation d un module, deux lignes de révision sont créées dans la
même transaction (J+7 et J+30, délais lus dans `academy_parametres`),
protégées par une contrainte d unicité. Une révision est « due » par un
prédicat sur les dates ; aucun job n est nécessaire. Un quiz de révision tire
3 à 5 questions non utilisées par la tentative initiale quand la banque le
permet.

### 3.7 Notifications

Pas de mail en V1. Les révisions dues et les affectations en retard
alimentent la cloche existante (`NotificationsBell`) via une RPC légère
appelée par `App.jsx`, regroupées (« 3 révisions dues »).

### 3.8 Contenu et validation métier

Le catalogue est semé en **brouillon**. La publication est un geste de
l administrateur qui enregistre qui a relu (nom) et quand. Aucune
certification réglementaire n est revendiquée ; le justificatif s appelle
« Attestation interne de réalisation » et se génère en PDF à partir d une
ligne `academy_attestations` écrite par la base à la validation.

### 3.9 Ce qui n est pas fait en V1

Mails de rappel, hiérarchie d équipe, correction libre par IA, thème sombre,
temps réel, gamification.

## 4. Modèle de données (préfixe `academy_`)

* `academy_parametres` (singleton) : `seuil_reussite_defaut 0.80`,
  `delai_j7 7`, `delai_j30 30`, `retention_intervalles_mois 12`,
  `questions_par_quiz 5`, `questions_par_revision 4`.
* `academy_modules` : `slug` unique, `titre`, `theme`, `niveau`, `ordre`,
  `archive_le`.
* `academy_module_versions` : `module_id`, `numero`, `statut`
  (`brouillon` | `publie` | `archive`), `objectif`, `competence`,
  `duree_minutes`, `prerequis` (slugs), `seuil_reussite`, `cas_pratique`
  (jsonb), `a_completer` (jsonb), `publie_le`, `publie_par`,
  `relu_par` (texte), `relu_le`, `sources` (jsonb). Unique
  (`module_id`, `numero`).
* `academy_lecons` : `version_id`, `ordre`, `slug` (l1..l3), `titre`,
  `objectif`, `duree_minutes`, `contenu_md`, `mini_question` (jsonb, bonne
  réponse incluse : elle sert d interaction de compréhension, pas de note),
  `sources` (jsonb). Unique (`version_id`, `ordre`).
* `academy_questions` : `version_id`, `lecon_id`, `cle`, `type`,
  `competence`, `enonce`, `choix` (jsonb, texte seul), `difficulte`.
* `academy_corriges` : `question_id` (clé primaire, référence
  `academy_questions`), `bonne_reponse`, `explication`. RLS active, aucune
  policy, `revoke all` pour `anon` et `authenticated`.
* `academy_parcours` : `slug`, `titre`, `description`, `ordre`.
* `academy_parcours_modules` : `parcours_id`, `module_id`, `ordre`,
  `obligatoire`, `delai_jours`. Unique (`parcours_id`, `module_id`).
* `academy_affectations` : `profile_id`, `module_id`, `version_id`,
  `parcours_id` (nullable), `obligatoire`, `echeance` (date), `statut`,
  `affecte_par`, `created_at`. Unique (`profile_id`, `version_id`).
* `academy_progression_lecons` : `profile_id`, `lecon_id`, `version_id`,
  `position` (jsonb), `mini_question_reussie_le`, `terminee_le`,
  `updated_at`. Unique (`profile_id`, `lecon_id`).
* `academy_sessions` : `profile_id`, `lecon_id`, `version_id`,
  `jeton_client` unique, `ouverte_le`, `dernier_battement_le`.
* `academy_intervalles` : `session_id`, `profile_id`, `debut`, `fin`.
* `academy_tentatives` : `profile_id`, `version_id`, `type`
  (`quiz` | `revision_j7` | `revision_j30`), `numero`, `questions` (jsonb :
  identifiants tirés et ordre des choix), `jeton_client` unique,
  `demarree_le`, `soumise_le`, `score`, `total`, `reussie`, `duree_s`,
  `seuil`. Unique (`profile_id`, `version_id`, `type`, `numero`).
* `academy_reponses` : `tentative_id`, `question_id`, `reponse`, `correcte`.
  Unique (`tentative_id`, `question_id`).
* `academy_validations` : `profile_id`, `version_id`, `valide_le`,
  `tentative_id`. Unique (`profile_id`, `version_id`).
* `academy_attestations` : `numero` unique (EA AAAA NNNN), `profile_id`,
  `version_id`, `delivree_le`, `score`, `total`.
* `academy_revisions` : `profile_id`, `version_id`, `type` (`J7` | `J30`),
  `echeance` (date), `tentative_id`, `resultat`. Unique
  (`profile_id`, `version_id`, `type`).
* `academy_evenements` : append only (`profile_id`, `type`, `survenu_le`,
  `version_id`, `detail`).
* `academy_journal_admin` : append only (`profile_id`, `action`, `cible`,
  `detail`).
* `academy_commentaires_coaching` : `profile_id`, `auteur_id`, `texte`,
  `created_at` (manager seulement).

Index sur chaque clé étrangère et sur les accès d écran ; horodatages
`timestamptz`, échéances en `date`.

## 5. Fonctions SQL (security definer, `set search_path = public`)

| Fonction | Qui | Rôle |
|---|---|---|
| `est_admin_academy()` | authenticated | droit d administration |
| `academy_ouvrir_session(lecon_id, jeton)` | staff | crée ou retrouve la session |
| `academy_battement(session_id)` | staff | prolonge ou ouvre un intervalle, borné par `now()` |
| `academy_terminer_lecon(lecon_id, reponse_mini_question)` | staff | vérifie la mini question, pose `terminee_le`, statut `en_cours` |
| `academy_ouvrir_tentative(version_id, type, jeton)` | staff | tirage équilibré par leçon, ordre mélangé, retourne énoncés et choix seulement |
| `academy_soumettre_tentative(tentative_id, reponses)` | staff | correction, score, validation, révisions, attestation ; idempotente |
| `academy_corrige(tentative_id)` | staff (sa tentative soumise) ou manager | corrigé après soumission |
| `academy_mon_parcours()` | staff | affectations, progression, révisions dues, durées |
| `academy_mes_rappels()` | staff | items pour la cloche |
| `academy_pilotage(depuis, jusqua)` | manager | lignes par personne et indicateurs avec dénominateurs |
| `academy_fiche(profile_id)` | manager ou soi | frise, tentatives, révisions |
| `academy_matrice_competences()` | manager | collaborateurs × compétences, non évalué distinct de zéro |
| `academy_affecter(parcours_id ou module_id, profile_ids, echeance)` | admin | affectations idempotentes |
| `academy_publier_version(version_id, relu_par)` | admin | publie, journalise |
| `academy_nouvelle_version(module_id)` | admin | brouillon copié |
| `academy_purger_intervalles()` | service role | applique la rétention |

## 6. Écrans

Domaine **Formation** dans `buildNavDomains`, tab `formation`, sous vues
`parcours`, `catalogue`, `resultats`, et pour manager ou admin `pilotage`,
`administration`. Liens profonds : `#/formation/<vue>`,
`#/formation/module/<slug>`, `#/formation/lecon/<id>`,
`#/formation/quiz/<version_id>`, `#/formation/fiche/<profile_id>`.

Composants dans `src/components/academy/`, chargés par `lazy` ; un seul
fichier `academy.css` (préfixe `ac-`, jetons de `styles.css` seulement) ;
`RenduMarkdown` partagé dans `components/ui`. Priorité au desktop, adaptation
tablette et mobile, clavier et focus visibles, aucune valeur dépendant de la
seule couleur.

## 7. Contenu

Douze modules générés par des rédacteurs puis vérifiés (règles fiscales et
juridiques contrôlées à la source officielle, procédures internes remplacées
par « [à compléter par le cabinet] », cas fictifs étiquetés). Semés en
brouillon par une migration idempotente (`where not exists` sur le slug),
jamais de `do update`. Trois parcours : « Intégration, 30 jours »,
« Fondamentaux du conseiller », « Perfectionnement ».

## 8. Tests et preuves

* vitest : libs pures (statuts, révisions, battements, tirage côté
  affichage), service (faux client), composants de présentation ;
* SQL sur le projet DEV : scénarios d acceptation joués sous
  `set role authenticated` avec un `request.jwt.claims` de conseiller, en
  transaction annulée : corrigés illisibles, tentatives d un collègue
  illisibles, soumission idempotente, score serveur, révisions uniques,
  version publiée immuable ;
* contrôle visuel : sept écrans ajoutés avec assertion ;
* `npx eslint src/`, `npx vitest run`, `npx vite build`.
