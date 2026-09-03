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

  it('sans instantané, tout ce qui est rempli part, comme avant : la fiche retrouvée par email reçoit le téléphone', () => {
    const initial = { client_email: 'fige@exemple.fr', client_phone: '01 00 00 00 00' }
    const deal = { ...initial, client_statut_pro: 'Salarié', client_revenus: 40000 }
    expect(modifsFiche(deal, null, initial)).toEqual({
      email: 'fige@exemple.fr', telephone: '01 00 00 00 00', statut_pro: 'Salarié', revenus_annuels: 40000,
    })
  })

  it('la copie figée de l email sur le dossier ne réécrit pas une fiche qui a déjà un email', () => {
    // Le dossier porte encore ancien@, la fiche a été corrigée en camille@ :
    // Enregistrer sans toucher aux coordonnées ne doit pas ramener ancien@.
    const initial = { ...instantane, client_email: 'ancien@exemple.fr', client_phone: '0600000000' }
    const deal = preremplirDepuisFiche(initial, fiche)
    expect(modifsFiche(deal, instantane, initial)).toEqual({})
  })

  it('mais elle remplit une fiche qui n a pas de téléphone', () => {
    const sansTel = instantaneFiche({ ...fiche, telephone: null })
    const initial = { ...sansTel, client_phone: '0600000000' }
    expect(modifsFiche(initial, sansTel, initial)).toEqual({ telephone: '0600000000' })
  })

  it('un email tapé dans la modale part vers la fiche, même si elle en avait un', () => {
    const initial = { ...instantane, client_email: 'ancien@exemple.fr' }
    const deal = { ...initial, client_email: 'nouveau@exemple.fr' }
    expect(modifsFiche(deal, instantane, initial)).toEqual({ email: 'nouveau@exemple.fr' })
  })

  it('compare des textes : 50000 et « 50000 » sont la même valeur', () => {
    const deal = { ...instantane, client_revenus: '50000' }
    expect(modifsFiche(deal, instantane, deal)).toEqual({})
  })
})
