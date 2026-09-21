import { describe, it, expect, vi } from 'vitest'
import { revisionsDues, prochaineRevision, itemsCloche, libelleRevision } from './revisions'

const AUJOURDHUI = '2026-09-21'

const rev = (o) => ({
  version_id: 'v1', slug: 'per', titre: 'Le PER', type: 'J7', echeance: AUJOURDHUI,
  tentative_id: null, resultat: null, ...o,
})
const aff = (o) => ({
  id: 'a1', version_id: 'v1', slug: 'per', titre: 'Le PER', statut: 'en_cours',
  echeance: null, obligatoire: true, nb_lecons: 3, lecons_terminees: 1, prochaine_lecon: null, ...o,
})

describe('revisionsDues', () => {
  it('une révision dont l échéance tombe aujourd hui est due', () => {
    expect(revisionsDues([rev({ echeance: AUJOURDHUI })], AUJOURDHUI)).toHaveLength(1)
  })
  it('une révision à J+1 n est pas due', () => {
    expect(revisionsDues([rev({ echeance: '2026-09-22' })], AUJOURDHUI)).toEqual([])
    expect(revisionsDues([rev({ echeance: '2026-09-22', due: false })], AUJOURDHUI)).toEqual([])
  })
  it('une révision déjà faite n est plus due, même dépassée', () => {
    expect(revisionsDues([
      rev({ echeance: '2026-09-01', tentative_id: 't1', resultat: 'reussie' }),
      rev({ echeance: '2026-09-01', tentative_id: 't2', resultat: null }),
    ], AUJOURDHUI)).toEqual([])
  })
  it('trie par échéance croissante et pose due à true', () => {
    const dues = revisionsDues([
      rev({ version_id: 'b', echeance: '2026-09-20' }),
      rev({ version_id: 'a', echeance: '2026-09-10' }),
      rev({ version_id: 'c', echeance: '2026-09-21' }),
    ], AUJOURDHUI)
    expect(dues.map((r) => r.version_id)).toEqual(['a', 'b', 'c'])
    expect(dues.every((r) => r.due === true)).toBe(true)
  })
  it('accepte une liste absente', () => {
    expect(revisionsDues(null, AUJOURDHUI)).toEqual([])
    expect(revisionsDues(undefined, AUJOURDHUI)).toEqual([])
  })
})

describe('prochaineRevision', () => {
  it('rend la révision non faite d échéance la plus proche, due ou future', () => {
    const r = prochaineRevision([
      rev({ version_id: 'future', echeance: '2026-10-01' }),
      rev({ version_id: 'faite', echeance: '2026-09-01', tentative_id: 't1', resultat: 'echouee' }),
      rev({ version_id: 'due', echeance: '2026-09-15' }),
    ], AUJOURDHUI)
    expect(r).toMatchObject({ version_id: 'due', due: true })
  })
  it('une révision future porte due à false', () => {
    expect(prochaineRevision([rev({ echeance: '2026-10-01' })], AUJOURDHUI)).toMatchObject({ due: false })
  })
  it('rend null quand tout est fait ou vide', () => {
    expect(prochaineRevision([], AUJOURDHUI)).toBeNull()
    expect(prochaineRevision([rev({ tentative_id: 't1', resultat: 'reussie' })], AUJOURDHUI)).toBeNull()
  })
})

describe('itemsCloche', () => {
  it('rien à signaler : aucun item', () => {
    expect(itemsCloche({ revisions: [], affectations: [] }, AUJOURDHUI, () => {})).toEqual([])
    expect(itemsCloche({}, AUJOURDHUI, () => {})).toEqual([])
    expect(itemsCloche(null, AUJOURDHUI, () => {})).toEqual([])
  })
  it('regroupe trois révisions dues en un seul item, daté de la plus ancienne', () => {
    const onOpen = vi.fn()
    const items = itemsCloche({
      revisions: [
        rev({ version_id: 'a', titre: 'Le PER', echeance: '2026-09-20' }),
        rev({ version_id: 'b', titre: 'Assurance vie', echeance: '2026-09-10', type: 'J30' }),
        rev({ version_id: 'c', titre: 'La SCI', echeance: AUJOURDHUI }),
        rev({ version_id: 'd', titre: 'Future', echeance: '2026-09-25' }),
      ],
    }, AUJOURDHUI, onOpen)
    expect(items).toEqual([{
      id: 'academy-revisions',
      date: '2026-09-10',
      couleur: 'var(--gold)',
      titre: '3 révisions dues',
      detail: 'Assurance vie · Le PER · La SCI',
      onOpen,
    }])
    expect(items[0].onOpen).toBe(onOpen)
  })
  it('met le singulier pour une seule révision', () => {
    const items = itemsCloche({ revisions: [rev()] }, AUJOURDHUI, () => {})
    expect(items[0].titre).toBe('1 révision due')
  })
  it('signale les affectations en retard, sans les validées', () => {
    const items = itemsCloche({
      affectations: [
        aff({ id: 'r1', titre: 'Le PER', echeance: '2026-09-15' }),
        aff({ id: 'r2', titre: 'La SCI', echeance: '2026-09-01', statut: 'non_commence' }),
        aff({ id: 'ok', titre: 'Validé', echeance: '2026-09-01', statut: 'valide' }),
        aff({ id: 'jour', titre: 'Du jour', echeance: AUJOURDHUI }),
      ],
    }, AUJOURDHUI, () => {})
    expect(items.map((i) => i.id)).toEqual(['academy-retards', 'academy-echeances'])
    expect(items[0]).toMatchObject({
      date: '2026-09-01', couleur: 'var(--gold)', titre: '2 modules en retard', detail: 'La SCI · Le PER',
    })
  })
  it('signale les échéances dans les sept jours, bornes comprises, sans les validées ni les retards', () => {
    const items = itemsCloche({
      affectations: [
        aff({ id: 'j0', titre: 'Aujourd hui', echeance: AUJOURDHUI }),
        aff({ id: 'j7', titre: 'Dans sept jours', echeance: '2026-09-28' }),
        aff({ id: 'j8', titre: 'Dans huit jours', echeance: '2026-09-29' }),
        aff({ id: 'ok', titre: 'Validé', echeance: '2026-09-23', statut: 'valide' }),
        aff({ id: 'sans', titre: 'Sans échéance', echeance: null }),
      ],
    }, AUJOURDHUI, () => {})
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'academy-echeances', date: AUJOURDHUI, titre: '2 échéances dans les 7 jours',
      detail: 'Aujourd hui · Dans sept jours',
    })
  })
  it('une seule échéance proche : singulier', () => {
    const items = itemsCloche({ affectations: [aff({ echeance: '2026-09-24' })] }, AUJOURDHUI, () => {})
    expect(items[0].titre).toBe('1 échéance dans les 7 jours')
  })
  it('un module en retard : singulier', () => {
    const items = itemsCloche({ affectations: [aff({ echeance: '2026-09-20' })] }, AUJOURDHUI, () => {})
    expect(items[0].titre).toBe('1 module en retard')
  })
})

describe('libelleRevision', () => {
  it('nomme les deux types de révision', () => {
    expect(libelleRevision('J7')).toBe('Révision J+7')
    expect(libelleRevision('J30')).toBe('Révision J+30')
  })
  it('reste lisible pour un type inconnu', () => {
    expect(libelleRevision('J90')).toBe('Révision')
    expect(libelleRevision(undefined)).toBe('Révision')
  })
})
