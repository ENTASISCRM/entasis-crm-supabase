import { describe, it, expect } from 'vitest'
import { santeFlux, resumeSante, joursDepuis, FLUX } from './sante-flux'

const LE_24_AOUT = new Date('2026-08-24T12:00:00Z')
const par = (l) => Object.fromEntries(l.map(f => [f.cle, f]))

describe('joursDepuis', () => {
  it('compte les jours pleins', () => {
    expect(joursDepuis('2026-08-14T12:00:00Z', LE_24_AOUT)).toBe(10)
  })
  it('renvoie null sur une date absente ou invalide', () => {
    expect(joursDepuis(null, LE_24_AOUT)).toBeNull()
    expect(joursDepuis('jamais', LE_24_AOUT)).toBeNull()
  })
})

describe('santeFlux', () => {
  it('marque ok un flux écrit récemment', () => {
    const f = par(santeFlux({ leads: '2026-08-23T10:00:00Z' }, LE_24_AOUT))
    expect(f.leads.etat).toBe('ok')
    expect(f.leads.jours).toBe(1)
  })

  it('marque décroché un flux muet au-delà de son seuil', () => {
    const f = par(santeFlux({ calls: '2026-05-04T13:37:00Z' }, LE_24_AOUT))
    expect(f.calls.etat).toBe('decroche')
    expect(f.calls.jours).toBe(111)   // 4 mai 13h37 → 24 août 12h00 : le dernier jour n'est pas plein
  })

  it('marque vide un flux sans aucune écriture', () => {
    expect(par(santeFlux({ calls: null }, LE_24_AOUT)).calls.etat).toBe('vide')
  })

  it('applique un seuil propre à chaque flux', () => {
    // Les programmes immo tolèrent 60 jours, les leads 14.
    const dates = { leads: '2026-08-04T12:00:00Z', programmes: '2026-08-04T12:00:00Z' }
    const f = par(santeFlux(dates, LE_24_AOUT))
    expect(f.leads.etat).toBe('decroche')      // 20 j > 14
    expect(f.programmes.etat).toBe('ok')       // 20 j < 60
  })

  it('remonte les flux décrochés en premier, le plus ancien devant', () => {
    const f = santeFlux({
      leads: '2026-08-23T12:00:00Z',
      calls: '2026-05-04T12:00:00Z',
      leads_room: '2026-07-01T12:00:00Z',
    }, LE_24_AOUT)
    expect(f[0].cle).toBe('calls')
    expect(f.at(-1).cle).toBe('leads')
  })

  it('couvre les cinq flux même sans données', () => {
    expect(santeFlux({}, LE_24_AOUT)).toHaveLength(FLUX.length)
  })
})

describe('resumeSante', () => {
  it('ne dit rien quand tout va bien', () => {
    expect(resumeSante(santeFlux({
      leads: '2026-08-23T12:00:00Z', leads_room: '2026-08-23T12:00:00Z',
      calls: '2026-08-23T12:00:00Z', sync: '2026-08-23T12:00:00Z',
      programmes: '2026-08-23T12:00:00Z',
    }, LE_24_AOUT))).toBeNull()
  })

  it('nomme le flux quand il n’y en a qu’un', () => {
    const r = resumeSante(santeFlux({
      leads: '2026-08-23T12:00:00Z', leads_room: '2026-08-23T12:00:00Z',
      calls: '2026-05-04T12:00:00Z', sync: '2026-08-23T12:00:00Z',
      programmes: '2026-08-23T12:00:00Z',
    }, LE_24_AOUT))
    expect(r.nombre).toBe(1)
    expect(r.texte).toContain('Appels (Aircall)')
    expect(r.texte).toContain('112 jours')   // ici la dernière écriture est à 12h00 pile
  })

  it('la panne réelle du 4 mai remonte les trois flux', () => {
    const r = resumeSante(santeFlux({
      leads: '2026-08-23T12:00:00Z',
      leads_room: '2026-05-04T13:37:00Z',
      calls: '2026-05-04T13:37:00Z',
      sync: '2026-05-04T13:37:00Z',
      programmes: '2026-03-21T12:00:00Z',
    }, LE_24_AOUT))
    expect(r.nombre).toBe(4)   // les trois du 4 mai, plus les programmes de mars
    expect(r.pire.cle).toBe('programmes')
    expect(r.texte).toContain('4 flux')
  })
})
