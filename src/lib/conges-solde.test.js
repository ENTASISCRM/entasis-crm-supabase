import { describe, it, expect } from 'vitest'
import {
  JOURS_PAR_MOIS, TYPES_AVEC_CP, estFerie, periodeReference, moisComplets,
  joursOuvres, joursDemande, joursAcquis, soldeConges, fmtJours,
} from './conges-solde'

// Premiers tests de cette lib : elle décide du solde de congés de toute
// l équipe, elle se teste sans navigateur. Aucune donnée réelle, des
// contrats et des dates inventés.

describe('règles de base', () => {
  it('acquiert 2,5 jours par mois, pour les contrats qui ouvrent des congés', () => {
    expect(JOURS_PAR_MOIS).toBe(2.5)
    expect(TYPES_AVEC_CP).toEqual(['CDI', 'CDD', 'ALTERNANT'])
    expect(joursAcquis({ type_contrat: 'STAGIAIRE', date_debut: '2026-01-01' }, new Date(2026, 8, 2))).toBeNull()
    expect(joursAcquis({ type_contrat: 'MANDATAIRE', date_debut: '2026-01-01' }, new Date(2026, 8, 2))).toBeNull()
  })

  it('compte des mois complets, pas des mois entamés', () => {
    expect(moisComplets(new Date(2026, 0, 16), new Date(2026, 1, 15))).toBe(0)
    expect(moisComplets(new Date(2026, 0, 16), new Date(2026, 1, 16))).toBe(1)
    expect(moisComplets(new Date(2026, 0, 16), new Date(2026, 8, 2))).toBe(7)
  })

  it('la période de référence court du 1er juin au 31 mai', () => {
    expect(periodeReference(new Date(2026, 8, 2)).debutIso).toBe('2026-06-01')
    expect(periodeReference(new Date(2026, 8, 2)).finIso).toBe('2027-05-31')
    // Avant le 1er juin, on est encore dans la période ouverte l année d avant.
    expect(periodeReference(new Date(2026, 3, 2)).debutIso).toBe('2025-06-01')
  })

  it('le vendredi emporte le samedi : une semaine complète vaut 6 jours (règle Louis)', () => {
    // Lundi 7 au vendredi 11 septembre 2026 : 4 jours + le vendredi double.
    expect(joursOuvres('2026-09-07', '2026-09-11')).toBe(6)
    // Lundi au jeudi : un jour chacun.
    expect(joursOuvres('2026-09-07', '2026-09-10')).toBe(4)
    // Samedi et dimanche ne comptent pas.
    expect(joursOuvres('2026-09-12', '2026-09-13')).toBe(0)
  })

  it('ne décompte pas les jours fériés', () => {
    expect(estFerie(new Date(2026, 4, 1))).toBe(true)   // 1er mai
    expect(estFerie(new Date(2026, 7, 15))).toBe(true)  // 15 août
    expect(estFerie(new Date(2026, 8, 2))).toBe(false)
    // Le 11 novembre 2026 tombe un mercredi : la semaine perd ce jour.
    expect(joursOuvres('2026-11-09', '2026-11-13')).toBe(5)
  })

  it('une demi journée retire un demi jour au décompte', () => {
    expect(joursDemande({ date_debut: '2026-09-07', date_fin: '2026-09-07', demi_journee: true })).toBe(0.5)
    expect(joursDemande({ date_debut: '2026-09-07', date_fin: '2026-09-10', demi_journee: true })).toBe(3.5)
  })

  it('formate à la française', () => {
    expect(fmtJours(2.5)).toBe('2,5 j')
    expect(fmtJours(3)).toBe('3 j')
    expect(fmtJours(-1.5)).toBe('-1,5 j')
  })
})


describe('soldeConges arrêté à la date d un bulletin', () => {
  // Cas réel du 2 septembre : le bulletin d août arrête le solde au 31/08 et
  // a déjà imputé les congés d été. Sans la date d arrêt, le CRM les
  // redécomptait et il fallait gonfler le report pour retomber juste.
  const alternant = {
    type_contrat: 'ALTERNANT', date_debut: '2024-09-16', date_fin: '2026-09-17',
    conges_report: 23.5, conges_report_au: '2026-08-31', conges_deja_pris: 0,
  }
  const ete = [
    { statut: 'valide', type: 'Congé payé', date_debut: '2026-07-27', date_fin: '2026-08-07' },
    { statut: 'valide', type: 'Congé payé', date_debut: '2026-08-27', date_fin: '2026-08-28' },
  ]

  it('rend le solde du bulletin tel quel, sans recompter ce qui est antérieur', () => {
    const s = soldeConges(alternant, ete, new Date(2026, 8, 2))
    expect(s.report).toBe(23.5)
    expect(s.prisPeriode).toBe(0)
    expect(s.acquisPeriode).toBe(0)
    expect(s.restant).toBe(23.5)
    expect(s.arreteAu).toBe('2026-08-31')
  })

  it('reprend l acquisition au premier anniversaire de contrat qui suit', () => {
    // Contrat commencé un 16 : le mois suivant tombe le 16 septembre.
    expect(soldeConges(alternant, ete, new Date(2026, 8, 15)).restant).toBe(23.5)
    expect(soldeConges(alternant, ete, new Date(2026, 8, 16)).restant).toBe(26)
  })

  it('décompte les congés postérieurs à la date d arrêt, jamais les antérieurs', () => {
    const apres = [...ete, { statut: 'valide', type: 'Congé payé', date_debut: '2026-09-14', date_fin: '2026-09-15' }]
    const s = soldeConges(alternant, apres, new Date(2026, 8, 16))
    expect(s.prisPeriode).toBe(2)
    expect(s.restant).toBe(24)
  })

  it('accepte un solde négatif et reprend l acquisition par dessus', () => {
    // Bulletin arrêté à moins 1,5 j au 31 août, contrat commencé un 1er :
    // l anniversaire du 1er septembre crédite 2,5 j, le solde repasse positif.
    const c = { type_contrat: 'ALTERNANT', date_debut: '2025-09-01', conges_report: -1.5, conges_report_au: '2026-08-31', conges_deja_pris: 0 }
    expect(soldeConges(c, [], new Date(2026, 7, 31)).restant).toBe(-1.5)
    expect(soldeConges(c, [], new Date(2026, 8, 2)).restant).toBe(1)
  })

  it('sans date d arrêt, le calcul par période de référence ne change pas', () => {
    const sansDate = { ...alternant, conges_report: 31, conges_report_au: null }
    const s = soldeConges(sansDate, ete, new Date(2026, 8, 2))
    expect(s.arreteAu).toBeUndefined()
    expect(s.prisPeriode).toBe(15)
    expect(s.restant).toBe(23.5)
  })
})
