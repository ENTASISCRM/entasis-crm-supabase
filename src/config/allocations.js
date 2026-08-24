// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATIONS TYPES PAR PARTENAIRE
//
// Demande de Nans (24/08/2026) : un onglet par partenaire contenant les
// allocations validées par profil de gestion, pour qu'un nouvel arrivant
// dispose immédiatement d'une allocation cohérente au lieu de la construire
// de zéro, et pour homogénéiser ce qui est proposé en clientèle.
//
// PROVENANCE DES DONNÉES — chaque profil cite sa source, rien n'est inventé.
// Les allocations ci-dessous sont reprises telles quelles des propositions
// envoyées par Louis. Elles ne sont PAS une recommandation de l'outil : le
// CRM les affiche, il ne les conçoit pas.
//
// SOMME DES POIDS : l'écran contrôle que chaque profil tombe à 100 %. Ce
// contrôle n'est pas cosmétique — l'allocation « offensif diversifié » est
// partie chez une cliente à 105 %, erreur repérée par la cliente elle-même
// et non par nous (fil Katia Labat, 05/05/2026). Le total réel est affiché
// tel qu'il est, sans correction automatique.
//
// ISIN : ils servent à rattacher chaque ligne au référentiel de fonds de
// l'écran Marchés. Quand l'ISIN d'une allocation diffère de celui du
// référentiel, l'écran le signale plutôt que de choisir à notre place —
// ce sont des classes de parts différentes (couverture de change, frais).
// ═══════════════════════════════════════════════════════════════════════════

export const PARTENAIRES = [
  { cle: 'swisslife', nom: 'SwissLife' },
  { cle: 'abeille', nom: 'Abeille Assurances' },
]

export const ALLOCATIONS = [
  // ───────────────────────────────────────────────────────────────────────
  // SwissLife
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'sl-equilibre-dynamique',
    partenaire: 'swisslife',
    nom: 'Équilibré dynamique',
    horizon: '1 à 3 ans',
    cible: '7 à 9 % par an',
    source: 'Proposition Katia Labat, contrat n°1 (30 000 €) — version retravaillée du 29/04/2026',
    note: "Socle de prudence conservé malgré l'horizon court : DNCA Alpha Bonds, BDL Rempart et Eurose amortissent la volatilité.",
    lignes: [
      { fonds: 'First Eagle Amundi International AHE-C',   isin: 'LU0433182416', poids: 18 },
      { fonds: 'Carmignac Patrimoine A EUR Acc',            isin: 'FR0010135103', poids: 12 },
      { fonds: 'AP Meeschaert Global Convictions R',        isin: 'FR001400CSI0', poids: 10 },
      { fonds: 'CPR Actions USA Responsable P',             isin: 'FR0010501858', poids: 10 },
      { fonds: 'DNCA Invest Alpha Bonds B EUR',             isin: 'LU1694789535', poids: 10 },
      { fonds: 'Lazard Japon AC H EUR',                     isin: 'FR0014008M81', poids: 8 },
      { fonds: 'Groupama Global Disruption NC',             isin: 'LU1897556517', poids: 8 },
      { fonds: 'Echiquier Agenor SRI Mid Cap Europe A',     isin: 'FR0010321810', poids: 5 },
      { fonds: 'Fidelity Global Technology A-Dis-EUR',      isin: 'LU0099574567', poids: 5 },
      { fonds: 'BDL Rempart C',                             isin: 'FR0010174144', poids: 5 },
      { fonds: 'AXA Or et Matières Premières C',            isin: 'FR0010011171', poids: 5 },
      { fonds: 'Eurose C',                                  isin: 'FR0007051040', poids: 4 },
    ],
  },
  {
    id: 'sl-offensif-diversifie',
    partenaire: 'swisslife',
    nom: 'Offensif diversifié',
    horizon: '3 à 8 ans',
    cible: '10 à 12 % par an',
    source: 'Proposition Katia Labat, contrat n°2 (20 000 €) — version retravaillée du 29/04/2026',
    note: "Reproduit à l'identique la proposition envoyée. Le total dépasse 100 % : à rééquilibrer avant tout usage en clientèle.",
    lignes: [
      { fonds: 'AP Meeschaert Global Convictions R',        isin: 'FR001400CSI0', poids: 10 },
      { fonds: 'CPR Actions USA Responsable P',             isin: 'FR0010501858', poids: 10 },
      { fonds: 'First Eagle Amundi International AHE-C',    isin: 'LU0433182416', poids: 8 },
      { fonds: 'Groupama Global Disruption NC',             isin: 'LU1897556517', poids: 8 },
      { fonds: 'Carmignac Pf Asia Discovery A EUR Acc',     isin: 'LU0336083810', poids: 8 },
      { fonds: 'BGF World Healthscience A2 EUR',            isin: 'LU0171307068', poids: 7 },
      { fonds: 'Pictet Security P EUR',                     isin: 'LU0270904781', poids: 7 },
      { fonds: 'Echiquier Space B',                         isin: 'LU2466448532', poids: 7 },
      { fonds: 'BGF World Energy A2 EUR',                   isin: 'LU0171301533', poids: 7 },
      { fonds: 'Lazard Japon AC H EUR',                     isin: 'FR0014008M81', poids: 6 },
      { fonds: 'Lazard Actions Emergentes R',               isin: 'FR0010380675', poids: 6 },
      { fonds: 'AXA Or et Matières Premières C',            isin: 'FR0010011171', poids: 6 },
      { fonds: 'Pictet Water P EUR',                        isin: 'LU0104884860', poids: 5 },
      { fonds: 'Pictet Clean Energy Transition R EUR',      isin: 'LU0280435461', poids: 5 },
      { fonds: 'Fidelity Global Technology A-Dis-EUR',      isin: 'LU0099574567', poids: 5 },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────
  // Abeille Assurances
  //
  // Le profil prudent existe : il est dans la stratégie patrimoniale Blanc
  // (projet Cavalaire, 31/07/2026) — cinq fonds confiés à cinq sociétés de
  // gestion, hypothèse centrale 6,3 % nets par an, sécurisation progressive
  // du cœur du portefeuille. Le détail des lignes n'est que dans le PDF, il
  // n'a pas encore été repris ici.
  //
  // Volontairement laissé vide plutôt que reconstitué de mémoire : une
  // allocation engage le cabinet, elle se recopie, elle ne se devine pas.
  // ───────────────────────────────────────────────────────────────────────
  {
    id: 'ab-prudent',
    partenaire: 'abeille',
    nom: 'Prudent',
    horizon: 'Projet à échéance connue',
    cible: '6,3 % nets par an (hypothèse centrale), 8 % sur une bonne année',
    source: 'Stratégie patrimoniale Blanc · projet Cavalaire, 31/07/2026 — cinq fonds, cinq sociétés de gestion',
    note: "Les cinq lignes sont dans le PDF de la stratégie et restent à reprendre. Le cœur du portefeuille se sécurise par étapes à mesure que le projet se concrétise.",
    lignes: [],
  },
]

// Contrainte de commissionnement Abeille (Sébastien Pesce, Asselio,
// 30/07/2026) : les supports classés en catégorie 5 ne sont pas
// commissionnés. Une allocation qui en contient fait travailler le cabinet
// gratuitement — l'information est affichée, elle n'est pas encore
// vérifiable ligne à ligne faute du tableau des supports éligibles.
export const AVERTISSEMENTS_PARTENAIRE = {
  abeille: 'Les supports de catégorie 5 ne sont pas commissionnés par Abeille. Vérifier la catégorie de chaque support avant de proposer une allocation.',
}

export const totalPoids = (lignes) =>
  Math.round((lignes || []).reduce((s, l) => s + (Number(l.poids) || 0), 0) * 100) / 100
