import { describe, it, expect } from 'vitest'
import { estEnPoste, estEnPosteCeMois, contratDeReference, contratsDeReferenceParPersonne } from './contrats.js'

const REF = new Date('2026-09-15T10:00:00')
const c = (o) => ({ id: o.id || 'k', profile_id: 'p1', actif: true, date_debut: '2026-01-01', date_fin: null, ...o })

describe('estEnPoste', () => {
  it('est en poste entre debut et fin, bornes comprises', () => {
    expect(estEnPoste(c({ date_debut: '2026-09-15', date_fin: '2026-09-15' }), REF)).toBe(true)
    expect(estEnPoste(c({ date_debut: '2026-09-16' }), REF)).toBe(false)
    expect(estEnPoste(c({ date_fin: '2026-09-14' }), REF)).toBe(false)
  })
  it('sans date de fin, reste en poste', () => {
    expect(estEnPoste(c({ date_debut: '2024-09-16' }), REF)).toBe(true)
  })
  it('ignore les drapeaux : seules les dates comptent', () => {
    expect(estEnPoste(c({ actif: false }), REF)).toBe(true)
  })
})

describe('estEnPosteCeMois', () => {
  it('compte un contrat qui commence en fin de mois', () => {
    expect(estEnPosteCeMois(c({ date_debut: '2026-09-28' }), REF)).toBe(true)
  })
  it('ecarte un contrat qui commence le mois suivant', () => {
    expect(estEnPosteCeMois(c({ date_debut: '2026-10-01' }), REF)).toBe(false)
  })
  it('compte un contrat termine en debut de mois', () => {
    expect(estEnPosteCeMois(c({ date_fin: '2026-09-02' }), REF)).toBe(true)
  })
})

describe('contratDeReference', () => {
  it('le cas du 1er septembre : l ancien termine la veille, le nouveau inactif commence le jour meme', () => {
    const ancien = c({ id: 'ancien', actif: true, date_debut: '2026-05-04', date_fin: '2026-08-31' })
    const nouveau = c({ id: 'nouveau', actif: false, date_debut: '2026-09-01', date_fin: '2027-08-31' })
    expect(contratDeReference([ancien, nouveau], new Date('2026-09-01T09:00:00')).id).toBe('nouveau')
    expect(contratDeReference([ancien, nouveau], new Date('2026-08-31T09:00:00')).id).toBe('ancien')
  })
  it('bascule d alternant a CDI a la date prevue, sans toucher aux drapeaux', () => {
    const alternant = c({ id: 'alt', actif: true, date_debut: '2024-09-16', date_fin: '2026-09-17' })
    const cdi = c({ id: 'cdi', actif: false, date_debut: '2026-09-18', date_fin: null })
    expect(contratDeReference([alternant, cdi], new Date('2026-09-17T12:00:00')).id).toBe('alt')
    expect(contratDeReference([alternant, cdi], new Date('2026-09-18T00:30:00')).id).toBe('cdi')
  })
  it('prefere le contrat actif quand deux se chevauchent, puis le plus recent', () => {
    const a = c({ id: 'a', actif: false, date_debut: '2026-01-01' })
    const b = c({ id: 'b', actif: true, date_debut: '2026-03-01' })
    const d = c({ id: 'd', actif: true, date_debut: '2026-06-01' })
    expect(contratDeReference([a, b, d], REF).id).toBe('d')
    expect(contratDeReference([a, b], REF).id).toBe('b')
    expect(contratDeReference([a, c({ id: 'e', actif: false, date_debut: '2026-02-01' })], REF).id).toBe('e')
  })
  it('retombe sur le contrat actif quand plus rien n est en poste', () => {
    const termine = c({ id: 't', actif: true, date_debut: '2025-09-08', date_fin: '2026-08-26' })
    expect(contratDeReference([termine], REF).id).toBe('t')
  })
  it('ne renvoie rien pour une liste vide ou sans contrat actif ni en poste', () => {
    expect(contratDeReference([], REF)).toBeNull()
    expect(contratDeReference([c({ actif: false, date_fin: '2026-01-31' })], REF)).toBeNull()
  })
})

describe('contratsDeReferenceParPersonne', () => {
  it('un contrat par personne, les lignes sans profil gardent la regle actif et en poste', () => {
    const lignes = [
      c({ id: 'q-ancien', profile_id: 'q', actif: true, date_debut: '2026-05-04', date_fin: '2026-08-31' }),
      c({ id: 'q-nouveau', profile_id: 'q', actif: false, date_debut: '2026-09-01' }),
      c({ id: 'sans-profil-actif', profile_id: null, actif: true, date_debut: '2026-09-01' }),
      c({ id: 'sans-profil-inactif', profile_id: null, actif: false, date_debut: '2026-05-25' }),
      c({ id: 'test-inactif', profile_id: 'z', actif: false, date_debut: '2026-05-25', date_fin: '2027-05-25' }),
    ]
    const ids = contratsDeReferenceParPersonne(lignes, REF).map(x => x.id).sort()
    // Le profil z n a qu un contrat inactif : il est en poste par ses dates,
    // il est donc retenu ; c est le filtre sur profiles.is_active, cote
    // appelant, qui ecarte les comptes desactives.
    expect(ids).toEqual(['q-nouveau', 'sans-profil-actif', 'test-inactif'])
  })
})
