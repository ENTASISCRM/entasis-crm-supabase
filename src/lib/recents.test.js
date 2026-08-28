import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fusionnerRecents, lireRecents, noterRecent, oublierRecent, MAX_RECENTS } from './recents'

// Les tests tournent en environnement node (pas de jsdom dans le projet) :
// on fournit un localStorage minimal, remplaçable par un qui lève, pour
// vérifier que le module n'explose jamais chez un vrai navigateur bloqué.
function fauxStockage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  }
}
const stockageEnPanne = (erreur) => ({
  getItem: () => { throw new Error(erreur) },
  setItem: () => { throw new Error(erreur) },
  removeItem: () => { throw new Error(erreur) },
  clear: () => {},
})

const e = (id, extra = {}) => ({ type: 'client', id, label: `Client ${id}`, ...extra })

describe('fusionnerRecents — la règle, sans stockage', () => {
  it('met la dernière consultée en tête', () => {
    expect(fusionnerRecents([e('a')], e('b')).map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('remonte une fiche déjà vue au lieu de la dupliquer', () => {
    const r = fusionnerRecents([e('a'), e('b'), e('c')], e('c'))
    expect(r.map((x) => x.id)).toEqual(['c', 'a', 'b'])
    expect(r).toHaveLength(3)
  })

  it('distingue un client et un dossier de même identifiant', () => {
    const r = fusionnerRecents([{ type: 'deal', id: 'x' }], { type: 'client', id: 'x' })
    expect(r).toHaveLength(2)
  })

  it('borne la liste — au-delà, on cherche plus vite en tapant', () => {
    let liste = []
    for (let i = 0; i < MAX_RECENTS + 5; i++) liste = fusionnerRecents(liste, e(String(i)))
    expect(liste).toHaveLength(MAX_RECENTS)
    expect(liste[0].id).toBe(String(MAX_RECENTS + 4))
  })

  it('ignore une entrée inexploitable plutôt que de polluer la liste', () => {
    const base = [e('a')]
    expect(fusionnerRecents(base, null)).toEqual(base)
    expect(fusionnerRecents(base, { type: 'client' })).toEqual(base)
    expect(fusionnerRecents(base, { id: 'z' })).toEqual(base)
  })

  it('nettoie les entrées cassées déjà présentes', () => {
    expect(fusionnerRecents([null, { id: 'x' }, e('a')], e('b')).map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('borne les libellés et rend des chaînes', () => {
    const r = fusionnerRecents([], { type: 'client', id: 7, label: 'x'.repeat(400) })
    expect(r[0].id).toBe('7')
    expect(r[0].label).toHaveLength(120)
    expect(r[0].sub).toBe('')
  })

  it('encaisse une liste absente', () => {
    expect(fusionnerRecents(null, e('a')).map((x) => x.id)).toEqual(['a'])
    expect(fusionnerRecents(undefined, null)).toEqual([])
  })
})

describe('stockage', () => {
  beforeEach(() => { vi.stubGlobal('window', { localStorage: fauxStockage() }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('relit ce qu’il a écrit, par conseiller', () => {
    noterRecent('CCAD', e('a'))
    noterRecent('GPIC', e('b'))
    expect(lireRecents('CCAD').map((x) => x.id)).toEqual(['a'])
    expect(lireRecents('GPIC').map((x) => x.id)).toEqual(['b'])
  })

  it('rend une liste vide quand rien n’a été noté', () => {
    expect(lireRecents('inconnu')).toEqual([])
  })

  it('oublie une fiche supprimée', () => {
    noterRecent('CCAD', e('a'))
    noterRecent('CCAD', e('b'))
    expect(oublierRecent('CCAD', 'client', 'a').map((x) => x.id)).toEqual(['b'])
    expect(lireRecents('CCAD').map((x) => x.id)).toEqual(['b'])
  })

  it('ne fait pas confiance à ce qu’il relit', () => {
    // localStorage est modifiable par l'utilisateur : la palette ne doit ni
    // planter ni afficher n'importe quoi si le contenu a été trafiqué.
    window.localStorage.setItem('entasis.recents.CCAD', '{"pas":"un tableau"}')
    expect(lireRecents('CCAD')).toEqual([])
    window.localStorage.setItem('entasis.recents.CCAD', 'ceci n est pas du json')
    expect(lireRecents('CCAD')).toEqual([])
    window.localStorage.setItem('entasis.recents.CCAD', '[null,{"type":"client"},{"type":"client","id":"ok"}]')
    expect(lireRecents('CCAD').map((x) => x.id)).toEqual(['ok'])
  })

  it('ne casse jamais la session quand le stockage est indisponible', () => {
    // Navigation privée, quota plein : on perd le confort, pas l'outil.
    vi.stubGlobal('window', { localStorage: stockageEnPanne('quota') })
    expect(() => noterRecent('CCAD', e('a'))).not.toThrow()
    expect(noterRecent('CCAD', e('a'))).toEqual([])
    expect(() => oublierRecent('CCAD', 'client', 'a')).not.toThrow()
    expect(lireRecents('CCAD')).toEqual([])
  })

  it('ne casse pas non plus sans window du tout (rendu hors navigateur)', () => {
    vi.unstubAllGlobals()
    expect(lireRecents('CCAD')).toEqual([])
    expect(noterRecent('CCAD', e('a'))).toEqual([])
  })
})
