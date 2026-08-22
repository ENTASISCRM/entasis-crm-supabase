// src/services/interactions.js
// Couche d'accès à `client_interactions` (Série D / D4 + D10) : le journal
// des échanges avec un client — appels, mails, RDV, courriers, notes.
//
// La RLS de la table aligne la visibilité sur celle de la fiche client :
// aucun filtre de scope à refaire ici.

import { supabase } from '../lib/supabase'

// Libellés d'affichage, source unique (écran + export).
export const TYPES_ECHANGE = [
  { value: 'appel', label: 'Appel' },
  { value: 'email', label: 'E-mail' },
  { value: 'rdv', label: 'Rendez-vous' },
  { value: 'courrier', label: 'Courrier' },
  { value: 'note', label: 'Note' },
]

export const SENS_ECHANGE = [
  { value: 'sortant', label: 'Sortant' },
  { value: 'entrant', label: 'Entrant' },
  { value: 'interne', label: 'Interne' },
]

export const libelleType = (v) => TYPES_ECHANGE.find(t => t.value === v)?.label || v
export const libelleSens = (v) => SENS_ECHANGE.find(s => s.value === v)?.label || v

/** Échanges d'un client, du plus récent au plus ancien. */
export async function listByClient(clientId, limit = 100) {
  // Pas de jointure sur `profiles` : sa RLS interdit à un conseiller de lire
  // le profil d'un collègue, l'auteur reviendrait vide sur les échanges des
  // autres. On s'appuie sur created_by_code, gravé par trigger à l'insertion.
  const { data, error } = await supabase
    .from('client_interactions')
    .select('*')
    .eq('client_id', clientId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/** Consigne un échange. `created_by` est imposé par la RLS = utilisateur courant. */
export async function create({ clientId, type, sens, objet, contenu, occurredAt, dealId }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('client_interactions')
    .insert({
      client_id: clientId,
      type: type || 'appel',
      sens: sens || 'sortant',
      objet: objet?.trim() || null,
      contenu: contenu?.trim() || null,
      // Champ `date` côté formulaire → on stocke à midi pour éviter les
      // décalages de fuseau qui feraient basculer l'échange au jour d'avant.
      occurred_at: occurredAt ? new Date(`${occurredAt}T12:00:00`).toISOString() : new Date().toISOString(),
      deal_id: dealId || null,
      created_by: user?.id || null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

/**
 * Supprime un échange. `select()` force PostgREST à renvoyer les lignes
 * supprimées : sans lui, une suppression refusée par la RLS (échange d'un
 * collègue) repart en succès et l'écran annonce à tort « supprimé ».
 */
export async function remove(id) {
  const { data, error } = await supabase
    .from('client_interactions')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error("Suppression refusée : cet échange a été consigné par un autre conseiller.")
  }
}
