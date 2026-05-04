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

// Somme des PP annualisées. Si advisorCode est fourni et que le deal a un
// co_advisor_code, applique la règle 50/50.
export function sumAnnualPp(deals, advisorCode) {
  return deals.reduce((sum, d) => {
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
  const scoped = deals.filter(d => d.month === month && dealMatchesAdvisor(d, code));
  const signed = scoped.filter(d => d.status === 'Signé');
  const pipeline = scoped.filter(d => isPipeline(d.status));

  const ppS = sumAnnualPp(signed, code);
  const puS = sumPu(signed, code);
  const ppP = sumAnnualPp(pipeline, code);
  const puP = sumPu(pipeline, code);

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
  return deal?.month || null;
}
