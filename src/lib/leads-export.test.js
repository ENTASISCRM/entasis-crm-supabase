import { describe, it, expect } from 'vitest'
import {
  ANCIENNETE_JOURS, COLONNES_RECONTACT, NOMBRES,
  campagnesDe, dernierMouvement, lignesRecontact, nomFichierRecontact,
  resumeSelection, selectionRecontact,
} from './leads-export'

const LE_24_SEPT = new Date('2026-09-24T10:00:00Z')

// Un lead de la copie CRM. Par défaut : mort, avec numéro, bougé en juin,
// donc éligible au recontact le 24 septembre.
const l = (o = {}) => ({
  id: o.id ?? 'L1',
  nom: 'Camille Ferrand',
  telephone: '33612345678',
  email: 'camille@exemple.fr',
  campagne: 'article_790_2026',
  status: 'dead',
  tmi: '30 %',
  patrimoine_net: 'Entre 100 000 et 250 000',
  actifs: 'Assurance vie',
  created_at: '2026-06-01T08:00:00Z',
  updated_at: '2026-06-20T08:00:00Z',
  ...o,
})

describe('dernierMouvement', () => {
  it('prend updated_at, retombe sur created_at', () => {
    expect(dernierMouvement(l({ updated_at: null }))).toBe(new Date('2026-06-01T08:00:00Z').getTime())
    expect(dernierMouvement(l({}))).toBe(new Date('2026-06-20T08:00:00Z').getTime())
  })

  it('rend null sans date lisible', () => {
    expect(dernierMouvement(l({ created_at: null, updated_at: 'pas une date' }))).toBeNull()
    expect(dernierMouvement(null)).toBeNull()
  })
})

describe('campagnesDe', () => {
  it('classe les campagnes présentes, sans doublon ni vide', () => {
    const leads = [l({ campagne: 'domtom_q2_2026' }), l({ campagne: 'article_790_2026' }), l({ campagne: '  ' }), l({ campagne: 'article_790_2026' })]
    expect(campagnesDe(leads)).toEqual(['article_790_2026', 'domtom_q2_2026'])
  })

  it('tolère une liste vide ou absente', () => {
    expect(campagnesDe([])).toEqual([])
    expect(campagnesDe(null)).toEqual([])
  })
})

describe('selectionRecontact', () => {
  const opts = { today: LE_24_SEPT }

  it('garde les leads morts sans mouvement depuis plus de deux mois', () => {
    expect(selectionRecontact([l({})], opts)).toHaveLength(1)
  })

  it('écarte un lead encore vivant, quel que soit son âge', () => {
    for (const status of ['available', 'contacted', 'booked']) {
      expect(selectionRecontact([l({ status })], opts)).toHaveLength(0)
    }
  })

  it('écarte un lead rendu au pool, sauf demande explicite', () => {
    const rendu = [l({ status: 'released' })]
    expect(selectionRecontact(rendu, opts)).toHaveLength(0)
    expect(selectionRecontact(rendu, { ...opts, avecRendus: true })).toHaveLength(1)
  })

  it('écarte un mouvement trop frais : on ne rappelle pas la semaine suivante', () => {
    expect(selectionRecontact([l({ updated_at: '2026-09-20T08:00:00Z' })], opts)).toHaveLength(0)
  })

  it('prend tout quand l ancienneté est à zéro', () => {
    const frais = [l({ updated_at: '2026-09-20T08:00:00Z' })]
    expect(selectionRecontact(frais, { ...opts, jours: 0 })).toHaveLength(1)
  })

  it('écarte un lead sans numéro composable : la liste sert à appeler', () => {
    expect(selectionRecontact([l({ telephone: null })], opts)).toHaveLength(0)
    expect(selectionRecontact([l({ telephone: '   ' })], opts)).toHaveLength(0)
  })

  it('filtre sur la campagne demandée', () => {
    const leads = [l({ id: 'A', campagne: 'article_790_2026' }), l({ id: 'B', campagne: 'domtom_q2_2026' })]
    expect(selectionRecontact(leads, { ...opts, campagne: 'domtom_q2_2026' }).map((x) => x.id)).toEqual(['B'])
    expect(selectionRecontact(leads, { ...opts, campagne: '' })).toHaveLength(2)
  })

  it('classe le mouvement le plus récent en tête', () => {
    const leads = [
      l({ id: 'vieux', updated_at: '2026-05-02T08:00:00Z' }),
      l({ id: 'recent', updated_at: '2026-07-10T08:00:00Z' }),
      l({ id: 'milieu', updated_at: '2026-06-15T08:00:00Z' }),
    ]
    expect(selectionRecontact(leads, opts).map((x) => x.id)).toEqual(['recent', 'milieu', 'vieux'])
  })

  it('coupe au nombre demandé, et rend tout à zéro', () => {
    const leads = Array.from({ length: 5 }, (_, i) => l({ id: `L${i}` }))
    expect(selectionRecontact(leads, { ...opts, nombre: 3 })).toHaveLength(3)
    expect(selectionRecontact(leads, { ...opts, nombre: 0 })).toHaveLength(5)
  })

  it('ignore une date de mouvement illisible plutôt que de la faire passer', () => {
    expect(selectionRecontact([l({ created_at: null, updated_at: null })], opts)).toHaveLength(0)
  })

  it('tolère une liste vide, absente, ou trouée', () => {
    expect(selectionRecontact([], opts)).toEqual([])
    expect(selectionRecontact(null, opts)).toEqual([])
    expect(selectionRecontact([null, undefined, l({})], opts)).toHaveLength(1)
  })

  it('la règle par défaut est bien deux mois', () => {
    expect(ANCIENNETE_JOURS).toBe(60)
    expect(NOMBRES).toContain(50)
  })
})

describe('lignesRecontact', () => {
  it('met le téléphone dans la forme qu on lit, et les dates à la française', () => {
    const [ligne] = lignesRecontact([l({})])
    expect(ligne).toHaveLength(COLONNES_RECONTACT.length)
    expect(ligne[0]).toBe('Camille Ferrand')
    expect(ligne[1]).toBe('06 12 34 56 78')
    expect(ligne[7]).toBe('01/06/2026')
    expect(ligne[8]).toBe('20/06/2026')
  })

  it('ne dit nulle part que le lead a refusé', () => {
    const tout = [COLONNES_RECONTACT.join(' '), lignesRecontact([l({})]).flat().join(' ')].join(' ').toLowerCase()
    for (const mot of ['refus', 'mort', 'dead', 'perdu', 'released']) expect(tout).not.toContain(mot)
  })

  it('rend une cellule vide sur un champ manquant, jamais « null »', () => {
    const [ligne] = lignesRecontact([l({ tmi: null, patrimoine_net: undefined, actifs: '', updated_at: null })])
    expect(ligne[4]).toBe('')
    expect(ligne[5]).toBe('')
    expect(ligne[6]).toBe('')
    expect(ligne[8]).toBe('01/06/2026')
  })

  it('tolère une liste vide ou trouée', () => {
    expect(lignesRecontact([])).toEqual([])
    expect(lignesRecontact(null)).toEqual([])
    expect(lignesRecontact([null, l({})])).toHaveLength(1)
  })
})

describe('nomFichierRecontact', () => {
  it('porte la campagne et la date', () => {
    expect(nomFichierRecontact('article_790_2026', '2026-09-24')).toBe('leads-recontact-article-790-2026-2026-09-24')
  })

  it('dit toutes campagnes quand aucune n est choisie', () => {
    expect(nomFichierRecontact('', '2026-09-24')).toBe('leads-recontact-toutes-campagnes-2026-09-24')
  })

  it('ne laisse passer aucun caractère hasardeux dans un nom de fichier', () => {
    expect(nomFichierRecontact('Été 2026 / DOM TOM', '2026-09-24')).toBe('leads-recontact-t-2026-dom-tom-2026-09-24')
  })
})

describe('resumeSelection', () => {
  it('dit le reste quand la sélection est coupée', () => {
    expect(resumeSelection(50, 103)).toBe('50 leads sur 103 éligibles')
  })

  it('dit le total quand tout est pris', () => {
    expect(resumeSelection(103, 103)).toBe('103 leads éligibles')
    expect(resumeSelection(1, 1)).toBe('1 lead éligible')
  })

  it('le dit franchement quand il n y a rien', () => {
    expect(resumeSelection(0, 0)).toBe('Aucun lead éligible')
  })
})
