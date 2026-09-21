import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Le rendu markdown a besoin d un DOM (DOMPurify) : sans jsdom, on le
// remplace par un rendu brut. Ce que l on teste ici, c est l éditeur.
vi.mock('../ui/RenduMarkdown', () => ({
  default: ({ markdown }) => <div className="rendu-markdown-simule">{markdown}</div>,
}))

import { AdministrationVue, EditeurVersionVue } from './Administration'

// Un catalogue fictif : un module avec ses trois états de version, un module
// sans brouillon, un parcours, deux collaborateurs inventés.
const vue = {
  modules: [
    {
      id: 'm1', slug: 'per-et-retraite', titre: 'PER et préparation de la retraite', theme: 'per-retraite', niveau: 'fondamentaux', ordre: 3, archive_le: null,
      versions: [
        { id: 'v3', numero: 3, statut: 'brouillon', titre: 'PER et préparation de la retraite', publie_le: null, relu_par: null, updated_at: '2026-09-21T08:05:00+00:00', nb_lecons: 3, nb_questions: 10, affectations: 0, validations: 0 },
        { id: 'v2', numero: 2, statut: 'publie', titre: 'PER et préparation de la retraite', publie_le: '2026-09-10T09:00:00+00:00', relu_par: 'Camille Exemple', updated_at: '2026-09-10T09:00:00+00:00', nb_lecons: 3, nb_questions: 10, affectations: 4, validations: 2 },
        { id: 'v1', numero: 1, statut: 'archive', titre: 'Le PER', publie_le: '2026-08-01T09:00:00+00:00', relu_par: 'Dominique Modèle', updated_at: '2026-09-10T09:00:00+00:00', nb_lecons: 2, nb_questions: 6, affectations: 1, validations: 1 },
      ],
    },
    {
      id: 'm2', slug: 'assurance-vie', titre: 'Assurance vie', theme: 'assurance-vie', niveau: 'fondamentaux', ordre: 4, archive_le: null,
      versions: [
        { id: 'v9', numero: 1, statut: 'publie', titre: 'Assurance vie', publie_le: '2026-09-12T09:00:00+00:00', relu_par: 'Camille Exemple', updated_at: '2026-09-12T09:00:00+00:00', nb_lecons: 3, nb_questions: 10, affectations: 2, validations: 0 },
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

const question = (o) => ({
  id: 'q1', cle: 'q01', type: 'qcm', lecon_id: 'l1', competence: 'Expliquer le blocage', enonce: 'Quand les sommes d un PER sont elles disponibles ?',
  choix: ['À la retraite, sauf cas de déblocage anticipé', 'À tout moment', 'Après cinq ans', 'Jamais'],
  difficulte: 2, archive_le: null, bonne_reponse: 0, explication: 'Le PER est bloqué jusqu à la retraite.', statistiques: { reponses: 0, correctes: 0 }, ...o,
})

const version = (o) => ({
  id: 'v2', module_id: 'm1', slug: 'per-et-retraite', theme: 'per-retraite', niveau: 'fondamentaux', numero: 2, statut: 'brouillon',
  titre: 'PER et préparation de la retraite', objectif: 'Expliquer le PER à un client.', competence: 'PER', duree_minutes: 15,
  prerequis: ['methode-entasis'], seuil_reussite: 0.8,
  cas_pratique: { titre: 'Cas fictif : un ostéopathe', situation_markdown: 'Cas fictif. Monsieur Lemaire…', questions: ['Que lui dire ?'], corrige_markdown: 'On commence par le blocage.' },
  a_completer: ['Le circuit de souscription du cabinet'], sources: [{ titre: 'Le PER', url: 'https://www.service-public.fr/', emetteur: 'Service public', date_consultation: '2026-09-21' }],
  fictif: false, publie_le: null, relu_par: null, relu_le: null, commentaire_relecture: null,
  lecons: [
    { id: 'l1', ordre: 1, slug: 'l1', titre: 'Le mécanisme du PER', objectif: 'Énoncer le blocage', duree_minutes: 4, contenu_md: '## Le PER\n\nUne enveloppe.', mini_question: { enonce: 'Le PER est il bloqué ?', choix: ['Oui', 'Non'], bonne_reponse: 0, explication: 'Oui, sauf cas prévus.' }, sources: [] },
  ],
  questions: [question()],
  affectations: 4, validations: 2, ...o,
})

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
    expect(html).toContain('3 leçons · 10 questions · 4 affectations · 2 validations')
    expect(html).toContain('modifiée le 10/09/2026 à 11h00')
    expect(html).toContain('Ouvrir')
    expect(html).toContain('Nouveau module')
    expect(html).toContain('Les contenus semés sont en brouillon : ils se publient module par module après relecture.')
  })

  it('ne propose « Nouveau brouillon » que sur un module qui n en a pas déjà un', () => {
    const html = renderToStaticMarkup(<AdministrationVue vue={vue} erreur={null} onNaviguer={() => {}} onRecharger={() => {}} />)
    // Le premier module a un brouillon : un seul bouton, celui du second module.
    expect(html.match(/Nouveau brouillon/g)).toHaveLength(1)
    // Archiver ne se propose que sur une version publiée : une par module.
    expect(html.match(/>Archiver<\/button>/g)).toHaveLength(2)
  })

  it('montre le squelette pendant le chargement et l erreur en alerte', () => {
    const chargement = renderToStaticMarkup(<AdministrationVue vue={null} erreur={null} onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(chargement).toContain('skeleton-table')
    const erreur = renderToStaticMarkup(<AdministrationVue vue={null} erreur="Reserve a l administration de la formation" onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(erreur).toContain('role="alert"')
    expect(erreur).toContain('Reserve a l administration de la formation')
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

  it('journal : la date à Paris, l auteur et le détail en code court', () => {
    const html = renderToStaticMarkup(<AdministrationVue vue={vue} erreur={null} ongletInitial="journal" onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(html).toContain('21/09/2026 à 09h30')
    expect(html).toContain('Camille Exemple')
    expect(html).toContain('<code class="aca-code"')
    expect(html).toContain('relu_par')
  })
})

describe('EditeurVersionVue', () => {
  it('un brouillon se modifie : champs actifs, publication proposée', () => {
    const html = renderToStaticMarkup(<EditeurVersionVue version={version()} onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(html).toContain('Version 2 · brouillon')
    expect(html).not.toContain('Version publiée : lecture seule')
    expect(html).toContain('Enregistrer la version')
    expect(html).toContain('Enregistrer la leçon')
    expect(html).toContain('Enregistrer la question')
    expect(html).toContain('Ajouter une leçon')
    expect(html).toContain('Ajouter une question')
    expect(html).toContain('Publier cette version')
    expect(html).toContain('Prévisualiser comme un collaborateur')
    // La fiche est préremplie depuis la version.
    expect(html).toContain('value="PER et préparation de la retraite"')
    expect(html).toContain('value="methode-entasis"')
    expect(html).toContain('Le PER | https://www.service-public.fr/ | Service public | 2026-09-21')
    expect(html).toContain('rendu-markdown-simule')
    // Le titre n est pas désactivé.
    expect(html).toMatch(/<input id="aca-version-titre" class="form-input" value="PER[^"]*"\s*\/>/)
  })

  it('une version publiée est en lecture seule : bandeau et tous les champs désactivés', () => {
    const html = renderToStaticMarkup(
      <EditeurVersionVue version={version({ statut: 'publie', publie_le: '2026-09-10T09:00:00+00:00', relu_par: 'Camille Exemple', relu_le: '2026-09-10T09:00:00+00:00' })}
        onNaviguer={() => {}} onRecharger={() => {}} />,
    )
    expect(html).toContain('Version publiée : lecture seule. Créez un nouveau brouillon pour modifier.')
    expect(html).toContain('Version 2 · publié · relu par Camille Exemple')
    expect(html).toContain('<span class="badge badge-signed">Publié</span>')
    // Aucun champ de saisie sans l attribut disabled.
    const champsActifs = html.match(/<(input|textarea|select)\b(?![^>]*\bdisabled\b)[^>]*>/g) || []
    expect(champsActifs).toEqual([])
    // Pas de formulaire de publication, mais le rappel de qui a relu.
    expect(html).not.toContain('Publier cette version')
    expect(html).toContain('relue par Camille Exemple')
    expect(html).toContain('en ligne depuis le 10/09/2026 à 11h00')
  })

  it('le bouton Publier est désactivé tant que le relecteur n est pas nommé', () => {
    const html = renderToStaticMarkup(<EditeurVersionVue version={version()} onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Publier cette version<\/button>/)
    expect(html).toContain('Relu par (obligatoire)')
    expect(html).toContain('Imposer une nouvelle formation aux collaborateurs déjà affectés (la validation antérieure est conservée)')
  })

  it('signale « Formulation à revoir » sous 40 % de bonnes réponses avec au moins 8 réponses', () => {
    const basse = renderToStaticMarkup(
      <EditeurVersionVue version={version({ questions: [question({ statistiques: { reponses: 12, correctes: 3 } })] })} onNaviguer={() => {}} onRecharger={() => {}} />,
    )
    expect(basse).toContain('12 réponses, 25 % de bonnes réponses')
    expect(basse).toContain('Formulation à revoir')

    const bonne = renderToStaticMarkup(
      <EditeurVersionVue version={version({ questions: [question({ statistiques: { reponses: 12, correctes: 7 } })] })} onNaviguer={() => {}} onRecharger={() => {}} />,
    )
    expect(bonne).toContain('12 réponses, 58 % de bonnes réponses')
    expect(bonne).not.toContain('Formulation à revoir')

    // Trop peu de réponses : le taux ne dit rien, pas d alerte.
    const rare = renderToStaticMarkup(
      <EditeurVersionVue version={version({ questions: [question({ statistiques: { reponses: 5, correctes: 1 } })] })} onNaviguer={() => {}} onRecharger={() => {}} />,
    )
    expect(rare).toContain('5 réponses, 20 % de bonnes réponses')
    expect(rare).not.toContain('Formulation à revoir')

    // Sans réponse, pas de statistique du tout.
    const aucune = renderToStaticMarkup(<EditeurVersionVue version={version()} onNaviguer={() => {}} onRecharger={() => {}} />)
    expect(aucune).not.toMatch(/\d+ réponses?, \d+ % de bonnes réponses/)
  })

  it('une question archivée est marquée et propose Restaurer', () => {
    const html = renderToStaticMarkup(
      <EditeurVersionVue version={version({ questions: [question({ archive_le: '2026-09-20T10:00:00+00:00' })] })} onNaviguer={() => {}} onRecharger={() => {}} />,
    )
    expect(html).toContain('Archivée')
    expect(html).toContain('Restaurer')
    expect(html).not.toContain('Archiver la question')
    expect(html).toContain('0 en banque · 1 archivée')
  })
})
