// scripts/editorial/newsletter-monthly.mjs
// Cron GitHub Actions (le 1er du mois) : assemble la newsletter mensuelle du
// Journal à partir des articles PUBLIÉS depuis la dernière newsletter, crée
// une campagne Brevo en BROUILLON (jamais d'envoi automatique — la relecture
// et l'envoi se font dans Brevo), trace la campagne dans editorial_newsletters
// et notifie le reviewer.
//
// Usage :
//   node scripts/editorial/newsletter-monthly.mjs [--dry-run]
//   --dry-run : sélection réelle (lecture seule) mais édito factice (pas
//               d'appel Anthropic), pas de campagne Brevo, pas d'insert,
//               pas de notification — le HTML complet est imprimé sur stdout.
//
// Variables d'environnement requises (secrets GitHub Actions / .env local) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  base
//   ANTHROPIC_API_KEY                        édito d'intro (appel court)
//   BREVO_API_KEY                            création de la campagne + notification
//   EDITORIAL_REVIEWER_EMAIL                 notification « newsletter prête »
//   BREVO_LIST_ID          optionnel — id numérique de la liste de destinataires
//                          (Brevo → Contacts → Listes, l'ID est dans l'URL et la
//                          colonne ID). Absent : brouillon créé SANS liste (à
//                          sélectionner dans Brevo avant envoi).
//   BREVO_SENDER_EMAIL     optionnel — expéditeur vérifié (défaut journal@…)

import { createClient } from '@supabase/supabase-js'
import { loadDotenv, requireEnv } from './env.mjs'
import { sendReviewEmail } from './email.mjs'

loadDotenv()

const dryRun = process.argv.includes('--dry-run')
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
if (!dryRun) required.push('ANTHROPIC_API_KEY', 'BREVO_API_KEY', 'EDITORIAL_REVIEWER_EMAIL')
requireEnv(required)

const SITE_JOURNAL = 'https://www.entasis-conseil.fr/journal'
const log = (msg) => console.log(`[newsletter] ${msg}`)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── 1. Période : depuis la fin de la dernière newsletter (ou le début) ─────
let periodStart = '1970-01-01T00:00:00Z'
{
  const { data, error } = await admin
    .from('editorial_newsletters')
    .select('period_end')
    .order('period_end', { ascending: false })
    .limit(1)
  // PGRST205 / 42P01 : table absente (migration non exécutée) — bloquant
  // seulement hors dry-run, où il faudra insérer.
  if (error && !dryRun) {
    console.error(`[newsletter] Table editorial_newsletters inaccessible (migration_editorial_formats.sql exécutée ?) : ${error.message}`)
    process.exit(1)
  }
  if (data?.[0]?.period_end) periodStart = data[0].period_end
}
const periodEnd = new Date().toISOString()
log(`Période couverte : ${periodStart} → ${periodEnd}`)

// ── 2. Articles publiés sur la période ──────────────────────────────────────
const { data: published, error: pubErr } = await admin
  .from('editorial_packages')
  .select('article_slug, article_frontmatter, published_at')
  .eq('statut', 'publie')
  .gt('published_at', periodStart)
  .lte('published_at', periodEnd)
  .order('published_at', { ascending: true })
if (pubErr) {
  console.error(`[newsletter] Sélection articles : ${pubErr.message}`)
  process.exit(1)
}
if (!published.length) {
  log('Aucun article publié sur la période — aucune newsletter créée (sortie propre).')
  process.exit(0)
}
log(`${published.length} article(s) publié(s) sur la période :`)
for (const p of published) log(`  - ${p.article_frontmatter?.title} (${p.article_slug})`)

// ── 3. Édito d'intro (appel Anthropic court, PAS de web search) ────────────
const moisAnnee = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' })
  .format(new Date())

async function generateEdito() {
  const listing = published
    .map((p) => `- « ${p.article_frontmatter?.title} » : ${p.article_frontmatter?.description}`)
    .join('\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `Tu rédiges l'édito d'introduction de la newsletter mensuelle du Journal d'Entasis Conseil (cabinet de gestion de patrimoine indépendant, Paris 8e), à destination d'une clientèle patrimoniale. Ton : celui du Journal — factuel, pédagogique, sans superlatif commercial. Conformité AMF : aucune promesse de rendement, aucun conseil personnalisé, rappeler que les équipes sont disponibles pour un échange. Réponds UNIQUEMENT avec le texte de l'édito (150 à 200 mots, 2 à 3 paragraphes, pas de titre, pas de markdown).`,
      messages: [{
        role: 'user',
        content: `Newsletter de ${moisAnnee}. Articles publiés ce mois-ci sur le Journal :\n${listing}\n\nRédige l'édito d'introduction qui donne envie de lire ces articles, en dégageant le fil rouge du mois.`,
      }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`API Anthropic : ${data.error.message}`)
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
}

const edito = dryRun
  ? `[DRY-RUN] Édito factice de ${moisAnnee} — deux paragraphes de contrôle du gabarit. Les articles du mois couvrent l'actualité patrimoniale sélectionnée par le cabinet.\n\nNos équipes restent disponibles pour échanger sur ces sujets.`
  : await generateEdito()
log(`Édito : ${edito.split(/\s+/).length} mots`)

// ── 4. Corps HTML de la campagne ────────────────────────────────────────────
const cards = published.map((p) => {
  const fm = p.article_frontmatter || {}
  const url = `${SITE_JOURNAL}/${p.article_slug}`
  const img = fm.image
    ? `<img src="${esc(fm.image.startsWith('http') ? fm.image : `https://www.entasis-conseil.fr${fm.image}`)}" alt="" width="560" style="width:100%;border-radius:8px 8px 0 0;display:block;">`
    : ''
  return `
    <div style="border:1px solid #e5e2da;border-radius:8px;margin:16px 0;overflow:hidden;">
      ${img}
      <div style="padding:16px 20px;">
        <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#a6843f;margin-bottom:4px;">${esc(fm.category || '')}</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px;"><a href="${url}" style="color:#0a1628;text-decoration:none;">${esc(fm.title || p.article_slug)}</a></div>
        <div style="font-size:13px;color:#4b5563;line-height:1.5;margin-bottom:10px;">${esc(fm.description || '')}</div>
        <a href="${url}" style="font-size:13px;font-weight:600;color:#a6843f;">Lire l'article →</a>
      </div>
    </div>`
}).join('')

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#eceae5;padding:24px 8px;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;
            padding:28px 32px;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a6843f;margin:0 0 4px;">Le Journal — Entasis Conseil</p>
  <h1 style="font-size:20px;margin:0 0 16px;">La lettre patrimoniale de ${esc(moisAnnee)}</h1>
  <div style="font-size:14px;line-height:1.65;color:#374151;">
    ${edito.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')}
  </div>
  ${cards}
  <p style="font-size:13px;margin-top:20px;">
    <a href="https://www.entasis-conseil.fr/contact" style="color:#a6843f;font-weight:600;">Prendre rendez-vous avec un conseiller →</a>
  </p>
  <hr style="border:none;border-top:1px solid #e5e2da;margin:24px 0 14px;">
  <p style="font-size:11px;color:#9ca3af;line-height:1.5;">
    Entasis Conseil — cabinet de gestion de patrimoine indépendant, Paris 8e.
    Cette lettre a un caractère purement informatif et ne constitue pas un conseil en investissement
    personnalisé. Tout investissement comporte un risque de perte en capital.<br>
    Vous recevez cet email car vous êtes inscrit à la lettre du Journal.
    <a href="{{ unsubscribe }}" style="color:#9ca3af;">Se désinscrire</a>
  </p>
</div></body></html>`

const campaignName = `Newsletter Entasis — ${moisAnnee}`

if (dryRun) {
  log(`DRY-RUN — campagne qui serait créée : « ${campaignName} » (brouillon, liste ${process.env.BREVO_LIST_ID || 'NON DÉFINIE'})`)
  log('HTML complet ci-dessous (aucune création) :')
  console.log(html)
  process.exit(0)
}

// ── 5. Création de la campagne Brevo en BROUILLON (aucun envoi) ─────────────
const listId = process.env.BREVO_LIST_ID ? Number(process.env.BREVO_LIST_ID) : null
const campaignBody = {
  name: campaignName,
  subject: `La lettre patrimoniale de ${moisAnnee} — Entasis Conseil`,
  sender: {
    name: 'Entasis Conseil — Le Journal',
    email: (process.env.BREVO_SENDER_EMAIL || '').trim() || 'journal@entasis-conseil.fr',
  },
  type: 'classic',
  htmlContent: html,
  ...(listId && { recipients: { listIds: [listId] } }),
}
if (!listId) {
  log('BREVO_LIST_ID absent : tentative de création du brouillon SANS liste (à sélectionner dans Brevo avant envoi).')
}

const brevoRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
  method: 'POST',
  headers: { 'api-key': process.env.BREVO_API_KEY.trim(), 'Content-Type': 'application/json', accept: 'application/json' },
  body: JSON.stringify(campaignBody),
})
const brevoJson = await brevoRes.json().catch(() => ({}))
if (!brevoRes.ok) {
  if (!listId) {
    console.error(`[newsletter] Création sans liste refusée par Brevo (HTTP ${brevoRes.status} ${brevoJson.message || ''}). Configurer le secret BREVO_LIST_ID : Brevo → Contacts → Listes → colonne ID (aussi visible dans l'URL de la liste).`)
  } else {
    console.error(`[newsletter] Création campagne Brevo → HTTP ${brevoRes.status} ${brevoJson.message || ''}`)
  }
  process.exit(1)
}
const campaignId = brevoJson.id
log(`Campagne Brevo créée en BROUILLON : id ${campaignId} « ${campaignName} »`)

// ── 6. Trace en base ────────────────────────────────────────────────────────
const { error: insErr } = await admin.from('editorial_newsletters').insert({
  period_start: periodStart,
  period_end: periodEnd,
  brevo_campaign_id: String(campaignId),
  statut: 'draft',
})
if (insErr) {
  console.error(`[newsletter] Campagne ${campaignId} créée mais trace en base en échec : ${insErr.message} — corriger à la main pour éviter un doublon de période au prochain run.`)
  process.exit(1)
}

// ── 7. Notification au reviewer ─────────────────────────────────────────────
await sendReviewEmail({
  to: process.env.EDITORIAL_REVIEWER_EMAIL,
  subject: `[Journal Entasis] Newsletter ${moisAnnee} prête dans Brevo — relire et envoyer`,
  html: `<!doctype html><html lang="fr"><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
    <p>La newsletter mensuelle « <strong>${esc(campaignName)}</strong> » vient d'être créée en <strong>brouillon</strong> dans Brevo
    (campagne n° ${campaignId}, ${published.length} article${published.length > 1 ? 's' : ''}).</p>
    <p><strong>Rien ne partira sans vous :</strong> la relecture, le choix/la vérification de la liste de destinataires
    et l'envoi se font depuis Brevo.</p>
    <p><a href="https://app.brevo.com/marketing-campaign/list" style="color:#a6843f;font-weight:600;">Ouvrir les campagnes Brevo →</a></p>
  </body></html>`,
})
log(`Notification envoyée à ${process.env.EDITORIAL_REVIEWER_EMAIL}. Terminé.`)
