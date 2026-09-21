import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModuleDetailVue } from './ModuleDetail'

const AUJOURDHUI = '2026-09-21'
const NBSP = '\u00a0'
const profile = { id: 'p1', full_name: 'Camille Exemple', role: 'advisor' }

const module = {
  module_id: 'm2', slug: 'per-et-retraite', titre: 'Le PER et la retraite', theme: 'Produits', niveau: 'fondamentaux', version_id: 'v2',
  objectif: 'Expliquer la déduction et la sortie', competence: 'Fiscalité du PER', duree_minutes: 15, prerequis: [], seuil_reussite: 0.8,
  cas_pratique: { titre: 'Un artisan de 45 ans', situation_markdown: 'Situation fictive.', questions: ['Quel plafond ?', 'Quelle sortie ?'], corrige_markdown: 'Le corrigé.' },
  a_completer: ['Le barème interne des frais'],
  sources: [{ titre: 'Code général des impôts, article 163 quatervicies', url: 'https://www.legifrance.gouv.fr/', emetteur: 'Légifrance' }],
  relu_par: 'Direction', publie_le: '2026-09-01',
  lecons: [
    { id: 'l1', ordre: 1, slug: 'l1', titre: 'Les bases', objectif: '', duree_minutes: 5, terminee_le: '2026-09-15T10:00:00Z', position: { scroll: 100 } },
    { id: 'l2', ordre: 2, slug: 'l2', titre: 'Les versements', objectif: '', duree_minutes: 5, terminee_le: null, position: { scroll: 40 } },
    { id: 'l3', ordre: 3, slug: 'l3', titre: 'La sortie', objectif: '', duree_minutes: 5, terminee_le: null, position: null },
  ],
  affectation: { id: 'a2', statut: 'en_cours', echeance: '2026-09-10', obligatoire: true },
  validation: null, attestation: null,
  revisions: [], tentatives: [], tentative_ouverte: null, duree_active_s: 900,
}

const rendre = (m) => renderToStaticMarkup(<ModuleDetailVue module={m} profile={profile} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} onAttestation={() => {}} />)

describe('ModuleDetailVue', () => {
  it('le quiz reste fermé tant qu une leçon n est pas terminée, et les leçons terminées sont cochées', () => {
    const html = rendre(module)
    expect(html).toContain('Terminez les leçons pour ouvrir le quiz')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Passer le quiz<\/button>/)
    expect(html).toContain('Leçons · 1 sur 3 terminée')
    expect((html.match(/>✓</g) || []).length).toBe(1)
    expect(html).toContain('>Reprendre<')
    expect(html).toContain('>Lire<')
    expect(html).toContain(`Seuil : 4 bonnes réponses sur 5 (80${NBSP}%)`)
    expect(html).toContain('badge badge-urgent">En retard')
    expect(html).toContain('Échéance dépassée de 11 jours')
    expect(html).toContain('À compléter par le cabinet')
    expect(html).toContain('Le barème interne des frais')
    expect(html).toContain('Voir le corrigé')
    expect(html).toContain('Quel plafond ?')
    expect(html).toContain('Sources (1)')
  })

  it('toutes les leçons terminées : le quiz s ouvre', () => {
    const fini = { ...module, lecons: module.lecons.map((l) => ({ ...l, terminee_le: '2026-09-16T10:00:00Z' })) }
    const html = rendre(fini)
    expect(html).not.toContain('Terminez les leçons pour ouvrir le quiz')
    expect(html).toMatch(/<button[^>]*class="btn btn-primary"[^>]*>Passer le quiz<\/button>/)
    expect(html).not.toMatch(/disabled=""[^>]*>Passer le quiz/)
    expect((html.match(/>✓</g) || []).length).toBe(3)
  })

  it('une tentative ouverte se reprend', () => {
    const html = rendre({ ...module, tentative_ouverte: { id: 't9', type: 'quiz', jeton_client: 'j' } })
    expect(html).toContain('Reprendre le quiz en cours')
  })

  it('module validé : historique, révisions, attestation', () => {
    const valide = {
      ...module,
      lecons: module.lecons.map((l) => ({ ...l, terminee_le: '2026-09-16T10:00:00Z' })),
      affectation: { id: 'a2', statut: 'valide', echeance: '2026-09-10', obligatoire: true },
      validation: { valide_le: '2026-09-16T11:00:00Z' },
      attestation: { numero: 'EA-2026-0007', delivree_le: '2026-09-16T11:00:00Z', score: 4, total: 5 },
      tentatives: [{ id: 't1', type: 'quiz', numero: 1, soumise_le: '2026-09-16T11:00:00Z', score: 4, total: 5, reussie: true, duree_s: 420 }],
      revisions: [
        { type: 'J7', echeance: '2026-09-23', resultat: null, faite_le: null, due: false },
        { type: 'J30', echeance: '2026-10-16', resultat: null, faite_le: null, due: false },
      ],
    }
    const html = rendre(valide)
    expect(html).toContain('Historique des tentatives')
    expect(html).toContain(`4/5 · 80${NBSP}%`)
    expect(html).toContain('>Réussi<')
    expect(html).toContain('7 min')
    expect(html).toContain('Révision J+7')
    expect(html).toContain('Prévue le 23/09/2026')
    expect(html).toContain('Attestation interne de réalisation')
    expect(html).toContain('EA-2026-0007')
    expect(html).toContain('Télécharger l attestation interne')
    expect(html).not.toContain('En retard')
  })
})
