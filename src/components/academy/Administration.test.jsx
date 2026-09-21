import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Le rendu markdown a besoin d un DOM (DOMPurify) : sans jsdom, on le
// remplace par un rendu brut. L’éditeur de version se teste dans
// EditeurVersion.test.jsx ; ici, la vue d’ensemble de l’administration.
vi.mock('../ui/RenduMarkdown', () => ({
  default: ({ markdown }) => <div className="rendu-markdown-simule">{markdown}</div>,
}))

import { AdministrationVue } from './Administration'

// Un catalogue fictif : un module avec ses trois états de version, un module
// sans brouillon, un parcours, deux collaborateurs inventés.
const vue = {
  modules: [
    {
      id: 'm1', slug: 'per-et-retraite', titre: 'PER et préparation de la retraite', theme: 'per-retraite', niveau: 'fondamentaux', ordre: 3, archive_le: null,
      versions: [
        { id: 'v3', numero: 3, statut: 'brouillon', titre: 'PER et préparation de la retraite', publie_le: null, relu_par: null, updated_at: '2026-09-21T08:05:00+00:00', nb_items: 40, memo: true, affectations: 0, validations: 0 },
        { id: 'v2', numero: 2, statut: 'publie', titre: 'PER et préparation de la retraite', publie_le: '2026-09-10T09:00:00+00:00', relu_par: 'Camille Exemple', updated_at: '2026-09-10T09:00:00+00:00', nb_items: 38, memo: true, affectations: 4, validations: 2 },
        { id: 'v1', numero: 1, statut: 'archive', titre: 'Le PER', publie_le: '2026-08-01T09:00:00+00:00', relu_par: 'Dominique Modèle', updated_at: '2026-09-10T09:00:00+00:00', nb_items: 0, memo: false, affectations: 1, validations: 1 },
      ],
    },
    {
      id: 'm2', slug: 'assurance-vie', titre: 'Assurance vie', theme: 'assurance-vie', niveau: 'fondamentaux', ordre: 4, archive_le: null,
      versions: [
        { id: 'v9', numero: 1, statut: 'publie', titre: 'Assurance vie', publie_le: '2026-09-12T09:00:00+00:00', relu_par: 'Camille Exemple', updated_at: '2026-09-12T09:00:00+00:00', nb_items: 41, memo: true, affectations: 2, validations: 0 },
      ],
    },
  ],
  parcours: [
    { id: 'p1', slug: 'integration-30-jours', titre: 'Intégration, 30 jours', description: 'Les bases en un mois.', ordre: 1, archive_le: null,
      modules: [{ module_id: 'm1', ordre: 1, obligatoire: true, delai_jours: 15, titre: 'PER et préparation de la retraite', slug: 'per-et-retraite' }] },
  ],
  collaborateurs: [
    { id: 'c1', full_name: 'Sacha Témoin', advisor_code: 'SACHA', role: 'advisor' },
    { id: 'c2', full_name: 'Frais Récent', advisor_code: 'FRAIS', role: 'advisor' },
  ],
  affectations: [
    { id: 'a1', profile_id: 'c1', nom: 'Sacha Témoin', module_id: 'm1', version_id: 'v2', titre: 'PER et préparation de la retraite', slug: 'per-et-retraite', parcours_id: 'p1', obligatoire: true, echeance: '2026-10-05', statut: 'en_cours', created_at: '2026-09-15T10:00:00+00:00' },
    { id: 'a2', profile_id: 'c2', nom: 'Frais Récent', module_id: 'm2', version_id: 'v9', titre: 'Assurance vie', slug: 'assurance-vie', parcours_id: null, obligatoire: false, echeance: null, statut: 'valide', created_at: '2026-09-15T10:00:00+00:00' },
  ],
  journal: [
    { id: 'j1', survenu_le: '2026-09-21T07:30:00+00:00', nom: 'Camille Exemple', action: 'publier', cible: 'v2', detail: { relu_par: 'Camille Exemple' } },
  ],
  parametres: { seuil_reussite_defaut: 0.8, delai_j7: 7, delai_j30: 30, questions_par_quiz: 5, questions_par_revision: 4, retention_intervalles_mois: 12, inactivite_secondes: 120, pas_battement_secondes: 30 },
}

describe('AdministrationVue', () => {
  it('liste les versions de chaque module avec le badge de leur statut', () => {
    const html = renderToStaticMarkup(<AdministrationVue vue={vue} erreur={null} onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(html).toContain('Administration des contenus')
    expect(html).toContain('2 modules · 1 parcours · 2 affectations')
    expect(html).toContain('PER et préparation de la retraite')
    expect(html).toContain('per-et-retraite')
    expect(html).toContain('PER et retraite')
    expect(html).toContain('Fondamentaux')
    // Les trois statuts, chacun avec sa classe.
    expect(html).toContain('<span class="badge badge-normal">Brouillon</span>')
    expect(html).toContain('<span class="badge badge-signed">Publié</span>')
    expect(html).toContain('<span class="badge badge-cancelled">Archivé</span>')
    expect(html).toContain('Version 3')
    expect(html).toContain('Version 2')
    expect(html).toContain('Relue par Camille Exemple')
    expect(html).toContain('38 exercices · mémo présent · 4 affectations · 2 validations')
    expect(html).toContain('0 exercice · sans mémo · 1 affectation · 1 validation')
    expect(html).toContain('modifiée le 10/09/2026 à 11h00')
    expect(html).toContain('Ouvrir')
    expect(html).toContain('Nouveau module')
    expect(html).toContain('Les contenus semés sont en brouillon : ils se publient module par module après relecture.')
  })

  it('ne propose « Nouveau brouillon » que sur un module qui n’en a pas déjà un', () => {
    const html = renderToStaticMarkup(<AdministrationVue vue={vue} erreur={null} onNaviguer={() => {}} onRecharger={() => {}} />)
    // Le premier module a un brouillon : un seul bouton, celui du second module.
    expect(html.match(/Nouveau brouillon/g)).toHaveLength(1)
    // Archiver ne se propose que sur une version publiée : une par module.
    expect(html.match(/>Archiver<\/button>/g)).toHaveLength(2)
  })

  it('montre le squelette pendant le chargement et l’erreur en alerte', () => {
    const chargement = renderToStaticMarkup(<AdministrationVue vue={null} erreur={null} onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(chargement).toContain('skeleton-table')
    const erreur = renderToStaticMarkup(<AdministrationVue vue={null} erreur="Reserve a l’administration de la formation" onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(erreur).toContain('role="alert"')
    expect(erreur).toContain('Reserve a l’administration de la formation')
    expect(erreur).not.toContain('skeleton-table')
  })

  it('affectations : le statut en badge, Retirer désactivé sur une affectation validée', () => {
    const html = renderToStaticMarkup(<AdministrationVue vue={vue} erreur={null} ongletInitial="affectations" onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(html).toContain('Sacha Témoin')
    expect(html).toContain('Tout sélectionner')
    expect(html).toContain('<span class="badge badge-progress">En cours</span>')
    expect(html).toContain('<span class="badge badge-signed">Validé</span>')
    expect(html).toContain('Intégration, 30 jours')
    expect(html).toContain('05/10/2026')
    expect(html).toContain('Module seul')
    // Deux boutons Retirer, un seul désactivé (celui de la ligne validée).
    expect(html.match(/Retirer\s*<\/button>/g)).toHaveLength(2)
    expect(html.match(/<button[^>]*disabled=""[^>]*>\s*Retirer\s*<\/button>/g)).toHaveLength(1)
  })

  it('parcours : les modules ordonnés et la mention de réutilisation', () => {
    const html = renderToStaticMarkup(<AdministrationVue vue={vue} erreur={null} ongletInitial="parcours" onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(html).toContain('Un parcours réutilise les modules, il ne les duplique pas.')
    expect(html).toContain('Intégration, 30 jours')
    expect(html).toContain('J+15')
    expect(html).toContain('Nouveau parcours')
  })

  it('paramètres : les réglages numériques et la notice « Données suivies », en attente de sa valeur au premier rendu', () => {
    const html = renderToStaticMarkup(<AdministrationVue vue={vue} erreur={null} ongletInitial="parametres" onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(html).toContain('id="aca-prm-retention_intervalles_mois"')
    expect(html).toContain('value="12"')
    expect(html).toMatch(/<label[^>]*for="aca-prm-notice_donnees"[^>]*>Notice « Données suivies »<\/label>/)
    // adminVue ne porte pas notice_donnees : le textarea attend academy_mon_parcours.
    expect(html).toMatch(/<textarea[^>]*id="aca-prm-notice_donnees"[^>]*disabled=""/)
    expect(html).toContain('Chargement de la notice…')
    expect(html).toContain('Enregistrer les paramètres')
  })

  it('journal : la date à Paris, l’auteur et le détail en code court', () => {
    const html = renderToStaticMarkup(<AdministrationVue vue={vue} erreur={null} ongletInitial="journal" onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(html).toContain('21/09/2026 à 09h30')
    expect(html).toContain('Camille Exemple')
    expect(html).toContain('<code class="aca-code"')
    expect(html).toContain('relu_par')
  })
})
