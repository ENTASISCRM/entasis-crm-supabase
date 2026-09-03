// ═══════════════════════════════════════════════════════════════════════════
// LA FICHE CLIENT VUE DEPUIS LA MODALE DOSSIER
//
// La modale dossier porte six champs de la fiche client (email, téléphone,
// statut, profession, revenus, patrimoine), pour que le verrou de signature
// puisse les exiger et que le conseiller puisse les compléter sans quitter le
// dossier. À l'enregistrement, ces champs repartent vers la fiche.
//
// Deux pièges, établis par la revue du 3 septembre :
//   • la jointure clients chargée à la connexion n'est jamais rafraîchie :
//     préremplir depuis elle, puis réécrire la fiche, remettait de vieilles
//     valeurs sur une fiche corrigée dans la journée ;
//   • réécrire les six champs à chaque Enregistrer retamponnait updated_at
//     et maj_par de la fiche sans saisie réelle, ce qui faussait « Signés,
//     fiche à finir » et nommait la mauvaise personne.
//
// D'où ce module : on lit la fiche à l'ouverture (instantané), et on ne
// renvoie vers la fiche que ce qui diffère de cet instantané. Pure, testée.
// ═══════════════════════════════════════════════════════════════════════════

// Champ de la fiche → clé portée par l'objet dossier dans la modale.
export const CHAMPS_FICHE_DOSSIER = Object.freeze([
  ['email', 'client_email'],
  ['telephone', 'client_phone'],
  ['statut_pro', 'client_statut_pro'],
  ['profession', 'client_profession'],
  ['revenus_annuels', 'client_revenus'],
  ['patrimoine_estime', 'client_patrimoine'],
])

const texte = (v) => (v == null ? '' : String(v).trim())

/**
 * Instantané de la fiche telle que lue à l'ouverture, dans la forme portée
 * par le dossier (clés client_*). Sert à préremplir et à comparer.
 */
export function instantaneFiche(fiche) {
  const out = {}
  for (const [champ, cle] of CHAMPS_FICHE_DOSSIER) out[cle] = fiche?.[champ] ?? null
  return out
}

/**
 * Préremplit les champs client vides du dossier depuis la fiche. Ne touche
 * jamais à une valeur déjà saisie : si le conseiller a commencé à taper avant
 * que la fiche n'arrive, sa saisie reste.
 */
export function preremplirDepuisFiche(deal, fiche) {
  const out = { ...deal }
  for (const [champ, cle] of CHAMPS_FICHE_DOSSIER) {
    if (texte(out[cle]) === '' && texte(fiche?.[champ]) !== '') out[cle] = fiche[champ]
  }
  return out
}

/**
 * Ce qui doit repartir vers la fiche à l'enregistrement d'un dossier
 * EXISTANT : les champs non vides qui diffèrent de l'instantané.
 *
 * L'email et le téléphone ont un piège de plus : le dossier en porte sa
 * propre copie (colonnes deals.client_email et client_phone, posées à la
 * création) qui peut être périmée. Une valeur restée égale à cette copie
 * n'est pas une saisie : elle ne doit pas écraser une fiche qui a déjà une
 * valeur. Elle sert seulement à remplir une fiche qui n'en a pas.
 *
 * Sans instantané (fiche non lue : dossier sans client_id, ou fiche d'un
 * autre conseiller), on renvoie tout ce qui est rempli, comme avant : c'est
 * ce chemin qui complète la fiche retrouvée par email avec le téléphone du
 * dossier, sans quoi la base refuse la signature.
 *
 * @param {Object} deal      le dossier tel que la modale l'enregistre
 * @param {Object|null} instantane  résultat de instantaneFiche, ou null
 * @param {Object} initial   le dossier tel qu'il a été ouvert
 * @returns {Object} champs de la fiche à écrire (clés de la table clients)
 */
export function modifsFiche(deal, instantane, initial = {}) {
  const out = {}
  for (const [champ, cle] of CHAMPS_FICHE_DOSSIER) {
    const valeur = texte(deal?.[cle])
    if (valeur === '') continue
    if (!instantane) { out[champ] = deal[cle]; continue }
    const reference = texte(instantane[cle])
    if (valeur === reference) continue
    const copieDuDossier = cle === 'client_email' || cle === 'client_phone'
    if (copieDuDossier && valeur === texte(initial?.[cle]) && reference !== '') continue
    out[champ] = deal[cle]
  }
  return out
}
