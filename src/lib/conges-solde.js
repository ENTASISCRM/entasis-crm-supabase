// ═══════════════════════════════════════════════════════════════════════════
// Solde de congés payés, partagé entre Pilotage RH (direction) et Smart RH
// (chacun voit son solde).
//
// Règles (corrigées par Louis le 24/07/2026) :
// - Acquisition : 2,5 jours par MOIS COMPLET travaillé DEPUIS LE DÉBUT DU
//   CONTRAT (les alternants des rentrées 2024 et 2025 comptent depuis leur
//   date de début, pas depuis une date arbitraire).
// - Seuls CDI, CDD et alternants acquièrent des congés payés (stagiaires
//   sont en gratification, mandataires sont indépendants).
// - Déduction : demandes VALIDÉES de type « Congé payé » (toutes, y compris
//   futures : un congé validé est engagé). Décompte (règle Louis 24/07) :
//   lundi à jeudi = 1 jour, VENDREDI = 2 JOURS (il emporte le samedi,
//   convention jours ouvrables : une semaine complète = 6 jours, et
//   30 jours par an = 5 semaines), samedi et dimanche = 0, demi journée
//   = moins 0,5. S y ajoute conseiller_contrats.conges_deja_pris : les
//   jours posés AVANT la mise en place de Smart RH, saisis par la direction.
// - Le solde peut être négatif (congés pris par anticipation) : affiché,
//   pas bloquant, c est la direction qui tranche à la validation.
// ═══════════════════════════════════════════════════════════════════════════

export const JOURS_PAR_MOIS = 2.5
export const TYPES_AVEC_CP = ['CDI', 'CDD', 'ALTERNANT']

// Parse YYYY-MM-DD en minuit LOCAL (new Date('YYYY-MM-DD') serait minuit UTC)
const dl = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ── Jours fériés français ────────────────────────────────────────────────
// Dimanche de Pâques (algorithme de Butcher), base des fériés mobiles.
function paques(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31)
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, mois - 1, jour)
}
const plusJours = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
const memeJour = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// Vrai si la date est un jour férié français (fixes + Pâques, Ascension,
// Pentecôte). Un férié n est jamais décompté ni compté travaillé.
export function estFerie(d) {
  const cle = `${d.getMonth() + 1}-${d.getDate()}`
  if (['1-1', '5-1', '5-8', '7-14', '8-15', '11-1', '11-11', '12-25'].includes(cle)) return true
  const p = paques(d.getFullYear())
  return memeJour(d, plusJours(p, 1)) || memeJour(d, plusJours(p, 39)) || memeJour(d, plusJours(p, 50))
}

// ── Période de référence des congés payés ────────────────────────────────
// Du 1er juin au 31 mai (règle légale française). Le solde affiché =
// report de la période précédente + acquis de la période, moins pris de
// la période. Par défaut le report est automatique et intégral (rien ne
// se perd) ; la direction peut le figer via conseiller_contrats.
// conges_report (saisi au 1er juin pour plafonner ou ajuster).
//
// conges_report_au déplace ce point de départ à une date quelconque, celle
// d un bulletin de salaire. Le bulletin arrête le solde au 31 août et a déjà
// imputé les congés d été ; sans cette date, le CRM les redécomptait et il
// fallait gonfler le report pour compenser, ce qui affichait un chiffre qui
// ne correspondait à aucun document. Avec elle, on saisit le solde du
// bulletin tel quel et seuls les congés postérieurs sont décomptés.
export function periodeReference(aujourd = new Date()) {
  const y = aujourd.getMonth() >= 5 ? aujourd.getFullYear() : aujourd.getFullYear() - 1
  return {
    debut: new Date(y, 5, 1),
    fin: new Date(y + 1, 4, 31, 23, 59, 59),
    debutIso: `${y}-06-01`,
    finIso: `${y + 1}-05-31`,
  }
}

// Nombre de mois COMPLETS écoulés entre deux dates
export function moisComplets(debut, fin) {
  if (fin <= debut) return 0
  let mois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth())
  if (fin.getDate() < debut.getDate()) mois -= 1
  return Math.max(0, mois)
}

// Jours décomptés entre deux dates INCLUSES : lundi à jeudi = 1 jour,
// vendredi = 2 jours (il emporte le samedi), samedi, dimanche et jours
// FÉRIÉS = 0.
export function joursOuvres(debutStr, finStr) {
  const debut = dl(debutStr)
  const fin = dl(finStr || debutStr)
  if (fin < debut) return 0
  let n = 0
  const d = new Date(debut)
  while (d <= fin) {
    const j = d.getDay()
    if (j >= 1 && j <= 5 && !estFerie(d)) n += (j === 5 ? 2 : 1)
    d.setDate(d.getDate() + 1)
  }
  return n
}

// Jours ouvrés SIMPLES (lundi à vendredi = 1 chacun, fériés exclus) : sert
// aux feuilles de temps (jours travaillés). À ne pas confondre avec
// joursOuvres ci dessus qui applique la règle de DÉCOMPTE (vendredi = 2).
export function joursOuvresSimples(debutStr, finStr) {
  const debut = dl(debutStr)
  const fin = dl(finStr || debutStr)
  if (fin < debut) return 0
  let n = 0
  const d = new Date(debut)
  while (d <= fin) {
    const j = d.getDay()
    if (j >= 1 && j <= 5 && !estFerie(d)) n += 1
    d.setDate(d.getDate() + 1)
  }
  return n
}

// Jours décomptés pour UNE demande (jours ouvrés, demi journée = 0,5)
export function joursDemande(conge) {
  const brut = joursOuvres(conge.date_debut, conge.date_fin)
  if (brut === 0) return 0
  return conge.demi_journee ? Math.max(0.5, brut - 0.5) : brut
}

// Jours OUVRÉS SIMPLES pour une demande (École/CFA, maladie, sans solde…) :
// la règle du vendredi double ne concerne que les congés payés.
export function joursDemandeSimples(conge) {
  const brut = joursOuvresSimples(conge.date_debut, conge.date_fin || conge.date_debut)
  if (brut === 0) return 0
  return conge.demi_journee ? Math.max(0.5, brut - 0.5) : brut
}

// Jours acquis par un contrat à aujourd hui (null si le type n acquiert pas)
export function joursAcquis(contrat, aujourd = new Date()) {
  if (!contrat || !TYPES_AVEC_CP.includes(contrat.type_contrat)) return null
  if (!contrat.date_debut) return null
  const depuis = dl(contrat.date_debut)
  let jusqu = aujourd
  if (contrat.date_fin) {
    const fin = dl(contrat.date_fin)
    if (fin < jusqu) jusqu = fin
  }
  return moisComplets(depuis, jusqu) * JOURS_PAR_MOIS
}

// Jours pris via Smart RH : toutes les demandes validées de type Congé payé
export function joursPris(congesDeLaPersonne) {
  return (congesDeLaPersonne || [])
    .filter((c) => c.statut === 'valide' && c.type === 'Congé payé')
    .reduce((s, c) => s + joursDemande(c), 0)
}

// Solde complet d une personne, ventilé par PÉRIODE DE RÉFÉRENCE (1er juin
// au 31 mai). Renvoie null si le type de contrat n acquiert pas de CP.
//   - report : solde au 31 mai précédent (automatique et intégral par
//     défaut, figé par contrat.conges_report si la direction l a saisi)
//   - acquisPeriode / prisPeriode : sur la période en cours
//   - restant = report + acquisPeriode - prisPeriode
//   - acquis / pris : cumuls depuis le début du contrat (compatibilité)
export function soldeConges(contrat, congesDeLaPersonne, aujourd = new Date()) {
  const acquis = joursAcquis(contrat, aujourd)
  if (acquis === null) return null
  const dejaPris = Number(contrat?.conges_deja_pris || 0)

  // Solde arrêté à une date (bulletin de salaire) : on part de ce point,
  // on ajoute ce qui a été acquis depuis, on retire ce qui a été pris
  // depuis. Rien d antérieur n est recompté, la paie l a déjà fait.
  const arreteAu = String(contrat?.conges_report_au || '').slice(0, 10)
  if (arreteAu && contrat?.conges_report != null && contrat.conges_report !== '') {
    const report = Number(contrat.conges_report)
    const acquisAvant = joursAcquis(contrat, dl(arreteAu)) || 0
    const acquisPeriode = acquis - acquisAvant
    const cpApres = (congesDeLaPersonne || []).filter((c) =>
      c.statut === 'valide' && c.type === 'Congé payé' && String(c.date_debut) > arreteAu)
    const prisPeriode = cpApres.reduce((s, c) => s + joursDemande(c), 0)
    return {
      acquis, pris: prisPeriode, dejaPris,
      report, acquisPeriode, prisPeriode,
      arreteAu,
      periode: { debutIso: arreteAu, finIso: periodeReference(aujourd).finIso },
      restant: report + acquisPeriode - prisPeriode,
    }
  }

  const per = periodeReference(aujourd)

  // Acquis ventilé : avant la période (au 31 mai) et pendant. La somme des
  // deux vaut toujours l acquis total, même si l anniversaire mensuel du
  // contrat ne tombe pas un 1er du mois.
  const finPrecedente = new Date(per.debut.getFullYear(), per.debut.getMonth(), 0, 23, 59, 59)
  const acquisAvant = joursAcquis(contrat, finPrecedente) || 0
  const acquisPeriode = acquis - acquisAvant

  const cp = (congesDeLaPersonne || []).filter((c) => c.statut === 'valide' && c.type === 'Congé payé')
  const prisPeriode = cp
    .filter((c) => String(c.date_debut) >= per.debutIso)
    .reduce((s, c) => s + joursDemande(c), 0)
  // L historique saisi a la main (avant Smart RH) est par nature anterieur
  // a la periode en cours.
  const prisAvant = cp
    .filter((c) => String(c.date_debut) < per.debutIso)
    .reduce((s, c) => s + joursDemande(c), 0) + dejaPris

  const report = contrat?.conges_report != null && contrat.conges_report !== ''
    ? Number(contrat.conges_report)
    : acquisAvant - prisAvant

  const pris = prisPeriode + prisAvant
  return {
    acquis, pris, dejaPris,
    report, acquisPeriode, prisPeriode, periode: per,
    restant: report + acquisPeriode - prisPeriode,
  }
}

// Projection du solde AU RETOUR de la dernière absence CP validée (calculé
// au dernier jour d absence : l acquisition des mois d ici là est créditée,
// tous les congés validés sont déduits). Renvoie null si aucune absence
// validée ne se termine après aujourd hui, ou si le solde ne change pas.
export function soldeAuRetour(contrat, congesDeLaPersonne, aujourd = new Date()) {
  const isoAujourd = `${aujourd.getFullYear()}-${String(aujourd.getMonth() + 1).padStart(2, '0')}-${String(aujourd.getDate()).padStart(2, '0')}`
  const futures = (congesDeLaPersonne || []).filter((c) =>
    c.statut === 'valide' && c.type === 'Congé payé' && String(c.date_fin || c.date_debut) > isoAujourd)
  if (futures.length === 0) return null
  const derniere = futures.map((c) => String(c.date_fin || c.date_debut)).sort().pop()
  const d = dl(derniere)
  const s = soldeConges(contrat, congesDeLaPersonne, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59))
  if (!s) return null
  return { date: derniere, restant: s.restant }
}

// Formatage : 2.5 -> « 2,5 j », 3 -> « 3 j »
export const fmtJours = (n) =>
  `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`
