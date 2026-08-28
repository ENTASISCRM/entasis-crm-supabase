import { describe, it, expect } from 'vitest'
import { construireMaJournee, joursDeRetard, dateReport, jourISO } from './ma-journee'

const TODAY = '2026-08-28'
const deal = (o) => ({ id: o.id || 'd1', status: 'En cours', advisor_code: 'DEMO', ...o })

describe('construireMaJournee', () => {
  it('classe RDV du jour, retard, puis relances du jour', () => {
    const r = construireMaJournee([
      deal({ id: 'r1', status: 'Prévu', date_expected: '2026-08-28T08:30:00+00:00' }),
      deal({ id: 'a1', next_action: 'rappeler', next_action_date: '2026-08-25' }),
      deal({ id: 'a2', next_action: 'devis', next_action_date: '2026-08-28' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.rdv.map((d) => d.id)).toEqual(['r1'])
    expect(r.retard.map((d) => d.id)).toEqual(['a1'])
    expect(r.jour.map((d) => d.id)).toEqual(['a2'])
    expect(r.total).toBe(3)
  })

  it('trie les RDV par heure de Paris, pas par heure UTC', () => {
    // 08:30 UTC = 10h30 à Paris en été ; 12:00 UTC = 14h00. L'ordre par
    // chaîne UTC et l'ordre réel coïncident ici, le piège est l'AFFICHAGE :
    // heureRdv doit dire 10h30, pas 08h30.
    const r = construireMaJournee([
      deal({ id: 'b', status: 'Prévu', date_expected: '2026-08-28T12:00:00+00:00' }),
      deal({ id: 'a', status: 'Prévu', date_expected: '2026-08-28T08:30:00+00:00' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.rdv.map((d) => d.id)).toEqual(['a', 'b'])
    expect(r.rdv[0].heureRdv).toBe('10h30')
  })

  it('un RDV de minuit UTC la veille reste le bon jour à Paris', () => {
    // 2026-08-27T23:00:00Z est déjà le 28 août à Paris : il appartient à la
    // file du 28, pas à celle du 27.
    const r = construireMaJournee([
      deal({ id: 'r', status: 'Prévu', date_expected: '2026-08-27T23:00:00+00:00' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.rdv).toHaveLength(1)
  })

  it('un RDV sans heure passe après les RDV horodatés', () => {
    const r = construireMaJournee([
      deal({ id: 's', status: 'Prévu', date_expected: '2026-08-28' }),
      deal({ id: 'h', status: 'Prévu', date_expected: '2026-08-28T07:00:00+00:00' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.rdv.map((d) => d.id)).toEqual(['h', 's'])
  })

  it('les relances les plus anciennes d’abord : c’est elles qui brûlent', () => {
    const r = construireMaJournee([
      deal({ id: 'j2', next_action_date: '2026-08-27' }),
      deal({ id: 'j10', next_action_date: '2026-08-18' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.retard.map((d) => d.id)).toEqual(['j10', 'j2'])
  })

  it('ignore les dossiers abandonnés et ceux des autres conseillers', () => {
    const r = construireMaJournee([
      deal({ id: 'x', status: 'Annulé', next_action_date: '2026-08-28' }),
      deal({ id: 'y', advisor_code: 'AUTRE', next_action_date: '2026-08-28' }),
      deal({ id: 'z', advisor_code: 'AUTRE', co_advisor_code: 'DEMO', next_action_date: '2026-08-28' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    // Le co-conseiller voit le dossier : il en partage la responsabilité.
    expect(r.jour.map((d) => d.id)).toEqual(['z'])
  })

  it('un dossier signé garde ses actions de suivi', () => {
    const r = construireMaJournee([
      deal({ id: 's', status: 'Signé', next_action: 'envoyer pièces', next_action_date: '2026-08-28' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.jour).toHaveLength(1)
  })

  it('ne montre pas les actions futures ni les RDV d’un autre jour', () => {
    const r = construireMaJournee([
      deal({ id: 'f', next_action_date: '2026-08-29' }),
      deal({ id: 'r', status: 'Prévu', date_expected: '2026-08-29T09:00:00+00:00' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.total).toBe(0)
  })

  it('rend une file vide sans code conseiller ou sans dossiers', () => {
    expect(construireMaJournee(null, { advisorCode: 'DEMO' }).total).toBe(0)
    expect(construireMaJournee([deal({ next_action_date: TODAY })], {}).total).toBe(0)
  })
})

describe('joursDeRetard', () => {
  it('compte les jours pleins de retard', () => {
    expect(joursDeRetard(deal({ next_action_date: '2026-08-25' }), TODAY)).toBe(3)
    expect(joursDeRetard(deal({ next_action_date: '2026-08-28' }), TODAY)).toBe(0)
    expect(joursDeRetard(deal({ next_action_date: '2026-08-30' }), TODAY)).toBe(0)
    expect(joursDeRetard(deal({}), TODAY)).toBe(0)
  })
})

describe('dateReport', () => {
  it('reporte depuis aujourd’hui, jamais depuis l’échéance dépassée', () => {
    expect(dateReport('demain', TODAY)).toBe('2026-08-29')
    expect(dateReport('semaine', TODAY)).toBe('2026-09-04')
  })
  it('franchit les fins de mois et d’année sans surprise', () => {
    expect(dateReport('demain', '2026-08-31')).toBe('2026-09-01')
    expect(dateReport('semaine', '2026-12-29')).toBe('2027-01-05')
  })
})

describe('jourISO', () => {
  it('rend la date locale au format attendu par les colonnes date', () => {
    expect(jourISO(new Date(2026, 7, 5))).toBe('2026-08-05')
  })
})
