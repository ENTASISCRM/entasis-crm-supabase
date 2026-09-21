import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CatalogueVue } from './Catalogue'

const AUJOURDHUI = '2026-09-21'
const FILTRES = { theme: null, niveau: null, duree: null, statut: null, obligatoire: null }

const modules = [
  {
    module_id: 'm1', slug: 'methode-entasis', titre: 'La méthode Entasis', theme: 'Méthode', niveau: 'decouverte', version_id: 'v1',
    objectif: 'Comprendre le déroulé d un accompagnement', competence: 'Conduite de la relation', duree_minutes: 10, prerequis: [],
    seuil_reussite: 0.8, nb_lecons: 3, nb_questions: 10, affectation: { id: 'a1', statut: 'valide', echeance: '2026-09-01', obligatoire: true }, lecons_terminees: 3, valide_le: '2026-08-30',
  },
  {
    module_id: 'm2', slug: 'per-et-retraite', titre: 'Le PER et la retraite', theme: 'Produits', niveau: 'fondamentaux', version_id: 'v2',
    objectif: 'Expliquer la déduction et la sortie', competence: 'Fiscalité du PER', duree_minutes: 15, prerequis: ['methode-entasis'],
    seuil_reussite: 0.8, nb_lecons: 3, nb_questions: 10, affectation: { id: 'a2', statut: 'en_cours', echeance: '2026-09-10', obligatoire: true }, lecons_terminees: 1, valide_le: null,
  },
  {
    module_id: 'm3', slug: 'transmission', titre: 'La transmission', theme: 'Patrimoine', niveau: 'perfectionnement', version_id: 'v3',
    objectif: 'Poser les bases de la donation et de la succession', competence: 'Transmission', duree_minutes: 25, prerequis: ['per-et-retraite', 'module-inconnu'],
    seuil_reussite: 0.8, nb_lecons: 3, nb_questions: 10, affectation: null, lecons_terminees: 0, valide_le: null,
  },
]

const rendre = (props) => renderToStaticMarkup(
  <CatalogueVue modules={modules} recherche="" filtres={FILTRES} aujourdhui={AUJOURDHUI} onRecherche={() => {}} onFiltres={() => {}} onNaviguer={() => {}} {...props} />,
)

describe('CatalogueVue', () => {
  it('affiche toutes les cartes avec le compteur, les prérequis en titres, le retard et le bouton adapté', () => {
    const html = rendre()
    expect(html).toContain('3 modules, 3 affichés')
    expect(html).toContain('La méthode Entasis')
    expect(html).toContain('Le PER et la retraite')
    expect(html).toContain('La transmission')
    // Les prérequis arrivent en slugs : le titre du module quand il est dans la liste, le slug sinon.
    expect(html).toContain('prérequis : La méthode Entasis')
    expect(html).toContain('prérequis : Le PER et la retraite, module-inconnu')
    expect(html).toContain('3 leçons · 15 min')
    // Un seul module en retard (échéance dépassée, en cours) ; le validé n en porte pas.
    expect((html.match(/>En retard</g) || []).length).toBe(1)
    expect(html).toContain('>Reprendre<')
    expect(html).toContain('>Ouvrir<')
    expect(html).toContain('badge badge-signed">Validé')
    expect(html).toContain('role="status"')
  })

  it('filtre par niveau', () => {
    const html = rendre({ filtres: { ...FILTRES, niveau: 'perfectionnement' } })
    expect(html).toContain('3 modules, 1 affiché')
    expect(html).toContain('ac-carte-titre">La transmission')
    // Le titre du PER ne subsiste que dans la ligne des prérequis, plus en carte.
    expect(html).not.toContain('ac-carte-titre">Le PER et la retraite')
    expect(html).toContain('aria-pressed="true"')
  })

  it('filtre par statut, un module non affecté est non commencé', () => {
    const html = rendre({ filtres: { ...FILTRES, statut: 'non_commence' } })
    expect(html).toContain('3 modules, 1 affiché')
    expect(html).toContain('ac-carte-titre">La transmission')
    expect(html).not.toContain('ac-carte-titre">La méthode Entasis')
  })

  it('filtre par durée et par obligation', () => {
    expect(rendre({ filtres: { ...FILTRES, duree: 'courte' } })).toContain('3 modules, 1 affiché')
    expect(rendre({ filtres: { ...FILTRES, duree: 'moyenne' } })).toContain('Le PER et la retraite')
    expect(rendre({ filtres: { ...FILTRES, duree: 'longue' } })).toContain('La transmission')
    const obligatoires = rendre({ filtres: { ...FILTRES, obligatoire: 'oui' } })
    expect(obligatoires).toContain('3 modules, 2 affichés')
    expect(obligatoires).not.toContain('La transmission')
  })

  it('la recherche est tolérante aux accents et à une lettre', () => {
    const html = rendre({ recherche: 'transmision' })
    expect(html).toContain('3 modules, 1 affiché')
    expect(html).toContain('La transmission')
    expect(rendre({ recherche: 'fiscalite per' })).toContain('Le PER et la retraite')
    expect(rendre({ recherche: 'fiscalite per' })).toContain('3 modules, 1 affiché')
  })

  it('aucun résultat : état vide avec effacement des filtres', () => {
    const html = rendre({ recherche: 'zzzz' })
    expect(html).toContain('Aucun module ne correspond')
    expect(html).toContain('Effacer les filtres')
  })

  it('catalogue vide : état vide utile', () => {
    const html = renderToStaticMarkup(<CatalogueVue modules={[]} recherche="" filtres={FILTRES} aujourdhui={AUJOURDHUI} />)
    expect(html).toContain('Aucun module publié')
  })
})
