// api/editorial/generate-article.js
// Génère un package éditorial complet (article Journal + post LinkedIn +
// thread X) via l'API Anthropic avec recherche web, et l'insère dans
// public.editorial_packages. Route destinée à être appelée par un cron sans
// session utilisateur : auth par secret partagé, pas de verifyAuth.
//
// Variables d'environnement requises (serveur uniquement, JAMAIS VITE_) :
//   EDITORIAL_SECRET          secret partagé, comparé timing-safe au header
//                             'x-editorial-secret'
//   ANTHROPIC_API_KEY         clé API Anthropic
//   SUPABASE_URL              URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY clé service role (bypass RLS pour l'insert)
//
// POST { theme?: string, sujet?: string }
//   theme absent → rotation automatique (thème le moins récemment utilisé).
// Réponses : 200 {id, sujet, article_slug, statut} · 401 · 405 · 400 (theme
// invalide) · 409 (slug dupliqué) · 502 (sortie modèle invalide) · 500.

import { timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { formatFiscalContext } from './fiscal-constants.js'
import {
  THEMES,
  THEME_TO_CATEGORY,
  THEME_TO_AUTHOR,
  INTERNAL_LINKS,
  buildSystemPrompt,
  buildUserPrompt,
} from './prompts.js'

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8000
const MAX_CONTINUATIONS = 5 // garde-fou sur les reprises pause_turn

// Comparaison à temps constant (même pattern que le Lead Room) : une
// différence de longueur renvoie false immédiatement, la longueur d'un
// secret n'étant pas considérée comme sensible ici.
function safeEqual(a, b) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// Thème le moins récemment utilisé : jamais utilisé d'abord, sinon celui
// dont le dernier package est le plus ancien.
async function pickThemeByRotation(admin) {
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
    if (start === -1 || end <= start) throw new Error('aucun objet JSON dans la sortie')
    candidate = candidate.slice(start, end + 1)
  }
  return JSON.parse(candidate)
}

// Valide le package et normalise le frontmatter. Lance une Error descriptive
// (renvoyée en 502 : c'est la sortie du modèle qui est en cause).
function validatePackage(pkg, theme) {
  const fm = pkg.frontmatter
  if (!fm || typeof fm !== 'object') throw new Error('frontmatter manquant')
  for (const field of ['title', 'description', 'date', 'category', 'author', 'relatedProduct']) {
    if (typeof fm[field] !== 'string' || !fm[field].trim()) {
      throw new Error(`frontmatter.${field} manquant ou vide`)
    }
  }
  if (fm.category !== THEME_TO_CATEGORY[theme]) {
    throw new Error(`category "${fm.category}" ≠ "${THEME_TO_CATEGORY[theme]}" attendue pour ${theme}`)
  }
  if (fm.author !== THEME_TO_AUTHOR[theme]) {
    throw new Error(`author "${fm.author}" ≠ "${THEME_TO_AUTHOR[theme]}" attendu pour ${theme}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) {
    throw new Error(`frontmatter.date "${fm.date}" n'est pas au format YYYY-MM-DD`)
  }
  if (!INTERNAL_LINKS.includes(fm.relatedProduct)) {
    throw new Error(`relatedProduct "${fm.relatedProduct}" hors de la liste autorisée`)
  }

  if (typeof pkg.body !== 'string' || pkg.body.trim().length < 500) {
    throw new Error('body manquant ou trop court')
  }
  if (typeof pkg.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pkg.slug)) {
    throw new Error(`slug "${pkg.slug}" invalide (kebab-case attendu)`)
  }
  if (!Array.isArray(pkg.thread_x) || pkg.thread_x.some((t) => typeof t !== 'string' || t.length > 280)) {
    throw new Error('thread_x invalide (array de tweets ≤ 280 caractères attendu)')
  }

  // readingTime recalculé côté serveur : déterministe, pas de dépendance à
  // l'estimation du modèle.
  const words = pkg.body.trim().split(/\s+/).length
  fm.readingTime = `${Math.max(1, Math.round(words / 200))} min`
  fm.draft = false

  return { ...pkg, frontmatter: fm }
}

export default async function handler(req, res) {
  // 1. Auth par secret partagé, timing-safe
  const secret = process.env.EDITORIAL_SECRET
  const provided = req.headers['x-editorial-secret']
  if (!secret || typeof provided !== 'string' || !safeEqual(provided, secret)) {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  if (req.method !== 'POST') return res.status(405).end()

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configuration Supabase serveur manquante' })
  }
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // 2. Thème : fourni et validé, ou rotation automatique
    const body = req.body || {}
    let theme = body.theme
    if (theme !== undefined && !THEMES.includes(theme)) {
      return res.status(400).json({ error: `Thème invalide (attendu : ${THEMES.join(', ')})` })
    }
    if (!theme) theme = await pickThemeByRotation(admin)

    const sujet = typeof body.sujet === 'string' ? body.sujet.substring(0, 300) : undefined
    const dateIso = new Date().toISOString().slice(0, 10)

    // 3. Génération (recherche web + article + dérivés en un appel)
    const system = buildSystemPrompt({ theme, fiscalContext: formatFiscalContext(), dateIso })
    const response = await callAnthropic({ system, userPrompt: buildUserPrompt({ theme, sujet }) })

    // 4. Parsing + validation de la sortie du modèle
    let pkg
    try {
      pkg = validatePackage(parseModelJson(response.content), theme)
    } catch (err) {
      return res.status(502).json({ error: `Sortie modèle invalide : ${err.message}` })
    }

    // 5. Unicité du slug (pré-vérification ; la contrainte UNIQUE reste le filet)
    const { data: existing, error: slugErr } = await admin
      .from('editorial_packages')
      .select('id')
      .eq('article_slug', pkg.slug)
      .maybeSingle()
    if (slugErr) throw new Error(`Vérification slug : ${slugErr.message}`)
    if (existing) {
      return res.status(409).json({ error: `Slug déjà utilisé : ${pkg.slug}` })
    }

    // 6. Insertion via service role
    const { data: inserted, error: insertErr } = await admin
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
        statut: 'genere',
      })
      .select('id, sujet, article_slug, statut')
      .single()
    if (insertErr) {
      if (insertErr.code === '23505') {
        return res.status(409).json({ error: `Slug déjà utilisé : ${pkg.slug}` })
      }
      throw new Error(`Insertion : ${insertErr.message}`)
    }

    return res.status(200).json(inserted)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
