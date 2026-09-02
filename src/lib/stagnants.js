// ═══════════════════════════════════════════════════════════════════════════
// DOSSIERS QUI STAGNENT
//
// Item C2 du plan d'amélioration (docs/plan_amelioration.md) : un dossier
// « En cours » qui n'a pas bougé depuis plus de N jours remonte à l'accueil
// du conseiller, et le manager voit le compte par conseiller. Constat en
// base au 1er septembre : 38 dossiers en cours, dont 7 sans aucun mouvement
// depuis plus de trois semaines.
//
// Ce qu'on appelle « mouvement » : la colonne updated_at de deals, fiable et
// jamais nulle. Un dossier qui porte une relance datée dans le futur n'est
// pas stagnant, il attend une échéance connue ; c'est la file du matin qui
// le rappellera le jour dit.
//
// Pourquoi une lib pure : le seuil et l'ordre décident de ce que quinze
// conseillers voient en ouvrant le CRM. Ça se teste sans navigateur.
//
// Fuseaux : updated_at est un instant UTC (2026-08-11T21:30:00+00:00), today
// un jour local (AAAA MM JJ). On ramène l'instant au jour de Paris via
// jourDe (ui-shared), puis on compte des jours entiers entre deux minuits
// locaux. Jamais de division brute de millisecondes : un changement d'heure
// d'été ferait perdre ou gagner un jour à l'arrondi.
// ═══════════════════════════════════════════════════════════════════════════

import { jourDe } from './ui-shared'
import { dealMatchesAdvisor } from './metrics'
import { jourISO } from './ma-journee'

export const SEUIL_STAGNATION_JOURS = 21

const jourAction = (deal) => (deal?.next_action_date ? String(deal.next_action_date).slice(0, 10) : null)

/**
 * Jours entiers écoulés depuis le dernier mouvement du dossier, comptés de
 * minuit à minuit en heure locale. 0 si le dossier n'a pas d'horodatage ou
 * s'il a bougé aujourd'hui (ou dans le futur, horloge mal réglée).
 */
export function joursSansMouvement(deal, today = jourISO()) {
  const jour = jourDe(deal?.updated_at)
  if (!jour) return 0
  const ms = new Date(today + 'T00:00:00') - new Date(jour + 'T00:00:00')
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Math.round(ms / 86400000))
}

// Un dossier stagne s'il est en cours, sans relance à venir, et sans
// mouvement depuis strictement plus de seuilJours jours.
const estStagnant = (deal, today, seuilJours) => {
  if (!deal || deal.status !== 'En cours') return false
  const relance = jourAction(deal)
  if (relance && relance > today) return false
  return joursSansMouvement(deal, today) > seuilJours
}

// Enrichit et trie : le plus ancien mouvement d'abord, c'est lui qui a le
// plus de chances d'être perdu. À nombre de jours égal, l'instant le plus
// ancien passe devant pour que l'ordre soit stable d'un rendu à l'autre.
const enrichirEtTrier = (liste, today) => liste
  .map((d) => ({ ...d, joursSansMouvement: joursSansMouvement(d, today) }))
  .sort((a, b) => (b.joursSansMouvement - a.joursSansMouvement)
    || String(a.updated_at || '').localeCompare(String(b.updated_at || '')))

/**
 * Les dossiers stagnants d'un conseiller (principal ou co conseiller, même
 * règle que la file du matin : le co conseiller partage la responsabilité).
 *
 * @param {Array}  deals
 * @param {Object} opts  { advisorCode, today (ISO, défaut aujourd'hui), seuilJours (défaut 21) }
 * @returns {Array} dossiers enrichis d'un entier joursSansMouvement, du plus ancien au plus récent
 */
export function dossiersStagnants(deals, { advisorCode, today = jourISO(), seuilJours = SEUIL_STAGNATION_JOURS } = {}) {
  const liste = Array.isArray(deals) ? deals : []
  if (!advisorCode) return []
  return enrichirEtTrier(
    liste.filter((d) => d && dealMatchesAdvisor(d, advisorCode) && estStagnant(d, today, seuilJours)),
    today,
  )
}

/**
 * Tous les dossiers stagnants du cabinet, pour le manager. La RLS décide de
 * ce que contient deals : un conseiller qui appellerait cette fonction ne
 * verrait que ses propres dossiers.
 */
export function dossiersStagnantsCabinet(deals, { today = jourISO(), seuilJours = SEUIL_STAGNATION_JOURS } = {}) {
  const liste = Array.isArray(deals) ? deals : []
  return enrichirEtTrier(liste.filter((d) => estStagnant(d, today, seuilJours)), today)
}

/**
 * Répartition par conseiller pour le manager. Un dossier compte pour son
 * conseiller principal uniquement, sinon un dossier partagé serait compté
 * deux fois et le total ne collerait plus à la liste.
 *
 * @returns {Array<{advisorCode: string, nombre: number, plusAncienJours: number}>}
 *   trié par nombre décroissant, puis par ancienneté, puis par code
 */
export function stagnantsParConseiller(deals, { today = jourISO(), seuilJours = SEUIL_STAGNATION_JOURS } = {}) {
  const parCode = new Map()
  for (const d of dossiersStagnantsCabinet(deals, { today, seuilJours })) {
    const code = String(d.advisor_code || '').trim() || 'Sans code'
    const ligne = parCode.get(code) || { advisorCode: code, nombre: 0, plusAncienJours: 0 }
    ligne.nombre += 1
    ligne.plusAncienJours = Math.max(ligne.plusAncienJours, d.joursSansMouvement)
    parCode.set(code, ligne)
  }
  return [...parCode.values()].sort((a, b) => (b.nombre - a.nombre)
    || (b.plusAncienJours - a.plusAncienJours)
    || a.advisorCode.localeCompare(b.advisorCode))
}
