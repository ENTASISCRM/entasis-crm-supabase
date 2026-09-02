import { describe, it, expect } from 'vitest'
import { alertesContrats, joursEntre, sortiDesEffectifs, JOURS_AVANT_FIN } from './alertes-contrats'

const LE_24_AOUT = new Date('2026-08-24T10:00:00Z')
const c = (o) => ({ id: o.id || 'x', actif: true, full_name: 'Test', type_contrat: 'ALTERNANT', profile_id: 'p1', ...o })
const types = (a) => a.map(x => x.type)

describe('joursEntre', () => {
  it('compte au jour, pas à la milliseconde', () => {
    expect(joursEntre('2026-08-24T23:00:00Z', '2026-08-25T01:00:00Z')).toBe(1)
    expect(joursEntre(LE_24_AOUT, '2026-08-24')).toBe(0)
  })
  it('renvoie null sur une date absente ou invalide', () => {
    expect(joursEntre(null, '2026-08-24')).toBeNull()
    expect(joursEntre(LE_24_AOUT, 'pas-une-date')).toBeNull()
  })
})

describe('fins de contrat', () => {
  it('alerte sur une fin dans les 45 jours', () => {
    const a = alertesContrats([c({ date_fin: '2026-09-17' })], LE_24_AOUT)
    expect(types(a)).toEqual(['fin-proche'])
    expect(a[0].titre).toContain('24 jours')
  })

  it("n'alerte pas au-delà de 45 jours", () => {
    expect(alertesContrats([c({ date_fin: '2026-12-31' })], LE_24_AOUT)).toEqual([])
  })

  it('traite le jour même comme une fin, pas comme un contrat terminé', () => {
    const a = alertesContrats([c({ date_fin: '2026-08-24' })], LE_24_AOUT)
    expect(types(a)).toEqual(['fin-proche'])
    expect(a[0].titre).toContain("aujourd'hui")
  })

  it('signale une fiche encore active après sa date de fin', () => {
    const a = alertesContrats([c({ date_fin: '2026-07-31' })], LE_24_AOUT)
    expect(types(a)).toEqual(['termine-actif'])
  })

  it('ignore les contrats inactifs', () => {
    expect(alertesContrats([c({ date_fin: '2026-07-31', actif: false })], LE_24_AOUT)).toEqual([])
  })

  it('ignore les contrats sans date de fin (gérants, mandataires)', () => {
    expect(alertesContrats([c({ date_fin: null, type_contrat: 'GERANT' })], LE_24_AOUT)).toEqual([])
  })

  it('borne exactement à 45 jours', () => {
    const dans45 = new Date(Date.UTC(2026, 7, 24) + JOURS_AVANT_FIN * 86400000).toISOString().slice(0, 10)
    const dans46 = new Date(Date.UTC(2026, 7, 24) + (JOURS_AVANT_FIN + 1) * 86400000).toISOString().slice(0, 10)
    expect(alertesContrats([c({ date_fin: dans45 })], LE_24_AOUT)).toHaveLength(1)
    expect(alertesContrats([c({ date_fin: dans46 })], LE_24_AOUT)).toHaveLength(0)
  })
})

describe('arrivées sans compte', () => {
  it('alerte un mois avant une arrivée sans profil', () => {
    const a = alertesContrats([c({ profile_id: null, date_debut: '2026-09-01', date_fin: '2028-08-31' })], LE_24_AOUT)
    expect(types(a)).toEqual(['sans-compte'])
    expect(a[0].titre).toContain('8 jours')
  })

  it('passe en urgence maximale une fois la personne arrivée', () => {
    const a = alertesContrats([c({ profile_id: null, date_debut: '2026-08-01', date_fin: '2028-08-31' })], LE_24_AOUT)
    expect(a[0].type).toBe('sans-compte')
    expect(a[0].urgence).toBe(0)
    expect(a[0].titre).toContain('toujours sans compte')
  })

  it("n'alerte pas pour une arrivée lointaine", () => {
    expect(alertesContrats([c({ profile_id: null, date_debut: '2027-01-01' })], LE_24_AOUT)).toEqual([])
  })

  it('ne dit rien quand le profil est lié', () => {
    expect(alertesContrats([c({ profile_id: 'p1', date_debut: '2026-09-01' })], LE_24_AOUT)).toEqual([])
  })
})

describe('tri par urgence', () => {
  it('remonte le plus pressant en premier', () => {
    const a = alertesContrats([
      c({ id: 'loin', date_fin: '2026-09-30' }),
      c({ id: 'proche', date_fin: '2026-08-31' }),
      c({ id: 'depasse', date_fin: '2026-07-01' }),
    ], LE_24_AOUT)
    expect(a.map(x => x.contratId)).toEqual(['depasse', 'proche', 'loin'])
  })
})

describe('la situation réelle du 24/08/2026', () => {
  // Les contrats tels qu'ils étaient en base ce jour-là.
  const reels = [
    c({ id: 'quentin',   full_name: 'Quentin BAUQUET', type_contrat: 'CDD', date_fin: '2026-08-31' }),
    c({ id: 'dany',      full_name: 'Dany DUBOIS',     date_fin: '2026-09-08' }),
    c({ id: 'alexis',    full_name: 'Alexis MINH',     date_fin: '2026-09-12' }),
    c({ id: 'nans',      full_name: 'Nans MARRO-DUZAT',date_fin: '2026-09-17' }),
    c({ id: 'gianni',    full_name: 'Gianni PICHON',   date_fin: '2027-09-15' }),
    c({ id: 'louis',     full_name: 'Louis HATTON', type_contrat: 'GERANT', date_fin: null }),
    c({ id: 'charlotte', full_name: 'Charlotte Billard', profile_id: null, date_debut: '2026-09-01', date_fin: '2028-08-31' }),
    c({ id: 'alois',     full_name: 'Alois Carini',     profile_id: null, date_debut: '2026-09-01', date_fin: '2027-09-01' }),
    c({ id: 'ilana',     full_name: 'Ilana Zarouk',     profile_id: null, date_debut: '2026-09-01', date_fin: '2027-03-01' }),
    c({ id: 'hyppolite', full_name: 'MOREL Hyppolite',  profile_id: null, date_debut: '2026-09-01', date_fin: '2028-09-01' }),
  ]

  it('remonte 4 fins de contrat et 4 arrivées sans compte', () => {
    const a = alertesContrats(reels, LE_24_AOUT)
    expect(a.filter(x => x.type === 'fin-proche')).toHaveLength(4)
    expect(a.filter(x => x.type === 'sans-compte')).toHaveLength(4)
    expect(a.filter(x => x.type === 'termine-actif')).toHaveLength(0)
  })

  it('met Quentin en tête : son CDD finit dans une semaine', () => {
    const a = alertesContrats(reels, LE_24_AOUT)
    expect(a.find(x => x.type === 'fin-proche').contratId).toBe('quentin')
  })

  it('laisse tranquilles Gianni et les gérants', () => {
    const a = alertesContrats(reels, LE_24_AOUT)
    expect(a.some(x => x.contratId === 'gianni')).toBe(false)
    expect(a.some(x => x.contratId === 'louis')).toBe(false)
  })
})

describe('sortiDesEffectifs', () => {
  // Règle Louis du 2 septembre : une personne dont le contrat se termine dans
  // le mois reste affichée jusqu'au 4 du mois suivant, le temps de la paie et
  // de la feuille de temps, puis elle sort des listes du quotidien.
  const partiLe26Aout = { date_fin: '2026-08-26' }

  it('garde la personne jusqu au 4 du mois suivant', () => {
    expect(sortiDesEffectifs(partiLe26Aout, new Date('2026-08-26'))).toBe(false)
    expect(sortiDesEffectifs(partiLe26Aout, new Date('2026-09-02'))).toBe(false)
    expect(sortiDesEffectifs(partiLe26Aout, new Date('2026-09-04'))).toBe(false)
  })

  it('la retire à partir du 5', () => {
    expect(sortiDesEffectifs(partiLe26Aout, new Date('2026-09-05'))).toBe(true)
    expect(sortiDesEffectifs(partiLe26Aout, new Date('2026-12-01'))).toBe(true)
  })

  it('vaut aussi pour un contrat qui finit le dernier jour du mois', () => {
    const finDeMois = { date_fin: '2026-08-31' }
    expect(sortiDesEffectifs(finDeMois, new Date('2026-09-04'))).toBe(false)
    expect(sortiDesEffectifs(finDeMois, new Date('2026-09-05'))).toBe(true)
  })

  it('passe l année sans se tromper de mois', () => {
    const finDecembre = { date_fin: '2026-12-20' }
    expect(sortiDesEffectifs(finDecembre, new Date('2027-01-04'))).toBe(false)
    expect(sortiDesEffectifs(finDecembre, new Date('2027-01-05'))).toBe(true)
  })

  it('ne sort jamais un contrat sans date de fin', () => {
    expect(sortiDesEffectifs({ date_fin: null }, new Date('2030-01-01'))).toBe(false)
    expect(sortiDesEffectifs({}, new Date('2030-01-01'))).toBe(false)
  })
})
