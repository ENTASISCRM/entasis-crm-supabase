import { describe, it, expect } from 'vitest'
import { lignesCsvPilotage } from './csv'

// Une ligne fictive du pilotage, comme la rend academy_pilotage.
const ligne = (o) => ({
  nom: 'Camille Durand', advisor_code: 'CD', parcours: ['Intégration, 30 jours', 'Fondamentaux du conseiller'],
  modules_valides: 3, modules_affectes: 5, derniere_activite: '2026-09-21T22:30:00Z', temps_actif_s: 3900,
  premier_score: { score: 3, total: 5 }, dernier_score: { score: 5, total: 5 }, retards: 1,
  prochaine_revision: '2026-09-28', ...o,
})

describe('lignesCsvPilotage', () => {
  it('pose des colonnes en français, sans aucune donnée de rémunération', () => {
    const { colonnes } = lignesCsvPilotage([ligne()])
    expect(colonnes).toEqual([
      'Nom', 'Code conseiller', 'Parcours', 'Modules validés', 'Modules affectés', 'Dernière activité',
      'Temps actif', 'Premier score', 'Dernier score', 'Retards', 'Prochaine révision',
    ])
    for (const c of colonnes) expect(c.toLowerCase()).not.toMatch(/marge|commission|rémunération|chiffre/)
  })
  it('met une ligne en texte : temps lisible, scores, dates en heure de Paris, parcours joints', () => {
    const { lignes } = lignesCsvPilotage([ligne()])
    expect(lignes).toEqual([[
      'Camille Durand', 'CD', 'Intégration, 30 jours ; Fondamentaux du conseiller', '3', '5', '22/09/2026',
      '1 h 05', '3/5', '5/5', '1', '28/09/2026',
    ]])
  })
  it('écrit Non évalué quand un score manque', () => {
    const { lignes } = lignesCsvPilotage([ligne({ premier_score: null, dernier_score: null })])
    expect(lignes[0][7]).toBe('Non évalué')
    expect(lignes[0][8]).toBe('Non évalué')
  })
  it('tient sur une ligne creuse : sans activité, sans parcours, sans révision', () => {
    const { lignes } = lignesCsvPilotage([ligne({
      parcours: [], derniere_activite: null, temps_actif_s: 0, prochaine_revision: null, retards: 0,
      modules_valides: 0, modules_affectes: 0, advisor_code: null,
    })])
    expect(lignes[0]).toEqual(['Camille Durand', '', '', '0', '0', '', '0 min', '3/5', '5/5', '0', ''])
  })
  it('accepte des parcours sous forme d objets et une liste absente', () => {
    const { lignes } = lignesCsvPilotage([ligne({ parcours: [{ titre: 'Perfectionnement' }] })])
    expect(lignes[0][2]).toBe('Perfectionnement')
    expect(lignesCsvPilotage(null)).toEqual({
      colonnes: expect.any(Array), lignes: [],
    })
  })
  it('chaque valeur est une chaîne, l échappement se fait ailleurs', () => {
    const { lignes } = lignesCsvPilotage([ligne({ nom: '=Durand; Camille' })])
    expect(lignes[0].every((v) => typeof v === 'string')).toBe(true)
    expect(lignes[0][0]).toBe('=Durand; Camille')
  })
})
