// src/services/profiles.js
// Couche d'accès Supabase pour la table `profiles` (utilisateurs auth).
//
// Pourquoi : 7 opérations sur profiles étaient inline dans App.jsx, mixant
// auth (Supabase auth), création de profile, mise à jour role/advisor_code,
// gestion gcal_token. Cette couche centralise.

import { supabase } from '../lib/supabase'
import { verifierEcriture, MOTIF_DROITS } from '../lib/ecriture-verifiee'

/**
 * Charge un seul profil par user id.
 */
export async function getById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Liste tous les profils (cols réduites pour le team affichage).
 */
export async function listTeam() {
  // On utilise la RPC team_directory (SECURITY DEFINER) qui bypass les RLS
  // profiles. Sans ça, un conseiller voit une liste vide quand il veut
  // ajouter un co-conseiller sur un deal (les RLS profiles le restreignent
  // à sa propre ligne).
  const { data: rpcData, error: rpcError } = await supabase.rpc('team_directory')
  if (!rpcError && Array.isArray(rpcData)) return rpcData
  // Fallback : query directe (utile si la RPC n'est pas encore déployée)
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,advisor_code,is_active')
    .order('full_name', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Met à jour un profil (ex: role, advisor_code, full_name).
 */
export async function update(userId, patch) {
  // Les policies de profiles refusent l escalade de role et la modification
  // d autrui : sans .select(), un refus passait pour un enregistrement.
  const reponse = await supabase.from('profiles').update(patch).eq('id', userId).select('id')
  verifierEcriture(reponse, 'Enregistrement du profil', MOTIF_DROITS)
}

/**
 * Upsert (création si absent, update sinon) — utilisé en filet de
 * sécurité au signup quand le trigger DB tarde.
 */
export async function upsert(profile) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Met à jour le token Google Calendar d'un profil (avec timestamp).
 * Pattern fire-and-forget (UI continue, l'erreur reste warn-loggée).
 */
export async function setGcalToken(userId, token) {
  return supabase
    .from('profiles')
    .update({
      gcal_token: token,
      gcal_token_updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
}

/**
 * Reset le token Google Calendar (expiré ou révoqué).
 */
export async function clearGcalToken(userId) {
  const reponse = await supabase
    .from('profiles')
    .update({ gcal_token: null, gcal_token_updated_at: null })
    .eq('id', userId)
    .select('id')
  verifierEcriture(reponse, 'Déconnexion de Google Agenda', MOTIF_DROITS)
}
