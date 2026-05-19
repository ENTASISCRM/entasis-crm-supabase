// src/services/deals.js
// Couche d'accès Supabase pour la table `deals` (CRM patrimonial).
//
// Pourquoi : 4 opérations CRUD sur deals étaient inline dans App.jsx.
// Cette couche centralise + encapsule le SELECT avec join clients
// (utilisé partout) pour éviter de répéter la liste de colonnes.

import { supabase } from '../lib/supabase'

// Colonnes du client à charger en join sur tous les SELECT de deals.
// Centralisé ici pour éviter le drift entre call-sites.
const CLIENT_JOIN_COLS = `
  id, nom, prenom, email, telephone, age,
  situation_familiale, nb_enfants, profession,
  revenus_annuels, patrimoine_estime, objectifs,
  notes, advisor_code, co_advisor_code
`

/**
 * Charge tous les deals avec leur client joint, ordre antichronologique.
 * Utilisé au mount.
 */
export async function listAll() {
  const { data, error } = await supabase
    .from('deals')
    .select(`*, clients(${CLIENT_JOIN_COLS})`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Met à jour un deal existant. Le caller passe l'objet complet.
 */
export async function update(dealId, patch) {
  const { error } = await supabase.from('deals').update(patch).eq('id', dealId)
  if (error) throw error
}

/**
 * Crée un nouveau deal. Génère un ID local si absent (préfixe D-…).
 */
export async function create(deal) {
  const newId = deal.id || `D-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const { error } = await supabase.from('deals').insert({ ...deal, id: newId })
  if (error) throw error
  return newId
}

/**
 * Supprime définitivement un deal.
 */
export async function remove(dealId) {
  const { error } = await supabase.from('deals').delete().eq('id', dealId)
  if (error) throw error
}
