// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, formats d affichage
//
// Durées, dates et pourcentages des écrans Formation. Les horodatages
// viennent de Postgres en UTC (timestamptz) : on les affiche toujours à
// l heure de Paris par Intl, jamais par un découpage de chaîne, sinon un
// battement de 00h30 s afficherait la veille à 22h30 (le piège documenté
// dans ui-shared.js pour les dates de rendez vous).
// ═══════════════════════════════════════════════════════════════════════════

const PARIS = 'Europe/Paris'

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS, day: '2-digit', month: '2-digit', year: 'numeric',
})
const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS, hour: '2-digit', minute: '2-digit', hour12: false,
})

// Une valeur porte une heure si elle a la forme d un horodatage ISO.
const aInstant = (v) => /T\d{2}:\d{2}/.test(String(v || ''))

// Le Date d un horodatage, ou null si la chaîne est vide ou illisible.
const instant = (iso) => {
  if (!iso) return null
  const d = new Date(String(iso))
  return Number.isNaN(d.getTime()) ? null : d
}

// Une date seule (AAAA MM JJ) écrite JJ/MM/AAAA sans passer par un fuseau :
// un `date` Postgres n a pas d heure, la décaler serait un contresens.
const jourSeul = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/**
 * Une durée active en texte court : « 0 min » sous trente secondes,
 * « 2 min », puis « 1 h 05 » à partir d une heure.
 */
export function formatDuree(secondes) {
  const s = Math.max(0, Number(secondes) || 0)
  const minutes = Math.round(s / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h} h ${String(m).padStart(2, '0')}`
}

/** Le jour à Paris, JJ/MM/AAAA, d un horodatage ou d une date seule. '' sans valeur. */
export function jourParis(iso) {
  if (!iso) return ''
  if (!aInstant(iso)) return jourSeul(iso)
  const d = instant(iso)
  return d ? FORMAT_JOUR.format(d) : ''
}

/** « JJ/MM/AAAA à HHhMM » à Paris ; une date seule reste un jour, sans heure. */
export function dateHeureParis(iso) {
  if (!iso) return ''
  if (!aInstant(iso)) return jourSeul(iso)
  const d = instant(iso)
  if (!d) return ''
  return `${FORMAT_JOUR.format(d)} à ${FORMAT_HEURE.format(d).replace(':', 'h')}`
}

/** Pourcentage entier arrondi, 0 sur un dénominateur nul ou absent. */
export function pourcentage(num, den) {
  const d = Number(den)
  if (!Number.isFinite(d) || d <= 0) return 0
  return Math.round((100 * (Number(num) || 0)) / d)
}

/** « Semaine du 15/09 » à partir du lundi ISO ; '' sans lundi. */
export function semaineLibelle(isoLundi) {
  const j = jourSeul(isoLundi)
  return j ? `Semaine du ${j.slice(0, 5)}` : ''
}

// ── Référentiels du catalogue ───────────────────────────────────────────────
// Les thèmes et niveaux sont stockés en clés (les slugs du seed) ; l écran
// affiche le libellé, et retombe sur la clé pour une valeur inconnue plutôt
// que sur rien.
export const THEMES = [
  { cle: 'methode', libelle: 'Méthode' },
  { cle: 'per-retraite', libelle: 'PER et retraite' },
  { cle: 'assurance-vie', libelle: 'Assurance vie' },
  { cle: 'gestion-de-patrimoine', libelle: 'Gestion de patrimoine' },
  { cle: 'immobilier-patrimonial', libelle: 'Immobilier patrimonial' },
  { cle: 'strategie-fiscale', libelle: 'Stratégie fiscale' },
  { cle: 'protection-sociale', libelle: 'Protection sociale' },
  { cle: 'outils', libelle: 'Outils' },
]
export const NIVEAUX = [
  { cle: 'decouverte', libelle: 'Découverte' },
  { cle: 'fondamentaux', libelle: 'Fondamentaux' },
  { cle: 'perfectionnement', libelle: 'Perfectionnement' },
]
const libelleDe = (liste, cle) => liste.find((x) => x.cle === cle)?.libelle || cle || ''
export const libelleTheme = (cle) => libelleDe(THEMES, cle)
export const libelleNiveau = (cle) => libelleDe(NIVEAUX, cle)
