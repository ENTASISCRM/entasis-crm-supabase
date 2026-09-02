import { describe, it, expect } from 'vitest'
import {
  CHAMPS_CAMPAGNE, POIDS_TOTAL, SITUATIONS_FAMILIALES,
  scoreCompletude, niveauDe, champRempliPour, dateCourte,
  prioriserFichesACompleter, completudeParConseiller, champsLesPlusManquants, champsPourCampagne,
} from './completude'

const TODAY = '2026-09-02'

// Une fiche fictive entièrement remplie ; on retire ce qu'on veut tester.
const complete = (o = {}) => ({
  id: 'c1', nom: 'Camille Exemple', prenom: null, advisor_code: 'DEMO', co_advisor_code: null,
  statut_pro: 'TNS', revenus_annuels: 62000, patrimoine_estime: 180000, date_naissance: '1984-05-12', age: null,
  profession: 'Architecte', situation_familiale: 'Marié', telephone: '06 00 00 00 01', email: 'camille@exemple.fr',
  ...o,
})
const sans = (...cles) => complete(Object.fromEntries(cles.map((c) => [c, null])))
const vide = (o = {}) => ({
  id: 'v1', nom: 'Dominique Modèle', advisor_code: 'DEMO',
  statut_pro: null, revenus_annuels: null, patrimoine_estime: null, date_naissance: null, age: null,
  profession: null, situation_familiale: null, telephone: null, email: null, ...o,
})
const deal = (o) => ({ id: o.id || 'd1', status: 'En cours', advisor_code: 'DEMO', client_id: 'c1', ...o })

describe('CHAMPS_CAMPAGNE', () => {
  it('pèse 12 points : quatre champs à 2, quatre champs à 1', () => {
    expect(POIDS_TOTAL).toBe(12)
    const poids = Object.fromEntries(CHAMPS_CAMPAGNE.map((c) => [c.cle, c.poids]))
    expect(poids).toEqual({
      statut_pro: 2, revenus_annuels: 2, patrimoine_estime: 2, date_naissance: 2,
      profession: 1, situation_familiale: 1, telephone: 1, email: 1,
    })
  })

  it('ne compte pas nb_enfants, 0 par défaut donc non significatif', () => {
    expect(CHAMPS_CAMPAGNE.some((c) => c.cle === 'nb_enfants')).toBe(false)
  })

  it('les situations familiales gardent la valeur écrite par la modale client', () => {
    expect(SITUATIONS_FAMILIALES.map((s) => s.valeur)).toEqual(['Célibataire', 'Marié', 'Pacsé', 'Divorcé', 'Veuf'])
    expect(SITUATIONS_FAMILIALES.find((s) => s.valeur === 'Marié').libelle).toBe('Marié(e)')
  })
})

describe('scoreCompletude', () => {
  it('vaut 100 sur une fiche complète, sans manquant', () => {
    const r = scoreCompletude(complete())
    expect(r.score).toBe(100)
    expect(r.manquants).toEqual([])
    expect(r.niveau).toBe('complete')
  })

  it('retire le poids du champ manquant : un champ à 2 points coûte 17 %', () => {
    expect(scoreCompletude(sans('statut_pro')).score).toBe(83)
    expect(scoreCompletude(sans('profession')).score).toBe(92)
    expect(scoreCompletude(sans('statut_pro', 'revenus_annuels', 'patrimoine_estime')).score).toBe(50)
  })

  it('liste les manquants avec libellé et poids', () => {
    const r = scoreCompletude(sans('revenus_annuels', 'email'))
    expect(r.manquants).toEqual([
      { cle: 'revenus_annuels', libelle: 'Revenus annuels', poids: 2 },
      { cle: 'email', libelle: 'Email', poids: 1 },
    ])
  })

  it('vaut 0 sur une fiche vide ou absente', () => {
    expect(scoreCompletude(vide())).toMatchObject({ score: 0, niveau: 'vide' })
    expect(scoreCompletude(null).manquants).toHaveLength(8)
    expect(scoreCompletude(undefined).score).toBe(0)
  })

  it('une chaîne d’espaces est un champ vide, un montant à 0 est renseigné', () => {
    expect(scoreCompletude(complete({ profession: '   ' })).manquants.map((m) => m.cle)).toEqual(['profession'])
    expect(scoreCompletude(complete({ patrimoine_estime: 0 })).score).toBe(100)
  })
})

describe('niveaux', () => {
  it('complète à 100, presque dès 70, partielle dès 30, à démarrer en dessous', () => {
    expect(niveauDe(100)).toBe('complete')
    expect(niveauDe(99)).toBe('presque')
    expect(niveauDe(70)).toBe('presque')
    expect(niveauDe(69)).toBe('partielle')
    expect(niveauDe(30)).toBe('partielle')
    expect(niveauDe(29)).toBe('vide')
    expect(niveauDe(0)).toBe('vide')
  })

  it('se lit sur une fiche réelle', () => {
    expect(scoreCompletude(sans('statut_pro')).niveau).toBe('presque')
    expect(scoreCompletude(sans('statut_pro', 'revenus_annuels', 'patrimoine_estime')).niveau).toBe('partielle')
    expect(scoreCompletude(vide({ email: 'x@y.fr', telephone: '06' })).niveau).toBe('vide')
  })
})

describe('date de naissance ou âge', () => {
  it('l’âge suffit quand la date de naissance manque', () => {
    const r = scoreCompletude(complete({ date_naissance: null, age: 42 }))
    expect(r.score).toBe(100)
    expect(champRempliPour({ age: 42 }, 'date_naissance')).toBe(true)
  })

  it('un âge à 0 ne remplace rien : c’est la valeur d’un champ vide', () => {
    expect(scoreCompletude(complete({ date_naissance: null, age: 0 })).manquants.map((m) => m.cle)).toEqual(['date_naissance'])
    expect(champRempliPour({ age: '0' }, 'date_naissance')).toBe(false)
  })

  it('la date de naissance suffit sans âge', () => {
    expect(champRempliPour({ date_naissance: '1990-01-01', age: null }, 'date_naissance')).toBe(true)
  })
})

describe('dateCourte', () => {
  it('rend JJ/MM à partir d’un jour ISO ou d’un instant ramené à Paris', () => {
    expect(dateCourte('2026-09-12')).toBe('12/09')
    // 22h30 UTC le 11 septembre, c’est déjà le 12 à Paris.
    expect(dateCourte('2026-09-11T22:30:00+00:00')).toBe('12/09')
    expect(dateCourte(null)).toBe('')
    expect(dateCourte('n’importe quoi')).toBe('')
  })
})

describe('prioriserFichesACompleter', () => {
  const fiches = [
    { ...sans('email'), id: 'rdv', nom: 'Rendez Vous' },
    { ...sans('email'), id: 'signe', nom: 'Signé Récent' },
    { ...sans('email'), id: 'encours', nom: 'En Cours' },
    { ...sans('email'), id: 'autre', nom: 'Sans Rien' },
  ]
  const dossiers = [
    deal({ id: 'r', client_id: 'rdv', status: 'Prévu', date_expected: '2026-09-12T08:30:00+00:00' }),
    deal({ id: 's', client_id: 'signe', status: 'Signé', date_signed: '2026-08-28' }),
    deal({ id: 'e', client_id: 'encours', status: 'En cours' }),
  ]

  it('classe rendez vous à venir, signé récent, en cours, puis les autres', () => {
    const r = prioriserFichesACompleter(fiches, dossiers, { advisorCode: 'DEMO', today: TODAY, limite: 10 })
    expect(r.map((f) => f.id)).toEqual(['rdv', 'signe', 'encours', 'autre'])
    expect(r.map((f) => f.raison)).toEqual(['rendez vous le 12/09', 'signé le 28/08', 'dossier en cours', 'aucun dossier en cours'])
    expect(r.map((f) => f.rang)).toEqual([1, 2, 3, 4])
  })

  it('porte le score, le niveau et les manquants de chaque fiche', () => {
    const [f] = prioriserFichesACompleter(fiches, dossiers, { advisorCode: 'DEMO', today: TODAY })
    expect(f.score).toBe(92)
    expect(f.niveau).toBe('presque')
    expect(f.manquants.map((m) => m.cle)).toEqual(['email'])
  })

  it('respecte la limite, 3 par défaut', () => {
    expect(prioriserFichesACompleter(fiches, dossiers, { advisorCode: 'DEMO', today: TODAY })).toHaveLength(3)
    expect(prioriserFichesACompleter(fiches, dossiers, { advisorCode: 'DEMO', today: TODAY, limite: 1 }).map((f) => f.id)).toEqual(['rdv'])
    expect(prioriserFichesACompleter(fiches, dossiers, { advisorCode: 'DEMO', today: TODAY, limite: Infinity })).toHaveLength(4)
  })

  it('écarte les fiches complètes', () => {
    const r = prioriserFichesACompleter([complete({ id: 'ok' }), sans('email')], [], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((f) => f.id)).toEqual(['c1'])
  })

  it('un rendez vous passé n’est plus « à venir », un signé de plus de 30 jours n’est plus récent', () => {
    const r = prioriserFichesACompleter([
      { ...sans('email'), id: 'vieuxRdv' },
      { ...sans('email'), id: 'vieuxSigne' },
    ], [
      deal({ id: 'a', client_id: 'vieuxRdv', status: 'Prévu', date_expected: '2026-08-20T08:30:00+00:00' }),
      deal({ id: 'b', client_id: 'vieuxSigne', status: 'Signé', date_signed: '2026-07-15' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((f) => f.rang)).toEqual([4, 4])
  })

  it('un signé d’il y a 30 jours exactement compte encore, 31 non plus', () => {
    const r = prioriserFichesACompleter([
      { ...sans('email'), id: 'j30' }, { ...sans('email'), id: 'j31' },
    ], [
      deal({ id: 'a', client_id: 'j30', status: 'Signé', date_signed: '2026-08-03' }),
      deal({ id: 'b', client_id: 'j31', status: 'Signé', date_signed: '2026-08-02' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((f) => [f.id, f.rang])).toEqual([['j30', 2], ['j31', 4]])
  })

  it('au même rang, le rendez vous le plus proche et la signature la plus récente passent devant', () => {
    const r = prioriserFichesACompleter([
      { ...sans('email'), id: 'r2' }, { ...sans('email'), id: 'r1' },
      { ...sans('email'), id: 's2' }, { ...sans('email'), id: 's1' },
    ], [
      deal({ id: 'a', client_id: 'r2', status: 'Prévu', date_expected: '2026-09-20' }),
      deal({ id: 'b', client_id: 'r1', status: 'Prévu', date_expected: '2026-09-05' }),
      deal({ id: 'c', client_id: 's2', status: 'Signé', date_signed: '2026-08-20' }),
      deal({ id: 'd', client_id: 's1', status: 'Signé', date_signed: '2026-08-30' }),
    ], { advisorCode: 'DEMO', today: TODAY, limite: 10 })
    expect(r.map((f) => f.id)).toEqual(['r1', 'r2', 's1', 's2'])
  })

  it('parmi les autres, la fiche la plus vide d’abord', () => {
    const r = prioriserFichesACompleter([
      { ...sans('email'), id: 'presque' },
      vide({ id: 'rien' }),
      { ...sans('statut_pro', 'revenus_annuels'), id: 'moitie' },
    ], [], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((f) => f.id)).toEqual(['rien', 'moitie', 'presque'])
  })

  it('ignore les dossiers annulés et ceux sans client_id', () => {
    const r = prioriserFichesACompleter([sans('email')], [
      deal({ id: 'x', status: 'Prévu', date_expected: '2026-09-12', client_id: null }),
      deal({ id: 'y', status: 'Annulé' }),
    ], { advisorCode: 'DEMO', today: TODAY })
    expect(r[0].rang).toBe(4)
  })

  it('ne rend que les fiches du conseiller, principal ou co conseiller', () => {
    const r = prioriserFichesACompleter([
      { ...sans('email'), id: 'mienne' },
      { ...sans('email'), id: 'autre', advisor_code: 'AUTRE' },
      { ...sans('email'), id: 'partagee', advisor_code: 'AUTRE', co_advisor_code: 'DEMO' },
    ], [], { advisorCode: 'DEMO', today: TODAY })
    expect(r.map((f) => f.id).sort()).toEqual(['mienne', 'partagee'])
  })

  it('rend une liste vide sans code conseiller ou sans fiches', () => {
    expect(prioriserFichesACompleter([sans('email')], [], { today: TODAY })).toEqual([])
    expect(prioriserFichesACompleter(null, null, { advisorCode: 'DEMO', today: TODAY })).toEqual([])
  })
})

describe('completudeParConseiller', () => {
  const fiches = [
    complete({ id: 'a1', advisor_code: 'ALPHA' }),
    { ...sans('statut_pro'), id: 'a2', advisor_code: 'ALPHA' },
    vide({ id: 'b1', advisor_code: 'BETA' }),
    { ...sans('statut_pro', 'revenus_annuels'), id: 'b2', advisor_code: 'BETA' },
    // Partagée : compte pour ALPHA, jamais pour BETA.
    { ...sans('email'), id: 'p1', advisor_code: 'ALPHA', co_advisor_code: 'BETA' },
    vide({ id: 'x', advisor_code: '' }),
  ]

  it('compte les fiches, le score moyen et les complètes par conseiller principal', () => {
    const r = completudeParConseiller(fiches)
    expect(r.map((l) => l.advisorCode)).toEqual(['ALPHA', 'BETA', 'Sans code'])
    const alpha = r[0]
    expect(alpha.fiches).toBe(3)
    expect(alpha.completes).toBe(1)
    expect(alpha.scoreMoyen).toBe(Math.round((100 + 83 + 92) / 3))
    const beta = r[1]
    expect(beta.fiches).toBe(2)
    expect(beta.completes).toBe(0)
    expect(beta.scoreMoyen).toBe(Math.round((0 + 67) / 2))
  })

  it('compte les manquants par champ', () => {
    const r = completudeParConseiller(fiches)
    expect(r[0].manquantsParChamp).toEqual({ statut_pro: 1, email: 1 })
    expect(r[1].manquantsParChamp.statut_pro).toBe(2)
    expect(r[1].manquantsParChamp.revenus_annuels).toBe(2)
    expect(r[1].manquantsParChamp.email).toBe(1)
  })

  it('trie par score moyen décroissant', () => {
    const r = completudeParConseiller([
      vide({ id: '1', advisor_code: 'BAS' }),
      complete({ id: '2', advisor_code: 'HAUT' }),
    ])
    expect(r.map((l) => l.advisorCode)).toEqual(['HAUT', 'BAS'])
  })

  it('rend une liste vide sans fiches', () => {
    expect(completudeParConseiller([])).toEqual([])
    expect(completudeParConseiller(null)).toEqual([])
  })
})

describe('champsLesPlusManquants', () => {
  it('rend les trois champs les plus fréquents, avec libellé', () => {
    const r = champsLesPlusManquants({ email: 1, statut_pro: 9, revenus_annuels: 7, patrimoine_estime: 7, profession: 0 })
    expect(r).toEqual([
      { cle: 'statut_pro', libelle: 'Statut professionnel', nombre: 9 },
      { cle: 'patrimoine_estime', libelle: 'Patrimoine estimé', nombre: 7 },
      { cle: 'revenus_annuels', libelle: 'Revenus annuels', nombre: 7 },
    ])
    expect(champsLesPlusManquants({})).toEqual([])
  })
})

describe('champsPourCampagne', () => {
  const fiches = [
    complete({ id: '1' }),
    { ...sans('statut_pro'), id: '2' },
    { ...sans('statut_pro', 'revenus_annuels'), id: '3' },
    complete({ id: '4', date_naissance: null, age: 51 }),
  ]

  it('compte les fiches évaluables et, pour les autres, chaque champ manquant', () => {
    const r = champsPourCampagne(fiches, ['statut_pro', 'revenus_annuels'])
    expect(r).toEqual({
      total: 4, evaluables: 2, nonEvaluables: 2,
      manquantsParChamp: { statut_pro: 2, revenus_annuels: 1 },
    })
  })

  it('accepte l’âge à la place de la date de naissance', () => {
    const r = champsPourCampagne(fiches, ['date_naissance'])
    expect(r.evaluables).toBe(4)
  })

  it('sans champ requis, toutes les fiches sont évaluables', () => {
    expect(champsPourCampagne(fiches, [])).toEqual({ total: 4, evaluables: 4, nonEvaluables: 0, manquantsParChamp: {} })
  })

  it('accepte une colonne hors liste des champs de campagne', () => {
    const r = champsPourCampagne([{ id: '1', code_postal: '75011' }, { id: '2', code_postal: null }], ['code_postal'])
    expect(r).toMatchObject({ evaluables: 1, nonEvaluables: 1, manquantsParChamp: { code_postal: 1 } })
  })
})
