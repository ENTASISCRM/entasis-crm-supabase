// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, le quiz côté écran
//
// Spec §3.2 : le tirage et la correction se font en base, le navigateur ne
// voit jamais une bonne réponse avant la soumission. Ce qui reste ici est
// l habillage : écrire un score, dire le seuil, vérifier qu on a répondu à
// tout avant d envoyer, lister les notions à revoir depuis le corrigé, et
// fabriquer le jeton client qui rend une tentative idempotente.
// ═══════════════════════════════════════════════════════════════════════════

// Espace insécable : « 80 % » ne se coupe jamais avant le signe.
const NBSP = ' '

const entier = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const pct = (num, den) => (den > 0 ? Math.round((100 * num) / den) : 0)

/** « 4/5 · 80 % » : le score brut puis le pourcentage arrondi. */
export function formatScore(score, total) {
  const s = entier(score), t = entier(total)
  return `${s}/${t} · ${pct(s, t)}${NBSP}%`
}

/**
 * « Seuil : 4 bonnes réponses sur 5 (80 %) ». Le nombre de bonnes
 * réponses est arrondi vers le haut, comme en base ; on nettoie d abord
 * les décimales flottantes pour qu un 0,7 × 10 ne devienne pas 8.
 */
export function seuilTexte(seuil, total) {
  const t = entier(total)
  const requis = Math.ceil(Math.round(Number(seuil) * t * 1e6) / 1e6)
  const mot = requis > 1 ? 'bonnes réponses' : 'bonne réponse'
  return `Seuil : ${requis} ${mot} sur ${t} (${Math.round(Number(seuil) * 100)}${NBSP}%)`
}

/**
 * Vrai si chaque question a une réponse entière (l index du choix).
 * `reponses` est un objet { question_id: index } ; les questions portent
 * `id` ou `question_id` selon la RPC qui les a rendues.
 */
export function reponsesCompletes(questions, reponses) {
  if (!reponses || typeof reponses !== 'object') return false
  const liste = Array.isArray(questions) ? questions : []
  return liste.every((q) => {
    const cle = q?.question_id ?? q?.id
    return cle != null && Number.isInteger(reponses[cle])
  })
}

/** Les compétences des réponses fausses, distinctes, dans l ordre du corrigé. */
export function notionsARevoir(corrections) {
  const vues = new Set()
  const notions = []
  for (const c of Array.isArray(corrections) ? corrections : []) {
    if (!c || c.correcte !== false) continue
    const notion = String(c.competence || '').trim()
    if (!notion || vues.has(notion)) continue
    vues.add(notion)
    notions.push(notion)
  }
  return notions
}

const hex = (n) => {
  let s = ''
  for (let i = 0; i < n; i += 1) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

/**
 * Un jeton client au format uuid v4, par crypto.randomUUID quand le
 * navigateur l offre, sinon un repli à partir de Math.random qui garde le
 * format (la base n exige que l unicité).
 */
export function jetonClient() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`
}
