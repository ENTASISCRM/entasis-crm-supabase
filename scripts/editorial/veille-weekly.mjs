// scripts/editorial/veille-weekly.mjs
// Cron GitHub Actions (vendredi 15h UTC) : produit la NOTE DE VEILLE
// RÉGLEMENTAIRE HEBDOMADAIRE du cabinet et l'envoie par email. Un seul appel
// Anthropic avec web search (couche callAnthropic partagée de
// api/editorial/lib/generation.js) balaie l'actualité des 7 derniers jours ;
// la note est structurée en JSON (parseModelJson), rendue en email sobre et
// tracée dans veille_notes.
//
// L'email part TOUJOURS (même semaine calme) : son absence signale une panne,
// pas une semaine sans actualité.
//
// Usage :
//   node scripts/editorial/veille-weekly.mjs [--dry-run] [--test]
//   --dry-run : AUCUN appel Anthropic, note factice, HTML imprimé sur stdout,
//               aucun envoi, aucune écriture en base.
//   --test    : génération RÉELLE, email envoyé à EDITORIAL_REVIEWER_EMAIL (et
//               non au destinataire de prod), note tracée en base avec la
//               synthèse préfixée « [NOTE DE TEST] », garde-fou anti-doublon
//               désactivé. Réservé à la recette.
//
// Variables d'environnement requises (secrets GitHub Actions / .env local) :
//   ANTHROPIC_API_KEY          recherche + rédaction de la note
//   SUPABASE_URL               base
//   SUPABASE_SERVICE_ROLE_KEY  base (bypass RLS)
//   BREVO_API_KEY              envoi de l'email
//   VEILLE_RECIPIENT_EMAIL     destinataire de la note (prod ; en --test on
//                              utilise EDITORIAL_REVIEWER_EMAIL à la place)
//   EDITORIAL_REVIEWER_EMAIL   destinataire en --test
//   BREVO_SENDER_EMAIL         optionnel, expéditeur vérifié Brevo

import { fetch as undiciFetch, Agent } from 'undici'
import { createClient } from '@supabase/supabase-js'
import { loadDotenv, requireEnv } from './env.mjs'

// L'appel Anthropic avec web search peut rester silencieux plusieurs minutes ;
// fetch global remplacé par npm-undici + Agent à timeouts longs (15 min),
// comme les autres crons éditoriaux. Ne jamais mélanger l'Agent npm avec le
// fetch natif de Node (interfaces incompatibles).
const dispatcher = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 })
globalThis.fetch = (url, opts = {}) => undiciFetch(url, { ...opts, dispatcher })

loadDotenv()

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const testMode = args.includes('--test')

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
if (!dryRun) {
  required.push('ANTHROPIC_API_KEY', 'BREVO_API_KEY')
  required.push(testMode ? 'EDITORIAL_REVIEWER_EMAIL' : 'VEILLE_RECIPIENT_EMAIL')
}
requireEnv(required)

const { callAnthropic, extractText, parseModelJson } =
  await import('../../api/editorial/lib/generation.js')
const { formatFiscalContext } = await import('../../api/editorial/fiscal-constants.js')
const { buildVeilleSystemPrompt, buildVeilleUserPrompt, VEILLE_FORMAT_RETRY_REMINDER, NIVEAUX } =
  await import('../../api/editorial/prompts-veille.js')
const { sendReviewEmail } = await import('./email.mjs')

const MAX_GENERATIONS = 2 // 1 génération + 1 retry métier si sortie non parsable
const log = (msg) => console.log(`[veille] ${msg}`)
const warn = (msg) => console.error(`[veille] WARNING : ${msg}`)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── 1. Période couverte : les 7 derniers jours ──────────────────────────────
const now = new Date()
const startOfDayUtc = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const periodStart = startOfDayUtc(new Date(now.getTime() - 7 * 24 * 3600 * 1000))
const periodStartIso = periodStart.toISOString()
const periodEndIso = now.toISOString()
const dateDebut = periodStartIso.slice(0, 10)
const dateFin = periodEndIso.slice(0, 10)
const dateIso = dateFin

const fmtFr = (isoDay) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${isoDay}T12:00:00Z`))

log(`Période couverte : ${dateDebut} → ${dateFin}${testMode ? ' (MODE TEST)' : ''}${dryRun ? ' (DRY-RUN)' : ''}`)

// ── 2. Garde-fou anti-doublon (désactivé en dry-run et en test) ─────────────
if (!dryRun && !testMode) {
  const startOfToday = startOfDayUtc(now).toISOString()
  const { data: existing, error: guardErr } = await admin
    .from('veille_notes')
    .select('id, sent_at, period_end')
    .not('sent_at', 'is', null)
    .gte('period_end', startOfToday)
    .limit(1)
  if (guardErr) {
    // Table absente (migration non exécutée) : bloquant hors dry-run.
    console.error(`[veille] Table veille_notes inaccessible (migration_editorial_veille.sql exécutée ?) : ${guardErr.message}`)
    process.exit(1)
  }
  if (existing && existing.length) {
    log(`Une note de veille a déjà été envoyée aujourd'hui (id ${existing[0].id}, sent_at ${existing[0].sent_at}) — sortie propre, aucun doublon.`)
    process.exit(0)
  }
}

// ── 3. Génération de la note (ou note factice en dry-run) ───────────────────
// Valide et normalise la note. La structure de tête (objet, items array) est
// impérative → retry métier si absente. Les défauts par item sont TOLÉRÉS :
// item sans URL/titre/résumé/impact écarté avec un warning (un item mal formé
// ne doit pas faire échouer toute la note), niveau inconnu ramené à « info ».
function normalizeNote(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('sortie JSON : objet de note attendu')
  }
  if (!Array.isArray(obj.items)) {
    throw new Error('sortie JSON : "items" doit être un tableau')
  }
  const synthese = typeof obj.synthese === 'string' ? obj.synthese.trim() : ''

  const items = []
  for (const [i, it] of obj.items.entries()) {
    const nonEmpty = (v) => typeof v === 'string' && v.trim()
    if (!it || typeof it !== 'object') { warn(`item ${i + 1} ignoré (non-objet)`); continue }
    if (!nonEmpty(it.source_url) || !/^https?:\/\//i.test(it.source_url.trim())) {
      warn(`item ${i + 1} « ${String(it.titre || '').slice(0, 60)} » ignoré : URL source absente ou invalide`)
      continue
    }
    if (!nonEmpty(it.titre) || !nonEmpty(it.resume) || !nonEmpty(it.impact_cabinet)) {
      warn(`item ${i + 1} ignoré : titre, résumé ou impact_cabinet manquant`)
      continue
    }
    let niveau = typeof it.niveau === 'string' ? it.niveau.trim() : ''
    if (!NIVEAUX.includes(niveau)) {
      warn(`item ${i + 1} « ${it.titre.slice(0, 60)} » : niveau « ${niveau || '(vide)'} » inconnu → ramené à « info »`)
      niveau = 'info'
    }
    const date = typeof it.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.date.trim()) ? it.date.trim() : ''
    items.push({
      titre: it.titre.trim(),
      source_url: it.source_url.trim(),
      date,
      resume: it.resume.trim(),
      impact_cabinet: it.impact_cabinet.trim(),
      niveau,
    })
  }

  // Tri par niveau décroissant (action_requise en tête), ordre stable ensuite.
  items.sort((a, b) => NIVEAUX.indexOf(a.niveau) - NIVEAUX.indexOf(b.niveau))
  return { synthese, items }
}

async function generateNote() {
  const system = buildVeilleSystemPrompt({
    fiscalContext: formatFiscalContext(),
    dateDebut, dateFin, dateIso,
  })
  const baseUserPrompt = buildVeilleUserPrompt({ dateDebut, dateFin })

  let lastErr
  for (let attempt = 1; attempt <= MAX_GENERATIONS; attempt++) {
    const userPrompt = attempt === 1 ? baseUserPrompt : baseUserPrompt + VEILLE_FORMAT_RETRY_REMINDER
    const t0 = performance.now()
    const response = await callAnthropic({ system, userPrompt })
    const text = extractText(response.content)
    try {
      const note = normalizeNote(parseModelJson(text))
      log(`Note obtenue en ${((performance.now() - t0) / 1000).toFixed(1)}s : ${note.items.length} item(s) retenu(s).`)
      return note
    } catch (err) {
      lastErr = err
      console.error(`[veille] Sortie non exploitable (génération ${attempt}/${MAX_GENERATIONS}) : ${err.message}`)
      console.error(`[diagnostic] texte concaténé (${text.length} car.) — DÉBUT (600) :\n${text.slice(0, 600)}`)
      if (text.length > 1200) console.error(`[diagnostic] FIN (600) :\n${text.slice(-600)}`)
    }
  }
  // Échec irrécupérable : on NE simule PAS un email. L'absence d'email fera
  // échouer le job (rouge) et signalera la panne, comme voulu.
  throw new Error(`Génération de la note impossible après ${MAX_GENERATIONS} tentative(s) : ${lastErr?.message}`)
}

const note = dryRun
  ? {
      synthese: '[DRY-RUN] Synthèse factice de contrôle du gabarit. La semaine écoulée a vu une actualité réglementaire modérée sur l\'épargne retraite et l\'assurance vie. Deux points appellent une vigilance particulière.',
      items: [
        {
          titre: '[DRY-RUN] Publication d\'un décret d\'application (exemple)',
          source_url: 'https://www.legifrance.gouv.fr/',
          date: dateFin,
          resume: 'Item factice servant à valider le rendu de la carte, du badge de niveau et du lien source. Aucune actualité réelle.',
          impact_cabinet: 'Aucun — item de contrôle du gabarit.',
          niveau: 'action_requise',
        },
        {
          titre: '[DRY-RUN] Consultation de place en cours (exemple)',
          source_url: 'https://www.amf-france.org/',
          date: dateDebut,
          resume: 'Second item factice, niveau « à suivre », pour vérifier le tri et la coloration des badges.',
          impact_cabinet: 'Aucun — item de contrôle du gabarit.',
          niveau: 'a_suivre',
        },
      ],
    }
  : await generateNote()

// En test, la note est marquée en base et à l'écran.
if (testMode && note.synthese && !note.synthese.startsWith('[NOTE DE TEST]')) {
  note.synthese = `[NOTE DE TEST] ${note.synthese}`
}

// ── 4. Rendu de l'email (gabarit sobre, cohérent avec email.mjs) ────────────
const NIVEAU_STYLE = {
  action_requise: { label: 'Action requise', bg: '#fbe9e7', fg: '#b91c1c', bar: '#b91c1c' },
  a_suivre: { label: 'À suivre', bg: '#f7f0e0', fg: '#8a6d1f', bar: '#a6843f' },
  info: { label: 'Info', bg: '#eef2f7', fg: '#4b5563', bar: '#94a3b8' },
}

function buildVeilleEmail() {
  const subject = `[Veille Entasis] Semaine du ${fmtFr(dateDebut)} au ${fmtFr(dateFin)}`
  const empty = note.items.length === 0

  const syntheseHtml = note.synthese
    ? `<div style="font-size:14.5px;line-height:1.6;color:#374151;background:#f6f5f2;border:1px solid #e5e2da;border-radius:8px;padding:16px 18px;margin:0 0 20px;">${esc(note.synthese)}</div>`
    : ''

  const cardsHtml = note.items.map((it) => {
    const s = NIVEAU_STYLE[it.niveau] || NIVEAU_STYLE.info
    const badge =
      `<span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;` +
      `text-transform:uppercase;color:${s.fg};background:${s.bg};border-radius:4px;padding:2px 8px;">${s.label}</span>`
    return `
      <div style="border:1px solid #e5e2da;border-left:4px solid ${s.bar};border-radius:8px;padding:14px 18px;margin:0 0 14px;">
        <div style="margin-bottom:8px;">${badge}${it.date ? `<span style="font-size:12px;color:#9ca3af;margin-left:10px;">${esc(it.date)}</span>` : ''}</div>
        <div style="font-size:16px;font-weight:700;color:#0a1628;margin-bottom:8px;line-height:1.35;">${esc(it.titre)}</div>
        <div style="font-size:14px;color:#374151;line-height:1.55;margin-bottom:10px;">${esc(it.resume)}</div>
        <div style="font-size:13.5px;color:#4b5563;line-height:1.5;background:#faf9f7;border-radius:6px;padding:9px 12px;margin-bottom:10px;">
          <span style="font-weight:700;color:#a6843f;">Impact cabinet — </span>${esc(it.impact_cabinet)}
        </div>
        <a href="${esc(it.source_url)}" style="font-size:13px;font-weight:600;color:#a6843f;text-decoration:none;">Consulter la source →</a>
      </div>`
  }).join('')

  const bodyHtml = empty
    ? `<div style="font-size:15px;color:#374151;line-height:1.6;background:#f6f5f2;border:1px solid #e5e2da;border-radius:8px;padding:18px 20px;">
         <strong>Aucune évolution réglementaire significative cette semaine.</strong>
         ${note.synthese ? `<div style="margin-top:8px;color:#4b5563;font-size:14px;">${esc(note.synthese)}</div>` : ''}
       </div>`
    : `${syntheseHtml}${cardsHtml}`

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#eceae5;padding:24px 8px;">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;
            padding:28px 32px;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;
            color:#1f2937;">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a6843f;margin:0 0 4px;">
    Entasis Conseil — Veille réglementaire</p>
  <h1 style="font-size:20px;margin:0 0 4px;">Note de veille hebdomadaire</h1>
  <p style="color:#6b7280;font-size:13px;margin:0 0 20px;">
    Semaine du ${esc(fmtFr(dateDebut))} au ${esc(fmtFr(dateFin))}${empty ? '' : ` · ${note.items.length} point${note.items.length > 1 ? 's' : ''}`}</p>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e5e2da;margin:24px 0 14px;">
  <p style="font-size:11.5px;color:#9ca3af;line-height:1.5;">
    Note générée automatiquement — vérifier les sources avant toute action client.
    Ce document a un caractère purement informatif et interne ; il ne constitue ni un conseil
    en investissement, ni une position officielle du cabinet.</p>
</div></body></html>`

  return { subject, html }
}

const { subject, html } = buildVeilleEmail()

// ── 5. Dry-run : impression, aucune écriture ────────────────────────────────
if (dryRun) {
  log(`Objet : ${subject}`)
  log(`${note.items.length} item(s) — HTML complet ci-dessous (aucun envoi, aucune écriture) :`)
  console.log(html)
  log('DRY-RUN terminé.')
  process.exit(0)
}

// ── 6. Envoi de l'email (part TOUJOURS) ─────────────────────────────────────
const recipient = testMode ? process.env.EDITORIAL_REVIEWER_EMAIL : process.env.VEILLE_RECIPIENT_EMAIL
const { messageId } = await sendReviewEmail({ to: recipient, subject, html })
log(`Email de veille envoyé à ${recipient} (messageId ${messageId || 'n/a'})`)

// ── 7. Trace en base (garde-fou anti-doublon pour les prochains runs) ───────
// L'email est parti : une erreur d'insertion est signalée mais n'annule rien.
const { data: inserted, error: insErr } = await admin
  .from('veille_notes')
  .insert({
    period_start: periodStartIso,
    period_end: periodEndIso,
    items: note.items,
    synthese: note.synthese,
    sent_at: new Date().toISOString(),
  })
  .select('id')
  .single()
if (insErr) {
  console.error(`[veille] Email envoyé mais trace en base en échec : ${insErr.message} — vérifier veille_notes (risque de renvoi au prochain run).`)
  process.exit(1)
}
log(`Note tracée en base : ${inserted.id}${testMode ? ' (note de test)' : ''}. Terminé.`)
