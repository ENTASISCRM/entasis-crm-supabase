// src/services/missions.js
// Couche d acces Supabase pour les missions du Multi equipement V3.
// Une mission = un binome client et famille a vendre, avec un cycle de vie
// a_attaquer, en_cours, gagnee, reportee, exclue. La table me_missions porte
// une RLS alignee sur clients : le conseiller ne voit que ses clients (et ses
// co portefeuilles), le manager voit tout.

import { supabase } from '../lib/supabase'
import { listSignedDealsForClient } from './equipment'
import { familleDuProduit } from '../config/multiEquipementRules'

// Toutes les missions visibles. La RLS filtre le perimetre, pas de where ici.
export async function listMissions() {
  const { data, error } = await supabase
    .from('me_missions')
    .select('*')
  if (error) throw error
  return data || []
}

// Cree ou met a jour une mission sur la cle unique (client_id, famille).
// patch ne contient que les colonnes a poser : sur conflit, PostgREST ne met
// a jour que les colonnes presentes dans la charge, le reste est conserve.
export async function upsertMission({ client_id, famille, patch = {} }) {
  const { data, error } = await supabase
    .from('me_missions')
    .upsert(
      { client_id, famille, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,famille' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// Reconciliation automatique, appelee au chargement du module.
// 1. Toute mission non gagnee dont le client detient desormais la famille
//    (d apres la vue client_equipment deja chargee) passe gagnee, avec
//    montant_reel pris sur le dernier deal Signe de cette famille : pu si
//    superieur a zero, sinon pp_m fois douze. C est ce qui coche les
//    missions toutes seules a la signature, sans action du conseiller.
// 2. Toute mission reportee dont l echeance retour_le est atteinte revient
//    a_attaquer : un report n est jamais un enterrement.
// Renvoie la liste des missions a jour (lignes en base apres upsert).
export async function reconcileGagnees(equipRows, missions) {
  const parClient = new Map((equipRows || []).map((r) => [r.client_id, r]))
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const resultat = []
  for (const m of missions || []) {
    const eq = parClient.get(m.client_id)
    const familles = Array.isArray(eq?.familles) ? eq.familles : []
    let patch = null
    if (m.statut !== 'gagnee' && familles.includes(m.famille)) {
      let montant = null
      try {
        // Les deals arrivent tries par date_signed decroissante : le premier
        // qui correspond a la famille est bien le dernier signe.
        const deals = await listSignedDealsForClient(m.client_id)
        const deal = deals.find((d) => familleDuProduit(d.product) === m.famille)
        if (deal) montant = Number(deal.pu) > 0 ? Number(deal.pu) : Number(deal.pp_m || 0) * 12
      } catch { /* deals injoignables : la mission passe gagnee sans montant reel */ }
      patch = { statut: 'gagnee', montant_reel: montant }
    } else if (m.statut === 'reportee' && m.retour_le && m.retour_le <= aujourdhui) {
      patch = { statut: 'a_attaquer', raison_report: null, retour_le: null }
    }
    if (!patch) { resultat.push(m); continue }
    try {
      resultat.push(await upsertMission({ client_id: m.client_id, famille: m.famille, patch }))
    } catch {
      // Ecriture refusee ou reseau capricieux : on rend quand meme l etat
      // reconcilie pour l affichage, la base se rattrapera au prochain passage.
      resultat.push({ ...m, ...patch })
    }
  }
  return resultat
}
