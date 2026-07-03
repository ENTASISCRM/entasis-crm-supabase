// api/leadroom-proxy.js
// Proxy serveur vers les routes /api/admin/* de la Lead Room.
//
// Pourquoi : le CRM est une app navigateur, il ne peut pas detenir le secret
// partage (BRIDGE_SECRET) sans le divulguer dans son bundle. Ce proxy s execute
// cote serveur (fonction Vercel), authentifie l utilisateur CRM (JWT), verifie
// son role, puis relaie l appel a la Lead Room en injectant le secret. Ainsi les
// routes Lead Room peuvent exiger le secret et refuser tout appel anonyme.
//
// Correctif audit securite 2026-07-03 (routes admin Lead Room ouvertes).

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

const LEADROOM = (process.env.LEADROOM_URL || 'https://entasis-leadroom.vercel.app').replace(/\/$/, '')

// Chemins autorises. self : tout conseiller connecte, mais scope force a son
// email. manager : reserve a la direction (vues equipe et actions sur leads).
const SELF_PATHS = new Set(['joined-leads-detail'])
const MANAGER_PATHS = new Set([
  'ca-forecast', 'funnel-by-source', 'advisor-rdv-stats', 'rdv-heatmap',
  'rdv-bucket-detail', 'refused-recyclables', 'lead-action', 'recycle-lead',
])

export default async function handler(req, res) {
  // 1. Authentifier l appelant (utilisateur CRM)
  let caller
  try {
    caller = await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorise' })
  }

  const path = String(req.query.path || '')
  const isSelf = SELF_PATHS.has(path)
  const isManagerPath = MANAGER_PATHS.has(path)
  if (!isSelf && !isManagerPath) {
    return res.status(404).json({ error: 'Chemin inconnu' })
  }

  const secret = (process.env.BRIDGE_SECRET || '').trim()
  if (!secret) return res.status(500).json({ error: 'BRIDGE_SECRET non configure' })

  // 2. Role : les vues direction sont reservees aux managers
  let role = null
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: prof } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle()
    role = prof?.role || null
  } catch { /* role inconnu, traite comme non manager */ }
  const isManager = role === 'manager'
  if (isManagerPath && !isManager) {
    return res.status(403).json({ error: 'Reserve a la direction' })
  }

  // 3. Construire l URL cible. Pour les vues perso, on FORCE l email de
  //    l appelant (empeche de reclamer les donnees d un autre conseiller).
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === 'path') continue
    if (isSelf && k === 'advisorEmail') continue
    if (Array.isArray(v)) v.forEach(x => params.append(k, x)); else if (v != null) params.set(k, String(v))
  }
  if (isSelf) params.set('advisorEmail', caller.email || '')

  const qs = params.toString()
  const target = `${LEADROOM}/api/admin/${path}${qs ? `?${qs}` : ''}`
  const method = (req.method || 'GET').toUpperCase()

  try {
    const upstream = await fetch(target, {
      method,
      headers: {
        'x-bridge-secret': secret,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      body: method === 'POST' ? JSON.stringify(req.body || {}) : undefined,
    })
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  } catch (e) {
    return res.status(502).json({ error: 'Lead Room injoignable', detail: e?.message })
  }
}
