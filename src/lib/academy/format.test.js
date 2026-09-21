import { describe, it, expect } from 'vitest'
import { formatDuree, jourParis, dateHeureParis, pourcentage, semaineLibelle } from './format'

describe('formatDuree', () => {
  it('moins de trente secondes : 0 min', () => {
    expect(formatDuree(0)).toBe('0 min')
    expect(formatDuree(29)).toBe('0 min')
    expect(formatDuree(null)).toBe('0 min')
    expect(formatDuree(-5)).toBe('0 min')
  })
  it('arrondit à la minute sous l heure', () => {
    expect(formatDuree(30)).toBe('1 min')
    expect(formatDuree(120)).toBe('2 min')
    expect(formatDuree(150)).toBe('3 min')
    expect(formatDuree(3560)).toBe('59 min')
  })
  it('écrit les heures avec les minutes sur deux chiffres', () => {
    expect(formatDuree(3600)).toBe('1 h 00')
    expect(formatDuree(3900)).toBe('1 h 05')
    expect(formatDuree(12000)).toBe('3 h 20')
    expect(formatDuree(3599)).toBe('1 h 00')
  })
})

describe('jourParis et dateHeureParis', () => {
  it('affiche un horodatage UTC au jour de Paris, heure d été comprise', () => {
    expect(jourParis('2026-09-21T22:30:00Z')).toBe('22/09/2026')
    expect(dateHeureParis('2026-09-21T22:30:00Z')).toBe('22/09/2026 à 00h30')
  })
  it('respecte l heure d hiver', () => {
    expect(jourParis('2026-12-21T23:30:00+00:00')).toBe('22/12/2026')
    expect(dateHeureParis('2026-12-21T23:30:00+00:00')).toBe('22/12/2026 à 00h30')
    expect(dateHeureParis('2026-12-21T08:05:00+00:00')).toBe('21/12/2026 à 09h05')
  })
  it('accepte une date seule sans la décaler', () => {
    expect(jourParis('2026-09-21')).toBe('21/09/2026')
    expect(dateHeureParis('2026-09-21')).toBe('21/09/2026')
  })
  it('rend une chaîne vide sans valeur ou pour une valeur illisible', () => {
    expect(jourParis('')).toBe('')
    expect(jourParis(null)).toBe('')
    expect(jourParis(undefined)).toBe('')
    expect(dateHeureParis(null)).toBe('')
    expect(jourParis('pas une date')).toBe('')
  })
})

describe('pourcentage', () => {
  it('arrondit à l entier et rend 0 sur un dénominateur nul', () => {
    expect(pourcentage(1, 3)).toBe(33)
    expect(pourcentage(2, 3)).toBe(67)
    expect(pourcentage(5, 5)).toBe(100)
    expect(pourcentage(0, 0)).toBe(0)
    expect(pourcentage(3, null)).toBe(0)
  })
})

describe('semaineLibelle', () => {
  it('nomme la semaine par son lundi', () => {
    expect(semaineLibelle('2026-09-14')).toBe('Semaine du 14/09')
    expect(semaineLibelle('2026-01-05')).toBe('Semaine du 05/01')
  })
  it('rend une chaîne vide sans lundi', () => {
    expect(semaineLibelle('')).toBe('')
    expect(semaineLibelle(null)).toBe('')
  })
})

describe('référentiels du catalogue', () => {
  it('traduit une clé en libellé et garde la clé inconnue', async () => {
    const { libelleTheme, libelleNiveau, THEMES, NIVEAUX } = await import('./format.js')
    expect(libelleTheme('per-retraite')).toBe('PER et retraite')
    expect(libelleNiveau('decouverte')).toBe('Découverte')
    expect(libelleTheme('inconnu')).toBe('inconnu')
    expect(libelleNiveau(null)).toBe('')
    expect(THEMES.length).toBe(8)
    expect(NIVEAUX.map((n) => n.cle)).toEqual(['decouverte', 'fondamentaux', 'perfectionnement'])
  })
})
