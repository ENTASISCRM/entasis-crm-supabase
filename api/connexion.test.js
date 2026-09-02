import { describe, it, expect } from 'vitest'
import { ipDuClient, localisationDuClient } from './connexion.js'

const req = (headers) => ({ headers })

describe('ipDuClient', () => {
  it('prend la premiere adresse de la chaine, celle du client', () => {
    expect(ipDuClient(req({ 'x-forwarded-for': '82.64.10.7, 10.0.0.1, 10.0.0.2' }))).toBe('82.64.10.7')
  })

  it('prefere l entete Vercel, qui porte la vraie adresse du navigateur', () => {
    expect(ipDuClient(req({
      'x-vercel-forwarded-for': '82.64.10.7',
      'x-forwarded-for': '10.0.0.1',
    }))).toBe('82.64.10.7')
  })

  it('retombe sur x-real-ip', () => {
    expect(ipDuClient(req({ 'x-real-ip': '90.12.44.180' }))).toBe('90.12.44.180')
  })

  it('rend null quand aucun entete ne porte d adresse', () => {
    expect(ipDuClient(req({}))).toBeNull()
    expect(ipDuClient(req({ 'x-forwarded-for': '   ' }))).toBeNull()
  })
})

describe('localisationDuClient', () => {
  it('lit le pays, la region et la ville poses par Vercel', () => {
    expect(localisationDuClient(req({
      'x-vercel-ip-country': 'FR',
      'x-vercel-ip-country-region': 'IDF',
      'x-vercel-ip-city': 'Paris',
    }))).toEqual({ pays: 'FR', region: 'IDF', ville: 'Paris' })
  })

  it('decode une ville accentuee, encodee en pourcent par Vercel', () => {
    expect(localisationDuClient(req({ 'x-vercel-ip-city': 'Orl%C3%A9ans' })).ville).toBe('Orléans')
  })

  it('laisse la ville telle quelle si le decodage echoue', () => {
    expect(localisationDuClient(req({ 'x-vercel-ip-city': 'Saint%Denis' })).ville).toBe('Saint%Denis')
  })

  it('rend null sur chaque champ absent, jamais une chaine vide', () => {
    expect(localisationDuClient(req({}))).toEqual({ pays: null, region: null, ville: null })
    expect(localisationDuClient(req({ 'x-vercel-ip-city': '' })).ville).toBeNull()
  })
})
