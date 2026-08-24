// Le point du regroupement : un seul appel navigateur pour tout le tableau.
// Ces tests exercent le handler lui-même, auth et réseau simulés.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./_auth.js', () => ({ verifyAuth: vi.fn().mockResolvedValue({ id: 'u1' }) }))
const { default: handler } = await import('./nav-batch.js')
const { verifyAuth } = await import('./_auth.js')

const serie = () => ({ chart: { result: [{
  meta: { longName: 'F', currency: 'EUR' },
  indicators: { quote: [{ close: Array.from({ length: 300 }, (_, i) => 100 + i * 0.1) }] },
  timestamp: Array.from({ length: 300 }, (_, i) => 1700000000 + i * 86400),
}] } })

const faireRes = () => {
  const res = { statusCode: null, corps: null, entetes: {} }
  res.setHeader = (k, v) => { res.entetes[k] = v }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.corps = b; return res }
  res.end = () => res
  return res
}
const faireReq = (fonds, method = 'POST') => ({ method, headers: { origin: 'http://localhost:5173' }, body: { fonds } })

beforeEach(() => { verifyAuth.mockResolvedValue({ id: 'u1' }) })
afterEach(() => { vi.unstubAllGlobals() })

describe('api/nav-batch', () => {
  it('renvoie les 37 fonds en UN appel, indexés par ISIN', async () => {
    const appels = vi.fn().mockResolvedValue({ json: async () => serie() })
    vi.stubGlobal('fetch', appels)
    const fonds = Array.from({ length: 37 }, (_, i) => ({ isin: `LU${String(i).padStart(9, '0')}${i % 10}`, ticker: `T${i}` }))
    const res = faireRes()
    await handler(faireReq(fonds), res)
    expect(res.statusCode).toBe(200)
    expect(Object.keys(res.corps.resultats)).toHaveLength(37)
    expect(res.corps.resultats[fonds[0].isin].vl).toBeGreaterThan(0)
  })

  it('met à null un fonds en échec sans faire tomber le lot', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => { if (++n === 2) throw new Error('502'); return { json: async () => serie() } }))
    const fonds = [{ isin: 'LU1331971769', ticker: 'A' }, { isin: 'FR0010400762', ticker: 'B' }, { isin: 'LU1112771503', ticker: 'C' }]
    const res = faireRes()
    await handler({ ...faireReq(fonds), body: { fonds } }, res)
    expect(res.statusCode).toBe(200)
    expect(Object.values(res.corps.resultats).filter(v => v === null)).toHaveLength(1)
    expect(Object.values(res.corps.resultats).filter(v => v?.vl > 0)).toHaveLength(2)
  })

  it('refuse sans jeton valide', async () => {
    verifyAuth.mockRejectedValue(new Error('Token invalide'))
    const res = faireRes()
    await handler(faireReq([{ isin: 'LU1331971769' }]), res)
    expect(res.statusCode).toBe(401)
  })

  it('refuse une autre méthode que POST', async () => {
    const res = faireRes()
    await handler(faireReq([], 'GET'), res)
    expect(res.statusCode).toBe(405)
  })

  it('plafonne la taille du lot', async () => {
    const res = faireRes()
    await handler(faireReq(Array.from({ length: 101 }, () => ({ isin: 'LU1331971769' }))), res)
    expect(res.statusCode).toBe(400)
  })

  it('accepte une liste vide sans appeler le réseau', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const res = faireRes()
    await handler(faireReq([]), res)
    expect(res.statusCode).toBe(200)
    expect(res.corps.resultats).toEqual({})
    expect(f).not.toHaveBeenCalled()
  })

  it('exige fonds[]', async () => {
    const res = faireRes()
    await handler({ method: 'POST', headers: {}, body: {} }, res)
    expect(res.statusCode).toBe(400)
  })
})
