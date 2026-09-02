import { describe, it, expect } from 'vitest'
import { SEUILS, estTns, estTnsOuLiberal, estFortPotentiel, REGLES, suggestionPour } from './multiEquipementRules'
import { campagnePreconfiguree, evaluerCibles } from '../lib/campagnes'

// Fiches inventées, aucune donnée réelle.
const client = (o) => ({ familles: [], revenus: 0, patrimoine: 0, ...o })
const regle = (id) => REGLES.find((r) => r.id === id)

describe('estTnsOuLiberal', () => {
  it('reconnaît les trois statuts que la direction range sous TNS', () => {
    expect(estTnsOuLiberal({ statut: 'TNS' })).toBe(true)
    expect(estTnsOuLiberal({ statut: "Chef d'entreprise" })).toBe(true)
    expect(estTnsOuLiberal({ statut: 'Profession libérale' })).toBe(true)
  })

  it('ignore la casse, les accents et la ponctuation du statut', () => {
    expect(estTnsOuLiberal({ statut: 'Chef d entreprise' })).toBe(true)
    expect(estTnsOuLiberal({ statut: 'chef d’entreprise' })).toBe(true)
    expect(estTnsOuLiberal({ statut: 'profession liberale' })).toBe(true)
  })

  it('écarte un salarié et un retraité, quel que soit leur statut écrit', () => {
    expect(estTnsOuLiberal({ statut: 'Salarié' })).toBe(false)
    expect(estTnsOuLiberal({ statut: 'Retraité' })).toBe(false)
  })

  it('retombe sur la profession quand le statut manque', () => {
    expect(estTnsOuLiberal({ statut: '', profession: 'Avocat' })).toBe(true)
    expect(estTnsOuLiberal({ profession: 'Infirmière salariée' })).toBe(false)
    expect(estTns('Chirurgien-dentiste libéral')).toBe(true)
  })
})

describe('les seuils sont les mêmes que ceux des campagnes', () => {
  it('SCPI : la borne est comprise, des deux côtés', () => {
    const auSeuil = client({ revenus: SEUILS.revenusScpi })
    expect(regle('hauts_revenus_sans_scpi').applicable(auSeuil)).toBe(true)
    expect(regle('hauts_revenus_sans_scpi').applicable(client({ revenus: SEUILS.revenusScpi - 1 }))).toBe(false)

    const campagne = campagnePreconfiguree('scpi')
    const r = evaluerCibles(
      [{ id: 'c1', revenus_annuels: SEUILS.revenusScpi, advisor_code: 'DEMO' }],
      [], campagne.criteres, { today: '2026-09-02' },
    )
    expect(r.cibles).toHaveLength(1)
  })

  it('prévoyance : un chef d entreprise est visé par la règle comme par la campagne', () => {
    const chef = client({ statut: "Chef d'entreprise" })
    expect(regle('tns_sans_prevoyance').applicable(chef)).toBe(true)

    const campagne = campagnePreconfiguree('prevoyance_tns')
    const r = evaluerCibles(
      [{ id: 'c1', statut_pro: "Chef d'entreprise", advisor_code: 'DEMO' }],
      [], campagne.criteres, { today: '2026-09-02' },
    )
    expect(r.cibles).toHaveLength(1)
  })

  it('fort potentiel : revenus ou patrimoine, bornes comprises', () => {
    expect(estFortPotentiel(client({ revenus: SEUILS.revenusFortPotentiel }))).toBe(true)
    expect(estFortPotentiel(client({ patrimoine: SEUILS.patrimoineFortPotentiel }))).toBe(true)
    expect(estFortPotentiel(client({ revenus: SEUILS.revenusFortPotentiel - 1 }))).toBe(false)
  })
})

describe('suggestionPour', () => {
  it('ne suggère rien à un client déjà équipé sur toutes les familles visées', () => {
    const equipe = client({ statut: 'TNS', revenus: 200000, familles: REGLES.map((r) => r.famille_suggeree) })
    expect(suggestionPour(equipe)).toBeNull()
  })
})
