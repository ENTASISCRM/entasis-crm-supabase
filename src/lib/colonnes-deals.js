// ═══════════════════════════════════════════════════════════════════════════
// LES COLONNES DE LA TABLE deals, ET RIEN D'AUTRE, AU MOMENT D'ÉCRIRE
//
// Un dossier circule dans l'application enrichi de clés calculées : la
// jointure clients, client_data, les quatre champs client_* de la modale,
// joursSansMouvement posé par lib/stagnants.js, heureRdv posé par
// lib/ma-journee.js. Quand l'objet entier repart vers la base (la modale
// enregistre le dossier complet), PostgREST refuse la première clé qui n'est
// pas une colonne : 400 PGRST204, et l'écriture n'a pas lieu.
//
// La revue du 3 septembre l'a établi : « Déjà signé », Relancer et le clic
// sur une ligne du bloc « Dossiers sans mouvement » portaient
// joursSansMouvement jusqu'au PATCH, et les rendez vous de Ma journée
// portaient heureRdv. Retirer les clés une à une (CLIENT_UI_ONLY) ne tient
// pas : chaque nouvel écran en ajoute une. On garde les colonnes, on écarte
// le reste.
//
// Source : information_schema.columns sur deals, projet CRM, 3 septembre
// 2026. Une colonne ajoutée en base doit être ajoutée ici, sinon sa valeur
// est écartée en silence à l'écriture ; le service le dit dans la console.
// ═══════════════════════════════════════════════════════════════════════════

export const COLONNES_DEALS = Object.freeze([
  'id', 'month', 'client', 'product', 'pp_m', 'pu',
  'advisor_code', 'co_advisor_code', 'advisor_profile_id',
  'source', 'status', 'company', 'notes', 'priority', 'tags',
  'date_expected', 'date_signed',
  'client_phone', 'client_email', 'client_age', 'client_id', 'lead_id',
  'created_by', 'created_at', 'updated_at',
  'frais_entree_pct', 'frais_entree_pp_pct', 'frais_entree_pu_pct', 'is_ordre_placement',
  'relance_action', 'relance_action_at',
  'next_action', 'next_action_date',
  'sequence_key', 'sequence_etape',
])

const COLONNES = new Set(COLONNES_DEALS)

/**
 * Ne garde d'un objet que les colonnes de deals. Une valeur nulle est gardée
 * (effacer un champ est une écriture voulue) ; une clé inconnue est écartée
 * et nommée dans `ecartes` pour que le service puisse le dire.
 *
 * @param {Object} objet  un dossier ou un patch, tel qu'il circule à l'écran
 * @returns {{ patch: Object, ecartes: string[] }}
 */
export function nettoyerPourEcriture(objet) {
  const patch = {}
  const ecartes = []
  for (const [cle, valeur] of Object.entries(objet || {})) {
    if (COLONNES.has(cle)) patch[cle] = valeur
    else ecartes.push(cle)
  }
  return { patch, ecartes }
}
