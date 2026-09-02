import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DossiersStagnants from './DossiersStagnants'

// Midi local : entre 22h et minuit UTC, un instant a minuit tombait sur le
// lendemain a Paris et le compte de jours perdait une unite.
const il_y_a = (jours) => {
  const d = new Date()
  d.setDate(d.getDate() - jours)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}
const deals = [
  { id: '1', status: 'En cours', advisor_code: 'DEMO', product: 'PER Individuel', client: 'Camille Exemple', updated_at: il_y_a(30) },
  { id: '2', status: 'En cours', advisor_code: 'AUTRE', product: 'SCPI', client: 'Dominique Modèle', updated_at: il_y_a(50) },
  { id: '3', status: 'En cours', advisor_code: 'DEMO', product: 'SCPI', client: 'Frais Récent', updated_at: il_y_a(3) },
]

describe('DossiersStagnants (fumée)', () => {
  it('conseiller : ne montre que ses dossiers, sans répartition', () => {
    const html = renderToStaticMarkup(<DossiersStagnants deals={deals} profile={{ advisor_code: 'DEMO', role: 'advisor' }} />)
    expect(html).toContain('Dossiers sans mouvement')
    expect(html).toContain('1 dossier depuis plus de 21 jours')
    expect(html).toContain('Camille Exemple')
    expect(html).toContain('30 jours sans mouvement')
    expect(html).not.toContain('Dominique Modèle')
    expect(html).not.toContain('Frais Récent')
    expect(html).not.toContain('badge')
    expect(html).toContain('Relancer')
    expect(html).toContain('Abandonner')
  })

  it('manager : répartition en puces puis tout le cabinet', () => {
    const html = renderToStaticMarkup(<DossiersStagnants deals={deals} profile={{ advisor_code: 'LH', role: 'manager' }} />)
    expect(html).toContain('2 dossiers depuis plus de 21 jours · 2 conseillers')
    expect(html).toContain('badge badge-normal')
    expect(html).toContain('AUTRE · ')
    expect(html).toContain('DEMO · ')
    expect(html.indexOf('Dominique Modèle')).toBeLessThan(html.indexOf('Camille Exemple'))
  })

  it('ne rend rien si la liste est vide', () => {
    expect(renderToStaticMarkup(<DossiersStagnants deals={[]} profile={{ advisor_code: 'DEMO' }} />)).toBe('')
  })
})
