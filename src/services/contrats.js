// src/services/contrats.js
// Couche d'accès Supabase pour le référentiel contrats clients.
// RLS : manager voit tout, conseiller/co-conseiller voient les contrats de
// leurs clients (même périmètre que client_equipements_declares).
// Les contrats naissent automatiquement à la signature d'un deal (trigger
// deals_sync_contrat) ; ici on gère la lecture, la complétion manuelle
// (numéro, statut de vie) et la timeline (événements + valorisations).

import { supabase } from '../lib/supabase'
import { verifierEcriture, MOTIF_DROITS } from '../lib/ecriture-verifiee'

// Contrats d'un client, avec leur timeline et leurs valorisations.
// 1 requête contrats puis 2 requêtes en parallèle sur les ids (les volumes
// par client sont faibles, pas besoin de vue dédiée).
export async function listContratsForClient(clientId) {
  const { data: contrats, error } = await supabase
    .from('contrats')
    .select('*')
    .eq('client_id', clientId)
    .order('date_effet', { ascending: false })
  if (error) throw error
  if (!contrats?.length) return []

  const ids = contrats.map(c => c.id)
  const [evRes, valoRes] = await Promise.all([
    supabase.from('contrat_events').select('*').in('contrat_id', ids)
      .order('date_event', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('contrat_valorisations').select('*').in('contrat_id', ids)
      .order('date_valo', { ascending: false }),
  ])
  if (evRes.error) throw evRes.error
  if (valoRes.error) throw valoRes.error

  const events = evRes.data || []
  const valos = valoRes.data || []
  return contrats.map(c => ({
    ...c,
    events: events.filter(e => e.contrat_id === c.id),
    valorisations: valos.filter(v => v.contrat_id === c.id),
  }))
}

// Création manuelle (contrat souscrit avant le CRM ou hors deal).
export async function createContrat(payload) {
  const { data, error } = await supabase
    .from('contrats')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// Complétion / vie du contrat. Seuls les champs métier sont modifiables :
// le lien deal_id et le client restent intouchables depuis l'UI.
export async function updateContrat(contratId, patch = {}) {
  const allowed = ['numero_contrat', 'statut', 'compagnie', 'notes',
    'versement_programme', 'date_effet', 'montant_initial', 'famille', 'produit']
  const clean = {}
  for (const k of allowed) if (k in patch) clean[k] = patch[k]
  if (Object.keys(clean).length === 0) return
  const reponse = await supabase.from('contrats').update(clean).eq('id', contratId).select('id')
  verifierEcriture(reponse, 'Enregistrement du contrat', MOTIF_DROITS)
}

// Ajoute un événement à la timeline (append-only : pas de delete côté UI).
export async function addContratEvent(contratId, { type, date_event, montant = null, detail = null, saisi_par = null }) {
  const { data, error } = await supabase
    .from('contrat_events')
    .insert({ contrat_id: contratId, type, date_event, montant, detail, saisi_par })
    .select()
    .single()
  if (error) throw error
  return data
}

// Pose une valorisation à une date (une seule par contrat et par jour :
// re-saisir le même jour écrase la valeur, c'est voulu).
export async function upsertValorisation(contratId, { date_valo, valeur, saisi_par = null }) {
  const { data, error } = await supabase
    .from('contrat_valorisations')
    .upsert(
      { contrat_id: contratId, date_valo, valeur: Number(valeur), saisi_par, source: 'manuel' },
      { onConflict: 'contrat_id,date_valo' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// Valeur connue d'un contrat : dernière valorisation saisie, sinon le
// montant initial. Sert au total patrimoine de la fiche client.
export function valeurConnue(contrat) {
  if (contrat?.valorisations?.length > 0) return Number(contrat.valorisations[0].valeur)
  return Number(contrat?.montant_initial || 0)
}
