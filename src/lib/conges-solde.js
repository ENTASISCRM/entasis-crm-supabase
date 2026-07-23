// ═══════════════════════════════════════════════════════════════════════════
// Solde de congés payés, partagé entre Pilotage RH (direction) et Smart RH
// (chacun voit son solde).
//
// Règles (validées par Louis le 23/07/2026) :
// - Acquisition : 2,5 jours par MOIS COMPLET travaillé.
// - Le compteur démarre au 1er septembre 2026 (rentrée des nouveaux
//   contrats) : on n essaie pas de reconstituer l historique d avant.
// - Seuls CDI, CDD et alternants acquièrent des congés payés (stagiaires
//   sont en gratification, mandataires sont indépendants).
// - Déduction : demandes VALIDÉES de type « Congé payé » uniquement,
//   comptées en jours ouvrés (lundi à vendredi), demi journée = 0,5.
// - Le solde peut être négatif (congés pris par anticipation) : affiché,
//   pas bloquant, c est la direction qui tranche à la validation.
// ═══════════════════════════════════════════════════════════════════════════

export const DEBUT_COMPTEUR = '2026-09-01'
export const JOURS_PAR_MOIS = 2.5
export const TYPES_AVEC_CP = ['CDI', 'CDD', 'ALTERNANT']

// Parse YYYY-MM-DD en minuit LOCAL (new Date('YYYY-MM-DD') serait minuit UTC)
const dl = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Nombre de mois COMPLETS écoulés entre deux dates
export function moisComplets(debut, fin) {
  if (fin <= debut) return 0
  let mois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth())
  if (fin.getDate() < debut.getDate()) mois -= 1
  return Math.max(0, mois)
}

// Jours ouvrés (lundi à vendredi) entre deux dates INCLUSES
export function joursOuvres(debutStr, finStr) {
  const debut = dl(debutStr)
  const fin = dl(finStr || debutStr)
  if (fin < debut) return 0
  let n = 0
  const d = new Date(debut)
  while (d <= fin) {
    const j = d.getDay()
    if (j !== 0 && j !== 6) n++
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

// Jours acquis par un contrat à aujourd hui (null si le type n acquiert pas)
export function joursAcquis(contrat, aujourd = new Date()) {
  if (!contrat || !TYPES_AVEC_CP.includes(contrat.type_contrat)) return null
  if (!contrat.date_debut) return null
  const debutContrat = dl(contrat.date_debut)
  const epoch = dl(DEBUT_COMPTEUR)
  const depuis = debutContrat > epoch ? debutContrat : epoch
  let jusqu = aujourd
  if (contrat.date_fin) {
    const fin = dl(contrat.date_fin)
    if (fin < jusqu) jusqu = fin
  }
  return moisComplets(depuis, jusqu) * JOURS_PAR_MOIS
}

// Jours pris : demandes validées de type Congé payé depuis le début du compteur
export function joursPris(congesDeLaPersonne) {
  return (congesDeLaPersonne || [])
    .filter((c) => c.statut === 'valide' && c.type === 'Congé payé' && String(c.date_debut) >= DEBUT_COMPTEUR)
    .reduce((s, c) => s + joursDemande(c), 0)
}

// Solde complet d une personne : { acquis, pris, restant } ou null si non concernée
export function soldeConges(contrat, congesDeLaPersonne, aujourd = new Date()) {
  const acquis = joursAcquis(contrat, aujourd)
  if (acquis === null) return null
  const pris = joursPris(congesDeLaPersonne)
  return { acquis, pris, restant: acquis - pris }
}

// Formatage : 2.5 -> « 2,5 j », 3 -> « 3 j »
export const fmtJours = (n) =>
  `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`
