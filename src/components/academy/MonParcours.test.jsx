import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MonParcoursVue } from './MonParcours'

const AUJOURDHUI = '2026-09-21'

// Un parcours fictif, tel que le rend academy_mon_parcours : une série de
// quatre jours en danger, l objectif du jour pas encore atteint, un deck en
// retard avec des exercices dus, un deck validé, un deck non commencé.
const parcours = {
  aujourdhui: AUJOURDHUI,
  serie: { serie: 4, meilleure: 9, dernier_jour: '2026-09-20', objectif_quotidien: 2, sessions_aujourdhui: 0, objectif_atteint: false, en_danger: true },
  xp: { total: 860, aujourdhui: 0, semaine: 140 },
  items_dus: 7,
  affectations: [
    {
      id: 'a1', module_id: 'm1', version_id: 'v1', parcours_id: 'p1', parcours_titre: 'Fondamentaux du conseiller',
      obligatoire: true, echeance: '2026-09-10', statut: 'en_cours', en_retard: true,
      slug: 'per-et-retraite', titre: 'Le PER et la retraite', theme: 'per-retraite', niveau: 'fondamentaux', duree_minutes: 15,
      nb_items: 40, couronnes: 1, items_vus: 24, items_dus: 5, xp: 320, sessions: 4, derniere_session: '2026-09-19T10:00:00Z', valide_le: null, version_statut: 'publie', created_at: '2026-08-01',
    },
    {
      id: 'a2', module_id: 'm2', version_id: 'v2', parcours_id: 'p1', parcours_titre: 'Fondamentaux du conseiller',
      obligatoire: true, echeance: '2026-09-01', statut: 'valide', en_retard: false,
      slug: 'assurance-vie', titre: 'L’assurance vie', theme: 'assurance-vie', niveau: 'fondamentaux', duree_minutes: 12,
      nb_items: 36, couronnes: 3, items_vus: 36, items_dus: 2, xp: 540, sessions: 9, derniere_session: '2026-09-15T10:00:00Z', valide_le: '2026-08-30T10:00:00Z', version_statut: 'publie', created_at: '2026-08-01',
    },
    {
      id: 'a3', module_id: 'm3', version_id: 'v3', parcours_id: null, parcours_titre: null,
      obligatoire: false, echeance: '2026-09-25', statut: 'non_commence', en_retard: false,
      slug: 'scpi', titre: 'Les SCPI', theme: 'immobilier-patrimonial', niveau: 'decouverte', duree_minutes: 10,
      nb_items: 30, couronnes: 0, items_vus: 0, items_dus: 0, xp: 0, sessions: 0, derniere_session: null, valide_le: null, version_statut: 'publie', created_at: '2026-09-01',
    },
  ],
  dernieres_reussites: [
    { version_id: 'v2', titre: 'L’assurance vie', slug: 'assurance-vie', valide_le: '2026-08-30T10:00:00Z', attestation: 'EA-2026-0007' },
  ],
  temps_actif_s: 5400,
  temps_actif_7j_s: 1500,
}

const rendre = (p = parcours) => renderToStaticMarkup(<MonParcoursVue parcours={p} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} onObjectif={() => {}} />)

describe('MonParcoursVue (Aujourd hui)', () => {
  it('l’en tête dit Aujourd hui, la série en danger, la flamme en CSS sans emoji', () => {
    const html = rendre()
    expect(html).toContain('section-title">Aujourd hui')
    expect(html).toContain('>4 jours<')
    expect(html).toContain('meilleure série : 9 jours')
    expect(html).toContain('badge badge-urgent">En danger')
    expect(html).toContain('Une session aujourd’hui et la série continue.')
    expect(html).toContain('class="ac-flamme eteinte"')
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('l’objectif du jour : sessions faites sur objectif, barre, bouton Objectif', () => {
    const html = rendre()
    expect(html).toContain('Objectif du jour')
    expect(html).toContain('>0/2<')
    expect(html).toContain('2 sessions par jour')
    expect(html).toContain('>Objectif<')
    expect(html).toContain('aria-expanded="false"')
    // Le sélecteur ne s’ouvre qu’au clic.
    expect(html).not.toContain('ac-objectif-select')
  })

  it('objectif atteint : le badge remplace le rappel', () => {
    const atteint = { ...parcours, serie: { ...parcours.serie, sessions_aujourdhui: 2, objectif_atteint: true, en_danger: false } }
    const html = rendre(atteint)
    expect(html).toContain('badge badge-signed">Objectif atteint')
    expect(html).toContain('>2/2<')
    expect(html).toContain('team-bar-fill signed')
    expect(html).not.toContain('En danger')
  })

  it('XP du jour et de la semaine, exercices dus', () => {
    const html = rendre()
    expect(html).toContain('140 XP cette semaine · 860 au total')
    expect(html).toContain('>7<')
    expect(html).toContain('7 exercices à revoir')
  })

  it('une carte par deck : couronnes, exercices vus et dus, échéance, retard, S entraîner et Voir le deck', () => {
    const html = rendre()
    expect((html.match(/<article class="card card-p ac-deck/g) || []).length).toBe(3)
    expect(html).toContain('aria-label="1 couronne sur 5"')
    expect(html).toContain('aria-label="3 couronnes sur 5"')
    expect(html).toContain('aria-label="0 couronne sur 5"')
    expect(html).toContain('24 sur 40 exercices vus')
    expect(html).toContain('5 exercices à revoir')
    expect(html).toContain('Fondamentaux du conseiller · obligatoire')
    expect(html).toContain('badge badge-urgent">En retard')
    expect((html.match(/>En retard</g) || []).length).toBe(1)
    expect(html).toContain('Échéance dépassée de 11 jours')
    expect(html).toContain('À rendre dans 4 jours')
    expect(html).toContain('badge badge-signed">Validé')
    expect((html.match(/>S’entraîner</g) || []).length).toBe(3)
    expect((html.match(/>Voir le deck</g) || []).length).toBe(4)
  })

  it('les decks en retard passent avant ceux qui ont des exercices dus, les validés à la fin', () => {
    const html = rendre()
    const per = html.indexOf('Le PER et la retraite')
    const av = html.indexOf('ac-carte-titre">L’assurance vie')
    const scpi = html.indexOf('Les SCPI')
    expect(per).toBeLessThan(av)
    expect(per).toBeLessThan(scpi)
    // Le deck validé mais avec des exercices dus passe avant le deck non commencé.
    expect(av).toBeLessThan(scpi)
  })

  it('le sous titre résume decks validés, retards et exercices à revoir ; les réussites sont listées', () => {
    const html = rendre()
    expect(html).toContain('1 sur 3 decks affectés validé · 1 en retard · 7 exercices à revoir')
    expect(html).toContain('Dernières réussites')
    expect(html).toContain('EA-2026-0007')
    expect(html).toContain('Validé le 30/08/2026')
  })

  it('sans affectation, l’état vide renvoie au catalogue et la série reste visible', () => {
    const vide = { aujourdhui: AUJOURDHUI, serie: { serie: 0, meilleure: 0, objectif_quotidien: 1, sessions_aujourdhui: 0, objectif_atteint: false, en_danger: false }, xp: { total: 0, aujourdhui: 0, semaine: 0 }, items_dus: 0, affectations: [], dernieres_reussites: [] }
    const html = rendre(vide)
    expect(html).toContain('Rien ne t est encore affecté : le catalogue est ouvert')
    expect(html).toContain('Ouvrir le catalogue')
    expect(html).toContain('>0 jour<')
    expect(html).toContain('Une session terminée aujourd’hui lance ta série.')
    expect(html).toContain('aucun exercice en attente de révision')
    expect(html).not.toContain('S’entraîner')
  })

  it('une version archivée : badge Version remplacée et renvoi au catalogue à la place de S entraîner', () => {
    const p = { ...parcours, affectations: [{ ...parcours.affectations[2], version_statut: 'archive' }] }
    const html = rendre(p)
    expect(html).toContain('badge badge-normal">Version remplacée')
    expect(html).toContain('>Deck remplacé, voir le catalogue</button>')
    expect(html).not.toContain('S’entraîner')
    expect(html).not.toContain('#/formation/entrainement/')
    expect(html).toContain('>Voir le deck</button>')
  })

  it('un deck sans exercice : S entraîner désactivé avec l’aide', () => {
    const p = { ...parcours, affectations: [{ ...parcours.affectations[2], nb_items: 0, items_vus: 0 }] }
    const html = rendre(p)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Aucun exercice dans ce deck"[^>]*>S’entraîner<\/button>/)
    expect(html).toContain('class="ac-muet">Aucun exercice dans ce deck<')
    expect(html).not.toContain('Version remplacée')
  })
})
