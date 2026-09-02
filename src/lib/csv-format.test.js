import { describe, it, expect } from 'vitest'
import { cellule, contenuCsv } from './csv-format'

describe('cellule', () => {
  it('rend une chaîne vide pour null et undefined', () => {
    expect(cellule(null)).toBe('')
    expect(cellule(undefined)).toBe('')
  })

  it('protège de l injection de formule avec une apostrophe', () => {
    expect(cellule('=1+1')).toBe("'=1+1")
    expect(cellule('+33612345678')).toBe("'+33612345678")
    expect(cellule('-5')).toBe("'-5")
    expect(cellule('@ici')).toBe("'@ici")
  })

  it('encadre et double les guillemets quand il y a un séparateur, un guillemet ou un saut de ligne', () => {
    expect(cellule('Un; deux')).toBe('"Un; deux"')
    expect(cellule('Dit "Cam"')).toBe('"Dit ""Cam"""')
    expect(cellule('deux\nlignes')).toBe('"deux\nlignes"')
  })

  it('laisse passer une valeur ordinaire', () => {
    expect(cellule('Exemple')).toBe('Exemple')
    expect(cellule(52)).toBe('52')
  })
})

describe('contenuCsv', () => {
  it('commence par le BOM, sépare par point virgule et termine les lignes en CRLF', () => {
    const csv = contenuCsv(['Nom', 'Âge'], [['Exemple', 52], ['Modèle', 61]])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1).split('\r\n')).toEqual(['Nom;Âge', 'Exemple;52', 'Modèle;61'])
  })

  it('échappe chaque cellule et accepte une liste vide', () => {
    expect(contenuCsv(['A'], [['=1+1']]).slice(1)).toBe("A\r\n'=1+1")
    expect(contenuCsv(['A'], []).slice(1)).toBe('A')
  })
})
