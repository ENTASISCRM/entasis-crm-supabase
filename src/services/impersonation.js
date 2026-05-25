// ═══════════════════════════════════════════════════════════════════════════
// SERVICE : impersonation
// Wrapper de l'API route /api/impersonate. Le serveur fait toute la vérif
// (manager only, audit log, etc.) — le client passe juste le JWT de l'appelant.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../lib/supabase'

/**
 * Génère un magic link pour se connecter en tant qu'un autre utilisateur.
 * Retourne { link, target } à charger dans un nouvel onglet.
 *
 * @param {string} targetUserId  - profile.id de la cible
 * @param {string} [reason]      - raison saisie par le manager (audit)
 */
export async function impersonate(targetUserId, reason) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Session expirée, reconnecte-toi')
  }
  const res = await fetch('/api/impersonate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ targetUserId, reason: reason || null }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || `Erreur ${res.status}`)
  }
  return data    // { link, target: { id, email, full_name } }
}
