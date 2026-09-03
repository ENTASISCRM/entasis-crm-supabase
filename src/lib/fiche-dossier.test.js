import { describe, it, expect } from 'vitest'
import { instantaneFiche, preremplirDepuisFiche, modifsFiche } from './fiche-dossier'

const fiche = {
  id: 'c1', email: 'camille@exemple.fr', telephone: '06 00 00 00 00',
  statut_pro: 'TNS', profession: 'Architecte', revenus_annuels: 50000, patrimoine_estime: 200000,
}

describe('instantaneFiche', () => {
  it('recopie les six champs sous les clés du dossier', () => {
    expect(instantaneFiche(fiche)).toEqual({
      client_email: 'camille@exemple.fr', client_phone: '06 00 00 00 00',
      client_statut_pro: 'TNS', client_profession: 'Architecte',
      client_revenus: 50000, client_patrimoine: 200000,
    })
  })

  it('met null sur ce que la fiche n a pas', () => {
    expect(instantaneFiche({ email: 'x@exemple.fr' }).client_revenus).toBeNull()
    expect(instantaneFiche(null).client_email).toBeNull()
  })
})

describe('preremplirDepuisFiche', () => {
  it('remplit les champs vides et laisse les autres', () => {
    const deal = { id: 'D1', client_email: 'ancien@exemple.fr', client_phone: '', client_revenus: null }
    const r = preremplirDepuisFiche(deal, fiche)
    expect(r.client_email).toBe('ancien@exemple.fr')
    expect(r.client_phone).toBe('06 00 00 00 00')
    expect(r.client_revenus).toBe(50000)
    expect(r.client_statut_pro).toBe('TNS')
  })

  it('ne pose rien depuis une fiche vide ou absente, et un 0 saisi reste', () => {
    expect(preremplirDepuisFiche({ client_revenus: 0 }, fiche).client_revenus).toBe(0)
    expect(preremplirDepuisFiche({ client_email: '' }, null).client_email).toBe('')
  })
})

describe('modifsFiche', () => {
  const instantane = instantaneFiche(fiche)

  it('ne renvoie rien quand rien n a changé : la fiche n est pas retamponnée', () => {
    const deal = { ...instantane }
    expect(modifsFiche(deal, instantane, deal)).toEqual({})
  })

  it('renvoie seulement ce qui diffère de l instantané', () => {
    const deal = { ...instantane, client_revenus: 80000, client_profession: 'Architecte ' }
    expect(modifsFiche(deal, instantane, deal)).toEqual({ revenus_annuels: 80000 })
  })

  it('n efface jamais : un champ vidé dans la modale ne repart pas', () => {
    const deal = { ...instantane, client_profession: '' }
    expect(modifsFiche(deal, instantane, deal)).toEqual({})
  })

  it('sans instantané, les quatre champs tapés partent, l email du dossier non', () => {
    const initial = { client_email: 'fige@exemple.fr', client_phone: '01 00 00 00 00' }
    const deal = { ...initial, client_statut_pro: 'Salarié', client_revenus: 40000 }
    expect(modifsFiche(deal, null, initial)).toEqual({ statut_pro: 'Salarié', revenus_annuels: 40000 })
  })

  it('sans instantané, un email changé dans la modale part vers la fiche', () => {
    const initial = { client_email: 'fige@exemple.fr' }
    const deal = { client_email: 'nouveau@exemple.fr' }
    expect(modifsFiche(deal, null, initial)).toEqual({ email: 'nouveau@exemple.fr' })
  })

  it('compare des textes : 50000 et « 50000 » sont la même valeur', () => {
    const deal = { ...instantane, client_revenus: '50000' }
    expect(modifsFiche(deal, instantane, deal)).toEqual({})
  })
})
