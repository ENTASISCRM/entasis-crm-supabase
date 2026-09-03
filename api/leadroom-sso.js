// api/leadroom-sso.js
// Ouvre la Lead Room sans second mot de passe.
//
// Le conseiller est authentifie ici (jeton CRM), puis on demande a la Lead
// Room un lien de connexion a usage unique pour SON email (route
// /api/admin/sso-link, protegee par le secret partage du pont). Le CRM ne
// detient jamais la cle service de la Lead Room : c est elle qui fabrique le
// lien, nous ne faisons que le relayer a l onglet Leads Live, qui le charge
// dans son iframe. Le lien expire vite et ne sert qu une fois.
//
// Reponse : { url, fallback }. Si la Lead Room ne connait pas cet email (pas
// de compte conseiller la bas), url est absent et fallback pointe sur la page
// de connexion classique.

import { verifyAuth } from './_auth.js'

const LEADROOM = (process.env.LEADROOM_URL || 'https://entasis-leadroom.vercel.app').replace(/\/$/, '')

export default async function handler(req, res) {
  let caller
  try {
    caller = await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  const secret = (process.env.BRIDGE_SECRET || '').trim()
  const rawNext = typeof req.query?.next === 'string' ? req.query.next : '/leadroom'
  // Uniquement un chemin interne a la Lead Room, jamais une URL externe.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/leadroom'
  const fallback = `${LEADROOM}${next}`

  if (!secret) return res.status(200).json({ fallback, reason: 'bridge_secret_missing' })
  if (!caller?.email) return res.status(200).json({ fallback, reason: 'no_email' })

  try {
    const upstream = await fetch(`${LEADROOM}/api/admin/sso-link`, {
      method: 'POST',
      headers: { 'x-bridge-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ email: caller.email, next }),
    })
    const json = await upstream.json().catch(() => ({}))
    if (!upstream.ok || !json?.url) {
      return res.status(200).json({ fallback, reason: json?.reason || json?.error || `http_${upstream.status}` })
    }
    return res.status(200).json({ url: json.url, fallback })
  } catch (e) {
    return res.status(200).json({ fallback, reason: 'leadroom_unreachable', detail: e?.message })
  }
}
