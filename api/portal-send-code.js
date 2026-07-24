// POST /api/portal-send-code { email }
// Envoie un code de connexion à 6 chiffres à un compte de l'ESPACE CLIENT.
// Appelé en CORS depuis l'app espace client (statique, sans secrets) : cette
// route vit dans le projet CRM car c'est lui qui détient les clés serveur.
//
// SÉCURITÉ
//   • Réponse TOUJOURS générique ({ ok: true }) : on ne révèle jamais si un
//     email possède un compte ou non (pas d'énumération).
//   • Le code vient de auth.admin.generateLink (email_otp) — jamais envoyé
//     par le SMTP Supabase : c'est Brevo qui livre, domaine authentifié.
//   • Anti-rafale : 60 s minimum entre deux codes pour un même compte
//     (client_accounts.last_code_sent_at).
//   • SUPABASE_SERVICE_ROLE_KEY strictement côté serveur.
//   • CORS restreint aux origines du portail.
import { createClient } from '@supabase/supabase-js'

const ORIGINS_AUTORISEES = new Set([
  'https://entasis-espace-client.vercel.app',
  'https://espace.entasis-conseil.fr',
  'http://localhost:5173',
])

function poserCors(req, res) {
  const origin = req.headers.origin
  if (origin && ORIGINS_AUTORISEES.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
}

export default async function handler(req, res) {
  poserCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const email = String(req.body?.email || '').trim().toLowerCase()
  const generic = { ok: true }
  if (!email || !email.includes('@') || email.length > 200) return res.status(200).json(generic)

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const brevoKey = (process.env.BREVO_API_KEY || '').trim()
  if (!url || !serviceKey || !brevoKey) {
    console.error('[send-code] configuration serveur incomplète')
    return res.status(200).json(generic)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: acct } = await admin
      .from('client_accounts')
      .select('user_id, actif, last_code_sent_at')
      .eq('email', email)
      .maybeSingle()
    if (!acct || !acct.actif) return res.status(200).json(generic)

    // Anti-rafale : 60 s entre deux envois.
    if (acct.last_code_sent_at && Date.now() - new Date(acct.last_code_sent_at).getTime() < 60_000) {
      return res.status(200).json(generic)
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    const code = linkData?.properties?.email_otp
    if (linkErr || !code) {
      console.error('[send-code] generateLink', linkErr?.message)
      return res.status(200).json(generic)
    }

    const html = `
      <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#2C3548">
        <div style="font-size:20px;color:#162443;margin-bottom:4px">Entasis Conseil</div>
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C5A55A;margin-bottom:28px">Espace priv&eacute;</div>
        <p style="font-size:15px;line-height:1.7;margin:0 0 18px">Voici votre code de connexion &agrave; votre espace client&nbsp;:</p>
        <div style="font-size:34px;letter-spacing:10px;color:#162443;text-align:center;padding:18px 0;border-top:1px solid #E4E0D6;border-bottom:1px solid #E4E0D6;margin-bottom:18px;font-variant-numeric:tabular-nums">${code}</div>
        <p style="font-size:13px;line-height:1.7;color:#8A95A8;margin:0">
          Ce code est valable une heure et &agrave; usage unique.
          Si vous n'&ecirc;tes pas &agrave; l'origine de cette demande, ignorez simplement ce message&nbsp;:
          personne ne peut acc&eacute;der &agrave; votre espace sans ce code.
        </p>
      </div>`

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: {
          name: 'Entasis Conseil',
          email: (process.env.BREVO_SENDER_EMAIL || '').trim() || 'rdv@entasis-conseil.fr',
        },
        to: [{ email }],
        subject: `${code} — votre code de connexion Entasis`,
        htmlContent: html,
      }),
    })
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}))
      console.error('[send-code] brevo', resp.status, j?.message)
      return res.status(200).json(generic)
    }

    await admin
      .from('client_accounts')
      .update({ last_code_sent_at: new Date().toISOString() })
      .eq('user_id', acct.user_id)

    return res.status(200).json(generic)
  } catch (e) {
    console.error('[send-code]', e?.message)
    return res.status(200).json(generic)
  }
}
