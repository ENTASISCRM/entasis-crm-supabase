// Ces totaux sont ceux que Louis lit pour decider. Une erreur de somme lui
// ferait conclure qu une personne est en perte alors qu elle rapporte.

import { describe, it, expect } from 'vitest'
import {
  estMandataire, salaries, mandataires, totaux,
  pointDeBascule, cumulerParMois, fmtRatio,
} from './pnl-calculs'

const ligne = (o = {}) => ({
  type_contrat: o.type || 'CDI',
  commission_encaissee: o.com ?? 0,
  cout_total: o.cout ?? 0,
  marge: (o.com ?? 0) - (o.cout ?? 0),
  contrats_signes: o.contrats ?? 0,
  clients_uniques: o.clients ?? 0,
})

describe('separation salaries et mandataires', () => {
  it('reconnait un mandataire quelle que soit la casse', () => {
    expect(estMandataire({ type_contrat: 'MANDATAIRE' })).toBe(true)
    expect(estMandataire({ type_contrat: 'mandataire' })).toBe(true)
    expect(estMandataire({ type_contrat: 'CDI' })).toBe(false)
    expect(estMandataire({})).toBe(false)
  })

  it('partage les lignes sans en perdre aucune', () => {
    const l = [ligne({ type: 'CDI' }), ligne({ type: 'MANDATAIRE' }), ligne({ type: 'ALTERNANT' })]
    expect(salaries(l)).toHaveLength(2)
    expect(mandataires(l)).toHaveLength(1)
    expect(salaries(l).length + mandataires(l).length).toBe(l.length)
  })
})

describe('totaux', () => {
  it('additionne commission, cout et marge', () => {
    const t = totaux([ligne({ com: 10000, cout: 6000 }), ligne({ com: 5000, cout: 8000 })])
    expect(t.commission).toBe(15000)
    expect(t.cout).toBe(14000)
    expect(t.marge).toBe(1000)
  })

  it('compte les personnes en perte, celles que Louis doit voir en premier', () => {
    const t = totaux([ligne({ com: 10000, cout: 6000 }), ligne({ com: 5000, cout: 8000 })])
    expect(t.enPerte).toBe(1)
  })

  it('donne un ratio de couverture lisible', () => {
    expect(totaux([ligne({ com: 12000, cout: 6000 })]).ratio).toBe(2)
    expect(fmtRatio(2)).toBe('2.00 pour 1')
  })

  it('ne divise pas par zero quand le cout est nul (mandataire)', () => {
    const t = totaux([ligne({ type: 'MANDATAIRE', com: 5000, cout: 0 })])
    expect(t.ratio).toBeNull()
    expect(fmtRatio(t.ratio)).toBe('—')
    expect(t.marge).toBe(5000)
  })

  it('rend des zeros sur une liste vide plutot que NaN', () => {
    const t = totaux([])
    expect(t.commission).toBe(0)
    expect(t.marge).toBe(0)
    expect(t.personnes).toBe(0)
  })
})

describe('point de bascule', () => {
  const mois = (coms) => coms.map((c, i) => ({ mois: i + 1, commission: c }))

  it('trouve le mois ou le cumul passe devant les couts', () => {
    // cout annuel 12000, soit 1000 par mois. 500 puis 500 puis 3000 : au
    // troisieme mois le cumul vaut 4000 pour 3000 de cout cumule.
    expect(pointDeBascule(mois([500, 500, 3000]), 12000)).toBe(3)
  })

  it('rend null quand le cabinet ne bascule jamais dans l annee', () => {
    expect(pointDeBascule(mois([100, 100, 100]), 12000)).toBeNull()
  })

  it('rend null sans cout, plutot qu un faux mois 1', () => {
    expect(pointDeBascule(mois([5000]), 0)).toBeNull()
    expect(pointDeBascule([], 12000)).toBeNull()
  })
})

describe('cumul mensuel', () => {
  it('cumule commission et cout sans decrocher', () => {
    const c = cumulerParMois([
      { mois: 1, commission: 1000 }, { mois: 2, commission: 2000 },
    ], 12000)
    expect(c[0].cumulCommission).toBe(1000)
    expect(c[1].cumulCommission).toBe(3000)
    expect(c[1].cumulCout).toBe(2000)
    expect(c[1].cumulMarge).toBe(1000)
  })

  it('tolere un cout annuel absent', () => {
    const c = cumulerParMois([{ mois: 1, commission: 900 }], 0)
    expect(c[0].margeMois).toBe(900)
    expect(Number.isNaN(c[0].cumulCout)).toBe(false)
  })
})
