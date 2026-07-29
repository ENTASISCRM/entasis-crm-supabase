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

// Métriques agrégées d'un advisor sur un mois donné.
// Pour un deal signé, c'est le mois où il a été signé (date_signed)
// qui compte, pas le mois où le deal a été créé. Le code attend que la
// colonne month du deal ait déjà été alignée sur date_signed à la sauvegarde
// (cf saveDeal dans App.jsx). Cette fonction filtre simplement sur month.
export function advisorMetrics(deals, month, code) {
  const scoped = deals.filter(d => dealDuMois(d, month) && dealMatchesAdvisor(d, code));
  const signed = scoped.filter(d => d.status === 'Signé');
  const pipeline = scoped.filter(d => isPipeline(d.status));

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

  return {
    total: scoped.length,
    signedCount,
    pipelineCount,
    ppSigned: ppS,
    puSigned: puS,
    ppPipeline: ppP,
    puPipeline: puP,
    ppProjected: ppS + ppP,
    puProjected: puS + puP,
    ppMutuelleSigned: ppMutS,
    ppMutuellePipeline: ppMutP,
    ppMutuelleProjected: ppMutS + ppMutP,
    signRate: scoped.length > 0
      ? Math.round((signedCount / scoped.length) * 100)
      : 0,
    avgPp: signedCount > 0 ? ppS / signedCount : 0,
    hotDeals: scoped.filter(d => d.priority === 'Urgente' || d.priority === 'Haute'),
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
