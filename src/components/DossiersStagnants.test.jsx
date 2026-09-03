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
const jour_il_y_a = (jours) => il_y_a(jours).slice(0, 10)

const deals = [
  { id: '1', status: 'En cours', advisor_code: 'DEMO', product: 'PER Individuel', client: 'Camille Exemple', updated_at: il_y_a(30) },
  { id: '2', status: 'En cours', advisor_code: 'AUTRE', product: 'SCPI', client: 'Dominique Modèle', updated_at: il_y_a(50) },
  { id: '3', status: 'En cours', advisor_code: 'DEMO', product: 'SCPI', client: 'Frais Récent', updated_at: il_y_a(3) },
]

// Un dossier signé il y a 40 jours, en co conseil, dont la fiche est
// incomplète et a été retouchée par le co conseiller il y a 25 jours.
const signes = [
  { id: 's1', status: 'Signé', client_id: 'c1', advisor_code: 'DEMO', co_advisor_code: 'VICTOR', product: 'Assurance Vie Française', client: 'Sacha Témoin', date_signed: jour_il_y_a(40), updated_at: il_y_a(0) },
]
const fiches = [
  { id: 'c1', nom: 'Sacha Témoin', email: 's@exemple.fr', telephone: '06 00 00 00 00', statut_pro: 'TNS', profession: 'Médecin', advisor_code: 'DEMO', co_advisor_code: 'VICTOR', created_at: il_y_a(300), updated_at: il_y_a(25), maj_par: 'VICTOR' },
]

describe('DossiersStagnants (fumée)', () => {
  it('conseiller : ne montre que ses dossiers, sans répartition', () => {
    const html = renderToStaticMarkup(<DossiersStagnants deals={deals} clients={[]} profile={{ advisor_code: 'DEMO', role: 'advisor' }} />)
    expect(html).toContain('Dossiers sans mouvement')
    expect(html).toContain('1 dossier en cours depuis plus de 21 jours')
    expect(html).toContain('Camille Exemple')
    expect(html).toContain('30 jours sans mouvement')
    expect(html).not.toContain('Dominique Modèle')
    expect(html).not.toContain('Frais Récent')
    expect(html).not.toContain('badge')
    expect(html).toContain('Relancer')
    expect(html).toContain('Abandonner')
    expect(html).not.toContain('fiche à finir')
  })

  it('manager : répartition en puces puis tout le cabinet', () => {
    const html = renderToStaticMarkup(<DossiersStagnants deals={deals} clients={[]} profile={{ advisor_code: 'LH', role: 'manager' }} />)
    expect(html).toContain('2 dossiers en cours depuis plus de 21 jours · 2 conseillers')
    expect(html).toContain('badge badge-normal')
    expect(html).toContain('AUTRE · ')
    expect(html).toContain('DEMO · ')
    expect(html.indexOf('Dominique Modèle')).toBeLessThan(html.indexOf('Camille Exemple'))
  })

  it('ne rend rien si les deux listes sont vides', () => {
    expect(renderToStaticMarkup(<DossiersStagnants deals={[]} clients={[]} profile={{ advisor_code: 'DEMO' }} />)).toBe('')
  })

  it('signés : la fiche à finir, avec qui a saisi en dernier, vu par le second conseiller', () => {
    const html = renderToStaticMarkup(<DossiersStagnants deals={signes} clients={fiches} profile={{ advisor_code: 'DEMO', role: 'advisor' }} />)
    expect(html).toContain('Signés, fiche à finir')
    expect(html).toContain('1 fiche de dossier signé à compléter')
    expect(html).toContain('Sacha Témoin')
    expect(html).toContain('signé le')
    expect(html).toContain('fiche à')
    expect(html).toContain('25 jours sans mouvement')
    expect(html).toContain('avec VICTOR')
    expect(html).toContain('VICTOR a saisi le')
    expect(html).toContain('Compléter la fiche')
    expect(html).not.toContain('Abandonner')
    expect(html).toContain('Aucun dossier en cours sans mouvement')
  })

  it('signés : celui qui a saisi lui même le lit à la première personne', () => {
    const html = renderToStaticMarkup(<DossiersStagnants deals={signes} clients={fiches} profile={{ advisor_code: 'VICTOR', role: 'advisor' }} />)
    expect(html).toContain('vous avez saisi le')
    expect(html).toContain('avec DEMO')
  })

  it('signés, manager : la répartition par conseiller principal et le compte en co conseil', () => {
    const html = renderToStaticMarkup(<DossiersStagnants deals={signes} clients={fiches} profile={{ advisor_code: 'LH', role: 'manager' }} />)
    expect(html).toContain('Vue direction · signés, fiche à finir')
    expect(html).toContain('1 en co conseil')
    expect(html).toContain('DEMO · ')
    expect(html).toContain('VICTOR a saisi le')
  })

  it('signés : une fiche complète ou une signature fraîche ne remontent pas', () => {
    const complete = [{ ...fiches[0], revenus_annuels: 1, patrimoine_estime: 1, date_naissance: '1980-01-01', situation_familiale: 'Marié' }]
    expect(renderToStaticMarkup(<DossiersStagnants deals={signes} clients={complete} profile={{ advisor_code: 'DEMO' }} />)).toBe('')
    const frais = [{ ...signes[0], date_signed: jour_il_y_a(5) }]
    expect(renderToStaticMarkup(<DossiersStagnants deals={frais} clients={fiches} profile={{ advisor_code: 'DEMO' }} />)).toBe('')
  })

  it('signés : au delà de huit fiches, la liste se replie', () => {
    const beaucoup = Array.from({ length: 10 }, (_, i) => ({ ...signes[0], id: `s${i}`, client_id: `c${i}`, co_advisor_code: null }))
    const fichesN = Array.from({ length: 10 }, (_, i) => ({ ...fiches[0], id: `c${i}`, nom: `Client ${i}`, co_advisor_code: null, maj_par: null }))
    const html = renderToStaticMarkup(<DossiersStagnants deals={beaucoup} clients={fichesN} profile={{ advisor_code: 'DEMO' }} />)
    expect(html).toContain('10 fiches de dossiers signés à compléter')
    expect(html).toContain('Voir les 2 autres')
    expect((html.match(/Compléter la fiche/g) || []).length).toBe(8)
  })
})
