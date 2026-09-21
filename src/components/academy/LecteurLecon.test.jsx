import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LecteurVue } from './LecteurLecon'

const lecon = {
  id: 'l2', version_id: 'v2', ordre: 2, slug: 'l2', titre: 'Les versements', objectif: 'Savoir expliquer le plafond de déduction',
  duree_minutes: 4, contenu_md: '## Le plafond\n\nUn texte de leçon.',
  mini_question: { enonce: 'Le plafond se calcule sur quels revenus ?', choix: ['Les revenus de l année', 'Les revenus de l année précédente', 'Le patrimoine'], explication: 'Le plafond dépend des revenus de l année précédente.' },
  sources: [{ titre: 'Bulletin officiel des finances publiques', url: 'https://bofip.impots.gouv.fr/', emetteur: 'DGFiP' }],
  module: { slug: 'per-et-retraite', titre: 'Le PER et la retraite', version_id: 'v2' },
  lecons: [
    { id: 'l1', ordre: 1, titre: 'Les bases', terminee_le: '2026-09-15T10:00:00Z' },
    { id: 'l2', ordre: 2, titre: 'Les versements', terminee_le: null },
    { id: 'l3', ordre: 3, titre: 'La sortie', terminee_le: null },
  ],
  progression: { position: { scroll: 40, section: 'Le plafond' }, terminee_le: null, mini_question_reussie_le: null },
  parametres: { inactivite_secondes: 120, pas_battement_secondes: 30 },
}

const vierge = { choix: null, envoi: false, resultat: null }
const rendre = (props) => renderToStaticMarkup(
  <LecteurVue lecon={lecon} mini={vierge} sauvegarde={{ etat: 'vierge' }} onChoix={() => {}} onValider={() => {}} onReessayer={() => {}} onReessayerSauvegarde={() => {}} onNaviguer={() => {}} {...props} />,
)

describe('LecteurVue', () => {
  it('titre, kicker, sommaire avec la leçon courante et la coche de la leçon terminée', () => {
    const html = rendre()
    expect(html).toContain('Les versements')
    expect(html).toContain('Leçon 2 sur 3 · 4 min')
    expect(html).toContain('aria-label="Sommaire du module"')
    expect(html).toMatch(/<button[^>]*class="ac-sommaire-item"[^>]*aria-current="page"[^>]*>.*?Les versements/)
    expect((html.match(/aria-current="page"/g) || []).length).toBe(1)
    expect((html.match(/>✓</g) || []).length).toBe(1)
    expect(html).toContain('Retour au module')
    expect(html).toContain('Le plafond se calcule sur quels revenus ?')
    expect(html).toContain('type="radio"')
    expect(html).toContain('Valider ma réponse')
    expect(html).not.toContain('Leçon suivante')
    expect(html).toContain('Le temps actif est estimé')
    expect(html).toContain('Sources (1)')
  })

  it('après une bonne réponse : notice verte, explication et bouton Leçon suivante', () => {
    const html = rendre({ mini: { choix: 1, envoi: false, resultat: { correcte: true, explication: 'Le plafond dépend des revenus de l année précédente.' } } })
    expect(html).toContain('Bonne réponse')
    expect(html).toContain('Le plafond dépend des revenus de l année précédente.')
    expect(html).toContain('Leçon suivante')
    expect((html.match(/>✓</g) || []).length).toBe(2)
  })

  it('après une mauvaise réponse : explication et Réessayer', () => {
    const html = rendre({ mini: { choix: 0, envoi: false, resultat: { correcte: false, explication: 'Ce sont les revenus de l année précédente.' } } })
    expect(html).toContain('Ce n est pas la bonne réponse')
    expect(html).toContain('>Réessayer<')
    expect(html).not.toContain('Leçon suivante')
  })

  it('sur la dernière leçon, la réussite mène au quiz', () => {
    const derniere = { ...lecon, id: 'l3', titre: 'La sortie', ordre: 3 }
    const html = rendre({ lecon: derniere, mini: { choix: 1, envoi: false, resultat: { correcte: true, explication: '' } } })
    expect(html).toContain('Passer le quiz')
    expect(html).toContain('Leçon 3 sur 3')
  })

  it('une leçon déjà terminée se présente résolue', () => {
    const finie = { ...lecon, progression: { position: null, terminee_le: '2026-09-15T10:00:00Z', mini_question_reussie_le: '2026-09-15T10:00:00Z' } }
    const html = rendre({ lecon: finie })
    expect(html).toContain('Leçon terminée ✓')
    expect(html).toContain('Leçon suivante')
    expect(html).toContain('<fieldset disabled=""')
  })

  it('l indicateur de sauvegarde dit l heure, ou propose de réessayer', () => {
    expect(rendre({ sauvegarde: { etat: 'ok', heure: '14h05' } })).toContain('Enregistré à 14h05')
    const echec = rendre({ sauvegarde: { etat: 'echec' } })
    expect(echec).toContain('Non enregistré')
    expect(echec).toContain('role="status"')
    expect(echec).toMatch(/Non enregistré.*Réessayer/)
  })
})
