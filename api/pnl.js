// api/pnl.js
// ═══════════════════════════════════════════════════════════════════════════
// Les chiffres de rentabilite. Exige LES DEUX jetons : celui de Supabase (qui
// dit qui vous etes) et celui du deverrouillage (qui dit que vous avez donne
// le code, dans cette session, il y a moins de quinze minutes).
//
// Sans les deux, la route repond 403 et ne calcule RIEN : elle ne touche meme
// pas la base. C est ici que le bareme s applique, jamais dans le navigateur.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'
import { verifierJeton } from './_lib/pnl-jeton.js'

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
  } catch { /* le journal ne bloque jamais */ }
}

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
  if (!secret || !admin) return res.status(500).json({ error: 'Espace rentabilite non configure' })

  // ── Les deux jetons, avant toute lecture de donnee ───────────────────────
  let user
  try { user = await verifyAuth(req) }
  catch { return res.status(401).json(REFUS) }

  const jeton = req.headers['x-pnl-jeton'] || req.body?.jeton
  const v = verifierJeton({
    jeton, userId: user.id, sessionId: sessionIdDuJeton(req), secret,
  })
  if (!v.ok) {
    await journaliser(admin, { req, user, action: 'refus', detail: `jeton refuse : ${v.motif}` })
    return res.status(403).json(REFUS)
  }

  // Ceinture et bretelles : le drapeau est revalide a CHAQUE lecture. Si Louis
  // le retire a quelqu un, son jeton de quinze minutes ne lui sert plus.
  const { data: profil } = await admin
    .from('profiles').select('acces_pnl, is_active').eq('id', user.id).maybeSingle()
  if (!profil?.acces_pnl || profil.is_active === false) {
    await journaliser(admin, { req, user, action: 'refus', detail: 'drapeau retire entre temps' })
    return res.status(403).json(REFUS)
  }

  const annee = Number(req.body?.annee) || new Date().getFullYear()
  const vue = String(req.body?.vue || 'tout')
  // L ecran peut demander la vue avec ou sans la part de frais fixes. Ce
  // choix ne deplace que des couts entre les personnes : le resultat du
  // cabinet, lui, prend toujours la structure pour son montant annuel entier.
  const repartir = typeof req.body?.repartir === 'boolean' ? req.body.repartir : null

  try {
    // ── Les lignes par personne, calculees en base ────────────────────────
    const { data: lignes, error } = await admin.rpc('pnl_conseiller_annuel', {
      p_annee: annee, p_repartir: repartir,
    })
    if (error) throw error

    // ── Le mensuel, lu directement du grand livre ─────────────────────────
    const { data: mensuel } = await admin
      .from('production_encaissee')
      .select('mois, volume_pp, volume_pu, commission_encaissee, commission_attendue, retrocession')
      .eq('annee', annee)

    const parMois = Array.from({ length: 12 }, (_, i) => ({
      mois: i + 1, pp: 0, pu: 0, commission: 0, attendue: 0, retrocession: 0, contrats: 0,
    }))
    for (const l of mensuel || []) {
      const m = parMois[(l.mois || 1) - 1]
      if (!m) continue
      m.pp += Number(l.volume_pp || 0)
      m.pu += Number(l.volume_pu || 0)
      m.commission += Number(l.commission_encaissee || 0)
      m.attendue += Number(l.commission_attendue || 0)
      m.retrocession += Number(l.retrocession || 0)
      m.contrats += 1
    }

    // ── La structure, pour son montant annuel entier ──────────────────────
    // Un bureau vide se paye quand meme : le cabinet porte les douze mois,
    // que les postes aient ete occupes ou non.
    const { data: prm } = await admin
      .from('pnl_parametres')
      .select('frais_fixes_mensuels, repartir_frais_fixes')
      .eq('id', true).maybeSingle()

    const cabinet = {
      structure_mensuelle: Number(prm?.frais_fixes_mensuels || 0),
      structure_annuelle: Number(prm?.frais_fixes_mensuels || 0) * 12,
      repartir: repartir == null ? Boolean(prm?.repartir_frais_fixes) : repartir,
    }

    await journaliser(admin, { req, user, action: 'lecture', detail: `annee ${annee}, vue ${vue}` })

    return res.status(200).json({ annee, lignes: lignes || [], parMois, cabinet })
  } catch (e) {
    await journaliser(admin, { req, user, action: 'refus', detail: `erreur : ${e.message}` })
    return res.status(500).json({ error: 'Calcul impossible' })
  }
}
