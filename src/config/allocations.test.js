import { describe, it, expect } from 'vitest'
import {
  ALLOCATIONS,
  PARTENAIRES,
  CRANS,
  melanger,
  normaliser,
  totalPoids,
} from './allocations'

const parId = (id) => ALLOCATIONS.find((a) => a.id === id)

// Deux pôles jouets, volontairement simples, pour vérifier l'arithmétique
// du mélange sans dépendre des allocations réelles.
const BAS = { lignes: [{ fonds: 'A', isin: 'FR0000000001', poids: 60 }, { fonds: 'B', isin: 'FR0000000002', poids: 40 }] }
const HAUT = { lignes: [{ fonds: 'B', isin: 'FR0000000002', poids: 30 }, { fonds: 'C', isin: 'FR0000000003', poids: 70 }] }

describe('melanger', () => {
  it("à 0 % rend le pôle bas à l'identique", () => {
    expect(melanger(BAS, HAUT, 0)).toEqual([
      { fonds: 'A', isin: 'FR0000000001', poids: 60 },
      { fonds: 'B', isin: 'FR0000000002', poids: 40 },
    ])
  })

  it("à 100 % rend le pôle haut à l'identique", () => {
    expect(melanger(BAS, HAUT, 1)).toEqual([
      { fonds: 'C', isin: 'FR0000000003', poids: 70 },
      { fonds: 'B', isin: 'FR0000000002', poids: 30 },
    ])
  })

  it('à 50 % moyenne ligne à ligne sur l’union des supports', () => {
    // « un peu de dynamique et un peu de prudent » : A ne vient que du bas
    // (60 × 0,5 = 30), C que du haut (70 × 0,5 = 35), B des deux (35).
    // À poids égal (B et C à 35) le tri retombe sur le nom, d'où B avant C.
    expect(melanger(BAS, HAUT, 0.5)).toEqual([
      { fonds: 'B', isin: 'FR0000000002', poids: 35 },
      { fonds: 'C', isin: 'FR0000000003', poids: 35 },
      { fonds: 'A', isin: 'FR0000000001', poids: 30 },
    ])
  })

  it('trie par poids décroissant', () => {
    const poids = melanger(BAS, HAUT, 0.25).map((l) => l.poids)
    expect(poids).toEqual([...poids].sort((a, b) => b - a))
  })

  it('ne laisse pas de ligne à zéro', () => {
    const bas = { lignes: [{ fonds: 'A', isin: 'FR0000000001', poids: 100 }] }
    expect(melanger(bas, HAUT, 1).every((l) => l.poids > 0)).toBe(true)
  })

  it('reste neutre si un pôle est vide', () => {
    expect(melanger(BAS, { lignes: [] }, 0)).toHaveLength(2)
    expect(melanger({ lignes: [] }, { lignes: [] }, 0.5)).toEqual([])
  })

  it('ne normalise pas : le total du mélange suit celui des pôles', () => {
    // 100 côté bas, 100 côté haut → 100 partout.
    expect(totalPoids(melanger(BAS, HAUT, 0.4))).toBe(100)
    const haut105 = { lignes: [{ fonds: 'C', isin: 'FR0000000003', poids: 105 }] }
    expect(totalPoids(melanger(BAS, haut105, 0.5))).toBe(102.5)
  })
})

describe('normaliser', () => {
  it('ramène à 100 % au prorata', () => {
    const lignes = [{ poids: 60 }, { poids: 45 }]
    expect(totalPoids(normaliser(lignes))).toBe(100)
    expect(normaliser(lignes)[0].poids).toBe(57.1)
  })

  it('laisse tel quel une allocation déjà à 100 %', () => {
    expect(normaliser(BAS.lignes).map((l) => l.poids)).toEqual([60, 40])
  })

  it('ne divise pas par zéro', () => {
    expect(normaliser([])).toEqual([])
  })
})

describe('allocations de référence', () => {
  it('chaque partenaire pointe deux pôles existants', () => {
    for (const p of PARTENAIRES) {
      expect(parId(p.poleBas), `pôle bas ${p.cle}`).toBeTruthy()
      expect(parId(p.poleHaut), `pôle haut ${p.cle}`).toBeTruthy()
    }
  })

  it('aucune allocation ne répète un ISIN', () => {
    for (const a of ALLOCATIONS) {
      const isins = a.lignes.map((l) => l.isin)
      expect(new Set(isins).size, a.id).toBe(isins.length)
    }
  })

  it('tous les ISIN sont au format à 12 caractères', () => {
    for (const a of ALLOCATIONS) {
      for (const l of a.lignes) expect(l.isin, `${a.id} · ${l.fonds}`).toMatch(/^[A-Z]{2}[A-Z0-9]{10}$/)
    }
  })

  it('un pôle non vide qui ne tombe pas à 100 % le dit dans sa note', () => {
    for (const a of ALLOCATIONS) {
      if (!a.lignes.length) continue
      const t = totalPoids(a.lignes)
      if (t !== 100) expect(a.note, `${a.id} totalise ${t} %`).toBeTruthy()
    }
  })

  it("reproduit la proposition SwissLife telle qu'envoyée", () => {
    expect(totalPoids(parId('sl-equilibre-dynamique').lignes)).toBe(100)
    expect(totalPoids(parId('sl-offensif-diversifie').lignes)).toBe(105)
  })
})

describe('crans de la molette', () => {
  it('va de 0 à 100 en passant par le milieu', () => {
    expect(CRANS.map((c) => c.valeur)).toEqual([0, 50, 100])
  })
})
