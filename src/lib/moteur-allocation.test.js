import { describe, it, expect } from 'vitest'
import {
  estVerrouille,
  proposerInflexions,
  appliquerPropositions,
  candidatsRemplacement,
} from './moteur-allocation'
import {
  FAMILLES,
  INCLINAISONS,
  REGIMES,
  REGIME_COURANT,
  VERROUS,
  familleDuSupport,
} from '../config/conjoncture'

// ────────────────────────────────────────────────────────────────────────────
// Univers de test. Les supports sont repris des deux listes d’assureurs avec
// leur catégorie, leur SRI, leurs frais et leurs performances tels qu’elles les
// publient : c’est cette typographie là que les motifs doivent savoir lire.
//
// Une seule ligne est construite pour le test, le fonds dédié souverain. Aucune
// des 84 catégories SwissLife ni des 5 catégories Abeille ne se déclare
// souveraine, alors que deux inclinaisons de la note visent cette famille : le
// cas ne peut donc être atteint que par le libellé du support.
// ────────────────────────────────────────────────────────────────────────────

const SUPPORTS_SWISSLIFE = [
  { isin: 'FR0010540385', nom: 'SLF (F) ESG Money Market Euro P', categorie: 'Monétaire EUR', sri: 1, fraisGestionMax: 0.6, perfNetteAn: 1.97, perfNette5AnsAnnualisee: 1.63 },
  { isin: 'FR0011630557', nom: 'Amundi Euro Liquidity Select P C', categorie: 'Monétaire EUR', sri: 1, fraisGestionMax: 0.5, perfNetteAn: 2.13, perfNette5AnsAnnualisee: 1.59 },
  { isin: 'FR001400SR03', nom: 'SLF (France) Eq ESG USA Low Carb P', categorie: 'Actions US Grandes Capitalisations Mixte', sri: 5, fraisGestionMax: 2.55, perfNetteAn: 1.42 },
  { isin: 'LU1055220450', nom: 'Swiss Life (LUX) Equity USA R USD Cap', categorie: 'Actions US Grandes Capitalisations Mixte', sri: 4, fraisGestionMax: 1.5, perfNetteAn: 2.04, perfNette5AnsAnnualisee: 12.62 },
  { isin: 'FR0007005764', nom: 'BSO Bio Santé C', categorie: 'Secteur Santé', sri: 4, fraisGestionMax: 2, perfNetteAn: 13, perfNette5AnsAnnualisee: 3.22 },
  { isin: 'FR00140052N5', nom: 'Silver Autonomie R', categorie: 'Secteur Santé', sri: 4, fraisGestionMax: 2.2, perfNetteAn: 2.55 },
  { isin: 'LU0171305526', nom: 'BGF World Gold A2', categorie: 'Secteur Métaux Précieux', sri: 6, fraisGestionMax: 1.75, perfNetteAn: 129.53, perfNette5AnsAnnualisee: 19.49 },
  { isin: 'FR0007390174', nom: 'CM-AM Global Gold RC', categorie: 'Secteur Métaux Précieux', sri: 5, fraisGestionMax: 2, perfNetteAn: 119.74, perfNette5AnsAnnualisee: 20.59 },
  { isin: 'FR0011170182', nom: 'Ofi Invest Precious Metals R', categorie: 'Secteur Métaux Précieux', sri: 5, fraisGestionMax: 1.5, perfNetteAn: 90.88, perfNette5AnsAnnualisee: 9.83 },
  { isin: 'FR0007001581', nom: 'R-co Gold Mining C', categorie: 'Secteur Métaux Précieux', sri: 5, fraisGestionMax: 1.65, perfNetteAn: 122.22, perfNette5AnsAnnualisee: 21.48 },
  { isin: 'LU0171301533', nom: 'BGF World Energy A2', categorie: 'Secteur Énergie', sri: 5, fraisGestionMax: 1.75, perfNetteAn: -3.53, perfNette5AnsAnnualisee: 18.87 },
  { isin: 'FR0013358793', nom: 'Athymis Industrie 4.0 P', categorie: 'Secteur Technologies', sri: 4, fraisGestionMax: 1.8, perfNetteAn: 10.86, perfNette5AnsAnnualisee: 9.36 },
  { isin: 'LU2181906426', nom: 'Sycomore Fund Sustainable Tech RC EUR', categorie: 'Secteur Technologies', sri: 5, fraisGestionMax: 2, perfNetteAn: 13.22, perfNette5AnsAnnualisee: 10.86 },
  { isin: 'FR0010188383', nom: 'Amundi Actions Emergents P C', categorie: 'Actions Marchés Emergents', sri: 4, fraisGestionMax: 2.03, perfNetteAn: 17.17, perfNette5AnsAnnualisee: 3.87 },
  { isin: 'FR0000973711', nom: 'Valfrance P', categorie: 'Actions France Grandes Capitalisations', sri: 4, fraisGestionMax: 1.79, perfNetteAn: 17.7, perfNette5AnsAnnualisee: 7.54 },
  { isin: 'LU0935222900', nom: 'Ostrum Euro Inflation R/A EUR', categorie: 'Obligations Indexées Inflation EUR', sri: 2, fraisGestionMax: 0.6, perfNetteAn: 2.18, perfNette5AnsAnnualisee: 1.73 },
  { isin: 'FR0010135103', nom: 'Carmignac Patrimoine A EUR Acc', categorie: 'Mixtes EUR Equilibrés', sri: 3, fraisGestionMax: 1.5, perfNetteAn: 12.12, perfNette5AnsAnnualisee: 1.96 },
  { isin: 'FR0000000000', nom: 'Fonds dédié Souverain Euro 10 ans et plus', categorie: 'Fonds Dédiés/Réservés', sri: 3, fraisGestionMax: 0.9, perfNetteAn: 0.4 },
]

// Le support est encore dans la liste des supports et déjà annoncé sortant :
// les deux tableaux se recoupent sur cinq lignes dans le fichier de juin 2026.
const SORTIES_SWISSLIFE = [
  { isin: 'LU2181906426', nom: 'Sycomore Fund Sustainable Tech RC EUR', motif: 'Retraits dans le cadre de Value For Money' },
]

const SUPPORTS_ABEILLE = [
  { isin: 'FR001400KPY6', nom: 'Ofi Invest ESG Liquidités A (ex Ofi Invest ISR Monétaire A)', categorie: 'Monétaire', sri: 1 },
  { isin: 'LU1863263346', nom: 'DWS Invest - DWS Invest Artificial Intelligence LC', categorie: 'Actions', sri: 5 },
  { isin: 'LU1213836080', nom: 'Fidelity Funds - Global Technology Fund A-Acc-EUR', categorie: 'Actions', sri: 5 },
  { isin: 'LU1279334210', nom: 'Pictet - Robotics P', categorie: 'Actions', sri: 5 },
  { isin: 'FR0012336683', nom: 'Amundi Actions Or P-C', categorie: 'Actions', sri: 5 },
  { isin: 'FR0000284689', nom: 'Comgest Monde C', categorie: 'Actions', sri: 4 },
]

const faireUnivers = (supports, sorties = []) => ({
  supports,
  sorties,
  parIsin: new Map(supports.map((s) => [s.isin, s])),
})

const univers = faireUnivers(SUPPORTS_SWISSLIFE, SORTIES_SWISSLIFE)
const universAbeille = faireUnivers(SUPPORTS_ABEILLE)

// Un pôle de test qui promène le moteur sur tous les cas : ce qui s’allège, ce
// qui se renforce, ce qui ne bouge pas, ce qui est verrouillé et ce que
// l’univers ne connaît pas.
const LIGNES = [
  { fonds: 'SLF (France) Eq ESG USA Low Carb P', isin: 'FR001400SR03', poids: 10 },
  { fonds: 'Athymis Industrie 4.0 P', isin: 'FR0013358793', poids: 12.5 },
  { fonds: 'BSO Bio Santé C', isin: 'FR0007005764', poids: 6 },
  { fonds: 'BGF World Gold A2', isin: 'LU0171305526', poids: 5 },
  { fonds: 'BGF World Energy A2', isin: 'LU0171301533', poids: 5 },
  { fonds: 'Carmignac Patrimoine A EUR Acc', isin: 'FR0010135103', poids: 20 },
  { fonds: 'Amundi Euro Liquidity Select P C', isin: 'FR0011630557', poids: 8 },
  { fonds: 'Valfrance P', isin: 'FR0000973711', poids: 1 },
  { fonds: 'Amundi Actions Emergents P C', isin: 'FR0010188383', poids: 4 },
  { fonds: 'Fonds dédié Souverain Euro 10 ans et plus', isin: 'FR0000000000', poids: 6 },
  { fonds: 'Ostrum Euro Inflation R/A EUR', isin: 'LU0935222900', poids: 3 },
  { fonds: 'Un fonds absent de la liste juin 2026', isin: 'FR9999999999', poids: 5 },
]

const total = (lignes) => Math.round(lignes.reduce((s, l) => s + l.poids, 0) * 10) / 10
const parIsin = (propositions) => new Map(propositions.map((p) => [p.isin, p]))

describe('estVerrouille', () => {
  it('verrouille le pôle prudent Abeille et lui seul', () => {
    expect(estVerrouille('ab-prudent')).toBe(true)
    expect(estVerrouille('ab-dynamique')).toBe(false)
    expect(estVerrouille('sl-equilibre-dynamique')).toBe(false)
    expect(estVerrouille('sl-offensif-diversifie')).toBe(false)
    expect(estVerrouille(undefined)).toBe(false)
  })

  it('la liste des pôles intouchables est gelée', () => {
    expect(Object.isFrozen(VERROUS)).toBe(true)
    expect(Object.isFrozen(VERROUS.polesIntouchables)).toBe(true)
    expect(VERROUS.polesIntouchables).toContain('ab-prudent')
  })
})

describe('proposerInflexions, verrou 1 : le pôle prudent Abeille', () => {
  it('ne propose rien sur ab-prudent, alors que les mêmes lignes bougent ailleurs', () => {
    const surAbeillePrudent = proposerInflexions({ poleId: 'ab-prudent', lignes: LIGNES, univers })
    expect(surAbeillePrudent).toEqual([])

    const surUnAutrePole = proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: LIGNES, univers })
    expect(surUnAutrePole.length).toBeGreaterThan(0)
  })

  it('ne propose rien sur ab-prudent même en forçant le régime', () => {
    expect(proposerInflexions({
      poleId: 'ab-prudent',
      lignes: LIGNES,
      regime: 'inflation_persistante',
      univers,
    })).toEqual([])
  })
})

describe('proposerInflexions, ce qui bouge', () => {
  const propositions = proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: LIGNES, univers })
  const proposition = parIsin(propositions)

  it('allège de deux points ce que la note allège moyennement', () => {
    expect(proposition.get('FR001400SR03')).toMatchObject({
      famille: 'actions_us', sens: 'alleger', ampleur: 'moyenne', delta: -2, poids: 10, poidsPropose: 8,
    })
    expect(proposition.get('FR0010188383')).toMatchObject({ famille: 'emergents', delta: -2, poidsPropose: 2 })
  })

  it('renforce d’un point ce que la note renforce légèrement, de deux ce qu’elle renforce moyennement', () => {
    expect(proposition.get('FR0007005764')).toMatchObject({
      famille: 'sante', sens: 'renforcer', ampleur: 'legere', delta: 1, poidsPropose: 7,
    })
    expect(proposition.get('LU0935222900')).toMatchObject({ famille: 'inflation', delta: 1, poidsPropose: 4 })
    expect(proposition.get('LU0171305526')).toMatchObject({
      famille: 'metaux_precieux', sens: 'renforcer', ampleur: 'moyenne', delta: 2, poidsPropose: 7,
    })
  })

  it('rend les poids à la décimale, sans traîne de virgule flottante', () => {
    expect(proposition.get('FR0013358793')).toMatchObject({ poids: 12.5, delta: -2, poidsPropose: 10.5 })
  })

  it('ne propose jamais plus que la borne de son ampleur', () => {
    for (const p of propositions) {
      expect(Math.abs(p.delta)).toBeLessThanOrEqual(VERROUS.pointsParAmpleur[p.ampleur])
      expect(Math.abs(p.delta)).toBeLessThanOrEqual(3)
    }
  })

  it('porte le pourquoi et les sources de l’inclinaison sur chaque proposition', () => {
    for (const p of propositions) {
      expect(typeof p.pourquoi).toBe('string')
      expect(p.pourquoi.length).toBeGreaterThan(80)
      expect(Array.isArray(p.sources)).toBe(true)
      expect(p.sources.length).toBeGreaterThan(0)
    }
  })

  it('suit l’ordre des lignes reçues, pour se lire en face du tableau', () => {
    const rangDansLesLignes = propositions.map((p) => LIGNES.findIndex((l) => l.isin === p.isin))
    expect(rangDansLesLignes).toEqual([...rangDansLesLignes].sort((a, b) => a - b))
  })
})

describe('proposerInflexions, ce qui ne bouge pas', () => {
  const propositions = proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: LIGNES, univers })
  const proposition = parIsin(propositions)

  it('ne propose rien sur un maintenir, même de forte ampleur', () => {
    // L’énergie est un maintenir assumé dans la note : renforcer sur un Brent
    // à 95 dollars serait exactement ce qu’elle déconseille.
    expect(proposition.has('LU0171301533')).toBe(false)

    // Aucune famille dont toutes les inclinaisons disent maintenir ne produit
    // quoi que ce soit, quelle que soit son ampleur. Deux entrées maintenir de
    // la note sont d’ampleur forte : elles ne bougent pas pour autant.
    const toutes = INCLINAISONS[REGIME_COURANT.cle]
    const famillesQuiNeBougentPas = [...new Set(toutes.map((i) => i.famille))].filter(
      (famille) => famille && toutes.filter((i) => i.famille === famille).every((i) => i.sens === 'maintenir'),
    )
    expect(famillesQuiNeBougentPas).toContain('energie')
    expect(toutes.some((i) => i.sens === 'maintenir' && i.ampleur === 'forte')).toBe(true)
    for (const famille of famillesQuiNeBougentPas) {
      expect(propositions.filter((p) => p.famille === famille)).toEqual([])
    }
  })

  it('ne propose rien sur une famille qu’aucune inclinaison ne vise', () => {
    expect(proposition.has('FR0010135103')).toBe(false)
  })

  it('verrou 2 : ne propose rien sur un monétaire, un fonds euro ou un fonds d’attente', () => {
    expect(VERROUS.famillesIntouchables).toContain('monetaire_attente')
    expect(proposition.has('FR0011630557')).toBe(false)
    for (const p of propositions) expect(VERROUS.famillesIntouchables).not.toContain(p.famille)
  })

  it('ne propose rien sur un support que l’univers ne connaît pas', () => {
    expect(proposition.has('FR9999999999')).toBe(false)
  })

  it('ne propose rien sans univers, plutôt que de deviner la famille sur le nom du fonds', () => {
    expect(proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: LIGNES })).toEqual([])
    expect(proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: LIGNES, univers: {} })).toEqual([])
  })

  it('ne propose rien pour un régime sans inclinaison documentée', () => {
    for (const cle of ['expansion', 'ralentissement', 'stress', 'reprise']) {
      expect(proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: LIGNES, regime: cle, univers })).toEqual([])
    }
  })

  it('tolère une allocation vide ou un appel sans argument', () => {
    expect(proposerInflexions()).toEqual([])
    expect(proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: [], univers })).toEqual([])
  })
})

describe('proposerInflexions, le plancher à zéro', () => {
  const propositions = proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: LIGNES, univers })
  const proposition = parIsin(propositions)

  it('rabote le mouvement au lieu de passer sous zéro, et rend le mouvement réel', () => {
    // Valfrance pèse 1 point et la France s’allège d’un point de plus que ça :
    // la ligne sort, elle ne passe pas à moins un.
    expect(proposition.get('FR0000973711')).toMatchObject({ poids: 1, delta: -1, poidsPropose: 0 })
  })

  it('ne propose pas un mouvement nul sur une ligne déjà à zéro', () => {
    const surZero = proposerInflexions({
      poleId: 'sl-offensif-diversifie',
      lignes: [{ fonds: 'Valfrance P', isin: 'FR0000973711', poids: 0 }],
      univers,
    })
    expect(surZero).toEqual([])
  })

  it('aucun poids proposé n’est négatif, sur aucune ligne', () => {
    const surDesMiettes = proposerInflexions({
      poleId: 'sl-offensif-diversifie',
      lignes: LIGNES.map((l) => ({ ...l, poids: 0.5 })),
      univers,
    })
    for (const p of surDesMiettes) expect(p.poidsPropose).toBeGreaterThanOrEqual(0)
  })
})

describe('proposerInflexions, deux inclinaisons sur la même famille', () => {
  it('retient la plus forte et n’additionne pas les points', () => {
    // La note du 04/09/2026 allège deux fois les souverains, la duration longue
    // et la dette française, toutes deux d’ampleur moyenne. Le mouvement reste
    // de deux points, pas de quatre : la borne est par famille.
    const souveraines = INCLINAISONS[REGIME_COURANT.cle].filter((i) => i.famille === 'oblig_souverain')
    expect(souveraines.length).toBe(2)

    const propositions = proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: LIGNES, univers })
    const surLeSouverain = propositions.filter((p) => p.famille === 'oblig_souverain')
    expect(surLeSouverain.length).toBe(1)
    expect(surLeSouverain[0]).toMatchObject({ poids: 6, delta: -2, poidsPropose: 4 })
  })
})

describe('appliquerPropositions', () => {
  const propositions = proposerInflexions({ poleId: 'sl-offensif-diversifie', lignes: LIGNES, univers })
  const apres = appliquerPropositions(LIGNES, propositions)

  it('verrou 3 : ne normalise jamais le total', () => {
    // Ni avant ni après le total ne vaut 100 %, et le moteur n’y touche pas.
    // La remise à 100 % reste le geste explicite de l’écran.
    expect(total(LIGNES)).toBe(85.5)
    expect(total(apres)).toBe(80.5)
    expect(total(apres)).not.toBe(100)
    expect(VERROUS.normalisationAutomatique).toBe(false)
  })

  it('ne touche qu’aux lignes qui portent une proposition', () => {
    const avant = new Map(LIGNES.map((l) => [l.isin, l.poids]))
    for (const ligne of apres) {
      const attendu = parIsin(propositions).get(ligne.isin)
      expect(ligne.poids).toBe(attendu ? attendu.poidsPropose : avant.get(ligne.isin))
    }
  })

  it('garde la ligne tombée à zéro au lieu de la supprimer', () => {
    expect(apres).toHaveLength(LIGNES.length)
    expect(apres.find((l) => l.isin === 'FR0000973711')).toMatchObject({ poids: 0, fonds: 'Valfrance P' })
  })

  it('ne modifie pas les lignes reçues', () => {
    expect(LIGNES.find((l) => l.isin === 'FR0000973711').poids).toBe(1)
    expect(total(LIGNES)).toBe(85.5)
  })

  it('tolère des propositions vides ou absentes', () => {
    expect(appliquerPropositions(LIGNES, [])).toEqual(LIGNES)
    expect(appliquerPropositions(LIGNES)).toEqual(LIGNES)
    expect(appliquerPropositions(null, null)).toEqual([])
  })
})

describe('candidatsRemplacement', () => {
  it('ne rend que des supports de la famille demandée', () => {
    const candidats = candidatsRemplacement(univers, 'metaux_precieux')
    expect(candidats.length).toBeGreaterThan(0)
    for (const c of candidats) expect(familleDuSupport(c)).toBe('metaux_precieux')
  })

  it('verrou 2 : jamais un monétaire, un fonds euro ou un fonds d’attente', () => {
    expect(candidatsRemplacement(univers, 'monetaire_attente')).toEqual([])
    expect(candidatsRemplacement(universAbeille, 'monetaire_attente')).toEqual([])

    const attente = SUPPORTS_SWISSLIFE.filter((s) => familleDuSupport(s) === 'monetaire_attente')
    expect(attente.length).toBeGreaterThan(0)
    for (const famille of FAMILLES) {
      const isins = candidatsRemplacement(univers, famille.cle).map((c) => c.isin)
      for (const s of attente) expect(isins).not.toContain(s.isin)
    }
  })

  it('écarte les supports qui sortent du contrat', () => {
    // Sycomore Sustainable Tech est encore dans la liste des supports et déjà
    // annoncé sortant : on ne remplace pas une ligne par un fonds qui ferme.
    const isins = candidatsRemplacement(univers, 'technologie').map((c) => c.isin)
    expect(isins).toContain('FR0013358793')
    expect(isins).not.toContain('LU2181906426')
  })

  it('écarte les ISIN déjà présents dans l’allocation', () => {
    const isins = candidatsRemplacement(univers, 'metaux_precieux', {
      exclureIsins: ['LU0171305526', 'FR0007390174'],
    }).map((c) => c.isin)
    expect(isins).not.toContain('LU0171305526')
    expect(isins).not.toContain('FR0007390174')
    expect(isins.length).toBeGreaterThan(0)
  })

  it('trie par SRI, puis par frais, puis par performance', () => {
    const isins = candidatsRemplacement(univers, 'metaux_precieux').map((c) => c.isin)
    expect(isins).toEqual([
      'FR0011170182', // SRI 5, frais 1,50
      'FR0007001581', // SRI 5, frais 1,65
      'FR0007390174', // SRI 5, frais 2,00
      'LU0171305526', // SRI 6
    ])
  })

  it('se départage sur le nom quand l’assureur ne publie ni frais ni performance', () => {
    // Le panorama Abeille de décembre 2024 ne porte que le SRI : à SRI égal, il
    // ne reste que l’ordre alphabétique, ce qui vaut mieux que l’ordre du PDF.
    expect(candidatsRemplacement(universAbeille, 'technologie').map((c) => c.isin)).toEqual([
      'LU1863263346', // DWS Invest
      'LU1213836080', // Fidelity Funds
      'LU1279334210', // Pictet
    ])
  })

  it('respecte la limite demandée', () => {
    expect(candidatsRemplacement(univers, 'metaux_precieux', { limite: 2 })).toHaveLength(2)
    expect(candidatsRemplacement(univers, 'metaux_precieux', { limite: 0 })).toHaveLength(4)
  })

  it('rend un tableau vide sans univers, sans famille ou sur une famille inconnue', () => {
    expect(candidatsRemplacement(null, 'metaux_precieux')).toEqual([])
    expect(candidatsRemplacement(univers, null)).toEqual([])
    expect(candidatsRemplacement(univers, 'famille_qui_n_existe_pas')).toEqual([])
  })
})

describe('les inclinaisons du régime courant', () => {
  const inclinaisons = INCLINAISONS[REGIME_COURANT.cle]

  it('reprend les seize entrées de la note, chacune avec ses sources', () => {
    expect(inclinaisons).toHaveLength(16)
    for (const i of inclinaisons) {
      expect(['renforcer', 'alleger', 'maintenir']).toContain(i.sens)
      expect(['forte', 'moyenne', 'legere']).toContain(i.ampleur)
      expect(i.pourquoi.length).toBeGreaterThan(80)
      expect(i.sources.length).toBeGreaterThan(0)
      for (const source of i.sources) expect(source.length).toBeGreaterThan(10)
    }
  })

  it('ne vise que des familles du référentiel', () => {
    const cles = FAMILLES.map((f) => f.cle)
    for (const i of inclinaisons) {
      if (i.famille === null) continue
      expect(cles).toContain(i.famille)
    }
  })

  it('laisse les quatre autres régimes vides, faute de note qui les documente', () => {
    for (const cle of ['expansion', 'ralentissement', 'stress', 'reprise']) {
      expect(INCLINAISONS[cle]).toEqual([])
    }
  })

  it('le régime courant est daté, sourcé et connu du référentiel', () => {
    expect(REGIMES.map((r) => r.cle)).toContain(REGIME_COURANT.cle)
    expect(REGIME_COURANT.retenuLe).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(REGIME_COURANT.source).toContain('04/09/2026')
    expect(REGIME_COURANT.note.length).toBeGreaterThan(200)
  })

  it('les cinq régimes portent un nom et un résumé', () => {
    expect(REGIMES).toHaveLength(5)
    for (const r of REGIMES) {
      expect(r.nom.length).toBeGreaterThan(0)
      expect(r.resume.length).toBeGreaterThan(40)
      expect(INCLINAISONS[r.cle]).toBeDefined()
    }
  })
})

describe('familleDuSupport', () => {
  it('lit les catégories fines de SwissLife', () => {
    expect(familleDuSupport({ categorie: 'Monétaire EUR' })).toBe('monetaire_attente')
    expect(familleDuSupport({ categorie: 'Secteur Immobilier Europe' })).toBe('immobilier')
    expect(familleDuSupport({ categorie: 'Obligations Indexées Inflation Couverte' })).toBe('inflation')
    expect(familleDuSupport({ categorie: 'Actions France Petites & Moyennes Capitalisations' })).toBe('actions_france')
    expect(familleDuSupport({ categorie: 'Gestion Alternative' })).toBe('performance_absolue')
  })

  it('range une obligation émergente en obligation, pas en actions émergentes', () => {
    expect(familleDuSupport({ categorie: 'Obligations Marchés Emergents' })).toBe('oblig_credit')
    expect(familleDuSupport({ categorie: 'Actions Marchés Emergents' })).toBe('emergents')
  })

  it('ne prend pas un fonds d’actions pour un fonds mixte', () => {
    expect(familleDuSupport({ categorie: 'Actions US Grandes Capitalisations Mixte' })).toBe('actions_us')
    expect(familleDuSupport({ categorie: 'Mixtes EUR Flexible' })).toBe('mixtes')
  })

  it('ne prend pas « hors Japon » pour du Japon', () => {
    expect(familleDuSupport({ categorie: 'Actions Asie-Pacifique hors Japon' })).toBe('emergents')
    expect(familleDuSupport({ categorie: 'Actions Japon' })).toBe('actions_japon')
  })

  it('retombe sur le libellé quand la catégorie ne dit rien, comme chez Abeille', () => {
    expect(familleDuSupport({ categorie: 'Actions', nom: 'Comgest Monde C' })).toBe('actions_monde')
    expect(familleDuSupport({ categorie: 'Actions', nom: 'Amundi Actions Or P-C' })).toBe('metaux_precieux')
    expect(familleDuSupport({ categorie: 'Actions', nom: 'Pictet - Robotics P' })).toBe('technologie')
    expect(familleDuSupport({ categorie: 'Monétaire', nom: 'Ofi Invest ESG Liquidités A' })).toBe('monetaire_attente')
  })

  it('rend null quand rien ne correspond, plutôt que de deviner', () => {
    expect(familleDuSupport(null)).toBe(null)
    expect(familleDuSupport({})).toBe(null)
    expect(familleDuSupport({ categorie: 'Secteur Agricole', nom: 'Un fonds sur les terres agricoles' })).toBe(null)
    expect(familleDuSupport({ categorie: 'Fonds à Horizon', nom: 'Objectif 2030 C' })).toBe(null)
  })
})
