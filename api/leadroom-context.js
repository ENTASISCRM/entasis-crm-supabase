// api/leadroom-context.js
// Ce que la Lead Room sait d une personne, pour la fiche client du CRM :
// campagne d origine, reponses au formulaire, historique d appels.
//
// Le conseiller est authentifie ici, puis on interroge la Lead Room avec le
// secret partage du pont. Le CRM ne detient aucune cle de la Lead Room : il
// relaie une question et affiche la reponse.
//
// GET ?phone=+33612345678 (ou ?leadId=...) -> { trouve, lead?, appels? }

import { verifyAuth } from './_auth.js'

const LEADROOM = (process.env.LEADROOM_URL || 'https://entasis-leadroom.vercel.app').replace(/\/$/, '')

export default async function handler(req, res) {
  try {
    await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  const secret = (process.env.BRIDGE_SECRET || '').trim()
  if (!secret) return res.status(200).json({ trouve: false, raison: 'pont_non_configure' })

  const phone = typeof req.query?.phone === 'string' ? req.query.phone : null
  const leadId = typeof req.query?.leadId === 'string' ? req.query.leadId : null
  if (!phone && !leadId) return res.status(200).json({ trouve: false, raison: 'ni_lead_ni_telephone' })

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const r = await fetch(`${LEADROOM}/api/admin/lead-context`, {
      method: 'POST',
      headers: { 'x-bridge-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ phone, leadId }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const json = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(200).json({ trouve: false, raison: `http_${r.status}` })
    return res.status(200).json(json)
  } catch (e) {
    return res.status(200).json({ trouve: false, raison: 'leadroom_injoignable', detail: e?.message })
  }
}
