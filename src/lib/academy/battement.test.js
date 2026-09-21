import { describe, it, expect } from 'vitest'
import { creerBattement } from './battement'

// Une leçon ouverte à t = 0, page visible, réglages par défaut (30 s, 120 s).
const ouvert = (opts) => {
  const b = creerBattement(opts)
  b.evenement('visible', 0)
  b.evenement('ouvert', 0)
  return b
}

describe('creerBattement', () => {
  it('n envoie rien avant le premier pas', () => {
    const b = ouvert()
    expect(b.doitEnvoyer(0)).toBe(false)
    expect(b.doitEnvoyer(29_999)).toBe(false)
  })
  it('envoie au premier pas après l ouverture, puis tous les pas', () => {
    const b = ouvert()
    expect(b.doitEnvoyer(30_000)).toBe(true)
    expect(b.doitEnvoyer(45_000)).toBe(false)
    expect(b.doitEnvoyer(60_000)).toBe(true)
    expect(b.etat().dernierEnvoi).toBe(60_000)
  })
  it('deux appels à la même milliseconde n envoient qu une fois', () => {
    const b = ouvert()
    expect(b.doitEnvoyer(30_000)).toBe(true)
    expect(b.doitEnvoyer(30_000)).toBe(false)
  })
  it('n envoie rien tant que la leçon n est pas ouverte', () => {
    const b = creerBattement()
    b.evenement('visible', 0)
    b.evenement('interaction', 0)
    expect(b.doitEnvoyer(30_000)).toBe(false)
    expect(b.etat().ouvert).toBe(false)
  })
  it('n envoie rien quand la page est cachée', () => {
    const b = ouvert()
    b.evenement('cache', 10_000)
    expect(b.doitEnvoyer(30_000)).toBe(false)
    expect(b.doitEnvoyer(60_000)).toBe(false)
    expect(b.etat()).toMatchObject({ visible: false, enPause: true })
  })
  it('reprend après un retour visible suivi d une interaction', () => {
    const b = ouvert()
    b.evenement('cache', 10_000)
    expect(b.doitEnvoyer(30_000)).toBe(false)
    b.evenement('visible', 40_000)
    b.evenement('interaction', 40_000)
    expect(b.doitEnvoyer(45_000)).toBe(true)
    expect(b.etat()).toMatchObject({ visible: true, enPause: false, derniereInteraction: 40_000 })
  })
  it('se met en pause après 120 s sans interaction', () => {
    const b = ouvert()
    expect(b.doitEnvoyer(30_000)).toBe(true)
    expect(b.doitEnvoyer(60_000)).toBe(true)
    expect(b.doitEnvoyer(90_000)).toBe(true)
    expect(b.doitEnvoyer(120_000)).toBe(false)
    expect(b.etat().enPause).toBe(true)
    expect(b.doitEnvoyer(150_000)).toBe(false)
  })
  it('une interaction relance les envois', () => {
    const b = ouvert()
    expect(b.doitEnvoyer(120_000)).toBe(false)
    b.evenement('interaction', 130_000)
    expect(b.etat().enPause).toBe(false)
    expect(b.doitEnvoyer(150_000)).toBe(true)
  })
  it('une interaction ne raccourcit pas le pas entre deux envois', () => {
    const b = ouvert()
    expect(b.doitEnvoyer(30_000)).toBe(true)
    b.evenement('interaction', 40_000)
    expect(b.doitEnvoyer(50_000)).toBe(false)
    expect(b.doitEnvoyer(60_000)).toBe(true)
  })
  it('fermer coupe tout, même visible et actif', () => {
    const b = ouvert()
    expect(b.doitEnvoyer(30_000)).toBe(true)
    b.evenement('ferme', 40_000)
    b.evenement('interaction', 50_000)
    expect(b.doitEnvoyer(60_000)).toBe(false)
    expect(b.doitEnvoyer(90_000)).toBe(false)
    expect(b.etat().ouvert).toBe(false)
  })
  it('une nouvelle ouverture repart de zéro', () => {
    const b = ouvert()
    expect(b.doitEnvoyer(30_000)).toBe(true)
    b.evenement('ferme', 40_000)
    b.evenement('ouvert', 100_000)
    expect(b.doitEnvoyer(110_000)).toBe(false)
    expect(b.doitEnvoyer(130_000)).toBe(true)
  })
  it('respecte des réglages personnalisés', () => {
    const b = ouvert({ pasMs: 10_000, inactiviteMs: 25_000 })
    expect(b.doitEnvoyer(9_999)).toBe(false)
    expect(b.doitEnvoyer(10_000)).toBe(true)
    expect(b.doitEnvoyer(20_000)).toBe(true)
    expect(b.doitEnvoyer(30_000)).toBe(false)
  })
  it('ignore un type d événement inconnu', () => {
    const b = ouvert()
    b.evenement('inconnu', 5_000)
    expect(b.etat()).toMatchObject({ visible: true, ouvert: true, derniereInteraction: 0, dernierEnvoi: null })
  })
})
