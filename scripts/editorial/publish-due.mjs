// scripts/editorial/publish-due.mjs
// Cron GitHub Actions (toutes les 6 h) : publie tout package 'en_attente_veto'
// dont la veto_deadline est dépassée, via le module partagé
// api/editorial/lib/publish.js (commit du .md dans le repo du site →
// déploiement Vercel automatique). Ne touche à AUCUN autre statut.
//
// Usage :
//   node scripts/editorial/publish-due.mjs [--dry-run]
//   --dry-run : sélection + construction du markdown + vérification
//               d'existence GitHub (lecture seule), SANS commit ni update base.
//
// Variables d'environnement requises (secrets GitHub Actions / .env local) :
//   SUPABASE_URL               base
//   SUPABASE_SERVICE_ROLE_KEY  base (bypass RLS)
//   EDITORIAL_GH_TOKEN         commit dans louishton-cmd/entasis-site

import { createClient } from '@supabase/supabase-js'
import { loadDotenv, requireEnv } from './env.mjs'
import { publishPackage } from '../../api/editorial/lib/publish.js'

loadDotenv()

const dryRun = process.argv.includes('--dry-run')
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
if (!dryRun) required.push('EDITORIAL_GH_TOKEN')
requireEnv(required)

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const log = (msg) => console.log(`[publish-due] ${msg}`)

const nowIso = new Date().toISOString()
const { data: due, error } = await admin
  .from('editorial_packages')
  .select('*')
  .eq('statut', 'en_attente_veto')
  .lt('veto_deadline', nowIso)
  .order('veto_deadline', { ascending: true })
if (error) {
  console.error(`[publish-due] Sélection en échec : ${error.message}`)
  process.exit(1)
}

if (!due.length) {
  log(`Aucun package à publier (statut en_attente_veto, deadline < ${nowIso}).`)
  process.exit(0)
}

log(`${due.length} package(s) à publier${dryRun ? ' (DRY-RUN, aucune écriture)' : ''} :`)
let failures = 0

for (const row of due) {
  const titre = row.article_frontmatter?.title || row.sujet
  try {
    const result = await publishPackage(admin, row, { dryRun })
    if (dryRun) {
      log(`DRY-RUN ${row.id} « ${titre} » → ${result.path} (${result.markdown.length} car., commit non effectué)`)
    } else {
      log(`Publié ${row.id} « ${titre} » → ${result.path} @ ${result.commitSha}`)
    }
  } catch (err) {
    failures++
    console.error(`[publish-due] ÉCHEC ${row.id} « ${titre} » : ${err.message}`)
    // On continue : un package en échec ne doit pas bloquer les autres.
  }
}

if (failures) {
  console.error(`[publish-due] ${failures} échec(s) sur ${due.length}.`)
  process.exit(1)
}
log('Terminé.')
