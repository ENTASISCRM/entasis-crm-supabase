// ═══════════════════════════════════════════════════════════════════════════
// MA JOURNÉE — la file du matin
//
// Item n°1 du plan d'amélioration (docs/plan_amelioration.md, A1) : la
// journée d'un conseiller commence par une liste à dérouler, pas par une
// décision. Cette lib assemble la file à partir des dossiers déjà chargés :
//
//   1. les RDV du jour       (statut « Prévu », date_expected aujourd'hui)
//   2. les relances en retard (next_action_date dépassée)
//   3. les relances du jour   (next_action_date aujourd'hui)
//
// Pourquoi une lib pure : l'ordonnancement de cette file décide de ce que
// quinze conseillers font chaque matin. Ça se teste sans navigateur.
//
// Les RDV viennent de la Lead Room (le pont écrit date_expected en UTC) :
// tout passage à la journée ou à l'heure utilise jourDe/heureDe (ui-shared),
// jamais un slice — le piège du RDV affiché deux heures trop tôt est
// documenté là-bas.
// ═══════════════════════════════════════════════════════════════════════════

import { jourDe, heureDe } from './ui-shared'
import { dealMatchesAdvisor } from './metrics'

// Jour local au format ISO (YYYY-MM-DD), en heure de Paris implicite : le
// poste des conseillers est en France, new Date() suffit ici.
export const jourISO = (d = new Date()) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

const jourAction = (deal) => (deal?.next_action_date ? String(deal.next_action_date).slice(0, 10) : null)

/**
 * Assemble la file du matin d'un conseiller.
 *
 * @param {Array}  deals
 * @param {Object} opts  { advisorCode, today (ISO, défaut aujourd'hui) }
 * @returns {{rdv: Array, retard: Array, jour: Array, total: number}}
 */
export function construireMaJournee(deals, { advisorCode, today = jourISO() } = {}) {
  const liste = Array.isArray(deals) ? deals : []
  if (!advisorCode) return { rdv: [], retard: [], jour: [], total: 0 }
  const miens = liste.filter((d) => d && d.status !== 'Annulé' && dealMatchesAdvisor(d, advisorCode))

  // 1. Les RDV du jour : brouillons « Prévu » dont le rendez-vous tombe
  //    aujourd'hui. Triés par heure ; un RDV sans heure passe en fin.
  const rdv = miens
    .filter((d) => d.status === 'Prévu' && jourDe(d.date_expected) === today)
    .map((d) => ({ ...d, heureRdv: heureDe(d.date_expected) }))
    .sort((a, b) => String(a.heureRdv || '99').localeCompare(String(b.heureRdv || '99')))

  // 2 et 3. Les relances : une prochaine action datée d'aujourd'hui ou
  //    dépassée. Un dossier signé garde ses actions (envoi de pièces…).
  //    La plus ancienne d'abord : c'est elle qui brûle.
  const dues = miens
    .filter((d) => { const j = jourAction(d); return j && j <= today })
    .sort((a, b) => String(jourAction(a)).localeCompare(String(jourAction(b))))

  const retard = dues.filter((d) => jourAction(d) < today)
  const jour = dues.filter((d) => jourAction(d) === today)

  return { rdv, retard, jour, total: rdv.length + retard.length + jour.length }
}

/** Jours de retard d'une relance, 0 si elle est du jour. */
export function joursDeRetard(deal, today = jourISO()) {
  const j = jourAction(deal)
  if (!j || j >= today) return 0
  const ms = new Date(today + 'T00:00:00') - new Date(j + 'T00:00:00')
  return Math.max(0, Math.round(ms / 86400000))
}

/**
 * Date d'un report. Toujours calculée depuis AUJOURD'HUI, jamais depuis
 * l'échéance dépassée : reporter « à demain » une action en retard de dix
 * jours veut dire demain, pas il y a neuf jours.
 *
 * @param {'demain'|'semaine'} choix
 * @returns {string} date ISO
 */
export function dateReport(choix, today = jourISO()) {
  const d = new Date(today + 'T00:00:00')
  d.setDate(d.getDate() + (choix === 'semaine' ? 7 : 1))
  return jourISO(d)
}
