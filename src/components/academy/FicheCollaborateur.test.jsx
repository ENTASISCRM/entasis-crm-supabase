import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FicheVue } from './FicheCollaborateur'

// Une fiche fictive, telle que la rend academy_fiche en mode entraînement.
// Noms inventés.
const MANAGER = { id: 'm1', role: 'manager', academy_admin: false, full_name: 'Direction Exemple' }
const CONSEILLER = { id: 'c1', role: 'advisor', academy_admin: false, full_name: 'Camille Durand' }
const COLLEGUE = { id: 'c2', role: 'advisor', academy_admin: false, full_name: 'Dominique Modèle' }

const donnees = {
  profil: { id: 'c1', full_name: 'Camille Durand', advisor_code: 'CD', role: 'advisor', is_active: true },
  serie: { serie: 4, meilleure: 9, dernier_jour: '2026-09-20', objectif_quotidien: 2 },
  xp_total: 1450,
  items_dus: 7,
  affectations: [
    {
      id: 'a1', version_id: 'v1', slug: 'per', titre: 'Le PER', competence: 'Fiscalité du PER', theme: 'per-retraite',
      obligatoire: true, echeance: '2026-09-10', statut: 'en_cours', en_retard: true, couronnes: 1, nb_items: 40, items_vus: 10, items_dus: 6,
      xp: 230, sessions: 2, derniere_session: '2026-09-20T08:05:00Z', valide_le: null, temps_actif_s: 1500,
    },
    {
      id: 'a2', version_id: 'v2', slug: 'av', titre: 'Assurance vie', competence: 'Clause bénéficiaire', theme: 'assurance-vie',
      obligatoire: false, echeance: null, statut: 'valide', en_retard: false, couronnes: 3, nb_items: 36, items_vus: 36, items_dus: 1,
      xp: 1220, sessions: 11, derniere_session: '2026-09-05T09:00:00Z', valide_le: '2026-09-05T09:00:00Z', temps_actif_s: 2400,
    },
  ],
  sessions: [
    { id: 's2', version_id: 'v1', titre: 'Le PER', demarree_le: '2026-09-20T08:00:00Z', terminee_le: '2026-09-20T08:05:00Z', nb_bons: 9, nb_total: 12, xp: 110 },
    { id: 's1', version_id: 'v2', titre: 'Assurance vie', demarree_le: '2026-09-05T08:59:20Z', terminee_le: '2026-09-05T09:00:00Z', nb_bons: 12, nb_total: 12, xp: 150 },
  ],
  items_faibles: [
    { item_id: 'i1', version_id: 'v1', titre_module: 'Le PER', competence: 'Fiscalité du PER', enonce_court: 'Le plafond de déduction du PER se calcule sur ___', force: 1, prochaine_le: '2026-09-22T08:00:00Z' },
  ],
  evenements: [
    { id: 'e5', survenu_le: '2026-09-20T08:05:00Z', type: 'session_terminee', version_id: 'v1', titre: 'Le PER', detail: { bons: 9, total: 12, xp: 110, couronnes: 1 } },
    { id: 'e4', survenu_le: '2026-09-05T09:00:00Z', type: 'module_valide', version_id: 'v2', titre: 'Assurance vie', detail: { couronnes: 3 } },
    { id: 'e3', survenu_le: '2026-09-03T09:00:00Z', type: 'version_publiee', version_id: 'v2', titre: 'Assurance vie', detail: { relu_par: 'Direction Exemple', numero: 2 } },
    { id: 'e2', survenu_le: '2026-09-02T08:00:00Z', type: 'version_archivee', version_id: 'v0', titre: 'Assurance vie', detail: {} },
    { id: 'e1', survenu_le: '2026-09-01T08:00:00Z', type: 'affectation_creee', version_id: 'v1', titre: 'Le PER', detail: { echeance: '2026-09-10' } },
  ],
  semaines: [
    { semaine: '2026-08-31', temps_actif_s: 1800, xp: 300, sessions: 3 },
    { semaine: '2026-09-07', temps_actif_s: 3600, xp: 800, sessions: 7 },
  ],
  commentaires: [{ id: 'k1', texte: 'Bon rythme, revoir la clause démembrée.', created_at: '2026-09-06T10:00:00Z', auteur: 'Direction Exemple' }],
  temps_actif_s: 3900,
}

const rendre = (profile, props) => renderToStaticMarkup(
  <FicheVue profile={profile} profileId="c1" donnees={donnees} chargement={false} {...props} />,
)

describe('FicheVue', () => {
  it('pose l’en tête avec série, meilleure série, XP total et exercices dus', () => {
    const html = rendre(MANAGER)
    expect(html).toContain('Camille Durand')
    expect(html).toContain('CD · ')
    expect(html).toContain('Retour au pilotage')
    expect(html).toContain('Série en cours')
    expect(html).toContain('>4 jours<')
    expect(html).toContain('Dernière session le 20/09/2026')
    expect(html).toContain('objectif 2 sessions par jour')
    expect(html).toContain('Meilleure série')
    expect(html).toContain('>9 jours<')
    expect(html).toContain('XP total')
    expect(html).toContain('>1450<')
    expect(html).toContain('1 h 05')
    expect(html).toContain('Exercices dus')
    expect(html).toContain('>7<')
    expect(html).not.toContain('Révisions dues')
  })

  it('liste la progression par deck : couronnes, exercices vus, dus, XP, sessions, dernière session, statut, échéance', () => {
    const html = rendre(MANAGER)
    const bloc = html.slice(html.indexOf('Progression par deck'), html.indexOf('>Sessions<'))
    expect(bloc).toContain('2 decks affectés, 1 validé, 1 en retard')
    expect(bloc).toContain('Le PER')
    expect(bloc).toContain('aria-label="1 couronne sur 5"')
    expect(bloc).toContain('aria-label="3 couronnes sur 5"')
    expect(bloc).toContain('badge badge-progress')
    expect(bloc).toContain('>En retard<')
    expect(bloc).toContain('Échéance le 10/09/2026')
    expect(bloc).toContain('10/40 vus')
    expect(bloc).toContain('width:25%')
    expect(bloc).toContain('6 exercices dus')
    expect(bloc).toContain('230 XP · 2 sessions')
    expect(bloc).toContain('Dernière session le 20/09/2026 à 10h05')
    expect(bloc).toContain('badge badge-signed')
    expect(bloc).toContain('Validé le 05/09/2026')
    expect(bloc).toContain('36/36 vus')
    expect(bloc).toContain('1 exercice dû')
    expect(bloc).toContain('25 min de temps actif')
  })

  it('rend les sessions en tableau avec score, XP et durée', () => {
    const html = rendre(MANAGER)
    const bloc = html.slice(html.indexOf('>Sessions<'), html.indexOf('Exercices à consolider'))
    expect(bloc).toContain('2 sessions terminées')
    expect(bloc).toContain('20/09/2026 à 10h05')
    expect(bloc).toContain('9/12')
    expect(bloc).toContain('>110<')
    expect(bloc).toContain('5 min')
    expect(bloc).toContain('12/12')
    expect(bloc).toContain('40 s')
  })

  it('liste les exercices à consolider avec leur force et leur prochaine révision', () => {
    const html = rendre(MANAGER)
    const bloc = html.slice(html.indexOf('Exercices à consolider'), html.indexOf('Frise chronologique'))
    expect(bloc).toContain('Le plafond de déduction du PER se calcule sur ___')
    expect(bloc).toContain('Fiscalité du PER')
    expect(bloc).toContain('1 sur 5')
    expect(bloc).toContain('22/09/2026')
    const sans = renderToStaticMarkup(<FicheVue profile={MANAGER} profileId="c1" donnees={{ ...donnees, items_faibles: [] }} chargement={false} />)
    expect(sans).toContain('Rien à consolider')
  })

  it('rend la frise avec un libellé français par type, du plus récent au plus ancien', () => {
    const html = rendre(MANAGER)
    const libelles = ['Session terminée, 9 sur 12, 110 XP', 'Deck validé, 3 couronnes', 'Nouvelle version publiée (version 2)', 'Version archivée', 'Affectation créée']
    for (const l of libelles) expect(html).toContain(l)
    const positions = libelles.map((l) => html.indexOf(l))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(html).toContain('acp-frise-pastille session_terminee')
    expect(html).toContain('acp-frise-pastille module_valide')
    expect(html).toContain('acp-frise-pastille affectation_creee')
    expect(html).toContain('relu par Direction Exemple')
    expect(html).toContain('échéance le 10/09/2026')
    expect(html).toContain('01/09/2026 à 10h00')
  })

  it('dessine XP et temps actif par semaine en barres CSS, sans chart.js', () => {
    const html = rendre(MANAGER)
    expect(html).toContain('XP et temps actif par semaine')
    expect(html).toContain('Semaine du 31/08')
    expect(html).toContain('Semaine du 07/09')
    expect(html).toContain('width:100%')
    expect(html).toContain('width:50%')
    expect(html).toContain('1 h 00')
    expect(html).toContain('30 min')
    expect(html).toContain('300 XP · 3 sessions')
    expect(html).toContain('800 XP · 7 sessions')
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
    expect(html).toContain('Retour à Aujourd hui')
    expect(html).toContain('Bon rythme, revoir la clause démembrée.')
    expect(html).not.toContain('acp-coaching-texte')
    expect(html).not.toContain('Ajouter le commentaire')
  })

  it('refuse la fiche d’un collègue à un conseiller', () => {
    const html = rendre(COLLEGUE)
    expect(html).toContain('Réservé à la direction')
    expect(html).not.toContain('Camille Durand')
  })

  it('montre les squelettes pendant le chargement et l’erreur en alerte', () => {
    const html = renderToStaticMarkup(<FicheVue profile={MANAGER} profileId="c1" donnees={null} chargement />)
    expect(html).toContain('skeleton')
    expect(html).toContain('Chargement…')
    const enErreur = renderToStaticMarkup(<FicheVue profile={MANAGER} profileId="c1" donnees={null} chargement={false} erreur="Fiche reservee a la direction" />)
    expect(enErreur).toContain('role="alert"')
  })

  it('ne porte aucune donnée de rémunération ni de classement', () => {
    const html = rendre(MANAGER)
    expect(html.toLowerCase()).not.toMatch(/marge|commission|rémunération|classement/)
  })
})
