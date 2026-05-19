// src/services/clients.js
// Couche d'accès Supabase pour la table `clients` (CRM patrimonial).
//
// Pourquoi : la création d'un client est subtile (auto-créé depuis un
// deal, recherche fuzzy par nom+email+phone). Cette couche évite le
// drift entre les 3 composants qui touchent cette table.

import { supabase } from '../lib/supabase'

/**
 * Recherche fuzzy (autocomplete) par nom OU email OU téléphone.
 * Limite à 5 résultats. Renvoie [] sur erreur (silent failure côté UI).
 */
export async function searchByQuery(query) {
  if (!query || query.length < 2) return []
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom, prenom, email, telephone')
    .or(
      `nom.ilike.%${query}%,email.ilike.%${query}%,telephone.ilike.%${query}%`
    )
    .limit(5)
  if (error) return []
  return data || []
}

/**
 * Recherche un client existant par nom + advisor_code (unicité métier).
 * @returns le client { id } ou null si non trouvé.
 */
export async function findByNameAndAdvisor(nom, advisorCode) {
  const { data } = await supabase
    .from('clients')
    .select('id')
    .eq('nom', nom)
    .eq('advisor_code', advisorCode || '')
    .maybeSingle()
  return data || null
}

/**
 * Crée un nouveau client. Retourne l'id du nouveau client.
 */
export async function create(clientData, userId) {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      nom: clientData.nom,
      email: clientData.email ?? null,
      telephone: clientData.telephone ?? null,
      age: clientData.age ?? null,
      advisor_code: clientData.advisor_code ?? null,
      created_by: userId ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data?.id || null
}

/**
 * Helper haut niveau : trouve ou crée. Centralise la logique
 * "auto-création depuis un deal" qui était dans App.jsx.
 *
 * Renvoie null si le caller n'a pas fourni de nom (skip silencieux).
 */
export async function findOrCreate(clientData, userId) {
  if (clientData.client_id) return clientData.client_id

  const nom = (clientData.nom || clientData.client || '').trim()
  if (!nom) return null

  const existing = await findByNameAndAdvisor(nom, clientData.advisor_code)
  if (existing) return existing.id

  try {
    return await create(
      {
        nom,
        email: clientData.email || clientData.client_email,
        telephone: clientData.telephone || clientData.client_phone,
        age: clientData.age || clientData.client_age,
        advisor_code: clientData.advisor_code,
      },
      userId
    )
  } catch (e) {
    console.error('[clients.findOrCreate] create failed:', e)
    return null
  }
}
