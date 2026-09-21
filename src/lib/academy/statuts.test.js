import { describe, it, expect } from 'vitest'
import { ajouterJours } from '../sequences'
import {
  STATUTS, classeBadge, enRetard, libelleEcheance, prochaineAction, progressionPct,
} from './statuts'

const AUJOURDHUI = '2026-09-21'

// Une affectation fictive, telle que la rend academy_mon_parcours.
const aff = (o) => ({
  id: 'a1', version_id: 'v1', slug: 'per', titre: 'Le PER', statut: 'non_commence',
  echeance: null, obligatoire: true, nb_lecons: 3, lecons_terminees: 0,
  prochaine_lecon: { id: 'l1', titre: 'Les bases', ordre: 1 }, valide_le: null, ...o,
})

const rev = (o) => ({
  version_id: 'v9', slug: 'av', titre: 'Assurance vie', type: 'J7', echeance: AUJOURDHUI,
  due: true, resultat: null, tentative_id: null, ...o,
})

describe('STATUTS et classeBadge', () => {
  it('porte les quatre statuts avec leur libellé', () => {
    expect(STATUTS).toEqual({
      non_commence: 'Non commencé', en_cours: 'En cours', a_revoir: 'À revoir', valide: 'Validé',
    })
  })
  it('associe une classe de badge à chaque statut, badge normal par défaut', () => {
    expect(classeBadge('non_commence')).toBe('badge badge-normal')
    expect(classeBadge('en_cours')).toBe('badge badge-progress')
    expect(classeBadge('a_revoir')).toBe('badge badge-high')
    expect(classeBadge('valide')).toBe('badge badge-signed')
    expect(classeBadge('inconnu')).toBe('badge badge-normal')
    expect(classeBadge(undefined)).toBe('badge badge-normal')
  })
})

describe('enRetard', () => {
  it('le jour même de l échéance, ce n est pas encore un retard', () => {
    expect(enRetard(aff({ echeance: AUJOURDHUI }), AUJOURDHUI)).toBe(false)
  })
  it('le lendemain de l échéance, c est un retard', () => {
    expect(enRetard(aff({ echeance: AUJOURDHUI }), ajouterJours(AUJOURDHUI, 1))).toBe(true)
  })
  it('un module validé n est jamais en retard', () => {
    expect(enRetard(aff({ echeance: '2026-01-01', statut: 'valide' }), AUJOURDHUI)).toBe(false)
  })
  it('sans échéance, pas de retard', () => {
    expect(enRetard(aff({ echeance: null, statut: 'en_cours' }), AUJOURDHUI)).toBe(false)
    expect(enRetard(aff({ echeance: '' }), AUJOURDHUI)).toBe(false)
  })
  it('accepte un horodatage et ne garde que le jour', () => {
    expect(enRetard(aff({ echeance: '2026-09-21T10:00:00+00:00' }), AUJOURDHUI)).toBe(false)
    expect(enRetard(aff({ echeance: '2026-09-20T23:59:00+00:00' }), AUJOURDHUI)).toBe(true)
  })
  it('accepte un Date injecté comme date du jour, lu en jour local', () => {
    const lundiSoir = new Date(2026, 8, 21, 23, 30)
    expect(enRetard(aff({ echeance: '2026-09-21' }), lundiSoir)).toBe(false)
    expect(enRetard(aff({ echeance: '2026-09-20' }), lundiSoir)).toBe(true)
    expect(libelleEcheance(aff({ echeance: '2026-09-23' }), lundiSoir)).toBe('À rendre dans 2 jours')
  })
})

describe('libelleEcheance', () => {
  it('rien à dire sans échéance', () => {
    expect(libelleEcheance(aff({ echeance: null }), AUJOURDHUI)).toBe('')
  })
  it('un module validé dit Validé, même avec une échéance dépassée', () => {
    expect(libelleEcheance(aff({ echeance: '2026-01-01', statut: 'valide' }), AUJOURDHUI)).toBe('Validé')
  })
  it('le jour même : à rendre aujourd hui', () => {
    expect(libelleEcheance(aff({ echeance: AUJOURDHUI }), AUJOURDHUI)).toBe('À rendre aujourd hui')
  })
  it('compte les jours restants, au singulier puis au pluriel', () => {
    expect(libelleEcheance(aff({ echeance: '2026-09-22' }), AUJOURDHUI)).toBe('À rendre dans 1 jour')
    expect(libelleEcheance(aff({ echeance: '2026-09-24' }), AUJOURDHUI)).toBe('À rendre dans 3 jours')
  })
  it('compte les jours de dépassement, au singulier puis au pluriel', () => {
    expect(libelleEcheance(aff({ echeance: '2026-09-20' }), AUJOURDHUI)).toBe('Échéance dépassée de 1 jour')
    expect(libelleEcheance(aff({ echeance: '2026-09-11' }), AUJOURDHUI)).toBe('Échéance dépassée de 10 jours')
  })
  it('compte en jours calendaires à travers un changement d heure', () => {
    // Le passage à l heure d hiver (25 octobre 2026) ne fait pas perdre un jour
    expect(libelleEcheance(aff({ echeance: '2026-10-26' }), '2026-10-24')).toBe('À rendre dans 2 jours')
    expect(libelleEcheance(aff({ echeance: '2026-03-28' }), '2026-03-30')).toBe('Échéance dépassée de 2 jours')
  })
})

describe('prochaineAction', () => {
  it('rend null sans rien à faire, ou quand tout est validé', () => {
    expect(prochaineAction({ affectations: [], revisions: [] }, AUJOURDHUI)).toBeNull()
    expect(prochaineAction(null, AUJOURDHUI)).toBeNull()
    expect(prochaineAction({
      affectations: [aff({ statut: 'valide', echeance: '2026-01-01', valide_le: '2026-02-01' })],
      revisions: [rev({ resultat: 'reussie', tentative_id: 't1', due: false })],
    }, AUJOURDHUI)).toBeNull()
  })
  it('une révision due passe avant un module en retard, la plus ancienne d abord', () => {
    const parcours = {
      affectations: [aff({ echeance: '2026-09-01', statut: 'en_cours' })],
      revisions: [
        rev({ version_id: 'v2', titre: 'Le PER', echeance: '2026-09-20', type: 'J30' }),
        rev({ version_id: 'v3', titre: 'Assurance vie', echeance: '2026-09-15', type: 'J7' }),
      ],
    }
    expect(prochaineAction(parcours, AUJOURDHUI)).toEqual({
      type: 'revision', titre: 'Assurance vie', slug: 'av', version_id: 'v3', revisionType: 'J7',
      libelle: 'Faire la révision J+7', bouton: 'Réviser',
    })
  })
  it('une révision non due ne compte pas, on passe au module en retard', () => {
    const parcours = {
      affectations: [aff({ echeance: '2026-09-01', statut: 'en_cours', lecons_terminees: 1, prochaine_lecon: { id: 'l2', titre: 'Les versements', ordre: 2 } })],
      revisions: [rev({ echeance: '2026-09-22', due: false })],
    }
    expect(prochaineAction(parcours, AUJOURDHUI)).toEqual({
      type: 'lecon', id: 'a1', titre: 'Le PER', slug: 'per', version_id: 'v1',
      lecon: { id: 'l2', titre: 'Les versements', ordre: 2 },
      libelle: 'Reprendre la leçon 2 : Les versements', bouton: 'Reprendre',
    })
  })
  it('un module en retard passe avant un module en cours, le plus en retard d abord', () => {
    const parcours = {
      affectations: [
        aff({ id: 'c', echeance: '2026-09-22', statut: 'en_cours' }),
        aff({ id: 'b', echeance: '2026-09-15', statut: 'non_commence' }),
        aff({ id: 'a', echeance: '2026-09-10', statut: 'en_cours', titre: 'Le plus en retard' }),
      ],
      revisions: [],
    }
    expect(prochaineAction(parcours, AUJOURDHUI)).toMatchObject({ type: 'lecon', id: 'a', titre: 'Le plus en retard' })
  })
  it('un module en retard dont toutes les leçons sont finies renvoie au quiz', () => {
    const parcours = {
      affectations: [aff({ echeance: '2026-09-10', statut: 'en_cours', lecons_terminees: 3, prochaine_lecon: null })],
      revisions: [],
    }
    expect(prochaineAction(parcours, AUJOURDHUI)).toEqual({
      type: 'quiz', id: 'a1', titre: 'Le PER', slug: 'per', version_id: 'v1',
      libelle: 'Passer le quiz', bouton: 'Passer le quiz',
    })
  })
  it('un module en cours ou à revoir passe avant un module non commencé, échéance la plus proche d abord', () => {
    const parcours = {
      affectations: [
        aff({ id: 'n', echeance: '2026-09-22', statut: 'non_commence' }),
        aff({ id: 'r', echeance: '2026-10-05', statut: 'a_revoir', lecons_terminees: 3, prochaine_lecon: null }),
        aff({ id: 'e', echeance: '2026-09-30', statut: 'en_cours', lecons_terminees: 2, prochaine_lecon: { id: 'l3', titre: 'La sortie', ordre: 3 } }),
        aff({ id: 's', echeance: null, statut: 'en_cours' }),
      ],
      revisions: [],
    }
    expect(prochaineAction(parcours, AUJOURDHUI)).toMatchObject({
      type: 'lecon', id: 'e', libelle: 'Reprendre la leçon 3 : La sortie',
    })
  })
  it('un module à revoir dont les leçons sont finies renvoie au quiz', () => {
    const parcours = {
      affectations: [aff({ id: 'r', echeance: '2026-10-05', statut: 'a_revoir', lecons_terminees: 3, prochaine_lecon: null })],
      revisions: [],
    }
    expect(prochaineAction(parcours, AUJOURDHUI)).toMatchObject({ type: 'quiz', id: 'r', bouton: 'Passer le quiz' })
  })
  it('entre modules non commencés : échéance la plus proche, puis obligatoire d abord, sans échéance en dernier', () => {
    const parcours = {
      affectations: [
        aff({ id: 'sans', echeance: null, obligatoire: true }),
        aff({ id: 'fac', echeance: '2026-10-01', obligatoire: false }),
        aff({ id: 'obl', echeance: '2026-10-01', obligatoire: true, prochaine_lecon: { id: 'l1', titre: 'Les bases', ordre: 1 } }),
        aff({ id: 'loin', echeance: '2026-11-01', obligatoire: true }),
      ],
      revisions: [],
    }
    expect(prochaineAction(parcours, AUJOURDHUI)).toMatchObject({
      type: 'lecon', id: 'obl', libelle: 'Reprendre la leçon 1 : Les bases', bouton: 'Reprendre',
    })
    expect(prochaineAction({ affectations: [aff({ id: 'sans', echeance: null })], revisions: [] }, AUJOURDHUI))
      .toMatchObject({ id: 'sans' })
  })
})

describe('progressionPct', () => {
  it('rend 0 quand le module n a pas de leçon', () => {
    expect(progressionPct(aff({ nb_lecons: 0, lecons_terminees: 0 }))).toBe(0)
    expect(progressionPct({})).toBe(0)
  })
  it('arrondit à l entier', () => {
    expect(progressionPct(aff({ nb_lecons: 3, lecons_terminees: 1 }))).toBe(33)
    expect(progressionPct(aff({ nb_lecons: 3, lecons_terminees: 2 }))).toBe(67)
    expect(progressionPct(aff({ nb_lecons: 3, lecons_terminees: 3 }))).toBe(100)
  })
  it('un module validé est à 100, quel que soit le compte des leçons', () => {
    expect(progressionPct(aff({ statut: 'valide', nb_lecons: 3, lecons_terminees: 1 }))).toBe(100)
    expect(progressionPct(aff({ statut: 'valide', nb_lecons: 0, lecons_terminees: 0 }))).toBe(100)
  })
})

describe('modulesPubliesDuParcours', () => {
  it('compte les modules du parcours qui ont une version publiée', async () => {
    const { modulesPubliesDuParcours, libelleParcoursAffectable } = await import('./statuts.js')
    const modules = [
      { id: 'a', versions: [{ statut: 'publie' }, { statut: 'brouillon' }] },
      { id: 'b', versions: [{ statut: 'brouillon' }] },
      { id: 'c', versions: [] },
    ]
    const parcours = { titre: 'Intégration', modules: [{ module_id: 'a' }, { module_id: 'b' }, { module_id: 'c' }] }
    expect(modulesPubliesDuParcours(parcours, modules)).toEqual({ publies: 1, total: 3 })
    expect(libelleParcoursAffectable(parcours, modules)).toBe('Intégration (1 module publié sur 3)')
    expect(libelleParcoursAffectable({ titre: 'Vide', modules: [] }, modules)).toBe('Vide (aucun module)')
    expect(libelleParcoursAffectable({ titre: 'Brouillons', modules: [{ module_id: 'b' }] }, modules)).toBe('Brouillons (aucun module publié)')
    expect(libelleParcoursAffectable({ titre: 'Complet', modules: [{ module_id: 'a' }] }, modules)).toBe('Complet (1 module)')
    expect(modulesPubliesDuParcours(null, null)).toEqual({ publies: 0, total: 0 })
  })
})
