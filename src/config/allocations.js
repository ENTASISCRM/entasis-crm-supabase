// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATIONS TYPES PAR PARTENAIRE
//
// Demande de Nans (24/08) : qu'un conseiller sorte une allocation validée
// correspondant au profil de son client, sans la reconstruire.
// Précision de Louis (24/08) : une molette prudent / équilibré / dynamique,
// et « pour faire un modéré ou un équilibré, tu mets un peu de dynamique et
// un peu de prudent ». Les profils intermédiaires ne sont donc pas des
// allocations à part : ce sont des MÉLANGES des deux extrêmes.
//
// D'où la structure : chaque partenaire a DEUX pôles, prudent et dynamique.
// La molette interpole entre les deux. À 0 % on est sur le pôle prudent, à
// 100 % sur le dynamique, au milieu sur un équilibré. Les allocations ne
// sont pas les mêmes d'un partenaire à l'autre — chacun a ses propres pôles,
// rien n'est partagé entre SwissLife et Abeille.
//
// RIEN N'EST INVENTÉ. Chaque pôle cite le mail dont il sort. Un pôle sans
// source reste vide : une allocation engage le cabinet, elle se recopie.
// ═══════════════════════════════════════════════════════════════════════════

export const PARTENAIRES = [
  {
    cle: 'swisslife',
    nom: 'SwissLife',
    // Les deux références disponibles côté SwissLife ne sont pas un vrai
    // « prudent » et un vrai « dynamique » : ce sont les deux allocations
    // construites pour Katia Labat, l'une à horizon court avec un socle
    // amortisseur, l'autre à horizon long et offensive. Elles servent de
    // pôles bas et haut en attendant un prudent en bonne et due forme.
    poleBas: 'sl-equilibre-dynamique',
    poleHaut: 'sl-offensif-diversifie',
    reserve: "Le pôle bas n'est pas un profil prudent : c'est l'allocation « équilibré dynamique » (horizon 1-3 ans). Un vrai prudent SwissLife reste à définir.",
  },
  {
    cle: 'abeille',
    nom: 'Abeille Assurances',
    poleBas: 'ab-prudent',
    poleHaut: 'ab-dynamique',
    reserve: null,
  },
]

export const ALLOCATIONS = [
  // ── SwissLife ─────────────────────────────────────────────────────────
  {
    id: 'sl-equilibre-dynamique',
    partenaire: 'swisslife',
    nom: 'Équilibré dynamique',
    horizon: '1 à 3 ans',
    cible: '7 à 9 % par an',
    source: 'Proposition Katia Labat, contrat n°1 (30 000 €) — version du 29/04/2026',
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
    source: 'Proposition Katia Labat, contrat n°2 (20 000 €) — version du 29/04/2026',
    note: "Reproduit à l'identique la proposition envoyée : le total fait 105 %, pas 100 %.",
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

  // ── Abeille Assurances ────────────────────────────────────────────────
  // Les deux pôles viennent de PDF transmis par Louis le 24/08. Les ISIN
  // absents du prudent ont été vérifiés un par un chez les émetteurs — aucun
  // n'est reconstitué de mémoire.
  {
    id: 'ab-prudent',
    partenaire: 'abeille',
    nom: 'Prudent',
    horizon: '24 mois (projet à échéance connue)',
    cible: '6,3 % nets par an (hypothèse centrale)',
    source: 'Stratégie patrimoniale Blanc · projet Cavalaire, 31/07/2026 — contrat Abeille en gestion libre, cinq sociétés de gestion, aucun doublon de stratégie',
    note: "Note de risque moyenne 2,55 sur 7. Le PDF ne porte pas les ISIN : chacun a été vérifié auprès de l'émetteur (classes A1, A, B, A, A).",
    lignes: [
      // Cœur Cavalaire (85 %), sécurisé par étapes à mesure que l'achat se concrétise
      { fonds: 'Eleva Absolute Return Europe A1',    isin: 'LU1331971769', poids: 25 },
      { fonds: 'Moneta Long Short A',                isin: 'FR0010400762', poids: 20 },
      { fonds: 'Helium Selection B',                 isin: 'LU1112771503', poids: 20 },
      { fonds: 'Varenne Valeur A',                   isin: 'LU2358392376', poids: 20 },
      // Poche performance (15 %), seule à rester investie après l'acquisition
      { fonds: 'Carmignac Investissement Latitude A', isin: 'FR0010147603', poids: 15 },
    ],
  },
  {
    id: 'ab-dynamique',
    partenaire: 'abeille',
    nom: 'Dynamique',
    horizon: 'Long terme',
    cible: '7 à 9 % par an (volatilité attendue 12 à 14 %)',
    source: 'Proposition Sophie Salem, juin 2026 — contrat Abeille Épargne Active, versements programmés, 100 % unités de compte',
    note: 'Architecture cœur-satellite : cœur patrimonial 40 %, technologie 29 %, électrification 15 %, diversification 11 %, or tactique 5 %.',
    lignes: [
      { fonds: 'Robeco BP US Large Cap Equities D-EUR',             isin: 'LU0474363974', poids: 22 },
      { fonds: 'Comgest Monde C',                                    isin: 'FR0000284689', poids: 18 },
      { fonds: 'Fidelity Global Technology A-Acc-EUR',               isin: 'LU1213836080', poids: 12 },
      { fonds: 'CPR Invest Global Disruptive Opportunities A EUR',   isin: 'FR0010836163', poids: 9 },
      { fonds: 'DWS Invest Artificial Intelligence LC',              isin: 'LU1863263346', poids: 8 },
      { fonds: 'Pictet Clean Energy Transition P EUR',               isin: 'LU0280435388', poids: 8 },
      { fonds: 'Ofi Invest Energy Strategic Metals R',               isin: 'FR0014008NN3', poids: 7 },
      { fonds: 'DNCA Actions Euro PME R',                            isin: 'FR0011891506', poids: 6 },
      { fonds: 'abrdn Japanese Sustainable Equity S Acc Hgd EUR',    isin: 'LU0505784883', poids: 5 },
      { fonds: 'Amundi Actions Or P-C',                              isin: 'FR0012336683', poids: 5 },
    ],
  },
]

// Contrainte de commissionnement Abeille (Sébastien Pesce, Asselio, 30/07) :
// les supports de catégorie 5 ne sont pas commissionnés.
export const AVERTISSEMENTS_PARTENAIRE = {
  abeille: 'Les supports de catégorie 5 ne sont pas commissionnés par Abeille. Vérifier la catégorie de chaque support avant de proposer une allocation.',
}

// Repères de la molette. 0 = pôle bas, 100 = pôle haut.
export const CRANS = [
  { valeur: 0,   libelle: 'Prudent' },
  { valeur: 50,  libelle: 'Équilibré' },
  { valeur: 100, libelle: 'Dynamique' },
]

export const totalPoids = (lignes) =>
  Math.round((lignes || []).reduce((s, l) => s + (Number(l.poids) || 0), 0) * 10) / 10

/**
 * Mélange deux allocations selon le curseur, exactement comme le décrit
 * Louis : « un peu de dynamique et un peu de prudent ». À t = 0 on obtient
 * le pôle bas, à t = 1 le pôle haut, entre les deux une pondération linéaire
 * ligne à ligne sur l'union des supports.
 *
 * Le total n'est PAS normalisé : si un pôle ne tombe pas à 100 %, le mélange
 * non plus, et l'écran le montre. La remise à 100 % reste un geste explicite.
 */
export function melanger(polebas, poleHaut, t) {
  const parIsin = new Map()
  const ajouter = (lignes, facteur) => {
    for (const l of lignes || []) {
      const e = parIsin.get(l.isin) || { fonds: l.fonds, isin: l.isin, poids: 0 }
      e.poids += (Number(l.poids) || 0) * facteur
      parIsin.set(l.isin, e)
    }
  }
  ajouter(polebas?.lignes, 1 - t)
  ajouter(poleHaut?.lignes, t)
  return [...parIsin.values()]
    .map((l) => ({ ...l, poids: Math.round(l.poids * 10) / 10 }))
    .filter((l) => l.poids > 0)
    .sort((a, b) => b.poids - a.poids || a.fonds.localeCompare(b.fonds))
}

// Ramène une allocation à 100 % au prorata. Jamais automatique : l'écran
// l'expose comme une action, pour qu'on sache qu'on a corrigé.
export function normaliser(lignes) {
  const total = totalPoids(lignes)
  if (!total) return lignes
  return lignes.map((l) => ({ ...l, poids: Math.round((l.poids / total) * 1000) / 10 }))
}
