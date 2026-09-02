// C'est ce code qui decide quelle fiche client survit a une fusion. Une erreur
// ici ferait garder la coquille vide et absorber celle qui porte les contrats.

import { describe, it, expect } from 'vitest'
import { nomComplet, poids, resume, meilleureFiche } from './doublons'

// `??` rattraperait le null qu'on passe volontairement : on teste la presence
// de la cle, pour pouvoir fabriquer une fiche sans prenom (le cas majoritaire
// en base, 331 fiches sur 381).
const fiche = (o = {}) => ({
  client_id: o.id || 'x',
  nom: 'nom' in o ? o.nom : 'Dupont',
  prenom: 'prenom' in o ? o.prenom : 'Marie',
  created_at: o.created_at || '2026-05-01T10:00:00Z',
  nb_dossiers: o.d ?? 0, nb_contrats: o.k ?? 0, nb_documents: o.doc ?? 0, nb_echanges: o.e ?? 0,
})

describe('nomComplet', () => {
  it('assemble prenom et nom', () => {
    expect(nomComplet(fiche())).toBe('Marie Dupont')
  })
  it('tolere un prenom absent, cas majoritaire en base', () => {
    expect(nomComplet(fiche({ prenom: null }))).toBe('Dupont')
  })
  it('ne rend jamais une chaine vide', () => {
    expect(nomComplet(fiche({ nom: '', prenom: '' }))).toBe('Sans nom')
  })
})

describe('poids', () => {
  it('additionne tous les rattachements', () => {
    expect(poids(fiche({ d: 2, k: 1, doc: 3, e: 4 }))).toBe(10)
  })
  it('vaut zero sur une coquille vide', () => {
    expect(poids(fiche())).toBe(0)
  })
})

describe('resume', () => {
  it('dit ce que porte la fiche, au singulier et au pluriel', () => {
    expect(resume(fiche({ d: 1, k: 2 }))).toBe('1 dossier, 2 contrats')
  })
  it('nomme explicitement une fiche vide', () => {
    expect(resume(fiche())).toBe('fiche vide')
  })
  it('n annonce pas les categories a zero', () => {
    expect(resume(fiche({ e: 3 }))).toBe('3 échanges')
  })
})

describe('meilleureFiche', () => {
  it('garde celle qui porte le plus, jamais la coquille vide', () => {
    const vide = fiche({ id: 'vide' })
    const pleine = fiche({ id: 'pleine', d: 4, k: 2 })
    expect(meilleureFiche([vide, pleine]).client_id).toBe('pleine')
    expect(meilleureFiche([pleine, vide]).client_id).toBe('pleine')
  })

  it('a egalite, garde la plus ancienne : c est celle que les collegues connaissent', () => {
    const ancienne = fiche({ id: 'ancienne', d: 1, created_at: '2026-01-15T09:00:00Z' })
    const recente = fiche({ id: 'recente', d: 1, created_at: '2026-06-20T09:00:00Z' })
    expect(meilleureFiche([recente, ancienne]).client_id).toBe('ancienne')
  })

  it('ne modifie pas le tableau qu on lui passe', () => {
    const l = [fiche({ id: 'a' }), fiche({ id: 'b', d: 5 })]
    const avant = l.map((f) => f.client_id)
    meilleureFiche(l)
    expect(l.map((f) => f.client_id)).toEqual(avant)
  })

  it('tient sur un groupe de trois fiches', () => {
    const g = [fiche({ id: 'a', d: 1 }), fiche({ id: 'b', d: 3 }), fiche({ id: 'c', k: 2 })]
    expect(meilleureFiche(g).client_id).toBe('b')
  })
})
