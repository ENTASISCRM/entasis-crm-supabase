// Le Cockpit affichait des chiffres de collecte faux : il ignorait les dossiers
// ou le conseiller est co conseiller, comptait a 100 pourcent ceux dont il est
// titulaire, incluait Mutuelle et Prevoyance TNS que la vue direction exclut,
// et sommait les lignes pour faire le total cabinet, ce qui comptait deux fois
// chaque dossier partage. Comme c est un chiffre que chaque conseiller compare
// a sa remuneration, ces regles sont verrouillees ici.

import { describe, it, expect } from 'vitest'
import { computeCockpit } from './ratios'

const MOIS = ['2026-05', '2026-06', '2026-07']
const COURANT = '2026-07'

const socle = {
  mois: MOIS,
  clients: [{ id: 'c1', advisor_code: 'ALICE' }, { id: 'c2', advisor_code: 'BOB' }],
  equip: [
    { client_id: 'c1', advisor_code: 'ALICE', familles: ['per'] },
    { client_id: 'c2', advisor_code: 'BOB', familles: ['av'] },
  ],
  missions: [],
  team: [{ advisor_code: 'ALICE', full_name: 'Alice' }, { advisor_code: 'BOB', full_name: 'Bob' }],
  isManager: true,
}

const ligne = (r, code) => r.lignes.find((l) => l.code === code)

describe('computeCockpit, collecte', () => {
  it('partage un dossier en co conseil, moitie chacun', () => {
    const r = computeCockpit({
      ...socle,
      deals: [{ advisor_code: 'ALICE', co_advisor_code: 'BOB', date_signed: '2026-07-10', pp_m: 100, pu: 10000, product: 'PER Individuel' }],
    })
    // 100 x 12 + 10 000 = 11 200, moitie chacun
    expect(ligne(r, 'ALICE').collecteMois).toBe(5600)
    expect(ligne(r, 'BOB').collecteMois).toBe(5600)
  })

  it('donne au co conseiller sa part, meme sans dossier a lui', () => {
    // C etait le defaut principal : le co conseiller voyait zero.
    const r = computeCockpit({
      ...socle,
      deals: [{ advisor_code: 'ALICE', co_advisor_code: 'BOB', date_signed: '2026-07-10', pp_m: 0, pu: 200000, product: 'Assurance Vie Française' }],
    })
    expect(ligne(r, 'BOB').collecteMois).toBe(100000)
  })

  it('cree une ligne pour un co conseiller inconnu par ailleurs, pour que sa moitie ne disparaisse pas', () => {
    const r = computeCockpit({
      ...socle,
      deals: [{ advisor_code: 'ALICE', co_advisor_code: 'NOUVEAU', date_signed: '2026-07-10', pp_m: 50, pu: 0, product: 'PER Individuel' }],
    })
    const total = r.lignes.reduce((s, l) => s + l.collecteMois, 0)
    expect(total).toBe(600)   // 50 x 12, entierement reparti
  })

  it('exclut Mutuelle et Prevoyance TNS de la collecte, comme la vue direction', () => {
    const r = computeCockpit({
      ...socle,
      deals: [
        { advisor_code: 'ALICE', date_signed: '2026-07-10', pp_m: 100, pu: 0, product: 'PER Individuel' },
        { advisor_code: 'ALICE', date_signed: '2026-07-12', pp_m: 200, pu: 0, product: 'Mutuelle Santé' },
        { advisor_code: 'ALICE', date_signed: '2026-07-13', pp_m: 300, pu: 0, product: 'Prévoyance TNS' },
      ],
    })
    expect(ligne(r, 'ALICE').collecteMois).toBe(1200)   // seul le PER compte
  })

  it('garde la PU des produits d assurance personnes', () => {
    const r = computeCockpit({
      ...socle,
      deals: [{ advisor_code: 'ALICE', date_signed: '2026-07-10', pp_m: 200, pu: 5000, product: 'Mutuelle Santé' }],
    })
    expect(ligne(r, 'ALICE').collecteMois).toBe(5000)
  })
})

describe('computeCockpit, comptes', () => {
  it('compte les dossiers du conseiller en entier, pas en moities', () => {
    const r = computeCockpit({
      ...socle,
      deals: [
        { advisor_code: 'ALICE', co_advisor_code: 'BOB', date_signed: '2026-07-10', pp_m: 100, pu: 0, product: 'PER Individuel' },
        { advisor_code: 'ALICE', date_signed: '2026-07-11', pp_m: 100, pu: 0, product: 'PER Individuel' },
      ],
    })
    expect(ligne(r, 'ALICE').nbDealsMois).toBe(2)
    expect(ligne(r, 'BOB').nbDealsMois).toBe(1)
  })

  it('ne compte le total cabinet qu une fois par dossier partage', () => {
    // Le total se prenait en sommant les lignes : un dossier en binome
    // comptait deux fois (juillet 2026 : 79 annonces pour 52 reels).
    const r = computeCockpit({
      ...socle,
      deals: [
        { advisor_code: 'ALICE', co_advisor_code: 'BOB', date_signed: '2026-07-10', pp_m: 100, pu: 0, product: 'PER Individuel' },
        { advisor_code: 'ALICE', date_signed: '2026-07-11', pp_m: 100, pu: 0, product: 'PER Individuel' },
      ],
    })
    expect(r.cabinet.nbDeals).toBe(2)
    expect(r.lignes.reduce((s, l) => s + l.nbDealsMois, 0)).toBe(3)   // la somme des lignes, elle, double
    expect(r.cabinet.collecte).toBe(2400)   // 2 x 1 200, pas 3 600
  })

  it('ne retient que le mois courant pour le total cabinet', () => {
    const r = computeCockpit({
      ...socle,
      deals: [
        { advisor_code: 'ALICE', date_signed: '2026-06-10', pp_m: 100, pu: 0, product: 'PER Individuel' },
        { advisor_code: 'ALICE', date_signed: '2026-07-11', pp_m: 100, pu: 0, product: 'PER Individuel' },
      ],
    })
    expect(r.cabinet.nbDeals).toBe(1)
    expect(r.moisCourant).toBe(COURANT)
  })

  it('remplit la serie mois par mois, pour le sparkline', () => {
    const r = computeCockpit({
      ...socle,
      deals: [
        { advisor_code: 'ALICE', date_signed: '2026-05-10', pp_m: 100, pu: 0, product: 'PER Individuel' },
        { advisor_code: 'ALICE', date_signed: '2026-07-11', pp_m: 200, pu: 0, product: 'PER Individuel' },
      ],
    })
    expect(ligne(r, 'ALICE').serie).toEqual([1200, 0, 2400])
  })

  it('ignore un dossier sans date de signature', () => {
    const r = computeCockpit({
      ...socle,
      deals: [{ advisor_code: 'ALICE', date_signed: null, pp_m: 100, pu: 0, product: 'PER Individuel' }],
    })
    expect(ligne(r, 'ALICE')?.collecteMois ?? 0).toBe(0)
  })
})

describe('computeCockpit, robustesse des codes', () => {
  it('ne fabrique pas de conseiller fantome a partir d un co conseiller vide', () => {
    // 159 dossiers portent co_advisor_code = '' (chaine vide, pas NULL) :
    // regroupes sous un code vide, ils annoncaient 440 639 euros sur juillet.
    const r = computeCockpit({
      ...socle,
      deals: [
        { advisor_code: 'ALICE', co_advisor_code: '', date_signed: '2026-07-10', pp_m: 100, pu: 0, product: 'PER Individuel' },
        { advisor_code: 'ALICE', co_advisor_code: '   ', date_signed: '2026-07-11', pp_m: 100, pu: 0, product: 'PER Individuel' },
      ],
    })
    expect(r.lignes.map((l) => l.code)).not.toContain('')
    expect(r.lignes.every((l) => l.code.trim().length > 0)).toBe(true)
  })

  it('ne partage pas un dossier dont le co conseiller est une chaine vide', () => {
    const r = computeCockpit({
      ...socle,
      deals: [{ advisor_code: 'ALICE', co_advisor_code: '', date_signed: '2026-07-10', pp_m: 100, pu: 0, product: 'PER Individuel' }],
    })
    expect(ligne(r, 'ALICE').collecteMois).toBe(1200)   // entier, pas 600
  })
})
