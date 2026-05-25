// ═══════════════════════════════════════════════════════════════════════════
// SERVICE : conseiller_contrats
// Lecture + écriture sur la table BDD.
// Les RLS Supabase appliquent automatiquement la confidentialité stricte
// (manager voit tout, conseiller voit sa ligne uniquement).
// Doc canonique : src/lib/bareme-entasis.js
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../lib/supabase'

const TABLE = 'conseiller_contrats'

const ORDER_TYPE = ['GERANT', 'CDI', 'CDD', 'ALTERNANT', 'STAGIAIRE', 'MANDATAIRE']

/**
 * Liste tous les contrats accessibles à l'utilisateur courant.
 * Manager → tous, conseiller → sa ligne uniquement (via RLS).
 */
export async function list() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('actif', { ascending: false })
    .order('full_name', { ascending: true })
  if (error) throw error
  // Tri secondaire par type (gérant > CDI > … > mandataire)
  return (data || []).slice().sort((a, b) => {
    const ai = ORDER_TYPE.indexOf(a.type_contrat)
    const bi = ORDER_TYPE.indexOf(b.type_contrat)
    if (a.actif !== b.actif) return a.actif ? -1 : 1
    if (ai !== bi) return ai - bi
    return (a.full_name || '').localeCompare(b.full_name || '')
  })
}

/**
 * Récupère le contrat correspondant au profil utilisateur courant
 * (utilisé par la vue conseiller — Phase 2).
 */
export async function getOwn() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('profile_id', user.id)
    .eq('actif', true)
    .maybeSingle()
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

/**
 * Crée un nouveau contrat. Réservé manager (RLS).
 */
export async function create(payload) {
  const cleaned = sanitize(payload)
  const { data, error } = await supabase
    .from(TABLE)
    .insert([cleaned])
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Met à jour un contrat existant. Réservé manager (RLS).
 */
export async function update(id, patch) {
  const cleaned = sanitize(patch)
  const { data, error } = await supabase
    .from(TABLE)
    .update(cleaned)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Désactive un contrat (soft delete via actif=false).
 * Réservé manager (RLS).
 */
export async function setActif(id, actif) {
  return update(id, { actif })
}

/**
 * Supprime définitivement un contrat (hard delete).
 * Réservé manager (RLS). À utiliser avec parcimonie — préférer setActif(false).
 */
export async function remove(id) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
  if (error) throw error
  return true
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────────────────
function sanitize(payload) {
  const out = {}
  if (payload.profile_id !== undefined) out.profile_id = payload.profile_id || null
  if (payload.matricule !== undefined) out.matricule = payload.matricule || null
  if (payload.full_name !== undefined) out.full_name = String(payload.full_name || '').trim()
  if (payload.type_contrat !== undefined) out.type_contrat = payload.type_contrat
  if (payload.salaire_brut_mensuel !== undefined) out.salaire_brut_mensuel = Number(payload.salaire_brut_mensuel) || 0
  if (payload.palier_pp_mensuel !== undefined) out.palier_pp_mensuel = Number(payload.palier_pp_mensuel) || 0
  if (payload.palier_pu_mensuel !== undefined) out.palier_pu_mensuel = Number(payload.palier_pu_mensuel) || 0
  if (payload.date_debut !== undefined) out.date_debut = payload.date_debut || null
  if (payload.date_fin !== undefined) out.date_fin = payload.date_fin || null
  if (payload.actif !== undefined) out.actif = Boolean(payload.actif)
  if (payload.notes !== undefined) out.notes = payload.notes || null
  return out
}
