// ═══════════════════════════════════════════════════════════════════════════
// SERVICE : conformite des mandataires (Pilotage RH)
// Immatriculation INPI, habilitation ORIAS, declarations URSSAF trimestrielles.
// RLS : tables reservees a la direction RH (public.is_rh()).
// Les justificatifs URSSAF vivent dans le bucket prive contrats-rh, sous
// <contrat_id>/urssaf/ (memes policies que les documents de contrat).
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../lib/supabase'

const BUCKET = 'contrats-rh'

// Echeances de declaration URSSAF (regle Louis 28/07/2026) :
// T1 -> 30 avril, T2 -> 31 juillet, T3 -> 31 octobre, T4 -> 31 janvier N+1.
export const ECHEANCES_URSSAF = {
  1: { mois: 3, jour: 30, anneeSuivante: false, libelle: '30 avril' },
  2: { mois: 6, jour: 31, anneeSuivante: false, libelle: '31 juillet' },
  3: { mois: 9, jour: 31, anneeSuivante: false, libelle: '31 octobre' },
  4: { mois: 0, jour: 31, anneeSuivante: true, libelle: '31 janvier N+1' },
}

export function echeanceUrssaf(annee, trimestre) {
  const e = ECHEANCES_URSSAF[trimestre]
  if (!e) return null
  return new Date(annee + (e.anneeSuivante ? 1 : 0), e.mois, e.jour)
}

// Le trimestre est il exigible aujourd hui ? (periode terminee)
export function trimestreExigible(annee, trimestre, aujourd = new Date()) {
  const finTrimestre = new Date(annee, trimestre * 3, 0, 23, 59, 59)
  return aujourd > finTrimestre
}

// ── Fiches de conformite ──────────────────────────────────────────────────
export async function listConformite() {
  const { data, error } = await supabase.from('mandataire_conformite').select('*')
  if (error) throw error
  return data || []
}

export async function saveConformite(contratId, patch) {
  const { data, error } = await supabase
    .from('mandataire_conformite')
    .upsert({ contrat_id: contratId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'contrat_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Declarations URSSAF ───────────────────────────────────────────────────
export async function listUrssaf(annee) {
  const { data, error } = await supabase
    .from('mandataire_urssaf').select('*').eq('annee', annee)
  if (error) throw error
  return data || []
}

export async function saveUrssaf({ contrat_id, annee, trimestre, ...patch }) {
  const { data, error } = await supabase
    .from('mandataire_urssaf')
    .upsert({ contrat_id, annee, trimestre, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'contrat_id,annee,trimestre' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Justificatifs ─────────────────────────────────────────────────────────
const slug = (name) => {
  const i = name.lastIndexOf('.')
  const base = (i > 0 ? name.slice(0, i) : name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `${base || 'justificatif'}${i > 0 ? name.slice(i).toLowerCase() : ''}`
}

export async function uploadJustificatif(contratId, annee, trimestre, file) {
  const path = `${contratId}/urssaf/${annee}-T${trimestre}-${Date.now()}-${slug(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw error
  return path
}

export async function urlJustificatif(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

export async function supprimerJustificatif(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

// ── Appels serveur (INPI, commissions, relance) ───────────────────────────
async function appelApi(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expirée, recharge la page')
  const r = await fetch('/api/mandataires', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`)
  return j
}

export const verifierInpi = (siren) => appelApi({ action: 'verif_inpi', siren })
export const commissionsTrimestrielles = (annee) => appelApi({ action: 'commissions', annee })
export const relancerUrssaf = (contrat_id, annee, trimestre) =>
  appelApi({ action: 'relance', contrat_id, annee, trimestre })
