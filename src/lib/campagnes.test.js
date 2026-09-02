import { describe, it, expect } from 'vitest'
import {
  CRITERES_VIDES, CAMPAGNES_PRECONFIGUREES, STATUTS_CIBLE, COLONNES_CSV, CHAMPS_EVALUES,
  ageDe, evaluerCibles, libelleNonEvaluables, criteresActifs, normaliserCriteres, resumeCriteres,
  campagnePreconfiguree, entonnoir, ligneCsv, exportCsv, slugCampagne, regrouperMesCibles,
} from './campagnes'
import { SEUILS } from '../config/multiEquipementRules'
import { SEQUENCES } from '../config/sequencesRelance'

const TODAY = '2026-09-02'

// Des fiches inventées. Aucun nom réel.
const fiche = (o) => ({ id: o.id || 'c1', nom: 'Exemple', prenom: 'Camille', advisor_code: 'DEMO', ...o })
const vue = (client_id, familles) => ({ client_id, familles })
const crit = (o) => ({ ...CRITERES_VIDES, ...o })

describe('ageDe', () => {
  it('calcule depuis la date de naissance, anniversaire pas encore passé', () => {
    expect(ageDe({ date_naissance: '1970-12-25' }, TODAY)).toBe(55)
  })
  it('calcule depuis la date de naissance, anniversaire passé ou le jour même', () => {
    expect(ageDe({ date_naissance: '1970-03-01' }, TODAY)).toBe(56)
    expect(ageDe({ date_naissance: '1970-09-02' }, TODAY)).toBe(56)
  })
  it('préfère la date de naissance au champ age saisi', () => {
    expect(ageDe({ date_naissance: '1990-01-01', age: 12 }, TODAY)).toBe(36)
  })
  it('retombe sur le champ age, puis sur null', () => {
    expect(ageDe({ age: 47 }, TODAY)).toBe(47)
    expect(ageDe({ age: '47' }, TODAY)).toBe(47)
    expect(ageDe({ age: 0 }, TODAY)).toBeNull()
    expect(ageDe({}, TODAY)).toBeNull()
    expect(ageDe(null, TODAY)).toBeNull()
  })
  it('accepte une Date comme jour de référence et une date de naissance horodatée', () => {
    expect(ageDe({ date_naissance: '1980-06-15T00:00:00+00:00' }, new Date(2026, 8, 2))).toBe(46)
  })
})

describe('evaluerCibles, chaque critère', () => {
  it('statut : le bon statut est cible, un autre est exclu, un statut vide est non évaluable', () => {
    const r = evaluerCibles([
      fiche({ id: 'a', statut_pro: 'TNS' }),
      fiche({ id: 'b', statut_pro: 'Salarié' }),
      fiche({ id: 'c', statut_pro: null }),
      fiche({ id: 'd', statut_pro: '' }),
    ], [], crit({ statuts: ['TNS', "Chef d'entreprise"] }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a'])
    expect(r.exclus).toBe(1)
    expect(r.nonEvaluables.statut_pro).toBe(2)
    expect(r.nbNonEvaluables).toBe(2)
    expect(r.total).toBe(4)
  })

  it('statut : la comparaison ignore la casse et les accents', () => {
    const r = evaluerCibles([fiche({ id: 'a', statut_pro: 'profession liberale' })], [],
      crit({ statuts: ['Profession libérale'] }), { today: TODAY })
    expect(r.cibles).toHaveLength(1)
  })

  it('statut : la comparaison ignore l apostrophe et la ponctuation (« Chef d entreprise »)', () => {
    const r = evaluerCibles([
      fiche({ id: 'a', statut_pro: 'Chef d entreprise' }),
      fiche({ id: 'b', statut_pro: "Chef d’entreprise" }),
    ], [], crit({ statuts: ["Chef d'entreprise"] }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a', 'b'])
    expect(r.exclus).toBe(0)
  })

  it('âge : une fourchette saisie à l envers est remise à l endroit', () => {
    expect(normaliserCriteres({ ageMin: 60, ageMax: 40 })).toMatchObject({ ageMin: 40, ageMax: 60 })
    expect(normaliserCriteres({ ageMin: 40, ageMax: 60 })).toMatchObject({ ageMin: 40, ageMax: 60 })
    expect(normaliserCriteres({ ageMin: 50 })).toMatchObject({ ageMin: 50, ageMax: null })
  })

  it('âge : bornes comprises, depuis la date de naissance ou l âge saisi', () => {
    const r = evaluerCibles([
      fiche({ id: 'a', date_naissance: '1976-09-02' }),  // 50 ans aujourd hui
      fiche({ id: 'b', age: 64 }),
      fiche({ id: 'c', age: 65 }),
      fiche({ id: 'd', age: 49 }),
      fiche({ id: 'e' }),
    ], [], crit({ ageMin: 50, ageMax: 64 }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a', 'b'])
    expect(r.exclus).toBe(2)
    expect(r.nonEvaluables.age).toBe(1)
  })

  it('âge : un seul côté de la fourchette suffit', () => {
    const r = evaluerCibles([fiche({ id: 'a', age: 70 }), fiche({ id: 'b', age: 40 })], [],
      crit({ ageMin: 60 }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a'])
    const r2 = evaluerCibles([fiche({ id: 'a', age: 70 }), fiche({ id: 'b', age: 40 })], [],
      crit({ ageMax: 60 }), { today: TODAY })
    expect(r2.cibles.map((c) => c.id)).toEqual(['b'])
  })

  it('revenus : au moins le seuil ; zéro ou vide ne dit rien', () => {
    const r = evaluerCibles([
      fiche({ id: 'a', revenus_annuels: 80000 }),
      fiche({ id: 'b', revenus_annuels: '120000' }),
      fiche({ id: 'c', revenus_annuels: 50000 }),
      fiche({ id: 'd', revenus_annuels: 0 }),
      fiche({ id: 'e', revenus_annuels: null }),
    ], [], crit({ revenusMin: 80000 }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a', 'b'])
    expect(r.exclus).toBe(1)
    expect(r.nonEvaluables.revenus_annuels).toBe(2)
  })

  it('patrimoine : même règle que les revenus', () => {
    const r = evaluerCibles([
      fiche({ id: 'a', patrimoine_estime: 300000 }),
      fiche({ id: 'b', patrimoine_estime: 10000 }),
      fiche({ id: 'c' }),
    ], [], crit({ patrimoineMin: 300000 }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a'])
    expect(r.nonEvaluables.patrimoine_estime).toBe(1)
  })

  it('situation familiale : dans la liste, hors liste, inconnue', () => {
    const r = evaluerCibles([
      fiche({ id: 'a', situation_familiale: 'Marié' }),
      fiche({ id: 'b', situation_familiale: 'Célibataire' }),
      fiche({ id: 'c', situation_familiale: null }),
    ], [], crit({ situations: ['Marié', 'Pacsé'] }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a'])
    expect(r.exclus).toBe(1)
    expect(r.nonEvaluables.situation_familiale).toBe(1)
  })

  it('enfants : zéro est la valeur par défaut, donc inconnu', () => {
    const r = evaluerCibles([
      fiche({ id: 'a', nb_enfants: 2 }),
      fiche({ id: 'b', nb_enfants: 1 }),
      fiche({ id: 'c', nb_enfants: 0 }),
      fiche({ id: 'd', nb_enfants: null }),
    ], [], crit({ enfantsMin: 2 }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a'])
    expect(r.exclus).toBe(1)
    expect(r.nonEvaluables.nb_enfants).toBe(2)
  })

  it('conseillers : le code de la fiche doit être dans la liste', () => {
    const r = evaluerCibles([
      fiche({ id: 'a', advisor_code: 'DEMO' }),
      fiche({ id: 'b', advisor_code: 'TEMO' }),
      fiche({ id: 'c', advisor_code: null }),
    ], [], crit({ conseillers: ['DEMO'] }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a'])
    expect(r.exclus).toBe(2)
    expect(r.nbNonEvaluables).toBe(0)
  })
})

describe('evaluerCibles, les familles', () => {
  const equipement = [vue('a', ['per', 'prevoyance']), vue('b', ['av'])]

  it('famille absente : le client sans la famille est cible, celui qui l a est exclu', () => {
    const r = evaluerCibles([fiche({ id: 'a' }), fiche({ id: 'b' })], equipement,
      crit({ famillesAbsentes: ['prevoyance'] }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['b'])
    expect(r.exclus).toBe(1)
  })

  it('famille présente : il faut toutes les familles demandées', () => {
    const r = evaluerCibles([fiche({ id: 'a' }), fiche({ id: 'b' })], equipement,
      crit({ famillesPresentes: ['per', 'prevoyance'] }), { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a'])
    const r2 = evaluerCibles([fiche({ id: 'a' }), fiche({ id: 'b' })], equipement,
      crit({ famillesPresentes: ['per', 'av'] }), { today: TODAY })
    expect(r2.cibles).toHaveLength(0)
  })

  it('sans ligne de vue, le client n a aucune famille : il est cible d une absence, jamais d une présence', () => {
    const r = evaluerCibles([fiche({ id: 'z' })], equipement, crit({ famillesAbsentes: ['per'] }), { today: TODAY })
    expect(r.cibles).toHaveLength(1)
    expect(r.cibles[0].familles).toEqual([])
    const r2 = evaluerCibles([fiche({ id: 'z' })], equipement, crit({ famillesPresentes: ['per'] }), { today: TODAY })
    expect(r2.cibles).toHaveLength(0)
    expect(r2.nbNonEvaluables).toBe(0)
  })

  it('enrichit chaque cible de ses familles et de son âge', () => {
    const r = evaluerCibles([fiche({ id: 'a', age: 40 })], equipement, CRITERES_VIDES, { today: TODAY })
    expect(r.cibles[0].familles).toEqual(['per', 'prevoyance'])
    expect(r.cibles[0].age).toBe(40)
  })
})

describe('evaluerCibles, les non évaluables', () => {
  it('un client exclu par un critère connu n est pas compté comme non évaluable sur un autre', () => {
    // Salarié sans revenus : la campagne ne le veut pas, quelle que soit sa
    // fiche. Le compter en « revenus inconnus » gonflerait le gisement.
    const r = evaluerCibles([fiche({ id: 'a', statut_pro: 'Salarié', revenus_annuels: null })], [],
      crit({ statuts: ['TNS'], revenusMin: 80000 }), { today: TODAY })
    expect(r.exclus).toBe(1)
    expect(r.nbNonEvaluables).toBe(0)
    expect(r.nonEvaluables.revenus_annuels).toBe(0)
  })

  it('un client compte une fois en tout, mais dans chaque champ vide', () => {
    const r = evaluerCibles([fiche({ id: 'a', statut_pro: null, revenus_annuels: null })], [],
      crit({ statuts: ['TNS'], revenusMin: 80000 }), { today: TODAY })
    expect(r.nbNonEvaluables).toBe(1)
    expect(r.nonEvaluables.statut_pro).toBe(1)
    expect(r.nonEvaluables.revenus_annuels).toBe(1)
    expect(r.cibles).toHaveLength(0)
  })

  it('reproduit le comptage à la main de la direction', () => {
    // 5 fiches : 2 TNS sans prévoyance, 1 TNS avec, 1 salarié, 1 sans statut.
    const fiches = [
      fiche({ id: 'a', statut_pro: 'TNS' }),
      fiche({ id: 'b', statut_pro: "Chef d'entreprise" }),
      fiche({ id: 'c', statut_pro: 'TNS' }),
      fiche({ id: 'd', statut_pro: 'Salarié' }),
      fiche({ id: 'e', statut_pro: null }),
    ]
    const r = evaluerCibles(fiches, [vue('c', ['prevoyance'])], campagnePreconfiguree('prevoyance_tns').criteres, { today: TODAY })
    expect(r.cibles.map((c) => c.id)).toEqual(['a', 'b'])
    expect(r.exclus).toBe(2)
    expect(r.nonEvaluables.statut_pro).toBe(1)
    expect(r.total).toBe(5)
  })

  it('sans aucun critère, tout le monde est cible et rien n est inconnu', () => {
    const r = evaluerCibles([fiche({ id: 'a' }), fiche({ id: 'b' })], [], CRITERES_VIDES, { today: TODAY })
    expect(r.cibles).toHaveLength(2)
    expect(r.nbNonEvaluables).toBe(0)
    expect(Object.values(r.nonEvaluables).every((n) => n === 0)).toBe(true)
  })

  it('tolère des entrées absentes ou partielles', () => {
    expect(evaluerCibles(null, null, null).total).toBe(0)
    expect(evaluerCibles([fiche({ id: 'a', statut_pro: 'TNS' })], undefined, { statuts: ['TNS'] }).cibles).toHaveLength(1)
  })
})

describe('libelleNonEvaluables', () => {
  it('un libellé par champ, tri décroissant, les zéros passés sous silence', () => {
    expect(libelleNonEvaluables({ statut_pro: 308, revenus_annuels: 12, age: 40, patrimoine_estime: 0 }))
      .toBe('statut inconnu sur 308, âge inconnu sur 40, revenus inconnus sur 12')
  })
  it('chaîne vide quand tout est connu', () => {
    expect(libelleNonEvaluables({})).toBe('')
    expect(libelleNonEvaluables(null)).toBe('')
  })
  it('couvre tous les champs évalués', () => {
    const tous = Object.fromEntries(CHAMPS_EVALUES.map(({ champ }, i) => [champ, i + 1]))
    expect(libelleNonEvaluables(tous).split(', ')).toHaveLength(CHAMPS_EVALUES.length)
  })
})

describe('criteresActifs et normaliserCriteres', () => {
  it('rien de posé : inactif ; un seul critère : actif', () => {
    expect(criteresActifs(CRITERES_VIDES)).toBe(false)
    expect(criteresActifs({})).toBe(false)
    expect(criteresActifs({ revenusMin: 1 })).toBe(true)
    expect(criteresActifs({ famillesAbsentes: ['per'] })).toBe(true)
  })
  it('ramène les nombres saisis en texte et écarte les tableaux troués', () => {
    const c = normaliserCriteres({ ageMin: '50', revenusMin: '', statuts: ['TNS', '', null] })
    expect(c.ageMin).toBe(50)
    expect(c.revenusMin).toBeNull()
    expect(c.statuts).toEqual(['TNS'])
    expect(c.famillesPresentes).toEqual([])
  })
})

describe('CAMPAGNES_PRECONFIGUREES', () => {
  it('six campagnes, chacune avec un nom, une accroche, une séquence existante et des critères actifs', () => {
    expect(CAMPAGNES_PRECONFIGUREES).toHaveLength(6)
    for (const c of CAMPAGNES_PRECONFIGUREES) {
      expect(c.nom).toBeTruthy()
      expect(c.accroche).toBeTruthy()
      expect(SEQUENCES[c.sequence_key]).toBeDefined()
      expect(criteresActifs(c.criteres)).toBe(true)
      expect(Object.keys(c.criteres).sort()).toEqual(Object.keys(CRITERES_VIDES).sort())
    }
  })

  it('reprend les seuils des règles du Multi équipement', () => {
    expect(campagnePreconfiguree('per_hauts_revenus').criteres.revenusMin).toBe(SEUILS.revenusFortPotentiel)
    expect(campagnePreconfiguree('scpi').criteres.revenusMin).toBe(SEUILS.revenusScpi)
    expect(campagnePreconfiguree('succession').criteres.patrimoineMin).toBe(SEUILS.patrimoineFortPotentiel)
    expect(campagnePreconfiguree('succession').criteres.ageMin).toBe(60)
    expect(campagnePreconfiguree('retraite').criteres).toMatchObject({ ageMin: 50, ageMax: 64, famillesAbsentes: ['per'] })
  })

  it('prévoyance TNS vise les trois statuts indépendants sans prévoyance', () => {
    const c = campagnePreconfiguree('prevoyance_tns').criteres
    expect(c.statuts).toEqual(['TNS', "Chef d'entreprise", 'Profession libérale'])
    expect(c.famillesAbsentes).toEqual(['prevoyance'])
    const m = campagnePreconfiguree('mutuelle_madelin').criteres
    expect(m.statuts).toEqual(['TNS', 'Profession libérale'])
    expect(m.famillesAbsentes).toEqual(['mutuelle'])
  })

  it('les critères préconfigurés sont figés : charger une campagne ne la modifie pas', () => {
    const c = campagnePreconfiguree('scpi').criteres
    expect(() => { c.famillesAbsentes.push('av') }).toThrow()
    expect(campagnePreconfiguree('inconnue')).toBeNull()
  })
})

describe('resumeCriteres', () => {
  it('décrit les critères posés, avec les libellés des familles', () => {
    const r = resumeCriteres(campagnePreconfiguree('retraite').criteres, { famillesLabels: { per: 'PER' } })
    expect(r).toBe('50 à 64 ans · sans PER')
    expect(resumeCriteres(campagnePreconfiguree('scpi').criteres)).toBe('revenus dès 100 000 € · sans scpi')
    expect(resumeCriteres(CRITERES_VIDES)).toBe('')
  })
})

describe('entonnoir', () => {
  const cibles = [
    { advisor_code: 'DEMO', statut: 'a_contacter' },
    { advisor_code: 'DEMO', statut: 'contacte' },
    { advisor_code: 'DEMO', statut: 'rdv' },
    { advisor_code: 'TEMO', statut: 'signe' },
    { advisor_code: 'TEMO', statut: 'pas_interesse' },
    { advisor_code: null, statut: 'inconnu' },
  ]

  it('compte par statut, un statut inconnu retombe sur à contacter', () => {
    const e = entonnoir(cibles)
    expect(e.total).toBe(6)
    expect(e.parStatut).toEqual({ a_contacter: 2, contacte: 1, rdv: 1, signe: 1, pas_interesse: 1 })
  })

  it('compte par conseiller, le plus chargé d abord', () => {
    const e = entonnoir(cibles)
    expect(e.parConseiller.map((l) => l.advisor_code)).toEqual(['DEMO', 'TEMO', '—'])
    expect(e.parConseiller[0].total).toBe(3)
    expect(e.parConseiller[0].parStatut.rdv).toBe(1)
    expect(e.parConseiller[1].parStatut.signe).toBe(1)
  })

  it('rend des zéros sur une liste vide', () => {
    const e = entonnoir([])
    expect(e.total).toBe(0)
    expect(Object.keys(e.parStatut)).toEqual(STATUTS_CIBLE.map((s) => s.cle))
    expect(e.parConseiller).toEqual([])
  })
})

describe('export CSV', () => {
  const cible = {
    nom: 'Exemple', prenom: 'Camille', telephone: '06 00 00 00 00', email: 'camille@exemple.fr',
    advisor_code: 'DEMO', age: 52, revenus_annuels: 85000.5, patrimoine_estime: 320000,
    familles: ['per', 'av'],
  }

  it('une ligne dans l ordre des colonnes, nombres au format français', () => {
    expect(COLONNES_CSV).toHaveLength(10)
    expect(ligneCsv(cible, { famillesLabels: { per: 'PER' } })).toEqual([
      'Exemple', 'Camille', '06 00 00 00 00', 'camille@exemple.fr', 'DEMO', 'À contacter', '52', '85000,5', '320000', 'PER, av',
    ])
  })

  it('les vides restent vides, le statut de suivi est traduit', () => {
    expect(ligneCsv({ nom: 'Seul', statut: 'rdv' })).toEqual(['Seul', '', '', '', '', 'Rendez vous', '', '', '', ''])
  })

  it('le fichier commence par le BOM, sépare par point virgule et termine les lignes en CRLF', () => {
    const csv = exportCsv([cible])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lignes = csv.slice(1).split('\r\n')
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toBe(COLONNES_CSV.join(';'))
    expect(lignes[1].split(';')[0]).toBe('Exemple')
  })

  it('protège les points virgules, les guillemets et les formules', () => {
    const csv = exportCsv([{ nom: 'Un; deux', prenom: 'Dit "Cam"', telephone: '=1+1' }])
    const ligne = csv.split('\r\n')[1]
    expect(ligne.startsWith('"Un; deux";"Dit ""Cam""";\'=1+1;')).toBe(true)
  })
})

describe('slugCampagne', () => {
  it('retire accents, espaces et ponctuation', () => {
    expect(slugCampagne('Prévoyance TNS')).toBe('prevoyance-tns')
    expect(slugCampagne('  PER · hauts revenus ! ')).toBe('per-hauts-revenus')
    expect(slugCampagne('')).toBe('campagne')
  })
})

describe('regrouperMesCibles', () => {
  const campagneA = { id: 'A', nom: 'Prévoyance TNS', accroche: 'Bonjour', cloturee_at: null, created_at: '2026-09-01T08:00:00Z' }
  const campagneB = { id: 'B', nom: 'SCPI', accroche: '', cloturee_at: null, created_at: '2026-09-02T08:00:00Z' }
  const close = { id: 'C', nom: 'Close', cloturee_at: '2026-08-01T00:00:00Z', created_at: '2026-07-01T08:00:00Z' }

  it('ne garde que les cibles à contacter des campagnes ouvertes, la plus récente d abord', () => {
    const g = regrouperMesCibles([
      { id: '1', campagne_id: 'A', statut: 'a_contacter', campagnes: campagneA, clients: { nom: 'Zed' } },
      { id: '2', campagne_id: 'A', statut: 'a_contacter', campagnes: campagneA, clients: { nom: 'Alpha' } },
      { id: '3', campagne_id: 'A', statut: 'contacte', campagnes: campagneA, clients: { nom: 'Bob' } },
      { id: '4', campagne_id: 'B', statut: 'a_contacter', campagnes: campagneB, clients: { nom: 'Mid' } },
      { id: '5', campagne_id: 'C', statut: 'a_contacter', campagnes: close, clients: { nom: 'Old' } },
    ])
    expect(g.map((x) => x.id)).toEqual(['B', 'A'])
    expect(g[1].nom).toBe('Prévoyance TNS')
    expect(g[1].accroche).toBe('Bonjour')
    expect(g[1].cibles.map((c) => c.id)).toEqual(['2', '1'])
  })

  it('rend une liste vide sans cible', () => {
    expect(regrouperMesCibles([])).toEqual([])
    expect(regrouperMesCibles(null)).toEqual([])
  })
})
