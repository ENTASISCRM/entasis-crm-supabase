// src/services/temoignages.js
// Couche d acces Supabase pour la bibliotheque de preuves sociales (idee 42).
// Un temoignage = un retour client attribue a un metier et a un produit,
// prive de nom complet (prenom ou initiales), reutilisable en rendez vous.
//
// RLS : lecture ouverte a tous, insertion ouverte a tous les connectes (un
// conseiller peut verser son propre temoignage), modification et suppression
// reservees aux managers. On stocke le libelle de famille dans produit pour
// que le texte copie en rendez vous se lise directement.

import { supabase } from '../lib/supabase'

// Bibliotheque complete, du plus recent au plus ancien.
export async function listTemoignages() {
  const { data, error } = await supabase
    .from('temoignages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Ajoute un temoignage. visible par defaut a vrai (un manager peut le masquer
// plus tard via une mise a jour, hors du perimetre de ce module).
export async function addTemoignage(t) {
  const { data, error } = await supabase
    .from('temoignages')
    .insert({ ...t, visible: t.visible !== false })
    .select()
    .single()
  if (error) throw error
  return data
}
