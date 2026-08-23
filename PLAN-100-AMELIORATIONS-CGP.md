# Cent améliorations — benchmark métier CGP · courtier (août 2026)

Troisième tour de recherche, recentré sur le métier : conseil en gestion de
patrimoine et courtage en assurance. Vingt recherches ciblées (éditeurs CGP
français, plateformes, obligations AMF/ACPR/CNIL, presse professionnelle) et
un audit des données réelles du CRM en production. Sources en fin de document.

## Le diagnostic

Le CRM est excellent jusqu'à la signature, et vide après. C'est exactement
l'inverse de ce dont vit un cabinet de CGP-courtier : le revenu récurrent, la
conformité et la valeur de revente se jouent **après** la signature.

Constat tiré de la base de production, pas d'une impression :

| Ce qui vit | Ce qui est mort ou vide |
|---|---|
| 518 leads | 199 contrats dont **2** portent un numéro |
| 464 dossiers, 254 signés | **1** valorisation d'encours enregistrée |
| 379 clients | **0** foyer renseigné sur 379 (le champ existe) |
| 3,44 M€ de PU signé, 312 k€ de PP annualisée | **0** prochain rendez-vous planifié sur 379 |
| 11 conseillers signataires | **1** dossier de conformité, **0** document client |
| 6 simulateurs patrimoniaux | **0** ligne de journal d'audit |
| 29 500 €/mois de versements programmés | **22** comptes ouverts, **0** double authentification |

Trois modules entiers — Playbooks Offres, Certifications produit, Témoignages,
781 lignes — sont codés, testés, et injoignables depuis la navigation.

### La grille des huit outils du cabinet CGP en 2026

| Outil attendu | Chez Entasis |
|---|---|
| CRM patrimonial | Solide, le meilleur de la liste |
| Conformité automatisée | Module présent, 1 dossier en base |
| Assistants IA patrimoniaux | Éditorial seulement |
| Agrégateur financier | Absent |
| GED et coffre-fort numérique | Absent (0 document) |
| Signature électronique | Absente |
| Simulateurs | Six, complets |
| Marketing digital | Éditorial présent, LinkedIn hors navigation |

### Ce que ça vaut en euros

Un cabinet de CGP se vend en multiple de son **chiffre d'affaires récurrent** :
5 à 8× en 2026, contre 3 à 4× il y a dix ans. Le premier indicateur regardé est
le taux de récurrence — au-delà de 70-80 %, le multiple grimpe nettement. Or
aujourd'hui le CRM ne sait mesurer que les commissions d'entrée. La famille D
de ce document n'est donc pas une amélioration de confort : c'est la
construction de l'actif du cabinet.

## Comment lire les cent lignes

Chaque amélioration porte cinq critères :

- **Impact** — CA (chiffre direct) · Temps (heures rendues au conseiller) · Risque (exposition réglementaire) · Rétention (clients gardés) · Valeur (valeur du cabinet)
- **Effort** — en jours de développement
- **État** — *Socle prêt* (une brique existe déjà en base ou en code) · *Neuf* · *Décision* (arbitrage de direction avant tout code)
- **Référence** — d'où vient l'idée
- **Score** — poids de l'impact ÷ effort, majoré de 35 % quand le socle existe, minoré de 30 % quand une décision est requise

Les vagues découlent du score, avec une exception : les cinq obligations
réglementaires à échéance sont en vague 1 quel que soit leur score.


---

# Vague 1 — à faire maintenant

Le meilleur rapport gain sur effort, plus les obligations réglementaires à échéance.

**23 améliorations · 21.7 jours**


### A — Avant-vente et acquisition

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **A7** | Réactivation des leads perdus | Campagne sur les leads de plus de six mois classés sans suite. | CA | 1 j | Neuf | Pratique standard des CRM commerciaux | 4 |

### B — Le rendez-vous

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **B8** | Certifications produit | Module de 235 lignes déjà codé et injoignable : qui est habilité à vendre quoi. | Risque | 0.2 j | Socle prêt | Notre propre code | 33.75 |
| **B6** | Bibliothèque de témoignages | Module de 274 lignes déjà codé et injoignable : sortir la preuve sociale du même métier en deux clics. | CA | 0.2 j | Socle prêt | Notre propre code | 27 |
| **B7** | Playbooks Offres | Module de 272 lignes déjà codé et injoignable : huit offres qui comptent leurs cibles en direct et génèrent les missions. | CA | 0.3 j | Socle prêt | Notre propre code | 18 |

### C — Signature et back-office

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **C2** | Numéro de contrat obligatoire | 199 contrats en base, 2 portent un numéro. Sans numéro : aucun acte de gestion, aucun rapprochement de commission. | Valeur | 1 j | Socle prêt | Prérequis de toute la famille D | 5.4 |
| **C9** | Alerte contrat non émis au-delà de 45 jours | Un dossier bloqué chez la compagnie est un dossier qui peut se dénouer. | CA | 1 j | Neuf | Pipeline hygiene | 4 |

### D — Encours et rétrocessions

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **D6** | Valeur du cabinet en direct | Traduction du CA récurrent en fourchette de valorisation. | Valeur | 1 j | Neuf | 5 à 8× le CA récurrent ; au-delà de 70-80 % de récurrent, le multiple grimpe nettement | 4 |

### E — Actes de gestion et opportunités

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **E6** | Compte à rebours des 70 ans | Le module Opportunités le calcule déjà, mais sur les clients, pas sur les contrats. | CA | 1 j | Socle prêt | Articles 990 I et 757 B du CGI | 5.4 |
| **E9** | Relancer le multi-équipement | Le moteur de missions existe et contient une seule ligne. Le portefeuille compte 379 clients. | CA | 1 j | Socle prêt | Notre propre module V3 | 5.4 |
| **E2** | Radar contrats de plus de 8 ans | Fiscalité de rachat favorable : une occasion de rendez-vous qui se calcule toute seule. | CA | 1 j | Neuf | Fiscalité de l'assurance-vie | 4 |
| **E4** | Radar versement programmé jamais revalorisé | Un versement fixé il y a trois ans a perdu son sens. Le repérer, c'est de la collecte immédiate. | CA | 1 j | Neuf | Nos propres données : 199 contrats concernés | 4 |

### F — Conformité DDA · MIF II · LCB-FT

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **F8** | Échéancier ORIAS et RCP | Fenêtre de renouvellement du 1er janvier au 28 février, RCP à renouveler chaque année. | Risque | 1 j | Neuf | ORIAS 2026 | 5 |
| **F10** | Double authentification | 22 comptes ouverts, aucune double authentification active. | Risque | 1 j | Neuf | Depuis 2026 la CNIL traite l'absence de MFA comme un manquement à l'article 32 du RGPD | 5 |
| **F6** | Registre des réclamations | Obligation ACPR. Il n'existe pas aujourd'hui. | Risque | 1.5 j | Neuf | Checklist de contrôle ACPR | 3.33 |
| **F7** | Traçabilité de la formation DDA | Quinze heures par an et par intermédiaire, justificatifs à l'appui. | Risque | 1.5 j | Neuf | Près de 35 % des contrôles 2023 ont révélé un manquement DDA | 3.33 |
| **F4** | Questionnaire ESG | Obligatoire depuis le 2 août 2022 pour tout CIF. Absent de notre recueil. | Risque | 2 j | Neuf | Règlement délégué UE 2021/1253 | 2.5 |

### G — Relation client et rétention

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **G5** | Anniversaires et événements de vie | Le module Opportunités du jour les calcule déjà : huit générateurs actifs. | Rétention | 0.5 j | Socle prêt | Notre propre module | 8.1 |

### H — Pilotage du cabinet

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **H9** | Cockpit branché sur l'encours | Le Cockpit ratios existe et ne connaît que la collecte. Lui donner l'encours change sa portée. | Valeur | 1 j | Socle prêt | Notre propre module | 5.4 |

### I — Équipe et compétences

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **I9** | Grille de rémunération | Le module existe avec sa confidentialité stricte. Le rendre lisible par chaque conseiller pour sa propre ligne. | Valeur | 0.5 j | Socle prêt | Notre propre module | 10.8 |
| **I1** | Parcours d'intégration conseiller | La checklist auto-cochée existe : y accrocher les accès compagnies, l'ORIAS et la formation. | Temps | 1 j | Socle prêt | Notre propre module | 4.05 |
| **I6** | Passage de relais | Le module détecte déjà les clients orphelins ; il manque le protocole de reprise. | Rétention | 1 j | Socle prêt | Notre propre générateur | 4.05 |
| **I10** | Recrutement branché sur l'intégration | Le module recrutement s'arrête à l'embauche ; l'intégration démarre à zéro. | Temps | 1 j | Socle prêt | Notre propre module | 4.05 |

### J — Socle technique et expérience

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **J2** | Détection de doublons à la création | Le module Conformité sait dédoublonner sur email, téléphone puis nom ; la création de client ne vérifie rien. | Temps | 1 j | Socle prêt | Notre propre service | 4.05 |

---

# Vague 2 — le trimestre

Le cœur métier : l'encours, le foyer, la conformité documentaire, l'après-signature.

**37 améliorations · 73.0 jours**


### A — Avant-vente et acquisition

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **A2** | Parrainage suivi de bout en bout | La fiche PDF existe déjà ; ce qui manque c'est qui a parrainé qui, la conversion et la relance. | CA | 2 j | Socle prêt | La recommandation convertit à 25-40 %, contre 2-4 % en cold DM | 2.7 |
| **A4** | Coût d'acquisition par canal | deals.source existe : le rapprocher du budget dépensé par canal. | Valeur | 2 j | Socle prêt | Un CGP consacre 5 à 15 % de son CA à l'acquisition | 2.7 |
| **A10** | D'où vient le chiffre | Croisement canal × conseiller × mois, en euros signés. | Valeur | 2 j | Socle prêt | Attribution multi-canal | 2.7 |
| **A5** | Relance des leads non traités | Alerte au-delà de 48 h sans premier contact. Un lead froid ne se rattrape pas. | CA | 1.5 j | Neuf | Cadences Pipedrive · Close | 2.67 |
| **A3** | Score de chaleur du lead | 518 leads en base, aucun n'est priorisé. Score sur fraîcheur, source, budget, réactivité. | CA | 2 j | Neuf | Lead scoring — Monday, HubSpot | 2 |
| **A9** | Page publique de prise de RDV | Un lien par conseiller, branché sur le Google Agenda déjà connecté. | CA | 3 j | Socle prêt | HubSpot Meetings · Calendly | 1.8 |

### B — Le rendez-vous

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **B5** | Rattacher les simulateurs au client | Les six simulateurs tournent à vide : aucune simulation n'est enregistrée sur une fiche. | Temps | 2 j | Socle prêt | Notre propre module Outils CGP | 2.03 |
| **B9** | Argumentaires d'objection | Par produit et par objection courante, accessible pendant le rendez-vous. | CA | 2 j | Neuf | Battlecards — Gong, Highspot | 2 |
| **B10** | Mode présentation client | Les simulateurs en plein écran, sans la sidebar ni les données internes. | CA | 2 j | Neuf | Pratique des outils de bilan patrimonial | 2 |

### C — Signature et back-office

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **C6** | Délai signature vers contrat émis | Mesuré par compagnie. On saura enfin laquelle traîne. | Valeur | 1.5 j | Neuf | Pilotage back-office courtage | 2.67 |
| **C7** | Coffre-fort du dossier client | client_documents contient zéro ligne. Traçabilité native pour un contrôle ACPR. | Risque | 4 j | Socle prêt | GED et coffre-fort numérique — outil n°5 des 8 indispensables | 1.69 |

### D — Encours et rétrocessions

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **D9** | Suivi des versements programmés | 29 500 € par mois en base, soit 354 000 € par an. Les arrêts et impayés ne sont pas détectés. | CA | 2 j | Socle prêt | Nos propres données contrats | 2.7 |
| **D5** | Compteur de CA récurrent | Part du récurrent contre le one-shot, mois par mois. | Valeur | 2 j | Neuf | Premier indicateur examiné à la cession | 2 |
| **D7** | Encours par conseiller, compagnie et famille | Trois axes de lecture sur le même chiffre. | Valeur | 2 j | Neuf | Reporting standard des agrégateurs | 2 |
| **D8** | Alerte baisse d'encours | Plus de 10 % sur un trimestre, hors effet marché : quelque chose se passe. | Rétention | 1.5 j | Neuf | Churn scoring appliqué à l'encours | 2 |
| **D1** | Encours par contrat | La table contrat_valorisations existe et contient une seule ligne. C'est la brique de tout le reste. | Valeur | 3 j | Socle prêt | O2S suit 70 Md€ d'encours pour la profession | 1.8 |

### E — Actes de gestion et opportunités

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **E7** | Radar sans arbitrage depuis 3 ans | Un contrat qu'on ne touche jamais est un contrat qu'on ne défend pas. | CA | 1 j | Neuf | Suivi de portefeuille | 4 |
| **E1** | Actes de gestion tracés | Versement libre, arbitrage, rachat partiel, avenant. La table contrat_events existe déjà. | Risque | 2 j | Socle prêt | Suivi de vie du contrat | 3.38 |
| **E8** | Plafond PER disponible par client | Le simulateur le calcule ; le portefeuille ne le fait pas. Sprint de septembre à décembre. | CA | 2 j | Socle prêt | Collecte nette PER : 2,1 Md€ au T1 2026 | 2.7 |
| **E3** | Radar cent pour cent fonds euro | Les fonds euro ont recollecté (4,3 Md€ au T1 2026) : le sujet d'arbitrage est vivant dans les deux sens. | CA | 1.5 j | Neuf | France Assureurs T1 2026 | 2.67 |
| **E5** | Clause bénéficiaire à réviser | Tous les 3 à 5 ans, ou à tout changement de situation familiale. Sujet de responsabilité autant que de rendez-vous. | Risque | 2 j | Neuf | Pratique de place — révision tous les 3-5 ans | 2.5 |
| **E10** | Transferts PER entrants | Détecter les clients qui ont un PER ailleurs et cadrer le transfert. | CA | 2 j | Neuf | Marché du transfert PER en croissance | 2 |

### F — Conformité DDA · MIF II · LCB-FT

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **F9** | Journal d'audit lisible | La table activities existe et contient zéro ligne. Qui a changé quoi, quand. | Risque | 2 j | Socle prêt | Traçabilité exigée en contrôle | 3.38 |
| **F1** | Point annuel planifié par palier | Le champ prochain_rdv existe sur les 379 clients et n'est renseigné pour aucun. | Risque | 3 j | Socle prêt | MIF II et DDA imposent le suivi ; la LCB-FT en module la fréquence | 2.25 |

### G — Relation client et rétention

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **G4** | Alerte client sans contact | Quatre-vingt-dix jours de silence sur un client à encours, c'est un signal. | Rétention | 1.5 j | Neuf | Un client qui part n'envoie jamais de signal clair | 2 |

### H — Pilotage du cabinet

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **H8** | Taux d'équipement par famille | La vue client_equipment existe : 25 équipements déclarés pour 379 clients. | CA | 1.5 j | Socle prêt | Notre propre vue | 3.6 |
| **H4** | Concentration du portefeuille | Onze conseillers ont signé ; la dépendance à deux ou trois d'entre eux est une décote à la cession. | Valeur | 1.5 j | Neuf | Triactis — la dépendance dirigeant décote la valorisation | 2.67 |
| **H1** | Tableau de bord valeur du cabinet | Encours, taux de récurrence, dépendance aux conseillers, concentration. | Valeur | 2 j | Neuf | Indicateurs examinés à la cession | 2 |
| **H3** | Rentabilité par produit et compagnie | Le PER et l'assurance-vie pèsent chacun 90 contrats : lequel rapporte vraiment ? | Valeur | 2 j | Neuf | Nos propres données | 2 |
| **H7** | Retour sur investissement par canal | Coût d'acquisition contre CA généré, canal par canal. | Valeur | 2 j | Neuf | 5 à 15 % du CA consacré à l'acquisition | 2 |
| **H5** | Prévisionnel de collecte glissant | Douze mois devant, pas seulement le mois en cours. | Valeur | 3 j | Socle prêt | Notre module Prévisionnel, étendu | 1.8 |

### I — Équipe et compétences

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **I5** | Répartition de charge | Dossiers en cours par conseiller, visible d'un écran. | Valeur | 1 j | Neuf | Pilotage d'équipe | 4 |
| **I2** | Objectifs individuels suivis | La table weekly_objectives existe et n'est pas exploitée dans le pilotage. | Valeur | 1.5 j | Socle prêt | Notre propre table | 3.6 |
| **I8** | Suivi des mandataires | Les tables mandataire_conformite et mandataire_urssaf existent déjà. | Risque | 2 j | Socle prêt | Nos propres tables | 3.38 |
| **I3** | Plan de formation DDA par conseiller | Quinze heures par an, planifiées et non subies en décembre. | Risque | 1.5 j | Neuf | Condition du renouvellement ORIAS | 3.33 |

### J — Socle technique et expérience

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **J3** | Score de complétude de fiche | Le CRM nomme les trois champs qui bloqueront la signature, avant le jour J. | Temps | 1.5 j | Socle prêt | Data quality score | 2.7 |
| **J6** | Palette d'actions | ⌘K exécute au lieu de seulement naviguer. | Temps | 2 j | Socle prêt | Linear · Superhuman | 2.03 |

---

# Vague 3 — le fond de roadmap

Utile, mais aucune de ces lignes ne bloque les autres.

**40 améliorations · 122.5 jours**


### A — Avant-vente et acquisition

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **A6** | Pré-qualification avant le premier RDV | Formulaire envoyé au prospect : situation, objectifs, budget. Le RDV démarre plus haut. | Temps | 2 j | Neuf | Parcours d'entrée en relation digitalisé | 1.5 |
| **A1** | Réseau de prescripteurs | Fiche par expert-comptable, notaire ou avocat : apports, CA généré, dernière relance. | CA | 3 j | Neuf | Patrineo — 40 à 60 % du CA des meilleurs cabinets vient des prescripteurs | 1.33 |
| **A8** | Suivi des webinaires et événements | Inscrits, présents, RDV pris, signatures. Aujourd'hui rien n'est mesuré. | CA | 3 j | Neuf | Canal cité parmi les plus efficaces pour un CGP | 1.33 |

### B — Le rendez-vous

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **B3** | Compte rendu de RDV horodaté | Généré, signé, archivé. Pièce de conformité et outil de fidélisation en une fois. | Risque | 3 j | Neuf | Un document remis en fin de RDV est un outil de fidélisation | 1.67 |
| **B1** | Brief de rendez-vous généré | Situation patrimoniale, points de vigilance, opportunités et questions à poser, produits en un écran. | Temps | 3 j | Neuf | 30 à 45 min de préparation ramenées à 5 min — retours cabinets 2026 | 1 |
| **B4** | Découverte patrimoniale unifiée | Un seul questionnaire qui alimente KYC, MIF II, DDA et ESG. Aujourd'hui : quatre saisies. | Risque | 5 j | Neuf | Wealthcome · Harvest O2S | 1 |
| **B2** | Note vocale après le rendez-vous | Trente secondes dictées : type d'échange, résumé, prochaine action datée, champs KYC manquants. | Temps | 4 j | Neuf | Voice-to-CRM : 90 s au lieu de 30 min, renseignement à 85-95 % | 0.75 |

### C — Signature et back-office

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **C4** | Checklist de pièces par produit et compagnie | Abeille et SwissLife couvrent 94 % du portefeuille : deux checklists suffisent. | Temps | 2 j | Neuf | Collecte documentaire CGP | 1.5 |
| **C5** | Relance automatique des pièces manquantes | Le client reçoit la liste de ce qui manque, sans que le conseiller la retape. | Temps | 2 j | Neuf | Un portail de collecte fait passer un dossier de 3-4 h à moins de 45 min | 1.5 |
| **C10** | Bulletin de souscription pré-rempli | Les données de la fiche client injectées dans le bulletin de la compagnie. | Temps | 2 j | Neuf | UAF Life — souscription 100 % digitalisée | 1.5 |
| **C1** | Pipeline après-signature | Envoyé compagnie, pièces manquantes, en gestion, contrat émis. Aujourd'hui « Signé » est un cul-de-sac. | Temps | 3 j | Neuf | Back-office O2S · Modulr | 1 |
| **C8** | Import des extranets compagnies | Un CSV mensuel par compagnie suffit : deux compagnies couvrent 94 % du portefeuille, pas besoin d'API. | Temps | 3 j | Neuf | Extranets Abeille et SwissLife | 1 |
| **C3** | Signature électronique | Parcours de souscription signé en ligne, hébergement France. | Temps | 4 j | Décision | Yousign — choix le plus fréquent des assureurs français | 0.52 |

### D — Encours et rétrocessions

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **D3** | Taux de rétrocession par contrat | Le taux par produit et par compagnie donne le CA récurrent prévisionnel, contrat par contrat. | CA | 3 j | Neuf | Rétrocessions sur encours — cœur du revenu courtier | 1.33 |
| **D10** | Prévisionnel de commissions à 12 mois | Entrée plus récurrent, par mois, avec les encaissements attendus. | Valeur | 3 j | Neuf | Pilotage de trésorerie courtier | 1.33 |
| **D2** | Import trimestriel des relevés d'encours | Un fichier par compagnie, quatre fois par an. Trente minutes pour tout le portefeuille. | Temps | 3 j | Neuf | Agrégateurs CGP 2026 | 1 |
| **D4** | Rapprochement des bordereaux | Perçu contre attendu. Les erreurs de taux, oublis et avenants non intégrés sont le sujet n°1 du back-office courtage. | CA | 4 j | Neuf | Modulr · Maia | 1 |

### F — Conformité DDA · MIF II · LCB-FT

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **F3** | DER et lettre de mission | Générés depuis la fiche, versionnés, signés. | Risque | 3 j | Neuf | L'AMF sanctionne l'absence de clarté du DER sur le caractère non indépendant | 1.67 |
| **F5** | Cotation du risque LCB-FT | Faible, standard ou élevé par client : la cotation commande la fréquence de revue et le niveau de vigilance. | Risque | 3 j | Neuf | Vigilance renforcée = revues plus fréquentes | 1.67 |
| **F2** | Rapport d'adéquation généré | Document horodaté depuis la fiche : la pièce numéro un demandée en contrôle. | Risque | 4 j | Neuf | Six éléments obligatoires MIF II | 1.25 |

### G — Relation client et rétention

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **G3** | Cadence de contact par palier d'encours | Mensuel au-dessus de 500 000 €, trimestriel en dessous. Planifié, pas improvisé. | Rétention | 2 j | Neuf | Pratique de place | 1.5 |
| **G6** | Enquête de satisfaction | Après signature et après revue annuelle. Deux questions suffisent. | Rétention | 2 j | Neuf | NPS appliqué au conseil patrimonial | 1.5 |
| **G8** | Historique visible côté client | Ce qui a été dit, décidé, signé. La transparence est un argument de rétention. | Rétention | 2 j | Neuf | Espaces clients CGP | 1.5 |
| **G9** | Modèles de mails et SMS | Prénom, produit, montant insérés. Une relance passe de cinq minutes à vingt secondes. | Temps | 2 j | Neuf | HubSpot snippets | 1.5 |
| **G10** | Détection de départ | Baisse d'encours, silence prolongé et rachat partiel dans la même fenêtre. | Rétention | 2 j | Neuf | Churn scoring | 1.5 |
| **G7** | Note de marché personnalisée | Le module éditorial produit déjà du contenu : le router par profil de client. | Rétention | 3 j | Socle prêt | Notre module Éditorial | 1.35 |
| **G1** | Espace client | La table client_accounts contient une ligne. Consultation de l'encours et dépôt de pièces. | Rétention | 5 j | Socle prêt | Transparence et fidélisation — Wealthcome | 0.81 |
| **G2** | Reporting trimestriel automatique | Court et structuré, quatre fois par an. | Rétention | 4 j | Neuf | Mieux qu'un rapport annuel suivi de onze mois de silence | 0.75 |

### H — Pilotage du cabinet

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **H6** | Revue de pipeline du lundi | Ce qui a bougé, ce qui dort, ce qui manque — envoyé avant d'arriver. | Temps | 2 j | Neuf | Scheduled flows | 1.5 |
| **H10** | Export comptable | Un format que l'expert-comptable ingère sans retraitement. | Temps | 2 j | Neuf | Rapprochement des flux financiers | 1.5 |
| **H2** | Rentabilité par client | CA généré contre temps passé. Certains clients coûtent plus qu'ils ne rapportent. | Valeur | 3 j | Neuf | Segmentation par valeur | 1.33 |

### I — Équipe et compétences

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **I4** | Procédures internes documentées | Comment souscrire chez Abeille, chez SwissLife. Aujourd'hui c'est dans la tête des anciens. | Temps | 2 j | Neuf | Réduction de la dépendance aux personnes | 1.5 |
| **I7** | File de tâches déléguables | Le conseiller pousse le back-office à l'assistant au lieu de le faire à 21 h. | Temps | 3 j | Neuf | SNOW AI — back-office CGP | 1 |

### J — Socle technique et expérience

| # | Amélioration | Ce que c'est | Impact | Effort | État | Référence | Score |
|---|---|---|---|---|---|---|---|
| **J5** | Vues sauvegardées partageables | Les filtres sont déjà mémorisés ; il reste à les nommer et à les envoyer par lien. | Temps | 2.5 j | Socle prêt | Attio saved views | 1.62 |
| **J1** | Multi-sélection et édition groupée | Aucune case à cocher dans les tableaux aujourd'hui. | Temps | 2 j | Neuf | HubSpot · Airtable · Attio | 1.5 |
| **J4** | Collage intelligent | Coller une signature de mail ou une carte de visite : les champs se pré-remplissent. | Temps | 2 j | Neuf | Folk · Attio | 1.5 |
| **J7** | Mode hors-ligne | Le manifeste d'application existe déjà ; il manque le service worker. | Temps | 3 j | Socle prêt | 65 % des vendeurs équipés en mobile atteignent leur objectif, contre 22 % | 1.35 |
| **J8** | La notion de foyer | Le champ foyer_id existe sur les 379 clients et n'est renseigné pour aucun. C'est le socle du métier. | CA | 4 j | Socle prêt | Households — Wealthbox, Redtail | 1.35 |
| **J10** | Moteur de règles sans code | Si un dossier dort plus de trente jours, alerter. Paramétrable sans développeur. | Temps | 5 j | Neuf | Wealthbox workflows · Redtail | 0.6 |
| **J9** | Agrégation de comptes | Vision consolidée du patrimoine du client, y compris hors cabinet. | Temps | 8 j | Décision | Powens, agréé ACPR — 3 à 5 h de recopie ramenées à 20 min | 0.26 |

---

## Récapitulatif

| Vague | Améliorations | Jours |
|---|---|---|
| 1 | 23 | 21.7 |
| 2 | 37 | 73.0 |
| 3 | 40 | 122.5 |
| **Total** | **100** | **217.2** |

| Impact primaire | Améliorations | Jours |
|---|---|---|
| Temps | 27 | 70.0 |
| CA | 25 | 46.0 |
| Valeur | 19 | 35.0 |
| Risque | 18 | 41.7 |
| Rétention | 11 | 24.5 |

| État | Améliorations | Jours |
|---|---|---|
| Socle prêt | 36 | 67.7 |
| Neuf | 62 | 137.5 |
| Décision | 2 | 12 |

Trente-six des cent améliorations s'appuient sur une brique qui existe déjà en
base ou en code. Elles représentent 36 % de la liste et une part bien plus
faible de l'effort.

## Les deux arbitrages qui ne sont pas techniques

- **C3 — signature électronique.** Yousign est le choix le plus fréquent des
  assureurs français, hébergement France, tarif progressif dès mille signatures
  par mois. C'est un budget et un contrat, pas une difficulté technique.
- **J9 — agrégation de comptes.** Powens est agréé ACPR au titre de la DSP2.
  Le gain est documenté : trois à cinq heures de recopie de relevés ramenées à
  vingt minutes. Le sujet est le coût par client agrégé et le consentement.

Restent écartées, comme en série D et E : l'achat de données tierces
(enrichissement automatique) et l'enregistrement automatique des entretiens.

## Sources

- [Obligations réglementaires du CGP : guide complet 2026 — Majors](https://support.majors.finance/ressources/obligations-reglementaires-cgp.html)
- [Obligations CGP 2026 : le guide complet des échéances — Glyphe](https://glyphe.eu/blog/obligations-cgp-2026)
- [Checklist contrôle ACPR/AMF 2026 : les 20 points à vérifier — Glyphe](https://glyphe.eu/blog/checklist-controle-acpr-amf-2026)
- [LCB-FT en cabinet CGP : obligations 2026 — Prestimonia](https://www.prestimonia.com/blog/lcb-ft-cabinet-cgp-obligations-2026)
- [Rapport d'adéquation CGP : 6 éléments obligatoires MIFID II — Glyphe](https://glyphe.eu/blog/rapport-adequation-cgp)
- [Questionnaire ESG CGP MiFID II : guide complet 2026 — Glyphe](https://glyphe.eu/blog/questionnaire-esg-cgp-mifid-ii)
- [ORIAS 2026 : inscription, renouvellement et sanctions — Prestimonia](https://www.prestimonia.com/blog/orias-inscription-renouvellement-sanctions-guide-cgp)
- [La CNIL généralise l'authentification multifacteur dès 2026 — Datanaos](https://www.datanaos.com/blog/uncategorized/securite-numerique-la-cnil-impose-la-generalisation-de-lauthentification-multifacteur-des-2026/)
- [DORA 2026 : cybersécurité et gouvernance — Haas Avocats](https://www.haas-avocats.com/cybersecurite/dora-2026-cybersecurite-et-gouvernance-bancaire/)
- [Valorisation cabinet CGP : multiple de CA récurrent — TEO Advisory](https://teo-advisory.com/valorisation-cabinet-gestion-patrimoine/)
- [Céder son cabinet de gestion de patrimoine en 2026 — Scale2Sell](https://www.scale2sell.company/content/ceder-son-cabinet-de-gestion-de-patrimoine-en-2026-tendances-valorisation-et-leviers-de-succes)
- [Quand la valeur dépend de deux ou trois personnes — Triactis](https://www.triactis.com/blog/cabinets-de-gestion-de-patrimoine-quand-la-valeur-depend-de-deux-ou-trois-personnes/)
- [Commission de courtage : comprendre, suivre et optimiser — Maia](https://www.maia-logiciels.fr/courtage-pilotage/commission-de-courtage-comprendre-suivre-et-optimiser-sa-remuneration-de-courtier/)
- [Bordereaux compagnies — guide Modulr](https://doc.modulr-courtage.fr/guide/bordereaux-compagnies)
- [Comparatif agrégateurs CGP 2026 : Harvest, Wealthcome, Majors](https://support.majors.finance/ressources/agregateurs-CGP-2026.html)
- [Top 7 logiciels CGP 2026 : comparatif prix et avis — Majors](https://support.majors.finance/ressources/top-7-logiciels-CGP-2026.html)
- [Les outils indispensables du CGP en 2026 — Majors](https://support.majors.finance/ressources/outils-indispensables-cgp.html)
- [Meilleur outil IA pour CGP 2026 : comparatif — Majors](https://support.majors.finance/ressources/meilleur-outil-ia-cgp-2026-comparatif.html)
- [Back-office pour CGP : automatiser son cabinet — SNOW AI](https://snowai.fr/)
- [Collecte de documents client CGP : méthodes et outils — Glyphe](https://glyphe.eu/blog/collecte-documents-client-cgp)
- [Dématérialisation du dossier client CGP — Glyphe](https://glyphe.eu/blog/dematerialisation-dossier-client-cgp)
- [Comment les espaces clients renforcent la confiance — Wealthcome](https://www.wealthcome.fr/blog/comment-les-espaces-clients-en-ligne-renforcent-la-transparence-et-la-confiance)
- [Le client patrimonial devient plus exigeant et plus volatile — Triactis](https://www.triactis.com/blog/le-client-patrimonial-devient-plus-exigeant-plus-informe-plus-volatile/)
- [Trouver des clients CGP : stratégies et leviers — Patrineo](https://www.patrineo.fr/guide-cgp/trouver-clients-cgp/)
- [Réseau de prescripteurs CGP : guide complet — Patrineo](https://www.patrineo.fr/guide-cgp/prescription-cgp/)
- [Assurance-vie : collecte record au premier semestre 2026 — Meilleurtaux](https://placement.meilleurtaux.com/assurance-vie/actualites/2026-juillet/assurance-vie-collecte-record-au-1er-semestre-2026.html)
- [Derrière la collecte record du T1 2026 — Weelim](https://www.weelim.fr/actualites-placement/assurance-vie/derriere-la-collecte-record-de-ce-premier-trimestre-2026-se-cache-une-recomposition-silencieuse/)
- [LMNP 2026 : les pièges de la réforme Le Meur — Hagnéré Patrimoine](https://www.hagnere-patrimoine.fr/guides-patrimoine/investissement-immobilier/lmnp-2026)
- [990 I versus 757 B du CGI — Profession CGP](https://www.professioncgp.com/article/juridique-et-fiscal/juridique-et-fiscal-transmission/lassurance-vie-et-le-prelevement-de-larticle-990-i-du-cgi.html)
- [Clause bénéficiaire : guide de rédaction — GPS Patrimoine](https://www.gps-patrimoine.fr/clause-beneficiaire-assurance-vie-rediger)
- [Prévoyance TNS 2026 : loi Madelin, IJ et conformité URSSAF — Esancia](https://www.esancia.fr/prevoyance-tns-madelin-2026/)
- [Signature électronique du contrat d'assurance-vie — Yousign](https://yousign.com/life-insurance)
- [Agrégation bancaire multi-sources — Powens](https://www.powens.com/fr/blog/agregation-bancaire-multi-sources/)
- [UAF Life Patrimoine : souscription 100 % digitalisée — Crédit Agricole Assurances](https://www.ca-assurances.com/publication/uaf-life-patrimoine-confirme-son-engagement-dans-le-digital-en-offrant-une-innovation-majeure-pour-les-conseillers-en-gestion-de-patrimoine-la-souscription-100-digitalisee-pour-les-personnes-mo/)
- [Harvest x Manymore : les enjeux — Harvest](https://www.harvest.fr/harvest-x-manymore-quels-enjeux-derriere-cette-nouvelle-operation-de-croissance-externe/)
- [50+ CRM statistics that matter in 2026 — SuperOffice](https://www.superoffice.com/blog/50-crm-statistics/)
- [Voice-to-CRM : éliminer la saisie manuelle — Myko AI](https://www.myko.ai/blog/voice-to-crm-how-ai-is-eliminating-manual-data-entry-for-field-sellers)
- [Mobile CRM : comment les équipes terrain l'utilisent — Leadbeam](https://www.leadbeam.ai/blog/mobile-crm-field-sales-pipeline-visibility)
- [Bulk edit records — HubSpot](https://knowledge.hubspot.com/records/bulk-edit-records)
- [Best CRM software in 2026 — Attio](https://attio.com/f/best-crm-software)
