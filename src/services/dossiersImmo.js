// src/services/dossiersImmo.js
// Couche d'accès Supabase pour la table `dossiers_immo` (pipeline VEFA).
//
// La table peut ne pas exister (feature optionnelle) → countSafe() ignore
// silencieusement l'erreur de table manquante.

import { supabase } from '../lib/supabase'

/**
 * Compte les dossiers encore chez un partenaire, pour la pastille du menu.
 * Un dossier acte ou sans suite ne demande plus rien, il n'y figure pas.
 * Renvoie 0 silencieusement si la table n'existe pas.
 */
export async function countSafe() {
  try {
    // head:true ne transfere aucune ligne, juste le compteur (au lieu de
    // rapatrier toutes les lignes pour en faire un .length).
    const { count } = await supabase
      .from('dossiers_immo')
      .select('id', { count: 'exact', head: true })
      .not('statut_pipeline', 'in', '("acte","sans_suite")')
    return count || 0
  } catch {
    return 0
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Transmission aux partenaires (refonte 29/07/2026)
// Entasis ne vend pas les lots : le conseiller transmet le dossier au
// referent, qui prend la main. On garde la trace de ce qui est parti et
// de son avancement.
// ─────────────────────────────────────────────────────────────────────────

export async function listDossiers() {
  const { data, error } = await supabase
    .from('dossiers_immo')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function creerDossier(payload) {
  const { data, error } = await supabase
    .from('dossiers_immo')
    .insert([payload])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function majDossier(id, patch) {
  const { data, error } = await supabase
    .from('dossiers_immo')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function supprimerDossier(id) {
  const { error } = await supabase.from('dossiers_immo').delete().eq('id', id)
  if (error) throw error
}

// Horodatage de la transmission. Le mail lui meme part du Gmail du conseiller
// (brouillon pre rempli ouvert depuis l ecran Immobilier), il n y a donc pas
// d envoi serveur : on note seulement quand et vers qui le dossier est parti.
export async function marquerTransmis(id, conseiller, referentEmail) {
  return majDossier(id, {
    transmis_le: new Date().toISOString(),
    transmis_par: conseiller || null,
    referent_email: referentEmail || null,
  })
}

// Recherche de clients pour rattacher le dossier a une fiche existante. Le
// rattachement fait remonter la transmission dans l onglet Immobilier de la
// fiche client. La RLS limite deja le perimetre a ce que le conseiller voit.
export async function chercherClients(q) {
  const terme = String(q || '').trim()
  if (terme.length < 2) return []
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom, prenom, email, telephone')
    .or(`nom.ilike.%${terme}%,prenom.ilike.%${terme}%`)
    .limit(6)
  if (error) return []
  return data || []
}
