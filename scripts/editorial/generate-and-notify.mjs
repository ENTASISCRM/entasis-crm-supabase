// scripts/editorial/generate-and-notify.mjs
// Cron GitHub Actions (lundi + jeudi 06h Paris) : génère un package éditorial
// via le module partagé api/editorial/lib/generation.js, l'insère en statut
// 'en_attente_veto' (deadline +24 h) et envoie l'email de relecture avec les
// liens d'action signés. La génération dure ~5-6 min : elle tourne ICI, dans
// le runner, jamais dans une fonction Vercel (timeout).
//
// Usage :
//   node scripts/editorial/generate-and-notify.mjs [--dry-run] [theme] [sujet…]
//   --dry-run : tout SAUF l'appel Anthropic, l'insert en base et l'envoi
//               d'email (un package factice alimente le rendu de l'email,
//               imprimé sur stdout).
//
// Variables d'environnement requises (secrets GitHub Actions / .env local) :
//   ANTHROPIC_API_KEY          génération
//   SUPABASE_URL               base
//   SUPABASE_SERVICE_ROLE_KEY  base (bypass RLS)
//   EDITORIAL_SECRET           signature HMAC des liens d'action
//   BREVO_API_KEY              envoi de l'email de relecture
//   EDITORIAL_REVIEWER_EMAIL   destinataire de la relecture
//   CRM_URL                    base des liens d'action (ex. https://crm.entasis-conseil.fr)
//   BREVO_SENDER_EMAIL         optionnel, expéditeur vérifié Brevo

import { fetch as undiciFetch, Agent } from 'undici'
import { createClient } from '@supabase/supabase-js'
import { loadDotenv, requireEnv } from './env.mjs'

// L'appel Anthropic (~335 s observés) dépasse le timeout d'en-têtes undici
// par défaut (5 min) : fetch global remplacé par npm-undici + Agent 15 min.
// Ne jamais mélanger l'Agent npm avec le fetch natif de Node (interfaces
// incompatibles).
const dispatcher = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 })
globalThis.fetch = (url, opts = {}) => undiciFetch(url, { ...opts, dispatcher })

loadDotenv()

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const positional = args.filter((a) => !a.startsWith('--'))
const theme = positional[0] || undefined
const sujet = positional.slice(1).join(' ') || undefined

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'EDITORIAL_SECRET', 'CRM_URL']
if (!dryRun) required.push('ANTHROPIC_API_KEY', 'BREVO_API_KEY', 'EDITORIAL_REVIEWER_EMAIL')
requireEnv(required)

const { generateEditorialPackage, insertPackage, pickThemeByRotation, fetchForbiddenSubjects } =
  await import('../../api/editorial/lib/generation.js')
const { buildReviewEmail, sendReviewEmail } = await import('./email.mjs')

const VETO_HOURS = 24

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const log = (msg) => console.log(`[generate-and-notify] ${msg}`)

let row // ligne insérée (ou factice en dry-run), avec article_frontmatter etc.
let resolvedTheme = theme

if (dryRun) {
  log('DRY-RUN : pas d\'appel Anthropic, pas d\'insert, pas d\'envoi d\'email.')
  resolvedTheme = theme || (await pickThemeByRotation(admin))
  const forbidden = await fetchForbiddenSubjects(admin)
  log(`Thème retenu : ${resolvedTheme}`)
  log(`Sujets interdits injectés dans le prompt (${forbidden.length}) :`)
  for (const s of forbidden) log(`  - ${s}`)

  row = {
    id: '00000000-0000-0000-0000-000000000000',
    article_slug: 'dry-run-apercu-email',
    article_frontmatter: {
      title: '[DRY-RUN] Aperçu du gabarit d\'email de relecture',
      description: 'Package factice pour valider le rendu de l\'email et les liens signés.',
      date: new Date().toISOString().slice(0, 10),
      category: 'PER & Retraite',
      author: 'louis-hatton',
      readingTime: '1 min',
      relatedProduct: '/nos-solutions/per',
      draft: false,
    },
    article_md: '## Section de test\n\nCorps **markdown** minimal : [lien interne](/simulateur-per), liste :\n\n- point un\n- point deux\n\n> Citation de contrôle du rendu.',
    post_linkedin: 'Post LinkedIn factice (dry-run).',
    thread_x: ['Tweet factice 1/2', 'Tweet factice 2/2 https://www.entasis-conseil.fr/journal/dry-run'],
    sources: [{ url: 'https://example.com', titre: 'Source factice', date: new Date().toISOString().slice(0, 10) }],
  }
} else {
  const t0 = performance.now()
  log(`Génération (theme : ${theme || 'rotation automatique'}${sujet ? `, sujet : ${sujet}` : ''})…`)
  const generated = await generateEditorialPackage(admin, { theme, sujet })
  resolvedTheme = generated.theme
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  log(`Package généré en ${elapsed}s : « ${generated.pkg.frontmatter.title} » (${generated.pkg.slug})`)

  const vetoDeadline = new Date(Date.now() + VETO_HOURS * 3600 * 1000).toISOString()
  const inserted = await insertPackage(admin, {
    theme: resolvedTheme,
    sujet,
    pkg: generated.pkg,
    statut: 'en_attente_veto',
    vetoDeadline,
  })
  log(`Inséré : ${inserted.id} (statut ${inserted.statut}, deadline ${inserted.veto_deadline})`)

  row = {
    id: inserted.id,
    article_slug: generated.pkg.slug,
    article_frontmatter: generated.pkg.frontmatter,
    article_md: generated.pkg.body,
    post_linkedin: generated.pkg.post_linkedin,
    thread_x: generated.pkg.thread_x,
    sources: generated.pkg.sources,
    veto_deadline: inserted.veto_deadline,
  }
}

const vetoDeadline = row.veto_deadline || new Date(Date.now() + VETO_HOURS * 3600 * 1000).toISOString()
const { subject, html } = buildReviewEmail({
  pkg: row,
  vetoDeadline,
  crmUrl: process.env.CRM_URL,
  secret: process.env.EDITORIAL_SECRET,
})

if (dryRun) {
  log(`Objet email : ${subject}`)
  log('HTML complet de l\'email ci-dessous (aucun envoi) :')
  console.log(html)
  log('DRY-RUN terminé sans écriture.')
} else {
  const { messageId } = await sendReviewEmail({
    to: process.env.EDITORIAL_REVIEWER_EMAIL,
    subject,
    html,
  })
  log(`Email de relecture envoyé à ${process.env.EDITORIAL_REVIEWER_EMAIL} (messageId ${messageId || 'n/a'})`)
  log(`Terminé : package ${row.id} en attente de veto jusqu'au ${vetoDeadline}.`)
}
