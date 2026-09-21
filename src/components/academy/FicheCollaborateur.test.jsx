import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FicheVue } from './FicheCollaborateur'

// Une fiche fictive, telle que la rend academy_fiche. Noms inventés.
const MANAGER = { id: 'm1', role: 'manager', academy_admin: false, full_name: 'Direction Exemple' }
const CONSEILLER = { id: 'c1', role: 'advisor', academy_admin: false, full_name: 'Camille Durand' }
const COLLEGUE = { id: 'c2', role: 'advisor', academy_admin: false, full_name: 'Dominique Modèle' }

const donnees = {
  profil: { id: 'c1', full_name: 'Camille Durand', advisor_code: 'CD', role: 'advisor', is_active: true },
  affectations: [
    {
      id: 'a1', version_id: 'v1', slug: 'per', titre: 'Le PER', competence: 'Fiscalité du PER', theme: 'Retraite',
      obligatoire: true, echeance: '2026-09-10', statut: 'en_cours', en_retard: true, lecons_terminees: 2, nb_lecons: 3,
      valide_le: null, temps_actif_s: 1500,
    },
    {
      id: 'a2', version_id: 'v2', slug: 'av', titre: 'Assurance vie', competence: 'Clause bénéficiaire', theme: 'Épargne',
      obligatoire: false, echeance: null, statut: 'valide', en_retard: false, lecons_terminees: 3, nb_lecons: 3,
      valide_le: '2026-09-05T09:00:00Z', temps_actif_s: 2400,
    },
  ],
  tentatives: [
    { id: 't2', version_id: 'v2', titre: 'Assurance vie', competence: 'Clause bénéficiaire', type: 'quiz', numero: 2, soumise_le: '2026-09-05T09:00:00Z', score: 5, total: 5, reussie: true, duree_s: 400 },
    { id: 't1', version_id: 'v2', titre: 'Assurance vie', competence: 'Clause bénéficiaire', type: 'quiz', numero: 1, soumise_le: '2026-09-03T09:00:00Z', score: 3, total: 5, reussie: false, duree_s: 380 },
  ],
  revisions: [
    { id: 'r1', version_id: 'v2', titre: 'Assurance vie', type: 'J7', echeance: '2026-09-12', resultat: 'reussie', faite_le: '2026-09-12T10:00:00Z', due: false },
    { id: 'r2', version_id: 'v2', titre: 'Assurance vie', type: 'J30', echeance: '2026-10-05', resultat: null, faite_le: null, due: false },
  ],
  evenements: [
    { id: 'e5', survenu_le: '2026-09-12T10:00:00Z', type: 'revision_faite', version_id: 'v2', titre: 'Assurance vie', detail: { type: 'J7', reussie: true, score: 4, total: 4 } },
    { id: 'e4', survenu_le: '2026-09-05T09:00:00Z', type: 'module_valide', version_id: 'v2', titre: 'Assurance vie', detail: { score: 5, total: 5 } },
    { id: 'e3', survenu_le: '2026-09-03T09:00:00Z', type: 'tentative_soumise', version_id: 'v2', titre: 'Assurance vie', detail: { type: 'quiz', score: 3, total: 5, reussie: false } },
    { id: 'e2', survenu_le: '2026-09-02T08:00:00Z', type: 'lecon_terminee', version_id: 'v2', titre: 'Assurance vie', detail: { titre: 'La clause bénéficiaire' } },
    { id: 'e1', survenu_le: '2026-09-01T08:00:00Z', type: 'affectation_creee', version_id: 'v1', titre: 'Le PER', detail: { echeance: '2026-09-10' } },
  ],
  semaines: [
    { semaine: '2026-08-31', temps_actif_s: 1800 },
    { semaine: '2026-09-07', temps_actif_s: 3600 },
  ],
  commentaires: [{ id: 'k1', texte: 'Bon rythme, revoir la clause démembrée.', created_at: '2026-09-06T10:00:00Z', auteur: 'Direction Exemple' }],
  temps_actif_s: 3900,
}

const rendre = (profile, props) => renderToStaticMarkup(
  <FicheVue profile={profile} profileId="c1" donnees={donnees} chargement={false} {...props} />,
)

describe('FicheVue', () => {
  it('pose l en tête et les quatre indicateurs', () => {
    const html = rendre(MANAGER)
    expect(html).toContain('Camille Durand')
    expect(html).toContain('CD · ')
    expect(html).toContain('Retour au pilotage')
    expect(html).toContain('1 sur 2')
    expect(html).toContain('1 h 05')
    expect(html).toContain('Révisions dues')
    expect(html).toContain('Retards')
  })

  it('liste la progression par module avec statut, barre et échéance', () => {
    const html = rendre(MANAGER)
    expect(html).toContain('Le PER')
    expect(html).toContain('badge badge-progress')
    expect(html).toContain('>En retard<')
    expect(html).toContain('Échéance le 10/09/2026')
    expect(html).toContain('2/3')
    expect(html).toContain('badge badge-signed')
    expect(html).toContain('Validé le 05/09/2026')
    expect(html).toContain('25 min de temps actif')
  })

  it('rend les tentatives et les révisions avec leur résultat', () => {
    const html = rendre(MANAGER)
    expect(html).toContain('Quiz · essai 2')
    expect(html).toContain('5/5')
    expect(html).toContain('3/5')
    expect(html).toContain('>Réussie<')
    expect(html).toContain('>Échouée<')
    expect(html).toContain('J+30')
    expect(html).toContain('En attente')
    expect(html).toContain('faite le 12/09/2026')
  })

  it('rend la frise avec un libellé français par type, du plus récent au plus ancien', () => {
    const html = rendre(MANAGER)
    const libelles = ['Révision faite', 'Module validé', 'Tentative soumise', 'Leçon terminée', 'Affectation créée']
    for (const l of libelles) expect(html).toContain(l)
    const positions = libelles.map((l) => html.indexOf(l))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(html).toContain('acp-frise-pastille revision_faite')
    expect(html).toContain('acp-frise-pastille affectation_creee')
    expect(html).toContain('La clause bénéficiaire')
    expect(html).toContain('révision J+7 · 4/4 · réussie')
    expect(html).toContain('échéance le 10/09/2026')
    expect(html).toContain('01/09/2026 à 10h00')
  })

  it('dessine le temps actif par semaine en barres CSS, sans chart.js', () => {
    const html = rendre(MANAGER)
    expect(html).toContain('Semaine du 31/08')
    expect(html).toContain('Semaine du 07/09')
    expect(html).toContain('width:100%')
    expect(html).toContain('width:50%')
    expect(html).toContain('1 h 00')
    expect(html).toContain('30 min')
    expect(html).not.toContain('canvas')
  })

  it('montre le formulaire de coaching au manager, avec le commentaire existant', () => {
    const html = rendre(MANAGER, { commentaire: 'Nouvelle piste' })
    expect(html).toContain('Bon rythme, revoir la clause démembrée.')
    expect(html).toContain('id="acp-coaching-texte"')
    expect(html).toContain('form-textarea')
    expect(html).toContain('Ajouter le commentaire')
    expect(html).toContain('Nouvelle piste')
  })

  it('cache le formulaire de coaching à un conseiller sur sa propre fiche, mais montre les commentaires', () => {
    const html = rendre(CONSEILLER)
    expect(html).toContain('Camille Durand')
    expect(html).toContain('Ta fiche de formation')
    expect(html).toContain('Retour à mon parcours')
    expect(html).toContain('Bon rythme, revoir la clause démembrée.')
    expect(html).not.toContain('acp-coaching-texte')
    expect(html).not.toContain('Ajouter le commentaire')
  })

  it('refuse la fiche d un collègue à un conseiller', () => {
    const html = rendre(COLLEGUE)
    expect(html).toContain('Réservé à la direction')
    expect(html).not.toContain('Camille Durand')
  })

  it('montre les squelettes pendant le chargement et l erreur en alerte', () => {
    const html = renderToStaticMarkup(<FicheVue profile={MANAGER} profileId="c1" donnees={null} chargement />)
    expect(html).toContain('skeleton')
    expect(html).toContain('Chargement…')
    const enErreur = renderToStaticMarkup(<FicheVue profile={MANAGER} profileId="c1" donnees={null} chargement={false} erreur="Fiche reservee a la direction" />)
    expect(enErreur).toContain('role="alert"')
  })
})
