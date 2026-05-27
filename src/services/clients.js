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
 * Recherche un client existant par email (case-insensitive).
 * Plus fiable que le nom car l'email est unique par personne.
 */
export async function findByEmail(email) {
  const e = (email || '').trim().toLowerCase()
  if (!e) return null
  const { data } = await supabase
    .from('clients')
    .select('id, nom, prenom, email')
    .ilike('email', e)
    .limit(1)
    .maybeSingle()
  return data || null
}

/**
 * Recherche un client existant par téléphone (tolérant aux formatages).
 * Compare les 9 derniers chiffres (= numéro local sans préfixe pays).
 */
export async function findByPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 9) return null
  const tail = digits.slice(-9)
  // On charge un échantillon de clients avec téléphone et on filtre côté JS
  // (PostgREST ne fait pas de regex sur les colonnes en ilike facilement).
  const { data } = await supabase
    .from('clients')
    .select('id, nom, prenom, telephone')
    .not('telephone', 'is', null)
    .limit(2000)
  if (!data) return null
  return data.find(c => {
    const t = (c.telephone || '').replace(/\D/g, '')
    return t.length >= 9 && t.slice(-9) === tail
  }) || null
}

/**
 * Cherche un client existant en cascade : email > téléphone > nom+advisor.
 * Retourne le 1er match trouvé ou null.
 */
export async function findExisting({ email, telephone, nom, advisor_code }) {
  // 1. Email (le plus fiable)
  if (email) {
    const byEmail = await findByEmail(email)
    if (byEmail) return { ...byEmail, matchedBy: 'email' }
  }
  // 2. Téléphone (tolérant aux formats)
  if (telephone) {
    const byPhone = await findByPhone(telephone)
    if (byPhone) return { ...byPhone, matchedBy: 'phone' }
  }
  // 3. Nom + advisor_code (dernier recours, exact)
  if (nom && advisor_code) {
    const byName = await findByNameAndAdvisor(nom, advisor_code)
    if (byName) return { ...byName, matchedBy: 'name' }
  }
  return null
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

  const email = clientData.email || clientData.client_email || null
  const telephone = clientData.telephone || clientData.client_phone || null

  // Recherche multi-critères (email > phone > nom+advisor) pour éviter les
  // doublons de clients. Si on trouve un match, on le réutilise.
  const existing = await findExisting({
    email,
    telephone,
    nom,
    advisor_code: clientData.advisor_code,
  })
  if (existing) return existing.id

  try {
    return await create(
      {
        nom,
        email,
        telephone,
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
