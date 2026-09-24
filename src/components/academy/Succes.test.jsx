import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SuccesVue } from './Succes'

// Ce que rend academy_mes_succes : tout le catalogue dans l’ordre, obtenu_le
// à null tant que le succès n’est pas gagné. Deux débloqués, deux
// verrouillés, dont un secret.
const catalogue = [
  { code: 'premiere_session', titre: 'Premier pas', description: 'Terminer une première session.', icone: 'pas', ordre: 1, secret: false, obtenu_le: '2026-09-01T18:30:00Z' },
  { code: 'session_parfaite', titre: 'Sans faute', description: 'Réussir les douze exercices d’une session.', icone: 'cible', ordre: 2, secret: false, obtenu_le: '2026-09-20T22:40:00Z' },
  { code: 'combo_6', titre: 'Six d’affilée', description: 'Enchaîner six bonnes réponses dans une session.', icone: 'eclair', ordre: 3, secret: false, obtenu_le: null },
  { code: 'noctambule', titre: 'Noctambule', description: 'Terminer une session après 21 h.', icone: 'lune', ordre: 4, secret: true, obtenu_le: null },
]

const rendre = (s = catalogue) => renderToStaticMarkup(<SuccesVue succes={s} onNaviguer={() => {}} />)

describe('SuccesVue (galerie des succès)', () => {
  it('l’en tête, le compteur et une carte par succès du catalogue', () => {
    const html = rendre()
    expect(html).toContain('section-kicker">Formation<')
    expect(html).toContain('section-title">Succès<')
    expect(html).toContain('2 sur 4 débloqués')
    expect((html.match(/<li class="card card-p ac-succes/g) || []).length).toBe(4)
    expect(html).toContain('>Retour à mes résultats</button>')
  })

  it('un succès débloqué : pictogramme plein, titre, condition et date à Paris', () => {
    const html = rendre()
    expect(html).toContain('class="card card-p ac-succes obtenu"')
    expect(html).toContain('class="ac-picto ac-picto-pas"')
    expect(html).toContain('ac-succes-titre">Premier pas<')
    expect(html).toContain('Terminer une première session.')
    expect(html).toContain('Obtenu le 01/09/2026')
    // 22h40 UTC le 20 septembre, c’est minuit quarante le 21 à Paris.
    expect(html).toContain('Obtenu le 21/09/2026')
  })

  it('un succès verrouillé : grisé par la classe, condition en clair, pas de date', () => {
    const html = rendre()
    expect(html).toContain('class="card card-p ac-succes verrouille"')
    expect(html).toContain('ac-succes-titre">Six d’affilée<')
    expect(html).toContain('Enchaîner six bonnes réponses dans une session.')
    expect((html.match(/>Pas encore débloqué</g) || []).length).toBe(2)
  })

  it('un succès secret encore verrouillé ne livre ni son titre ni sa condition', () => {
    const html = rendre()
    expect(html).toContain('ac-succes-titre">Succès secret<')
    expect(html).toContain('Sa condition se découvre en jouant.')
    expect(html).not.toContain('Noctambule')
    expect(html).not.toContain('Terminer une session après 21 h.')
    expect(html).toContain('class="ac-picto ac-picto-neutre"')
  })

  it('un succès secret déjà obtenu s’affiche en clair', () => {
    const html = rendre([{ ...catalogue[3], obtenu_le: '2026-09-18T20:00:00Z' }])
    expect(html).toContain('ac-succes-titre">Noctambule<')
    expect(html).toContain('Terminer une session après 21 h.')
    expect(html).toContain('class="ac-picto ac-picto-lune"')
    expect(html).not.toContain('Succès secret')
  })

  it('aucun emoji, aucun tiret cadratin dans la galerie', () => {
    const html = rendre()
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
    expect(html).not.toMatch(/[\u2014\u2013]/)
  })

  it('catalogue vide : l’état vide renvoie à Aujourd hui', () => {
    const html = rendre([])
    expect(html).toContain('Aucun succès au catalogue pour l’instant')
    expect(html).toContain('>Voir Aujourd hui</button>')
    expect(html).not.toContain('ac-succes-grille')
  })
})
