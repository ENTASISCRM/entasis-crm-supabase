// src/services/equipment.js
// Couche d'accès Supabase pour le module Multi-équipement.
// La vue `client_equipment` est en security_invoker : la RLS applique
// automatiquement le périmètre (manager voit tout, conseiller voit ses clients).

import { supabase } from '../lib/supabase'

// Équipement par client (deals signés + équipements déclarés fusionnés).
export async function listEquipment() {
  const { data, error } = await supabase
    .from('client_equipment')
    .select('*')
  if (error) throw error
  return data || []
}

// Familles de référence (libellé affiché + couleur du badge + ordre).
export async function listFamilies() {
  const { data, error } = await supabase
    .from('product_families')
    .select('*')
    .order('ordre', { ascending: true })
  if (error) throw error
  return data || []
}

// Déclare un produit détenu, ou une absence confirmée, pour un client.
// detenu = true  → le client possède ce produit (souscrit avant le CRM).
// detenu = false → absence confirmée (ex. « TNS sans prévoyance »), alimente
//                  les opportunités.
export async function upsertDeclare({ client_id, famille, detenu = true, compagnie = null, note = null, saisi_par = null }) {
  const { error } = await supabase
    .from('client_equipements_declares')
    .upsert(
      { client_id, famille, detenu, compagnie, note, saisi_par, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,famille' },
    )
  if (error) throw error
}

// Retire une déclaration (revient à « non renseigné »).
export async function removeDeclare({ client_id, famille }) {
  const { error } = await supabase
    .from('client_equipements_declares')
    .delete()
    .eq('client_id', client_id)
    .eq('famille', famille)
  if (error) throw error
}

// Détail des déclarations d'un client (compagnie, note, détenu ou absence),
// pour le panneau latéral. RLS : le conseiller ne voit que ses clients.
export async function listDeclaresForClient(clientId) {
  const { data, error } = await supabase
    .from('client_equipements_declares')
    .select('famille, detenu, compagnie, note, created_at')
    .eq('client_id', clientId)
  if (error) throw error
  return data || []
}

// Historique des deals signés d'un client (timeline d'équipement du panneau).
export async function listSignedDealsForClient(clientId) {
  const { data, error } = await supabase
    .from('deals')
    .select('id, product, company, date_signed, pp_m, pu')
    .eq('client_id', clientId)
    .eq('status', 'Signé')
    .order('date_signed', { ascending: false })
  if (error) throw error
  return data || []
}

// Coordonnées d un client (prénom, email, téléphone) pour préremplir le mail
// de proposition. RLS : le conseiller ne récupère que ses propres clients.
export async function getClientContact(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('prenom, nom, email, telephone')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

// Réglages cabinet du module (campagne du mois, objectif de taux multi).
// Lecture ouverte à tous les connectés, écriture réservée aux managers (RLS).
export async function getSettings() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'multiequipement')
    .maybeSingle()
  return data?.value || { campagne_du_mois: 'prevoyance', objectif_taux_multi: 40 }
}

export async function saveSettings(value) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'multiequipement', value, updated_at: new Date().toISOString() })
  if (error) throw error
}
