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

  it('exclut un dossier dont la relance est passée ou du jour : la file du matin le montre déjà', () => {
    const r = dossiersStagnants([
      deal({ id: 'passee', jours: 40, next_action_date: '2026-08-20' }),
      deal({ id: 'jour', jours: 40, next_action_date: TODAY }),
      deal({ id: 'sans', jours: 40 }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((d) => d.id)).toEqual(['sans'])
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

// ─── Dossiers signés dont la fiche n'est pas finie ───────────────────────────
import { fichesSigneesSansMouvement, fichesSigneesParConseiller } from './stagnants'

const jourMoins = (jours) => {
  const d = new Date(TODAY + 'T12:00:00+02:00')
  d.setUTCDate(d.getUTCDate() - jours)
  return d.toISOString().slice(0, 10)
}
// Une fiche incomplète (il manque revenus, patrimoine, date de naissance…),
// créée il y a longtemps et jamais retouchée sauf indication contraire.
const fiche = ({ id = 'c1', ...reste } = {}) => ({
  id, nom: 'Camille Exemple', email: 'c@exemple.fr', telephone: '06 00 00 00 00',
  statut_pro: 'TNS', profession: 'Architecte', advisor_code: 'DEMO', co_advisor_code: null,
  created_at: jourMoins(400) + 'T09:00:00Z', updated_at: jourMoins(400) + 'T09:00:00Z', maj_par: null,
  ...reste,
})
const complete = (o = {}) => fiche({
  revenus_annuels: 50000, patrimoine_estime: 200000, date_naissance: '1980-01-01', situation_familiale: 'Marié', ...o,
})
const signe = ({ id = 's1', clientId = 'c1', jours = 40, ...reste } = {}) => ({
  id, status: 'Signé', client_id: clientId, advisor_code: 'DEMO', co_advisor_code: null,
  product: 'PER Individuel', date_signed: jourMoins(jours), updated_at: jourMoins(1) + 'T10:00:00Z', ...reste,
})

describe('fichesSigneesSansMouvement', () => {
  it('remonte un dossier signé depuis longtemps dont la fiche est incomplète', () => {
    const r = fichesSigneesSansMouvement([signe({ jours: 40 })], [fiche()], { today: TODAY })
    expect(r).toHaveLength(1)
    expect(r[0].joursSansMouvement).toBe(40)
    expect(r[0].score).toBeLessThan(100)
    expect(r[0].signeLe).toBe(jourMoins(40))
    expect(r[0].deal.product).toBe('PER Individuel')
  })

  it('écarte une fiche complète, quel que soit son âge', () => {
    expect(fichesSigneesSansMouvement([signe({ jours: 400 })], [complete()], { today: TODAY })).toHaveLength(0)
  })

  it('laisse 21 jours après la signature avant de réclamer la fiche', () => {
    expect(fichesSigneesSansMouvement([signe({ jours: 21 })], [fiche()], { today: TODAY })).toHaveLength(0)
    expect(fichesSigneesSansMouvement([signe({ jours: 22 })], [fiche()], { today: TODAY })).toHaveLength(1)
  })

  it('une saisie récente sur la fiche est un mouvement, même si la signature est vieille', () => {
    const f = fiche({ updated_at: jourMoins(5) + 'T09:00:00Z' })
    expect(fichesSigneesSansMouvement([signe({ jours: 90 })], [f], { today: TODAY })).toHaveLength(0)
  })

  it('ignore l updated_at du dossier : la migration du 25 août l a remis à neuf partout', () => {
    const d = signe({ jours: 60, updated_at: jourMoins(0) + 'T10:00:00Z' })
    expect(fichesSigneesSansMouvement([d], [fiche()], { today: TODAY })).toHaveLength(1)
  })

  it('n inclut ni les dossiers en cours, ni les annulés, ni ceux sans fiche', () => {
    const deals = [
      signe({ id: 'e', status: 'En cours' }),
      signe({ id: 'a', status: 'Annulé' }),
      signe({ id: 'x', clientId: 'inconnu' }),
    ]
    expect(fichesSigneesSansMouvement(deals, [fiche()], { today: TODAY })).toHaveLength(0)
  })

  it('une ligne par client : deux dossiers signés, une seule fiche, le plus récent porte le produit', () => {
    const deals = [
      signe({ id: 'ancien', jours: 200, product: 'SCPI' }),
      signe({ id: 'recent', jours: 40, product: 'Assurance Vie Française' }),
    ]
    const r = fichesSigneesSansMouvement(deals, [fiche()], { today: TODAY })
    expect(r).toHaveLength(1)
    expect(r[0].nbDossiers).toBe(2)
    expect(r[0].deal.id).toBe('recent')
    expect(r[0].joursSansMouvement).toBe(40)
  })

  it('filtre sur le conseiller : principal, co conseiller du dossier ou de la fiche', () => {
    const deals = [signe({ id: 'p', clientId: 'c1' }), signe({ id: 'co', clientId: 'c2', advisor_code: 'AUTRE', co_advisor_code: 'DEMO' }), signe({ id: 'n', clientId: 'c3', advisor_code: 'AUTRE' })]
    const fiches = [fiche({ id: 'c1' }), fiche({ id: 'c2', advisor_code: 'AUTRE' }), fiche({ id: 'c3', advisor_code: 'AUTRE' })]
    const ids = fichesSigneesSansMouvement(deals, fiches, { advisorCode: 'DEMO', today: TODAY }).map((f) => f.client.id)
    expect(ids.sort()).toEqual(['c1', 'c2'])
    const viaFiche = fichesSigneesSansMouvement([signe({ id: 'n', clientId: 'c3', advisor_code: 'AUTRE' })], [fiche({ id: 'c3', advisor_code: 'AUTRE', co_advisor_code: 'DEMO' })], { advisorCode: 'DEMO', today: TODAY })
    expect(viaFiche).toHaveLength(1)
  })

  it('dit qui a saisi la fiche en dernier, et quand, seulement si elle a bougé depuis sa création', () => {
    const jamaisTouchee = fichesSigneesSansMouvement([signe({ jours: 40 })], [fiche({ maj_par: 'DEMO' })], { today: TODAY })
    expect(jamaisTouchee[0].majLe).toBeNull()
    expect(jamaisTouchee[0].majPar).toBe('DEMO')

    const touchee = fichesSigneesSansMouvement(
      [signe({ jours: 60, co_advisor_code: 'VICTOR' })],
      [fiche({ updated_at: jourMoins(30) + 'T09:00:00Z', maj_par: 'VICTOR' })],
      { today: TODAY },
    )
    expect(touchee[0].majLe).toBe(jourMoins(30))
    expect(touchee[0].majPar).toBe('VICTOR')
    expect(touchee[0].coConseiller).toBe('VICTOR')
    // Le mouvement le plus récent est la saisie de VICTOR, pas la signature.
    expect(touchee[0].joursSansMouvement).toBe(30)
  })

  it('classe du plus ancien mouvement au plus récent, puis la fiche la plus vide d abord', () => {
    const deals = [signe({ id: 'a', clientId: 'c1', jours: 30 }), signe({ id: 'b', clientId: 'c2', jours: 90 }), signe({ id: 'c', clientId: 'c3', jours: 30 })]
    const fiches = [fiche({ id: 'c1' }), fiche({ id: 'c2' }), fiche({ id: 'c3', email: null, telephone: null })]
    const ids = fichesSigneesSansMouvement(deals, fiches, { today: TODAY }).map((f) => f.client.id)
    expect(ids).toEqual(['c2', 'c3', 'c1'])
  })
})

describe('fichesSigneesParConseiller', () => {
  it('compte une fiche pour le conseiller principal de son dossier', () => {
    const deals = [
      signe({ id: 'a', clientId: 'c1', advisor_code: 'DEMO', co_advisor_code: 'AUTRE' }),
      signe({ id: 'b', clientId: 'c2', advisor_code: 'AUTRE', jours: 80 }),
      signe({ id: 'c', clientId: 'c3', advisor_code: 'AUTRE' }),
    ]
    const fiches = [fiche({ id: 'c1' }), fiche({ id: 'c2' }), fiche({ id: 'c3' })]
    const r = fichesSigneesParConseiller(deals, fiches, { today: TODAY })
    expect(r).toEqual([
      { advisorCode: 'AUTRE', nombre: 2, plusAncienJours: 80 },
      { advisorCode: 'DEMO', nombre: 1, plusAncienJours: 40 },
    ])
  })
})
