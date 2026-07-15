// src/services/invitations.js
// Couche d'accès Supabase pour la table `invitations` (onboarding).
//
// Workflow :
//   1. Manager : invite un nouvel utilisateur → create()
//   2. Lien généré : ?invite=<token>
//   3. Nouvel arrivant clique → validateToken() pour récupérer role/code
//   4. Après signup → markUsed() pour invalider le token

import { supabase } from '../lib/supabase'

/**
 * Valide un token d'invitation (non utilisé, non expiré).
 * Passe par la RPC SECURITY DEFINER validate_invitation_token : la table
 * `invitations` n'est plus lisible par la clé anon (fuite de données fermée).
 * @returns { role, advisor_code, email } ou null si invalide
 */
export async function validateToken(token) {
  const { data, error } = await supabase.rpc('validate_invitation_token', {
    p_token: token,
  })
  if (error) return null
  return data ?? null
}

/**
 * Liste les 10 dernières invitations (panel admin).
 */
export async function listRecent(limit = 10) {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/**
 * Crée une nouvelle invitation. Retourne la row complète (avec token).
 * typeContrat optionnel — pré-rempli pour faciliter l'onboarding RH.
 */
export async function create({ email, role, advisorCode, createdBy, typeContrat }) {
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      email: email || null,
      role,
      advisor_code: advisorCode || null,
      created_by: createdBy,
      type_contrat: typeContrat || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Met à jour le type de contrat sur une invitation existante.
 * Permet de qualifier rétroactivement un conseiller depuis le panel admin.
 */
export async function setTypeContrat(invitationId, typeContrat) {
  const { error } = await supabase
    .from('invitations')
    .update({ type_contrat: typeContrat || null })
    .eq('id', invitationId)
  if (error) throw error
}

/**
 * Marque une invitation comme utilisée (après signup).
 * Passe par la RPC SECURITY DEFINER mark_invitation_used : l'UPDATE anon direct
 * sur la table (policy invitations_update_used) a été supprimé.
 */
export async function markUsed(token) {
  const { error } = await supabase.rpc('mark_invitation_used', {
    p_token: token,
  })
  if (error) throw error
}

/**
 * Révoque (supprime) une invitation.
 */
export async function remove(invitationId) {
  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', invitationId)
  if (error) throw error
}
