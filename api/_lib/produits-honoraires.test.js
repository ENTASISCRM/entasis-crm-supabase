// ═══════════════════════════════════════════════════════════════════════════
// PRODUITS RÉMUNÉRÉS SUR UN MONTANT LIBRE
//
// Deux produits ne se rémunèrent pas sur un pourcentage d'une prime, mais sur
// un montant que quelqu'un fixe, partagé à parts égales avec le cabinet :
//
//   • Assurance de Prêt — « les frais sur l'assurance emprunteur c'est nous
//     qui fixons et on prend rien sur la prime par mois » (Louis, 24/08/2026)
//   • Bilan Patrimonial — les conseillers le vendent au prix qu'ils veulent,
//     et le cabinet prend 50 % (Louis, 24/08/2026)
//
// Dans les deux cas : le montant saisi est l'assiette entière, la prime
// mensuelle ne rapporte rien, et le conseiller touche la moitié.
//
// Ces tests existent parce que le contraire s'est produit : un dossier saisi
// sous un autre produit faisait tomber le montant dans le barème « prime
// unique » à 0,25 %, soit 3,75 € au lieu de 750 € (remonté par Nans le 24/08).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { commissionsDeal, mapProduitDeal, assietteDeal } from './calcul-commission.js'
import { BAREME_PRODUITS } from './bareme-entasis.js'
import { PRODUCTS, PRODUITS_HONORAIRES, LIBELLE_MONTANT_HONORAIRES } from '../../src/lib/ui-shared.js'

const CDI = { type_contrat: 'CDI', rentabilise: true }
const CDI_NON_RENTA = { type_contrat: 'CDI', rentabilise: false }
const MANDATAIRE = { type_contrat: 'Mandataire', rentabilise: false }

// Les deux produits, avec la clé de barème attendue.
const CAS = [
  { produit: 'Assurance de Prêt', cle: 'assurance_pret' },
  { produit: 'Bilan Patrimonial', cle: 'bilan_patrimonial' },
]

// 1 500 € de montant libre, prime de 45 €/mois là où il y en a une.
const dossier = (produit, extra = {}) => ({ product: produit, pu: 1500, pp_m: 45, ...extra })
const total = (lignes) => lignes.reduce((s, l) => s + l.montant, 0)

describe.each(CAS)('$produit', ({ produit, cle }) => {
  it('est proposé dans le formulaire', () => {
    expect(PRODUCTS).toContain(produit)
  })

  it('mappe sur son barème', () => {
    expect(mapProduitDeal({ product: produit })).toBe(cle)
  })

  it('prend le montant saisi comme assiette, sans pourcentage', () => {
    expect(assietteDeal(dossier(produit), cle)).toBe(1500)
  })

  it('ignore complètement la prime mensuelle', () => {
    expect(total(commissionsDeal(dossier(produit, { pp_m: 500 }), CDI)))
      .toBe(total(commissionsDeal(dossier(produit, { pp_m: 0 }), CDI)))
  })

  it('ne produit aucune ligne de commission sur la PP', () => {
    const lignes = commissionsDeal(dossier(produit), CDI)
    expect(lignes).toHaveLength(1)
    expect(lignes[0].produitKey).toBe(cle)
  })

  it("ne dépend pas du taux de frais d'entrée saisi dans le dossier", () => {
    for (const pct of [0, 1, 2.5, 4]) {
      expect(total(commissionsDeal(dossier(produit, { frais_entree_pu_pct: pct }), CDI))).toBe(750)
    }
  })

  it('verse la moitié au conseiller, quel que soit son contrat', () => {
    for (const contrat of [CDI, CDI_NON_RENTA, MANDATAIRE]) {
      expect(total(commissionsDeal(dossier(produit), contrat))).toBe(750)
    }
  })

  it('coupe encore en deux avec un co-conseiller', () => {
    expect(total(commissionsDeal(dossier(produit), CDI, 0.5))).toBe(375)
  })

  it('commissionne dès le premier euro, sans condition de palier', () => {
    expect(BAREME_PRODUITS[cle].horsPalier).toBe(true)
    expect(total(commissionsDeal(dossier(produit, { pu: 1 }), CDI))).toBe(0.5)
  })

  it('ne rapporte rien si seule la prime est saisie, sans montant', () => {
    expect(total(commissionsDeal(dossier(produit, { pu: 0 }), CDI))).toBe(0)
  })
})

describe('variantes de saisie du produit', () => {
  it('reconnaît « emprunteur », quelle que soit la casse', () => {
    expect(mapProduitDeal({ product: 'Assurance emprunteur' })).toBe('assurance_pret')
    expect(mapProduitDeal({ product: 'ASSURANCE DE PRÊT' })).toBe('assurance_pret')
  })

  it('reconnaît un bilan écrit librement', () => {
    expect(mapProduitDeal({ product: 'Bilan patrimonial complet' })).toBe('bilan_patrimonial')
    expect(mapProduitDeal({ product: 'BILAN PATRIMONIAL' })).toBe('bilan_patrimonial')
  })

  it("l'assurance de prêt passe avant l'assurance vie, qui contient presque le même mot", () => {
    expect(mapProduitDeal({ product: 'Assurance Vie Française' })).toBe('av')
  })
})

describe('cohérence entre le formulaire et le barème', () => {
  it('chaque produit à montant libre a bien un barème à assiette PU, hors palier, à 50 %', () => {
    for (const { produit, cle } of CAS) {
      expect(PRODUITS_HONORAIRES).toContain(produit)
      const b = BAREME_PRODUITS[cle]
      expect(b.assiette, produit).toBe('pu')
      expect(b.horsPalier, produit).toBe(true)
      expect(b.cdi(1), produit).toBe(50)
      expect(b.mandataire(1), produit).toBe(50)
    }
  })

  it('la liste UI ne contient rien que le barème ne traite pas ainsi', () => {
    // Empêche d'ajouter un produit à PRODUITS_HONORAIRES sans son barème :
    // le formulaire promettrait une règle que le calcul n'applique pas.
    for (const produit of PRODUITS_HONORAIRES) {
      const cle = mapProduitDeal({ product: produit })
      expect(cle, produit).toBeTruthy()
      expect(BAREME_PRODUITS[cle].assiette, produit).toBe('pu')
      expect(BAREME_PRODUITS[cle].cdi(1), produit).toBe(50)
    }
  })

  it('chacun sait dire qui fixe le montant', () => {
    for (const produit of PRODUITS_HONORAIRES) {
      expect(LIBELLE_MONTANT_HONORAIRES[produit]?.champ, produit).toBeTruthy()
      expect(LIBELLE_MONTANT_HONORAIRES[produit]?.aide, produit).toBeTruthy()
    }
  })
})

describe("le bug remonté par Nans ne doit pas revenir", () => {
  it('saisi sous le bon produit, 1 500 € rapportent 750 € et non 3,75 €', () => {
    for (const { produit } of CAS) {
      expect(total(commissionsDeal(dossier(produit), CDI))).toBe(750)
    }
  })

  it('sous un autre produit, le montant tombe dans le barème prime unique', () => {
    // Ce test documente le piège plutôt qu'il ne le valide : c'est pour cela
    // que le formulaire doit orienter vers le bon produit.
    const mauvais = commissionsDeal({ product: 'Assurance Vie Française', pu: 1500, pp_m: 45 }, CDI)
    const ligne = mauvais.find((l) => l.produitKey === 'pu_versement_libre')
    expect(ligne.taux).toBe(0.25)
    expect(ligne.montant).toBe(3.75)
  })

  it("cocher « ordre de placement » annule tout — d'où le masquage du formulaire", () => {
    for (const { produit } of CAS) {
      expect(total(commissionsDeal(dossier(produit, { is_ordre_placement: true }), CDI))).toBe(0)
    }
  })
})
