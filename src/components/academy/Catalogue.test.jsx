import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CatalogueVue } from './Catalogue'

const AUJOURDHUI = '2026-09-21'
const FILTRES = { theme: null, niveau: null, duree: null, statut: null, obligatoire: null }

// Trois decks tels que les rend academy_catalogue : un validé à trois
// couronnes, un en cours et en retard, un jamais ouvert et non affecté.
const modules = [
  {
    module_id: 'm1', slug: 'methode-entasis', titre: 'La méthode Entasis', theme: 'methode', niveau: 'decouverte', ordre: 1, version_id: 'v1', numero: 2,
    objectif: 'Comprendre le déroulé d’un accompagnement', competence: 'Conduite de la relation', duree_minutes: 10, prerequis: [],
    nb_items: 48, publie_le: '2026-09-01', affectation: { id: 'a1', statut: 'valide', echeance: '2026-09-01', obligatoire: true, parcours_id: 'p1' },
    couronnes: 3, items_vus: 48, items_dus: 0, xp: 610, valide_le: '2026-08-30',
  },
  {
    module_id: 'm2', slug: 'per-et-retraite', titre: 'Le PER et la retraite', theme: 'per-retraite', niveau: 'fondamentaux', ordre: 2, version_id: 'v2', numero: 1,
    objectif: 'Expliquer la déduction et la sortie', competence: 'Fiscalité du PER', duree_minutes: 15, prerequis: ['methode-entasis'],
    nb_items: 40, publie_le: '2026-09-01', affectation: { id: 'a2', statut: 'en_cours', echeance: '2026-09-10', obligatoire: true, parcours_id: 'p1' },
    couronnes: 1, items_vus: 24, items_dus: 5, xp: 320, valide_le: null,
  },
  {
    module_id: 'm3', slug: 'transmission', titre: 'La transmission', theme: 'gestion-de-patrimoine', niveau: 'perfectionnement', ordre: 3, version_id: 'v3', numero: 1,
    objectif: 'Poser les bases de la donation et de la succession', competence: 'Transmission', duree_minutes: 25, prerequis: ['per-et-retraite', 'module-inconnu'],
    nb_items: 1, publie_le: '2026-09-01', affectation: null,
    couronnes: 0, items_vus: 0, items_dus: 0, xp: 0, valide_le: null,
  },
]

const rendre = (props) => renderToStaticMarkup(
  <CatalogueVue modules={modules} recherche="" filtres={FILTRES} aujourdhui={AUJOURDHUI} onRecherche={() => {}} onFiltres={() => {}} onNaviguer={() => {}} {...props} />,
)

describe('CatalogueVue', () => {
  it('affiche toutes les cartes avec couronnes, exercices, thème et niveau, prérequis en titres, retard et boutons', () => {
    const html = rendre()
    expect(html).toContain('3 decks, 3 affichés')
    expect(html).toContain('La méthode Entasis')
    expect(html).toContain('Le PER et la retraite')
    expect(html).toContain('La transmission')
    // Thème et niveau passent par les référentiels de format.js.
    expect(html).toContain('Méthode · Découverte')
    expect(html).toContain('PER et retraite · Fondamentaux')
    expect(html).toContain('Gestion de patrimoine · Perfectionnement')
    // Les prérequis arrivent en slugs : le titre du deck quand il est dans la liste, le slug sinon.
    expect(html).toContain('prérequis : La méthode Entasis')
    expect(html).toContain('prérequis : Le PER et la retraite, module-inconnu')
    expect(html).toContain('40 exercices · 15 min')
    expect(html).toContain('1 exercice · 25 min')
    expect(html).toContain('aria-label="3 couronnes sur 5"')
    expect(html).toContain('aria-label="1 couronne sur 5"')
    expect(html).toContain('24 sur 40 vus')
    expect(html).toContain('5 à revoir')
    expect(html).toContain('610 XP')
    // Un seul deck en retard (échéance dépassée, en cours) ; le validé n’en porte pas.
    expect((html.match(/>En retard</g) || []).length).toBe(1)
    expect((html.match(/>S’entraîner</g) || []).length).toBe(3)
    expect((html.match(/>Voir le deck</g) || []).length).toBe(3)
    expect(html).toContain('badge badge-signed">Validé')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('leçon')
    expect(html).not.toContain('quiz')
  })

  it('filtre par niveau', () => {
    const html = rendre({ filtres: { ...FILTRES, niveau: 'perfectionnement' } })
    expect(html).toContain('3 decks, 1 affiché')
    expect(html).toContain('ac-carte-titre ac-croissance">La transmission')
    expect(html).not.toContain('ac-carte-titre ac-croissance">Le PER et la retraite')
    expect(html).toContain('aria-pressed="true"')
  })

  it('filtre par statut, un deck non affecté et jamais ouvert est non commencé', () => {
    const html = rendre({ filtres: { ...FILTRES, statut: 'non_commence' } })
    expect(html).toContain('3 decks, 1 affiché')
    expect(html).toContain('ac-carte-titre ac-croissance">La transmission')
    expect(html).not.toContain('ac-carte-titre ac-croissance">La méthode Entasis')
  })

  it('un deck non affecté mais déjà travaillé est en cours', () => {
    const libre = modules.map((m) => (m.slug === 'transmission' ? { ...m, items_vus: 3, couronnes: 0 } : m))
    const html = rendre({ modules: libre, filtres: { ...FILTRES, statut: 'en_cours' } })
    expect(html).toContain('3 decks, 2 affichés')
    expect(html).toContain('La transmission')
  })

  it('filtre par durée et par obligation', () => {
    expect(rendre({ filtres: { ...FILTRES, duree: 'courte' } })).toContain('3 decks, 1 affiché')
    expect(rendre({ filtres: { ...FILTRES, duree: 'moyenne' } })).toContain('Le PER et la retraite')
    expect(rendre({ filtres: { ...FILTRES, duree: 'longue' } })).toContain('La transmission')
    const obligatoires = rendre({ filtres: { ...FILTRES, obligatoire: 'oui' } })
    expect(obligatoires).toContain('3 decks, 2 affichés')
    expect(obligatoires).not.toContain('La transmission')
  })

  it('la recherche est tolérante aux accents et à une lettre', () => {
    const html = rendre({ recherche: 'transmision' })
    expect(html).toContain('3 decks, 1 affiché')
    expect(html).toContain('La transmission')
    expect(rendre({ recherche: 'fiscalite per' })).toContain('Le PER et la retraite')
    expect(rendre({ recherche: 'fiscalite per' })).toContain('3 decks, 1 affiché')
  })

  it('aucun résultat : état vide avec effacement des filtres', () => {
    const html = rendre({ recherche: 'zzzz' })
    expect(html).toContain('Aucun deck ne correspond')
    expect(html).toContain('Effacer les filtres')
  })

  it('catalogue vide : état vide utile', () => {
    const html = renderToStaticMarkup(<CatalogueVue modules={[]} recherche="" filtres={FILTRES} aujourdhui={AUJOURDHUI} />)
    expect(html).toContain('Aucun deck publié')
  })

  it('un deck sans exercice : S entraîner désactivé avec l’aide, Voir le deck reste actif', () => {
    const html = rendre({ modules: [{ ...modules[2], nb_items: 0 }] })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Aucun exercice dans ce deck"[^>]*>S’entraîner<\/button>/)
    expect(html).toContain('0 exercice')
    expect(html).not.toMatch(/disabled=""[^>]*>Voir le deck/)
    // Les decks avec des exercices gardent un bouton actif.
    expect(rendre()).not.toMatch(/disabled=""[^>]*>S’entraîner/)
  })
})
