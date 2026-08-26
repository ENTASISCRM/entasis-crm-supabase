// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL DES EXPORTS
//
// L'audit du 25 août 2026 (SEC-07) a relevé qu'aucune consultation ni aucun
// export n'était tracé. Un conseiller pouvait sortir l'annuaire des 379 clients
// — nom, email, téléphone, patrimoine estimé — sans laisser la moindre trace :
// l'export CSV est généré entièrement dans le navigateur.
//
// Sur un CRM, l'exfiltration par un collaborateur légitime est le scénario le
// plus fréquent et le moins surveillé. Sans ce journal, une suspicion de fuite
// ne peut être ni établie ni écartée — ce que la CNIL attend explicitement sur
// des données de cette nature.
//
// Ce module ne journalise PAS les lectures : PostgreSQL n'a pas de déclencheur
// sur SELECT, et tout tracer imposerait de faire passer chaque lecture par une
// fonction. Il trace les EXPORTS, là où se joue le risque réel.
//
// Règle tenue : un export n'échoue JAMAIS parce que le journal est indisponible.
// Le conseiller a son fichier même si l'écriture échoue — on préfère un trou
// dans le journal à un outil qui refuse de travailler.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// Au-delà de ce volume, l'export sort de l'usage courant : un conseiller
// extrait une poignée de lignes pour un rendez-vous, pas la base entière.
// Ce seuil ne bloque rien — il marque la ligne dans le journal.
export const SEUIL_EXPORT_MASSIF = 100

/**
 * Décrit un export pour le journal, sans effet de bord.
 * Séparé de l'écriture pour être testable sans réseau ni base.
 *
 * @param {string} ressource  ce qui est exporté ('clients', 'dossiers'…)
 * @param {number} nbLignes
 * @param {Object} contexte   filtres actifs au moment de l'export
 */
export function decrireExport(ressource, nbLignes, contexte = {}) {
  const n = Number.isFinite(Number(nbLignes)) ? Math.max(0, Math.trunc(Number(nbLignes))) : 0
  return {
    action: 'export_csv',
    ressource: String(ressource || 'inconnu').slice(0, 100),
    nb_lignes: n,
    contexte: { ...contexte, massif: n >= SEUIL_EXPORT_MASSIF },
  }
}

/**
 * Écrit l'entrée de journal. Ne lève jamais, ne bloque jamais l'appelant.
 *
 * `auteur_id` n'est PAS envoyé : la colonne le prend de auth.uid() par défaut,
 * et la policy exige l'égalité avec la session. Personne ne peut donc signer un
 * export du nom d'un collègue.
 *
 * @returns {Promise<boolean>} true si la trace est écrite
 */
export async function journaliserExport(ressource, nbLignes, contexte = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('acces_log')
      .insert({ ...decrireExport(ressource, nbLignes, contexte), auteur_email: user.email })

    if (error) {
      // Volontairement silencieux à l'écran : l'export a réussi, seule la trace
      // manque. Prévenir le conseiller l'inquiéterait sans qu'il puisse agir.
      console.warn('[acces-log] trace non écrite :', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[acces-log] trace non écrite :', e?.message)
    return false
  }
}
