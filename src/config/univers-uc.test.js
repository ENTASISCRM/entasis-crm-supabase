// Ce module décide ce qu'un conseiller voit quand il cherche un support, et
// ce que l'écran a le droit de proposer. Deux erreurs coûtent cher ici : un
// fonds d'attente qui passe le filtre, et une sortie de contrat qu'on ne
// signale pas. Les deux ont leur bloc de tests.
//
// Le réseau est simulé partout, sauf le dernier bloc : celui là ouvre les
// vrais fichiers avec fs et vaut contrôle d'extraction. Si un assureur
// republie sa liste, c'est lui qui doit tomber en premier.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CLASSES_ATTENTE,
  FICHIERS,
  chercher,
  estFondsDAttente,
  sortieDuContrat,
} from './univers-uc'

// ─────────────────────────────────────────────────────────────────────────
// Outillage
// ─────────────────────────────────────────────────────────────────────────

const support = (o = {}) => ({
  isin: o.isin || 'FR0000000001',
  nom: o.nom || 'Fonds Exemple C',
  categorie: 'categorie' in o ? o.categorie : 'Actions Europe Rendement',
  societeGestion: 'societeGestion' in o ? o.societeGestion : 'Gestion Exemple',
  sri: 'sri' in o ? o.sri : 4,
})

// Un univers fabriqué à la main, de la forme rendue par chargerUnivers. Les
// fonctions de lecture doivent marcher dessus sans être passées par le réseau.
const universFictif = (supports = [], sorties = []) => ({
  partenaire: 'exemple',
  sourceFichier: 'liste-exemple.xlsx',
  publie: '2026-06',
  extraitLe: '2026-09-04',
  supports,
  sorties,
  parIsin: new Map(supports.filter((s) => s?.isin).map((s) => [s.isin, s])),
})

// La mémoïsation vit dans le module. Chaque test qui la touche repart d'une
// instance neuve, sinon le premier test remplirait le cache des suivants.
async function moduleNeuf() {
  vi.resetModules()
  return import('./univers-uc')
}

// Réponse fetch minimale : de quoi couvrir le succès, le 404 et le JSON cassé.
const reponse = ({ ok = true, status = 200, json } = {}) => ({
  ok,
  status,
  json: json || (async () => ({ partenaire: 'x', supports: [] })),
})

afterEach(() => { vi.unstubAllGlobals() })

// ─────────────────────────────────────────────────────────────────────────

describe('chargerUnivers', () => {
  const contenu = {
    partenaire: 'swisslife',
    sourceFichier: 'Liste exemple.xlsx',
    publie: '2026-06',
    extraitLe: '2026-09-04',
    supports: [support({ isin: 'FR0000000001' }), support({ isin: 'LU0000000002' })],
    sorties: [{ isin: 'FR0009999999', nom: 'Fonds Parti C', motif: 'Dissous le 06/01/2026' }],
  }

  let appels

  beforeEach(() => {
    appels = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      appels.push(url)
      return reponse({ json: async () => structuredClone(contenu) })
    }))
  })

  it('rend la forme annoncée, avec parIsin en Map', async () => {
    const { chargerUnivers } = await moduleNeuf()
    const u = await chargerUnivers('swisslife')

    expect(appels).toEqual(['/data/univers-uc-swisslife.json'])
    expect(u.partenaire).toBe('swisslife')
    expect(u.publie).toBe('2026-06')
    expect(u.extraitLe).toBe('2026-09-04')
    expect(u.supports).toHaveLength(2)
    expect(u.sorties).toHaveLength(1)
    expect(u.parIsin).toBeInstanceOf(Map)
    expect(u.parIsin.get('LU0000000002').nom).toBe('Fonds Exemple C')
  })

  it('garde le nom du document source, ce que le conseiller cite au client', async () => {
    const { chargerUnivers } = await moduleNeuf()
    expect((await chargerUnivers('swisslife')).sourceFichier).toBe('Liste exemple.xlsx')
  })

  it('ne télécharge le fichier qu une fois par partenaire', async () => {
    const { chargerUnivers } = await moduleNeuf()
    const un = await chargerUnivers('swisslife')
    const deux = await chargerUnivers('swisslife')

    expect(appels).toHaveLength(1)
    expect(deux).toBe(un)
  })

  it('partage un seul appel entre deux écrans montés en même temps', async () => {
    const { chargerUnivers } = await moduleNeuf()
    const [un, deux] = await Promise.all([chargerUnivers('abeille'), chargerUnivers('abeille')])

    expect(appels).toHaveLength(1)
    expect(deux).toBe(un)
  })

  it('mémoïse par partenaire, sans les mélanger', async () => {
    const { chargerUnivers } = await moduleNeuf()
    await chargerUnivers('swisslife')
    await chargerUnivers('abeille')

    expect(appels).toEqual(['/data/univers-uc-swisslife.json', '/data/univers-uc-abeille.json'])
  })

  it('tolère la casse et les espaces autour de la clé partenaire', async () => {
    const { chargerUnivers } = await moduleNeuf()
    await chargerUnivers('  SwissLife ')
    expect(appels).toEqual(['/data/univers-uc-swisslife.json'])
  })

  it('refuse un partenaire inconnu sans toucher au réseau', async () => {
    const { chargerUnivers } = await moduleNeuf()
    await expect(chargerUnivers('generali')).rejects.toThrow(/partenaire inconnu/i)
    expect(appels).toHaveLength(0)
  })

  it('rejette quand le fichier ne répond pas, plutôt que de rendre un univers vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ ok: false, status: 404 })))
    const { chargerUnivers } = await moduleNeuf()
    await expect(chargerUnivers('swisslife')).rejects.toThrow(/404/)
  })

  it('rejette quand le JSON est illisible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({
      json: async () => { throw new SyntaxError('Unexpected token') },
    })))
    const { chargerUnivers } = await moduleNeuf()
    await expect(chargerUnivers('swisslife')).rejects.toThrow(/pas du JSON lisible/)
  })

  it('rejette un JSON valide qui ne porte pas de supports', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ json: async () => ({ partenaire: 'swisslife' }) })))
    const { chargerUnivers } = await moduleNeuf()
    await expect(chargerUnivers('swisslife')).rejects.toThrow(/aucune liste de supports/)
  })

  it('oublie un échec, pour qu un second essai puisse aboutir', async () => {
    // Une coupure réseau d une seconde ne doit pas condamner l écran jusqu au
    // rechargement complet du CRM.
    let premier = true
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (premier) { premier = false; throw new TypeError('Failed to fetch') }
      return reponse({ json: async () => structuredClone(contenu) })
    }))

    const { chargerUnivers } = await moduleNeuf()
    await expect(chargerUnivers('swisslife')).rejects.toThrow()
    await expect(chargerUnivers('swisslife')).resolves.toMatchObject({ partenaire: 'swisslife' })
  })
})

describe('chercher', () => {
  const supports = [
    support({ isin: 'FR0010135103', nom: 'Carmignac Patrimoine A EUR Acc', societeGestion: 'Carmignac', categorie: 'Mixtes EUR Flexible', sri: 3 }),
    support({ isin: 'LU0270904781', nom: 'Pictet Security P EUR', societeGestion: 'Pictet AM', categorie: 'Secteur Technologies', sri: 5 }),
    support({ isin: 'FR0010011171', nom: 'AXA Or et Matières Premières C', societeGestion: 'AXA IM', categorie: 'Secteur Métaux Précieux', sri: 6 }),
    support({ isin: 'FR0011630557', nom: 'Amundi Euro Liquidity Select P C', societeGestion: 'Amundi', categorie: 'Monétaire EUR', sri: 1 }),
    support({ isin: 'IE0000000005', nom: 'Fonds Sans Note R', societeGestion: 'Maison Exemple', categorie: 'Actions autres', sri: null }),
  ]
  const univers = universFictif(supports)
  const isins = (r) => r.map((s) => s.isin)

  it('trouve par nom, accents ignorés', () => {
    expect(isins(chercher(univers, { q: 'matieres premieres' }))).toEqual(['FR0010011171'])
  })

  it('trouve par ISIN, entier ou partiel', () => {
    expect(isins(chercher(univers, { q: 'LU0270904781' }))).toEqual(['LU0270904781'])
    expect(isins(chercher(univers, { q: 'FR001013' }))).toEqual(['FR0010135103'])
  })

  it('trouve par société de gestion', () => {
    expect(isins(chercher(univers, { q: 'pictet' }))).toEqual(['LU0270904781'])
  })

  it('accepte les mots dans n importe quel ordre', () => {
    expect(isins(chercher(univers, { q: 'patrimoine carmignac' }))).toEqual(['FR0010135103'])
  })

  it('filtre par classe, sur un fragment de catégorie', () => {
    expect(isins(chercher(univers, { classe: 'secteur' }))).toEqual(['LU0270904781', 'FR0010011171'])
    expect(isins(chercher(univers, { classe: 'metaux precieux' }))).toEqual(['FR0010011171'])
  })

  it('plafonne par SRI', () => {
    expect(isins(chercher(univers, { sriMax: 3 }))).toEqual(['FR0010135103', 'FR0011630557'])
  })

  it('écarte un support sans SRI quand un plafond est demandé', () => {
    // Rien ne prouve qu il tient sous le plafond. On ne suppose pas à sa place.
    expect(isins(chercher(univers, { sriMax: 7 }))).not.toContain('IE0000000005')
    expect(isins(chercher(univers, {}))).toContain('IE0000000005')
  })

  it('croise les critères', () => {
    expect(isins(chercher(univers, { q: 'euro', sriMax: 3 }))).toEqual(['FR0011630557'])
  })

  it('borne le nombre de résultats', () => {
    expect(chercher(univers, { limite: 2 })).toHaveLength(2)
    expect(chercher(univers, { q: 'e', limite: 2 })).toHaveLength(2)
    expect(chercher(univers, { limite: 0 })).toEqual([])
    expect(chercher(univers, { q: 'e', limite: 0 })).toEqual([])
  })

  it('sans requête, garde l ordre du fichier : c est celui de l assureur', () => {
    expect(isins(chercher(univers, {}))).toEqual(isins(supports))
    expect(isins(chercher(univers))).toEqual(isins(supports))
  })

  it('rend une copie, jamais la liste de l univers elle même', () => {
    const rendu = chercher(univers, {})
    expect(rendu).not.toBe(univers.supports)
    expect(rendu).toEqual(univers.supports)
  })

  it('rend les supports eux mêmes, pas des copies appauvries', () => {
    expect(chercher(univers, { q: 'pictet' })[0]).toBe(supports[1])
  })

  it('rend une liste vide sur un univers absent ou incomplet', () => {
    expect(chercher(null, { q: 'pictet' })).toEqual([])
    expect(chercher(undefined)).toEqual([])
    expect(chercher({ supports: null }, { q: 'x' })).toEqual([])
  })

  it('ne rend rien quand rien ne correspond', () => {
    expect(chercher(univers, { q: 'zzzz introuvable' })).toEqual([])
  })

  it('ne se plaint pas des supports mal formés', () => {
    const bancal = universFictif([null, { isin: 'FR0000000009' }, support({ nom: 'Bon Fonds C' })])
    expect(() => chercher(bancal, { q: 'bon fonds' })).not.toThrow()
    expect(chercher(bancal, { q: 'bon fonds' })).toHaveLength(1)
  })
})

describe('sortieDuContrat', () => {
  const univers = universFictif(
    [support({ isin: 'FR0010396382', nom: 'Mandarine Equity Income R' })],
    [
      { isin: 'FR0007051040', nom: 'Eurose C', societeGestion: 'DNCA Finance', motif: 'Absorbé par le support LU0284394235 le 21/05/2026' },
      { isin: 'FR0010396382', nom: 'Mandarine Equity Income R', societeGestion: 'Mandarine Gestion', motif: 'Optimisation de l offre' },
      { isin: 'LU2049576817', nom: 'JPM Global Macro Sustainable D acc EUR', societeGestion: 'JPMorgan AM' },
    ],
  )

  it('signale un support sorti, avec son motif', () => {
    expect(sortieDuContrat(univers, 'FR0007051040')).toEqual({
      isin: 'FR0007051040',
      nom: 'Eurose C',
      motif: 'Absorbé par le support LU0284394235 le 21/05/2026',
    })
  })

  it('signale aussi un support encore listé mais annoncé sortant', () => {
    // Cinq supports SwissLife sont dans les deux listes en juin 2026 :
    // souscriptibles aujourd hui, retirés demain. La sortie prime.
    expect(univers.parIsin.has('FR0010396382')).toBe(true)
    expect(sortieDuContrat(univers, 'FR0010396382')?.motif).toBe('Optimisation de l offre')
  })

  it('dit que le motif manque plutôt que d en inventer un', () => {
    expect(sortieDuContrat(univers, 'LU2049576817')?.motif).toMatch(/sans motif indiqué/)
  })

  it('tolère la casse et les espaces d un ISIN collé depuis un relevé', () => {
    expect(sortieDuContrat(univers, ' fr0007051040 ')?.nom).toBe('Eurose C')
  })

  it('rend null sur un support toujours au contrat', () => {
    expect(sortieDuContrat(univers, 'LU0270904781')).toBeNull()
  })

  it('rend null sur une entrée vide ou un univers absent', () => {
    expect(sortieDuContrat(univers, '')).toBeNull()
    expect(sortieDuContrat(univers, null)).toBeNull()
    expect(sortieDuContrat(null, 'FR0007051040')).toBeNull()
  })
})

describe('estFondsDAttente', () => {
  it('attrape les catégories monétaires des deux assureurs', () => {
    expect(estFondsDAttente(support({ categorie: 'Monétaire EUR' }))).toBe(true)
    expect(estFondsDAttente(support({ categorie: 'Monétaire Devises' }))).toBe(true)
    expect(estFondsDAttente(support({ categorie: 'Monétaire' }))).toBe(true)
    expect(estFondsDAttente(support({ categorie: "Fonds monétaire n'ayant pas vocation à être souscrit" }))).toBe(true)
  })

  it('attrape la même catégorie sans accent et en majuscules', () => {
    expect(estFondsDAttente(support({ categorie: 'MONETAIRE EUR' }))).toBe(true)
    expect(estFondsDAttente(support({ categorie: 'monetaire' }))).toBe(true)
    expect(estFondsDAttente(support({ categorie: 'FONDS MONETAIRE N AYANT PAS VOCATION A ETRE SOUSCRIT' }))).toBe(true)
  })

  it('attrape aussi par le nom, quand la catégorie ne dit rien', () => {
    expect(estFondsDAttente(support({ categorie: 'Autres stratégies', nom: 'SLF (F) ESG Money Market Euro P' }))).toBe(true)
    expect(estFondsDAttente(support({ categorie: '', nom: 'Ofi Invest ESG Liquidités A' }))).toBe(true)
    expect(estFondsDAttente(support({ categorie: null, nom: 'Trésorerie Entreprise C' }))).toBe(true)
    expect(estFondsDAttente(support({ categorie: null, nom: 'Fonds en euros Croissance' }))).toBe(true)
  })

  it('accepte une ligne d allocation, qui porte le nom dans `fonds`', () => {
    expect(estFondsDAttente({ fonds: 'Amundi Euro Liquidity Select P C', isin: 'FR0011630557', poids: 5 })).toBe(true)
    expect(estFondsDAttente({ fonds: 'Carmignac Patrimoine A EUR Acc', isin: 'FR0010135103', poids: 12 })).toBe(false)
  })

  it('laisse passer ce qui n est pas un fonds d attente', () => {
    expect(estFondsDAttente(support({ categorie: 'Actions US Grandes Capitalisations Croissance' }))).toBe(false)
    expect(estFondsDAttente(support({ categorie: 'Obligations Flexibles EUR' }))).toBe(false)
    // Le credit a duree courte reste proposable : ce n est pas un fonds
    // d attente, et la direction n a exclu que la categorie « Court terme ».
    expect(estFondsDAttente(support({ nom: 'Tikehau Short Duration R EUR Acc', categorie: 'Obligations Autres' }))).toBe(false)
  })

  it('écarte les deux catégories arbitrées par la direction le 04/09/2026', () => {
    // « Obligations Diversifiés EUR - Court terme » : des fonds d attente en
    // pratique, meme si l assureur ne les nomme pas ainsi. « Fonds à Capital
    // Protégé » : la protection se paie sur la performance, le moteur ne doit
    // pas la proposer de lui meme.
    expect(estFondsDAttente(support({ categorie: 'Obligations Diversifiés EUR - Court terme' }))).toBe(true)
    expect(estFondsDAttente(support({ categorie: 'Fonds à Capital Protégé' }))).toBe(true)
  })

  it('rend faux sur une entrée vide, sans lever', () => {
    expect(estFondsDAttente(null)).toBe(false)
    expect(estFondsDAttente(undefined)).toBe(false)
    expect(estFondsDAttente({})).toBe(false)
    expect(estFondsDAttente('Monétaire EUR')).toBe(false)
  })

  it('la liste des motifs est déclarée en clair, pour être relue par la direction', () => {
    expect(CLASSES_ATTENTE).toContain('monetaire')
    expect(CLASSES_ATTENTE.every((m) => m === m.toLowerCase())).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// CONTRÔLE D'EXTRACTION
//
// Ce bloc lit les vrais fichiers. Il ne teste pas le code, il teste la
// donnée : c'est le seul endroit du dépôt qui vérifie que ce qu'on a extrait
// des listes des assureurs tient debout. Une republication qui fait tomber
// ces tests demande une relecture humaine, pas un ajustement des chiffres.
// ─────────────────────────────────────────────────────────────────────────

const lireFichier = (cle) =>
  JSON.parse(readFileSync(new URL(`../../public${FICHIERS[cle]}`, import.meta.url), 'utf8'))

describe('extraction des univers réels', () => {
  const FORMAT_ISIN = /^[A-Z]{2}[A-Z0-9]{10}$/

  const attendus = {
    swisslife: { supports: 829, sorties: 125, publie: '2026-06' },
    abeille: { supports: 165, sorties: 0, publie: '2024-12' },
  }

  for (const [cle, attendu] of Object.entries(attendus)) {
    describe(cle, () => {
      const brut = lireFichier(cle)

      it('porte les clés attendues et le bon compte', () => {
        expect(Object.keys(brut).sort()).toEqual(
          ['extraitLe', 'partenaire', 'publie', 'sorties', 'sourceFichier', 'supports'],
        )
        expect(brut.partenaire).toBe(cle)
        expect(brut.publie).toBe(attendu.publie)
        expect(brut.supports).toHaveLength(attendu.supports)
        expect(brut.sorties).toHaveLength(attendu.sorties)
      })

      it('cite le document dont il sort', () => {
        expect(brut.sourceFichier).toBeTruthy()
        expect(brut.extraitLe).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      })

      it('tous les supports ont un ISIN au format, un nom et une catégorie', () => {
        for (const s of brut.supports) {
          expect(s.isin, s.nom).toMatch(FORMAT_ISIN)
          expect(String(s.nom).trim(), s.isin).not.toBe('')
          expect(String(s.categorie).trim(), s.isin).not.toBe('')
        }
      })

      it('aucun ISIN en double : parIsin ne perdrait pas de support', () => {
        const vus = new Set(brut.supports.map((s) => s.isin))
        expect(vus.size).toBe(brut.supports.length)
      })

      it('le SRI, quand il est là, reste dans son échelle de 1 à 7', () => {
        for (const s of brut.supports) {
          if (s.sri == null) continue
          expect(s.sri, `${s.isin} ${s.nom}`).toBeGreaterThanOrEqual(1)
          expect(s.sri, `${s.isin} ${s.nom}`).toBeLessThanOrEqual(7)
        }
      })
    })
  }

  it('reconnaît les fonds d attente des deux listes, et rien d autre', () => {
    // 16 sur 829 chez SwissLife : 10 monétaires (dont les 6 que l assureur dit
    // lui même n avoir pas vocation à être souscrits), les 5 de la catégorie
    // « Obligations Diversifiés EUR - Court terme » et l unique fonds à
    // capital protégé, ces deux dernières familles écartées par la direction
    // le 04/09/2026. 2 sur 165 chez Abeille, les deux monétaires.
    const compter = (cle) => lireFichier(cle).supports.filter(estFondsDAttente).length
    expect(compter('swisslife')).toBe(16)
    expect(compter('abeille')).toBe(2)
  })

  it('les motifs arbitrés le 04/09/2026 ne prennent rien par le nom d un fonds', () => {
    // Le compte ci dessus dit combien de supports tombent, celui ci dit par où.
    // « court terme » et « capital protégé » sont des expressions assez
    // courantes pour qu'une republication de l'assureur les fasse un jour
    // apparaître dans le LIBELLÉ d'un fonds ordinaire, un crédit à duration
    // courte par exemple, que la direction n'a pas exclu : ce jour là, ce test
    // tombe avant que le support ne disparaisse en silence des propositions.
    for (const cle of ['swisslife', 'abeille']) {
      const attrapes = lireFichier(cle).supports.filter(estFondsDAttente)
      const parLeNomSeul = attrapes.filter((s) => !estFondsDAttente({ categorie: s.categorie }))
      expect(parLeNomSeul.map((s) => s.nom), cle).toEqual([])
    }

    // Et par quatre catégories connues, pas une de plus : les trois monétaires
    // et les deux arbitrées le 04/09/2026, dont une seule chez Abeille.
    const categories = (cle) =>
      [...new Set(lireFichier(cle).supports.filter(estFondsDAttente).map((s) => s.categorie))].sort()

    expect(categories('swisslife')).toEqual([
      "Fonds monétaire n'ayant pas vocation à être souscrit",
      'Fonds à Capital Protégé',
      'Monétaire EUR',
      'Obligations Diversifiés EUR - Court terme',
    ])
    expect(categories('abeille')).toEqual(['Monétaire'])
  })

  it('les catégories Abeille restent les cinq du panorama', () => {
    const vues = new Set(lireFichier('abeille').supports.map((s) => s.categorie))
    expect([...vues].sort()).toEqual(['Actions', 'Mixtes', 'Monétaire', 'Obligations', 'Spéculatifs'])
  })

  it('Eurose C est bien signalé sorti du contrat SwissLife', () => {
    // Le cas qui a motivé sortieDuContrat : deux allocations types de
    // src/config/allocations.js citent encore ce support.
    const univers = universFictif([], lireFichier('swisslife').sorties)
    const sortie = sortieDuContrat(univers, 'FR0007051040')
    expect(sortie).toMatchObject({ isin: 'FR0007051040', nom: 'Eurose C' })
    expect(sortie.motif).toMatch(/21\/05\/2026/)
    expect(sortie.motif).toMatch(/LU0284394235/)
  })

  it('cinq supports SwissLife sont à la fois listés et annoncés sortants', () => {
    // Ce n est pas une anomalie d extraction : la liste de juin les
    // commercialise encore, la feuille des retraits les annonce partants.
    // Le jour où ce chiffre bouge, l écran doit être relu.
    const brut = lireFichier('swisslife')
    const listes = new Set(brut.supports.map((s) => s.isin))
    expect(brut.sorties.filter((s) => listes.has(s.isin))).toHaveLength(5)
  })

  it('deux sorties SwissLife n ont aucun motif publié', () => {
    const brut = lireFichier('swisslife')
    expect(brut.sorties.filter((s) => !s.motif)).toHaveLength(2)
  })

  it('le chemin complet tient : on charge le vrai fichier, on retrouve un fonds par son ISIN', async () => {
    // Le seul test qui fait passer la vraie donnée par le vrai chargeur. Il
    // attrape ce qu aucun des deux bouts ne voit seul, une clé de parIsin qui
    // ne serait pas celle que porte le fichier.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => lireFichier('swisslife') })))
    const { chargerUnivers } = await moduleNeuf()
    const univers = await chargerUnivers('swisslife')

    expect(univers.supports).toHaveLength(829)
    expect(univers.parIsin.size).toBe(829)
    expect(univers.parIsin.get('FR0010135103')?.nom).toMatch(/Carmignac Patrimoine/)
    expect(univers.sourceFichier).toMatch(/2026-06/)
    expect(sortieDuContrat(univers, 'FR0007051040')?.nom).toBe('Eurose C')
  })

  it('la recherche marche sur la vraie liste, ISIN comme nom', () => {
    const brut = lireFichier('swisslife')
    const univers = universFictif(brut.supports, brut.sorties)

    expect(chercher(univers, { q: 'FR0010135103' })[0]?.nom).toMatch(/Carmignac Patrimoine/)
    expect(chercher(univers, { q: 'carmignac patrimoine' })[0]?.isin).toBe('FR0010135103')
    // Sans accent à la frappe, comme personne n en tape dans une barre de
    // recherche : « metaux precieux » doit rendre la catégorie accentuée.
    expect(chercher(univers, { classe: 'metaux precieux', limite: 3 }).length).toBeGreaterThan(0)
  })
})
