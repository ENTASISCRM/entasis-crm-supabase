// scripts/test-generate-article.mjs
// Test manuel de la génération d'un package éditorial : appelle la route
// /api/editorial/generate-article servie en local (`vercel dev`), puis relit
// le package inséré dans Supabase et l'affiche en entier dans le terminal
// (frontmatter + article + dérivés) pour relecture humaine.
// NE PUBLIE RIEN — le package reste en statut 'genere' dans la base.
//
// Usage :
//   vercel dev                      # dans un autre terminal
//   node scripts/test-generate-article.mjs [theme] [sujet…]
//   ex. node scripts/test-generate-article.mjs per-retraite "plafonds 2026 TNS"
//
// Variables d'environnement (chargées depuis .env à la racine) :
//   EDITORIAL_SECRET          secret partagé de la route
//   SUPABASE_URL              URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY relecture du package inséré (bypass RLS)
//   EDITORIAL_API_URL         optionnel, défaut http://localhost:3000

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Chargement .env minimaliste (zéro dépendance) : lignes KEY=VALUE, les
// variables déjà présentes dans l'environnement ont priorité.
function loadDotenv() {
  let raw
  try {
    raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  } catch {
    return
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, rawVal] = m
    if (process.env[key] !== undefined) continue
    process.env[key] = rawVal.replace(/^(['"])(.*)\1$/, '$2')
  }
}

loadDotenv()

const BASE_URL = process.env.EDITORIAL_API_URL || 'http://localhost:3000'
const SECRET = process.env.EDITORIAL_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SECRET || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Variables manquantes : EDITORIAL_SECRET, SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requises (fichier .env).')
  process.exit(1)
}

const [theme, ...sujetParts] = process.argv.slice(2)
const sujet = sujetParts.join(' ') || undefined

const hr = (title) => console.log(`\n${'─'.repeat(70)}\n${title}\n${'─'.repeat(70)}`)

console.log(`POST ${BASE_URL}/api/editorial/generate-article`)
console.log(`  theme : ${theme || '(rotation automatique)'}`)
console.log(`  sujet : ${sujet || '(choisi par le modèle)'}`)
console.log('Génération en cours (recherche web + rédaction, compter 1 à 3 minutes)…')

const genRes = await fetch(`${BASE_URL}/api/editorial/generate-article`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-editorial-secret': SECRET,
  },
  body: JSON.stringify({ ...(theme && { theme }), ...(sujet && { sujet }) }),
})

const genBody = await genRes.json().catch(() => ({}))
if (!genRes.ok) {
  console.error(`\nÉchec (HTTP ${genRes.status}) :`, genBody.error || genBody)
  process.exit(1)
}
console.log('\nPackage créé :', genBody)

// Relecture du package complet via l'API REST Supabase (service role)
const rowRes = await fetch(
  `${SUPABASE_URL}/rest/v1/editorial_packages?id=eq.${genBody.id}&select=*`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
)
const rows = await rowRes.json()
const pkg = Array.isArray(rows) ? rows[0] : null
if (!pkg) {
  console.error('Package introuvable en base après insertion.')
  process.exit(1)
}

hr('FRONTMATTER')
console.log(JSON.stringify(pkg.article_frontmatter, null, 2))
console.log(`slug : ${pkg.article_slug}`)

hr('SOURCES')
for (const s of pkg.sources || []) console.log(`- ${s.titre} (${s.date})\n  ${s.url}`)
if (!(pkg.sources || []).length) console.log('(aucune)')

hr('ARTICLE (markdown)')
console.log(pkg.article_md)

hr('POST LINKEDIN')
console.log(pkg.post_linkedin || '(absent)')

hr('THREAD X')
;(pkg.thread_x || []).forEach((t, i) => console.log(`${i + 1}. [${t.length} car.] ${t}\n`))

hr('RÉCAP')
console.log(`id     : ${pkg.id}`)
console.log(`theme  : ${pkg.theme}`)
console.log(`statut : ${pkg.statut} — rien n'a été publié.`)
