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
