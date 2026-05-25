// ═══════════════════════════════════════════════════════════════════════════
// MOTEUR DE CALCUL DE COMMISSION — Module Rémunération
//
// Fonctions pures, sans dépendance React/Supabase, testables unitairement.
// Source des règles : barème BAREME-CDI-2026 + décisions Louis Hatton.
// Doc canonique : src/lib/bareme-entasis.js
//
// CONFIDENTIALITÉ STRICTE
//   Tous les calculs s'appuient sur le contrat du conseiller concerné.
//   Aucune comparaison inter-conseiller n'est exposée par ces helpers.
// ═══════════════════════════════════════════════════════════════════════════

import {
  BAREME_PRODUITS,
  FRAIS_ENTREE_DEFAUT_PCT,
  TYPES_AVEC_SEUIL_RENTABILITE,
  brutCumule,
} from './bareme-entasis'

/**
 * Mappe un produit de l'UI (deal.produit + deal.compagnie) vers une clé
 * du barème BAREME_PRODUITS.
 *
 * Liste UI : 'PER Individuel', 'Assurance Vie Française', 'SCPI',
 *           'Produits Structurés', 'Private Equity', 'Prévoyance TNS',
 *           'Mutuelle Santé', 'Autre'
 *
 * Retourne null si le mapping n'est pas trouvé (commission = 0 par défaut).
 */
export function mapProduitDeal(deal) {
  if (!deal) return null
  const produit = (deal.produit || '').toLowerCase()
  const compagnie = (deal.compagnie || '').toLowerCase()

  // PER
  if (produit.includes('per')) {
    // On prend par défaut SwissLife / Abeille N+4 (taux le plus généreux)
    // Faute de tracking explicite N+3 vs N+4 sur les deals existants.
    return 'per_swisslife_abeille_n4'
  }

  // Assurance Vie
  if (produit.includes('assurance vie') || produit === 'av') {
    return 'av'
  }

  // SCPI
  if (produit.includes('scpi')) return 'scpi'

  // Produits structurés / UCS
  if (produit.includes('structur') || produit === 'ucs') return 'ucs'

  // Private Equity
  if (produit.includes('private equity') || produit === 'pe') return 'pe'

  // Prévoyance / Mutuelle — dépend de la compagnie
  if (produit.includes('prévoyance') || produit.includes('prevoyance') ||
      produit.includes('mutuelle') || produit.includes('santé')) {
    if (compagnie.includes('april')) return 'april'
    if (compagnie.includes('swiss')) return 'swisslife_prev'
    if (compagnie.includes('spvie')) return 'spvie'
    // Par défaut : SwissLife (taux le plus bas, conservatrice)
    return 'swisslife_prev'
  }

  // Immobilier MH / Girardin — pas dans la liste PRODUCTS de l'UI actuelle,
  // on les expose via le module Immo dédié et leurs deals utilisent
  // d'autres tables. On les laisse mappables si jamais ils apparaissent.
  if (produit.includes('monument') || produit === 'mh') return 'mh'
  if (produit.includes('girardin')) return 'girardin'

  return null
}

/**
 * Détermine l'assiette monétaire d'un deal pour le calcul commission.
 * Selon le produit, on prend la PP annualisée ou la PU.
 */
export function assietteDeal(deal, produitKey) {
  if (!deal || !produitKey) return 0
  const produit = BAREME_PRODUITS[produitKey]
  if (!produit) return 0

  switch (produit.assiette) {
    case 'pp':
      return Number(deal.pp_m || 0) * 12
    case 'pu':
      return Number(deal.pu || 0)
    case 'montant_investi':
    case 'montant_collecte':
      // Pour ces produits hors palier, on prend la PU si renseignée, sinon
      // la pp_m × 12. Adapter si une colonne `montant_investi` arrive plus tard.
      return Number(deal.pu || 0) || Number(deal.pp_m || 0) * 12
    default:
      return 0
  }
}

/**
 * Calcule la commission brute d'un deal pour un contrat donné, en supposant
 * que le seuil de rentabilité a déjà été évalué (`contrat.rentabilise`).
 *
 * @param {Object} deal     - { produit, compagnie, pp_m, pu, frais_entree_pct }
 * @param {Object} contrat  - { type_contrat, rentabilise }
 * @returns {{ produitKey, assiette, taux, montant, horsPalier }}
 */
export function commissionBruteDeal(deal, contrat) {
  const produitKey = mapProduitDeal(deal)
  if (!produitKey) {
    return { produitKey: null, assiette: 0, taux: 0, montant: 0, horsPalier: false }
  }
  const produit = BAREME_PRODUITS[produitKey]
  const assiette = assietteDeal(deal, produitKey)
  const frais = Number(deal.frais_entree_pct ?? FRAIS_ENTREE_DEFAUT_PCT)

  // Mandataire / Gérant : toujours taux mandataire
  // CDI/CDD/Alternant/Stagiaire rentabilisé : taux CDI
  // CDI/CDD/Alternant/Stagiaire NON rentabilisé : taux mandataire (booster)
  let taux
  if (!TYPES_AVEC_SEUIL_RENTABILITE.includes(contrat?.type_contrat)) {
    taux = produit.mandataire(frais)
  } else if (contrat?.rentabilise) {
    taux = produit.cdi(frais)
  } else {
    taux = produit.mandataire(frais)
  }

  const montant = (assiette * taux) / 100

  return {
    produitKey,
    assiette,
    taux,
    montant,
    horsPalier: produit.horsPalier,
  }
}

/**
 * "Valeur cabinet" d'un deal : ce qu'il rapporterait au cabinet si le
 * conseiller était mandataire (= taux maximum). Sert au calcul du seuil
 * de rentabilité.
 */
export function valeurCabinetDeal(deal) {
  const produitKey = mapProduitDeal(deal)
  if (!produitKey) return 0
  const produit = BAREME_PRODUITS[produitKey]
  const assiette = assietteDeal(deal, produitKey)
  const frais = Number(deal.frais_entree_pct ?? FRAIS_ENTREE_DEFAUT_PCT)
  const taux = produit.mandataire(frais)
  return (assiette * taux) / 100
}

/**
 * Calcule si un conseiller est "rentabilisé" à une date donnée.
 *
 * Règle Louis : un CDI/CDD/Alternant/Stagiaire est rentabilisé si la
 * valeur cumulée de sa production (au taux mandataire) depuis son embauche
 * dépasse le brut cumulé qu'il a touché sur la même période.
 *
 * Les mandataires et gérants sont toujours considérés "rentabilisés"
 * (ils n'ont pas de seuil applicable).
 *
 * @param {Object} contrat
 * @param {Array}  dealsHistoriques  - Tous les deals signés du conseiller
 * @param {Date}   dateRef           - Date de référence (default: maintenant)
 * @returns {{ rentabilise: boolean, brutCumule, valeurCumulee, ecart }}
 */
export function evaluerRentabilite(contrat, dealsHistoriques = [], dateRef = new Date()) {
  if (!contrat) {
    return { rentabilise: false, brutCumule: 0, valeurCumulee: 0, ecart: 0 }
  }
  if (!TYPES_AVEC_SEUIL_RENTABILITE.includes(contrat.type_contrat)) {
    return { rentabilise: true, brutCumule: 0, valeurCumulee: 0, ecart: 0 }
  }
  // Stagiaire à 0 € : aucun coût → toujours rentabilisé dès le 1er €
  if (Number(contrat.salaire_brut_mensuel || 0) <= 0) {
    return { rentabilise: true, brutCumule: 0, valeurCumulee: 0, ecart: 0 }
  }

  const brut = brutCumule(contrat, dateRef)
  const debut = new Date(contrat.date_debut)
  const valeur = dealsHistoriques.reduce((sum, deal) => {
    if (!deal.date_signed) return sum
    const ds = new Date(deal.date_signed)
    if (ds < debut || ds > dateRef) return sum
    if (deal.status !== 'Signé') return sum
    return sum + valeurCabinetDeal(deal)
  }, 0)

  return {
    rentabilise: valeur >= brut,
    brutCumule: brut,
    valeurCumulee: valeur,
    ecart: valeur - brut,                // positif si rentabilisé, négatif si pas
  }
}

/**
 * Calcule la commission totale d'un mois pour un conseiller.
 *
 * Logique :
 *   1. Sépare les deals du mois en 3 groupes :
 *      - PP (produits avec assiette pp, hors palier=false) : PER, AV
 *      - PU (produits avec assiette pu, hors palier=false) : PU libre/transfert
 *      - Hors palier : SCPI, MH, Girardin, PE, UCS, Prév., Mutuelle
 *   2. PP : si total PP du mois >= palier_pp → variable sur l'EXCÉDENT seulement
 *      Sinon : 0 variable PP (le fixe couvre)
 *   3. PU : pareil avec palier_pu
 *   4. Hors palier : commission dès le 1er € quoi qu'il arrive
 *
 * Pour les mandataires (palier=0), tout est traité comme hors palier.
 *
 * @param {Array}  dealsMois         - Deals signés du mois en cours
 * @param {Object} contrat           - { type_contrat, palier_pp_mensuel, … }
 * @param {Boolean} rentabilise      - Pré-calculé par evaluerRentabilite()
 * @returns {{ variablePp, variablePu, variableHorsPalier, total,
 *             ppRealisee, puRealisee, palierPpAtteint, palierPuAtteint }}
 */
export function commissionsMois(dealsMois = [], contrat, rentabilise) {
  if (!contrat) {
    return {
      variablePp: 0, variablePu: 0, variableHorsPalier: 0, total: 0,
      ppRealisee: 0, puRealisee: 0,
      palierPpAtteint: false, palierPuAtteint: false,
      detail: [],
    }
  }
  const ctx = { ...contrat, rentabilise }
  const palierPp = Number(contrat.palier_pp_mensuel || 0)
  const palierPu = Number(contrat.palier_pu_mensuel || 0)

  // 1. Agrégation par catégorie
  let ppRealisee = 0
  let puRealisee = 0
  let variableHorsPalier = 0
  const detail = []

  for (const deal of dealsMois) {
    const calc = commissionBruteDeal(deal, ctx)
    if (!calc.produitKey) continue
    const produit = BAREME_PRODUITS[calc.produitKey]
    if (produit.assiette === 'pp' && !produit.horsPalier) {
      ppRealisee += calc.assiette
    } else if (produit.assiette === 'pu' && !produit.horsPalier) {
      puRealisee += calc.assiette
    } else {
      // Hors palier : commission immédiate
      variableHorsPalier += calc.montant
    }
    detail.push({ deal, ...calc })
  }

  // 2. Variable PP : sur l'excédent au-dessus du palier
  let variablePp = 0
  const palierPpAtteint = palierPp <= 0 || ppRealisee >= palierPp
  if (palierPpAtteint && ppRealisee > palierPp) {
    // On calcule le variable comme si tous les deals PP avaient été pris,
    // mais en n'appliquant le taux que sur la partie ABOVE palier.
    // Approche : ratio (ppRealisee - palierPp) / ppRealisee
    const ratio = palierPp > 0 ? (ppRealisee - palierPp) / ppRealisee : 1
    for (const d of detail) {
      const produit = BAREME_PRODUITS[d.produitKey]
      if (produit.assiette === 'pp' && !produit.horsPalier) {
        variablePp += d.montant * ratio
      }
    }
  }

  // 3. Variable PU : idem
  let variablePu = 0
  const palierPuAtteint = palierPu <= 0 || puRealisee >= palierPu
  if (palierPuAtteint && puRealisee > palierPu) {
    const ratio = palierPu > 0 ? (puRealisee - palierPu) / puRealisee : 1
    for (const d of detail) {
      const produit = BAREME_PRODUITS[d.produitKey]
      if (produit.assiette === 'pu' && !produit.horsPalier) {
        variablePu += d.montant * ratio
      }
    }
  }

  return {
    variablePp,
    variablePu,
    variableHorsPalier,
    total: variablePp + variablePu + variableHorsPalier,
    ppRealisee,
    puRealisee,
    palierPpAtteint,
    palierPuAtteint,
    detail,
  }
}

/**
 * Filtre les deals signés sur un mois donné (YYYY-MM).
 */
export function dealsDuMois(deals, monthStr) {
  if (!deals || !monthStr) return []
  return deals.filter(d => {
    if (d.status !== 'Signé') return false
    const ds = d.date_signed || d.date
    if (!ds) return false
    return String(ds).slice(0, 7) === monthStr
  })
}

/**
 * Filtre les deals signés appartenant à un conseiller donné (advisor_code).
 */
export function dealsDuConseiller(deals, advisorCode) {
  if (!deals || !advisorCode) return []
  return deals.filter(d => d.advisor_code === advisorCode)
}
