// api/_lib/pnl-retrocessions.js
// ═══════════════════════════════════════════════════════════════════════════
// Ce que le cabinet doit a ses conseillers, calcule avec le bareme DEJA
// configure dans le CRM. Aucun taux nouveau ici : on rejoue simplement, mois
// par mois, le moteur qui sert deja a la fiche de remuneration de chacun.
//
// Pourquoi c est necessaire. La moitie des seize personnes est payee a la
// commission. Sans cette ligne, un mandataire paraissait infiniment rentable
// et le cout du cabinet etait ampute de son deuxieme poste.
//
// Les GERANTS sont exclus. Leur remuneration passe par Geniopus et Decampius,
// elle est deja portee par pnl_couts_personne : leur verser en plus un
// variable calcule au bareme les compterait deux fois.
// ═══════════════════════════════════════════════════════════════════════════

import {
  codesContrat, dealsDuConseiller, dealsDuMois,
  evaluerRentabilite, commissionsMois, partDeal, valeurCabinetDeal,
} from './calcul-commission.js'
import { contratsDeReferenceParPersonne } from './contrats.js'

// Le mois d un deal est un libelle francais accentue en majuscules.
export const MOIS = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE',
]

// La meme cle de regroupement que la fonction SQL : un contrat sans profil
// existe (un alternant qui arrive le mois prochain) et ne doit pas se perdre.
export const cleDe = (o) => (o?.profile_id || o?.id)
  ? String(o.profile_id || o.id)
  : `nom:${o?.full_name || o?.nom || '?'}`

/**
 * Retrocession annuelle par personne, en rejouant le bareme mois par mois.
 * `contrats` doit porter la relation `profile` quand elle existe.
 */
export function retrocessionsAnnuelles({ deals = [], contrats = [], annee }) {
  const parPersonne = new Map()
  const eligibles = (contrats || []).filter(
    (c) => c && String(c.type_contrat || '').toUpperCase() !== 'GERANT',
  )

  for (let m = 0; m < 12; m += 1) {
    // Le 15 du mois : la meme reference que la fiche de remuneration, pour
    // que les deux ecrans ne se contredisent jamais.
    const dateRef = new Date(annee, m, 15)
    for (const contrat of contratsDeReferenceParPersonne(eligibles, dateRef)) {
      const profileLie = contrat.profile || null
      const codes = codesContrat(contrat, profileLie)
      const dealsConseiller = dealsDuConseiller(
        deals, codes, profileLie?.id || contrat.profile_id || null,
      )
      const dealsMois = dealsDuMois(dealsConseiller, MOIS[m], annee)
      if (!dealsMois.length) continue

      const rentab = evaluerRentabilite(contrat, dealsConseiller, profileLie, dateRef)
      const comm = commissionsMois(dealsMois, contrat, rentab, profileLie)
      const montant = Number(comm?.total || 0)
      if (!(montant > 0)) continue

      const cle = cleDe(contrat)
      const e = parPersonne.get(cle) || { total: 0, moisAvecVariable: 0 }
      e.total += montant
      e.moisAvecVariable += 1
      parPersonne.set(cle, e)
    }
  }
  return parPersonne
}

/**
 * Pose la retrocession sur les lignes de rentabilite.
 *
 * Un bordereau reellement paye prime toujours sur le bareme : c est du cash
 * constate contre un calcul. Le bareme ne sert que la ou aucun bordereau n a
 * encore ete importe, et la ligne dit alors d ou vient le chiffre.
 */
export function appliquerRetrocessions(lignes, parPersonne) {
  const lire = (cle) => {
    if (!parPersonne) return 0
    const v = typeof parPersonne.get === 'function' ? parPersonne.get(cle) : parPersonne[cle]
    return Number(v?.total || 0)
  }

  return (lignes || []).map((l) => {
    const dejaPaye = Number(l.cout_retrocession || 0)
    if (dejaPaye > 0) return { ...l, retrocession_source: 'bordereau' }

    const bareme = lire(cleDe(l))
    if (!(bareme > 0)) return { ...l, retrocession_source: 'aucune' }

    return {
      ...l,
      cout_retrocession: bareme,
      cout_total: Number(l.cout_total || 0) + bareme,
      marge: Number(l.marge || 0) - bareme,
      retrocession_source: 'bareme',
    }
  })
}

// ─── Attribution vivante, depuis le CRM ───────────────────────────────────
// Ce que chacun a produit dans l annee, au sens du CRM, co conseil compris :
// partDeal rend 0,5 quand le dossier porte un co conseiller, 1 sinon. Le
// bordereau, lui, ne connait que le compte qui heberge le contrat.
//
// La valeur rendue est une valeur CABINET, mesuree au taux mandataire : c est
// un etalon commun a tous, pas une commission reellement percue. Elle sert a
// repartir la recette bancaire, qui est le seul montant reel.
export function contributionsAnnuelles({ deals = [], contrats = [], annee }) {
  const signes = (deals || []).filter(
    (d) => d?.status === 'Signé' && String(d.date_signed || '').startsWith(String(annee)),
  )
  // Le 31 decembre : on veut le contrat qui donne les codes de la personne,
  // pas celui d un mois precis.
  const refs = contratsDeReferenceParPersonne(
    (contrats || []).filter(Boolean), new Date(annee, 11, 31),
  )
  const parPersonne = new Map()
  for (const contrat of refs) {
    const profileLie = contrat.profile || null
    const codes = codesContrat(contrat, profileLie)
    const pid = profileLie?.id || contrat.profile_id || null
    let valeur = 0
    let dossiers = 0
    let enCo = 0
    for (const d of signes) {
      const part = partDeal(d, codes, pid)
      if (!part) continue
      valeur += valeurCabinetDeal(d, part)
      dossiers += 1
      if (part < 1) enCo += 1
    }
    if (dossiers) parPersonne.set(cleDe(contrat), { valeur, dossiers, enCo })
  }
  return parPersonne
}

/**
 * Repartit un montant REEL entre les personnes, au prorata de ce qu elles ont
 * produit dans le CRM. Le total reste celui de la banque, la cle de partage
 * vient du CRM et tient compte du co conseil.
 */
export function repartirRecette(lignes, contributions, montantTotal) {
  const total = [...(contributions?.values?.() || [])]
    .reduce((s, c) => s + Number(c.valeur || 0), 0)
  const montant = Number(montantTotal || 0)

  return (lignes || []).map((l) => {
    const c = contributions?.get?.(cleDe(l))
    const dossiers = Number(c?.dossiers || 0)
    const enCo = Number(c?.enCo || 0)
    if (!(total > 0) || !(montant > 0)) {
      return { ...l, dossiers_en_co: enCo, part_production: 0 }
    }
    const part = Number(c?.valeur || 0) / total
    const attribue = montant * part
    return {
      ...l,
      commission_encaissee: attribue,
      contrats_signes: dossiers,
      dossiers_en_co: enCo,
      part_production: part,
      marge: attribue - Number(l.cout_total || 0),
    }
  })
}

/**
 * Ajoute aux lignes ce que le CRM sait du travail fourni (dossiers signes,
 * dossiers en co conseil) SANS toucher aux montants.
 *
 * Pourquoi ne pas repartir la recette avec cette cle : les deals du CRM ne
 * commencent qu en avril 2026. Appliquer une cle calculee sur avril a
 * septembre a la recette de toute l annee a fait tomber le premier producteur
 * du cabinet de 102 349 a 46 923. Le grand livre, lui, couvre janvier a
 * juillet : c est lui qui porte les euros.
 */
export function enrichirContributions(lignes, contributions) {
  return (lignes || []).map((l) => {
    const c = contributions?.get?.(cleDe(l))
    return {
      ...l,
      dossiers_crm: Number(c?.dossiers || 0),
      dossiers_en_co: Number(c?.enCo || 0),
    }
  })
}
