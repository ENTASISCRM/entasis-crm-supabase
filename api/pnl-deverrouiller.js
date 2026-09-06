// api/pnl-deverrouiller.js
// ═══════════════════════════════════════════════════════════════════════════
// Deverrouillage de l espace rentabilite. Quatre barrieres, dans cet ordre,
// et il faut les franchir toutes.
//
//   1. Jeton Supabase valide (l appelant est authentifie)
//   2. Son profil porte acces_pnl ET is_active
//   3. Sa session n est PAS une session usurpee
//   4. Le code saisi correspond a l empreinte stockee
//
// La barriere 3 est la moins evidente et la plus importante. api/impersonate.js
// genere un VRAI magic link : un manager qui usurpe une identite obtient une
// session authentique, indistinguable au niveau du jeton. Mais Supabase
// enregistre la methode d authentification dans auth.mfa_amr_claims : un magic
// link vaut « otp », une vraie connexion vaut « password » ou « oauth ». On lit
// cette table avec la cle de service, cote serveur : le navigateur ne peut pas
// mentir dessus.
//
// Tout passe au journal pnl_acces_log, y compris et surtout les refus.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'
import {
  verifierCode, signerJeton,
  MAX_TENTATIVES, DUREE_BLOCAGE_MS, DUREE_JETON_MS,
} from './_lib/pnl-jeton.js'

// Reponse volontairement identique dans tous les cas de refus : on ne dit
// jamais laquelle des quatre barrieres a bloque. Sinon on apprend a
// l attaquant qu il a le bon compte mais le mauvais code, ou l inverse.
const REFUS = { error: 'Acces refuse' }

function adminClient() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!cle) return null
  return createClient(process.env.SUPABASE_URL, cle, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function journaliser(admin, { req, user, action, detail }) {
  try {
    await admin.from('pnl_acces_log').insert({
      profile_id: user?.id || null,
      email: user?.email || null,
      action,
      detail: detail ? String(detail).slice(0, 300) : null,
      ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || null,
      agent: req.headers['user-agent']?.slice(0, 300) || null,
    })
  } catch { /* le journal ne doit jamais bloquer la reponse */ }
}

// La session courante vient elle d un vrai identifiant, ou d un magic link
// d usurpation ? On lit le session_id porte par le jeton, puis la methode
// enregistree cote Supabase.
async function sessionUsurpee(admin, sessionId) {
  if (!sessionId) return { usurpee: true, motif: 'session non identifiable' }
  const { data, error } = await admin
    .schema('auth')
    .from('mfa_amr_claims')
    .select('authentication_method')
    .eq('session_id', sessionId)
  if (error) return { usurpee: true, motif: 'methode d authentification illisible' }
  const methodes = (data || []).map((l) => l.authentication_method)
  if (methodes.length === 0) return { usurpee: true, motif: 'aucune methode enregistree' }
  // otp = magic link = usurpation possible. On exige une connexion directe.
  if (methodes.includes('otp')) return { usurpee: true, motif: 'session issue d un lien magique' }
  return { usurpee: false, methodes }
}

// Le session_id vit dans le jeton Supabase. On le lit sans faire confiance a
// sa signature (elle a deja ete verifiee par verifyAuth juste avant).
function sessionIdDuJeton(req) {
  try {
    const brut = (req.headers.authorization || '').replace('Bearer ', '')
    const charge = JSON.parse(Buffer.from(brut.split('.')[1], 'base64url').toString('utf8'))
    return charge?.session_id || null
  } catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' })

  const secret = process.env.PNL_SECRET
  const admin = adminClient()
  if (!secret || !admin) {
    return res.status(500).json({ error: 'Espace rentabilite non configure cote serveur' })
  }

  // ── Barriere 1 : authentifie ────────────────────────────────────────────
  let user
  try { user = await verifyAuth(req) }
  catch { return res.status(401).json(REFUS) }

  // ── Barriere 2 : porte le drapeau ───────────────────────────────────────
  const { data: profil } = await admin
    .from('profiles')
    .select('id, email, full_name, acces_pnl, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profil?.acces_pnl || profil.is_active === false) {
    await journaliser(admin, { req, user, action: 'refus', detail: 'profil sans acces_pnl' })
    return res.status(403).json(REFUS)
  }

  // ── Barriere 3 : session non usurpee ────────────────────────────────────
  const sessionId = sessionIdDuJeton(req)
  const { usurpee, motif } = await sessionUsurpee(admin, sessionId)
  if (usurpee) {
    await journaliser(admin, { req, user, action: 'refus', detail: `session refusee : ${motif}` })
    return res.status(403).json(REFUS)
  }

  // ── Barriere 4 : le code ────────────────────────────────────────────────
  const { data: verrou } = await admin
    .from('pnl_verrou').select('*').eq('id', true).maybeSingle()

  if (!verrou?.empreinte) {
    await journaliser(admin, { req, user, action: 'refus', detail: 'aucun code initialise' })
    return res.status(503).json({ error: 'Aucun code n a encore ete pose' })
  }

  if (verrou.bloque_jusqu_a && new Date(verrou.bloque_jusqu_a) > new Date()) {
    await journaliser(admin, { req, user, action: 'refus', detail: 'acces bloque' })
    return res.status(429).json({
      error: 'Trop de tentatives, reessayez plus tard',
      bloque_jusqu_a: verrou.bloque_jusqu_a,
    })
  }

  const code = String(req.body?.code ?? '')
  if (!code || !verifierCode(code, verrou.empreinte)) {
    const tentatives = (verrou.tentatives_echouees || 0) + 1
    const bloquer = tentatives >= MAX_TENTATIVES
    await admin.from('pnl_verrou').update({
      tentatives_echouees: bloquer ? 0 : tentatives,
      bloque_jusqu_a: bloquer ? new Date(Date.now() + DUREE_BLOCAGE_MS).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', true)

    await journaliser(admin, {
      req, user, action: 'tentative',
      detail: bloquer ? `code errone, blocage apres ${MAX_TENTATIVES} essais` : `code errone (${tentatives}/${MAX_TENTATIVES})`,
    })
    return res.status(bloquer ? 429 : 403).json(REFUS)
  }

  // ── Ouvert ──────────────────────────────────────────────────────────────
  await admin.from('pnl_verrou')
    .update({ tentatives_echouees: 0, bloque_jusqu_a: null, updated_at: new Date().toISOString() })
    .eq('id', true)

  await journaliser(admin, { req, user, action: 'deverrouillage', detail: `session ${sessionId?.slice(0, 8) || '?'}` })

  return res.status(200).json({
    jeton: signerJeton({ userId: user.id, sessionId, secret }),
    expire_dans_ms: DUREE_JETON_MS,
  })
}
