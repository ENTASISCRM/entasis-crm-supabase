// src/lib/ecriture-verifiee.js
//
// Une ecriture Supabase filtree par la RLS ne renvoie PAS d erreur : PostgREST
// repond 204 avec zero ligne touchee. Sans `.select()`, le code lit
// `{ error: null }`, affiche « enregistre » et l utilisateur retrouve son
// travail efface au rechargement suivant. C est le scenario « je l ai saisi,
// il a disparu » : le plus couteux, parce qu il pousse a ressaisir ailleurs.
//
// Regle du CRM depuis le 25/08/2026 : toute ecriture visant une ligne
// identifiee se termine par `.select('id')`, et son resultat passe par
// `verifierEcriture`. Une ligne que la base a refusee doit se voir.

/**
 * Verifie qu une ecriture a bien touche au moins une ligne.
 * @param {{data: any, error: any}} reponse resultat d un update/delete avec .select()
 * @param {string} quoi ce que l utilisateur croyait faire, pour le message
 * @param {string} [pourquoi] cause probable du refus, en francais
 * @returns {Array} les lignes effectivement ecrites
 */
export function verifierEcriture({ data, error }, quoi, pourquoi) {
  if (error) throw error
  const lignes = Array.isArray(data) ? data : (data ? [data] : [])
  if (lignes.length === 0) {
    throw new Error(
      `${quoi} : la base a refusé la modification.`
      + (pourquoi ? ` ${pourquoi}` : ' Rechargez la page, puis réessayez.'),
    )
  }
  return lignes
}

/**
 * Variante pour les ecritures en lot : signale une reussite partielle plutot
 * que de laisser croire que tout est passe.
 */
export function verifierEcritureLot({ data, error }, attendu, quoi) {
  if (error) throw error
  const lignes = Array.isArray(data) ? data : []
  if (lignes.length < attendu) {
    throw new Error(
      `${quoi} : ${lignes.length} sur ${attendu} traité${lignes.length > 1 ? 's' : ''}.`
      + ' Les autres appartiennent à quelqu un d autre ou ont changé entre temps.',
    )
  }
  return lignes
}

// Motifs de refus les plus frequents, pour ne pas les reecrire partout.
export const MOTIF_PROPRIETE = 'Ce dossier appartient à un autre conseiller.'
export const MOTIF_DROITS = 'Vos droits ne permettent pas cette action.'
export const MOTIF_DISPARU = 'La ligne a peut être été supprimée entre temps.'
