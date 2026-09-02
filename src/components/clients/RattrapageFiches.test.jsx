import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RattrapageFiches, { retoucherLigne } from './RattrapageFiches'

// Noms inventés, aucune donnée client réelle.
const ligne = (o = {}) => ({
  id: 'f1', nomActuel: 'Camille Exemple', advisor_code: 'DEMO', email: null, telephone: null,
  prenom: 'Camille', nom: 'Exemple', confiance: 'haute', raison: 'Deux mots, prénom puis nom',
  coche: true, propose: { prenom: 'Camille', nom: 'Exemple', confiance: 'haute', raison: 'Deux mots, prénom puis nom' },
  ...o,
})

describe('retoucherLigne', () => {
  it('passe la puce en « corrigée » dès que le prénom ou le nom diffère de la proposition', () => {
    const r = retoucherLigne(ligne(), { prenom: 'Cam' })
    expect(r.confiance).toBe('corrigee')
    expect(r.raison).toContain('Camille Exemple')
    expect(retoucherLigne(ligne(), { nom: 'Exemplé' }).confiance).toBe('corrigee')
  })

  it('rend son jugement d origine à une ligne remise telle qu elle était proposée', () => {
    const corrigee = retoucherLigne(ligne(), { prenom: 'Cam' })
    const revenue = retoucherLigne(corrigee, { prenom: 'Camille' })
    expect(revenue.confiance).toBe('haute')
    expect(revenue.raison).toBe('Deux mots, prénom puis nom')
  })

  it('ne touche pas à la puce quand on ne fait que cocher ou décocher', () => {
    const r = retoucherLigne(ligne(), { coche: false })
    expect(r.coche).toBe(false)
    expect(r.confiance).toBe('haute')
  })

  it('reste lisible quand la proposition d origine était vide', () => {
    const sansProposition = ligne({ prenom: '', nom: 'Exemple', propose: { prenom: '', nom: '', confiance: 'faible', raison: 'Libellé vide' } })
    expect(retoucherLigne(sansProposition, { prenom: 'Camille' }).raison).toContain('aucune')
  })
})

describe('RattrapageFiches (fumée)', () => {
  it('affiche le repli « Réservé à la direction » à un conseiller', () => {
    const html = renderToStaticMarkup(<RattrapageFiches profile={{ role: 'advisor', advisor_code: 'DEMO' }} />)
    expect(html).toContain('Réservé à la direction')
    expect(html).not.toContain('Appliquer la sélection')
  })

  it('affiche l écran et ses gestes à la direction', () => {
    const html = renderToStaticMarkup(<RattrapageFiches profile={{ role: 'manager', advisor_code: 'DIR' }} />)
    expect(html).toContain('Fiches à rattraper')
    expect(html).toContain('Tout cocher les propositions sûres')
    expect(html).toContain('Appliquer la sélection')
  })
})
