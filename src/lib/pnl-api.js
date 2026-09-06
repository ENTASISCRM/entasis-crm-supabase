// src/lib/pnl-api.js
// ═══════════════════════════════════════════════════════════════════════════
// Appels de l espace rentabilite. Deux regles, non negociables.
//
//   1. Le jeton de deverrouillage NE VA JAMAIS dans localStorage ni dans
//      sessionStorage. Il vit en memoire, dans le module, et disparait au
//      rechargement de la page. C est voulu : l espace se reverrouille tout
//      seul quand on ferme l onglet.
//   2. Aucun calcul de marge ici. Le navigateur affiche ce que le serveur lui
//      donne, il ne le recalcule pas et ne connait aucun taux.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

let jetonEnMemoire = null
let expireA = 0

export function estDeverrouille() {
  return !!jetonEnMemoire && Date.now() < expireA
}

export function tempsRestantMs() {
  return estDeverrouille() ? Math.max(0, expireA - Date.now()) : 0
}

// Verrouiller efface le jeton ET rend la main a l appelant pour qu il vide
// aussi les donnees affichees : aucune marge ne doit rester a l ecran.
export function verrouiller() {
  jetonEnMemoire = null
  expireA = 0
}

async function jetonSupabase() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expiree, rechargez la page')
  return session.access_token
}

export async function deverrouiller(code) {
  const r = await fetch('/api/pnl-deverrouiller', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await jetonSupabase()}`,
    },
    body: JSON.stringify({ code }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    verrouiller()
    const e = new Error(j.error || 'Acces refuse')
    e.bloqueJusqua = j.bloque_jusqu_a || null
    throw e
  }
  jetonEnMemoire = j.jeton
  expireA = Date.now() + Number(j.expire_dans_ms || 0)
  return true
}

export async function chargerRentabilite(annee, repartir) {
  if (!estDeverrouille()) throw new Error('Espace verrouille')
  const r = await fetch('/api/pnl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await jetonSupabase()}`,
      'x-pnl-jeton': jetonEnMemoire,
    },
    body: JSON.stringify(
      typeof repartir === 'boolean' ? { annee, repartir } : { annee },
    ),
  })
  if (r.status === 403) { verrouiller(); throw new Error('Espace verrouille') }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`)
  return j
}
