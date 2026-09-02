// src/services/leads.js
// Couche d'accès à la table public.leads, la copie CRM des leads de la Lead
// Room, alimentée chaque jour par le pont. Lecture seule dans cette version :
// on ne prend pas un lead d'ici, on ne le rend pas, on ne le tue pas. Ces
// gestes restent dans la Lead Room. La RLS de leads (lecture pour tout membre
// actif du cabinet) applique le périmètre, jamais un filtre navigateur.
//
// Pourquoi une couche à part : l'écran Leads entrants (item A6 du plan
// d'amélioration) est le premier à lire cette table, restée sans lecteur
// depuis sa création. Si l'on écrit un jour dedans, c'est ici que passera
// verifierEcriture.

import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

// Colonnes utiles à l'écran. tmi, actifs et patrimoine_net restent en base :
// la liste de travail sert à appeler, pas à qualifier.
const COLONNES = 'id, nom, telephone, email, campagne, status, taken_by, taken_at, booked_at, email_confirmed, created_at, updated_at'

export const LIMITE_LEADS = 300

/**
 * Leads reçus sur les N derniers jours, du plus récent au plus ancien.
 * Renvoie [] sur erreur, journalisée : une liste vide vaut mieux qu'un écran
 * cassé, et la Lead Room reste accessible à côté.
 */
export async function listRecents({ jours = 30 } = {}) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString()
  const { data, error } = await supabase
    .from('leads')
    .select(COLONNES)
    .gte('created_at', depuis)
    .order('created_at', { ascending: false })
    .limit(LIMITE_LEADS)
  if (error) {
    logger.error('[leads] listRecents', error)
    return []
  }
  return data || []
}
