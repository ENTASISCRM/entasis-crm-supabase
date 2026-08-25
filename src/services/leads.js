// src/services/leads.js
// Couche d'accès Supabase pour la table `leads` (CRM).
//
// Pourquoi : avant, 9 opérations Supabase sur `leads` étaient inline
// dans App.jsx (4400 lignes). Difficile à tester, à comprendre, à
// muter sans casser ailleurs. Cette couche centralise.
//
// État machine `leads.status` :
//   available → contacted → booked    (parcours nominal)
//             ↘ released → available  (libération volontaire)
//             ↘ released (auto)       (timeout LEAD_TIMEOUT_MS)
//             ↘ dead                  (non intéressé)
//
// Les colonnes mutées :
//   - status      (cf. état machine)
//   - taken_by    (uuid profile qui a pris le lead)
//   - taken_at    (timestamptz)
//   - booked_at   (timestamptz quand RDV calé)
//   - email_confirmed (string : email final récupéré sur le lead)

import { supabase } from '../lib/supabase'
import { verifierEcriture } from '../lib/ecriture-verifiee'

// Un lead qui echappe a une ecriture a change de main : c est la seule cause
// possible, la policy leads_update_v2 n autorise que le proprietaire, la
// direction, ou un lead libre.
const MOTIF_LEAD = 'Ce lead vient de changer de main, rechargez la liste.'

/**
 * Charge tous les leads, ordre antichronologique sur created_at.
 * Utilisé au mount + dans le polling 60s de secours.
 */
export async function listAll() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Marque un lead comme "booké" après création d'un RDV Google Calendar.
 * Met aussi à jour l'email confirmé (si modifié dans le modal RDV).
 */
export async function markBooked(leadId, { email } = {}) {
  const payload = {
    status: 'booked',
    booked_at: new Date().toISOString(),
  }
  if (email) payload.email_confirmed = email
  const reponse = await supabase.from('leads').update(payload).eq('id', leadId).select('id')
  verifierEcriture(reponse, 'Enregistrement du rendez vous', MOTIF_LEAD)
}

/**
 * Conseiller "prend" un lead disponible. Garde-fou : la transition n'a
 * lieu que si le lead est encore `available` ou `released` (évite que
 * deux conseillers prennent le même au même moment).
 * @returns true si pris avec succès, false si déjà pris par un autre
 */
export async function take(leadId, advisorProfileId) {
  // Le garde fou vit dans le `.in('status', ...)` : si un collegue a pris le
  // lead trois secondes plus tot, la ligne ne correspond plus et l update
  // touche zero ligne. Sans `.select()`, PostgREST renvoyait 204 sans erreur
  // et `!error` valait true : les deux conseillers voyaient le lead basculer
  // chez eux et appelaient le meme client.
  const { data, error } = await supabase
    .from('leads')
    .update({
      status: 'contacted',
      taken_by: advisorProfileId,
      taken_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .in('status', ['available', 'released'])
    .select('id')
  if (error) throw error
  return (data || []).length > 0
}

/**
 * Libération manuelle du lead (le conseiller renonce, un autre peut le prendre).
 */
export async function release(leadId) {
  const reponse = await supabase
    .from('leads')
    .update({ status: 'released', taken_by: null, taken_at: null })
    .eq('id', leadId)
    .select('id')
  verifierEcriture(reponse, 'Libération du lead', MOTIF_LEAD)
}

/**
 * Reset complet (admin) : le lead redevient `available`, on efface
 * le contexte de prise et le booking éventuel.
 */
export async function reset(leadId) {
  const { data, error } = await supabase
    .from('leads')
    .update({
      status: 'available',
      taken_by: null,
      taken_at: null,
      booked_at: null,
    })
    .eq('id', leadId)
    .select('id')
  verifierEcriture({ data, error }, 'Réinitialisation du lead', MOTIF_LEAD)
}

/**
 * Marquer un lead comme "non intéressé" (statut final, archive).
 * On conserve taken_by pour audit (qui l'a fermé).
 */
export async function markDead(leadId, advisorProfileId) {
  const reponse = await supabase
    .from('leads')
    .update({ status: 'dead', taken_by: advisorProfileId })
    .eq('id', leadId)
    .select('id')
  verifierEcriture(reponse, 'Classement du lead en non intéressé', MOTIF_LEAD)
}

/**
 * Libération automatique d'un lot de leads "contacted" non transformés
 * dans le délai LEAD_TIMEOUT_MS. Appelé par le timer 15s côté UI.
 */
export async function autoReleaseStale(leadIds) {
  if (!leadIds?.length) return
  // Liberation automatique : une ligne qui resiste (prise entre temps par
  // quelqu un d autre) n est pas une anomalie, on ne bloque donc pas le lot.
  // On renvoie ce qui a reellement ete libere pour que l appelant puisse le
  // dire, plutot que d annoncer un menage qui n a pas eu lieu.
  const { data, error } = await supabase
    .from('leads')
    .update({ status: 'released', taken_by: null, taken_at: null })
    .in('id', leadIds)
    .select('id')
  if (error) throw error
  return (data || []).map((l) => l.id)
}
