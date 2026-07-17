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
  FORMAT_RETRY_REMINDER,
} from '../prompts.js'

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
// 16k : la sortie article+dérivés observée fait 6-12k tokens ; le carrousel
// Instagram et le script vidéo (package 360°) ajoutent ~2k — marge large.
const MAX_TOKENS = 16000
const MAX_CONTINUATIONS = 5 // garde-fou sur les reprises pause_turn
const MAX_GENERATIONS = 2 // plafond strict : 1 génération + 1 retry métier MODEL_OUTPUT
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

// ── Couche d'appel Anthropic (streaming SSE + retry + logs) ─────────────────
// Pourquoi le streaming : en mode non-streaming avec web search et max_tokens
// élevé, la réponse HTTP n'arrive qu'une fois la génération COMPLÈTE — la
// connexion reste silencieuse plusieurs minutes et finit en
// UND_ERR_HEADERS_TIMEOUT (échec observé en prod à 15 min ; un test antérieur
// avait réussi en 335 s, la durée est très variable). En streaming, les
// premiers octets arrivent en secondes et chaque événement SSE réarme le
// timeout d'inactivité. Les événements sont RECONSTRUITS en un objet réponse
// identique au non-streaming (content blocks complets, stop_reason, usage) :
// l'interface de callAnthropic est inchangée pour le reste du code.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const TURN_TIMEOUT_MS = 20 * 60 * 1000 // borne dure par tour (inatteignable en pratique)
const INACTIVITY_TIMEOUT_MS = 120 * 1000 // silence max entre deux lectures du stream
const RETRY_DELAY_MS = 10 * 1000 // délai avant le retry unique d'un tour
const PROGRESS_LOG_MS = 30 * 1000 // battement des logs de progression

// Logs de progression sur stderr (stdout reste réservé aux sorties utiles
// des scripts, ex. HTML d'email en dry-run).
const logProgress = (msg) => console.error(`[anthropic] ${msg}`)

function retryableError(message) {
  const err = new Error(message)
  err.retryable = true
  return err
}

// Applique un événement SSE au message en reconstruction. `state` porte le
// message et les accumulateurs input_json_delta (un par index de bloc).
function applySseEvent(state, ev) {
  switch (ev.type) {
    case 'message_start':
      // Base du message (id, model, role, usage…) ; le contenu arrive bloc
      // par bloc ensuite.
      state.message = structuredClone(ev.message)
      state.message.content = []
      break
    case 'content_block_start':
      // Les blocs server_tool_use / web_search_tool_result arrivent ici avec
      // leur structure ; l'input des tool_use est complété par les
      // input_json_delta puis parsé au content_block_stop.
      state.message.content[ev.index] = structuredClone(ev.content_block)
      break
    case 'content_block_delta': {
      const block = state.message.content[ev.index]
      const d = ev.delta
      if (d.type === 'text_delta') {
        block.text = (block.text || '') + d.text
      } else if (d.type === 'input_json_delta') {
        state.jsonBuffers.set(ev.index, (state.jsonBuffers.get(ev.index) || '') + d.partial_json)
      } else if (d.type === 'thinking_delta') {
        block.thinking = (block.thinking || '') + d.thinking
      } else if (d.type === 'citations_delta') {
        block.citations = block.citations || []
        block.citations.push(d.citation)
      }
      break
    }
    case 'content_block_stop': {
      const buf = state.jsonBuffers.get(ev.index)
      if (buf !== undefined) {
        state.jsonBuffers.delete(ev.index)
        try {
          state.message.content[ev.index].input = JSON.parse(buf)
        } catch {
          // input d'un tool serveur illisible : non bloquant, le bloc texte
          // final reste exploitable
        }
      }
      break
    }
    case 'message_delta':
      if (ev.delta) {
        if (ev.delta.stop_reason !== undefined) state.message.stop_reason = ev.delta.stop_reason
        if (ev.delta.stop_sequence !== undefined) state.message.stop_sequence = ev.delta.stop_sequence
      }
      if (ev.usage) state.message.usage = { ...state.message.usage, ...ev.usage }
      break
    case 'message_stop':
      state.done = true
      break
    case 'error':
      // Erreur mid-stream (ex. overloaded) : le tour est rejouable
      throw retryableError(
        `API Anthropic (mid-stream) : ${ev.error?.message || ev.error?.type || 'erreur inconnue'}`
      )
    default:
      break // ping et types futurs : ignorés
  }
}

// Consomme le flux SSE d'une réponse streaming et reconstruit le message.
async function readSseMessage(response, turnLabel) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const state = { message: null, jsonBuffers: new Map(), done: false }
  const started = Date.now()
  let buffer = ''

  // Battement de progression : logge même pendant les silences du stream.
  const heartbeat = setInterval(() => {
    const blocks = state.message ? state.message.content.filter(Boolean).length : 0
    const out = state.message?.usage?.output_tokens
    logProgress(
      `${turnLabel} en cours : ${blocks} bloc(s) reçus` +
      (out ? `, ~${out} tokens output` : '') +
      `, ${Math.round((Date.now() - started) / 1000)}s écoulées`
    )
  }, PROGRESS_LOG_MS)

  try {
    while (!state.done) {
      if (Date.now() - started > TURN_TIMEOUT_MS) {
        throw retryableError(`tour interrompu : borne dure de ${TURN_TIMEOUT_MS / 60000} min atteinte`)
      }

      // Inactivité : si aucune donnée n'arrive pendant INACTIVITY_TIMEOUT_MS,
      // le stream est considéré figé → erreur rejouable (le fetch sera abort
      // par l'appelant).
      let inactivityTimer
      let chunk
      try {
        chunk = await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            inactivityTimer = setTimeout(
              () => reject(retryableError(`stream figé : aucune donnée depuis ${INACTIVITY_TIMEOUT_MS / 1000}s`)),
              INACTIVITY_TIMEOUT_MS
            )
          }),
        ])
      } finally {
        clearTimeout(inactivityTimer)
      }

      if (chunk.done) break // EOF sans message_stop → géré après la boucle
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n')

      // Découpage SSE : événements séparés par une ligne vide, payload sur
      // les lignes "data:" (concaténées si multiples).
      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const data = rawEvent
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('\n')
        if (!data) continue
        applySseEvent(state, JSON.parse(data))
        if (state.done) break
      }
    }
  } finally {
    clearInterval(heartbeat)
  }

  if (!state.done || !state.message) {
    throw retryableError('stream terminé prématurément (message_stop jamais reçu)')
  }
  return state.message
}

// Un tour d'appel : POST streaming, statut HTTP contrôlé, reconstruction SSE.
// Toute erreur réseau/timeout/5xx est marquée retryable ; les 4xx ne le sont pas.
async function runTurn(payload, turnLabel) {
  const controller = new AbortController()
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      const err = new Error(
        `API Anthropic : HTTP ${response.status} ${errBody.error?.message || errBody.error?.type || ''}`.trim()
      )
      err.retryable = response.status >= 500 // 5xx/529 rejouables, 4xx non
      throw err
    }

    return await readSseMessage(response, turnLabel)
  } catch (err) {
    controller.abort() // libère la connexion sur toute sortie en erreur
    if (err.retryable === undefined) err.retryable = true // erreurs réseau (fetch failed…)
    throw err
  }
}

// Retry : un (1) rejeu complet du tour après RETRY_DELAY_MS si l'erreur est
// rejouable (réseau, 5xx, timeout, stream figé). Le second échec remonte.
async function runTurnWithRetry(payload, turnLabel) {
  try {
    return await runTurn(payload, turnLabel)
  } catch (err) {
    if (!err.retryable) throw err
    logProgress(`${turnLabel} en échec rejouable (${err.message}) — retry unique dans ${RETRY_DELAY_MS / 1000}s`)
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    return runTurn(payload, turnLabel)
  }
}

// Appel Anthropic avec l'outil serveur web_search, en gérant le stop_reason
// 'pause_turn' (boucle d'échantillonnage serveur interrompue : on renvoie la
// conversation telle quelle et le serveur reprend où il en était).
// Interface inchangée : renvoie un objet réponse au format non-streaming
// (content, stop_reason, usage). Exportée pour les tests de la couche d'appel.
export async function callAnthropic({ system, userPrompt }) {
  const messages = [{ role: 'user', content: userPrompt }]

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const turnLabel = i === 0 ? 'tour 1' : `tour ${i + 1} (reprise pause_turn n°${i})`
    logProgress(`${turnLabel} : démarrage (streaming)`)
    const t0 = Date.now()

    const data = await runTurnWithRetry(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      },
      turnLabel
    )

    logProgress(
      `${turnLabel} : terminé en ${Math.round((Date.now() - t0) / 1000)}s — ` +
      `stop_reason=${data.stop_reason}, ${data.content.filter(Boolean).length} bloc(s)` +
      (data.usage?.output_tokens ? `, ${data.usage.output_tokens} tokens output` : '')
    )

    if (data.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: data.content })
      continue
    }
    return data
  }
  throw new Error('API Anthropic : trop de reprises pause_turn')
}

// Concatène TOUS les blocs text de la réponse, dans l'ordre, SANS séparateur :
// avec web search + citations, la réponse finale est segmentée en de multiples
// blocs text contigus (63 blocs observés en prod) — insérer un '\n' entre deux
// segments peut tomber au milieu d'une chaîne JSON et invalider le parse.
// Exportée pour les tests de la couche de parsing.
export function extractText(content) {
  return (content || [])
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text || '')
    .join('')
    .trim()
}

// Cherche la fin de l'objet JSON équilibré ouvert à `start` (accolades
// comptées hors chaînes, échappements gérés). -1 si jamais refermé.
function scanBalanced(text, start) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escaped) { escaped = false; continue }
    if (inString) {
      if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// Extrait l'objet JSON de la sortie du modèle. Stratégies dans l'ordre :
//  1. fences ```json explicites (chacune, dans l'ordre d'apparition),
//  2. fences ``` génériques dont le contenu commence par '{',
//  3. scan équilibré depuis chaque '{' du texte (JSON le plus externe :
//     premier '{' → son '}' équilibré ; on avance si ce candidat ne parse pas).
// Tolère donc préambule, commentaires après le JSON, fences non-JSON
// antérieures. Exportée pour les tests de la couche de parsing.
export function parseModelJson(text) {
  const candidates = []
  for (const m of text.matchAll(/```json\s*([\s\S]*?)```/g)) candidates.push(m[1].trim())
  for (const m of text.matchAll(/```\s*([\s\S]*?)```/g)) {
    const c = m[1].trim()
    if (c.startsWith('{')) candidates.push(c)
  }
  for (const candidate of candidates) {
    try { return JSON.parse(candidate) } catch { /* stratégie suivante */ }
  }

  let sawBrace = false
  let from = text.indexOf('{')
  while (from !== -1) {
    sawBrace = true
    const end = scanBalanced(text, from)
    if (end !== -1) {
      try { return JSON.parse(text.slice(from, end + 1)) } catch { /* '{' suivant */ }
    }
    from = text.indexOf('{', from + 1)
  }

  throw bizError(
    'MODEL_OUTPUT',
    sawBrace ? 'aucun objet JSON parsable dans la sortie' : 'aucun objet JSON dans la sortie'
  )
}

// Diagnostic MODEL_OUTPUT : début et fin du texte concaténé sur stderr
// (jamais l'intégralité — les 800 premiers et 800 derniers caractères
// suffisent à voir un préambule parasite ou une sortie tronquée).
function logModelOutputDiag(text, err) {
  const head = text.slice(0, 800)
  const tail = text.length > 1600 ? text.slice(-800) : ''
  console.error(`[diagnostic] MODEL_OUTPUT (${err.message}) — texte concaténé : ${text.length} caractères`)
  console.error(`[diagnostic] DÉBUT (800 car.) :\n${head}`)
  if (tail) console.error(`[diagnostic] FIN (800 car.) :\n${tail}`)
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

  // Formats 360° (carrousel Instagram, script vidéo) : validation TOLÉRANTE.
  // L'article est la valeur principale — on ne fait jamais échouer 9 minutes
  // de génération pour un dérivé absent/mal formé : champ vidé + warning.
  return { ...pkg, frontmatter: fm, ...normalizeExtraFormats(pkg) }
}

// Normalise carrousel_insta ([{titre, texte}] × 8-10) et script_video
// ({hook, sequences[{plan, texte_oral, texte_ecran}], cta, duree_cible_sec}).
// Invalide → valeur vide + warning stderr, jamais d'erreur.
function normalizeExtraFormats(pkg) {
  const warn = (msg) => console.error(`[generation] WARNING formats 360° : ${msg} — champ vidé, l'article reste valide`)

  let carrousel = []
  const c = pkg.carrousel_insta
  if (Array.isArray(c) && c.length >= 8 && c.length <= 10 &&
      c.every((s) => s && typeof s.titre === 'string' && s.titre.trim() && typeof s.texte === 'string' && s.texte.trim())) {
    carrousel = c
  } else if (c !== undefined) {
    warn(`carrousel_insta invalide (attendu 8-10 slides {titre, texte}, reçu ${Array.isArray(c) ? `${c.length} slide(s)` : typeof c})`)
  } else {
    warn('carrousel_insta absent de la sortie')
  }

  let video = {}
  const v = pkg.script_video
  if (v && typeof v === 'object' && !Array.isArray(v) &&
      typeof v.hook === 'string' && v.hook.trim() &&
      Array.isArray(v.sequences) && v.sequences.length > 0 &&
      v.sequences.every((s) => s && typeof s.texte_oral === 'string' && s.texte_oral.trim())) {
    video = v
  } else if (v !== undefined) {
    warn('script_video invalide (attendu {hook, sequences non vides, cta, duree_cible_sec})')
  } else {
    warn('script_video absent de la sortie')
  }

  return { carrousel_insta: carrousel, script_video: video }
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
  const baseUserPrompt = buildUserPrompt({ theme: resolvedTheme, sujet })

  // Retry MÉTIER (distinct du retry réseau de runTurnWithRetry) : si la
  // sortie du modèle est inexploitable (MODEL_OUTPUT — JSON absent/invalide,
  // frontmatter non conforme, fraîcheur), UNE relance complète avec un rappel
  // de format renforcé dans le user prompt. Plafond strict : 2 générations
  // par run (coût API).
  let pkg
  for (let attempt = 1; attempt <= MAX_GENERATIONS; attempt++) {
    const userPrompt = attempt === 1 ? baseUserPrompt : baseUserPrompt + FORMAT_RETRY_REMINDER
    const response = await callAnthropic({ system, userPrompt })
    const text = extractText(response.content)
    try {
      pkg = validatePackage(parseModelJson(text), resolvedTheme)
      break
    } catch (err) {
      if (err.code !== 'MODEL_OUTPUT') throw err
      logModelOutputDiag(text, err)
      if (attempt === MAX_GENERATIONS) throw err
      console.error(`[anthropic] MODEL_OUTPUT en génération ${attempt}/${MAX_GENERATIONS} — relance unique avec rappel de format renforcé`)
    }
  }

  await assertSlugAvailable(admin, pkg.slug)
  return { theme: resolvedTheme, pkg }
}

// Insère un package généré. `statut` : 'genere' (route manuelle) ou
// 'en_attente_veto' (cron, avec vetoDeadline). Renvoie la ligne insérée
// (id, sujet, article_slug, statut).
export async function insertPackage(admin, { theme, sujet, pkg, statut = 'genere', vetoDeadline = null }) {
  const baseRow = {
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
  }

  const doInsert = (row) => admin
    .from('editorial_packages')
    .insert(row)
    .select('id, sujet, article_slug, statut, veto_deadline')
    .single()

  // Formats 360° inclus par défaut ; si la migration migration_editorial_formats.sql
  // n'a pas encore été exécutée (colonnes absentes → PGRST204), on réinsère
  // sans ces colonnes plutôt que de perdre la génération.
  let { data, error } = await doInsert({
    ...baseRow,
    carrousel_insta: pkg.carrousel_insta ?? [],
    script_video: pkg.script_video ?? {},
  })
  if (error && error.code === 'PGRST204') {
    console.error('[generation] WARNING : colonnes formats 360° absentes en base (migration_editorial_formats.sql non exécutée) — insertion sans carrousel/script vidéo')
    ;({ data, error } = await doInsert(baseRow))
  }
  if (error) {
    if (error.code === '23505') throw bizError('SLUG_CONFLICT', `Slug déjà utilisé : ${pkg.slug}`)
    throw new Error(`Insertion : ${error.message}`)
  }
  return data
}
