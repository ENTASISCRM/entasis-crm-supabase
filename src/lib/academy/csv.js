// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, l export CSV du pilotage
//
// Transforme les lignes de la RPC academy_pilotage (mode entraînement :
// decks, couronnes, série, XP, sessions) en colonnes et valeurs texte.
// L’échappement (protection formule, guillemets, séparateur, BOM) est fait
// par src/lib/csv-format.js : ici on ne produit que des chaînes brutes, rien
// n’est encore échappé.
//
// Règle du dépôt : aucune donnée de rémunération. Ce fichier ne connaît que
// la formation ; il n’y a ni marge ni commission dans la RPC, et il n’y en
// aura pas dans les colonnes.
// ═══════════════════════════════════════════════════════════════════════════

import { jourParis } from './format'

export const COLONNES_PILOTAGE = Object.freeze([
  'Collaborateur',
  'Code',
  'Parcours',
  'Decks affectés',
  'Decks validés',
  'Série',
  'XP 7 jours',
  'Sessions',
  'Dernière session',
  'Temps actif (min)',
  'Exercices dus',
  'Retards',
])

const texte = (v) => (v == null ? '' : String(v))
const nombre = (v) => String(Number(v) || 0)

// Le temps actif en minutes entières : une colonne numérique se somme dans
// le tableur, « 1 h 05 » ne se somme pas.
const minutes = (secondes) => String(Math.round(Math.max(0, Number(secondes) || 0) / 60))

// Les parcours arrivent en titres ou en objets { titre } : on joint les
// titres par un point virgule espacé, lisible dans une cellule.
const parcours = (l) =>
  (Array.isArray(l) ? l : [])
    .map((p) => (typeof p === 'string' ? p : p?.titre))
    .filter(Boolean)
    .join(' ; ')

/**
 * @param {Array} lignes  lignes de academy_pilotage
 * @returns {{colonnes: string[], lignes: string[][]}}
 */
export function lignesCsvPilotage(lignes) {
  const liste = Array.isArray(lignes) ? lignes.filter(Boolean) : []
  return {
    colonnes: [...COLONNES_PILOTAGE],
    lignes: liste.map((l) => [
      texte(l.nom),
      texte(l.advisor_code),
      parcours(l.parcours),
      nombre(l.modules_affectes),
      nombre(l.modules_valides),
      nombre(l.serie),
      nombre(l.xp_7j),
      nombre(l.sessions_periode),
      jourParis(l.derniere_session),
      minutes(l.temps_actif_s),
      nombre(l.items_dus),
      nombre(l.retards),
    ]),
  }
}
