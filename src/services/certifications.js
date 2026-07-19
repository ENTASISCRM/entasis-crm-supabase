// src/services/certifications.js
// Couche d acces Supabase pour la certification produit des conseillers
// (idee 93). Une ligne certifications_produit = un binome conseiller et
// famille de produit qu il est habilite a vendre. La cle unique porte sur
// (advisor_code, famille), d ou l upsert idempotent au toggle.
//
// RLS : lecture ouverte a tous les connectes (chacun doit savoir qui vend
// quoi pour router un lead), ecriture reservee aux managers (is_manager()).
// Un conseiller qui tente un toggle recevra une erreur RLS, l appelant la
// remonte en toast.

import { supabase } from '../lib/supabase'

// Toutes les certifications du cabinet (lecture ouverte).
export async function listCertifications() {
  const { data, error } = await supabase
    .from('certifications_produit')
    .select('advisor_code, famille, obtenu_le, valide_par, note')
  if (error) throw error
  return data || []
}

// Pose la certification (ou la met a jour) pour un conseiller sur une famille.
// obtenu_le est date du jour, valide_par le manager qui a coche.
export async function certifier({ advisor_code, famille, valide_par = null, note = null }) {
  const { error } = await supabase
    .from('certifications_produit')
    .upsert(
      { advisor_code, famille, obtenu_le: new Date().toISOString().slice(0, 10), valide_par, note },
      { onConflict: 'advisor_code,famille' },
    )
  if (error) throw error
}

// Retire la certification (le conseiller n est plus habilite sur la famille).
export async function decertifier({ advisor_code, famille }) {
  const { error } = await supabase
    .from('certifications_produit')
    .delete()
    .eq('advisor_code', advisor_code)
    .eq('famille', famille)
  if (error) throw error
}
