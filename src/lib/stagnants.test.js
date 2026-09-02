import { describe, it, expect } from 'vitest'
import {
  dossiersStagnants, dossiersStagnantsCabinet, stagnantsParConseiller, joursSansMouvement,
} from './stagnants'

const TODAY = '2026-09-02'
// Un dossier fictif en cours, sans mouvement depuis `jours` jours (midi à Paris).
const deal = ({ jours = 30, ...reste }) => {
  const d = new Date(TODAY + 'T12:00:00+02:00')
  d.setUTCDate(d.getUTCDate() - jours)
  return {
    id: 'd1', status: 'En cours', advisor_code: 'DEMO', product: 'PER Individuel',
    client: 'Camille Exemple', updated_at: d.toISOString(), ...reste,
  }
}

describe('joursSansMouvement', () => {
  it('compte des jours entiers depuis le jour du dernier mouvement', () => {
    expect(joursSansMouvement(deal({ jours: 0 }), TODAY)).toBe(0)
    expect(joursSansMouvement(deal({ jours: 1 }), TODAY)).toBe(1)
    expect(joursSansMouvement(deal({ jours: 45 }), TODAY)).toBe(45)
  })

  it('ramène l’instant UTC au jour de Paris avant de compter', () => {
    // 21h30 UTC le 11 août, c’est encore le 11 août à Paris (23h30) : 22 jours.
    expect(joursSansMouvement({ updated_at: '2026-08-11T21:30:00+00:00' }, TODAY)).toBe(22)
    // 22h30 UTC le 11 août, c’est déjà le 12 août à Paris (00h30) : 21 jours.
    expect(joursSansMouvement({ updated_at: '2026-08-11T22:30:00+00:00' }, TODAY)).toBe(21)
  })

  it('rend 0 sans horodatage ou pour un mouvement dans le futur', () => {
    expect(joursSansMouvement({}, TODAY)).toBe(0)
    expect(joursSansMouvement({ updated_at: null }, TODAY)).toBe(0)
    expect(joursSansMouvement({ updated_at: '2026-09-10T08:00:00+00:00' }, TODAY)).toBe(0)
  })

  it('accepte une date sans heure', () => {
    expect(joursSansMouvement({ updated_at: '2026-08-01' }, TODAY)).toBe(32)
  })
})

describe('dossiersStagnants', () => {
  it('respecte le seuil : strictement plus de 21 jours', () => {
    const r = dossiersStagnants([
      deal({ id: 'j20', jours: 20 }),
      deal({ id: 'j21', jours: 21 }),
      deal({ id: 'j22', jours: 22 }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((d) => d.id)).toEqual(['j22'])
    expect(r[0].joursSansMouvement).toBe(22)
  })

  it('exclut un dossier qui porte une relance à venir : il attend, il ne stagne pas', () => {
    const r = dossiersStagnants([
      deal({ id: 'futur', jours: 40, next_action: 'rappeler', next_action_date: '2026-09-15' }),
      deal({ id: 'demain', jours: 40, next_action_date: '2026-09-03' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r).toHaveLength(0)
  })

  it('inclut un dossier dont la relance est passée ou du jour', () => {
    const r = dossiersStagnants([
      deal({ id: 'passee', jours: 40, next_action_date: '2026-08-20' }),
      deal({ id: 'jour', jours: 40, next_action_date: TODAY }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((d) => d.id).sort()).toEqual(['jour', 'passee'])
  })

  it('ne garde que les dossiers « En cours »', () => {
    const r = dossiersStagnants([
      deal({ id: 's', status: 'Signé', jours: 60 }),
      deal({ id: 'a', status: 'Annulé', jours: 60 }),
      deal({ id: 'p', status: 'Prévu', jours: 60 }),
      deal({ id: 'e', status: 'En cours', jours: 60 }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((d) => d.id)).toEqual(['e'])
  })

  it('inclut les dossiers où le conseiller est co conseiller, exclut ceux des autres', () => {
    const r = dossiersStagnants([
      deal({ id: 'co', advisor_code: 'AUTRE', co_advisor_code: 'DEMO', jours: 30 }),
      deal({ id: 'autre', advisor_code: 'AUTRE', jours: 30 }),
      deal({ id: 'mien', jours: 30 }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((d) => d.id).sort()).toEqual(['co', 'mien'])
  })

  it('trie du plus ancien mouvement au plus récent', () => {
    const r = dossiersStagnants([
      deal({ id: 'j25', jours: 25 }),
      deal({ id: 'j90', jours: 90 }),
      deal({ id: 'j40', jours: 40 }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((d) => d.id)).toEqual(['j90', 'j40', 'j25'])
    expect(r.map((d) => d.joursSansMouvement)).toEqual([90, 40, 25])
  })

  it('accepte un seuil personnalisé', () => {
    const dossiers = [deal({ id: 'j10', jours: 10 }), deal({ id: 'j5', jours: 5 })]
    expect(dossiersStagnants(dossiers, { advisorCode: 'DEMO', today: TODAY, seuilJours: 7 }).map((d) => d.id)).toEqual(['j10'])
    expect(dossiersStagnants(dossiers, { advisorCode: 'DEMO', today: TODAY, seuilJours: 3 }).map((d) => d.id)).toEqual(['j10', 'j5'])
  })

  it('rend une liste vide sans code conseiller ou sans dossiers', () => {
    expect(dossiersStagnants(null, { advisorCode: 'DEMO', today: TODAY })).toEqual([])
    expect(dossiersStagnants([deal({ jours: 60 })], { today: TODAY })).toEqual([])
  })
})

describe('dossiersStagnantsCabinet', () => {
  it('rend tous les dossiers stagnants, tous conseillers confondus, triés', () => {
    const r = dossiersStagnantsCabinet([
      deal({ id: 'a', advisor_code: 'AAA', jours: 30 }),
      deal({ id: 'b', advisor_code: 'BBB', jours: 50 }),
      deal({ id: 'c', advisor_code: 'CCC', jours: 10 }),
    ], { today: TODAY })
    expect(r.map((d) => d.id)).toEqual(['b', 'a'])
  })
})

describe('stagnantsParConseiller', () => {
  it('compte par conseiller principal, trié par nombre décroissant', () => {
    const r = stagnantsParConseiller([
      deal({ id: '1', advisor_code: 'AAA', jours: 30 }),
      deal({ id: '2', advisor_code: 'BBB', jours: 25 }),
      deal({ id: '3', advisor_code: 'BBB', jours: 70 }),
      deal({ id: '4', advisor_code: 'BBB', jours: 10 }),
      deal({ id: '5', advisor_code: 'CCC', jours: 22, next_action_date: '2026-09-20' }),
    ], { today: TODAY })
    expect(r).toEqual([
      { advisorCode: 'BBB', nombre: 2, plusAncienJours: 70 },
      { advisorCode: 'AAA', nombre: 1, plusAncienJours: 30 },
    ])
  })

  it('un dossier partagé compte pour son conseiller principal uniquement', () => {
    const r = stagnantsParConseiller([
      deal({ id: '1', advisor_code: 'AAA', co_advisor_code: 'BBB', jours: 30 }),
    ], { today: TODAY })
    expect(r).toEqual([{ advisorCode: 'AAA', nombre: 1, plusAncienJours: 30 }])
  })

  it('applique le seuil personnalisé et rend vide sans dossiers', () => {
    expect(stagnantsParConseiller([deal({ jours: 10 })], { today: TODAY, seuilJours: 7 })).toHaveLength(1)
    expect(stagnantsParConseiller([deal({ jours: 10 })], { today: TODAY })).toHaveLength(0)
    expect(stagnantsParConseiller(null, { today: TODAY })).toEqual([])
  })
})
