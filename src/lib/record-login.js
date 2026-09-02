// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL DES CONNEXIONS, COTE NAVIGATEUR
//
// Appele une fois, juste apres une connexion reussie. Il ne fait qu une chose :
// prevenir le serveur, qui lit l IP reelle et sa localisation dans les en tetes
// de la requete et ecrit la ligne (voir api/connexion.js).
//
// La version precedente allait chercher l IP publique chez ipify, un service
// exterieur : l adresse de chaque collaborateur partait chez un tiers alors que
// notre propre serveur l a deja sous les yeux. Plus d appel sortant.
//
// Repli : si la fonction serveur ne repond pas (developpement local, panne),
// on appelle quand meme la fonction en base, qui retiendra l IP vue par le
// proxy. Une trace incomplete vaut mieux que pas de trace.
//
// Regle tenue : la connexion ne doit JAMAIS echouer parce que le journal est
// indisponible. Tout est avale, rien n est affiche a l ecran.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

export async function recordLogin() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return false

    try {
      const r = await fetch('/api/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      })
      if (r.ok) {
        const j = await r.json().catch(() => null)
        if (j?.enregistre) return true
      }
    } catch {
      // On tombe sur le repli ci dessous.
    }

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null
    await supabase.rpc('record_login', { p_user_agent: ua })
    return true
  } catch {
    return false
  }
}
