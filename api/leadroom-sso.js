// api/leadroom-sso.js
// Ouvre la Lead Room sans second mot de passe.
//
// Le conseiller est authentifie ici (jeton CRM), son PROFIL est verifie (actif,
// role connu, code conseiller attribue par la direction : un compte cree par
// simple inscription n en a pas), puis on demande a la Lead Room un lien de
// connexion a usage unique pour SON email (route /api/admin/sso-link,
// protegee par le secret partage du pont). Le CRM ne detient jamais la cle
// service de la Lead Room : c est elle qui fabrique le lien, nous ne faisons
// que le relayer. Le lien expire vite et ne sert qu une fois.
//
// Reponse : { url?, fallback, sameSite, reason? }. sameSite dit si le CRM et la
// Lead Room partagent le meme site (entasis-conseil.fr) : c est la condition
// pour que la session tienne dans une iframe ; sinon l onglet reserve le lien
// au bouton plein ecran.

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

const LEADROOM = (process.env.LEADROOM_URL || 'https://entasis-leadroom.vercel.app').replace(/\/$/, '')
const ROLES = new Set(['advisor', 'manager'])

// Site (domaine enregistrable, approximation : deux derniers labels, sauf
// vercel.app ou chaque projet est un site distinct).
function siteOf(host) {
  const h = String(host || '').toLowerCase().split(':')[0]
  const parts = h.split('.').filter(Boolean)
  if (parts.length < 2) return h
  const tail = parts.slice(-2).join('.')
  if (tail === 'vercel.app') return parts.slice(-3).join('.')
  return tail
}

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
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\') ? rawNext : '/leadroom'
  const fallback = `${LEADROOM}${next}`
  let leadroomHost = ''
  try { leadroomHost = new URL(LEADROOM).host } catch { leadroomHost = '' }
  const sameSite = !!leadroomHost && siteOf(leadroomHost) === siteOf(req.headers?.host)

  // Sonde sans lien : l onglet sait s il peut charger un lien dans l iframe
  // (meme site) sans consommer un jeton pour rien.
  if (req.query?.probe === '1') return res.status(200).json({ fallback, sameSite })
  if (!secret) return res.status(200).json({ fallback, sameSite, reason: 'bridge_secret_missing' })
  if (!caller?.email) return res.status(200).json({ fallback, sameSite, reason: 'no_email' })

  // Le jeton ne suffit pas : le profil doit avoir ete valide par la direction.
  try {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: prof, error } = await admin
      .from('profiles').select('id, email, role, is_active, advisor_code').eq('id', caller.id).maybeSingle()
    if (error || !prof) return res.status(200).json({ fallback, sameSite, reason: 'no_profile' })
    if (prof.is_active === false) return res.status(200).json({ fallback, sameSite, reason: 'inactive' })
    if (!ROLES.has(prof.role)) return res.status(200).json({ fallback, sameSite, reason: 'role' })
    if (!String(prof.advisor_code || '').trim()) return res.status(200).json({ fallback, sameSite, reason: 'no_advisor_code' })
    if (String(prof.email || '').trim().toLowerCase() !== String(caller.email).trim().toLowerCase()) {
      return res.status(200).json({ fallback, sameSite, reason: 'email_mismatch' })
    }
  } catch {
    return res.status(200).json({ fallback, sameSite, reason: 'profile_check_failed' })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const upstream = await fetch(`${LEADROOM}/api/admin/sso-link`, {
      method: 'POST',
      headers: { 'x-bridge-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ email: caller.email, next }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const json = await upstream.json().catch(() => ({}))
    if (!upstream.ok || !json?.url) {
      return res.status(200).json({ fallback, sameSite, reason: json?.reason || json?.error || `http_${upstream.status}` })
    }
    // Le site du lien reellement renvoye fait foi (LEADROOM_PUBLIC_URL cote
    // Lead Room peut differer de LEADROOM_URL cote CRM pendant une bascule).
    let linkSameSite = sameSite
    try { linkSameSite = siteOf(new URL(json.url).host) === siteOf(req.headers?.host) } catch { /* garde la valeur calculee */ }
    return res.status(200).json({ url: json.url, fallback, sameSite: linkSameSite })
  } catch (e) {
    return res.status(200).json({ fallback, sameSite, reason: 'leadroom_unreachable', detail: e?.message })
  }
}
