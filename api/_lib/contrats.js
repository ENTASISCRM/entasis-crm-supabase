// api/_lib/contrats.js
// Quel contrat compte pour un mois donne ? Reponse par les dates, plus par un
// drapeau a basculer a la main.
//
// Pourquoi : le 1er septembre 2026, le renouvellement d alternance de Quentin
// n a pas ete active parce que la tache programmee qui devait basculer le
// drapeau `actif` est morte en silence. Son ancien contrat, termine la veille,
// restait actif et le nouveau, commence le jour meme, restait inactif. Chaque
// contrat porte pourtant une date de debut et de fin : c est elles qui font
// foi ici.
//
// Regles, dans l ordre :
//   1. un contrat est « en poste » a une date s il a commence a cette date
//      (ou avant) et s il n est pas termine avant cette date ;
//   2. pour un profil qui a plusieurs contrats, on retient celui qui est en
//      poste a la date de reference ; s il y en a plusieurs (chevauchement de
//      saisie), on prefere celui marque actif, puis le plus recent ;
//   3. si aucun n est en poste a la date de reference (contrat termine dans
//      le mois, suite pas encore saisie), on retombe sur le contrat marque
//      actif, a condition qu il ait ete en poste au moins un jour du mois :
//      rien ne disparait le mois du depart, mais un contrat termine ne
//      compte plus les mois suivants, et une embauche future ne compte pas
//      les mois precedents. Sans cette borne, la vue direction additionnait
//      en septembre les salaires de quatre contrats termines en juillet et
//      en aout (audit du 2 septembre).
//
// Le drapeau `actif` garde donc deux roles : departager deux contrats qui se
// chevauchent, et servir de filet dans le mois du depart. Il n exclut PAS a
// lui seul un contrat en poste : le renouvellement de Quentin, saisi inactif
// et jamais bascule, doit prendre le relais a sa date. Pour ecarter une
// ligne (test, contrat annule), on lui donne une date de fin.

// Une borne de date, ramenee a minuit local. Accepte une chaine ISO (avec ou
// sans heure) et un objet Date ; une valeur illisible vaut « pas de borne »,
// comme une valeur absente : on ne fait jamais disparaitre un contrat sur une
// date mal saisie.
const jour = (valeur) => {
  if (!valeur) return null
  if (valeur instanceof Date) {
    if (Number.isNaN(valeur.getTime())) return null
    const d = new Date(valeur)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const d = new Date(String(valeur).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

/** Debut de journee de la date de reference (heure locale du serveur). */
const reference = (date) => {
  const d = date instanceof Date ? new Date(date) : new Date(date || Date.now())
  d.setHours(0, 0, 0, 0)
  return d
}

/** Vrai si le contrat est en poste a la date donnee (regle 1). */
export function estEnPoste(contrat, date = new Date()) {
  if (!contrat) return false
  const ref = reference(date)
  const debut = jour(contrat.date_debut)
  const fin = jour(contrat.date_fin)
  if (debut && debut > ref) return false
  if (fin && fin < ref) return false
  return true
}

/** Vrai si le contrat est en poste a au moins un jour du mois de la date. */
export function estEnPosteCeMois(contrat, date = new Date()) {
  if (!contrat) return false
  const ref = reference(date)
  const moisDebut = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const moisFin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
  const debut = jour(contrat.date_debut)
  const fin = jour(contrat.date_fin)
  if (debut && debut > moisFin) return false
  if (fin && fin < moisDebut) return false
  return true
}

/**
 * Le contrat de reference d une personne pour une date (regles 2 et 3).
 * `contrats` : toutes les lignes de cette personne, actives ou non.
 * Renvoie null si la liste est vide.
 */
export function contratDeReference(contrats, date = new Date()) {
  const liste = (contrats || []).filter(Boolean)
  if (!liste.length) return null
  const parDebutDecroissant = (a, b) => String(b.date_debut || '').localeCompare(String(a.date_debut || ''))
  const enPoste = liste.filter(c => estEnPoste(c, date))
  if (enPoste.length) {
    const actifs = enPoste.filter(c => c.actif)
    return (actifs.length ? actifs : enPoste).sort(parDebutDecroissant)[0]
  }
  // Filet (regle 3) : le contrat actif, mais seulement s il a ete en poste
  // au moins un jour du mois de reference.
  const actifs = liste.filter(c => c.actif && estEnPosteCeMois(c, date))
  return actifs.length ? actifs.sort(parDebutDecroissant)[0] : null
}

/**
 * Pour la vue direction : un contrat de reference par personne, a partir de
 * toutes les lignes du cabinet. Les lignes sans profil rattache gardent
 * l ancienne regle (actif et en poste ce mois), car sans profil il n y a pas
 * de « personne » a laquelle rattacher plusieurs contrats.
 */
export function contratsDeReferenceParPersonne(contrats, date = new Date()) {
  const parProfil = new Map()
  const sansProfil = []
  for (const c of contrats || []) {
    if (!c) continue
    if (!c.profile_id) { sansProfil.push(c); continue }
    if (!parProfil.has(c.profile_id)) parProfil.set(c.profile_id, [])
    parProfil.get(c.profile_id).push(c)
  }
  const retenus = []
  for (const liste of parProfil.values()) {
    const c = contratDeReference(liste, date)
    if (c) retenus.push(c)
  }
  for (const c of sansProfil) {
    if (c.actif && estEnPosteCeMois(c, date)) retenus.push(c)
  }
  return retenus
}
