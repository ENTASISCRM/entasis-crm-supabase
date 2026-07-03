// src/lib/leadroom-api.js
// Appelle les routes /api/admin/* de la Lead Room via le proxy serveur du CRM
// (api/leadroom-proxy.js), qui authentifie l utilisateur et injecte le secret
// partage cote serveur. On ne parle plus jamais en direct a la Lead Room depuis
// le navigateur (correctif audit securite 2026-07-03).
//
// Usage (mimique fetch, l argument est le chemin admin, pas l URL complete) :
//   leadroomAdmin('ca-forecast')
//   leadroomAdmin('rdv-heatmap?days=90')
//   leadroomAdmin('lead-action', { method: 'POST', body: JSON.stringify({...}) })

import { supabase } from './supabase'

export async function leadroomAdmin(pathAndQuery, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const [path, query] = String(pathAndQuery).split('?')
  const qs = new URLSearchParams(query || '')
  qs.set('path', path)
  return fetch(`/api/leadroom-proxy?${qs.toString()}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
