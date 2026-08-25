// src/lib/metrics.js
// Fonctions financières critiques du CRM extraites pour pouvoir être
// testées indépendamment (cf src/lib/metrics.test.js).
//
// Règle d'or, un changement ici doit toujours s'accompagner d'un test
// (ou de la mise à jour des tests existants).

export const MONTHS = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE',
];

// Convertit un montant mensuel récurrent en équivalent annuel.
export const annualize = (ppm) => Number(ppm || 0) * 12;

// True si le deal est encore dans le pipeline (pas signé ni annulé).
export const isPipeline = (status) => status === 'En cours' || status === 'Prévu';

// ─── RDV pris vs dossier réel ────────────────────────────────────────────
// Quand un lead prend rendez-vous, la Lead Room crée une ligne dans `deals`.
// Ce n'est pas un dossier : date_expected porte une HEURE (09:00, 13:15), les
// montants sont à zéro et le produit reste « Autre ». C'est une entrée
// d'agenda qui a la forme d'un dossier.
//
// Mesuré le 24/08/2026 : sur juillet, le pipeline annonçait 67 dossiers — il
// y en avait 7. Les 60 autres étaient des rendez-vous passés. Le compteur,
// l'alerte de vieillissement et le taux de signature s'en trouvaient faussés.
//
// Un rendez-vous cesse d'en être un dès que quelqu'un le qualifie : un
// produit choisi ou un montant saisi suffit. On ne le cache jamais, on le
// compte à part.
export const estSimpleRdv = (deal) =>
  !!deal
  && deal.lead_id != null
  && (deal.product === 'Autre' || !deal.product)
  && !Number(deal.pu || 0)
  && !Number(deal.pp_m || 0);

// Match advisor (titulaire ou co-conseil).
export const dealMatchesAdvisor = (deal, code) =>
  deal.advisor_code === code || deal.co_advisor_code === code;

// Catégorisation produit (décision Louis 2026-06-08).
// La PP "financière" ne compte que les vrais produits patrimoniaux
// (épargne PER/AV, SCPI, Produits Structurés, Private Equity). La Mutuelle
// Santé et la Prévoyance TNS, bien que stockées avec un pp_m mensuel, ne
// relèvent pas du même métier (assurance personnes, pas patrimoine). Elles
// sortent désormais des compteurs PP cabinet et sont agrégées séparément
// via sumAnnualPpMutuelle.
const PRODUITS_MUTUELLE_PREVOYANCE = new Set([
  'Mutuelle Santé',
  'Mutuelle Sante',          // tolérance accents
  'Prévoyance TNS',
  'Prevoyance TNS',
]);

// True si le deal relève de la PP financière patrimoniale (= compteur PP
// historique amputé des produits assurance personnes).
export function isPpFinancier(deal) {
  if (!deal) return false;
  if (!deal.pp_m || Number(deal.pp_m) <= 0) return false;
  const produit = (deal.product || deal.produit || '').trim();
  return !PRODUITS_MUTUELLE_PREVOYANCE.has(produit);
}

// True si le deal est une PP mutuelle / prévoyance (assurance personnes).
export function isPpMutuelle(deal) {
  if (!deal) return false;
  if (!deal.pp_m || Number(deal.pp_m) <= 0) return false;
  const produit = (deal.product || deal.produit || '').trim();
  return PRODUITS_MUTUELLE_PREVOYANCE.has(produit);
}

// Somme des PP annualisées FINANCIÈRES (épargne, SCPI, PS, PE). Si
// advisorCode est fourni et que le deal a un co_advisor_code, applique
// la règle 50/50. Les deals Mutuelle / Prévoyance sont EXCLUS depuis
// 2026-06-08 (décision Louis, voir isPpFinancier).
export function sumAnnualPp(deals, advisorCode) {
  return deals.reduce((sum, d) => {
    if (!isPpFinancier(d)) return sum;
    const pp = annualize(d.pp_m);
    if (advisorCode && d.co_advisor_code) return sum + pp * 0.5;
    return sum + pp;
  }, 0);
}

// Somme des PP annualisées MUTUELLE / PRÉVOYANCE TNS. Même règle 50/50.
// Ajout 2026-06-08 (séparation métier patrimoine vs assurance personnes).
export function sumAnnualPpMutuelle(deals, advisorCode) {
  return deals.reduce((sum, d) => {
    if (!isPpMutuelle(d)) return sum;
    const pp = annualize(d.pp_m);
    if (advisorCode && d.co_advisor_code) return sum + pp * 0.5;
    return sum + pp;
  }, 0);
}

// Somme des PU. Même règle 50/50 que sumAnnualPp.
export function sumPu(deals, advisorCode) {
  return deals.reduce((sum, d) => {
    const pu = Number(d.pu || 0);
    if (advisorCode && d.co_advisor_code) return sum + pu * 0.5;
    return sum + pu;
  }, 0);
}

// ─── Entonnoir des leads ─────────────────────────────────────────────────
// Ce que rapporte réellement l'acquisition. Mesuré le 24/08/2026 : 216 RDV
// issus de la Lead Room, 6 contrats signés — 2,8 %. En face, 249 dossiers
// saisis à la main ont donné 194 signatures. Le cabinet ne voyait ce chiffre
// nulle part.
//
// Volontairement CUMULATIF, pas mensuel : la colonne month d'un dossier signé
// est alignée sur date_signed, donc un RDV pris en juillet et signé en août
// change de mois. Un entonnoir mensuel afficherait des RDV sans signatures
// d'un côté et des signatures sans RDV de l'autre. Sur l'ensemble, le compte
// est juste.
export function entonnoirLeads(deals) {
  const issus = (deals || []).filter((d) => d && d.lead_id != null);
  const qualifies = issus.filter((d) => !estSimpleRdv(d));
  const signes = issus.filter((d) => d.status === 'Signé');
  const pct = (n, total) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    rdvPris: issus.length,
    qualifies: qualifies.length,
    signes: signes.length,
    tauxQualification: pct(qualifies.length, issus.length),
    tauxSignature: pct(signes.length, issus.length),
    // Point de comparaison : ce que donne le reste, réseau et parrainage.
    horsLeads: (deals || []).filter((d) => d && d.lead_id == null).length,
    horsLeadsSignes: (deals || []).filter((d) => d && d.lead_id == null && d.status === 'Signé').length,
  };
}

// Métriques agrégées d'un advisor sur un mois donné.
// Pour un deal signé, c'est le mois où il a été signé (date_signed)
// qui compte, pas le mois où le deal a été créé. Le code attend que la
// colonne month du deal ait déjà été alignée sur date_signed à la sauvegarde
// (cf saveDeal dans App.jsx). Cette fonction filtre simplement sur month.
export function advisorMetrics(deals, month, code) {
  const scoped = deals.filter(d => dealDuMois(d, month) && dealMatchesAdvisor(d, code));
  const signed = scoped.filter(d => d.status === 'Signé');
  // Les rendez-vous non qualifiés sortent du pipeline : ils le gonflaient
  // d'un facteur 10 certains mois. Ils restent comptés dans rdvCount.
  const enCours = scoped.filter(d => isPipeline(d.status));
  const rdv = enCours.filter(estSimpleRdv);
  const pipeline = enCours.filter(d => !estSimpleRdv(d));

  const ppS = sumAnnualPp(signed, code);
  const puS = sumPu(signed, code);
  const ppP = sumAnnualPp(pipeline, code);
  const puP = sumPu(pipeline, code);
  // PP Mutuelle / Prévoyance (assurance personnes), ajout 2026-06-08.
  const ppMutS = sumAnnualPpMutuelle(signed, code);
  const ppMutP = sumAnnualPpMutuelle(pipeline, code);

  // Comptage 0.5 si co-conseil pour ne pas double compter au global.
  const signedCount = signed.reduce((s, d) => s + (d.co_advisor_code ? 0.5 : 1), 0);
  const pipelineCount = pipeline.reduce((s, d) => s + (d.co_advisor_code ? 0.5 : 1), 0);
  const rdvCount = rdv.reduce((s, d) => s + (d.co_advisor_code ? 0.5 : 1), 0);
  // Dénominateur du taux de signature : les dossiers réels. Un rendez-vous
  // qui n'a jamais été qualifié n'est pas une occasion manquée de signer.
  const dossiersReels = scoped.filter(d => !estSimpleRdv(d));

  return {
    total: scoped.length,
    totalHorsRdv: dossiersReels.length,
    signedCount,
    pipelineCount,
    rdvCount,
    ppSigned: ppS,
    puSigned: puS,
    ppPipeline: ppP,
    puPipeline: puP,
    ppProjected: ppS + ppP,
    puProjected: puS + puP,
    ppMutuelleSigned: ppMutS,
    ppMutuellePipeline: ppMutP,
    ppMutuelleProjected: ppMutS + ppMutP,
    signRate: dossiersReels.length > 0
      ? Math.round((signedCount / dossiersReels.length) * 100)
      : 0,
    avgPp: signedCount > 0 ? ppS / signedCount : 0,
    // Les priorités remontées au conseiller : des dossiers, pas des RDV non
    // qualifiés, qui portent la priorité par défaut de la Lead Room.
    hotDeals: dossiersReels.filter(d => d.priority === 'Urgente' || d.priority === 'Haute'),
  };
}

// Convertit une date ISO (YYYY-MM-DD) en mois français pour la colonne month.
// Renvoie null si la date est invalide.
export function monthFromDate(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^\d{4}-(\d{2})/);
  if (!m) return null;
  const idx = parseInt(m[1], 10) - 1;
  return MONTHS[idx] || null;
}

// Pour un deal sauvegardé, on aligne le month sur date_signed dès qu'il
// est signé (sinon la PP du deal n'apparaît pas dans le dashboard du mois
// de signature).
export function alignedMonthForDeal(deal) {
  if (deal?.status === 'Signé' && deal?.date_signed) {
    const aligned = monthFromDate(deal.date_signed);
    if (aligned) return aligned;
  }
  // En cours / Prévu : le mois suit la date de signature PRÉVUE (sinon un
  // dossier attendu en août restait dans le prévisionnel de juillet, 83
  // dossiers réalignés en base le 27/07/2026).
  if ((deal?.status === 'En cours' || deal?.status === 'Prévu') && deal?.date_expected) {
    const aligned = monthFromDate(deal.date_expected);
    if (aligned) return aligned;
  }
  return deal?.month || null;
}

// Année de rattachement d'un deal : la date de signature fait foi pour un
// dossier signé, la date prévue sinon, created_at en dernier recours.
// Sert à ne pas mélanger « Novembre 2025 » et « Novembre 2026 » dans les
// vues mensuelles (bug signalé par Gianni le 24/07/2026 : impossible de
// saisir les clients signés avant la mise en place du CRM).
export function anneeDuDeal(deal) {
  const src = (deal?.status === 'Signé' && deal?.date_signed)
    ? deal.date_signed
    : (deal?.date_expected || deal?.created_at);
  const y = src ? new Date(src).getFullYear() : NaN;
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

// Un deal appartient au mois affiché si son libellé de mois correspond ET
// que son année est celle demandée (la navigation de l'app est dans
// l'année courante). Les dossiers historiques restent visibles dans la vue
// « Tous les mois », les fiches clients et le Multi-équipement.
export function dealDuMois(deal, monthStr, year = new Date().getFullYear()) {
  return deal?.month === monthStr && anneeDuDeal(deal) === year;
}
