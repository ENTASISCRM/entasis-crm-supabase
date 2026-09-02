// ═══════════════════════════════════════════════════════════════════════════
// COMPLÉTUDE DES FICHES CLIENTS
//
// Le cabinet veut travailler la donnée et lancer des campagnes ciblées. Le
// seul frein : les fiches ne sont pas remplies. Mesure en base le 2 septembre
// 2026 sur 381 fiches : téléphone 83 %, email 87 %, profession 20 %, statut
// professionnel 19 %, revenus 18 %, patrimoine 15 %, date de naissance 9 %,
// situation familiale 9 %. Depuis que le verrou de signature impose statut,
// profession, revenus et patrimoine (13 juillet), les fiches créées sont
// remplies six fois mieux : la contrainte au bon moment et la visibilité
// marchent. Cette lib donne les deux.
//
// Ce qu'elle calcule, sans jamais toucher à la base :
//
//   scoreCompletude            un score de 0 à 100 par fiche, pondéré par
//                              l'utilité du champ pour une campagne
//   prioriserFichesACompleter  les fiches d'un conseiller à compléter en
//                              premier, celles qu'il va voir ou qu'il vient
//                              de signer d'abord
//   completudeParConseiller    la vue direction, un client compte pour son
//                              conseiller principal
//   champsPourCampagne         combien de fiches sont évaluables pour un jeu
//                              de champs donné, pour l'écran Campagnes
//
// Pourquoi une lib pure : le poids des champs et l'ordre des fiches décident
// de ce que quinze conseillers voient chaque matin. Ça se teste sans
// navigateur. Aucun montant, aucune rémunération : on compte des champs.
// ═══════════════════════════════════════════════════════════════════════════

import { jourDe } from './ui-shared'
import { jourISO } from './ma-journee'

// Les champs qui comptent pour une campagne, avec leur poids. Les quatre
// champs à 2 points sont ceux qui ciblent (statut, revenus, patrimoine, âge),
// les quatre à 1 point qualifient ou permettent de joindre. La date de
// naissance et l'âge se valent : l'un des deux suffit. nb_enfants ne compte
// pas, sa valeur par défaut est 0 et on ne saurait pas distinguer « pas
// d'enfant » de « pas renseigné ».
export const CHAMPS_CAMPAGNE = [
  { cle: 'statut_pro', libelle: 'Statut professionnel', poids: 2 },
  { cle: 'revenus_annuels', libelle: 'Revenus annuels', poids: 2 },
  { cle: 'patrimoine_estime', libelle: 'Patrimoine estimé', poids: 2 },
  { cle: 'date_naissance', libelle: 'Date de naissance', poids: 2, alternatives: ['age'] },
  { cle: 'profession', libelle: 'Profession', poids: 1 },
  { cle: 'situation_familiale', libelle: 'Situation familiale', poids: 1 },
  { cle: 'telephone', libelle: 'Téléphone', poids: 1 },
  { cle: 'email', libelle: 'Email', poids: 1 },
]

export const POIDS_TOTAL = CHAMPS_CAMPAGNE.reduce((s, c) => s + c.poids, 0)

// Les quatre niveaux, du plus au moins rempli. Les seuils sont volontairement
// encourageants : à 70 % on est « presque », pas « incomplet ».
export const NIVEAUX = {
  complete: { seuil: 100, libelle: 'Complète' },
  presque: { seuil: 70, libelle: 'Presque complète' },
  partielle: { seuil: 30, libelle: 'Partielle' },
  vide: { seuil: 0, libelle: 'À démarrer' },
}

// Valeurs de situation familiale telles que la modale client les écrit en
// base (ClientModal), avec un libellé qui inclut le féminin à l'écran. On
// stocke la même valeur que la modale, sinon son select se viderait à la
// prochaine ouverture de la fiche.
export const SITUATIONS_FAMILIALES = [
  { valeur: 'Célibataire', libelle: 'Célibataire' },
  { valeur: 'Marié', libelle: 'Marié(e)' },
  { valeur: 'Pacsé', libelle: 'Pacsé(e)' },
  { valeur: 'Divorcé', libelle: 'Divorcé(e)' },
  { valeur: 'Veuf', libelle: 'Veuf(ve)' },
]

const parCle = new Map(CHAMPS_CAMPAGNE.map((c) => [c.cle, c]))

export const libelleChamp = (cle) => parCle.get(cle)?.libelle || cle

// Un champ est renseigné s'il n'est ni nul ni vide après trim. Même règle que
// le verrou de signature : un montant à 0 est une donnée saisie. L'âge fait
// exception : 0 n'est pas un âge, c'est la valeur d'un champ vide.
export function champRempli(valeur, cle) {
  if (valeur == null) return false
  if (cle === 'age') return Number(valeur) > 0
  return String(valeur).trim() !== ''
}

// Le champ est renseigné sur la fiche, directement ou par l'une de ses
// alternatives (l'âge pour la date de naissance).
export function champRempliPour(client, cle) {
  const champ = parCle.get(cle)
  if (champRempli(client?.[cle], cle)) return true
  return (champ?.alternatives || []).some((alt) => champRempli(client?.[alt], alt))
}

export function niveauDe(score) {
  if (score >= NIVEAUX.complete.seuil) return 'complete'
  if (score >= NIVEAUX.presque.seuil) return 'presque'
  if (score >= NIVEAUX.partielle.seuil) return 'partielle'
  return 'vide'
}

/**
 * Score de complétude d'une fiche.
 *
 * @returns {{score: number, manquants: Array<{cle: string, libelle: string, poids: number}>, niveau: string}}
 */
export function scoreCompletude(client) {
  const manquants = CHAMPS_CAMPAGNE
    .filter((c) => !champRempliPour(client, c.cle))
    .map(({ cle, libelle, poids }) => ({ cle, libelle, poids }))
  const perdu = manquants.reduce((s, c) => s + c.poids, 0)
  const score = Math.round(((POIDS_TOTAL - perdu) / POIDS_TOTAL) * 100)
  return { score, manquants, niveau: niveauDe(score) }
}

// ─── Priorisation pour le conseiller ─────────────────────────────────────────

const RANG_RDV = 1
const RANG_SIGNE = 2
const RANG_EN_COURS = 3
const RANG_AUTRE = 4

export const FENETRE_SIGNE_JOURS = 30

// JJ/MM à partir d'un jour ISO ou d'un instant (ramené au jour de Paris).
export const dateCourte = (valeur) => {
  const jour = jourDe(valeur)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return ''
  return `${jour.slice(8, 10)}/${jour.slice(5, 7)}`
}

const jourMoins = (today, jours) => {
  const d = new Date(today + 'T00:00:00')
  d.setDate(d.getDate() - jours)
  return jourISO(d)
}

const estDuConseiller = (client, code) =>
  client?.advisor_code === code || client?.co_advisor_code === code

// Le rang d'une fiche et la raison qui va avec, à partir de ses dossiers.
//   1  un rendez vous à venir (statut Prévu, date aujourd'hui ou après)
//   2  un dossier signé dans les trente derniers jours
//   3  un dossier en cours
//   4  le reste
function rangDe(dossiers, today) {
  const depuis = jourMoins(today, FENETRE_SIGNE_JOURS)
  // Seul un rendez vous daté, aujourd'hui ou après, tient le premier rang.
  // Un « Prévu » sans date restait en tête indéfiniment (cas présent en
  // base) : il retombe au rang des dossiers en cours, avec sa raison.
  const rdv = dossiers
    .filter((d) => d.status === 'Prévu')
    .map((d) => jourDe(d.date_expected))
    .filter((j) => j && j >= today)
    .sort((a, b) => a.localeCompare(b))
  if (rdv.length) {
    const j = rdv[0]
    return { rang: RANG_RDV, cle: j, raison: `rendez vous le ${dateCourte(j)}` }
  }
  const signes = dossiers
    .filter((d) => d.status === 'Signé')
    .map((d) => jourDe(d.date_signed))
    .filter((j) => j && j >= depuis && j <= today)
    .sort((a, b) => b.localeCompare(a))
  if (signes.length) {
    return { rang: RANG_SIGNE, cle: signes[0], raison: `signé le ${dateCourte(signes[0])}` }
  }
  if (dossiers.some((d) => d.status === 'En cours')) {
    return { rang: RANG_EN_COURS, cle: '', raison: 'dossier en cours' }
  }
  if (dossiers.some((d) => d.status === 'Prévu' && !jourDe(d.date_expected))) {
    return { rang: RANG_EN_COURS, cle: '', raison: 'rendez vous à dater' }
  }
  return { rang: RANG_AUTRE, cle: '', raison: 'aucun dossier en cours' }
}

/**
 * Les fiches d'un conseiller qui ne sont pas complètes, dans l'ordre où il a
 * intérêt à les compléter : celles d'un rendez vous à venir d'abord (il va
 * voir la personne, c'est le moment de demander), puis celles d'une signature
 * récente (le dossier est frais, les pièces sont sur la table), puis celles
 * d'un dossier en cours, puis les autres, les plus vides en premier.
 *
 * Un dossier se rattache à sa fiche par client_id. Les dossiers annulés ne
 * comptent pas. Le co conseiller voit la fiche comme le principal : il en
 * partage la responsabilité, même règle que la file du matin.
 *
 * @param {Array} clients
 * @param {Array} deals
 * @param {Object} opts { advisorCode, today (ISO, défaut aujourd'hui), limite (défaut 3) }
 * @returns {Array} fiches enrichies de score, niveau, manquants, rang, raison
 */
export function prioriserFichesACompleter(clients, deals, { advisorCode, today = jourISO(), limite = 3 } = {}) {
  if (!advisorCode) return []
  const fiches = (Array.isArray(clients) ? clients : []).filter((c) => c && c.id && estDuConseiller(c, advisorCode))
  if (!fiches.length) return []

  const dossiersParClient = new Map()
  for (const d of (Array.isArray(deals) ? deals : [])) {
    if (!d || !d.client_id || d.status === 'Annulé') continue
    const liste = dossiersParClient.get(d.client_id) || []
    liste.push(d)
    dossiersParClient.set(d.client_id, liste)
  }

  const enrichies = []
  for (const c of fiches) {
    const { score, manquants, niveau } = scoreCompletude(c)
    if (score >= 100) continue
    const { rang, cle, raison } = rangDe(dossiersParClient.get(c.id) || [], today)
    enrichies.push({ ...c, score, manquants, niveau, rang, raison, _cle: cle })
  }

  enrichies.sort((a, b) => {
    if (a.rang !== b.rang) return a.rang - b.rang
    // Rang 1 : le rendez vous le plus proche d'abord. Rang 2 : la signature
    // la plus récente d'abord. Les deux clés sont des jours ISO, le sens
    // diffère.
    if (a.rang === RANG_RDV && a._cle !== b._cle) return a._cle.localeCompare(b._cle)
    if (a.rang === RANG_SIGNE && a._cle !== b._cle) return b._cle.localeCompare(a._cle)
    if (a.score !== b.score) return a.score - b.score
    return String(a.nom || '').localeCompare(String(b.nom || ''), 'fr')
  })

  const n = Number.isFinite(limite) ? Math.max(0, limite) : enrichies.length
  return enrichies.slice(0, n).map(({ _cle, ...reste }) => reste)
}

// ─── Vue direction ───────────────────────────────────────────────────────────

/**
 * Complétude par conseiller. Un client compte pour son conseiller principal
 * uniquement, sinon une fiche partagée serait comptée deux fois et le total
 * ne collerait plus au nombre de fiches.
 *
 * @returns {Array<{advisorCode: string, fiches: number, scoreMoyen: number, completes: number, manquantsParChamp: Object}>}
 *   trié par score moyen décroissant, puis par nombre de fiches, puis par code
 */
export function completudeParConseiller(clients) {
  const parCode = new Map()
  for (const c of (Array.isArray(clients) ? clients : [])) {
    if (!c) continue
    const code = String(c.advisor_code || '').trim() || 'Sans code'
    const ligne = parCode.get(code) || { advisorCode: code, fiches: 0, _somme: 0, completes: 0, manquantsParChamp: {} }
    const { score, manquants } = scoreCompletude(c)
    ligne.fiches += 1
    ligne._somme += score
    if (score >= 100) ligne.completes += 1
    for (const m of manquants) ligne.manquantsParChamp[m.cle] = (ligne.manquantsParChamp[m.cle] || 0) + 1
    parCode.set(code, ligne)
  }
  // sommeScores reste disponible pour un score cabinet exact, calcule sur les
  // scores bruts et non sur des moyennes deja arrondies.
  return [...parCode.values()]
    .map(({ _somme, ...l }) => ({ ...l, sommeScores: _somme, scoreMoyen: l.fiches ? Math.round(_somme / l.fiches) : 0 }))
    .sort((a, b) => (b.scoreMoyen - a.scoreMoyen)
      || (b.fiches - a.fiches)
      || a.advisorCode.localeCompare(b.advisorCode))
}

/**
 * Les champs les plus souvent manquants d'une ligne de completudeParConseiller,
 * du plus fréquent au moins fréquent, avec leur libellé.
 */
export function champsLesPlusManquants(manquantsParChamp, limite = 3) {
  return Object.entries(manquantsParChamp || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limite)
    .map(([cle, nombre]) => ({ cle, libelle: libelleChamp(cle), nombre }))
}

// ─── Pour l'écran Campagnes ──────────────────────────────────────────────────

/**
 * Combien de fiches sont évaluables pour un jeu de champs (tous renseignés),
 * et combien ne le sont pas, champ manquant par champ manquant. Une fiche à
 * qui il manque deux champs compte une fois dans chacun.
 *
 * @param {Array} clients
 * @param {Array<string>} champsRequis clés de colonnes (date_naissance accepte l'âge)
 * @returns {{total: number, evaluables: number, nonEvaluables: number, manquantsParChamp: Object}}
 */
export function champsPourCampagne(clients, champsRequis) {
  const requis = (Array.isArray(champsRequis) ? champsRequis : []).filter(Boolean)
  const manquantsParChamp = Object.fromEntries(requis.map((cle) => [cle, 0]))
  let total = 0
  let evaluables = 0
  for (const c of (Array.isArray(clients) ? clients : [])) {
    if (!c) continue
    total += 1
    let complete = true
    for (const cle of requis) {
      if (champRempliPour(c, cle)) continue
      complete = false
      manquantsParChamp[cle] += 1
    }
    if (complete) evaluables += 1
  }
  return { total, evaluables, nonEvaluables: total - evaluables, manquantsParChamp }
}
