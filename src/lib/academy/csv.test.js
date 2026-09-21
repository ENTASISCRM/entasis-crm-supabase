import { describe, it, expect } from 'vitest'
import { lignesCsvPilotage } from './csv'

// Une ligne fictive du pilotage, comme la rend academy_pilotage en mode
// entraînement. Noms inventés.
const ligne = (o) => ({
  nom: 'Camille Durand', advisor_code: 'CD', parcours: ['Intégration, 30 jours', 'Fondamentaux du conseiller'],
  decks: [{ version_id: 'v1', titre: 'Le PER', couronnes: 3, statut: 'valide' }],
  modules_valides: 3, modules_affectes: 5, serie: 4, xp_7j: 320, sessions_periode: 6,
  derniere_session: '2026-09-21T22:30:00Z', temps_actif_s: 3900, items_dus: 7, retards: 1, ...o,
})

describe('lignesCsvPilotage', () => {
  it('pose des colonnes en français, sans aucune donnée de rémunération', () => {
    const { colonnes } = lignesCsvPilotage([ligne()])
    expect(colonnes).toEqual([
      'Collaborateur', 'Code', 'Parcours', 'Decks affectés', 'Decks validés', 'Série', 'XP 7 jours',
      'Sessions', 'Dernière session', 'Temps actif (min)', 'Exercices dus', 'Retards',
    ])
    for (const c of colonnes) expect(c.toLowerCase()).not.toMatch(/marge|commission|rémunération|chiffre/)
  })
  it('met une ligne en texte : minutes entières, série, XP, date en heure de Paris, parcours joints', () => {
    const { lignes } = lignesCsvPilotage([ligne()])
    expect(lignes).toEqual([[
      'Camille Durand', 'CD', 'Intégration, 30 jours ; Fondamentaux du conseiller', '5', '3', '4', '320', '6',
      '22/09/2026', '65', '7', '1',
    ]])
  })
  it('tient sur une ligne creuse : sans session, sans parcours, sans série', () => {
    const { lignes } = lignesCsvPilotage([ligne({
      parcours: [], derniere_session: null, temps_actif_s: 0, serie: null, xp_7j: 0, sessions_periode: 0,
      items_dus: 0, retards: 0, modules_valides: 0, modules_affectes: 0, advisor_code: null,
    })])
    expect(lignes[0]).toEqual(['Camille Durand', '', '', '0', '0', '0', '0', '0', '', '0', '0', '0'])
  })
  it('accepte des parcours sous forme d’objets et une liste absente', () => {
    const { lignes } = lignesCsvPilotage([ligne({ parcours: [{ titre: 'Perfectionnement' }] })])
    expect(lignes[0][2]).toBe('Perfectionnement')
    expect(lignesCsvPilotage(null)).toEqual({
      colonnes: expect.any(Array), lignes: [],
    })
  })
  it('chaque valeur est une chaîne, l échappement (protection formule) se fait dans csv-format', () => {
    const { lignes } = lignesCsvPilotage([ligne({ nom: '=Durand; Camille' })])
    expect(lignes[0].every((v) => typeof v === 'string')).toBe(true)
    expect(lignes[0][0]).toBe('=Durand; Camille')
  })
})
