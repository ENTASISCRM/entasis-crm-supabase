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

/**
 * Lit la réponse du proxy en JSON, sans jamais lever de SyntaxError.
 *
 * Trois écrans faisaient `await r.json()` AVANT de tester `r.ok` : dès que le
 * proxy renvoyait autre chose que du JSON — page d'erreur Vercel, 502, délai
 * de passerelle — le parse explosait et l'écran cassait, au lieu que la garde
 * `if (r.ok)` fasse son travail. On lit le texte d'abord, on tente le parse,
 * et on lève une erreur lisible que l'appelant peut afficher.
 */
export async function lireJson(reponse) {
  const texte = await reponse.text()
  let json = null
  try { json = texte ? JSON.parse(texte) : null } catch { /* réponse non JSON */ }

  if (!reponse.ok) {
    throw new Error(json?.error || `Lead Room indisponible (HTTP ${reponse.status})`)
  }
  if (json === null) {
    throw new Error('Réponse inattendue de la Lead Room')
  }
  return json
}
