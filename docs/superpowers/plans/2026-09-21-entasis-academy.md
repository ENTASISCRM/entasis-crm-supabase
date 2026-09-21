# Entasis Academy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une rubrique Formation dans le CRM, avec catalogue, lecteur, quiz corrigés en base, suivi honnête, révisions J+7 et J+30, pilotage direction et administration des contenus.

**Architecture:** Tables `academy_*` sous RLS, fonctions SQL `security definer` pour tout ce qui touche aux corrigés et aux durées, un domaine `formation` dans la navigation, des composants `src/components/academy/` chargés en `lazy`, un service `src/services/academy.js`, des libs pures testées dans `src/lib/academy/`.

**Tech Stack:** React 18, Vite 5, Supabase (Postgres 17, RLS, plpgsql), vitest, Playwright (contrôle visuel), marked + DOMPurify, react-chartjs-2, jsPDF.

**Spec:** `docs/superpowers/specs/2026-09-21-entasis-academy-design.md`

## Global Constraints

* Aucune mise en ligne : branche `claude/entasis-academy`, pull request, pas de merge.
* Base de production en lecture seule ; les migrations s appliquent sur `entasis-crm-DEV` (`leuqchrianpasianwmjg`).
* La RLS est la seule couche d autorisation ; toute écriture ciblée passe par `verifierEcriture`.
* Français sans tiret dans les libellés, les documents et les messages de commit ; pas d emoji dans l interface.
* Aucune donnée client réelle ; cas fictifs étiquetés.
* Aucune revendication de certification réglementaire ni d heures DDA ; « Attestation interne de réalisation ».
* Le score et la validation se calculent en base ; les bonnes réponses ne quittent jamais la base avant soumission.
* Validation : `npx eslint src/` (une erreur préexistante corrigée en tâche 1, un avertissement préexistant toléré), `npx vitest run`, `npx vite build`, `npm run test:visuel`.

---

## File Structure

* `supabase/migrations/20260921_academy_1_socle.sql` : drapeau, helper, tables, RLS, triggers, index.
* `supabase/migrations/20260921_academy_2_fonctions.sql` : sessions, battements, tirage, soumission, corrigé, parcours, affectations, publication, pilotage, rappels, purge.
* `supabase/migrations/20260921_academy_3_seed_catalogue.sql` : douze modules en brouillon, trois parcours (généré par `scripts/academy/generer-seed.mjs` depuis `scripts/academy/catalogue/*.json`).
* `scripts/academy/tests-sql/*.sql` : scénarios d acceptation joués sur DEV.
* `src/lib/academy/statuts.js` (+ test) : statut d une affectation, retard, libellés, couleurs.
* `src/lib/academy/revisions.js` (+ test) : révisions dues, prochaine révision, regroupement pour la cloche.
* `src/lib/academy/battement.js` (+ test) : machine d état des battements (visible, actif, 120 s, 30 s).
* `src/lib/academy/quiz.js` (+ test) : validation locale des réponses, format « 4/5 et 80 % ».
* `src/lib/academy/format.js` (+ test) : durées, dates Europe/Paris, pourcentages.
* `src/lib/academy/attestation-pdf.js` : PDF jsPDF depuis une ligne `academy_attestations`.
* `src/lib/academy/csv.js` (+ test) : colonnes de l export pilotage.
* `src/services/academy.js` (+ test) : lectures sous RLS, RPC, écritures vérifiées, retry réseau.
* `src/components/ui/RenduMarkdown.jsx` : rendu markdown sanitisé partagé.
* `src/components/academy/Academy.jsx` : conteneur, routage interne, chargement.
* `src/components/academy/MonParcours.jsx`, `Catalogue.jsx`, `ModuleDetail.jsx`, `LecteurLecon.jsx`, `Quiz.jsx`, `MesResultats.jsx`, `Pilotage.jsx`, `FicheCollaborateur.jsx`, `Administration.jsx`, `EditeurVersion.jsx`, `NoticeDonnees.jsx`, `academy.css` (+ tests `.test.jsx` de présentation).
* `src/lib/navigation.js` : domaine Formation.
* `src/App.jsx` : lazy, rendu du domaine, routes hash, titres, cloche.
* `tests/visuel/harnais.mjs`, `tests/visuel/controle.mjs` : tables fictives et scénarios.
* `CLAUDE.md`, `docs/architecture-detaillee.md` : section Entasis Academy.

---

### Task 1: Branche, correctif eslint préexistant, spec et plan

**Files:**
* Modify: `src/lib/metrics.test.js` (import en double de `advisorMetrics`).
* Create: `docs/superpowers/specs/2026-09-21-entasis-academy-design.md`, `docs/superpowers/plans/2026-09-21-entasis-academy.md`.

- [ ] Step 1 : `npx eslint src/` ; constater l erreur de parsing sur `metrics.test.js`.
- [ ] Step 2 : retirer l import en double ; `npx eslint src/` ne rend plus qu un avertissement (`logger.js`).
- [ ] Step 3 : commit `fix(tests): import en double dans metrics.test.js`.
- [ ] Step 4 : commit `docs(academy): conception et plan`.

### Task 2: Migration 1, le socle

**Files:** Create `supabase/migrations/20260921_academy_1_socle.sql`.

**Produces:** tables du § 4 de la spec, `profiles.academy_admin`, `public.est_admin_academy()`, `prevent_role_escalation()` étendue (texte de prod du 21/09/2026 plus un bloc), déclencheurs `academy_version_immuable`, `academy_append_only`, `academy_updated_at`, RLS et grants.

- [ ] Step 1 : écrire la migration, en tête : pourquoi, additif, « NON APPLIQUEE EN PRODUCTION, appliquee sur entasis-crm-DEV le ... ».
- [ ] Step 2 : RLS : `select` staff sur modules et versions publiées (brouillons visibles par `est_admin_academy()`), leçons et questions idem, `academy_corriges` sans policy + `revoke all`, progression et sessions `profile_id = auth.uid()`, affectations lues par soi ou manager, écrites par admin, journaux append only, `revoke all` sur tentatives/réponses/intervalles pour `authenticated` (lecture par RPC seulement) sauf lecture de ses propres tentatives soumises.
- [ ] Step 3 : appliquer sur DEV par MCP `apply_migration` (après le prérequis DEV : `is_staff`, `is_rh`, `rh_delegue`), relire `schema_migrations`.
- [ ] Step 4 : commit `feat(academy): socle de la formation interne`.

### Task 3: Migration 2, les fonctions

**Files:** Create `supabase/migrations/20260921_academy_2_fonctions.sql`.

**Produces (signatures) :**
* `academy_ouvrir_session(p_lecon_id uuid, p_jeton uuid) returns uuid`
* `academy_battement(p_session_id uuid) returns timestamptz`
* `academy_terminer_lecon(p_lecon_id uuid, p_reponse int) returns jsonb` `{correcte, terminee_le}`
* `academy_ouvrir_tentative(p_version_id uuid, p_type text, p_jeton uuid) returns jsonb` `{tentative_id, numero, total, questions:[{id, enonce, type, choix:[text], lecon_id}]}`
* `academy_soumettre_tentative(p_tentative_id uuid, p_reponses jsonb) returns jsonb` `{score, total, pourcentage, seuil, reussie, module_valide, corrections:[{question_id, reponse, bonne_reponse, correcte, explication, lecon_id}], attestation}`
* `academy_corrige(p_tentative_id uuid) returns jsonb`
* `academy_mon_parcours() returns jsonb` `{affectations:[...], progression:[...], revisions:[...], tentatives:[...], durees:[{version_id, secondes}], validations, attestations}`
* `academy_mes_rappels() returns jsonb`
* `academy_affecter(p_profile_ids uuid[], p_module_id uuid, p_parcours_id uuid, p_echeance date, p_obligatoire boolean) returns int`
* `academy_publier_version(p_version_id uuid, p_relu_par text, p_commentaire text, p_imposer_nouvelle_formation boolean) returns jsonb`
* `academy_nouvelle_version(p_module_id uuid) returns uuid`
* `academy_pilotage(p_depuis date, p_jusqua date) returns jsonb`
* `academy_fiche(p_profile_id uuid) returns jsonb`
* `academy_matrice_competences() returns jsonb`
* `academy_duree_active(p_profile_id uuid, p_depuis timestamptz, p_jusqua timestamptz) returns int` (fusion d intervalles)
* `academy_purger_intervalles() returns int` (service role)

- [ ] Step 1 : écrire les fonctions ; identité par `auth.uid()` partout ; `revoke execute from public, anon` puis `grant to authenticated` (sauf purge).
- [ ] Step 2 : appliquer sur DEV, relire `schema_migrations`.
- [ ] Step 3 : commit.

### Task 4: Scénarios d acceptation SQL sur DEV

**Files:** Create `scripts/academy/tests-sql/acceptation.sql` et `scripts/academy/tests-sql/LISEZMOI.md`.

- [ ] Step 1 : jeu minimal (un module publié fictif, deux profils DEV existants).
- [ ] Step 2 : sous `set local role authenticated; set local request.jwt.claims` : un conseiller ne lit pas `academy_corriges` ni les tentatives d un collègue ; `academy_ouvrir_tentative` ne renvoie aucune bonne réponse ; `academy_soumettre_tentative` deux fois renvoie le même résultat ; échec puis réussite conservent deux tentatives et le premier score ; deux révisions uniques ; version publiée immuable ; publier une nouvelle version ne modifie pas l ancienne tentative ; deux sessions avec chevauchement ne comptent qu une fois.
- [ ] Step 3 : consigner les résultats dans le LISEZMOI et dans l en tête des migrations.
- [ ] Step 4 : commit.

### Task 5: Catalogue semé

**Files:** Create `scripts/academy/catalogue/*.json` (12 modules vérifiés), `scripts/academy/generer-seed.mjs`, `supabase/migrations/20260921_academy_3_seed_catalogue.sql`.

- [ ] Step 1 : appliquer les corrections des vérificateurs aux JSON ; contrôle : 3 leçons, 10 questions couvrant 3 leçons, aucun tiret cadratin, sources présentes.
* Step 2 : générer le SQL (`insert ... where not exists`, versions en `brouillon`, `relu_par` vide), parcours et liaisons.
- [ ] Step 3 : appliquer sur DEV ; relancer : zéro doublon.
- [ ] Step 4 : commit.

### Task 6: Libs pures côté client

**Files:** `src/lib/academy/{statuts,revisions,battement,quiz,format,csv}.js` et leurs tests.

**Produces:**
* `statutAffectation({affectation, progression, validation, revisions}, aujourdhui) -> {statut:'non_commence'|'en_cours'|'a_revoir'|'valide', enRetard:boolean}`
* `revisionsDues(revisions, aujourdhui) -> [...]`, `prochaineRevision(revisions, aujourdhui)`, `itemsCloche({revisions, affectations}, aujourdhui, onOpen)`
* `creerBattement({intervalleMs:30000, inactiviteMs:120000}) -> {evenement(type, t), doitEnvoyer(t), etat()}` machine pure
* `formatScore(score,total) -> '4/5 · 80 %'`, `formatDuree(secondes)`, `jourParis(iso)`
* `lignesCsvPilotage(lignes) -> {colonnes, lignes}`

- [ ] Tests d abord (vitest), puis implémentation, puis commit `feat(academy): logique pure et tests`.

### Task 7: Service et rendu markdown

**Files:** `src/services/academy.js` (+ test), `src/components/ui/RenduMarkdown.jsx`, `src/lib/academy/attestation-pdf.js`.

**Produces:** `listerCatalogue()`, `lireModule(slug)`, `lireLecon(id)`, `monParcours()`, `ouvrirSession(leconId, jeton)`, `battement(sessionId)`, `sauverPosition(leconId, versionId, position)` (upsert vérifié), `terminerLecon(leconId, reponse)`, `ouvrirTentative(versionId, type, jeton)`, `soumettreTentative(tentativeId, reponses)`, `corrige(tentativeId)`, `mesRappels()`, `pilotage(depuis, jusqua)`, `fiche(profileId)`, `matrice()`, `affecter(...)`, `publierVersion(...)`, `nouvelleVersion(moduleId)`, `enregistrerVersion(versionId, patch)`, `enregistrerLecon(...)`, `enregistrerQuestion(...)`, `journalAdmin()`, `commenterCoaching(profileId, texte)`, `avecRetry(fn)`.

- [ ] Tests avec `vi.mock('../lib/supabase')` : table visée, `onConflict`, `.select('id')`, zéro ligne lève, retry réseau seulement.

### Task 8: Écrans collaborateur

**Files:** `src/components/academy/{Academy,MonParcours,Catalogue,ModuleDetail,LecteurLecon,Quiz,MesResultats,NoticeDonnees}.jsx`, `academy.css`, tests de présentation.

- [ ] Mon parcours : prochaine action, Reprendre, progression, échéances, révisions dues, dernières réussites.
- [ ] Catalogue : recherche `correspond()`, filtres thème, niveau, durée, statut, obligatoire ; cartes.
- [ ] Lecteur : sommaire latéral sticky, rendu markdown, sauvegarde automatique de position (debounce), reprise, mini question obligatoire, battements.
- [ ] Quiz : une question par écran, radios natifs, progression, correction après soumission, lien vers la leçon, retentative.
- [ ] Mes résultats : tableau, premier, dernier, meilleur, tentatives, notions à revoir, frise.
- [ ] Notice données suivies.

### Task 9: Pilotage et fiche

**Files:** `Pilotage.jsx`, `FicheCollaborateur.jsx`, `GraphiquesPilotage.jsx` (lazy chart.js).

- [ ] Filtres, indicateurs avec définitions et dénominateurs, tableau par personne, actions (fiche, affecter, échéance, relance avec aperçu), matrice compétences, signal « À examiner » factuel, export CSV, fuseau affiché, trois graphiques avec tableau lisible.

### Task 10: Administration

**Files:** `Administration.jsx`, `EditeurVersion.jsx`.

- [ ] Liste des modules et versions, brouillon / publié / archivé, éditeur markdown avec aperçu, questions (banque de 10), prévisualisation, publication avec relecteur et choix « imposer une nouvelle formation », archivage, parcours (ordre, obligations, délais), affectations, statistiques des questions, journal.

### Task 11: Intégration App

**Files:** `src/lib/navigation.js`, `src/App.jsx`.

- [ ] Domaine Formation, lazy `Academy`, rendu conditionnel, routes `#/formation/...`, `PAGE_TITLES`, cloche (RPC `academy_mes_rappels` en effet silencieux).

### Task 12: Contrôle visuel

**Files:** `tests/visuel/harnais.mjs`, `tests/visuel/controle.mjs`.

- [ ] Tables fictives `academy_*` (sans corrigés), RPC simulées, sept scénarios avec assertion.

### Task 13: Validation et livraison

- [ ] `npx eslint src/`, `npx vitest run`, `npx vite build`, `npm run test:visuel` (si Chromium disponible).
- [ ] CLAUDE.md et architecture : section Entasis Academy, commandes, migrations à appliquer, contenus à valider.
- [ ] Pull request vers main, sans merge.
