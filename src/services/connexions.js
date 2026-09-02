// Lecture du journal des connexions. Passe par la fonction journal_connexions
// en base, qui verifie is_rh() : la table elle meme n est lisible par personne,
// pas meme en forgeant une requete depuis le navigateur.

import { supabase } from '../lib/supabase'

/**
 * @param {number} jours   fenetre glissante, plafonnee a 190 en base
 * @param {string} email   filtre optionnel sur l email (recherche partielle)
 * @param {number} limite  plafonnee a 1000 en base
 */
export async function listerConnexions({ jours = 30, email = null, limite = 300 } = {}) {
  const { data, error } = await supabase.rpc('journal_connexions', {
    p_jours: jours,
    p_email: email || null,
    p_limit: limite,
  })
  if (error) throw error
  return data || []
}
