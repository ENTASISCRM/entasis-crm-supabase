# Série E — 20 innovations issues du benchmark (août 2026)

Second tour de benchmark, après les séries A→D. Objectif : gain de temps,
gain de chiffre, et un CRM qu'on ouvre avec plaisir. Sources en fin de
document.

## Le constat qui guide tout

Le frein numéro un des CRM n'est pas le manque de fonctions, c'est la
**saisie**. Un commercial passe 13 h/semaine en administratif dont 5 à 10 h
de saisie CRM ; 50 à 63 % des déploiements CRM échouent par non-adoption.
Quand la saisie tombe de 30 min à 90 s, le taux de renseignement passe à
85-95 %.

Notre CRM a le problème inverse d'un CRM pauvre : **il est très riche et
sous-utilisé**. Trois modules entiers (781 lignes) sont codés et
inaccessibles. La priorité n'est donc pas d'ajouter, c'est de **rendre
évident et sans effort ce qui existe**.

---

## Famille 1 — Faire entrer la donnée sans effort (5)

| # | Innovation | Référence | Ce que ça change | Effort |
|---|---|---|---|---|
| **E1** | **Note vocale → fiche remplie.** Dicter 30 s en sortant d'un RDV ; l'IA en tire le type d'échange, le résumé, la prochaine action datée et les champs KYC manquants. Écrit dans `client_interactions`. | Voice-to-CRM (Hey DAN, Myko), Zocks | Le geste le plus fuyant du métier devient tenable. C'est **le** levier d'adoption. | 3-4 j |
| **E2** | **Multi-sélection + édition groupée.** Cocher 20 dossiers → statut, mois ou attribution en une fois. Aujourd'hui : zéro case à cocher dans les tableaux. | HubSpot bulk edit, Airtable, Attio | Fin de la réattribution ligne à ligne en fin de mois. | 2 j |
| **E3** | **Détection de doublons à la création.** Le module Conformité sait déjà dédoublonner (email > téléphone > nom) — la création de client, non. | Tous | Un annuaire propre reste propre. Le service existe déjà. | 1 j |
| **E4** | **Score de complétude de fiche.** Pastille sur chaque fiche + « il manque 3 champs » ciblés sur le verrou de signature. | Data-quality score (ZoomInfo, HubSpot) | On découvre le champ manquant avant la signature, pas pendant. | 1-2 j |
| **E5** | **Collage intelligent.** Coller une signature de mail ou une carte de visite → champs pré-remplis à valider. | Folk quick-add, Attio | Créer un contact en 10 s au lieu de 2 min. | 2 j |

## Famille 2 — Aller chercher le chiffre (9)

| # | Innovation | Référence | Ce que ça change | Effort |
|---|---|---|---|---|
| **E6** | **Activer les 3 modules déjà codés et injoignables** : Playbooks Offres (8 offres, compte les cibles en direct sur le portefeuille et génère les missions), Certifications produit, Témoignages. | — | 781 lignes déjà écrites, zéro accès. Playbooks Offres est un générateur de campagnes prêt à tourner. | **0,5 j** |
| **E7** | **Séquences de relance.** 3 cadences : nouveau lead, devis sans réponse, post-RDV. J+2 / J+7 / J+21, chaque étape crée une tâche datée. | Pipedrive, Close, Salesloft | La relance ne dépend plus de la mémoire de chacun. | 4-5 j |
| **E8** | **Score de chaleur du dossier.** Âge × dernier contact × statut × montant → pastille + explication en clair. | Deal health scoring (Salesforce, Creatio) | On travaille les 10 bons dossiers, pas les 60. `AgeBadge` existe déjà. | 2 j |
| **E9** | **Alerte client dormant / à risque.** Sans contact depuis 90 j, ou encours en baisse. | Churn-risk & at-risk alerts | Retenir coûte moins cher que conquérir. | 2 j |
| **E10** | **Segmentation par palier de patrimoine + cadence de revue.** T1 trimestriel, T2 semestriel, T3 annuel, planifié automatiquement. | Practifi, Wealthbox, Satuit | Le modèle du métier : « croître l'encours sans grossir l'effectif ». `patrimoine_estime` existe. | 3 j |
| **E11** | **Notion de foyer** (client + conjoint + enfants) dans l'annuaire. `foyer_id` existe déjà côté multi-équipement. | « Households » — Wealthbox, Redtail | C'est LE modèle des CRM de gestion de patrimoine. Débloque l'épargne enfant, la succession, le patrimoine consolidé. | 3-4 j |
| **E12** | **Lien de prise de RDV** par conseiller, branché sur le Google Agenda déjà connecté. | HubSpot Meetings, Calendly | Fin des 6 allers-retours de mail pour caler un créneau. | 3 j |
| **E13** | **Modèles de mails/SMS à variables** ({prénom}, {produit}, {montant}). | HubSpot snippets & templates | Une relance passe de 5 min à 20 s. | 2 j |
| **E14** | **Suivi du parrainage.** La fiche PDF existe ; le suivi (qui a parrainé qui, conversion, relance) n'existe pas. | Referral tracking | Le canal le moins cher du cabinet, aujourd'hui non mesuré. | 2 j |

## Famille 3 — Ne rien laisser tomber (4)

| # | Innovation | Référence | Ce que ça change | Effort |
|---|---|---|---|---|
| **E15** | **Calendrier des obligations réglementaires.** Point annuel DDA/MIF II, actualisation KYC selon le niveau de risque LCB-FT, échéances de conservation (5 à 10 ans). Le CRM crée les tâches. | Obligations CGP 2026 : vigilance renforcée = revues plus fréquentes | Un contrôle AMF se prépare tout seul. Le module Conformité fournit la base. | 4 j |
| **E16** | **Moteur de règles simple (si → alors)**, paramétrable sans code. Ex. « dossier > 30 j en RDV calé → alerte manager ». | Wealthbox (workflows drag & drop), Redtail | Tu encodes tes règles une fois au lieu de les rappeler chaque semaine. | 5 j |
| **E17** | **Revue de pipeline automatique du lundi.** Ce qui a bougé, ce qui dort, ce qui manque. | Scheduled flows, pipeline hygiene | Le point d'équipe est préparé avant d'arriver. | 2 j |
| **E18** | **Journal d'audit lisible sur la fiche** — qui a changé quoi, quand. La table `activities` existe déjà. | Salesforce field history | Utile en interne, indispensable en contrôle. | 2 j |

## Famille 4 — Vitesse pure (2)

| # | Innovation | Référence | Ce que ça change | Effort |
|---|---|---|---|---|
| **E19** | **⌘K orientée actions + mode hors-ligne.** La palette exécute (« nouveau dossier pour Dupont ») ; service worker pour que l'app tienne dans le métro — le manifest PWA existe, le service worker manque. | Linear, Superhuman + mobile CRM (65 % des vendeurs mobiles atteignent leur quota vs 22 %) | Le CRM devient utilisable entre deux RDV. | 3 j |
| **E20** | **Vues sauvegardées nommées et partageables.** On mémorise déjà les filtres ; l'étape d'après : « Mes gros dossiers Q4 », partageable par lien. | Attio saved views, HubSpot segments | Chacun se fabrique son écran, sans développeur. | 2-3 j |

---

## Ordre recommandé

**Vague 1 — le rapport gain/effort imbattable (≈ 6 jours)**
E6 (0,5 j) · E3 (1 j) · E4 (1-2 j) · E2 (2 j) · E13 (2 j)

**Vague 2 — le levier d'adoption (≈ 9 jours)**
E1 (note vocale) · E8 (score de chaleur) · E17 (revue du lundi) · E5 (collage)

**Vague 3 — le modèle métier (≈ 13 jours)**
E11 (foyer) · E10 (paliers + cadence) · E15 (obligations) · E12 (lien RDV)

**Vague 4 — l'industrialisation (≈ 16 jours)**
E7 (séquences) · E16 (moteur de règles) · E9 · E14 · E18 · E19 · E20

Total ≈ 44-50 jours. Chaque vague est livrable seule.

## Ce qu'on ne fera pas (et pourquoi)

- **Enrichissement automatique de données** (Clay, Apollo) : le RGPD et le
  secret professionnel du CGP rendent l'achat de données tierces risqué.
- **Enregistrement automatique des RDV** (Gong, Zocks) : l'écoute des
  entretiens clients suppose leur consentement explicite et une politique de
  conservation. À trancher par la direction avant toute ligne de code.
- **Synchronisation de boîte mail** : déjà écarté en série D — lire les mails
  des conseillers n'est pas une décision technique.

## Sources

- [50+ CRM statistics that matter in 2026 — SuperOffice](https://www.superoffice.com/blog/50-crm-statistics/)
- [Voice-to-CRM: eliminating manual data entry — Myko AI](https://www.myko.ai/blog/voice-to-crm-how-ai-is-eliminating-manual-data-entry-for-field-sellers)
- [Why CRM adoption fails — Hey DAN](https://heydan.ai/articles/why-crm-adoption-fails-and-how-to-finally-fix-it)
- [Mobile CRM: how field teams actually use one in 2026 — Leadbeam](https://www.leadbeam.ai/blog/mobile-crm-field-sales-pipeline-visibility)
- [Wealthbox CRM review 2026](https://work-management.org/crm/wealthbox-crm-review/)
- [Redtail vs Wealthbox vs Salesforce for financial advisors](https://revisorgroup.com/redtail-vs-wealthbox-vs-salesforce-which-crm-is-best-for-financial-advisors/)
- [How wealth management firms use CRM to grow AUM without growing headcount — Satuit](https://satuit.com/how-wealth-management-firms-use-crm-to-grow-aum-without-growing-headcount/)
- [Client segmentation strategies for wealth management tiers — Wolf Financial](https://wolf.financial/blog/client-segmentation-strategies-wealth-management-tiers)
- [Client segmentation strategy — Zocks](https://www.zocks.io/blog/client-segmentation-strategy)
- [Best CRM software in 2026 — Attio](https://attio.com/f/best-crm-software)
- [Pipedrive vs Attio: which CRM is best for automation — Folk](https://www.folk.app/articles/pipedrive-vs-attio-automations)
- [CRM features in 2026: which ones actually matter — Tomba](https://tomba.io/blog/crm-features)
- [Lead scoring rules — Monday](https://monday.com/blog/crm-and-sales/lead-scoring-rules/)
- [AI CRM guide 2026 — Thriwin](https://www.thriwin.io/blogs/ai-crm-guide-2026-sales-customer-engagement)
- [Bulk edit records — HubSpot](https://knowledge.hubspot.com/records/bulk-edit-records)
- [Improving data quality in CRM — ZoomInfo](https://pipeline.zoominfo.com/marketing/improving-data-quality-in-crm)
- [Appointment scheduling — HubSpot](https://www.hubspot.com/products/sales/appointment-scheduling-system)
- [Command palette UX pattern — Mobbin](https://mobbin.com/glossary/command-palette)
- [Obligations réglementaires du CGP : guide complet 2026 — Majors](https://support.majors.finance/ressources/obligations-reglementaires-cgp.html)
- [LCB-FT en cabinet CGP : obligations 2026 — Prestimonia](https://www.prestimonia.com/blog/lcb-ft-cabinet-cgp-obligations-2026)
