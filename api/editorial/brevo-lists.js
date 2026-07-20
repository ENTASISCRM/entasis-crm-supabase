// api/editorial/brevo-lists.js
// GET → liste des listes de contacts Brevo pour peupler le menu déroulant de
// configuration de la newsletter : [{ id, name, totalSubscribers }].
// Manager only (helper requireManager). La clé Brevo reste côté serveur.
//
// Variables d'environnement : SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY.

import { requireManager } from './lib/manager-auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const auth = await requireManager(req, res)
  if (!auth) return

  const apiKey = (process.env.BREVO_API_KEY || '').trim()
  if (!apiKey) {
    return res.status(503).json({ error: 'BREVO_API_KEY non configurée côté serveur' })
  }

  try {
    // Brevo pagine à 50 par défaut ; limit=50 couvre largement le besoin ici.
    const resp = await fetch('https://api.brevo.com/v3/contacts/lists?limit=50&offset=0', {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      return res.status(502).json({ error: `Brevo → HTTP ${resp.status} ${json?.message || ''}`.trim() })
    }
    const lists = (json.lists || []).map((l) => ({
      id: l.id,
      name: l.name,
      totalSubscribers: l.totalSubscribers ?? 0,
    }))
    return res.status(200).json({ lists })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
