// api/editorial/fiscal-constants.js
// Source de vérité fiscale injectée dans les prompts de l'agent éditorial pour
// empêcher toute hallucination de chiffre. Les valeurs sont reprises de
// src/lib/per-fiscal.js (vérifiées, à jour LF 2026 / LFSS 2026) — ne pas
// "corriger" un chiffre ici sans mettre à jour per-fiscal.js et le site.
//
// Sources légales :
//  - LF 2026    : loi de finances pour 2026, promulguée le 19/02/2026
//  - LFSS 2026  : loi n° 2025-1403 du 30/12/2025 de financement de la
//                 sécurité sociale pour 2026
// Aucune variable d'environnement requise.

export const FISCAL_CONSTANTS = {
  // ── PASS ──────────────────────────────────────────────────────────────────
  // Plafond annuel de la sécurité sociale. Le plafond épargne retraite des
  // versements 2026 (formule salarié) se calcule sur le PASS N-1 (2025),
  // règle N-1 — ne pas utiliser le PASS 2026 pour ce calcul.
  PASS_2024: 46368,
  PASS_2025: 47100, // référence des plafonds de versements PER 2026 (règle N-1)
  PASS_2026: 48060,

  // ── Barème IR ─────────────────────────────────────────────────────────────
  // LF 2026 (19/02/2026), applicable aux revenus 2025 (tranches +0,9 %).
  TRANCHES_IR_2026: [
    { min: 0, max: 11600, taux: 0 },
    { min: 11600, max: 29579, taux: 0.11 },
    { min: 29579, max: 84577, taux: 0.30 },
    { min: 84577, max: 181917, taux: 0.41 },
    { min: 181917, max: Infinity, taux: 0.45 },
  ],

  // Plafond de l'abattement 10 % sur les pensions (revenus 2025 / IR 2026) —
  // revalorisé à chaque loi de finances.
  PLAFOND_ABATTEMENT_PENSIONS: 4439,

  // ── PFU / prélèvements sociaux ────────────────────────────────────────────
  // LFSS 2026 (loi n° 2025-1403 du 30/12/2025) : hausse des PS de 17,2 % à
  // 18,6 % sur les revenus du capital financier.
  PFU_CAPITAL_2026: 0.314,      // plus-values PER, CTO, dividendes : 12,8 % IR + 18,6 % PS
  PS_CAPITAL_2026: 0.186,       // prélèvements sociaux capital financier (LFSS 2026)
  PS_BIC_LMNP_2026: 0.186,      // PS sur bénéfices BIC LMNP (LFSS 2026)
  // Explicitement EXCLUS de la hausse LFSS 2026 (restent à 17,2 %) :
  PS_IMMO_2026: 0.172,          // plus-values immobilières, revenus fonciers, SCPI

  // ── Assurance vie ─────────────────────────────────────────────────────────
  // PFU assurance vie MAINTENU à 30 % (PS restés à 17,2 % pour l'AV).
  AV_PFU: 0.30,                 // avant 8 ans : 12,8 % IR + 17,2 % PS
  AV_PS: 0.172,
  AV_TAUX_REDUIT_8ANS: 0.075,   // IR réduit après 8 ans (sous 150 000 € de versements)
  AV_ABATTEMENT_CELIB: 4600,    // abattement annuel sur gains après 8 ans (célibataire)
  AV_ABATTEMENT_COUPLE: 9200,   // idem, couple soumis à imposition commune
  AV_SEUIL_VERSEMENTS: 150000,  // au-delà : 12,8 % sur la fraction excédentaire

  // ── Plafond PER TNS ───────────────────────────────────────────────────────
  // 10 % du bénéfice imposable (plancher 10 % du PASS, plafond 10 % × 8 PASS)
  // + majoration de 15 % sur la fraction du bénéfice comprise entre 1 et 8 PASS.
  PER_TNS: {
    tauxBase: 0.10,
    tauxMajoration: 0.15,
    plancherPass: 1,   // plancher : 10 % × 1 PASS
    plafondPass: 8,    // plafond : 10 % × 8 PASS (+ majoration 15 % entre 1 et 8 PASS)
  },

  // ── Règle des années de référence (versements 2026) ──────────────────────
  // Deux régimes DIFFÉRENTS, source d'erreurs fréquente :
  //  - SALARIÉ (art. 163 quatervicies CGI) : revenus pros et PASS de N-1.
  //    Versements 2026 → revenus 2025 et PASS 2025 (47 100 €).
  //  - TNS (art. 154 bis CGI, « Madelin ») : bénéfice et PASS de l'ANNÉE EN
  //    COURS. Versements 2026 → bénéfice 2026 et PASS 2026 (48 060 €,
  //    arrêté du 22/12/2025).
  PLAFOND_PER_SALARIE_2026: {
    passReference: 47100,  // PASS 2025 (règle N-1)
    plancher: 4710,        // 10 % × PASS 2025
    max: 37680,            // 10 % × 8 × PASS 2025
  },
  PLAFOND_PER_TNS_2026: {
    passReference: 48060,  // PASS 2026 (année en cours, arrêté du 22/12/2025)
    plancher: 4806,        // 10 % × PASS 2026
    max: 88911,            // 10 % × 8 PASS + 15 % × 7 PASS = 1,85 × PASS 2026
  },
};

const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',').replace(',0', '')} %`;
const eur = (n) => `${n.toLocaleString('fr-FR')} €`;

// Rend les constantes en bloc texte prêt à injecter dans un system prompt.
export function formatFiscalContext() {
  const C = FISCAL_CONSTANTS;
  const tranches = C.TRANCHES_IR_2026
    .map((t) =>
      t.max === Infinity
        ? `  - ${pct(t.taux)} au-delà de ${eur(t.min)}`
        : `  - ${pct(t.taux)} de ${eur(t.min)} à ${eur(t.max)}`
    )
    .join('\n');

  return `DONNÉES FISCALES VÉRIFIÉES (seules valeurs chiffrées autorisées, avec les chiffres issus des sources web citées) :

PASS (plafond annuel de la sécurité sociale) :
  - PASS 2024 : ${eur(C.PASS_2024)}
  - PASS 2025 : ${eur(C.PASS_2025)}
  - PASS 2026 : ${eur(C.PASS_2026)} (arrêté du 22/12/2025)

Barème IR — LF 2026 du 19/02/2026, applicable aux revenus 2025 :
${tranches}

Plafond de l'abattement 10 % sur les pensions : ${eur(C.PLAFOND_ABATTEMENT_PENSIONS)} (revenus 2025 / IR 2026)

PFU et prélèvements sociaux — LFSS 2026 (loi n° 2025-1403 du 30/12/2025) :
  - Plus-values PER / CTO / dividendes : PFU ${pct(C.PFU_CAPITAL_2026)} (12,8 % IR + 18,6 % PS)
  - PS sur bénéfices BIC LMNP : ${pct(C.PS_BIC_LMNP_2026)}
  - Plus-values immobilières, revenus fonciers et SCPI : ${pct(C.PS_IMMO_2026)} (explicitement EXCLUS de la hausse LFSS 2026)

Assurance vie (PFU maintenu, PS restés à 17,2 %) :
  - PFU avant 8 ans : ${pct(C.AV_PFU)} (12,8 % IR + 17,2 % PS)
  - Taux IR réduit après 8 ans : ${pct(C.AV_TAUX_REDUIT_8ANS)} (sous ${eur(C.AV_SEUIL_VERSEMENTS)} de versements, 12,8 % au-delà)
  - Abattements annuels après 8 ans : ${eur(C.AV_ABATTEMENT_CELIB)} (célibataire) / ${eur(C.AV_ABATTEMENT_COUPLE)} (couple)

Plafonds de déduction PER pour des versements 2026 — RÈGLE DES ANNÉES DE RÉFÉRENCE (deux régimes différents, ne JAMAIS les confondre) :
  - SALARIÉ (art. 163 quatervicies CGI) : 10 % des revenus professionnels N-1, calculé sur le PASS N-1 (2025 = ${eur(C.PLAFOND_PER_SALARIE_2026.passReference)}).
    Plancher ${eur(C.PLAFOND_PER_SALARIE_2026.plancher)}, maximum ${eur(C.PLAFOND_PER_SALARIE_2026.max)}.
  - TNS / profession libérale (art. 154 bis CGI) : 10 % du bénéfice + majoration de 15 % sur la fraction du bénéfice entre 1 et 8 PASS, calculé sur le bénéfice et le PASS de l'ANNÉE EN COURS (2026 = ${eur(C.PLAFOND_PER_TNS_2026.passReference)}, arrêté du 22/12/2025).
    Plancher ${eur(C.PLAFOND_PER_TNS_2026.plancher)}, maximum ${eur(C.PLAFOND_PER_TNS_2026.max)}.
  - Si tu cites un plafond, précise TOUJOURS le PASS de référence correspondant au bon régime (47 100 € pour salarié, 48 060 € pour TNS).

RÈGLE ABSOLUE : tout chiffre fiscal cité dans l'article DOIT provenir de ce bloc ou d'une source web explicitement citée dans "sources". N'invente JAMAIS un taux, un plafond ou un montant.`;
}
