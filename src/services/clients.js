// src/services/clients.js
// Couche d'accès Supabase pour la table `clients` (CRM patrimonial).
//
// Pourquoi : la création d'un client est subtile (auto-créé depuis un
// deal, recherche fuzzy par nom+email+phone). Cette couche évite le
// drift entre les 3 composants qui touchent cette table.

import { supabase } from '../lib/supabase'

/**
 * Recherche fuzzy (autocomplete) par nom OU email OU téléphone.
 * Limite à 5 résultats. Renvoie [] sur erreur (silent failure côté UI).
 */
export async function searchByQuery(query) {
  if (!query || query.length < 2) return []
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom, prenom, email, telephone')
    .or(
      `nom.ilike.%${query}%,email.ilike.%${query}%,telephone.ilike.%${query}%`
    )
    .limit(5)
  if (error) return []
  return data || []
}

/**
 * Recherche un client existant par nom + advisor_code (unicité métier).
 * @returns le client { id } ou null si non trouvé.
 */
export async function findByNameAndAdvisor(nom, advisorCode) {
  const { data } = await supabase
    .from('clients')
    .select('id')
    .eq('nom', nom)
    .eq('advisor_code', advisorCode || '')
    .maybeSingle()
  return data || null
}

/**
 * Recherche un client existant par email (case-insensitive).
 * Plus fiable que le nom car l'email est unique par personne.
 */
export async function findByEmail(email) {
  const e = (email || '').trim().toLowerCase()
  if (!e) return null
  const { data } = await supabase
    .from('clients')
    .select('id, nom, prenom, email')
    .ilike('email', e)
    .limit(1)
    .maybeSingle()
  return data || null
}

/**
 * Recherche un client existant par téléphone (tolérant aux formatages).
 * Compare les 9 derniers chiffres (= numéro local sans préfixe pays).
 */
export async function findByPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 9) return null
  const tail = digits.slice(-9)
  // On charge un échantillon de clients avec téléphone et on filtre côté JS
  // (PostgREST ne fait pas de regex sur les colonnes en ilike facilement).
  const { data } = await supabase
    .from('clients')
    .select('id, nom, prenom, telephone')
    .not('telephone', 'is', null)
    .limit(2000)
  if (!data) return null
  return data.find(c => {
    const t = (c.telephone || '').replace(/\D/g, '')
    return t.length >= 9 && t.slice(-9) === tail
  }) || null
}

/**
 * Cherche un client existant en cascade : email > téléphone > nom+advisor.
 * Retourne le 1er match trouvé ou null.
 */
export async function findExisting({ email, telephone, nom, advisor_code }) {
  // 1. Email (le plus fiable)
  if (email) {
    const byEmail = await findByEmail(email)
    if (byEmail) return { ...byEmail, matchedBy: 'email' }
  }
  // 2. Téléphone (tolérant aux formats)
  if (telephone) {
    const byPhone = await findByPhone(telephone)
    if (byPhone) return { ...byPhone, matchedBy: 'phone' }
  }
  // 3. Nom + advisor_code (dernier recours, exact)
  if (nom && advisor_code) {
    const byName = await findByNameAndAdvisor(nom, advisor_code)
    if (byName) return { ...byName, matchedBy: 'name' }
  }
  // 4. Anti-doublon par fuzzy match nom (Levenshtein normalisé) — seuil
  //    0.85 = quasi-certain qu'il s'agit du même client malgré une faute
  //    de frappe (ex Vox Protega vs Vox Protego, score ≈ 0.91).
  //    Plus prudent que le fuzzy d'autocomplete car ici on FUSIONNE.
  if (nom) {
    const dups = await findPotentialDuplicates({ nom })
    if (dups.length > 0 && dups[0].score >= 0.85) {
      return { ...dups[0], matchedBy: 'fuzzy_name' }
    }
  }
  return null
}

// ─── Anti-doublons fuzzy ────────────────────────────────────────────────
// Levenshtein simple, O(n*m). Suffit pour les noms courts (<40 char).
function levenshtein(a, b) {
  if (a === b) return 0
  if (!a || !b) return Math.max((a || '').length, (b || '').length)
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,         // deletion
        dp[i][j - 1] + 1,         // insertion
        dp[i - 1][j - 1] + cost,  // substitution
      )
    }
  }
  return dp[m][n]
}

// Normalise un nom : lowercase, trim, sans accents, espaces simples.
function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Score de similarité 0..1 entre 2 noms.
function nameSimilarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const maxLen = Math.max(na.length, nb.length)
  const dist = levenshtein(na, nb)
  return Math.max(0, 1 - dist / maxLen)
}

/**
 * Cherche les doublons POTENTIELS d'un client par fuzzy match nom + email
 * partial. Utilisé pour alerter au save deal "ce nom ressemble à un client
 * déjà existant — fusionner ?".
 *
 * @returns Array<{ id, nom, prenom, email, telephone, score, matchedBy }>
 *          triés par score décroissant. Score ∈ [0, 1].
 */
export async function findPotentialDuplicates({ nom, email, telephone }) {
  const candidates = new Map() // id → { client, scores, matchedBy[] }

  // 1. Match email exact (case-insensitive) → score 1.0
  if (email) {
    const e = String(email).trim().toLowerCase()
    if (e) {
      const { data } = await supabase
        .from('clients')
        .select('id, nom, prenom, email, telephone')
        .ilike('email', e)
        .limit(5)
      for (const c of (data || [])) {
        candidates.set(c.id, { client: c, score: 1.0, matchedBy: ['email'] })
      }
    }
  }
  // 2. Match téléphone 9 derniers digits → score 0.95
  if (telephone) {
    const tail = String(telephone).replace(/\D/g, '').slice(-9)
    if (tail.length === 9) {
      const { data } = await supabase
        .from('clients')
        .select('id, nom, prenom, email, telephone')
        .not('telephone', 'is', null)
        .limit(2000)
      for (const c of (data || [])) {
        const t = String(c.telephone || '').replace(/\D/g, '').slice(-9)
        if (t === tail) {
          const existing = candidates.get(c.id)
          if (!existing || existing.score < 0.95) {
            candidates.set(c.id, { client: c, score: Math.max(0.95, existing?.score || 0), matchedBy: [...(existing?.matchedBy || []), 'phone'] })
          }
        }
      }
    }
  }
  // 3. Match fuzzy nom (Levenshtein normalisé). Seuil 0.75 minimum.
  if (nom) {
    const normalized = normalizeName(nom)
    if (normalized.length >= 3) {
      // On charge un échantillon par début de nom (tri par nom asc serait mieux mais Supabase ne supporte pas la pagination fine)
      const firstWord = normalized.split(' ')[0]
      const { data } = await supabase
        .from('clients')
        .select('id, nom, prenom, email, telephone')
        .ilike('nom', `%${firstWord}%`)
        .limit(50)
      for (const c of (data || [])) {
        const sim = nameSimilarity(nom, c.nom)
        if (sim >= 0.75) {
          const existing = candidates.get(c.id)
          if (!existing || existing.score < sim) {
            candidates.set(c.id, {
              client: c,
              score: Math.max(sim, existing?.score || 0),
              matchedBy: [...(existing?.matchedBy || []), `nom_fuzzy_${Math.round(sim * 100)}%`],
            })
          }
        }
      }
    }
  }

  // Sort by score desc
  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .map(({ client, score, matchedBy }) => ({ ...client, score, matchedBy: matchedBy.join('+') }))
}

/**
 * Crée un nouveau client. Retourne l'id du nouveau client.
 */
export async function create(clientData, userId) {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      nom: clientData.nom,
      email: clientData.email ?? null,
      telephone: clientData.telephone ?? null,
      age: clientData.age ?? null,
      advisor_code: clientData.advisor_code ?? null,
      created_by: userId ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data?.id || null
}

/**
 * Helper haut niveau : trouve ou crée. Centralise la logique
 * "auto-création depuis un deal" qui était dans App.jsx.
 *
 * Renvoie null si le caller n'a pas fourni de nom (skip silencieux).
 */
export async function findOrCreate(clientData, userId) {
  if (clientData.client_id) return clientData.client_id

  const nom = (clientData.nom || clientData.client || '').trim()
  if (!nom) return null

  const email = clientData.email || clientData.client_email || null
  const telephone = clientData.telephone || clientData.client_phone || null

  // Recherche multi-critères (email > phone > nom+advisor) pour éviter les
  // doublons de clients. Si on trouve un match, on le réutilise.
  const existing = await findExisting({
    email,
    telephone,
    nom,
    advisor_code: clientData.advisor_code,
  })
  if (existing) return existing.id

  try {
    return await create(
      {
        nom,
        email,
        telephone,
        age: clientData.age || clientData.client_age,
        advisor_code: clientData.advisor_code,
      },
      userId
    )
  } catch (e) {
    console.error('[clients.findOrCreate] create failed:', e)
    return null
  }
}
