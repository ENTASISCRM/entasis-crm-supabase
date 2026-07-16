// scripts/test-generate-article.mjs
// Test manuel de la génération d'un package éditorial. Importe DIRECTEMENT le
// handler de api/editorial/generate-article.js dans un harnais Node (mocks
// req/res minimaux) — pas besoin de `vercel dev`. Affiche ensuite le package
// inséré (frontmatter + article + dérivés) pour relecture humaine.
// NE PUBLIE RIEN — le package reste en statut 'genere' dans la base.
//
// Pourquoi pas un fetch vers vercel dev : la génération (recherche web +
// rédaction) peut dépasser 5 minutes, le timeout d'en-têtes par défaut
// d'undici. On remplace donc globalThis.fetch par le fetch du paquet npm
// undici lié à un Agent à timeouts longs (15 min) AVANT d'importer le
// handler ; l'appel Anthropic interne au handler en profite aussi. Ne jamais
// mélanger l'Agent npm avec le fetch global intégré de Node : interfaces
// incompatibles (UND_ERR_INVALID_ARG "invalid onRequestStart method").
//
// Usage :
//   node scripts/test-generate-article.mjs [theme] [sujet…]
//   ex. node scripts/test-generate-article.mjs per-retraite "plafonds 2026 TNS"
//
// Variables d'environnement (chargées depuis .env à la racine) :
//   EDITORIAL_SECRET          secret partagé de la route
//   ANTHROPIC_API_KEY         clé API Anthropic (utilisée par le handler)
//   SUPABASE_URL              URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY insert (handler) + relecture (script)

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetch as undiciFetch, Agent } from 'undici'

// Timeouts longs pour la génération (15 min), cohérents npm-undici de bout
// en bout. Doit être en place avant que le handler n'appelle fetch.
const dispatcher = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 })
globalThis.fetch = (url, opts = {}) => undiciFetch(url, { ...opts, dispatcher })

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

const SECRET = process.env.EDITORIAL_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SECRET || !SUPABASE_URL || !SERVICE_KEY || !process.env.ANTHROPIC_API_KEY) {
  console.error('Variables manquantes : EDITORIAL_SECRET, ANTHROPIC_API_KEY, SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requises (fichier .env).')
  process.exit(1)
}

const [theme, ...sujetParts] = process.argv.slice(2)
const sujet = sujetParts.join(' ') || undefined

// ── Harnais : mocks req/res compatibles avec l'usage du handler ────────────
function makeReq(body) {
  return {
    method: 'POST',
    headers: { 'x-editorial-secret': SECRET },
    body,
  }
}

function makeRes() {
  const res = {
    statusCode: null,
    payload: undefined,
    done: null,
    status(code) { this.statusCode = code; return this },
    json(obj) { this.payload = obj; this._resolve(); return this },
    end() { this._resolve(); return this },
  }
  res.done = new Promise((r) => { res._resolve = r })
  return res
}

const { default: handler } = await import('../api/editorial/generate-article.js')

const hr = (title) => console.log(`\n${'─'.repeat(70)}\n${title}\n${'─'.repeat(70)}`)

console.log('Génération directe (handler importé, sans vercel dev)')
console.log(`  theme : ${theme || '(rotation automatique)'}`)
console.log(`  sujet : ${sujet || '(choisi par le modèle)'}`)
console.log('Génération en cours (recherche web + rédaction, compter plusieurs minutes)…')

const t0 = performance.now()
const req = makeReq({ ...(theme && { theme }), ...(sujet && { sujet }) })
const res = makeRes()
await handler(req, res)
await res.done
const elapsed = ((performance.now() - t0) / 1000).toFixed(1)

if (res.statusCode !== 200) {
  console.error(`\nÉchec (HTTP ${res.statusCode}) après ${elapsed}s :`, res.payload?.error || res.payload)
  process.exit(1)
}
console.log(`\nPackage créé en ${elapsed}s :`, res.payload)

// Relecture du package complet via l'API REST Supabase (service role)
const rowRes = await fetch(
  `${SUPABASE_URL}/rest/v1/editorial_packages?id=eq.${res.payload.id}&select=*`,
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
console.log(`id       : ${pkg.id}`)
console.log(`theme    : ${pkg.theme}`)
console.log(`statut   : ${pkg.statut} — rien n'a été publié.`)
console.log(`durée    : ${elapsed}s de bout en bout`)
