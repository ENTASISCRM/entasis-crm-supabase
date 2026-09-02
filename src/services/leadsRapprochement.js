// src/services/leadsRapprochement.js
// Appelle le rapprochement « signé dans la Lead Room, pas dans le CRM »
// (api/leads-rapprochement.js) avec le jeton de session. Même motif que
// src/lib/remuneration-api.js : le navigateur envoie son jeton, le serveur
// vérifie le rôle manager et parle seul à la base de la Lead Room.

import { supabase } from '../lib/supabase'

/**
 * @returns {Promise<{ lignes: Array, jours: number }>}
 * Lève une erreur portant `nonConfigure: true` quand le serveur n'a pas
 * l'accès Lead Room, pour que l'écran l'affiche en ligne discrète.
 */
export async function fetchRapprochement() {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Session expirée, reconnecte toi.')
  const res = await fetch('/api/leads-rapprochement', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const corps = await res.json().catch(() => ({}))
    const err = new Error(corps.error || `Erreur ${res.status}`)
    err.status = res.status
    err.nonConfigure = /non configur/i.test(String(corps.error || ''))
    throw err
  }
  return res.json()
}
