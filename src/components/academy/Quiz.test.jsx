import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuizVue } from './Quiz'

const NBSP = '\u00a0'

// Une tentative telle que la rend academy_ouvrir_tentative : énoncés et
// choix, jamais la bonne réponse.
const tentative = {
  tentative_id: 't1', type: 'quiz', numero: 1, total: 5, demarree_le: '2026-09-21T09:00:00Z', version_id: 'v2', seuil: 0.8,
  questions: [
    { question_id: 'q1', type: 'qcm', enonce: 'Le PER se débloque à quel moment ?', lecon_id: 'l1', competence: 'Sortie du PER', choix: ['À la retraite', 'À tout moment', 'Après 5 ans'] },
    { question_id: 'q2', type: 'qcm', enonce: 'La déduction joue sur quoi ?', lecon_id: 'l2', competence: 'Fiscalité du PER', choix: ['Le revenu imposable', 'Le patrimoine', 'La CSG'] },
    { question_id: 'q3', type: 'qcm', enonce: 'Question trois', lecon_id: 'l3', competence: 'Sortie du PER', choix: ['A', 'B'] },
    { question_id: 'q4', type: 'qcm', enonce: 'Question quatre', lecon_id: 'l1', competence: 'Plafonds', choix: ['A', 'B'] },
    { question_id: 'q5', type: 'qcm', enonce: 'Question cinq', lecon_id: 'l2', competence: 'Plafonds', choix: ['A', 'B'] },
  ],
}

const rendre = (props) => renderToStaticMarkup(
  <QuizVue tentative={tentative} type="quiz" index={0} reponses={{}} resultat={null} envoi={false} slugModule="per-et-retraite"
    onChoix={() => {}} onIndex={() => {}} onSoumettre={() => {}} onRetenter={() => {}} onNaviguer={() => {}} {...props} />,
)

describe('QuizVue', () => {
  it('première question : compteur, progression, radios natifs, aucune bonne réponse dans le rendu', () => {
    const html = rendre()
    expect(html).toContain('Question 1 sur 5')
    expect(html).toContain('class="ac-sr">Question 1 sur 5')
    expect(html).toContain('class="ac-progress" aria-hidden="true"')
    expect(html).toContain('width:20%')
    expect(html).toContain('<legend>Le PER se débloque à quel moment ?</legend>')
    expect((html.match(/type="radio"/g) || []).length).toBe(3)
    expect(html).toContain('>Suivante<')
    expect(html).not.toContain('Valider le quiz')
    expect(html).not.toContain('bonne_reponse')
    expect(html).toContain(`Seuil : 4 bonnes réponses sur 5 (80${NBSP}%)`)
  })

  it('dernière question : Valider le quiz désactivé tant que des réponses manquent', () => {
    const html = rendre({ index: 4, reponses: { q1: 0, q2: 0, q3: 1 } })
    expect(html).toContain('Question 5 sur 5')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Valider le quiz<\/button>/)
    expect(html).toContain('2 questions sans réponse')
  })

  it('dernière question, tout répondu : Valider le quiz actif', () => {
    const html = rendre({ index: 4, reponses: { q1: 0, q2: 0, q3: 1, q4: 0, q5: 1 } })
    expect(html).not.toMatch(/disabled=""[^>]*>Valider le quiz/)
    expect(html).toContain('Toutes répondues')
    expect(html).toContain('class="ac-choix on"')
  })

  it('écran de résultat : score, seuil, badge, module validé, correction et notions', () => {
    const resultat = {
      tentative_id: 't1', type: 'quiz', numero: 1, score: 4, total: 5, pourcentage: 80, seuil: 0.8, reussie: true, module_valide: true,
      attestation: { numero: 'EA-2026-0007', delivree_le: '2026-09-21T09:10:00Z' },
      corrections: [
        { question_id: 'q1', reponse: 0, bonne_reponse: 0, correcte: true, explication: 'Le PER se débloque à la retraite, sauf cas prévus.', lecon_id: 'l1', competence: 'Sortie du PER' },
        { question_id: 'q2', reponse: 1, bonne_reponse: 0, correcte: false, explication: 'La déduction réduit le revenu imposable.', lecon_id: 'l2', competence: 'Fiscalité du PER' },
        { question_id: 'q3', reponse: 0, bonne_reponse: 0, correcte: true, explication: '', lecon_id: 'l3', competence: 'Sortie du PER' },
        { question_id: 'q4', reponse: 0, bonne_reponse: 0, correcte: true, explication: '', lecon_id: 'l1', competence: 'Plafonds' },
        { question_id: 'q5', reponse: 1, bonne_reponse: 1, correcte: true, explication: '', lecon_id: 'l2', competence: 'Plafonds' },
      ],
      soumise_le: '2026-09-21T09:10:00Z', statut_module: 'valide',
    }
    const html = rendre({ resultat, reponses: { q1: 0, q2: 1, q3: 0, q4: 0, q5: 1 } })
    expect(html).toContain(`4/5 · 80${NBSP}%`)
    expect(html).toContain('Seuil : 4 bonnes réponses sur 5')
    expect(html).toContain('>Réussi<')
    expect(html).toContain('Module validé')
    expect(html).toContain('EA-2026-0007')
    expect(html).toContain('Notions à revoir')
    expect(html).toContain('Fiscalité du PER')
    expect(html).toContain('la bonne réponse')
    expect(html).toContain('ta réponse')
    expect(html).toContain('La déduction réduit le revenu imposable.')
    expect(html).toContain('Revoir la leçon')
    expect(html).toContain('Retenter le quiz')
    expect(html).toContain('Retour au module')
  })

  it('une révision porte son titre et n offre pas de retentative', () => {
    const resultat = { score: 2, total: 4, seuil: 0.8, reussie: false, module_valide: false, corrections: [], attestation: null }
    const html = rendre({ type: 'revision_j7', resultat })
    expect(html).toContain('Révision J+7')
    expect(html).toContain('>À revoir<')
    expect(html).not.toContain('Retenter le quiz')
    expect(rendre({ type: 'revision_j30' })).toContain('Révision J+30')
  })
})
