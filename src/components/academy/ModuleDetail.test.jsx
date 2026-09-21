import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModuleDetailVue } from './ModuleDetail'

const AUJOURDHUI = '2026-09-21'
const profile = { id: 'p1', full_name: 'Camille Exemple', role: 'advisor' }

// Un deck tel que le rend academy_module : en cours, en retard, une
// couronne, un mémo, deux compétences, deux sessions terminées.
const module = {
  module_id: 'm2', slug: 'per-et-retraite', titre: 'Le PER et la retraite', theme: 'per-retraite', niveau: 'fondamentaux', version_id: 'v2', numero: 1,
  objectif: 'Expliquer la déduction et la sortie', competence: 'Fiscalité du PER', duree_minutes: 15, prerequis: [],
  memo_md: '## Le PER en une page\n\nLe versement est **déductible** du revenu imposable.',
  sources: [{ titre: 'Code général des impôts, article 163 quatervicies', url: 'https://www.legifrance.gouv.fr/', emetteur: 'Légifrance' }],
  relu_par: 'Direction', relu_le: '2026-08-30', publie_le: '2026-09-01',
  nb_items: 40, couronnes: 1, items_vus: 24, items_dus: 5, xp: 320,
  competences: [
    { competence: 'Plafonds de déduction', nb: 12, force_moyenne: 1.5 },
    { competence: 'Sortie du PER', nb: 10, force_moyenne: 4.2 },
  ],
  sessions: [
    { id: 's2', demarree_le: '2026-09-19T08:00:00Z', terminee_le: '2026-09-19T08:06:00Z', nb_bons: 10, nb_total: 12, xp: 100 },
    { id: 's1', demarree_le: '2026-09-18T08:00:00Z', terminee_le: '2026-09-18T08:07:00Z', nb_bons: 7, nb_total: 12, xp: 80 },
  ],
  affectation: { id: 'a2', statut: 'en_cours', echeance: '2026-09-10', obligatoire: true },
  validation: null, attestation: null, entrainement_ouvert: null, duree_active_s: 900,
}

const rendre = (m) => renderToStaticMarkup(<ModuleDetailVue module={m} profile={profile} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} onAttestation={() => {}} />)

describe('ModuleDetailVue (deck)', () => {
  it('en tête, maîtrise à couronnes, gros bouton Démarrer une session, plus de leçon ni de quiz', () => {
    const html = rendre(module)
    expect(html).toContain('section-title">Le PER et la retraite')
    expect(html).toContain('PER et retraite · Fondamentaux')
    expect(html).toContain('Compétence : Fiscalité du PER')
    expect(html).toContain('40 exercices')
    expect(html).toContain('aria-label="1 couronne sur 5"')
    expect(html).toContain('ac-couronnes grande')
    expect(html).toContain('24 sur 40 exercices vus')
    expect(html).toContain('5 à revoir')
    expect(html).toContain('320 XP')
    expect(html).toContain('2 sessions')
    expect(html).toMatch(/<button[^>]*class="btn btn-primary ac-btn-grand"[^>]*>Démarrer une session<\/button>/)
    expect(html).toContain('12 exercices, corrigés un par un')
    expect(html).toContain('badge badge-urgent">En retard')
    expect(html).toContain('Échéance dépassée de 11 jours')
    expect(html).toContain('temps actif 15 min')
    expect(html).toContain('Sources (1)')
    expect(html).not.toContain('Leçon')
    expect(html).not.toContain('quiz')
    expect(html).not.toContain('Quiz')
  })

  it('le mémo passe par RenduMarkdown ; vide, on le dit', () => {
    expect(rendre(module)).toContain('class="md-rendu"')
    const sansMemo = rendre({ ...module, memo_md: '' })
    expect(sansMemo).toContain('Ce deck n’a pas encore de mémo')
  })

  it('les compétences portent leur force moyenne en barre', () => {
    const html = rendre(module)
    expect(html).toContain('Plafonds de déduction')
    expect(html).toContain('12 exercices')
    expect(html).toContain('aria-label="Force 1.5 sur 5"')
    expect(html).toContain('1,5/5')
    expect(html).toContain('width:30%')
    expect(html).toContain('4,2/5')
    expect(html).toContain('team-bar-fill signed')
  })

  it('l’historique des sessions : date à Paris, bons sur total, XP', () => {
    const html = rendre(module)
    expect(html).toContain('Historique des sessions')
    expect(html).toContain('19/09/2026 à 10h06')
    expect(html).toContain('>10/12<')
    expect(html).toContain('>100<')
    expect(html).toContain('>7/12<')
  })

  it('une session ouverte se reprend', () => {
    const html = rendre({ ...module, entrainement_ouvert: { id: 'e9', jeton_client: 'j' } })
    expect(html).toContain('Reprendre la session')
    expect(html).not.toContain('Démarrer une session')
    expect(html).toContain('tu reprends où tu t es arrêté')
  })

  it('deck validé : attestation à trois couronnes, sans note de quiz', () => {
    const valide = {
      ...module, couronnes: 3, items_vus: 40, items_dus: 0,
      affectation: { id: 'a2', statut: 'valide', echeance: '2026-09-10', obligatoire: true },
      validation: { valide_le: '2026-09-16T11:00:00Z' },
      attestation: { numero: 'EA-2026-0007', delivree_le: '2026-09-16T11:00:00Z', score: 3, total: 5 },
    }
    const html = rendre(valide)
    expect(html).toContain('aria-label="3 couronnes sur 5"')
    expect(html).toContain('Deck validé.')
    expect(html).toContain('Attestation interne de réalisation')
    expect(html).toContain('EA-2026-0007')
    expect(html).toContain('Délivrée le 16/09/2026 · maîtrise à trois couronnes · contenu relu par Direction')
    expect(html).toContain('Télécharger l’attestation interne')
    expect(html).not.toContain('3/5')
    expect(html).not.toContain('En retard')
    expect(html).toContain('rien à revoir')
  })

  it('consultation libre : deck non affecté, statut déduit des exercices vus', () => {
    const html = rendre({ ...module, affectation: null, sessions: [] })
    expect(html).toContain('Consultation libre, deck non affecté')
    expect(html).toContain('badge badge-progress">En cours')
    expect(html).toContain('Aucune session terminée sur ce deck.')
  })

  it('un deck sans exercice : le gros bouton est désactivé et le dit', () => {
    const html = rendre({ ...module, nb_items: 0, items_vus: 0, items_dus: 0, competences: [], sessions: [] })
    expect(html).toMatch(/<button[^>]*class="btn btn-primary ac-btn-grand"[^>]*disabled=""[^>]*title="Aucun exercice dans ce deck"[^>]*>Démarrer une session<\/button>/)
    expect(html).toContain('Aucun exercice dans ce deck : rien à jouer pour l’instant.')
    expect(html).not.toContain('corrigés un par un')
    // Avec des exercices, rien n est désactivé.
    expect(rendre(module)).not.toMatch(/ac-btn-grand"[^>]*disabled=""/)
  })
})
