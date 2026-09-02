import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import JaugeCompletude from './JaugeCompletude'

const fiche = {
  id: 'c1', nom: 'Camille Exemple', statut_pro: 'TNS', revenus_annuels: 62000, patrimoine_estime: null,
  date_naissance: null, age: 41, profession: 'Architecte', situation_familiale: null,
  telephone: '06 00 00 00 01', email: 'camille@exemple.fr',
}

describe('JaugeCompletude (fumée)', () => {
  it('affiche le pourcentage, le niveau et la liste des manquants', () => {
    const html = renderToStaticMarkup(<JaugeCompletude client={fiche} />)
    expect(html).toContain('data-niveau="presque"')
    expect(html).toContain('75 %')
    expect(html).toContain('Presque complète')
    expect(html).toContain('width:75%')
    expect(html).toContain('Il manque 2 champs')
    expect(html).toContain('Patrimoine estimé')
    expect(html).toContain('Situation familiale')
    // Le libellé lisible par un lecteur d’écran reprend les manquants.
    expect(html).toContain('Il manque : patrimoine estimé, situation familiale.')
  })

  it('en compact, ni libellé de niveau, barre plus courte', () => {
    const html = renderToStaticMarkup(<JaugeCompletude client={fiche} compact />)
    expect(html).toContain('cpl-compact')
    expect(html).not.toContain('Presque complète')
  })

  it('une fiche complète n’a pas de bulle', () => {
    const html = renderToStaticMarkup(<JaugeCompletude client={{ ...fiche, patrimoine_estime: 0, situation_familiale: 'Marié' }} />)
    expect(html).toContain('data-niveau="complete"')
    expect(html).toContain('100 %')
    expect(html).not.toContain('cpl-bulle')
  })
})
