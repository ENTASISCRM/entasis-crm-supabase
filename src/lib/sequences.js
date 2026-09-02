// ═══════════════════════════════════════════════════════════════════════════
// SÉQUENCES DE RELANCE, la mécanique
//
// Item B2 du plan d'amélioration. Constat en base au 1er septembre : 38
// dossiers « En cours », aucun avec une prochaine action. La file du matin
// tourne à vide. Ici, un gabarit (config/sequencesRelance.js) pose une
// chaîne d'étapes datées sur le dossier, et chaque « Fait » arme la suivante.
//
// Tout est pur et sans réseau : la lib rend des PATCHS que l'appelant écrit
// lui même (quickPatchDeal dans la file du matin, set() dans la modale).
// Elle se teste donc sans navigateur, comme ma-journee.js.
//
// Colonnes de deals concernées : next_action, next_action_date (existantes),
// sequence_key (text, clé du gabarit) et sequence_etape (integer, numéro de
// l'étape en cours, à partir de 1). Toutes nullables : un dossier sans
// séquence a les deux dernières à null.
//
// Dates : ISO AAAA MM JJ sans fuseau, comme dateReport de ma-journee.js.
// ═══════════════════════════════════════════════════════════════════════════

import { jourISO } from './ma-journee'
import { SEQUENCES } from '../config/sequencesRelance'

// Le patch qui sort un dossier de sa séquence, et vide la prochaine action
// avec elle. Une copie neuve à chaque appel : les appelants font parfois
// des Object.keys dessus ou le fusionnent dans un état React.
const PATCH_CLOTURE = Object.freeze({
  next_action: null,
  next_action_date: null,
  sequence_key: null,
  sequence_etape: null,
})

/**
 * Ajoute n jours à une date ISO. Même écriture que dateReport : on passe
 * par un Date local à minuit, setDate franchit les fins de mois et d'année.
 */
export function ajouterJours(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00')
  d.setDate(d.getDate() + Number(n || 0))
  return jourISO(d)
}

/** Le gabarit d'une clé, ou null si la clé est vide ou inconnue. */
export function gabaritDe(cle) {
  return (cle && Object.prototype.hasOwnProperty.call(SEQUENCES, cle) && SEQUENCES[cle]) || null
}

/**
 * Patch de démarrage d'une séquence : l'étape 1, datée depuis aujourd'hui.
 *
 * Gabarit inconnu : renvoie null plutôt que de lever. La clé vient d'un
 * select alimenté par la config, un écart ne peut être qu'un bug d'écran ;
 * l'appelant n'a alors rien à écrire, et rien n'est écrit.
 *
 * @param {string} cle       clé du gabarit (voir SEQUENCES)
 * @param {string} [today]   date ISO, défaut aujourd'hui
 * @returns {{sequence_key:string, sequence_etape:number, next_action:string, next_action_date:string}|null}
 */
export function demarrerSequence(cle, today = jourISO()) {
  const g = gabaritDe(cle)
  if (!g || !g.etapes.length) return null
  const premiere = g.etapes[0]
  return {
    sequence_key: g.cle,
    sequence_etape: 1,
    next_action: premiere.action,
    next_action_date: ajouterJours(today, premiere.delaiJours),
  }
}

/** Patch de clôture : plus de séquence, plus de prochaine action. */
export function arreterSequence() {
  return { ...PATCH_CLOTURE }
}

// Numéro d'étape en cours, ou 0 si le dossier n'en porte pas d'exploitable.
// Un dossier qui porte un gabarit mais aucune étape valable (sauvegarde
// partielle, ligne posée à la main) n'a pas de séquence en cours : Fait la
// clôture proprement, et le toast le dit (« arrêtée », pas « terminée »).
const etapeCourante = (deal) => {
  const n = Number(deal?.sequence_etape)
  return Number.isInteger(n) && n > 0 ? n : 0
}

/**
 * Patch à écrire quand le conseiller marque l'action en cours comme faite.
 *
 * S'il reste une étape : la suivante, datée depuis AUJOURD'HUI et non depuis
 * l'échéance de l'étape faite. Un appel de suivi fait avec trois jours de
 * retard ne doit pas armer l'email de relance dans le passé (même logique
 * que dateReport pour les reports).
 *
 * Sinon (dernière étape, dossier sans séquence, clé inconnue ou numéro
 * d'étape aberrant) : le patch de clôture. Une clé inconnue est traitée
 * comme une absence de séquence pour que « Fait » ne laisse jamais un
 * dossier coincé avec une séquence fantôme.
 */
export function patchApresFait(deal, today = jourISO()) {
  const g = gabaritDe(deal?.sequence_key)
  const n = etapeCourante(deal)
  if (!g || n === 0 || n >= g.etapes.length) return arreterSequence()
  const suivante = g.etapes[n]
  return {
    sequence_etape: n + 1,
    next_action: suivante.action,
    next_action_date: ajouterJours(today, suivante.delaiJours),
  }
}

/**
 * Les étapes du gabarit du dossier avec leur état, pour l'affichage.
 *
 * Chaque entrée : { numero, delaiJours, action, etat, date } avec etat parmi
 *   'faite'    : étape déjà passée (date null, l'historique n'est pas gardé)
 *   'en_cours' : l'étape armée, date = la next_action_date posée
 *   'a_venir'  : étape future, date = prévision
 *
 * La prévision repart de la date de l'étape en cours, ou d'aujourd'hui si
 * cette date est déjà dépassée : une étape en retard sera faite au plus tôt
 * aujourd'hui, projeter depuis son échéance passée afficherait des dates
 * déjà écoulées.
 *
 * Dossier sans séquence ou clé inconnue : liste vide.
 */
export function etapesDe(deal, today = jourISO()) {
  const g = gabaritDe(deal?.sequence_key)
  if (!g) return []
  const courante = etapeCourante(deal)
  const dateCourante = deal?.next_action_date ? String(deal.next_action_date).slice(0, 10) : null
  let curseur = dateCourante && dateCourante > today ? dateCourante : today
  return g.etapes.map((e, i) => {
    const numero = i + 1
    const base = { numero, delaiJours: e.delaiJours, action: e.action }
    if (numero < courante) return { ...base, etat: 'faite', date: null }
    if (numero === courante) return { ...base, etat: 'en_cours', date: dateCourante }
    curseur = ajouterJours(curseur, e.delaiJours)
    return { ...base, etat: 'a_venir', date: curseur }
  })
}

// Date courte à la française pour les toasts : « 12/09 ».
const dateCourte = (iso) => {
  const [, m, j] = String(iso).slice(0, 10).split('-')
  return `${j}/${m}`
}

/**
 * Le message de toast qui accompagne un patch rendu par patchApresFait.
 *
 *   « Étape 2 sur 3 armée pour le 12/09 »  si une étape suivante s'arme
 *   « Séquence terminée »                   si la dernière étape vient d'être faite
 *   null                                    si le dossier n'avait pas de séquence
 *
 * L'appelant garde son message habituel (« Action terminée ») quand null.
 */
export function messageApresFait(deal, patch) {
  const g = gabaritDe(deal?.sequence_key)
  if (!g) return null
  if (patch?.sequence_etape) {
    return `Étape ${patch.sequence_etape} sur ${g.etapes.length} armée pour le ${dateCourte(patch.next_action_date)}`
  }
  const n = etapeCourante(deal)
  return n > 0 && n <= g.etapes.length ? 'Séquence terminée' : 'Séquence arrêtée, étape inconnue'
}
