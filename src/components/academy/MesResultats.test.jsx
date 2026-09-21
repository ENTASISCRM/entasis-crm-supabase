import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MesResultatsVue } from './MesResultats'

const NBSP = '\u00a0'

const tentatives = [
  { id: 't3', version_id: 'v2', slug: 'per-et-retraite', titre: 'Le PER et la retraite', competence: 'Fiscalité du PER', type: 'revision_j7', numero: 1, soumise_le: '2026-09-20T09:00:00Z', score: 3, total: 4, seuil: 0.8, reussie: false, duree_s: 180, notions_a_revoir: ['Sortie du PER'] },
  { id: 't2', version_id: 'v2', slug: 'per-et-retraite', titre: 'Le PER et la retraite', competence: 'Fiscalité du PER', type: 'quiz', numero: 2, soumise_le: '2026-09-13T09:00:00Z', score: 5, total: 5, seuil: 0.8, reussie: true, duree_s: 400, notions_a_revoir: [] },
  { id: 't1', version_id: 'v2', slug: 'per-et-retraite', titre: 'Le PER et la retraite', competence: 'Fiscalité du PER', type: 'quiz', numero: 1, soumise_le: '2026-09-12T09:00:00Z', score: 2, total: 5, seuil: 0.8, reussie: false, duree_s: 500, notions_a_revoir: ['Plafonds', 'Sortie du PER'] },
  { id: 't4', version_id: 'v3', slug: 'scpi', titre: 'Les SCPI', competence: 'Immobilier', type: 'revision_j7', numero: 1, soumise_le: '2026-09-19T09:00:00Z', score: 4, total: 4, seuil: 0.8, reussie: true, duree_s: 120, notions_a_revoir: [] },
]

describe('MesResultatsVue', () => {
  it('par module : premier et dernier score distincts, meilleur, nombre, révisions à part', () => {
    const html = renderToStaticMarkup(<MesResultatsVue tentatives={tentatives} onNaviguer={() => {}} />)
    // Le dernier quiz du PER est 5/5, le premier 2/5.
    expect(html).toContain(`5/5 · 100${NBSP}%`)
    expect(html).toContain(`premier 2/5 · 40${NBSP}% · meilleur 5/5 · 100${NBSP}% · 2 tentatives`)
    expect(html).toContain(`Révisions : dernière 3/4 · 75${NBSP}% · 1 faite`)
  })

  it('un module qui n a que des révisions dit Non évalué pour le quiz, jamais 0', () => {
    const html = renderToStaticMarkup(<MesResultatsVue tentatives={tentatives} onNaviguer={() => {}} />)
    expect(html).toContain('Non évalué')
    expect(html).toContain('Aucun quiz passé')
    // Jamais un score « 0/0 » à la place d une absence (les dates contiennent 0/0, on vise le score).
    expect(html).not.toMatch(/>0\/0 ·/)
  })

  it('le tableau et la frise reprennent chaque tentative datée', () => {
    const html = renderToStaticMarkup(<MesResultatsVue tentatives={tentatives} onNaviguer={() => {}} />)
    expect(html).toContain('4 tentatives · 2 réussies · 2 modules')
    expect(html).toContain('20/09/2026')
    expect(html).toContain('Révision J+7')
    expect(html).toContain('Plafonds, Sortie du PER')
    expect(html).toContain('7 min')
    expect(html).toContain('class="ac-frise"')
    expect(html).toContain('ac-frise-pastille reussie')
    expect(html).toContain('ac-frise-pastille echouee')
    expect(html).toContain('ac-frise-pastille revision')
  })

  it('état vide', () => {
    const html = renderToStaticMarkup(<MesResultatsVue tentatives={[]} onNaviguer={() => {}} />)
    expect(html).toContain('Aucune tentative pour l instant')
  })
})
