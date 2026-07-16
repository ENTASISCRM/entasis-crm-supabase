// api/editorial/lib/generation.js
// Cœur de génération d'un package éditorial — source de vérité UNIQUE,
// importée à la fois par la route Vercel (api/editorial/generate-article.js)
// et par le script cron GitHub Actions (scripts/editorial/generate-and-notify.mjs).
//
// Variables d'environnement lues ici :
//   ANTHROPIC_API_KEY   appel de génération
// Le client Supabase (service role) est construit par l'appelant et passé en
// paramètre `admin`.
//
// Les erreurs métier portent un `code` pour le mapping HTTP côté route :
//   MODEL_OUTPUT  → 502 (sortie du modèle invalide : JSON, frontmatter, fraîcheur)
//   SLUG_CONFLICT → 409

import { formatFiscalContext } from '../fiscal-constants.js'
import {
  THEMES,
  THEME_TO_CATEGORY,
  THEME_TO_AUTHOR,
  INTERNAL_LINKS,
  FOUNDING_ARTICLES,
  buildSystemPrompt,
  buildUserPrompt,
} from '../prompts.js'

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8000
const MAX_CONTINUATIONS = 5 // garde-fou sur les reprises pause_turn
const FRESHNESS_DAYS = 30 // au moins une source doit dater de ≤ 30 jours
const RECENT_PACKAGES = 12 // profondeur de l'anti-répétition en base

function bizError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

// Thème le moins récemment utilisé : jamais utilisé d'abord, sinon celui
// dont le dernier package est le plus ancien.
export async function pickThemeByRotation(admin) {
  const { data, error } = await admin
    .from('editorial_packages')
    .select('theme, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Rotation thème : ${error.message}`)

  const lastUsed = new Map()
  for (const row of data || []) {
    if (!lastUsed.has(row.theme)) lastUsed.set(row.theme, row.created_at)
  }
  const never = THEMES.filter((t) => !lastUsed.has(t))
  if (never.length > 0) return never[0]
  return THEMES.reduce((oldest, t) =>
    lastUsed.get(t) < lastUsed.get(oldest) ? t : oldest
  )
}

// Sujets interdits de retraitement : les N derniers packages générés (tous
// statuts, y compris rejetés — un rejet ne rouvre pas le sujet) + les
// articles fondateurs du site, codés en dur dans prompts.js.
export async function fetchForbiddenSubjects(admin) {
  const { data, error } = await admin
    .from('editorial_packages')
    .select('sujet, article_slug, article_frontmatter')
    .order('created_at', { ascending: false })
    .limit(RECENT_PACKAGES)
  if (error) throw new Error(`Anti-répétition : ${error.message}`)

  const fromDb = (data || []).map((row) => {
    const titre = row.article_frontmatter?.title
    return titre && titre !== row.sujet
      ? `${row.sujet} — « ${titre} » (${row.article_slug})`
      : `${row.sujet} (${row.article_slug})`
  })
  return [...FOUNDING_ARTICLES, ...fromDb]
}

// Appel Anthropic avec l'outil serveur web_search, en gérant le stop_reason
// 'pause_turn' (boucle d'échantillonnage serveur interrompue : on renvoie la
// conversation telle quelle et le serveur reprend où il en était).
async function callAnthropic({ system, userPrompt }) {
  const messages = [{ role: 'user', content: userPrompt }]

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      }),
    })

    const data = await response.json()
    if (data.error) {
      throw new Error(`API Anthropic : ${data.error.message || 'erreur inconnue'}`)
    }
    if (data.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: data.content })
      continue
    }
    return data
  }
  throw new Error('API Anthropic : trop de reprises pause_turn')
}

// Extrait l'objet JSON de la sortie du modèle (fences ```json tolérées).
function parseModelJson(content) {
  const text = (content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  let candidate = fenced ? fenced[1].trim() : text
  if (!candidate.startsWith('{')) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end <= start) {
      throw bizError('MODEL_OUTPUT', 'aucun objet JSON dans la sortie')
    }
    candidate = candidate.slice(start, end + 1)
  }
  try {
    return JSON.parse(candidate)
  } catch (err) {
    throw bizError('MODEL_OUTPUT', `JSON invalide : ${err.message}`)
  }
}

// Au moins une source datée de ≤ FRESHNESS_DAYS jours (les références plus
// anciennes — textes de loi, doctrine — restent permises en complément).
function assertFreshness(sources, now = new Date()) {
  const limit = now.getTime() - FRESHNESS_DAYS * 24 * 3600 * 1000
  const fresh = (Array.isArray(sources) ? sources : []).some((s) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s.date || '')) return false
    const t = new Date(`${s.date}T00:00:00Z`).getTime()
    return Number.isFinite(t) && t >= limit && t <= now.getTime() + 24 * 3600 * 1000
  })
  if (!fresh) {
    throw bizError(
      'MODEL_OUTPUT',
      `aucune source récente : au moins une entrée de "sources" doit dater de ≤ ${FRESHNESS_DAYS} jours`
    )
  }
}

// Valide le package et normalise le frontmatter. Erreurs code MODEL_OUTPUT
// (c'est la sortie du modèle qui est en cause → 502 côté route).
function validatePackage(pkg, theme) {
  const fail = (msg) => { throw bizError('MODEL_OUTPUT', msg) }

  const fm = pkg.frontmatter
  if (!fm || typeof fm !== 'object') fail('frontmatter manquant')
  for (const field of ['title', 'description', 'date', 'category', 'author', 'relatedProduct']) {
    if (typeof fm[field] !== 'string' || !fm[field].trim()) {
      fail(`frontmatter.${field} manquant ou vide`)
    }
  }
  if (fm.category !== THEME_TO_CATEGORY[theme]) {
    fail(`category "${fm.category}" ≠ "${THEME_TO_CATEGORY[theme]}" attendue pour ${theme}`)
  }
  if (fm.author !== THEME_TO_AUTHOR[theme]) {
    fail(`author "${fm.author}" ≠ "${THEME_TO_AUTHOR[theme]}" attendu pour ${theme}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) {
    fail(`frontmatter.date "${fm.date}" n'est pas au format YYYY-MM-DD`)
  }
  if (!INTERNAL_LINKS.includes(fm.relatedProduct)) {
    fail(`relatedProduct "${fm.relatedProduct}" hors de la liste autorisée`)
  }

  if (typeof pkg.body !== 'string' || pkg.body.trim().length < 500) {
    fail('body manquant ou trop court')
  }
  if (typeof pkg.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pkg.slug)) {
    fail(`slug "${pkg.slug}" invalide (kebab-case attendu)`)
  }
  if (!Array.isArray(pkg.thread_x) || pkg.thread_x.some((t) => typeof t !== 'string' || t.length > 280)) {
    fail('thread_x invalide (array de tweets ≤ 280 caractères attendu)')
  }

  assertFreshness(pkg.sources)

  // readingTime recalculé côté serveur : déterministe, pas de dépendance à
  // l'estimation du modèle.
  const words = pkg.body.trim().split(/\s+/).length
  fm.readingTime = `${Math.max(1, Math.round(words / 200))} min`
  fm.draft = false

  return { ...pkg, frontmatter: fm }
}

// Vérifie que le slug est libre (la contrainte UNIQUE reste le filet).
async function assertSlugAvailable(admin, slug) {
  const { data, error } = await admin
    .from('editorial_packages')
    .select('id')
    .eq('article_slug', slug)
    .maybeSingle()
  if (error) throw new Error(`Vérification slug : ${error.message}`)
  if (data) throw bizError('SLUG_CONFLICT', `Slug déjà utilisé : ${slug}`)
}

// Génère un package complet et validé (sans l'insérer). Renvoie
// { theme, pkg } — pkg = { frontmatter, slug, body, post_linkedin, thread_x, sources }.
export async function generateEditorialPackage(admin, { theme, sujet } = {}) {
  if (theme !== undefined && !THEMES.includes(theme)) {
    throw bizError('BAD_THEME', `Thème invalide (attendu : ${THEMES.join(', ')})`)
  }
  const resolvedTheme = theme || (await pickThemeByRotation(admin))
  const forbiddenSubjects = await fetchForbiddenSubjects(admin)
  const dateIso = new Date().toISOString().slice(0, 10)

  const system = buildSystemPrompt({
    theme: resolvedTheme,
    fiscalContext: formatFiscalContext(),
    dateIso,
    forbiddenSubjects,
  })
  const response = await callAnthropic({
    system,
    userPrompt: buildUserPrompt({ theme: resolvedTheme, sujet }),
  })

  const pkg = validatePackage(parseModelJson(response.content), resolvedTheme)
  await assertSlugAvailable(admin, pkg.slug)
  return { theme: resolvedTheme, pkg }
}

// Insère un package généré. `statut` : 'genere' (route manuelle) ou
// 'en_attente_veto' (cron, avec vetoDeadline). Renvoie la ligne insérée
// (id, sujet, article_slug, statut).
export async function insertPackage(admin, { theme, sujet, pkg, statut = 'genere', vetoDeadline = null }) {
  const { data, error } = await admin
    .from('editorial_packages')
    .insert({
      sujet: sujet || pkg.frontmatter.title,
      theme,
      sources: Array.isArray(pkg.sources) ? pkg.sources : [],
      article_frontmatter: pkg.frontmatter,
      article_md: pkg.body,
      article_slug: pkg.slug,
      post_linkedin: typeof pkg.post_linkedin === 'string' ? pkg.post_linkedin : null,
      thread_x: pkg.thread_x,
      statut,
      ...(vetoDeadline && { veto_deadline: vetoDeadline }),
    })
    .select('id, sujet, article_slug, statut, veto_deadline')
    .single()
  if (error) {
    if (error.code === '23505') throw bizError('SLUG_CONFLICT', `Slug déjà utilisé : ${pkg.slug}`)
    throw new Error(`Insertion : ${error.message}`)
  }
  return data
}
