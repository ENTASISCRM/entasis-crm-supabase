# Projet Clarté — Plan d'amélioration UX du CRM

Simplifier l'usage et bonifier le visuel **sans retirer une seule
fonctionnalité**. Douze propositions concrètes issues d'un audit complet du
code (38 946 lignes, 35 écrans) et des meilleures pratiques du marché
(Linear, Attio, Pipedrive, Folk).

## Constat

Le fond est riche et certaines fondations sont excellentes (palette ⌘K,
raccourcis clavier `/` et `n`, realtime Supabase, toasts stylés, design
system documenté dans `src/design-system.md`, drawer mobile). Ce qui freine
l'usage est la forme :

- jusqu'à **20 entrées de sidebar** pour un manager, 4 styles différents de
  sous-onglets selon l'écran
- **DealModal : 49 champs** d'un bloc (838 lignes), fiche client en un long
  défilement de ~9 sections (~2 150 lignes cumulées)
- **44 popups système** `confirm()`/`alert()` natifs
- **0 skeleton** — chargements en texte brut « Chargement… »
- **pas d'URL par écran** : back inopérant, F5 → dashboard, aucun lien
  partageable
- **2 274 styles inline**, composants dupliqués (`KpiCard`, `SortableTh`,
  `euro()` ×6), couleurs hors charte dans `ClientsView`
- 3 kanbans, 3 comportements — seul PipelineVEFA a le drag & drop

## Série A — Quick wins (~1 semaine au total)

| # | Proposition | Effort | Apport |
|---|---|---|---|
| A1 | Remplacer les 24 `confirm()` + 20 `alert()` par une modale de confirmation maison + toasts existants | ½–1 j | Fin de l'élément le plus « cheap » visible ; standing premium immédiat |
| A2 | Composant `Skeleton` partout (tables, cartes KPI, fiches) | 1 j | Vitesse perçue façon Linear sur les 35 écrans |
| A3 | Composant `SubTabs` unique (remplace `rh-tabs` + 3 variantes de pills inline), avec `role="tablist"` | 1 j | Même repère visuel partout ; prérequis de B1 |
| A4 | `font-variant-numeric: tabular-nums` sur tous les montants | ½ j | Colonnes d'euros alignées, effet terminal financier |
| A5 | Nettoyage charte : couleurs hors palette (`#F5F2EC`, `#999`… dans ClientsView), `btn-secondary` manquant, emoji des PAGE_TITLES → icônes SVG, hover JS → CSS `:hover` | ½–1 j | L'app respecte partout son propre design system |

## Série B — Chantiers structurants

| # | Proposition | Effort | Apport |
|---|---|---|---|
| B1 | Sidebar regroupée en **7 domaines** avec sous-onglets : Accueil · Activité (Pipeline, Dossiers, Prévisionnel, Agenda) · Clients (Annuaire, Multi-équipement, Conformité) · Leads · Immobilier · Marchés & Produits (Marchés, UCS) · Équipe & RH (Équipe, Pilotage, Recrutement, Smart RH, Rémunération) + Studio (Éditorial, Outils, LinkedIn) côté direction. Source de nav unique partagée avec CommandPalette (fin de la double maintenance signalée dans `CommandPalette.jsx:6`) | 2–3 j | Menu qui tient à l'écran, orientation immédiate, onboarding rapide. Suite logique des fusions déjà commencées (`ae998c4`, `3cb581f`) |
| B2 | **URL par écran** (hash sync de `activeTab` + sous-vue + client sélectionné, ex. `#/clients/<id>`) | 1–2 j | Back navigateur, F5 conservé, liens partageables entre conseillers |
| B3 | **Création de dossier en 2 temps** : quick-create 6 champs (client, produit, PP/PU, mois, statut) puis fiche en sections repliables ; champs « Signé » regroupés dans un panneau Signature ; garde « modifications non enregistrées » | 3–4 j | Le geste le plus fréquent passe de minutes à secondes ; pipeline mieux rempli, zéro perte de saisie |
| B4 | **Fiche client en onglets** (Synthèse / Patrimoine & contrats / Documents & espace client / Immobilier / Historique) + **aperçu en panneau latéral** depuis les listes (pattern Attio), chargement paresseux par onglet | 3–5 j | Consultation éclair pendant un appel sans perdre la liste ; −70 % de scroll |
| B5 | **Drag & drop sur le pipeline principal** et kanban unifié ventes/VEFA/recrutement (dnd-kit déjà installé, déjà utilisé dans PipelineVEFA) | 2–3 j | Changer un statut devient un geste (réflexe Pipedrive) ; les 3 kanbans se comportent pareil |
| B6 | **Pagination + recherche serveur sur l'annuaire clients** (aujourd'hui `select('*')` de tout clients × deals × dossiers) | 1–2 j | Fluidité durable à 5 000 clients — important avant l'unification Lead Room |
| B7 | **`src/components/ui/`** : Button, Card, KpiCard, Table, Modal (`role="dialog"` + focus trap + Échap), EmptyState, Badge, SubTabs, Skeleton — résorption progressive des styles inline et doublons | 3–4 j puis fil de l'eau | Cohérence automatique des futurs écrans, accessibilité réglée en un point |

## Bonus (après le socle)

- **Mode sombre** (2–3 j) : les 78 tokens CSS rendent l'opération mécanique ;
  direction artistique déjà maquettée (`design-previews/proposal-4-obsidienne`).
- **Palette ⌘K orientée actions** (1 j) : ajouter « Nouveau dossier »,
  « Créer une relance », etc. aux résultats.

## Feuille de route

1. **Semaine 1** — A1→A5 : le lifting (zéro changement fonctionnel).
2. **Semaine 2** — B1 + B2 : l'orientation (nav 7 domaines + deep links).
3. **Semaines 3-4** — B3 + B4 : le quotidien (saisie rapide + fiche client).
4. **Semaine 5** — B5 + B6 + B7 : le geste et le socle.

Chaque phase est livrable indépendamment ; aucune ne casse la précédente.

## Références marché

- Attio : fiche en slide-over au-dessus des listes, listes flexibles
- Pipedrive : kanban drag & drop comme centre de gravité
- Folk : création en 5 secondes, enrichissement progressif
- Linear : skeletons/optimistic UI, tout-clavier, densité maîtrisée

Document de présentation détaillé : artifact « Projet Clarté » (claude.ai).
