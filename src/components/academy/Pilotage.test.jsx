import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PilotageVue } from './Pilotage'

// Un jeu fictif, tel que le rendent academy_pilotage et
// academy_matrice_competences en mode entraînement. Noms inventés.
const MANAGER = { id: 'm1', role: 'manager', academy_admin: false, full_name: 'Direction Exemple' }
const ADMIN = { id: 'a1', role: 'advisor', academy_admin: true, full_name: 'Admin Formation' }
const CONSEILLER = { id: 'c1', role: 'advisor', academy_admin: false, full_name: 'Camille Durand' }

const ligne = (o) => ({
  profile_id: 'c1', nom: 'Camille Durand', advisor_code: 'CD', is_active: true, parcours: ['Intégration, 30 jours'],
  decks: [
    { version_id: 'v1', titre: 'Le PER', couronnes: 3, statut: 'valide' },
    { version_id: 'v2', titre: 'Assurance vie', couronnes: 1, statut: 'en_cours' },
  ],
  modules_affectes: 5, modules_valides: 3, modules_en_cours: 1, modules_a_revoir: 0, modules_non_commences: 1,
  retards: 0, serie: 4, xp_7j: 320, xp_periode: 900, sessions_periode: 6,
  derniere_session: '2026-09-20T08:05:00Z', derniere_activite: '2026-09-20T08:05:00Z', temps_actif_s: 3900, items_dus: 7,
  premier_score: { score: 8, total: 12, titre: 'Le PER', le: '2026-09-10T09:00:00Z' },
  dernier_score: { score: 11, total: 12, titre: 'Assurance vie', le: '2026-09-18T10:00:00Z', type: 'session' },
  a_examiner: [], ...o,
})

const donnees = {
  fuseau: 'Europe/Paris', aujourdhui: '2026-09-21', depuis: null, jusqua: null,
  indicateurs: {
    actifs_periode: 12, affectes: 15, obligatoires_validees: 8, obligatoires_total: 20,
    echues_non_validees: 2, echues_total: 6, sessions_periode: 48, serie_moyenne: 2.5, items_dus: 37, temps_actif_s: 7260,
  },
  lignes: [
    ligne(),
    ligne({
      profile_id: 'c2', nom: 'Dominique Modèle', advisor_code: 'DM', parcours: [{ titre: 'Fondamentaux du conseiller' }],
      decks: [], modules_valides: 1, premier_score: null, dernier_score: null, retards: 2, serie: 0, xp_7j: 0, sessions_periode: 0,
      derniere_session: null, derniere_activite: null, temps_actif_s: 0, items_dus: 0,
      a_examiner: ['Session de 12 exercices terminee en 30 s (Le PER)'],
    }),
  ],
  notions: [
    { competence: 'Fiscalité du PER', reponses: 12, correctes: 5, effectif: 5, derniere_le: '2026-09-12T10:00:00Z' },
    { competence: 'Clause bénéficiaire', reponses: 2, correctes: 0, effectif: 1, derniere_le: '2026-09-12T10:00:00Z' },
  ],
  semaines: [{ semaine: '2026-09-14', sessions: 9, xp: 1100, valides: 2, affectations: 3, temps_actif_s: 3600 }],
  scores_competences: [{ competence: 'Fiscalité du PER', type: 'initial', moyenne_pct: 72, effectif: 4, derniere_le: '2026-09-12T10:00:00Z' }],
  definitions: {
    echues: 'Affectations dont l’échéance est passée et non validées ; les affectations sans échéance ne comptent pas.',
    serie: 'Jours consécutifs avec au moins une session terminée, en Europe/Paris.',
  },
}

const matriceD = {
  seuils: {
    acquis: 'trois couronnes ou plus : tous les exercices sus au moins deux fois',
    a_renforcer: 'une ou deux couronnes, ou révisions en retard',
    non_evalue: 'aucune session terminée',
  },
  competences: [
    { version_id: 'v1', competence: 'Fiscalité du PER', titre: 'Le PER', slug: 'per' },
    { version_id: 'v2', competence: 'Clause bénéficiaire', titre: 'Assurance vie', slug: 'av' },
    { version_id: 'v3', competence: 'Régime LMNP', titre: 'Le LMNP', slug: 'lmnp' },
  ],
  lignes: [
    {
      profile_id: 'c1', nom: 'Camille Durand',
      cellules: [
        { version_id: 'v1', couronnes: 3, statut: 'acquis', items_dus: 0, derniere_le: '2026-09-12T10:00:00Z', dernier_pct: 80 },
        { version_id: 'v2', couronnes: 1, statut: 'a_renforcer', items_dus: 4, derniere_le: '2026-05-01T10:00:00Z', dernier_pct: 40 },
        { version_id: 'v3', couronnes: 0, statut: 'non_evalue', items_dus: 0, derniere_le: null, dernier_pct: null },
      ],
    },
  ],
}

const rendre = (props) => renderToStaticMarkup(<PilotageVue profile={MANAGER} donnees={donnees} matriceD={matriceD} chargement={false} {...props} />)

// Les noms figurent aussi dans le sélecteur de collaborateur et dans la
// matrice : pour juger le tableau, on ne regarde que sa tranche.
const tableau = (html) => html.slice(html.indexOf('Par collaborateur'), html.indexOf('Couronnes par collaborateur'))

describe('PilotageVue', () => {
  it('pose l’en tête, le fuseau et le nombre de collaborateurs affectés', () => {
    const html = rendre()
    expect(html).toContain('Formation · pilotage')
    expect(html).toContain('Pilotage des formations')
    expect(html).toContain('Heures en Europe/Paris · 15 collaborateurs affectés')
    expect(html).toContain('role="status"')
  })

  it('écrit les sept indicateurs avec leur dénominateur et leur définition', () => {
    const html = rendre()
    expect(html).toContain('Actifs sur la période')
    expect(html).toContain('12 sur 15')
    expect(html).toContain('Obligatoires validées')
    expect(html).toContain('8 sur 20')
    expect(html).toContain('Échues non validées')
    expect(html).toContain('sur 6 échues')
    expect(html).toContain('Sessions sur la période')
    expect(html).toContain('>48<')
    expect(html).toContain('Série moyenne')
    expect(html).toContain('2,5')
    expect(html).toContain('Exercices dus')
    expect(html).toContain('>37<')
    expect(html).toContain('tout le cabinet')
    expect(html).toContain('Temps actif estimé')
    expect(html).toContain('2 h 01')
    expect(html).toContain('les affectations sans échéance ne comptent pas')
    expect(html).toContain('Jours consécutifs avec au moins une session terminée, en Europe/Paris.')
    expect(html).not.toContain('Réussite au premier essai')
    expect(html).not.toContain('Révisions en attente')
  })

  it('rend le tableau par personne : decks en pastilles avec couronnes, série, XP, sessions, dernière session, dus, retards, faits, actions', () => {
    const html = tableau(rendre())
    expect(html).toContain('Camille Durand')
    expect(html).toContain('>CD<')
    expect(html).toContain('Intégration, 30 jours')
    expect(html).toContain('Fondamentaux du conseiller')
    expect(html).toContain('acp-deck-titre">Le PER<')
    expect(html).toContain('aria-label="3 couronnes sur 5"')
    expect(html).toContain('aria-label="1 couronne sur 5"')
    expect(html).toContain('Le PER · 3 couronnes · Validé')
    expect(html).toContain('3 / 5')
    expect(html).toContain('60 %')
    expect(html).toContain('4 jours')
    expect(html).toContain('>320<')
    expect(html).toContain('>6<')
    expect(html).toContain('20/09/2026 à 10h05')
    expect(html).toContain('1 h 05')
    expect(html).toContain('badge badge-progress">7<')
    expect(html).toContain('badge badge-urgent')
    expect(html).toContain('2 en retard')
    expect(html).toContain('Session de 12 exercices terminee en 30 s (Le PER)')
    expect(html).toContain('Rien à signaler')
    expect(html).toContain('Aucun deck')
    expect(html).toContain('>Aucune<')
    for (const action of ['Fiche', 'Affecter', 'Échéance', 'Relance', 'Exporter en CSV']) expect(html).toContain(action)
    for (const colonne of ['Collaborateur', 'Parcours', 'Decks', 'Validés / affectés', 'Série', 'XP 7 j', 'Sessions', 'Dernière session', 'Temps actif', 'Exercices dus', 'Retards', 'À examiner']) {
      expect(html).toContain(colonne)
    }
    expect(html).toContain('aria-sort=')
    expect(html).not.toContain('Premier score')
    expect(html).not.toContain('Prochaine révision')
  })

  it('trie sur chaque colonne et filtre côté client', () => {
    const parNom = tableau(rendre())
    expect(parNom.indexOf('Camille Durand')).toBeLessThan(parNom.indexOf('Dominique Modèle'))
    for (const cle of ['retards']) {
      const desc = tableau(rendre({ tri: { cle, sens: 'desc' } }))
      expect(desc.indexOf('Dominique Modèle')).toBeLessThan(desc.indexOf('Camille Durand'))
    }
    for (const cle of ['decks', 'modules', 'serie', 'xp_7j', 'sessions_periode', 'derniere_session', 'temps_actif_s', 'items_dus']) {
      const desc = tableau(rendre({ tri: { cle, sens: 'desc' } }))
      expect(desc.indexOf('Camille Durand')).toBeLessThan(desc.indexOf('Dominique Modèle'))
      const asc = tableau(rendre({ tri: { cle, sens: 'asc' } }))
      expect(asc.indexOf('Dominique Modèle')).toBeLessThan(asc.indexOf('Camille Durand'))
    }
    const enRetard = tableau(rendre({ filtres: { collaborateur: '', parcours: '', module: '', statut: 'en_retard' } }))
    expect(enRetard).toContain('Dominique Modèle')
    expect(enRetard).not.toContain('Camille Durand')
    expect(enRetard).toContain('1 sur 2 collaborateurs')
    const parModule = rendre({ filtres: { collaborateur: '', parcours: '', module: 'v1', statut: '' } })
    expect(tableau(parModule)).toContain('Camille Durand')
    expect(tableau(parModule)).not.toContain('Dominique Modèle')
    expect(parModule).toContain('terminé au moins une session sur ce deck')
    const parParcours = tableau(rendre({ filtres: { collaborateur: '', parcours: 'Fondamentaux du conseiller', module: '', statut: '' } }))
    expect(parParcours).toContain('Dominique Modèle')
    expect(parParcours).not.toContain('Camille Durand')
  })

  it('rend la matrice en couronnes avec ses trois statuts, le titre de cellule, la légende des seuils et la mention ancien', () => {
    const html = rendre()
    const matrice = html.slice(html.indexOf('Couronnes par collaborateur'), html.indexOf('Notions à travailler'))
    expect(matrice).toContain('Acquis')
    expect(matrice).toContain('À renforcer (ancien)')
    expect(matrice).toContain('acp-cellule-non')
    expect(matrice).toContain('title="dernier score 80 % le 12/09/2026, 3 couronnes"')
    expect(matrice).toContain('aria-label="0 couronne sur 5"')
    expect(matrice).toContain('aucune session terminée')
    expect(matrice).toContain('trois couronnes ou plus : tous les exercices sus au moins deux fois')
    expect(matrice).toContain('une ou deux couronnes, ou révisions en retard')
    expect(matrice).toContain('dernière session de plus de 90 jours')
    expect(matrice).toContain('Le LMNP')
    expect(matrice).not.toContain('tentative')
  })

  it('liste les notions à partir de trois réponses, taux croissant', () => {
    const html = rendre()
    expect(html).toContain('42 %')
    expect(html).toContain('12 réponses, 5 personnes, dernière le 12/09/2026')
    expect(html).not.toContain('>2 réponses')
    expect(html).not.toContain('acp-notion-nom">Clause bénéficiaire')
  })

  it('propose les périodes rapides et la période libre', () => {
    const html = rendre()
    for (const p of ['7 jours', '30 jours', '90 jours', 'Depuis le début']) expect(html).toContain(p)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('id="acp-depuis"')
    expect(html).toContain('id="acp-jusqua"')
  })

  it('montre les squelettes pendant le chargement et l’erreur en alerte', () => {
    const html = renderToStaticMarkup(<PilotageVue profile={MANAGER} donnees={null} matriceD={null} chargement />)
    expect(html).toContain('skeleton')
    expect(html).toContain('chargement…')
    const enErreur = renderToStaticMarkup(<PilotageVue profile={MANAGER} donnees={null} matriceD={null} chargement={false} erreur="Connexion impossible" />)
    expect(enErreur).toContain('role="alert"')
    expect(enErreur).toContain('Connexion impossible')
  })

  it('ne montre rien à un conseiller sans droit d’administration', () => {
    const html = renderToStaticMarkup(<PilotageVue profile={CONSEILLER} donnees={donnees} matriceD={matriceD} chargement={false} />)
    expect(html).toContain('Réservé à la direction')
    expect(html).not.toContain('Camille Durand')
    const admin = renderToStaticMarkup(<PilotageVue profile={ADMIN} donnees={donnees} matriceD={matriceD} chargement={false} />)
    expect(admin).toContain('Pilotage des formations')
  })

  it('ne porte aucune donnée de rémunération ni de classement', () => {
    const html = rendre()
    expect(html.toLowerCase()).not.toMatch(/marge|commission|rémunération|classement|engagement/)
  })
})
