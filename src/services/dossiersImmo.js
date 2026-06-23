// src/services/dossiersImmo.js
// Couche d'accès Supabase pour la table `dossiers_immo` (pipeline VEFA).
//
// La table peut ne pas exister (feature optionnelle) → countSafe() ignore
// silencieusement l'erreur de table manquante.

import { supabase } from '../lib/supabase'

/**
 * Compte les dossiers immo actifs. Renvoie 0 silencieusement si la
 * table n'existe pas (feature non installée sur cet environnement).
 */
export async function countSafe() {
  try {
    // head:true ne transfere aucune ligne, juste le compteur (au lieu de
    // rapatrier toutes les lignes pour en faire un .length).
    const { count } = await supabase
      .from('dossiers_immo')
      .select('id', { count: 'exact', head: true })
    return count || 0
  } catch {
    return 0
  }
}
