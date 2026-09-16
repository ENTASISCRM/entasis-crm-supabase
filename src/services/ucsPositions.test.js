// Suivi des structures places par le cabinet. Ce que ces tests verrouillent :
// les calculs que la direction lit en tete d ecran (encours, valeur estimee,
// date la plus ancienne), la prochaine constatation qui doit rendre null
// plutot qu une date inventee, et le fait qu une valorisation passe par une
// insertion, jamais par une ecriture directe de derniere_valo.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Faux client Supabase : chaque appel de table rend un builder chainable qui
// enregistre ce qu on lui demande et repond ce que le test a prevu.
const appels = []
let reponse = { data: [], error: null }

function builder(table) {
  const b = { table, etapes: [] }
  const chaine = (nom) => (...args) => { b.etapes.push([nom, ...args]); return b }
  for (const nom of ['select', 'order', 'eq', 'update', 'upsert', 'single']) b[nom] = chaine(nom)
  b.range = (...args) => { b.etapes.push(['range', ...args]); return Promise.resolve(reponse) }
  b.then = (ok, ko) => Promise.resolve(reponse).then(ok, ko)
  appels.push(b)
  return b
}

vi.mock('../lib/supabase', () => ({
  supabase: { from: (table) => builder(table) },
}))

const svc = await import('./ucsPositions')
const {
  ajouterMois, joursDepuis, performanceDepuisPair, valeurEstimee, fraicheurValo,
  prochaineConstatation, couponAnnualise, trierPositions, totauxPositions,
  lireMontant, preparerEncours, preparerValorisation,
  fmtValo, fmtPoints, fmtDateFr, fmtEuro,
  listPositions, updateEncours, saisirValorisation, listHistorique,
} = svc

beforeEach(() => { appels.length = 0; reponse = { data: [], error: null } })

describe('dates', () => {
  it('ajoute des mois en gardant le jour, borne au dernier jour du mois', () => {
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28')
    expect(ajouterMois('2028-01-31', 1)).toBe('2028-02-29')
    expect(ajouterMois('2026-11-15', 3)).toBe('2027-02-15')
    expect(ajouterMois('2026-03-31', 12)).toBe('2027-03-31')
    expect(ajouterMois('pas une date', 1)).toBeNull()
  })

  it('compte les jours entre deux dates sans se soucier de l heure d ete', () => {
    expect(joursDepuis('2026-06-30', '2026-09-16')).toBe(78)
    expect(joursDepuis('2026-09-16', '2026-09-16')).toBe(0)
    expect(joursDepuis(null, '2026-09-16')).toBeNull()
  })
})

describe('calculs de position', () => {
  it('lit la performance en points depuis le pair', () => {
    expect(performanceDepuisPair(98.5)).toBeCloseTo(-1.5)
    expect(performanceDepuisPair('103.25')).toBeCloseTo(3.25)
    expect(performanceDepuisPair(null)).toBeNull()
  })

  it('estime la valeur de l encours, et ne devine rien sans valorisation', () => {
    expect(valeurEstimee(200000, 98.5)).toBe(197000)
    expect(valeurEstimee('120000', '101')).toBe(121200)
    expect(valeurEstimee(200000, null)).toBeNull()
    expect(valeurEstimee(null, 98)).toBeNull()
  })

  it('qualifie l age d une valorisation : recente, ancienne, perimee', () => {
    expect(fraicheurValo('2026-09-01', '2026-09-16')).toBe('recente')
    expect(fraicheurValo('2026-07-15', '2026-09-16')).toBe('ancienne')
    expect(fraicheurValo('2026-05-30', '2026-09-16')).toBe('perimee')
    expect(fraicheurValo(null, '2026-09-16')).toBeNull()
  })

  it('deduit le coupon annuel du coupon par periode quand il manque', () => {
    expect(couponAnnualise({ coupon_annualise: 7.5 })).toBe(7.5)
    expect(couponAnnualise({ coupon_periode: 0.5, frequence_coupon: 'MENSUELLE' })).toBe(6)
    expect(couponAnnualise({ coupon_periode: 2, frequence_coupon: 'TRIMESTRIELLE' })).toBe(8)
    expect(couponAnnualise({ coupon_periode: 2 })).toBeNull()
    expect(couponAnnualise({})).toBeNull()
  })
})

describe('prochaineConstatation', () => {
  const AUJOURDHUI = '2026-09-16'

  it('part de la fin de commercialisation et avance par periode de constatation', () => {
    const ucs = { fin_commerc: '2026-03-31', constatation: 'TRIMESTRIELLE', maturite_annees: 10 }
    expect(prochaineConstatation(ucs, AUJOURDHUI)).toBe('2026-09-30')
    expect(prochaineConstatation({ ...ucs, constatation: 'MENSUELLE' }, AUJOURDHUI)).toBe('2026-09-30')
    expect(prochaineConstatation({ ...ucs, constatation: 'ANNUELLE' }, AUJOURDHUI)).toBe('2027-03-31')
  })

  it('se rabat sur la frequence du coupon quand la constatation manque', () => {
    const ucs = { fin_commerc: '2026-03-31', frequence_coupon: 'SEMESTRIELLE' }
    expect(prochaineConstatation(ucs, AUJOURDHUI)).toBe('2026-09-30')
  })

  it('rend null plutot qu une date inventee', () => {
    // Pas de fin de commercialisation : le debut de campagne ne suffit pas.
    expect(prochaineConstatation({ date_debut: '2026-02-01', constatation: 'MENSUELLE' }, AUJOURDHUI)).toBeNull()
    // Pas de frequence.
    expect(prochaineConstatation({ fin_commerc: '2026-03-31' }, AUJOURDHUI)).toBeNull()
    // Constatation quotidienne : chaque jour en est une.
    expect(prochaineConstatation({ fin_commerc: '2026-03-31', constatation: 'QUOTIDIENNE' }, AUJOURDHUI)).toBeNull()
    // Produit arrive a maturite.
    expect(prochaineConstatation({ fin_commerc: '2016-03-31', constatation: 'ANNUELLE', maturite_annees: 8 }, AUJOURDHUI)).toBeNull()
  })

  it('accepte une constatation qui tombe apres aujourd hui mais dans l annee de maturite', () => {
    const ucs = { fin_commerc: '2018-09-30', constatation: 'ANNUELLE', maturite_annees: 8 }
    expect(prochaineConstatation(ucs, AUJOURDHUI)).toBe('2026-09-30')
  })
})

describe('tri et totaux', () => {
  const UCS = [
    { id: 'a', nom_ucs: 'Beta', etat: 'EN_COURS', encours_place: 0 },
    { id: 'b', nom_ucs: 'Alpha', etat: 'EN_COURS', encours_place: 50000, derniere_valo: 98, derniere_valo_le: '2026-06-30' },
    { id: 'c', nom_ucs: 'Gamma', etat: 'CLOTURE', encours_place: 120000, derniere_valo: 102, derniere_valo_le: '2026-08-31' },
    { id: 'd', nom_ucs: 'Delta', etat: 'CLOTURE', encours_place: 0 },
    { id: 'e', nom_ucs: 'Epsilon', etat: 'EN_COURS', encours_place: 30000, derniere_valo: null, derniere_valo_le: null },
  ]

  it('met les UCS a encours en tete par montant, puis les autres en cours, et ecarte les cloturees vides', () => {
    expect(trierPositions(UCS).map((u) => u.id)).toEqual(['c', 'b', 'e', 'a'])
  })

  it('totalise l encours, la valeur estimee des seules UCS valorisees, et la date la plus ancienne', () => {
    const t = totauxPositions(UCS)
    expect(t.encoursTotal).toBe(200000)
    // 50 000 a 98 plus 120 000 a 102, Epsilon sans valorisation ne compte pas.
    expect(t.valeurEstimeeTotal).toBe(49000 + 122400)
    expect(t.nbValorisees).toBe(2)
    expect(t.nbSansValo).toBe(1)
    expect(t.plusAncienne).toEqual({ date: '2026-06-30', nom: 'Alpha' })
  })

  it('rend des totaux vides sur une liste vide', () => {
    expect(totauxPositions([])).toEqual({ encoursTotal: 0, valeurEstimeeTotal: 0, nbValorisees: 0, nbSansValo: 0, plusAncienne: null })
  })
})

describe('preparation des saisies', () => {
  it('lit ce qu un humain tape', () => {
    expect(lireMontant('12 000')).toBe(12000)
    expect(lireMontant('12 000,50 €')).toBe(12000.5)
    expect(lireMontant('98,5')).toBe(98.5)
    expect(lireMontant('')).toBeNull()
    expect(lireMontant('abc')).toBeNull()
  })

  it('refuse un encours negatif ou illisible', () => {
    expect(preparerEncours('0')).toBe(0)
    expect(preparerEncours('150 000')).toBe(150000)
    expect(() => preparerEncours('-5')).toThrow(/négatif/)
    expect(() => preparerEncours('')).toThrow(/illisible/)
  })

  it('normalise une valorisation et pose la source par defaut', () => {
    const v = preparerValorisation({ date_valo: '2026-09-10', valeur: '98,5', source: '  ' }, '2026-09-16')
    expect(v).toEqual({ date_valo: '2026-09-10', valeur: 98.5, source: 'reporting structureur' })
  })

  it('refuse une valorisation future, nulle, ou saisie en euros', () => {
    expect(() => preparerValorisation({ date_valo: '2026-09-17', valeur: '98' }, '2026-09-16')).toThrow(/futur/)
    expect(() => preparerValorisation({ date_valo: '', valeur: '98' }, '2026-09-16')).toThrow(/date/)
    expect(() => preparerValorisation({ date_valo: '2026-09-10', valeur: '0' }, '2026-09-16')).toThrow(/positive/)
    expect(() => preparerValorisation({ date_valo: '2026-09-10', valeur: '150000' }, '2026-09-16')).toThrow(/pas en euros/)
  })
})

describe('formats', () => {
  it('ecrit les valeurs avec le signe et l unite attendus', () => {
    expect(fmtValo(98.25)).toBe('98,25 %')
    expect(fmtValo(null)).toBe('')
    expect(fmtPoints(1.5)).toBe('+1,5 pt')
    expect(fmtPoints(-1.5)).toBe('−1,5 pt')
    expect(fmtPoints(0)).toBe('0 pt')
    expect(fmtDateFr('2026-06-30')).toBe('30/06/2026')
    expect(fmtDateFr(null)).toBe('')
    expect(fmtEuro(200000).replace(/\s/g, ' ')).toBe('200 000 €')
  })
})

describe('acces a la base', () => {
  it('lit la table ucs_structures avec les colonnes d encours et de valorisation', async () => {
    reponse = { data: [{ id: 'a', encours_place: 10 }], error: null }
    const lignes = await listPositions()
    expect(lignes).toEqual([{ id: 'a', encours_place: 10 }])
    const b = appels[0]
    expect(b.table).toBe('ucs_structures')
    const select = b.etapes.find(([n]) => n === 'select')[1]
    for (const col of ['encours_place', 'derniere_valo', 'derniere_valo_le', 'structureur:structureurs']) {
      expect(select).toContain(col)
    }
    expect(b.etapes.some(([n]) => n === 'range')).toBe(true)
  })

  it('n ecrit que l encours, jamais les colonnes du declencheur', async () => {
    reponse = { data: [{ id: 'a' }], error: null }
    await updateEncours('a', '150 000')
    const b = appels[0]
    expect(b.table).toBe('ucs_structures')
    const patch = b.etapes.find(([n]) => n === 'update')[1]
    expect(patch).toEqual({ encours_place: 150000 })
    expect(b.etapes).toContainEqual(['eq', 'id', 'a'])
    expect(b.etapes).toContainEqual(['select', 'id'])
  })

  it('signale un encours que la base a refuse en silence', async () => {
    reponse = { data: [], error: null }
    await expect(updateEncours('a', '10')).rejects.toThrow(/refusé/)
  })

  it('insere une valorisation, une par jour, et laisse derniere_valo au declencheur', async () => {
    reponse = { data: { id: 'v1' }, error: null }
    const aujourdhui = new Date().toISOString().slice(0, 10)
    await saisirValorisation('a', { date_valo: aujourdhui, valeur: '99,1' }, { saisi_par: 'u1' })
    const b = appels[0]
    expect(b.table).toBe('ucs_valorisations')
    const [, ligne, options] = b.etapes.find(([n]) => n === 'upsert')
    expect(ligne).toEqual({ ucs_id: 'a', date_valo: aujourdhui, valeur: 99.1, source: 'reporting structureur', saisi_par: 'u1' })
    expect(options).toEqual({ onConflict: 'ucs_id,date_valo' })
    expect(Object.keys(ligne)).not.toContain('derniere_valo')
  })

  it('ne touche pas la base quand la saisie est invalide', async () => {
    await expect(saisirValorisation('a', { date_valo: '2099-01-01', valeur: '99' })).rejects.toThrow(/futur/)
    expect(appels).toHaveLength(0)
  })

  it('lit l historique d une UCS du plus recent au plus ancien', async () => {
    reponse = { data: [{ id: 'v2', date_valo: '2026-09-01' }, { id: 'v1', date_valo: '2026-08-01' }], error: null }
    const h = await listHistorique('a')
    expect(h.map((v) => v.id)).toEqual(['v2', 'v1'])
    const b = appels[0]
    expect(b.table).toBe('ucs_valorisations')
    expect(b.etapes).toContainEqual(['eq', 'ucs_id', 'a'])
    expect(b.etapes).toContainEqual(['order', 'date_valo', { ascending: false }])
  })
})
