import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PilotageVue } from './Pilotage'

// Un jeu fictif, tel que le rendent academy_pilotage et
// academy_matrice_competences. Noms inventés.
const MANAGER = { id: 'm1', role: 'manager', academy_admin: false, full_name: 'Direction Exemple' }
const ADMIN = { id: 'a1', role: 'advisor', academy_admin: true, full_name: 'Admin Formation' }
const CONSEILLER = { id: 'c1', role: 'advisor', academy_admin: false, full_name: 'Camille Durand' }

const ligne = (o) => ({
  profile_id: 'c1', nom: 'Camille Durand', advisor_code: 'CD', parcours: ['Intégration, 30 jours'],
  modules_affectes: 5, modules_valides: 3, modules_en_cours: 1, modules_a_revoir: 0, modules_non_commences: 1,
  retards: 0, derniere_activite: '2026-09-20T08:05:00Z', temps_actif_s: 3900,
  premier_score: { score: 4, total: 5, titre: 'Le PER', le: '2026-09-10T09:00:00Z' },
  dernier_score: { score: 5, total: 5, titre: 'Assurance vie', le: '2026-09-18T10:00:00Z', type: 'revision_j7' },
  prochaine_revision: '2026-09-28', revisions_dues: 0, a_examiner: [], ...o,
})

const donnees = {
  fuseau: 'Europe/Paris', aujourdhui: '2026-09-21', depuis: null, jusqua: null,
  indicateurs: {
    actifs_periode: 12, affectes: 15, obligatoires_validees: 8, obligatoires_total: 20,
    echues_non_validees: 2, echues_total: 6, premiere_reussite_num: 9, premiere_reussite_den: 12,
    revisions_en_attente: 3, temps_actif_s: 7260,
  },
  lignes: [
    ligne(),
    ligne({
      profile_id: 'c2', nom: 'Dominique Modèle', advisor_code: 'DM', parcours: [{ titre: 'Fondamentaux du conseiller' }],
      premier_score: null, dernier_score: null, retards: 2, derniere_activite: null, temps_actif_s: 0,
      prochaine_revision: null, a_examiner: ['Quiz de 5 questions soumis en 12 s (Le PER)'],
    }),
  ],
  notions: [
    { competence: 'Fiscalité du PER', reponses: 12, correctes: 5, effectif: 5, derniere_le: '2026-09-12T10:00:00Z' },
    { competence: 'Clause bénéficiaire', reponses: 2, correctes: 0, effectif: 1, derniere_le: '2026-09-12T10:00:00Z' },
  ],
  semaines: [{ semaine: '2026-09-14', valides: 2, affectations: 3, temps_actif_s: 3600 }],
  scores_competences: [{ competence: 'Fiscalité du PER', type: 'initial', moyenne_pct: 72, effectif: 4, derniere_le: '2026-09-12T10:00:00Z' }],
  definitions: { echues: 'Affectations dont l échéance est passée et non validées ; les affectations sans échéance ne comptent pas.' },
}

const matriceD = {
  seuils: { acquis: 'module validé et dernière révision non échouée', a_renforcer: 'dernier quiz sous le seuil', non_evalue: 'aucune tentative soumise' },
  competences: [
    { version_id: 'v1', competence: 'Fiscalité du PER', titre: 'Le PER', slug: 'per' },
    { version_id: 'v2', competence: 'Clause bénéficiaire', titre: 'Assurance vie', slug: 'av' },
    { version_id: 'v3', competence: 'Régime LMNP', titre: 'Le LMNP', slug: 'lmnp' },
  ],
  lignes: [
    {
      profile_id: 'c1', nom: 'Camille Durand',
      cellules: [
        { version_id: 'v1', statut: 'acquis', derniere_le: '2026-09-12T10:00:00Z', dernier_pct: 80 },
        { version_id: 'v2', statut: 'a_renforcer', derniere_le: '2026-05-01T10:00:00Z', dernier_pct: 40 },
        { version_id: 'v3', statut: 'non_evalue', derniere_le: null, dernier_pct: null },
      ],
    },
  ],
}

const rendre = (props) => renderToStaticMarkup(<PilotageVue profile={MANAGER} donnees={donnees} matriceD={matriceD} chargement={false} {...props} />)

// Les noms figurent aussi dans le sélecteur de collaborateur et dans la
// matrice : pour juger le tableau, on ne regarde que sa tranche.
const tableau = (html) => html.slice(html.indexOf('Par collaborateur'), html.indexOf('Compétences par collaborateur'))

describe('PilotageVue', () => {
  it('pose l en tête, le fuseau et le nombre de collaborateurs affectés', () => {
    const html = rendre()
    expect(html).toContain('Formation · pilotage')
    expect(html).toContain('Pilotage des formations')
    expect(html).toContain('Heures en Europe/Paris · 15 collaborateurs affectés')
    expect(html).toContain('role="status"')
  })

  it('écrit chaque indicateur avec son dénominateur', () => {
    const html = rendre()
    expect(html).toContain('12 sur 15')
    expect(html).toContain('8 sur 20')
    expect(html).toContain('75 %')
    expect(html).toContain('9 sur 12')
    expect(html).toContain('2 h 01')
    expect(html).toContain('les affectations sans échéance ne comptent pas')
    expect(html).toContain('Révisions en attente')
  })

  it('écrit Non évalué quand aucune tentative n a été soumise, jamais 0 %', () => {
    const html = rendre()
    expect(html).toContain('Non évalué')
    expect(html).not.toContain('>0 %<')
    const sansTentative = { ...donnees, indicateurs: { ...donnees.indicateurs, premiere_reussite_num: 0, premiere_reussite_den: 0 } }
    const html2 = rendre({ donnees: sansTentative })
    expect(html2).toContain('aucune première tentative')
    expect(html2).not.toContain('>0 %<')
  })

  it('rend le tableau par personne : code, parcours, scores, retards en badge, faits à examiner, actions', () => {
    const html = rendre()
    expect(html).toContain('Camille Durand')
    expect(html).toContain('>CD<')
    expect(html).toContain('Intégration, 30 jours')
    expect(html).toContain('Fondamentaux du conseiller')
    expect(html).toContain('4/5')
    expect(html).toContain('20/09/2026 à 10h05')
    expect(html).toContain('1 h 05')
    expect(html).toContain('28/09/2026')
    expect(html).toContain('badge badge-urgent')
    expect(html).toContain('2 en retard')
    expect(html).toContain('Quiz de 5 questions soumis en 12 s (Le PER)')
    expect(html).toContain('Rien à signaler')
    for (const action of ['Fiche', 'Affecter', 'Échéance', 'Relance', 'Exporter en CSV']) expect(html).toContain(action)
    expect(html).toContain('aria-sort=')
  })

  it('trie et filtre côté client', () => {
    const parNom = tableau(rendre())
    expect(parNom.indexOf('Camille Durand')).toBeLessThan(parNom.indexOf('Dominique Modèle'))
    const parRetards = tableau(rendre({ tri: { cle: 'retards', sens: 'desc' } }))
    expect(parRetards.indexOf('Dominique Modèle')).toBeLessThan(parRetards.indexOf('Camille Durand'))
    const enRetard = tableau(rendre({ filtres: { collaborateur: '', parcours: '', module: '', statut: 'en_retard' } }))
    expect(enRetard).toContain('Dominique Modèle')
    expect(enRetard).not.toContain('Camille Durand')
    expect(enRetard).toContain('1 sur 2 collaborateurs')
    const parModule = rendre({ filtres: { collaborateur: '', parcours: '', module: 'v1', statut: '' } })
    expect(tableau(parModule)).toContain('Camille Durand')
    expect(tableau(parModule)).not.toContain('Dominique Modèle')
    expect(parModule).toContain('au moins une tentative soumise sur ce module')
    const parParcours = tableau(rendre({ filtres: { collaborateur: '', parcours: 'Fondamentaux du conseiller', module: '', statut: '' } }))
    expect(parParcours).toContain('Dominique Modèle')
    expect(parParcours).not.toContain('Camille Durand')
  })

  it('rend la matrice avec ses trois statuts, le titre de cellule et la mention ancien', () => {
    const html = rendre()
    expect(html).toContain('Acquis')
    expect(html).toContain('À renforcer (ancien)')
    expect(html).toContain('acp-cellule-non')
    expect(html).toContain('dernier score 80 % le 12/09/2026')
    expect(html).toContain('aucune tentative soumise')
    expect(html).toContain('module validé et dernière révision non échouée')
    expect(html).toContain('Le LMNP')
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

  it('montre les squelettes pendant le chargement et l erreur en alerte', () => {
    const html = renderToStaticMarkup(<PilotageVue profile={MANAGER} donnees={null} matriceD={null} chargement />)
    expect(html).toContain('skeleton')
    expect(html).toContain('chargement…')
    const enErreur = renderToStaticMarkup(<PilotageVue profile={MANAGER} donnees={null} matriceD={null} chargement={false} erreur="Connexion impossible" />)
    expect(enErreur).toContain('role="alert"')
    expect(enErreur).toContain('Connexion impossible')
  })

  it('ne montre rien à un conseiller sans droit d administration', () => {
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
