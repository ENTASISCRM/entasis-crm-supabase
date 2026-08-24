// ═══════════════════════════════════════════════════════════════════════════
// RÉMUNÉRATION ASSURANCE EMPRUNTEUR
//
// Règle Louis (24/08/2026) : « les frais sur l'assurance emprunteur c'est nous
// qui fixons et on prend rien sur la prime par mois ».
//
// Autrement dit : la base de rémunération est le montant des frais de dossier,
// pris à 100 % — ce n'est pas un pourcentage d'une prime, c'est une somme que
// le cabinet fixe. La prime mensuelle du client ne rapporte rien. Le conseiller
// touche la moitié des frais (Louis 24/07/2026).
//
// Ces tests existent parce que le contraire s'est produit : un dossier saisi
// sous un autre produit faisait tomber les frais dans le barème « prime unique »
// à 0,25 %, soit 3,75 € au lieu de 750 € (remonté par Nans le 24/08).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { commissionsDeal, mapProduitDeal, assietteDeal } from './calcul-commission.js'
import { BAREME_PRODUITS } from './bareme-entasis.js'

const CDI = { type_contrat: 'CDI', rentabilise: true }
const CDI_NON_RENTA = { type_contrat: 'CDI', rentabilise: false }
const MANDATAIRE = { type_contrat: 'Mandataire', rentabilise: false }

// 1 500 € de frais de dossier fixés par le cabinet, prime de 45 €/mois.
const dossier = (extra = {}) => ({
  product: 'Assurance de Prêt', pu: 1500, pp_m: 45, ...extra,
})
const total = (lignes) => lignes.reduce((s, l) => s + l.montant, 0)

describe('mapping du produit', () => {
  it('reconnaît le libellé du formulaire', () => {
    expect(mapProduitDeal({ product: 'Assurance de Prêt' })).toBe('assurance_pret')
  })

  it('reconnaît aussi « emprunteur », quelle que soit la casse', () => {
    expect(mapProduitDeal({ product: 'Assurance emprunteur' })).toBe('assurance_pret')
    expect(mapProduitDeal({ product: 'ASSURANCE DE PRÊT' })).toBe('assurance_pret')
  })

  it("passe avant l'assurance vie, qui contient presque le même mot", () => {
    expect(mapProduitDeal({ product: 'Assurance Vie Française' })).toBe('av')
  })
})

describe('assiette : les frais de dossier, à 100 %', () => {
  it('prend le montant saisi tel quel, sans pourcentage', () => {
    expect(assietteDeal(dossier(), 'assurance_pret')).toBe(1500)
  })

  it('ignore complètement la prime mensuelle', () => {
    expect(assietteDeal(dossier({ pp_m: 45 }), 'assurance_pret'))
      .toBe(assietteDeal(dossier({ pp_m: 0 }), 'assurance_pret'))
  })

  it("ne dépend pas du taux de frais d'entrée saisi ailleurs dans le dossier", () => {
    for (const pct of [0, 1, 2.5, 4]) {
      expect(total(commissionsDeal(dossier({ frais_entree_pu_pct: pct }), CDI))).toBe(750)
    }
  })
})

describe('rien sur la prime mensuelle', () => {
  it('ne produit aucune ligne de commission sur la PP', () => {
    const lignes = commissionsDeal(dossier(), CDI)
    expect(lignes).toHaveLength(1)
    expect(lignes[0].produitKey).toBe('assurance_pret')
  })

  it('donne le même montant que la prime soit saisie ou non', () => {
    expect(total(commissionsDeal(dossier({ pp_m: 500 }), CDI)))
      .toBe(total(commissionsDeal(dossier({ pp_m: 0 }), CDI)))
  })

  it('ne rapporte rien si seule la prime est saisie, sans frais', () => {
    expect(total(commissionsDeal(dossier({ pu: 0, pp_m: 45 }), CDI))).toBe(0)
  })
})

describe('partage 50 / 50 avec le cabinet', () => {
  it('verse la moitié des frais au conseiller, quel que soit son contrat', () => {
    for (const contrat of [CDI, CDI_NON_RENTA, MANDATAIRE]) {
      expect(total(commissionsDeal(dossier(), contrat))).toBe(750)
    }
  })

  it('coupe encore en deux avec un co-conseiller', () => {
    expect(total(commissionsDeal(dossier(), CDI, 0.5))).toBe(375)
  })

  it('commissionne dès le premier euro, sans condition de palier', () => {
    expect(BAREME_PRODUITS.assurance_pret.horsPalier).toBe(true)
    expect(total(commissionsDeal(dossier({ pu: 1 }), CDI))).toBe(0.5)
  })
})

describe("le bug remonté par Nans ne doit pas revenir", () => {
  it("saisi sous « Assurance de Prêt », les frais rapportent 750 € et non 3,75 €", () => {
    expect(total(commissionsDeal(dossier(), CDI))).toBe(750)
  })

  it('sous un autre produit, les frais tombent dans le barème prime unique', () => {
    // Ce test documente le piège plutôt qu'il ne le valide : c'est pour cela
    // que le formulaire doit orienter vers le bon produit.
    const mauvais = commissionsDeal({ product: 'Assurance Vie Française', pu: 1500, pp_m: 45 }, CDI)
    const ligneFrais = mauvais.find((l) => l.produitKey === 'pu_versement_libre')
    expect(ligneFrais.taux).toBe(0.25)
    expect(ligneFrais.montant).toBe(3.75)
  })
})
