import { describe, it, expect } from 'vitest'
import { verifierEcriture, verifierEcritureLot } from './ecriture-verifiee'

describe('verifierEcriture', () => {
  it('laisse passer une ecriture qui a touche une ligne', () => {
    expect(verifierEcriture({ data: [{ id: 'D-1' }], error: null }, 'Test')).toHaveLength(1)
  })

  it('accepte aussi une ligne seule (maybeSingle/single)', () => {
    expect(verifierEcriture({ data: { id: 'D-1' }, error: null }, 'Test')).toHaveLength(1)
  })

  it('leve quand la RLS a filtre la ligne : zero ligne, zero erreur', () => {
    expect(() => verifierEcriture({ data: [], error: null }, 'Enregistrement du dossier'))
      .toThrow(/refusé la modification/)
  })

  it('reprend le motif fourni pour que l utilisateur sache quoi faire', () => {
    expect(() => verifierEcriture({ data: [], error: null }, 'Suppression', 'Motif précis.'))
      .toThrow(/Motif précis\./)
  })

  it('relaie l erreur Supabase quand il y en a une', () => {
    expect(() => verifierEcriture({ data: null, error: new Error('boom') }, 'Test')).toThrow('boom')
  })
})

describe('verifierEcritureLot', () => {
  it('accepte un lot complet', () => {
    expect(verifierEcritureLot({ data: [{ id: 1 }, { id: 2 }], error: null }, 2, 'Libération')).toHaveLength(2)
  })

  it('signale la reussite partielle plutot que de la taire', () => {
    expect(() => verifierEcritureLot({ data: [{ id: 1 }], error: null }, 3, 'Libération'))
      .toThrow(/1 sur 3/)
  })
})
