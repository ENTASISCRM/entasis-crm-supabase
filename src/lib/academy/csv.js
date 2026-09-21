// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, l export CSV du pilotage
//
// Transforme les lignes de la RPC academy_pilotage en colonnes et valeurs
// texte. L échappement (protection formule, guillemets, séparateur, BOM)
// est fait par src/lib/csv-format.js : ici on ne produit que des chaînes
// brutes, rien n est encore échappé.
//
// Règle du dépôt : aucune donnée de rémunération. Ce fichier ne connaît que
// la formation ; il n y a ni marge ni commission dans la RPC, et il n y en
// aura pas dans les colonnes.
// ═══════════════════════════════════════════════════════════════════════════

import { formatDuree, jourParis } from './format'

export const COLONNES_PILOTAGE = Object.freeze([
  'Nom',
  'Code conseiller',
  'Parcours',
  'Modules validés',
  'Modules affectés',
  'Dernière activité',
  'Temps actif',
  'Premier score',
  'Dernier score',
  'Retards',
  'Prochaine révision',
])

const texte = (v) => (v == null ? '' : String(v))
const nombre = (v) => String(Number(v) || 0)

// « 4/5 », ou « Non évalué » quand la personne n a pas encore passé de quiz.
const score = (s) => (s && s.total != null ? `${Number(s.score) || 0}/${Number(s.total) || 0}` : 'Non évalué')

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
      nombre(l.modules_valides),
      nombre(l.modules_affectes),
      jourParis(l.derniere_activite),
      formatDuree(l.temps_actif_s),
      score(l.premier_score),
      score(l.dernier_score),
      nombre(l.retards),
      jourParis(l.prochaine_revision),
    ]),
  }
}
