// src/services/structureurs.js
// Couche d'accès Supabase pour la table `structureurs` (patch #3 Louis).
//
// Les structureurs sont les partenaires commerciaux avec qui Entasis
// négocie les upfronts. Cette couche fournit :
//   - CRUD basique (manager only via RLS)
//   - Stats agrégées (KPIs dashboard)
//   - Liste enrichie avec compteurs UCS + volume placé
//   - Actions prioritaires (upfront <3%, contact froid 60j+, upfront manquant)

import { supabase } from '../lib/supabase'

// Seuils métier
export const UPFRONT_THRESHOLD = 3.0           // % minimum sous lequel on alerte
export const CONTACT_STALE_DAYS = 60           // jours sans contact → alerte

// ─────────────────────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liste tous les structureurs, ordre alpha.
 */
export async function listAll() {
  const { data, error } = await supabase
    .from('structureurs')
    .select('*')
    .order('nom', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Charge un structureur par id.
 */
export async function getById(id) {
  const { data, error } = await supabase
    .from('structureurs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Trouve un structureur par nom (case-insensitive). Utilisé par l'import CSV
 * pour résoudre structureur_id.
 */
export async function findByName(nom) {
  const { data, error } = await supabase
    .from('structureurs')
    .select('id, nom')
    .ilike('nom', nom.trim())
    .maybeSingle()
  if (error) return null
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// Écriture (manager only via RLS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée un nouveau structureur. Idempotent sur le nom (upsert).
 */
export async function upsert(structureur) {
  const { data, error } = await supabase
    .from('structureurs')
    .upsert(structureur, { onConflict: 'nom' })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Met à jour un structureur.
 */
export async function update(id, patch) {
  const { error } = await supabase.from('structureurs').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Marque le dernier contact à aujourd'hui (action rapide).
 */
export async function markContactedToday(id) {
  return update(id, { date_dernier_contact: new Date().toISOString().slice(0, 10) })
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats agrégées (utilisé par la page Structureurs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liste enrichie : pour chaque structureur, ajoute :
 *   - ucsEnCours : nombre d'UCS en cours
 *   - ucsTotal : total UCS dans le catalogue
 *   - volumePlace : Σ simulations.montant (où ucs.structureur_id = s.id)
 *   - upfrontMoyen : moyenne pondérée des upfronts UCS (NULL exclus)
 *   - isContactStale : true si date_dernier_contact > 60j ou null
 *
 * Implémentation : on charge structureurs + ucs + simulations en 3 requêtes
 * parallèles et on agrège côté client (volume faible : 10 structureurs,
 * <100 UCS, <1000 simu en V1).
 */
export async function listEnriched() {
  const [structureursRes, ucsRes, simuRes] = await Promise.all([
    supabase.from('structureurs').select('*').order('nom'),
    supabase.from('ucs_structures').select('id, structureur_id, etat, upfront'),
    supabase.from('simulations_structures').select('ucs_id, montant'),
  ])

  if (structureursRes.error) throw structureursRes.error
  const structureurs = structureursRes.data || []
  const ucs = ucsRes.data || []
  const simu = simuRes.data || []

  // Index UCS par structureur_id
  const ucsByStruct = new Map()
  for (const u of ucs) {
    if (!u.structureur_id) continue
    if (!ucsByStruct.has(u.structureur_id)) ucsByStruct.set(u.structureur_id, [])
    ucsByStruct.get(u.structureur_id).push(u)
  }

  // Index volume par structureur_id (via ucs_id → structureur_id)
  const structByUcs = new Map(ucs.map(u => [u.id, u.structureur_id]))
  const volumeByStruct = new Map()
  for (const s of simu) {
    const sid = structByUcs.get(s.ucs_id)
    if (!sid) continue
    volumeByStruct.set(sid, (volumeByStruct.get(sid) || 0) + Number(s.montant || 0))
  }

  // Enrichissement
  const now = Date.now()
  const STALE_MS = CONTACT_STALE_DAYS * 86400000
  return structureurs.map(s => {
    const list = ucsByStruct.get(s.id) || []
    const ucsEnCours = list.filter(u => u.etat === 'EN_COURS').length
    const upfronts = list.map(u => Number(u.upfront)).filter(n => !isNaN(n) && n > 0)
    const upfrontMoyen = upfronts.length
      ? upfronts.reduce((a, b) => a + b, 0) / upfronts.length
      : null
    const dContact = s.date_dernier_contact ? new Date(s.date_dernier_contact).getTime() : 0
    const isContactStale = !dContact || (now - dContact) > STALE_MS

    return {
      ...s,
      ucsEnCours,
      ucsTotal: list.length,
      volumePlace: volumeByStruct.get(s.id) || 0,
      upfrontMoyen,
      isContactStale,
    }
  })
}

/**
 * KPIs globaux pour le dashboard.
 */
export async function getDashboardKpis() {
  const enriched = await listEnriched()
  const upfronts = enriched
    .map(s => s.upfrontMoyen)
    .filter(n => n != null)

  return {
    activeCount: enriched.filter(s => s.actif).length,
    upfrontGlobal: upfronts.length
      ? upfronts.reduce((a, b) => a + b, 0) / upfronts.length
      : null,
    ucsEnCours: enriched.reduce((s, x) => s + x.ucsEnCours, 0),
    volumeTotal: enriched.reduce((s, x) => s + x.volumePlace, 0),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions prioritaires (vue dashboard)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule les actions prioritaires à partir de la liste enrichie + UCS.
 * Catégories :
 *   - LOW_UPFRONT  : UCS avec upfront < UPFRONT_THRESHOLD
 *   - STALE_CONTACT: structureur sans contact depuis CONTACT_STALE_DAYS+ jours
 *   - MISSING_UPFRONT: UCS au catalogue sans upfront renseigné
 */
export async function getPriorityActions() {
  const [ucsRes, structuresEnriched] = await Promise.all([
    supabase
      .from('ucs_structures')
      .select('id, nom_ucs, upfront, structureur_id, etat')
      .eq('etat', 'EN_COURS'),
    listEnriched(),
  ])

  const ucs = ucsRes.data || []
  const structById = new Map(structuresEnriched.map(s => [s.id, s]))

  const actions = []

  // 1. UCS upfront faible
  for (const u of ucs) {
    if (u.upfront != null && Number(u.upfront) < UPFRONT_THRESHOLD) {
      const struct = structById.get(u.structureur_id)
      actions.push({
        type: 'LOW_UPFRONT',
        severity: 'high',
        structureur: struct?.nom || '?',
        structureur_id: u.structureur_id,
        ucs_id: u.id,
        message: `${struct?.nom || '?'} : ${u.nom_ucs} à ${Number(u.upfront).toFixed(2)}% (sous le seuil ${UPFRONT_THRESHOLD}%)`,
        cta: 'Renégocier ou suspendre',
      })
    }
  }

  // 2. Structureurs sans contact récent
  const staleStructs = structuresEnriched.filter(s => s.actif && s.isContactStale && s.ucsEnCours > 0)
  if (staleStructs.length > 0) {
    actions.push({
      type: 'STALE_CONTACT',
      severity: 'medium',
      count: staleStructs.length,
      message: `${staleStructs.length} structureur${staleStructs.length > 1 ? 's' : ''} sans contact depuis ${CONTACT_STALE_DAYS}+ jours`,
      cta: 'Relancer cette semaine',
      structureurs: staleStructs.map(s => ({ id: s.id, nom: s.nom })),
    })
  }

  // 3. UCS sans upfront renseigné
  const missing = ucs.filter(u => u.upfront == null)
  if (missing.length > 0) {
    actions.push({
      type: 'MISSING_UPFRONT',
      severity: 'low',
      count: missing.length,
      message: `${missing.length} UCS au catalogue sans upfront renseigné`,
      cta: 'Demander les conditions aux structureurs',
    })
  }

  return actions
}

// ─────────────────────────────────────────────────────────────────────────────
// UCS détaillées pour un structureur (fiche détail)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liste des UCS associées à un structureur (toutes états confondus).
 */
export async function listUcsForStructureur(structureurId) {
  const { data, error } = await supabase
    .from('ucs_structures')
    .select('*')
    .eq('structureur_id', structureurId)
    .order('etat')
    .order('upfront', { ascending: false, nullsLast: true })
  if (error) throw error
  return data || []
}
