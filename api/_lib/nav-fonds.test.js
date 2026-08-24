// Le regroupement des VL touche ce que les conseillers lisent à l'écran.
// Ces tests figent le contrat du module partagé : plafond de simultanéité,
// ordre préservé, et un fonds en échec qui n'emporte pas les autres.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { vlDesFonds, vlDuFonds, isinValide } from './nav-fonds.js'

const serieYahoo = (n = 300) => ({
  chart: { result: [{
    meta: { longName: 'Fonds test', currency: 'EUR' },
    indicators: { quote: [{ close: Array.from({ length: n }, (_, i) => 100 + i * 0.1) }] },
    timestamp: Array.from({ length: n }, (_, i) => 1700000000 + i * 86400),
  }] },
})

afterEach(() => { vi.unstubAllGlobals() })

describe('isinValide', () => {
  it('accepte un ISIN bien formé', () => {
    expect(isinValide('LU1331971769')).toBe(true)
    expect(isinValide('FR0010400762')).toBe(true)
  })
  it('refuse le reste', () => {
    for (const mauvais of ['', 'ABC', 'lu1331971769', 'LU133197176', '12345678901A']) {
      expect(isinValide(mauvais), mauvais).toBe(false)
    }
  })
})

describe('vlDuFonds', () => {
  it('ne lève jamais : une erreur réseau devient { erreur }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('réseau coupé')))
    const r = await vlDuFonds({ isin: 'LU1331971769' })
    expect(r.erreur).toBe('réseau coupé')
  })

  it('refuse un ISIN mal formé sans appeler le réseau', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const r = await vlDuFonds({ isin: 'PAS-UN-ISIN' })
    expect(r.erreur).toBe('Format ISIN invalide')
    expect(f).not.toHaveBeenCalled()
  })

  it('calcule VL et performances depuis la série Yahoo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => serieYahoo() }))
    const r = await vlDuFonds({ isin: 'LU1331971769', ticker: '0PTEST.F' })
    expect(r.vl).toBeGreaterThan(0)
    expect(r.currency).toBe('EUR')
    for (const k of ['perf1W', 'perf1M', 'perf3M', 'perf1Y']) expect(r[k], k).not.toBeNull()
  })

  it('écarte une série plate plutôt que d’inventer une performance', async () => {
    const plat = { chart: { result: [{ meta: {}, indicators: { quote: [{ close: Array(50).fill(100) }] }, timestamp: Array.from({length:50},(_,i)=>1700000000+i*86400) }] } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => plat }))
    expect((await vlDuFonds({ isin: 'LU1331971769', ticker: 'X' })).erreur).toBe('flat data')
  })
})

describe('vlDesFonds', () => {
  const trente7 = Array.from({ length: 37 }, (_, i) => ({ isin: `LU${String(i).padStart(9, '0')}${i % 10}`, ticker: `T${i}` }))

  it('traite tout le lot et garde l’ordre', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => serieYahoo() }))
    const r = await vlDesFonds(trente7)
    expect(r).toHaveLength(37)
    r.forEach((x, i) => expect(x.isin).toBe(trente7[i].isin))
  })

  it('ne dépasse jamais le plafond de requêtes simultanées', async () => {
    let enCours = 0, pic = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      enCours++; pic = Math.max(pic, enCours)
      await new Promise(r => setTimeout(r, 1))
      enCours--
      return { json: async () => serieYahoo() }
    }))
    await vlDesFonds(trente7, 8)
    expect(pic).toBeLessThanOrEqual(8)
  })

  it('un fonds en échec n’emporte pas les autres', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (++n === 3) throw new Error('502')
      return { json: async () => serieYahoo() }
    }))
    const r = await vlDesFonds(trente7.slice(0, 5), 1)
    expect(r.filter(x => x.erreur)).toHaveLength(1)
    expect(r.filter(x => x.vl > 0).length).toBe(4)
  })

  it('sur une liste vide, ne lance aucun ouvrier', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await vlDesFonds([])).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
})
