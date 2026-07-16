// scripts/editorial/email.mjs
// Construction et envoi de l'email de relecture (veto) de l'agent éditorial.
// Service : API transactionnelle Brevo — même intégration que le Lead Room
// (lib/brevo-sender.ts), le domaine entasis-conseil.fr y est déjà authentifié.
//
// Variables d'environnement (lues par sendReviewEmail) :
//   BREVO_API_KEY       clé API Brevo (SMTP & API)
//   BREVO_SENDER_EMAIL  expéditeur vérifié Brevo (défaut journal@entasis-conseil.fr)

import { marked } from 'marked'
import { vetoToken } from '../../api/editorial/lib/token.js'

const fmtParis = (date) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  }).format(date)

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Construit l'objet + le corps HTML de l'email de relecture pour un package
// inséré en 'en_attente_veto'. Les liens d'action sont signés HMAC.
export function buildReviewEmail({ pkg, vetoDeadline, crmUrl, secret }) {
  const fm = pkg.article_frontmatter
  const deadline = fmtParis(new Date(vetoDeadline))
  const subject = `[Journal Entasis] Article à relire : ${fm.title} — publication auto ${deadline}`

  const base = crmUrl.replace(/\/$/, '')
  const linkFor = (action) =>
    `${base}/api/editorial/veto?id=${pkg.id}&action=${action}&token=${vetoToken(pkg.id, action, secret)}`

  const btn = (href, label, color) =>
    `<a href="${href}" style="display:inline-block;padding:12px 22px;margin:4px 8px 4px 0;` +
    `background:${color};color:#ffffff;text-decoration:none;border-radius:6px;` +
    `font-weight:600;font-size:14px;">${label}</a>`
  const actions = `
    <div style="margin:18px 0;padding:16px;background:#f6f5f2;border:1px solid #e5e2da;border-radius:8px;">
      ${btn(linkFor('publish'), 'Publier immédiatement', '#15803d')}
      ${btn(linkFor('reject'), 'Rejeter cet article', '#b91c1c')}
      <p style="margin:10px 0 0;font-size:13px;color:#6b7280;">
        Sans action de votre part, publication automatique le <strong>${deadline}</strong>
        (le cron de publication passe toutes les 6 heures).
      </p>
    </div>`

  const articleHtml = marked.parse(pkg.article_md, { async: false })
  const tweets = (pkg.thread_x || [])
    .map((t, i) => `<li style="margin:6px 0;">${esc(t)} <span style="color:#9ca3af;">(${t.length} car.)</span></li>`)
    .join('')

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#eceae5;padding:24px 8px;">
<div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:8px;
            padding:28px 32px;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;
            color:#1f2937;font-size:15px;line-height:1.55;">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin:0;">
    Agent éditorial — article à relire</p>
  <h1 style="font-size:21px;margin:6px 0 2px;">${esc(fm.title)}</h1>
  <p style="color:#6b7280;font-size:13px;margin:0 0 12px;">
    ${esc(fm.category)} · ${esc(fm.author)} · ${esc(fm.readingTime)} ·
    slug <code>${esc(pkg.article_slug)}</code></p>
  <p style="font-style:italic;color:#4b5563;">${esc(fm.description)}</p>
  ${actions}
  <h2 style="font-size:16px;border-bottom:1px solid #e5e2da;padding-bottom:6px;">Sources utilisées</h2>
  <ul style="font-size:13px;color:#4b5563;">
    ${(pkg.sources || []).map((s) => `<li><a href="${esc(s.url)}">${esc(s.titre)}</a> — ${esc(s.date)}</li>`).join('')}
  </ul>
  <h2 style="font-size:16px;border-bottom:1px solid #e5e2da;padding-bottom:6px;">Article</h2>
  <div style="font-size:14.5px;">${articleHtml}</div>
  <h2 style="font-size:16px;border-bottom:1px solid #e5e2da;padding-bottom:6px;">Post LinkedIn</h2>
  <pre style="white-space:pre-wrap;background:#f6f5f2;border:1px solid #e5e2da;border-radius:6px;
              padding:14px;font-family:inherit;font-size:13.5px;">${esc(pkg.post_linkedin || '(absent)')}</pre>
  <h2 style="font-size:16px;border-bottom:1px solid #e5e2da;padding-bottom:6px;">Thread X</h2>
  <ol style="font-size:13.5px;">${tweets}</ol>
  ${actions}
  <p style="color:#9ca3af;font-size:12px;margin-top:20px;">
    Rappel du mécanisme : cet article a été généré automatiquement puis inséré en attente de veto.
    « Rejeter » l'écarte définitivement ; « Publier immédiatement » le met en ligne sans attendre ;
    sans clic, il sera publié automatiquement après l'échéance ci-dessus.
    Les dérivés LinkedIn/X sont à publier manuellement.</p>
</div></body></html>`

  return { subject, html }
}

// Envoi via l'API transactionnelle Brevo (pattern lib/brevo-sender.ts du
// Lead Room). Lève une erreur si l'envoi échoue : dans le cron, un email de
// veto non parti doit faire échouer le job (sinon publication sans relecture).
export async function sendReviewEmail({ to, subject, html }) {
  const apiKey = (process.env.BREVO_API_KEY || '').trim()
  if (!apiKey) throw new Error('BREVO_API_KEY manquante')
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || '').trim() || 'journal@entasis-conseil.fr'

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Journal Entasis — agent éditorial', email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(`Envoi Brevo → HTTP ${resp.status} ${json?.message || ''}`)
  }
  return { messageId: json?.messageId }
}
