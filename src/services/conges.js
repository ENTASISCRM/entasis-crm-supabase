// src/services/conges.js
// Smart RH : demandes de congés. Les alternants et l équipe posent une demande,
// la direction valide ou refuse. La RLS de rh_conges fait le périmètre : chacun
// voit ses demandes, la direction voit tout et décide.

import { supabase } from '../lib/supabase'

export async function listConges() {
  const { data, error } = await supabase
    .from('rh_conges')
    .select('*')
    .order('date_debut', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createConge({ demandeur_nom, advisor_code, type, date_debut, date_fin, demi_journee, motif }) {
  const { error } = await supabase.from('rh_conges').insert({
    demandeur_nom: demandeur_nom || null,
    advisor_code: advisor_code || null,
    type: type || 'Congé payé',
    date_debut,
    date_fin,
    demi_journee: !!demi_journee,
    motif: motif || null,
  })
  if (error) throw error
}

// Décision de la direction : valide ou refuse (motif conseillé sur un refus).
export async function decideConge(id, statut, decision_par, decision_motif) {
  const { error } = await supabase.from('rh_conges').update({
    statut,
    decision_par: decision_par || null,
    decision_le: new Date().toISOString(),
    decision_motif: decision_motif || null,
  }).eq('id', id)
  if (error) throw error
}

// La direction propose d autres dates plutôt que de refuser. La demande passe
// en « contre_proposee » et attend la réponse du demandeur.
export async function contreProposer(id, { date_debut, date_fin, demi_journee, message }, par) {
  const { error } = await supabase.from('rh_conges').update({
    statut: 'contre_proposee',
    contre_date_debut: date_debut,
    contre_date_fin: demi_journee ? date_debut : date_fin,
    contre_demi_journee: !!demi_journee,
    contre_message: message || null,
    decision_par: par || null,
    decision_le: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

// Réponse du demandeur à une contre-proposition. S il accepte, les dates
// proposées deviennent le congé validé. S il refuse, la demande est annulée
// (il peut en reposer une autre).
export async function repondreContreProposition(id, accepte) {
  const { data, error: e1 } = await supabase
    .from('rh_conges')
    .select('contre_date_debut, contre_date_fin, contre_demi_journee')
    .eq('id', id)
    .single()
  if (e1) throw e1
  const patch = accepte
    ? {
      statut: 'valide',
      date_debut: data.contre_date_debut,
      date_fin: data.contre_date_fin,
      demi_journee: !!data.contre_demi_journee,
    }
    : { statut: 'annule' }
  const { error } = await supabase.from('rh_conges').update(patch).eq('id', id)
  if (error) throw error
}

// Le demandeur annule sa propre demande encore en attente.
export async function cancelConge(id) {
  const { error } = await supabase.from('rh_conges').update({ statut: 'annule' }).eq('id', id)
  if (error) throw error
}
