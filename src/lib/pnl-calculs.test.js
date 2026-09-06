// Ces totaux sont ceux que Louis lit pour decider. Une erreur de somme lui
// ferait conclure qu une personne est en perte alors qu elle rapporte.

import { describe, it, expect } from 'vitest'
import {
  estGerant, estMandataire, equipe, associes, salaries, mandataires,
  totaux, compteDeResultat, pointDeBascule, cumulerParMois, fmtRatio, fmtMois,
  recetteMensuelleMoyenne, ceQuiManque, chargesParCategorie, aArbitrer, nonEngage,
} from './pnl-calculs'

const ligne = (o = {}) => ({
  type_contrat: o.type || 'CDI',
  est_gerant: o.gerant ?? false,
  commission_encaissee: o.com ?? 0,
  commission_attendue: o.attendu ?? 0,
  cout_fixe: o.salaire ?? 0,
  cout_annexe: o.annexe ?? 0,
  cout_outils: o.outils ?? 0,
  cout_frais_fixes: o.structure ?? 0,
  cout_retrocession: o.retro ?? 0,
  aide_percue: o.aide ?? 0,
  cout_total: (o.salaire ?? 0) + (o.annexe ?? 0) + (o.outils ?? 0)
    + (o.structure ?? 0) + (o.retro ?? 0) - (o.aide ?? 0),
  marge: (o.com ?? 0) - ((o.salaire ?? 0) + (o.annexe ?? 0) + (o.outils ?? 0)
    + (o.structure ?? 0) + (o.retro ?? 0) - (o.aide ?? 0)),
  contrats_signes: o.contrats ?? 0,
  clients_uniques: o.clients ?? 0,
})

describe('separation des populations', () => {
  it('reconnait un mandataire quelle que soit la casse', () => {
    expect(estMandataire({ type_contrat: 'MANDATAIRE' })).toBe(true)
    expect(estMandataire({ type_contrat: 'mandataire' })).toBe(true)
    expect(estMandataire({ type_contrat: 'CDI' })).toBe(false)
    expect(estMandataire({})).toBe(false)
  })

  it('reconnait un gerant par le drapeau comme par le libelle', () => {
    expect(estGerant({ est_gerant: true, type_contrat: 'CDI' })).toBe(true)
    expect(estGerant({ type_contrat: 'GERANT' })).toBe(true)
    expect(estGerant({ type_contrat: 'CDI' })).toBe(false)
  })

  it('partage les lignes sans en perdre aucune', () => {
    const l = [
      ligne({ type: 'CDI' }), ligne({ type: 'MANDATAIRE' }),
      ligne({ type: 'ALTERNANT' }), ligne({ type: 'GERANT', gerant: true }),
    ]
    expect(associes(l)).toHaveLength(1)
    expect(equipe(l)).toHaveLength(3)
    expect(salaries(l)).toHaveLength(2)
    expect(mandataires(l)).toHaveLength(1)
    expect(salaries(l).length + mandataires(l).length).toBe(equipe(l).length)
  })

  it('ne compte jamais un gerant dans les salaries', () => {
    const l = [ligne({ type: 'GERANT', gerant: true, annexe: 64200 })]
    expect(salaries(l)).toHaveLength(0)
    expect(mandataires(l)).toHaveLength(0)
  })
})

describe('totaux', () => {
  it('additionne encaisse, cout et marge', () => {
    const t = totaux([ligne({ com: 10000, salaire: 6000 }), ligne({ com: 5000, salaire: 8000 })])
    expect(t.encaisse).toBe(15000)
    expect(t.cout).toBe(14000)
    expect(t.marge).toBe(1000)
  })

  it('garde l attendu separe de l encaisse', () => {
    const t = totaux([ligne({ com: 10000, attendu: 2500 })])
    expect(t.encaisse).toBe(10000)
    expect(t.attendu).toBe(2500)
    expect(t.marge).toBe(10000)
  })

  it('compte la retrocession comme un cout du signataire', () => {
    const t = totaux([ligne({ type: 'MANDATAIRE', com: 9000, retro: 3000 })])
    expect(t.retrocessions).toBe(3000)
    expect(t.cout).toBe(3000)
    expect(t.marge).toBe(6000)
  })

  it('compte les personnes en perte, celles que Louis doit voir en premier', () => {
    const t = totaux([ligne({ com: 10000, salaire: 6000 }), ligne({ com: 5000, salaire: 8000 })])
    expect(t.enPerte).toBe(1)
  })

  it('donne un ratio de couverture lisible', () => {
    expect(totaux([ligne({ com: 12000, salaire: 6000 })]).ratio).toBe(2)
    expect(fmtRatio(2)).toBe('2.00 pour 1')
  })

  it('ne divise pas par zero quand le cout est nul', () => {
    const t = totaux([ligne({ type: 'MANDATAIRE', com: 5000 })])
    expect(t.ratio).toBeNull()
    expect(fmtRatio(t.ratio)).toBe('sans objet')
    expect(t.marge).toBe(5000)
  })

  it('rend des zeros sur une liste vide plutot que NaN', () => {
    const t = totaux([])
    expect(t.encaisse).toBe(0)
    expect(t.marge).toBe(0)
    expect(t.personnes).toBe(0)
  })
})

describe('compte de resultat du cabinet', () => {
  const jeu = (structureParTete) => [
    ligne({ type: 'GERANT', gerant: true, com: 40000, annexe: 64200 }),
    ligne({ type: 'CDI', com: 30000, salaire: 24000, structure: structureParTete }),
    ligne({ type: 'MANDATAIRE', com: 20000, retro: 8000, structure: structureParTete }),
  ]

  it('empile les postes jusqu au resultat', () => {
    const cr = compteDeResultat(jeu(5000), 20000)
    expect(cr.encaisse).toBe(90000)
    expect(cr.retrocessions).toBe(8000)
    expect(cr.salairesCharges).toBe(24000)
    expect(cr.remunerationAssocies).toBe(64200)
    expect(cr.structure).toBe(20000)
    // 90000 - 8000 - 24000 - 0 - 20000 - 64200
    expect(cr.resultat).toBe(-26200)
  })

  it('ne compte jamais la remuneration des associes comme un cout d equipe', () => {
    const cr = compteDeResultat(jeu(0), 20000)
    expect(cr.salairesCharges).toBe(24000)
    expect(cr.remunerationAssocies).toBe(64200)
  })

  // L invariant qui compte : l interrupteur de repartition deplace des couts
  // entre les personnes, il ne cree ni ne detruit un seul euro pour le cabinet.
  it('donne le meme resultat que les frais fixes soient repartis ou non', () => {
    const reparti = compteDeResultat(jeu(5000), 20000)
    const nonReparti = compteDeResultat(jeu(0), 20000)
    expect(reparti.resultat).toBe(nonReparti.resultat)
    expect(reparti.structure).toBe(nonReparti.structure)
  })

  it('montre la structure que personne ne porte', () => {
    // 20 000 de structure, 10 000 imputes a deux personnes : 10 000 restent
    // sur le dos du cabinet, des postes payes et non occupes toute l annee.
    const cr = compteDeResultat(jeu(5000), 20000)
    expect(cr.structureAllouee).toBe(10000)
    expect(cr.structureNonAbsorbee).toBe(10000)
  })

  it('tolere une liste vide sans rendre NaN', () => {
    const cr = compteDeResultat([], 0)
    expect(cr.resultat).toBe(0)
    expect(cr.structureNonAbsorbee).toBe(0)
  })
})

describe('point de bascule', () => {
  const mois = (coms) => coms.map((c, i) => ({ mois: i + 1, commission: c }))

  it('trouve le mois ou le cumul passe devant les couts', () => {
    // cout annuel 12000, soit 1000 par mois. 500 puis 500 puis 3000 : au
    // troisieme mois le cumul vaut 4000 pour 3000 de cout cumule.
    expect(pointDeBascule(mois([500, 500, 3000]), 12000)).toBe(3)
  })

  it('rend null quand le cabinet ne bascule jamais dans l annee', () => {
    expect(pointDeBascule(mois([100, 100, 100]), 12000)).toBeNull()
  })

  it('rend null sans cout, plutot qu un faux mois 1', () => {
    expect(pointDeBascule(mois([5000]), 0)).toBeNull()
    expect(pointDeBascule([], 12000)).toBeNull()
  })
})

describe('cumul mensuel', () => {
  it('cumule commission et cout sans decrocher', () => {
    const c = cumulerParMois([
      { mois: 1, commission: 1000 }, { mois: 2, commission: 2000 },
    ], 12000)
    expect(c[0].cumulCommission).toBe(1000)
    expect(c[1].cumulCommission).toBe(3000)
    expect(c[1].cumulCout).toBe(2000)
    expect(c[1].cumulMarge).toBe(1000)
  })

  it('tolere un cout annuel absent', () => {
    const c = cumulerParMois([{ mois: 1, commission: 900 }], 0)
    expect(c[0].margeMois).toBe(900)
    expect(Number.isNaN(c[0].cumulCout)).toBe(false)
  })
})

describe('aide a l alternance', () => {
  it('vient en deduction du cout, jamais en recette', () => {
    const t = totaux([ligne({ type: 'ALTERNANT', com: 5000, salaire: 12000, aide: 2000 })])
    expect(t.encaisse).toBe(5000)
    expect(t.aides).toBe(2000)
    expect(t.cout).toBe(10000)
    expect(t.marge).toBe(-5000)
  })

  it('ameliore le resultat du cabinet sans gonfler la recette', () => {
    const sans = compteDeResultat([ligne({ type: 'ALTERNANT', com: 5000, salaire: 12000 })], 0)
    const avec = compteDeResultat([ligne({ type: 'ALTERNANT', com: 5000, salaire: 12000, aide: 2000 })], 0)
    expect(avec.encaisse).toBe(sans.encaisse)
    expect(avec.resultat - sans.resultat).toBe(2000)
  })
})

describe('recette mensuelle moyenne', () => {
  it('ne divise que par les mois qui portent une recette', () => {
    // Trois mois a 3 000 et neuf mois vides : la moyenne est 3 000, pas 750.
    const parMois = Array.from({ length: 12 }, (_, i) => ({ mois: i + 1, commission: i < 3 ? 3000 : 0 }))
    const r = recetteMensuelleMoyenne(parMois)
    expect(r.moyenne).toBe(3000)
    expect(r.moisComptes).toBe(3)
    expect(r.total).toBe(9000)
  })

  it('rend null quand rien n est encaisse, plutot que zero', () => {
    expect(recetteMensuelleMoyenne([{ mois: 1, commission: 0 }])).toBeNull()
    expect(recetteMensuelleMoyenne([])).toBeNull()
  })
})

describe('ce qui manque chaque mois', () => {
  it('dit combien il manque quand la recette ne couvre pas', () => {
    const m = ceQuiManque(28097, 26554)
    expect(m.manque).toBe(1543)
    expect(m.couvert).toBe(false)
    expect(m.ratio).toBeCloseTo(0.945, 3)
  })

  it('rend un manque negatif quand le cabinet couvre ses couts', () => {
    const m = ceQuiManque(28097, 31000)
    expect(m.manque).toBe(-2903)
    expect(m.couvert).toBe(true)
  })

  it('rend null sans cout connu, plutot qu une division par zero', () => {
    expect(ceQuiManque(0, 5000)).toBeNull()
    expect(ceQuiManque(null, 5000)).toBeNull()
  })
})

describe('charges fixes', () => {
  const charges = [
    { categorie: 'LOCAUX', libelle: 'Loyer', montant_mensuel: 2034, actif: true, a_arbitrer: false },
    { categorie: 'OUTILS', libelle: 'Aircall', montant_mensuel: 778.8, actif: true, a_arbitrer: true },
    { categorie: 'OUTILS', libelle: 'Harvest', montant_mensuel: 324, actif: true, a_arbitrer: true },
    { categorie: 'VEHICULE', libelle: 'LOA', montant_mensuel: 1350, actif: false, a_arbitrer: true },
  ]

  it('regroupe par categorie, la plus lourde en premier', () => {
    const g = chargesParCategorie(charges)
    expect(g[0].categorie).toBe('LOCAUX')
    expect(g[1].categorie).toBe('OUTILS')
    expect(g[1].montant).toBeCloseTo(1102.8, 2)
    expect(g[1].aArbitrer).toBeCloseTo(1102.8, 2)
  })

  it('ne compte jamais une charge non engagee dans le total', () => {
    const g = chargesParCategorie(charges)
    expect(g.find((c) => c.categorie === 'VEHICULE')).toBeUndefined()
    expect(nonEngage(charges)).toHaveLength(1)
    expect(nonEngage(charges)[0].libelle).toBe('LOA')
  })

  it('classe les arbitrages du plus cher au moins cher', () => {
    const a = aArbitrer(charges)
    expect(a.map((c) => c.libelle)).toEqual(['Aircall', 'Harvest'])
  })
})

describe('affichage des mois de presence', () => {
  it('rend un entier sans decimale et une fraction avec une virgule', () => {
    expect(fmtMois(12)).toBe('12')
    expect(fmtMois(8.5)).toBe('8,5')
  })
})
