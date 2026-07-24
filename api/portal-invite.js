// ═══════════════════════════════════════════════════════════════════════════
// API : POST /api/portal-invite  { clientId }
// Ouvre l'accès à l'espace client pour une fiche client : crée (ou retrouve)
// l'utilisateur auth Supabase correspondant à l'email du client, pose la
// ligne client_accounts, et prévient le client par email (Brevo) si la clé
// est configurée.
//
// SÉCURITÉ
//   • Appelant authentifié (Bearer JWT)
//   • Autorisé : manager, OU conseiller/co-conseiller de la fiche
//   • SUPABASE_SERVICE_ROLE_KEY strictement côté serveur
//   • Aucun mot de passe : le client se connecte par code email (voir
//     l'app espace client, /api/send-code)
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

const PORTAL_URL = (process.env.PORTAL_URL || 'https://entasis-espace-client.vercel.app').replace(/\/$/, '')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let caller
  try {
    caller = await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  const { clientId } = req.body || {}
  if (!clientId) return res.status(400).json({ error: 'clientId requis' })

  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!adminKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configuré' })
  const admin = createClient(process.env.SUPABASE_URL, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Appelant : manager, ou conseiller de la fiche.
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('id, role, advisor_code, full_name')
    .eq('id', caller.id)
    .single()
  if (!callerProfile) return res.status(403).json({ error: 'Profil introuvable' })

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, prenom, nom, email, advisor_code, co_advisor_code')
    .eq('id', clientId)
    .single()
  if (clientErr || !client) return res.status(404).json({ error: 'Client introuvable' })

  const autorise = callerProfile.role === 'manager'
    || (callerProfile.advisor_code && [client.advisor_code, client.co_advisor_code].includes(callerProfile.advisor_code))
  if (!autorise) return res.status(403).json({ error: 'Réservé au conseiller de ce client' })

  const email = (client.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'La fiche client n\'a pas d\'email valide' })
  }

  // Un email de membre de l'équipe ne peut pas devenir un compte client :
  // les deux mondes (profiles / client_accounts) doivent rester disjoints.
  const { data: staffExistant } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (staffExistant) {
    return res.status(400).json({ error: 'Cet email appartient à un compte conseiller — utilisez l\'email personnel du client' })
  }

  // Utilisateur auth : créé, ou retrouvé s'il existe déjà (generateLink
  // renvoie l'utilisateur sans envoyer d'email). La metadata portal_client
  // empêche le trigger handle_new_user de créer un profil staff.
  let userId = null
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { portal_client: 'true' },
  })
  if (!createErr) {
    userId = created?.user?.id
  } else {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    userId = linkData?.user?.id
    if (linkErr || !userId) {
      console.error('[portal-invite] user lookup', createErr?.message, linkErr?.message)
      return res.status(500).json({ error: 'Création du compte impossible' })
    }
  }

  const { error: upsertErr } = await admin
    .from('client_accounts')
    .upsert(
      { user_id: userId, client_id: client.id, email, actif: true, invited_by: caller.id },
      { onConflict: 'user_id' },
    )
  if (upsertErr) {
    console.error('[portal-invite] upsert client_accounts', upsertErr.message)
    return res.status(500).json({ error: 'Activation du compte impossible' })
  }

  // Notification au client (best effort — l'accès marche même sans email).
  let emailSent = false
  const brevoKey = (process.env.BREVO_API_KEY || '').trim()
  if (brevoKey) {
    const html = `
      <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#2C3548">
        <div style="font-size:20px;color:#162443;margin-bottom:4px">Entasis Conseil</div>
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C5A55A;margin-bottom:28px">Espace priv&eacute;</div>
        <p style="font-size:15px;line-height:1.7;margin:0 0 14px">Bonjour${client.prenom ? ' ' + client.prenom : ''},</p>
        <p style="font-size:15px;line-height:1.7;margin:0 0 22px">
          Votre espace client Entasis est ouvert. Vous y retrouverez vos contrats,
          leur &eacute;volution et vos documents, en toute confidentialit&eacute;.
        </p>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${PORTAL_URL}" style="display:inline-block;background:#0B1A2E;color:#F5EDD8;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:14px 26px;border-radius:2px">Acc&eacute;der &agrave; mon espace</a>
        </div>
        <p style="font-size:13px;line-height:1.7;color:#8A95A8;margin:0">
          La connexion se fait sans mot de passe&nbsp;: saisissez cette adresse email
          et vous recevrez un code &agrave; usage unique.
        </p>
      </div>`
    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: {
            name: 'Entasis Conseil',
            email: (process.env.BREVO_SENDER_EMAIL || '').trim() || 'rdv@entasis-conseil.fr',
          },
          to: [{ email }],
          replyTo: callerProfile.full_name ? { email: caller.email, name: callerProfile.full_name } : undefined,
          subject: 'Votre espace client Entasis est ouvert',
          htmlContent: html,
        }),
      })
      emailSent = resp.ok
      if (!resp.ok) console.error('[portal-invite] brevo', resp.status)
    } catch (e) {
      console.error('[portal-invite] brevo', e?.message)
    }
  }

  return res.status(200).json({ ok: true, emailSent, portalUrl: PORTAL_URL })
}
