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

// Colonnes de l'export pour recontact : on ajoute les champs de qualification
// (tmi, patrimoine_net, actifs), inutiles pour appeler mais utiles pour
// préparer un rappel.
const COLONNES_RECONTACT = 'id, nom, telephone, email, campagne, status, tmi, patrimoine_net, actifs, created_at, updated_at'

// Deux ans en arrière : la fenêtre de 30 jours de l'écran ne sert à rien ici,
// un lead à rappeler est par définition ancien. Le plafond protège la mémoire
// du navigateur, il n'est pas une règle de gestion.
export const JOURS_RECONTACT = 730
export const LIMITE_RECONTACT = 1000

/**
 * Leads reçus sur les N derniers jours, du plus récent au plus ancien.
 * Une erreur de lecture est journalisée puis relancée : l'écran l'affiche en
 * bandeau au lieu de dire « Aucun lead reçu », ce qui aurait caché une panne
 * derrière un faux calme.
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
    throw error
  }
  return data || []
}

/**
 * Les leads sans suite, pour une campagne de recontact : morts (un refus côté
 * Lead Room) et rendus au pool. Le tri se fait sur le dernier mouvement,
 * faute de date de refus dans la copie CRM.
 *
 * Lecture seule, même RLS que le reste de la table : tout membre actif du
 * cabinet voit ces leads à l'écran, l'export n'ouvre aucun périmètre
 * nouveau. Il laisse en revanche une trace, via exporterCsv (SEC-07).
 */
export async function listSansSuite({ jours = JOURS_RECONTACT, limite = LIMITE_RECONTACT } = {}) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString()
  const { data, error } = await supabase
    .from('leads')
    .select(COLONNES_RECONTACT)
    .in('status', ['dead', 'released'])
    .gte('created_at', depuis)
    .order('updated_at', { ascending: false })
    .limit(limite)
  if (error) {
    logger.error('[leads] listSansSuite', error)
    throw error
  }
  return data || []
}
