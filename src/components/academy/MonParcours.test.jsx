import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MonParcoursVue } from './MonParcours'

const AUJOURDHUI = '2026-09-21'

// Un parcours fictif, tel que le rend academy_mon_parcours : un module en
// retard entamé, un module validé, une révision due sur le module validé.
const parcours = {
  aujourdhui: AUJOURDHUI,
  affectations: [
    {
      id: 'a1', version_id: 'v1', slug: 'per-et-retraite', titre: 'Le PER et la retraite', parcours_titre: 'Fondamentaux du conseiller',
      obligatoire: true, echeance: '2026-09-10', statut: 'en_cours', en_retard: true, nb_lecons: 3, lecons_terminees: 1,
      prochaine_lecon: { id: 'l2', titre: 'Les versements', ordre: 2 }, valide_le: null, duree_minutes: 15,
    },
    {
      id: 'a2', version_id: 'v2', slug: 'assurance-vie', titre: 'L assurance vie', parcours_titre: 'Fondamentaux du conseiller',
      obligatoire: true, echeance: '2026-09-01', statut: 'valide', en_retard: false, nb_lecons: 3, lecons_terminees: 3,
      prochaine_lecon: null, valide_le: '2026-08-30T10:00:00Z', duree_minutes: 12,
    },
    {
      id: 'a3', version_id: 'v3', slug: 'scpi', titre: 'Les SCPI', parcours_titre: null,
      obligatoire: false, echeance: '2026-09-25', statut: 'non_commence', en_retard: false, nb_lecons: 3, lecons_terminees: 0,
      prochaine_lecon: { id: 'l7', titre: 'Ce qu est une SCPI', ordre: 1 }, valide_le: null, duree_minutes: 10,
    },
  ],
  revisions: [
    { id: 'r1', version_id: 'v2', type: 'J7', echeance: '2026-09-06', resultat: null, faite_le: null, due: true, slug: 'assurance-vie', titre: 'L assurance vie' },
    { id: 'r2', version_id: 'v2', type: 'J30', echeance: '2026-09-29', resultat: null, faite_le: null, due: false, slug: 'assurance-vie', titre: 'L assurance vie' },
  ],
  dernieres_reussites: [
    { version_id: 'v2', titre: 'L assurance vie', slug: 'assurance-vie', valide_le: '2026-08-30T10:00:00Z', attestation: 'EA-2026-0007' },
  ],
  temps_actif_s: 5400,
  temps_actif_7j_s: 1500,
}

describe('MonParcoursVue', () => {
  it('la prochaine étape est la révision due, avant le module en retard', () => {
    const html = renderToStaticMarkup(<MonParcoursVue parcours={parcours} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} />)
    expect(html).toContain('Prochaine étape')
    expect(html).toContain('Faire la révision J+7')
    expect(html).toContain('>Réviser<')
  })

  it('sans révision due, la prochaine étape reprend la leçon du module en retard', () => {
    const sansRevision = { ...parcours, revisions: [] }
    const html = renderToStaticMarkup(<MonParcoursVue parcours={sansRevision} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} />)
    expect(html).toContain('Reprendre la leçon 2 : Les versements')
    expect(html).toContain('>Reprendre<')
  })

  it('un module en retard porte le badge En retard, un module validé non', () => {
    const html = renderToStaticMarkup(<MonParcoursVue parcours={parcours} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} />)
    expect(html).toContain('badge badge-urgent">En retard')
    expect((html.match(/>En retard</g) || []).length).toBe(1)
    expect(html).toContain('Échéance dépassée de 11 jours')
    expect(html).toContain('badge badge-signed">Validé')
    expect(html).toContain('À rendre dans 4 jours')
  })

  it('les quatre chiffres et les blocs révisions et réussites', () => {
    const html = renderToStaticMarkup(<MonParcoursVue parcours={parcours} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} />)
    expect(html).toContain('Modules validés')
    expect(html).toContain('1/3')
    expect(html).toContain('Révisions dues')
    expect(html).toContain('Échéances à venir 7 j')
    expect(html).toContain('Temps actif 7 j')
    expect(html).toContain('25 min')
    expect(html).toContain('Révision J+7')
    expect(html).toContain('Dernières réussites')
    expect(html).toContain('EA-2026-0007')
    expect(html).toContain('Validé le 30/08/2026')
  })

  it('sans données, l état vide propose le catalogue', () => {
    const html = renderToStaticMarkup(<MonParcoursVue parcours={{ aujourdhui: AUJOURDHUI, affectations: [], revisions: [], dernieres_reussites: [] }} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} />)
    expect(html).toContain('Aucun module affecté')
    expect(html).toContain('parcours le catalogue')
    expect(html).toContain('Parcourir le catalogue')
    expect(html).not.toContain('Prochaine étape')
  })
})
