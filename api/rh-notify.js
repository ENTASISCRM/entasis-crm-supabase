// api/rh-notify.js
// Notifications mail Smart RH via Brevo. Appele par le client APRES une
// action reussie (fire and forget) :
//   - nouvelle_demande      -> mail a la direction RH (managers @entasis + RH delegue)
//   - decision              -> mail au salarie (valide ou refuse)
//   - contre_proposition    -> mail au salarie (autres dates proposees)
//   - reponse_contre        -> mail a la direction (accepte ou refuse)
//   - absence_direction     -> mail au salarie (absence saisie par la direction)
//
// SECURITE : client Supabase avec le JWT de l appelant (RLS identique au
// navigateur). Les destinataires sont calcules ICI, jamais fournis par le
// client. Les types decision / contre_proposition / absence_direction sont
// reserves aux profils RH (public.is_rh()). Aucune information de
// remuneration dans les mails.

import { createClient } from '@supabase/supabase-js'

const fmtDate = (s) => {
  if (!s) return ''
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const periode = (c) => c?.demi_journee
  ? `le ${fmtDate(c.date_debut)} (demi-journee)`
  : `du ${fmtDate(c?.date_debut)} au ${fmtDate(c?.date_fin)}`

async function envoyerMail({ to, subject, lignes }) {
  const html = `<html><body style="font-family:Arial,sans-serif;font-size:14px;color:#1c1c1e">
    ${lignes.map((l) => `<p style="margin:6px 0">${l}</p>`).join('')}
    <p style="margin:18px 0 6px;color:#8a8a8e;font-size:12px">Mail automatique du CRM Entasis (onglet Smart RH).</p>
  </body></html>`
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Entasis CRM', email: process.env.BREVO_SENDER_EMAIL },
      to: to.map((email) => ({ email })),
      subject,
      htmlContent: html,
    }),
  })
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' })
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' })
  const token = authHeader.slice(7)

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: uErr } = await sb.auth.getUser(token)
  if (uErr || !user) return res.status(401).json({ error: 'Token invalide' })

  const { type, conge } = req.body || {}
  if (!type || !conge) return res.status(400).json({ error: 'Requete incomplete' })

  try {
    const { data: prof } = await sb
      .from('profiles').select('id, full_name, email, role').eq('id', user.id).maybeSingle()

    // Direction RH : via la fonction definer (les conseillers ne peuvent pas
    // lire la table profiles, mais doivent pouvoir declencher le mail)
    const directionEmails = async () => {
      const { data } = await sb.rpc('rh_direction_emails')
      return Array.isArray(data) ? data.filter(Boolean) : []
    }
    const emailDe = async (profileId) => {
      if (!profileId) return null
      const { data } = await sb.from('profiles').select('email').eq('id', profileId).maybeSingle()
      return data?.email || null
    }
    const estRh = async () => {
      const { data } = await sb.rpc('is_rh')
      return data === true
    }

    if (type === 'nouvelle_demande') {
      const to = await directionEmails()
      if (to.length === 0) return res.status(200).json({ sent: false })
      await envoyerMail({
        to,
        subject: `Smart RH : demande de ${prof?.full_name || 'un collaborateur'} (${conge.type || 'Congé payé'})`,
        lignes: [
          `<b>${prof?.full_name || 'Un collaborateur'}</b> vient de poser une demande.`,
          `Type : ${conge.type || 'Congé payé'}`,
          `Dates : ${periode(conge)}${conge.jours ? ` (${conge.jours})` : ''}`,
          conge.motif ? `Motif : ${conge.motif}` : '',
          `À valider dans l onglet Smart RH du CRM.`,
        ].filter(Boolean),
      })
      return res.status(200).json({ sent: true })
    }

    if (type === 'reponse_contre') {
      const to = await directionEmails()
      if (to.length === 0) return res.status(200).json({ sent: false })
      await envoyerMail({
        to,
        subject: `Smart RH : ${prof?.full_name || 'un collaborateur'} a ${conge.accepte ? 'accepté' : 'refusé'} la contre-proposition`,
        lignes: [
          `<b>${prof?.full_name || 'Un collaborateur'}</b> a ${conge.accepte ? 'accepté les nouvelles dates' : 'refusé la contre-proposition (demande annulée)'}.`,
          `Dates proposées : ${conge.contre_demi_journee ? `le ${fmtDate(conge.contre_date_debut)} (demi-journee)` : `du ${fmtDate(conge.contre_date_debut)} au ${fmtDate(conge.contre_date_fin)}`}`,
        ],
      })
      return res.status(200).json({ sent: true })
    }

    // Tous les types suivants sont reserves a la direction RH
    if (!(await estRh())) return res.status(403).json({ error: 'Reserve a la direction' })
    const dest = await emailDe(conge.demandeur_id)
    if (!dest) return res.status(200).json({ sent: false })

    if (type === 'decision') {
      const valide = conge.statut === 'valide'
      await envoyerMail({
        to: [dest],
        subject: valide ? 'Votre demande de congé est validée' : 'Votre demande de congé est refusée',
        lignes: [
          `Votre demande (${conge.type || 'Congé payé'}, ${periode(conge)}) a été <b>${valide ? 'validée' : 'refusée'}</b> par ${prof?.full_name || 'la direction'}.`,
          conge.decision_motif ? `${valide ? 'Commentaire' : 'Motif'} : ${conge.decision_motif}` : '',
          `Le détail est visible dans l onglet Smart RH du CRM.`,
        ].filter(Boolean),
      })
      return res.status(200).json({ sent: true })
    }

    if (type === 'contre_proposition') {
      await envoyerMail({
        to: [dest],
        subject: 'Smart RH : la direction vous propose d autres dates',
        lignes: [
          `Votre demande (${periode(conge)}) ne convient pas telle quelle.`,
          `La direction vous propose : <b>${conge.contre_demi_journee ? `le ${fmtDate(conge.contre_date_debut)} (demi-journee)` : `du ${fmtDate(conge.contre_date_debut)} au ${fmtDate(conge.contre_date_fin)}`}</b>`,
          conge.contre_message ? `Message : ${conge.contre_message}` : '',
          `Acceptez ou refusez dans l onglet Smart RH du CRM.`,
        ].filter(Boolean),
      })
      return res.status(200).json({ sent: true })
    }

    if (type === 'absence_direction') {
      await envoyerMail({
        to: [dest],
        subject: 'Smart RH : une absence a été enregistrée pour vous',
        lignes: [
          `${prof?.full_name || 'La direction'} a enregistré une absence à votre nom.`,
          `Type : ${conge.type || 'Maladie'}`,
          `Dates : ${periode(conge)}`,
          conge.motif ? `Motif : ${conge.motif}` : '',
          `Elle est visible dans l onglet Smart RH du CRM.`,
        ].filter(Boolean),
      })
      return res.status(200).json({ sent: true })
    }

    return res.status(400).json({ error: 'Type inconnu' })
  } catch (e) {
    console.error('[rh-notify]', e)
    return res.status(500).json({ error: e?.message || 'Erreur envoi' })
  }
}
