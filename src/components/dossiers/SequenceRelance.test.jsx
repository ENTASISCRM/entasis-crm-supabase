// Rendu statique du bloc « Séquence de relance », sans navigateur : on
// vérifie que chaque état produit le bon contenu, et qu'aucun rendu ne casse.
// Les gestes (Démarrer, Arrêter) s'appuient sur lib/sequences, testée à part.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SequenceRelance from './SequenceRelance'

const TODAY = '2026-08-28'
const rendre = (deal) => renderToStaticMarkup(<SequenceRelance deal={deal} set={() => {}} today={TODAY} />)

describe('SequenceRelance', () => {
  it('sans séquence : le sélecteur des trois gabarits et le bouton Démarrer', () => {
    const html = rendre({ id: 'd1', next_action: '', next_action_date: '' })
    expect(html).toContain('Séquence de relance')
    expect(html).toContain('Relance devis standard')
    expect(html).toContain('Suite de rendez vous')
    expect(html).toContain('Pièces manquantes')
    expect(html).toContain('Démarrer')
    expect(html).toContain('J+2, J+7 et J+15')
    expect(html).not.toContain('Arrêter la séquence')
  })

  it('avec séquence : le gabarit, les étapes avec leur état, le bouton Arrêter', () => {
    const html = rendre({ id: 'd1', sequence_key: 'relance_devis', sequence_etape: 2, next_action_date: '2026-09-04' })
    expect(html).toContain('Relance devis standard')
    expect(html).toContain('Étape 1 · J+2 · Appel de suivi du devis')
    expect(html).toContain('faite')
    expect(html).toContain('posée le 04/09')
    expect(html).toContain('prévue le 19/09')
    expect(html).toContain('Arrêter la séquence')
    expect(html).not.toContain('Démarrer')
  })

  it('clé inconnue : le dit, et laisse arrêter', () => {
    const html = rendre({ id: 'd1', sequence_key: 'disparu', sequence_etape: 1 })
    expect(html).toContain('Séquence inconnue (disparu)')
    expect(html).toContain('Arrêter la séquence')
  })

  it('les boutons ne soumettent jamais le formulaire de la modale', () => {
    const sans = rendre({ id: 'd1' })
    const avec = rendre({ id: 'd1', sequence_key: 'apres_rdv', sequence_etape: 1, next_action_date: '2026-08-29' })
    for (const html of [sans, avec]) {
      const boutons = html.match(/<button[^>]*>/g) || []
      expect(boutons.length).toBeGreaterThan(0)
      for (const b of boutons) expect(b).toContain('type="button"')
    }
  })

  it('ne rend rien sans dossier ou sans setter', () => {
    expect(renderToStaticMarkup(<SequenceRelance deal={null} set={() => {}} />)).toBe('')
    expect(renderToStaticMarkup(<SequenceRelance deal={{ id: 'd1' }} />)).toBe('')
  })
})
