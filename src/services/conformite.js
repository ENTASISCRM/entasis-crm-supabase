// src/services/conformite.js
// Couche d'accès Supabase pour la table `conformite_dossiers` (module Conformité).
//
// Cycle de vie d'un dossier : brouillon, genere, envoye, signe.
// La table peut ne pas exister (migration pas encore jouée sur cet
// environnement) : listAll() renvoie alors [] silencieusement, même
// pattern que countSafe() de dossiersImmo.js.

import { supabase } from '../lib/supabase'

/**
 * Liste tous les dossiers de conformité, les plus récemment modifiés d'abord.
 * Renvoie [] silencieusement en cas d'erreur (table absente, feature non
 * installée sur cet environnement).
 */
export async function listAll() {
  try {
    const { data, error } = await supabase
      .from('conformite_dossiers')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

/**
 * Crée un dossier de conformité. Retourne la row complète.
 */
export async function create(payload) {
  const { data, error } = await supabase
    .from('conformite_dossiers')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Met à jour un dossier (patch partiel). updated_at est rafraîchi côté
 * client pour que listAll() remonte le dossier en tête de liste.
 */
export async function update(id, patch) {
  const { data, error } = await supabase
    .from('conformite_dossiers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Supprime un dossier de conformité.
 */
export async function remove(id) {
  const { error } = await supabase
    .from('conformite_dossiers')
    .delete()
    .eq('id', id)
  if (error) throw error
}
