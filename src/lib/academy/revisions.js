// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, révisions J+7 et J+30, et items de la cloche
//
// Spec §3.6 et §3.7 : deux lignes de révision naissent à la validation d un
// module ; une révision est « due » par un simple prédicat sur les dates,
// sans job. Les révisions dues et les affectations en retard alimentent la
// cloche existante (NotificationsBell), regroupées : un item par famille,
// jamais un item par ligne.
//
// Tout est pur : la date du jour est un paramètre, la lib ne connaît ni le
// réseau ni React. Le prédicat « due » et le retard vivent dans statuts.js,
// pour que la prochaine action et la cloche racontent la même chose.
// ═══════════════════════════════════════════════════════════════════════════

import { ajouterJours } from '../sequences'
import { enRetard, revisionDue, revisionFaite } from './statuts'

const jour = (v) => (v ? String(v).slice(0, 10) : null)
const liste = (v) => (Array.isArray(v) ? v.filter(Boolean) : [])

// Tri par échéance croissante, une valeur vide en dernier.
const parEcheance = (a, b) => {
  const ea = jour(a.echeance), eb = jour(b.echeance)
  if (ea === eb) return 0
  if (!ea) return 1
  if (!eb) return -1
  return ea < eb ? -1 : 1
}

/**
 * Les révisions à faire aujourd hui, la plus ancienne d abord, chacune
 * avec `due` posé à true.
 */
export function revisionsDues(revisions, aujourdhui) {
  return liste(revisions)
    .filter((r) => revisionDue(r, aujourdhui))
    .sort(parEcheance)
    .map((r) => ({ ...r, due: true }))
}

/**
 * La révision non faite d échéance la plus proche, due ou à venir, avec
 * son drapeau `due` recalculé. Null quand tout est fait.
 */
export function prochaineRevision(revisions, aujourdhui) {
  const restantes = liste(revisions).filter((r) => !revisionFaite(r)).sort(parEcheance)
  if (!restantes.length) return null
  const r = restantes[0]
  return { ...r, due: revisionDue(r, aujourdhui) }
}

const pluriel = (n, singulier, plurielMot) => `${n} ${n > 1 ? plurielMot : singulier}`
const titres = (l) => l.map((x) => x.titre).filter(Boolean).join(' · ')

// Un item de la cloche, au format attendu par NotificationsBell.
const item = (id, lignes, titre, onOpen) => ({
  id,
  date: jour(lignes[0].echeance),
  couleur: 'var(--gold)',
  titre,
  detail: titres(lignes),
  onOpen,
})

/**
 * Les items de la cloche, regroupés par famille et dans cet ordre :
 *   academy-revisions   révisions dues
 *   academy-retards     affectations en retard
 *   academy-echeances   affectations à rendre dans les sept jours
 * La date de chaque item est l échéance la plus ancienne de sa famille.
 * `onOpen` est posé tel quel sur chaque item.
 */
export function itemsCloche(parcours, aujourdhui, onOpen) {
  const dues = revisionsDues(parcours?.revisions, aujourdhui)
  const affectations = liste(parcours?.affectations).filter((a) => a.statut !== 'valide')
  const retards = affectations.filter((a) => enRetard(a, aujourdhui)).sort(parEcheance)

  const horizon = ajouterJours(aujourdhui, 7)
  const proches = affectations
    .filter((a) => {
      const e = jour(a.echeance)
      return !!e && !enRetard(a, aujourdhui) && e <= horizon
    })
    .sort(parEcheance)

  const items = []
  if (dues.length) {
    items.push(item('academy-revisions', dues, pluriel(dues.length, 'révision due', 'révisions dues'), onOpen))
  }
  if (retards.length) {
    items.push(item('academy-retards', retards, pluriel(retards.length, 'module en retard', 'modules en retard'), onOpen))
  }
  if (proches.length) {
    items.push(item('academy-echeances', proches,
      `${pluriel(proches.length, 'échéance', 'échéances')} dans les 7 jours`, onOpen))
  }
  return items
}

const LIBELLES_REVISION = { J7: 'Révision J+7', J30: 'Révision J+30' }

/** Le nom d un type de révision, « Révision » tout court pour un type inconnu. */
export function libelleRevision(type) {
  return LIBELLES_REVISION[type] || 'Révision'
}
