// src/services/ucsStructures.js
// Couche d'accès Supabase pour le catalogue UCS Produits Structurés et
// les simulations de commission associées. Cohérent avec la couche
// services CRM (Phase 2.A).
//
// Règle métier commission UCS (politique interne Entasis, dérogatoire au
// barème PDF qui dit 0,5 % CDI / 1 % mandataire) :
//   - Mandataire : 1,5 % (toujours)
//   - CDI / Alternant / Stagiaire NON rentabilisé : 1,5 % (booster motivation)
//   - CDI / Alternant / Stagiaire rentabilisé : 0,75 % (taux CDI standard)
//   - Cabinet : Upfront UCS − taux conseiller (peut être négatif → ⚠ admin)
//
// Le taux applicable est passé en paramètre par l'UI selon le contrat
// du conseiller connecté. 1,5 % reste la valeur par défaut (rétrocompat).

import { supabase } from '../lib/supabase'
import { verifierEcriture, MOTIF_DISPARU } from '../lib/ecriture-verifiee'

// Taux par défaut historique (Mandataire / non-rentabilisé)
export const COMMISSION_CONSEILLER_PCT = 1.5
// Taux CDI standard appliqué après rentabilisation
export const COMMISSION_CONSEILLER_PCT_CDI = 0.75

/**
 * Calcule la répartition de commission pour un montant + une UCS donnée.
 * Pure function, sans appel DB — utilisée en temps réel par le simulateur.
 *
 * @param {number} montant     - Montant placé client en €
 * @param {number} upfront     - Upfront UCS en % (ex: 4.5 pour 4,5%)
 * @param {number} [tauxConseiller=1.5] - % commission conseiller à appliquer
 * @returns { upfrontTotal, conseiller, cabinet, isUnderwater, tauxConseiller }
 */
export function computeCommission(montant, upfront, tauxConseiller = COMMISSION_CONSEILLER_PCT) {
  const upfrontTotal = (montant * upfront) / 100
  const conseiller = (montant * tauxConseiller) / 100
  const cabinet = upfrontTotal - conseiller
  return {
    upfrontTotal,
    conseiller,
    cabinet,
    isUnderwater: cabinet < 0,
    tauxConseiller,
  }
}

/**
 * Calcule le coupon annuel client pour info (montant × coupon% / an).
 */
export function computeCouponAnnuel(montant, couponClient) {
  return (montant * couponClient) / 100
}

// ─────────────────────────────────────────────────────────────────────────────
// UCS structures (catalogue)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge tout le catalogue UCS avec le structureur joint.
 * Tri par défaut : EN_COURS d'abord, puis upfront décroissant
 * (NULL en dernier — les UCS sans upfront négocié, ex Abeille).
 */
export async function listAll() {
  // L upfront negocie ne part PAS dans le navigateur d un conseiller : sa
  // commission etant fixee a 1,5 %, l ecart avec l upfront EST la marge du
  // cabinet, c est a dire ce que la compagnie verse a Entasis.
  //
  // Un seul chemin de lecture desormais, la vue ucs_catalogue, qui sert
  // l upfront et les notes internes a la direction et null a tout le monde
  // d autre. La table, elle, n est plus lisible que par la direction. Ce n est
  // pas un choix d affichage : la base tranche, le navigateur ne peut pas
  // demander ce qu il n a pas le droit de voir.
  const { data, error } = await supabase
    .from('ucs_catalogue')
    .select(`
      *,
      structureur:structureurs(id, nom, compagnies_travaillees)
    `)
    .order('etat', { ascending: true })
    .order('upfront_negocie', { ascending: false })
    .order('upfront', { ascending: false, nullsFirst: false })
    .order('nom_ucs', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Met à jour une UCS (édition admin).
 */
export async function update(id, patch) {
  const reponse = await supabase.from('ucs_structures').update(patch).eq('id', id).select('id')
  verifierEcriture(reponse, 'Enregistrement de l UCS', MOTIF_DISPARU)
}

/**
 * Marque le statut d'une UCS (boutons "Marquer CLOTURE" / "Marquer ANNULATION").
 */
export async function markStatus(id, etat) {
  if (!['EN_COURS', 'CLOTURE', 'ANNULATION'].includes(etat)) {
    throw new Error(`Statut invalide : ${etat}`)
  }
  return update(id, { etat })
}

/**
 * Insère en masse (upsert sur code_isin). Utilisé par l'admin pour
 * importer un CSV de l'export du groupement.
 */
export async function upsertMany(rows) {
  if (!rows?.length) return { inserted: 0 }
  const { data, error } = await supabase
    .from('ucs_structures')
    .upsert(rows, { onConflict: 'code_isin' })
    .select('id')
  if (error) throw error
  return { inserted: (data || []).length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulations de commission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sauvegarde une simulation pour analytics + traçabilité.
 * Le conseiller_id est lu côté DB via auth.uid() — pas besoin de le
 * passer ici tant que RLS est active (cf. migration).
 */
export async function saveSimulation({
  ucsId,
  conseillerId,
  clientId = null,
  montant,
  commissionConseiller,
}) {
  // La marge du cabinet n est PAS envoyee : le navigateur ne connait pas l
  // upfront, et un declencheur la calcule en base a l insertion. Tant qu elle
  // partait d ici, elle etait connue du poste qui l envoyait.
  const { data, error } = await supabase
    .from('simulations_structures')
    .insert({
      ucs_id: ucsId,
      conseiller_id: conseillerId,
      client_id: clientId,
      montant,
      commission_conseiller: commissionConseiller,
    })
    .select('id')
    .single()
  if (error) throw error
  return data
}

