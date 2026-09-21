// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, statuts, retards et prochaine action
//
// Spec docs/superpowers/specs/2026-09-21-entasis-academy-design.md, §3.4 :
// une affectation porte un statut (non_commence, en_cours, a_revoir,
// valide) et le retard est un indicateur distinct, calculé depuis
// l échéance. Rien ici ne touche au réseau ni à React : la date du jour est
// toujours un paramètre `aujourdhui` (ISO AAAA MM JJ), ce qui rend chaque
// règle testable à date fixe.
//
// Les dates arrivent en `date` Postgres (AAAA MM JJ) ; par prudence on ne
// garde que le jour d un éventuel horodatage. Les différences se comptent
// en jours calendaires, à minuit local, avec un arrondi qui absorbe le
// changement d heure (voir joursDeRetard dans ma-journee.js).
// ═══════════════════════════════════════════════════════════════════════════

import { jourISO } from '../ma-journee'

export const STATUTS = {
  non_commence: 'Non commencé',
  en_cours: 'En cours',
  a_revoir: 'À revoir',
  valide: 'Validé',
}

const BADGES = {
  non_commence: 'badge badge-normal',
  en_cours: 'badge badge-progress',
  a_revoir: 'badge badge-high',
  valide: 'badge badge-signed',
}

/** La classe CSS du badge d un statut, badge normal pour un statut inconnu. */
export function classeBadge(statut) {
  return BADGES[statut] || BADGES.non_commence
}

// Le jour d une valeur : un Date injecté passe par jourISO (jour local,
// comme partout dans le CRM), une chaîne date ou horodatage garde son jour,
// une valeur vide donne null.
const jour = (v) => {
  if (v instanceof Date) return jourISO(v)
  return v ? String(v).slice(0, 10) : null
}

/**
 * Jours calendaires entre deux dates, positif si `jusqua` est après
 * `depuis`. Minuit local des deux côtés et arrondi : le passage à l heure
 * d été ou d hiver ne fait ni perdre ni gagner un jour.
 */
export function joursEntre(depuis, jusqua) {
  const a = new Date(jour(depuis) + 'T00:00:00')
  const b = new Date(jour(jusqua) + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

const estValide = (a) => a?.statut === 'valide'

/** Vrai si l échéance est dépassée et le module pas validé. Sans échéance : jamais. */
export function enRetard(affectation, aujourdhui) {
  const e = jour(affectation?.echeance)
  if (!e || estValide(affectation)) return false
  return e < jour(aujourdhui)
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

/**
 * Le texte d échéance affiché sous un module :
 *   'Validé'                          module validé, quelle que soit la date
 *   ''                                sans échéance
 *   'Échéance dépassée de N jour(s)'  en retard
 *   'À rendre aujourd hui'            le jour même
 *   'À rendre dans N jour(s)'         à venir
 */
export function libelleEcheance(affectation, aujourdhui) {
  if (estValide(affectation)) return 'Validé'
  const e = jour(affectation?.echeance)
  if (!e) return ''
  const n = joursEntre(aujourdhui, e)
  if (n < 0) return `Échéance dépassée de ${pluriel(-n, 'jour')}`
  if (n === 0) return 'À rendre aujourd hui'
  return `À rendre dans ${pluriel(n, 'jour')}`
}

/** Une révision est faite dès qu une tentative ou un résultat lui est attaché. */
export const revisionFaite = (r) => r?.tentative_id != null || r?.resultat != null

/**
 * Vrai si la révision est à faire aujourd hui : pas encore faite, et
 * échéance atteinte. Le drapeau `due` posé par la RPC est honoré, mais on
 * recalcule toujours depuis la date pour ne pas dépendre de l heure du
 * serveur au moment de la lecture.
 */
export function revisionDue(revision, aujourdhui) {
  if (!revision || revisionFaite(revision)) return false
  const e = jour(revision.echeance)
  return revision.due === true || (!!e && e <= jour(aujourdhui))
}

// Tri : échéance croissante, une valeur vide en dernier.
const parEcheance = (a, b) => {
  const ea = jour(a.echeance), eb = jour(b.echeance)
  if (ea === eb) return 0
  if (!ea) return 1
  if (!eb) return -1
  return ea < eb ? -1 : 1
}

// Les leçons sont finies quand il n en reste aucune à ouvrir.
const leconsFinies = (a) =>
  !a.prochaine_lecon || (Number(a.nb_lecons) > 0 && Number(a.lecons_terminees) >= Number(a.nb_lecons))

// L item de la prochaine action pour une affectation : la leçon à
// reprendre, ou le quiz quand toutes les leçons sont terminées.
function itemAffectation(a) {
  const base = { id: a.id, titre: a.titre, slug: a.slug, version_id: a.version_id }
  if (leconsFinies(a)) {
    return { type: 'quiz', ...base, libelle: 'Passer le quiz', bouton: 'Passer le quiz' }
  }
  const l = a.prochaine_lecon
  return {
    type: 'lecon', ...base, lecon: l,
    libelle: `Reprendre la leçon ${l.ordre} : ${l.titre}`, bouton: 'Reprendre',
  }
}

/**
 * La seule chose à faire maintenant, dans l ordre des priorités :
 *   1. une révision due, la plus ancienne
 *   2. un module en retard, le plus en retard
 *   3. un module en cours ou à revoir, échéance la plus proche
 *   4. un module non commencé, échéance la plus proche puis obligatoire
 *   5. rien : null
 *
 * `parcours` est l objet rendu par academy_mon_parcours.
 */
export function prochaineAction(parcours, aujourdhui) {
  const revisions = Array.isArray(parcours?.revisions) ? parcours.revisions : []
  const affectations = Array.isArray(parcours?.affectations) ? parcours.affectations : []

  const dues = revisions.filter((r) => revisionDue(r, aujourdhui)).sort(parEcheance)
  if (dues.length) {
    const r = dues[0]
    return {
      type: 'revision', titre: r.titre, slug: r.slug, version_id: r.version_id, revisionType: r.type,
      libelle: `Faire la révision J+${String(r.type).replace(/^J/, '')}`, bouton: 'Réviser',
    }
  }

  const aFaire = affectations.filter((a) => a && !estValide(a))

  const retards = aFaire.filter((a) => enRetard(a, aujourdhui)).sort(parEcheance)
  if (retards.length) return itemAffectation(retards[0])

  const enCours = aFaire.filter((a) => a.statut === 'en_cours' || a.statut === 'a_revoir').sort(parEcheance)
  if (enCours.length) return itemAffectation(enCours[0])

  const nonCommences = aFaire
    .filter((a) => a.statut === 'non_commence' || !a.statut)
    .sort((a, b) => parEcheance(a, b) || Number(!!b.obligatoire) - Number(!!a.obligatoire))
  if (nonCommences.length) return itemAffectation(nonCommences[0])

  return null
}

/** Part des leçons terminées, en pourcentage entier ; 100 pour un module validé. */
export function progressionPct(affectation) {
  if (estValide(affectation)) return 100
  const total = Number(affectation?.nb_lecons) || 0
  if (total <= 0) return 0
  const faites = Number(affectation?.lecons_terminees) || 0
  return Math.round((100 * Math.min(faites, total)) / total)
}

/**
 * Les modules d un parcours qui ont une version publiée : seuls ceux là
 * s affectent. Un parcours dont aucun module n est publié donne zéro
 * affectation, il faut le dire avant le clic plutôt qu après.
 * @param {{modules?: Array<{module_id: string}>}} parcours
 * @param {Array<{id: string, versions?: Array<{statut: string}>}>} modules
 * @returns {{ publies: number, total: number }}
 */
export function modulesPubliesDuParcours(parcours, modules) {
  const liste = Array.isArray(parcours?.modules) ? parcours.modules : []
  const publie = new Set((Array.isArray(modules) ? modules : [])
    .filter((m) => (m.versions || []).some((v) => v.statut === 'publie'))
    .map((m) => m.id))
  return { publies: liste.filter((pm) => publie.has(pm.module_id)).length, total: liste.length }
}

/** Le libellé d un parcours dans un sélecteur d affectation. */
export function libelleParcoursAffectable(parcours, modules) {
  const { publies, total } = modulesPubliesDuParcours(parcours, modules)
  if (total === 0) return `${parcours.titre} (aucun module)`
  if (publies === 0) return `${parcours.titre} (aucun module publié)`
  if (publies < total) return `${parcours.titre} (${publies} module${publies > 1 ? 's' : ''} publié${publies > 1 ? 's' : ''} sur ${total})`
  return `${parcours.titre} (${total} module${total > 1 ? 's' : ''})`
}
