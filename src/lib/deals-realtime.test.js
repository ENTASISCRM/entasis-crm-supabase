import { describe, it, expect } from 'vitest'
import { insererDeal, majDeal, retirerDeal, completerDeal } from './deals-realtime'

// listAll() trie par created_at DÉCROISSANT : le plus récent en tête.
const liste = () => [
  { id: 'c', created_at: '2026-08-24', client: 'Recent', clients: { nom: 'Recent' } },
  { id: 'b', created_at: '2026-08-20', client: 'Milieu', clients: { nom: 'Milieu' } },
  { id: 'a', created_at: '2026-08-01', client: 'Ancien', clients: { nom: 'Ancien' } },
]

describe('insererDeal', () => {
  it('place le nouveau dossier EN TÊTE, pas en queue', () => {
    // Le bug : [...prev, nouveau] le mettait en dernier, donc affiché comme
    // le plus ancien alors qu'il vient d'être signé.
    const r = insererDeal(liste(), { id: 'd', created_at: '2026-08-25' })
    expect(r[0].id).toBe('d')
    expect(r).toHaveLength(4)
  })

  it("garde l'ordre antichronologique existant", () => {
    const r = insererDeal(liste(), { id: 'd', created_at: '2026-08-25' })
    expect(r.map(d => d.id)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('ignore un dossier déjà présent (echo de sa propre création)', () => {
    const avant = liste()
    expect(insererDeal(avant, { id: 'b', created_at: 'x' })).toBe(avant)
  })

  it('ignore un payload sans id', () => {
    const avant = liste()
    expect(insererDeal(avant, {})).toBe(avant)
    expect(insererDeal(avant, null)).toBe(avant)
  })
})

describe('majDeal', () => {
  it('fusionne sans perdre la jointure client absente du payload', () => {
    const r = majDeal(liste(), { id: 'b', status: 'Signé', pu: 5000 })
    const b = r.find(d => d.id === 'b')
    expect(b.status).toBe('Signé')
    expect(b.pu).toBe(5000)
    expect(b.clients).toEqual({ nom: 'Milieu' })
  })

  it('écrase bien une colonne remise à null', () => {
    const r = majDeal(liste(), { id: 'b', client: null })
    expect(r.find(d => d.id === 'b').client).toBeNull()
  })

  it('ne touche pas les autres lignes ni leur ordre', () => {
    const r = majDeal(liste(), { id: 'b', status: 'Annulé' })
    expect(r.map(d => d.id)).toEqual(['c', 'b', 'a'])
    expect(r[0]).toEqual(liste()[0])
  })

  it('ignore un dossier inconnu', () => {
    expect(majDeal(liste(), { id: 'zzz', status: 'Signé' })).toHaveLength(3)
  })
})

describe('retirerDeal', () => {
  it('retire par identifiant', () => {
    expect(retirerDeal(liste(), 'b').map(d => d.id)).toEqual(['c', 'a'])
  })
  it('ne fait rien sans identifiant', () => {
    const avant = liste()
    expect(retirerDeal(avant, undefined)).toBe(avant)
  })
})

describe('completerDeal', () => {
  it('remplace la ligne par sa version jointe', () => {
    const complet = { id: 'b', client: 'Milieu', clients: { nom: 'Milieu', email: 'm@x.fr' } }
    expect(completerDeal(liste(), complet).find(d => d.id === 'b').clients.email).toBe('m@x.fr')
  })

  it('ne ressuscite pas un dossier supprimé entre-temps', () => {
    // Course réelle : INSERT reçu, getById en vol, DELETE reçu avant la
    // réponse. Réinsérer ferait réapparaître un dossier effacé.
    const sansB = retirerDeal(liste(), 'b')
    expect(completerDeal(sansB, { id: 'b', clients: {} })).toHaveLength(2)
  })

  it('préserve la position dans la liste', () => {
    const r = completerDeal(liste(), { id: 'c', client: 'Recent', clients: {} })
    expect(r.map(d => d.id)).toEqual(['c', 'b', 'a'])
  })
})
