// La retrocession est le deuxieme poste de cout du cabinet et le SEUL cout
// d un mandataire. Une erreur ici fait passer quelqu un de deficitaire a
// rentable, ou l inverse.

import { describe, it, expect } from 'vitest'
import {
  appliquerRetrocessions, cleDe, retrocessionsAnnuelles, MOIS,
  contributionsAnnuelles, repartirRecette,
} from './pnl-retrocessions.js'

const ligne = (o = {}) => ({
  profile_id: o.profile_id ?? null,
  nom: o.nom ?? 'Quelqu un',
  cout_retrocession: o.retro ?? 0,
  cout_total: o.cout ?? 1000,
  marge: o.marge ?? 5000,
})

describe('cle de regroupement', () => {
  it('utilise le profil quand il existe', () => {
    expect(cleDe({ profile_id: 'abc' })).toBe('abc')
  })

  it('retombe sur le nom pour un contrat sans profil', () => {
    // Un alternant qui arrive le mois prochain n a pas encore de compte CRM.
    expect(cleDe({ profile_id: null, full_name: 'MOREL Hyppolite' })).toBe('nom:MOREL Hyppolite')
    expect(cleDe({ nom: 'MOREL Hyppolite' })).toBe('nom:MOREL Hyppolite')
  })
})

describe('application des retrocessions', () => {
  it('ajoute la retrocession du bareme au cout et la retire de la marge', () => {
    const [l] = appliquerRetrocessions(
      [ligne({ profile_id: 'p1', cout: 1000, marge: 5000 })],
      new Map([['p1', { total: 2000 }]]),
    )
    expect(l.cout_retrocession).toBe(2000)
    expect(l.cout_total).toBe(3000)
    expect(l.marge).toBe(3000)
    expect(l.retrocession_source).toBe('bareme')
  })

  it('laisse le bordereau primer sur le bareme, du cash contre un calcul', () => {
    const [l] = appliquerRetrocessions(
      [ligne({ profile_id: 'p1', retro: 1800, cout: 2800, marge: 4200 })],
      new Map([['p1', { total: 2000 }]]),
    )
    expect(l.cout_retrocession).toBe(1800)
    expect(l.cout_total).toBe(2800)
    expect(l.marge).toBe(4200)
    expect(l.retrocession_source).toBe('bordereau')
  })

  it('ne touche a rien quand le bareme ne donne rien', () => {
    const [l] = appliquerRetrocessions([ligne({ profile_id: 'p1' })], new Map())
    expect(l.cout_retrocession).toBe(0)
    expect(l.cout_total).toBe(1000)
    expect(l.retrocession_source).toBe('aucune')
  })

  it('retrouve une personne sans profil par son nom', () => {
    const [l] = appliquerRetrocessions(
      [ligne({ nom: 'MOREL Hyppolite' })],
      new Map([['nom:MOREL Hyppolite', { total: 300 }]]),
    )
    expect(l.cout_retrocession).toBe(300)
    expect(l.retrocession_source).toBe('bareme')
  })

  it('accepte un objet simple autant qu une Map', () => {
    const [l] = appliquerRetrocessions([ligne({ profile_id: 'p1' })], { p1: { total: 500 } })
    expect(l.cout_retrocession).toBe(500)
  })

  it('tolere une liste vide sans rien casser', () => {
    expect(appliquerRetrocessions(null, new Map())).toEqual([])
    expect(appliquerRetrocessions([], null)).toEqual([])
  })
})

describe('calcul annuel', () => {
  const contrat = (o) => ({
    profile_id: o.profile_id, full_name: o.nom, type_contrat: o.type,
    salaire_brut_mensuel: o.salaire ?? 0, actif: true,
    date_debut: o.debut ?? '2026-01-01', date_fin: o.fin ?? null,
    profile: { id: o.profile_id, advisor_code: o.code, full_name: o.nom },
  })

  it('ignore les gerants, deja payes par ailleurs', () => {
    // Leur remuneration passe par Geniopus et Decampius : la recalculer au
    // bareme la compterait deux fois.
    const r = retrocessionsAnnuelles({
      deals: [], annee: 2026,
      contrats: [contrat({ profile_id: 'g1', nom: 'Louis', type: 'GERANT', code: 'LH' })],
    })
    expect(r.get('g1')).toBeUndefined()
  })

  it('rend une carte vide quand il n y a aucun deal', () => {
    const r = retrocessionsAnnuelles({
      deals: [], annee: 2026,
      contrats: [contrat({ profile_id: 'p1', nom: 'Un mandataire', type: 'MANDATAIRE', code: 'XX' })],
    })
    expect(r.size).toBe(0)
  })

  it('tolere des entrees absentes', () => {
    expect(retrocessionsAnnuelles({ annee: 2026 }).size).toBe(0)
  })

  // Le vrai risque de la boucle sur douze mois : quelqu un qui change de
  // contrat en cours d annee ne doit etre compte qu une fois par mois.
  it('ne compte pas deux fois le mois ou la personne change de contrat', () => {
    // Production assez large pour depasser le seuil mensuel de l alternant :
    // le moteur ne verse un variable qu une fois le salaire du mois couvert.
    const deal = (mois, jour) => ({
      id: `d-${mois}`, month: mois, status: 'Signé', product: 'PER Individuel',
      pp_m: 1000, pu: 0, advisor_code: 'XX', co_advisor_code: null,
      advisor_profile_id: 'p1', frais_entree_pct: 1, frais_entree_pp_pct: 1,
      frais_entree_pu_pct: 1, is_ordre_placement: false,
      date_signed: `2026-${jour}`,
    })
    // Alternant jusqu au 17 septembre, mandataire a partir du 18 : deux
    // contrats se touchent dans le meme mois.
    const contrats = [
      contrat({ profile_id: 'p1', nom: 'Bascule', type: 'ALTERNANT', code: 'XX',
        debut: '2026-01-01', fin: '2026-09-17', salaire: 1100 }),
      { ...contrat({ profile_id: 'p1', nom: 'Bascule', type: 'MANDATAIRE', code: 'XX',
        debut: '2026-09-18', fin: null }), actif: false },
    ]
    const unMois = retrocessionsAnnuelles({
      deals: [deal('SEPTEMBRE', '09-20')], contrats, annee: 2026,
    })
    // Un seul deal en septembre : un seul mois porteur, jamais deux.
    expect(unMois.get('p1').moisAvecVariable).toBe(1)

    // Et sur deux mois distincts, deux mois porteurs.
    const deuxMois = retrocessionsAnnuelles({
      deals: [deal('JUIN', '06-10'), deal('SEPTEMBRE', '09-20')], contrats, annee: 2026,
    })
    expect(deuxMois.get('p1').moisAvecVariable).toBe(2)
    expect(deuxMois.get('p1').total).toBeCloseTo(unMois.get('p1').total * 2, 2)
  })

  it('additionne bien douze mois et pas un seul', () => {
    const deals = MOIS.map((m, i) => ({
      id: `d${i}`, month: m, status: 'Signé', product: 'PER Individuel',
      pp_m: 100, pu: 0, advisor_code: 'YY', advisor_profile_id: 'p2',
      frais_entree_pct: 1, frais_entree_pp_pct: 1, frais_entree_pu_pct: 1,
      is_ordre_placement: false, date_signed: `2026-${String(i + 1).padStart(2, '0')}-10`,
    }))
    const r = retrocessionsAnnuelles({
      deals,
      contrats: [contrat({ profile_id: 'p2', nom: 'Toute l annee', type: 'MANDATAIRE', code: 'YY' })],
      annee: 2026,
    })
    expect(r.get('p2').moisAvecVariable).toBe(12)
    // PER a 100 par mois, annualise 1 200, au taux mandataire frais + 10 soit
    // 11 pour cent : 132 par mois, 1 584 sur l annee.
    expect(r.get('p2').total).toBeCloseTo(1584, 2)
  })
})

describe('attribution vivante depuis le CRM', () => {
  const deal = (o) => ({
    id: o.id, status: o.status ?? 'Signé', date_signed: o.date ?? '2026-06-10',
    month: 'JUIN', product: 'PER Individuel', pp_m: o.pp ?? 1000, pu: 0,
    advisor_code: o.a, co_advisor_code: o.co ?? null, advisor_profile_id: o.pid ?? null,
    frais_entree_pct: 1, frais_entree_pp_pct: 1, frais_entree_pu_pct: 1,
    is_ordre_placement: false,
  })
  const ct = (code, id) => ({
    profile_id: id, full_name: code, type_contrat: 'MANDATAIRE',
    salaire_brut_mensuel: 0, actif: true, date_debut: '2026-01-01', date_fin: null,
    profile: { id, advisor_code: code, full_name: code, is_active: true },
  })

  it('partage une affaire en co a moitie entre les deux', () => {
    const c = contributionsAnnuelles({
      deals: [deal({ id: 'd1', a: 'AA', co: 'BB' })],
      contrats: [ct('AA', 'a'), ct('BB', 'b')], annee: 2026,
    })
    expect(c.get('a').valeur).toBeCloseTo(c.get('b').valeur, 6)
    expect(c.get('a').enCo).toBe(1)
    expect(c.get('b').enCo).toBe(1)
  })

  it('donne tout au signataire quand il n y a pas de co', () => {
    const c = contributionsAnnuelles({
      deals: [deal({ id: 'd1', a: 'AA' })],
      contrats: [ct('AA', 'a'), ct('BB', 'b')], annee: 2026,
    })
    expect(c.get('a').valeur).toBeGreaterThan(0)
    expect(c.get('a').enCo).toBe(0)
    expect(c.get('b')).toBeUndefined()
  })

  it('ignore une affaire non signee et une affaire d une autre annee', () => {
    const c = contributionsAnnuelles({
      deals: [
        deal({ id: 'd1', a: 'AA', status: 'Prévu' }),
        deal({ id: 'd2', a: 'AA', date: '2025-06-10' }),
      ],
      contrats: [ct('AA', 'a')], annee: 2026,
    })
    expect(c.size).toBe(0)
  })

  it('repartit la recette reelle au prorata, sans en creer ni en perdre', () => {
    const contributions = new Map([['a', { valeur: 300, dossiers: 3, enCo: 1 }],
                                   ['b', { valeur: 100, dossiers: 1, enCo: 1 }]])
    const lignes = [
      { profile_id: 'a', cout_total: 10000, marge: 0 },
      { profile_id: 'b', cout_total: 5000, marge: 0 },
    ]
    const out = repartirRecette(lignes, contributions, 40000)
    expect(out[0].commission_encaissee).toBe(30000)
    expect(out[1].commission_encaissee).toBe(10000)
    expect(out[0].commission_encaissee + out[1].commission_encaissee).toBe(40000)
    expect(out[0].marge).toBe(20000)
    expect(out[0].contrats_signes).toBe(3)
    expect(out[0].dossiers_en_co).toBe(1)
  })

  it('n invente aucune recette quand la banque n a rien donne', () => {
    const out = repartirRecette(
      [{ profile_id: 'a', cout_total: 10000, marge: -10000 }],
      new Map([['a', { valeur: 300, dossiers: 3, enCo: 0 }]]), 0,
    )
    expect(out[0].commission_encaissee).toBeUndefined()
    expect(out[0].part_production).toBe(0)
  })

  it('ne divise pas par zero quand personne n a produit', () => {
    const out = repartirRecette([{ profile_id: 'a', cout_total: 1000, marge: 0 }], new Map(), 50000)
    expect(out[0].part_production).toBe(0)
  })
})
