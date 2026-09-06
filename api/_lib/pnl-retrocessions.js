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
  evaluerRentabilite, commissionsMois,
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
