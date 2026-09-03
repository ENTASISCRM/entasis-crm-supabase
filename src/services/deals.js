// src/services/deals.js
// Couche d'accès Supabase pour la table `deals` (CRM patrimonial).
//
// Pourquoi : 4 opérations CRUD sur deals étaient inline dans App.jsx.
// Cette couche centralise + encapsule le SELECT avec join clients
// (utilisé partout) pour éviter de répéter la liste de colonnes.

import { supabase } from '../lib/supabase'
import { verifierEcriture, MOTIF_PROPRIETE } from '../lib/ecriture-verifiee'
import { nettoyerPourEcriture } from '../lib/colonnes-deals'
import { logger } from '../lib/logger'

// Colonnes du client à charger en join sur tous les SELECT de deals.
// Centralisé ici pour éviter le drift entre call-sites.
const CLIENT_JOIN_COLS = `
  id, nom, prenom, email, telephone, age,
  situation_familiale, nb_enfants, profession, statut_pro,
  revenus_annuels, patrimoine_estime, objectifs,
  notes, advisor_code, co_advisor_code
`

/**
 * Charge tous les deals avec leur client joint, ordre antichronologique.
 * Utilisé au mount.
 */
export async function listAll() {
  const { data, error } = await supabase
    .from('deals')
    .select(`*, clients(${CLIENT_JOIN_COLS})`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Charge uniquement les deals d'un conseiller (advisor_code OU co_advisor_code
 * dans `codes`), avec le meme join clients que listAll. Evite de rapatrier tous
 * les deals du cabinet quand un seul conseiller est concerne (UCS, etc.).
 */
export async function listByAdvisorCodes(codes) {
  if (!codes || codes.length === 0) return []
  const list = codes.join(',')
  const { data, error } = await supabase
    .from('deals')
    .select(`*, clients(${CLIENT_JOIN_COLS})`)
    .or(`advisor_code.in.(${list}),co_advisor_code.in.(${list})`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Charge UN deal avec le même join clients que listAll. Utilisé par le
 * handler Realtime INSERT : le payload WebSocket ne porte pas la jointure,
 * on va la chercher pour ce seul deal au lieu de recharger la table.
 * Retourne null si introuvable ou en cas d'erreur (l'appelant garde alors
 * la ligne brute du payload).
 */
export async function getById(dealId) {
  const { data, error } = await supabase
    .from('deals')
    .select(`*, clients(${CLIENT_JOIN_COLS})`)
    .eq('id', dealId)
    .maybeSingle()
  if (error) return null
  return data
}

/**
 * Met à jour un deal existant. Le caller passe l'objet complet.
 */
// Un dossier circule à l'écran enrichi de clés qui ne sont pas des colonnes
// (jointure clients, champs client_* de la modale, joursSansMouvement du bloc
// sans mouvement, heureRdv de Ma journée…). PostgREST refuse la première
// inconnue d un 400 et rien ne s écrit. On ne garde que les colonnes de deals,
// liste tenue dans lib/colonnes-deals.js, testée à part.
function pourEcriture(objet, quoi) {
  const { patch, ecartes } = nettoyerPourEcriture(objet)
  if (ecartes.length) logger.debug(`[deals] ${quoi} : clés écartées avant écriture`, ecartes)
  return patch
}

export async function update(dealId, patch) {
  // .select('id') obligatoire : sans lui, une ligne refusee par la RLS
  // (dossier d un autre conseiller) repond 204 sans erreur et l ecran
  // affiche « Dossier mis a jour » alors que rien n a bouge.
  const reponse = await supabase.from('deals').update(pourEcriture(patch, 'mise à jour')).eq('id', dealId).select('id')
  verifierEcriture(reponse, 'Enregistrement du dossier', MOTIF_PROPRIETE)
}

/**
 * Crée un nouveau deal. Génère un ID local si absent (préfixe D-…).
 */
export async function create(deal) {
  const newId = deal.id || `D-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const { error } = await supabase.from('deals').insert({ ...pourEcriture(deal, 'création'), id: newId })
  if (error) throw error
  return newId
}

/**
 * Supprime définitivement un deal.
 */
export async function remove(dealId) {
  const reponse = await supabase.from('deals').delete().eq('id', dealId).select('id')
  verifierEcriture(reponse, 'Suppression du dossier', `${MOTIF_PROPRIETE} Seul son titulaire ou la direction peut le supprimer.`)
}
