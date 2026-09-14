import { describe, it, expect } from 'vitest'
import { FUNDS_DEFAULT, FONDS_SUIVIS, FONDS_PAR_ISIN, ordonnerFonds } from './fonds'

// Les cinq supports du pôle prudent Abeille, que Louis suit de près depuis le
// 14 septembre. Leurs ISIN viennent du détail du contrat, vérifiés un par un.
const ISIN_SUIVIS = [
  'FR0010147603', // Carmignac Investissement Latitude A
  'LU2358392376', // Varenne Valeur A
  'LU1112771503', // Helium Selection B
  'FR0010400762', // Moneta Long Short A
  'LU1331971769', // Eleva Absolute Return Europe A1
]

describe('fonds sous surveillance', () => {
  it('les cinq supports du contrat sont dans le référentiel', () => {
    for (const isin of ISIN_SUIVIS) expect(FONDS_PAR_ISIN[isin]).toBeDefined()
  })

  it('et ils sont les seuls marqués suivis', () => {
    expect(FONDS_SUIVIS.map((f) => f.isin).sort()).toEqual([...ISIN_SUIVIS].sort())
  })

  it('tout ISIN du référentiel a douze caractères et un pays', () => {
    for (const f of FUNDS_DEFAULT) expect(f.isin).toMatch(/^[A-Z]{2}[A-Z0-9]{10}$/)
  })

  it('aucun ISIN en double', () => {
    const vus = FUNDS_DEFAULT.map((f) => f.isin)
    expect(new Set(vus).size).toBe(vus.length)
  })
})

describe('ordonnerFonds', () => {
  const a = { isin: 'FR0000000001', suivi: true }
  const b = { isin: 'FR0000000002' }
  const c = { isin: 'FR0000000003', suivi: true }
  const d = { isin: 'FR0000000004' }

  it('remonte les fonds suivis en tête', () => {
    expect(ordonnerFonds([b, a, d, c]).map((f) => f.isin))
      .toEqual(['FR0000000001', 'FR0000000003', 'FR0000000002', 'FR0000000004'])
  })

  it('garde l ordre du référentiel dans chaque groupe', () => {
    expect(ordonnerFonds([d, c, b, a]).map((f) => f.isin))
      .toEqual(['FR0000000003', 'FR0000000001', 'FR0000000004', 'FR0000000002'])
  })

  it('ne garde que les suivis quand on le demande', () => {
    expect(ordonnerFonds([b, a, d, c], true).map((f) => f.isin))
      .toEqual(['FR0000000001', 'FR0000000003'])
  })

  it('ne modifie jamais la liste reçue', () => {
    const liste = [b, a]
    ordonnerFonds(liste)
    expect(liste.map((f) => f.isin)).toEqual(['FR0000000002', 'FR0000000001'])
  })

  it('tolère une liste vide ou absente', () => {
    expect(ordonnerFonds([])).toEqual([])
    expect(ordonnerFonds(null)).toEqual([])
    expect(ordonnerFonds(undefined, true)).toEqual([])
  })

  it('sur le vrai référentiel, les cinq suivis sortent en tête', () => {
    const cinq = ordonnerFonds(FUNDS_DEFAULT).slice(0, 5)
    expect(cinq.every((f) => f.suivi)).toBe(true)
    expect(ordonnerFonds(FUNDS_DEFAULT)).toHaveLength(FUNDS_DEFAULT.length)
  })
})
