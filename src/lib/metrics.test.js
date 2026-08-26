import { describe, it, expect } from 'vitest';
import {
  MONTHS,
  annualize,
  isPipeline,
  dealMatchesAdvisor,
  sumAnnualPp,
  sumAnnualPpMutuelle,
  sumPu,
  advisorMetrics,
  monthFromDate,
  alignedMonthForDeal, estSimpleRdv, entonnoirLeads, compterPipeline } from './metrics';

describe('annualize', () => {
  it('multiplie par 12 le PP mensuel', () => {
    expect(annualize(100)).toBe(1200);
    expect(annualize('500')).toBe(6000);
  });
  it('renvoie 0 pour null/undefined/empty', () => {
    expect(annualize(null)).toBe(0);
    expect(annualize(undefined)).toBe(0);
    expect(annualize('')).toBe(0);
  });
});

describe('isPipeline', () => {
  it('true pour En cours ou Prévu', () => {
    expect(isPipeline('En cours')).toBe(true);
    expect(isPipeline('Prévu')).toBe(true);
  });
  it('false pour Signé/Annulé/autre', () => {
    expect(isPipeline('Signé')).toBe(false);
    expect(isPipeline('Annulé')).toBe(false);
    expect(isPipeline('')).toBe(false);
    expect(isPipeline(null)).toBe(false);
  });
});

describe('dealMatchesAdvisor', () => {
  it('true si advisor titulaire ou co-conseil', () => {
    expect(dealMatchesAdvisor({ advisor_code: 'LH' }, 'LH')).toBe(true);
    expect(dealMatchesAdvisor({ advisor_code: 'JD', co_advisor_code: 'LH' }, 'LH')).toBe(true);
  });
  it('false sinon', () => {
    expect(dealMatchesAdvisor({ advisor_code: 'JD' }, 'LH')).toBe(false);
  });
});

describe('sumAnnualPp', () => {
  it('somme directe sans co-conseil', () => {
    const deals = [
      { pp_m: 100, advisor_code: 'LH' },
      { pp_m: 200, advisor_code: 'LH' },
    ];
    expect(sumAnnualPp(deals, 'LH')).toBe((100 + 200) * 12);
  });

  it('applique le 50/50 si co-conseil et advisorCode fourni', () => {
    const deals = [
      { pp_m: 100, advisor_code: 'LH', co_advisor_code: 'JD' },
    ];
    expect(sumAnnualPp(deals, 'LH')).toBe(100 * 12 * 0.5);
    expect(sumAnnualPp(deals, 'JD')).toBe(100 * 12 * 0.5);
  });

  it('full si pas d\'advisorCode (vue globale cabinet)', () => {
    const deals = [{ pp_m: 100, advisor_code: 'LH', co_advisor_code: 'JD' }];
    expect(sumAnnualPp(deals)).toBe(1200);
  });

  it('renvoie 0 pour liste vide', () => {
    expect(sumAnnualPp([], 'LH')).toBe(0);
  });

  // Séparation PP financière / Mutuelle (décision Louis 2026-06-08)
  it('exclut les deals Mutuelle Santé du compteur PP financière', () => {
    const deals = [
      { pp_m: 100, product: 'PER Individuel' },
      { pp_m: 50, product: 'Mutuelle Santé' },
    ];
    expect(sumAnnualPp(deals)).toBe(100 * 12);
  });

  it('exclut les deals Prévoyance TNS du compteur PP financière', () => {
    const deals = [
      { pp_m: 100, product: 'Assurance Vie Française' },
      { pp_m: 80, product: 'Prévoyance TNS' },
    ];
    expect(sumAnnualPp(deals)).toBe(100 * 12);
  });
});

describe('sumPu', () => {
  it('somme directe', () => {
    expect(sumPu([{ pu: 1000 }, { pu: 2000 }])).toBe(3000);
  });
  it('50/50 si co-conseil', () => {
    expect(sumPu([{ pu: 1000, advisor_code: 'LH', co_advisor_code: 'JD' }], 'LH')).toBe(500);
  });
});

describe('sumAnnualPpMutuelle', () => {
  it('ne somme que les deals Mutuelle Santé et Prévoyance TNS', () => {
    const deals = [
      { pp_m: 100, product: 'PER Individuel' },       // exclu (financier)
      { pp_m: 50, product: 'Mutuelle Santé' },        // inclus
      { pp_m: 80, product: 'Prévoyance TNS' },        // inclus
      { pp_m: 30, product: 'SCPI' },                  // exclu
    ];
    expect(sumAnnualPpMutuelle(deals)).toBe((50 + 80) * 12);
  });

  it('applique la règle 50/50 en co-conseil', () => {
    const deals = [
      { pp_m: 100, product: 'Mutuelle Santé', advisor_code: 'LH', co_advisor_code: 'JD' },
    ];
    expect(sumAnnualPpMutuelle(deals, 'LH')).toBe(100 * 12 * 0.5);
  });
});

describe('advisorMetrics', () => {
  const deals = [
    // LH, signé en MAI, PP 500/mois -> 6000 annualisés
    { id: '1', month: 'MAI', advisor_code: 'LH', status: 'Signé', pp_m: 500, pu: 10000 },
    // LH, en cours en MAI, PP 200/mois
    { id: '2', month: 'MAI', advisor_code: 'LH', status: 'En cours', pp_m: 200, pu: 5000 },
    // LH, signé en AVRIL (mois précédent)
    { id: '3', month: 'AVRIL', advisor_code: 'LH', status: 'Signé', pp_m: 1000, pu: 0 },
    // JD, signé en MAI
    { id: '4', month: 'MAI', advisor_code: 'JD', status: 'Signé', pp_m: 300, pu: 8000 },
    // Co-conseil LH+JD signé en MAI
    { id: '5', month: 'MAI', advisor_code: 'LH', co_advisor_code: 'JD', status: 'Signé', pp_m: 400, pu: 12000 },
  ];

  it('filtre LH MAI signé', () => {
    const m = advisorMetrics(deals, 'MAI', 'LH');
    // signés MAI LH, deal 1 (full) + deal 5 (co-conseil 50%)
    expect(m.ppSigned).toBe(500 * 12 + 400 * 12 * 0.5);
    expect(m.puSigned).toBe(10000 + 12000 * 0.5);
    // Deux dossiers signes, dont un a deux : c est bien DEUX signatures pour
    // lui. Ce test verrouillait 1,5, la valeur qui produisait un taux de
    // signature faux pour toute la moitie du cabinet qui travaille en binome.
    expect(m.signedCount).toBe(2);
    // La part ponderee reste disponible pour les montants (ticket moyen).
    expect(m.signedPart).toBe(1.5);
  });

  it('compte un dossier signe a deux comme UNE signature pour chacun', () => {
    const lh = advisorMetrics(deals, 'MAI', 'LH');
    const partage = deals.filter(d => d.month === 'MAI' && d.status === 'Signé' && d.co_advisor_code);
    expect(partage.length).toBeGreaterThan(0);
    const co = advisorMetrics(deals, 'MAI', partage[0].co_advisor_code);
    // Le meme dossier compte 1 chez le titulaire ET 1 chez le co conseiller,
    // alors que la PP, elle, est bien coupee en deux de chaque cote.
    expect(lh.signedCount).toBeGreaterThanOrEqual(1);
    expect(co.signedCount).toBeGreaterThanOrEqual(1);
  });

  it('ne descend pas le taux de signature d un conseiller en binome', () => {
    // Deux dossiers reels, les deux signes, dont un a deux : 100 pourcent.
    const jeu = [
      { id: 'a', month: 'MAI', status: 'Signé', advisor_code: 'ZZ', pp_m: 100, pu: 0, product: 'PER Individuel', date_signed: '2026-05-10' },
      { id: 'b', month: 'MAI', status: 'Signé', advisor_code: 'ZZ', co_advisor_code: 'YY', pp_m: 100, pu: 0, product: 'PER Individuel', date_signed: '2026-05-11' },
    ];
    expect(advisorMetrics(jeu, 'MAI', 'ZZ').signRate).toBe(100);
  });

  it('garde le ticket moyen pondere sur pondere', () => {
    const jeu = [
      { id: 'a', month: 'MAI', status: 'Signé', advisor_code: 'ZZ', co_advisor_code: 'YY', pp_m: 100, pu: 0, product: 'PER Individuel', date_signed: '2026-05-11' },
    ];
    const m = advisorMetrics(jeu, 'MAI', 'ZZ');
    // 1200 de PP annualisee, coupee a 600, divisee par une demi signature :
    // le ticket du dossier reste 1200, pas 600.
    expect(m.ppSigned).toBe(600);
    expect(m.avgPp).toBe(1200);
  });

  it('filtre LH MAI pipeline', () => {
    const m = advisorMetrics(deals, 'MAI', 'LH');
    expect(m.ppPipeline).toBe(200 * 12);
    expect(m.pipelineCount).toBe(1);
  });

  it('exclut le deal LH d\'AVRIL du dashboard MAI', () => {
    const m = advisorMetrics(deals, 'MAI', 'LH');
    // Le deal id=3 (AVRIL) ne doit pas être compté
    expect(m.ppSigned).toBe(500 * 12 + 400 * 12 * 0.5);
  });

  it('JD MAI a vu sa moitié du co-conseil', () => {
    const m = advisorMetrics(deals, 'MAI', 'JD');
    // Signés JD MAI = deal 4 (full) + deal 5 (50%)
    expect(m.ppSigned).toBe(300 * 12 + 400 * 12 * 0.5);
  });

  it('signRate = 100% si tous signés', () => {
    const m = advisorMetrics([
      { id: 'a', month: 'MAI', advisor_code: 'LH', status: 'Signé', pp_m: 100 },
      { id: 'b', month: 'MAI', advisor_code: 'LH', status: 'Signé', pp_m: 200 },
    ], 'MAI', 'LH');
    expect(m.signRate).toBe(100);
  });
});

describe('monthFromDate', () => {
  it('convertit ISO en mois FR', () => {
    expect(monthFromDate('2026-01-15')).toBe('JANVIER');
    expect(monthFromDate('2026-04-30')).toBe('AVRIL');
    expect(monthFromDate('2026-12-01')).toBe('DÉCEMBRE');
  });
  it('null pour invalide', () => {
    expect(monthFromDate(null)).toBeNull();
    expect(monthFromDate('')).toBeNull();
    expect(monthFromDate('not-a-date')).toBeNull();
  });
});

describe('alignedMonthForDeal (fix bug PP de Jean)', () => {
  it('aligne month sur date_signed quand status=Signé', () => {
    expect(alignedMonthForDeal({
      status: 'Signé',
      date_signed: '2026-04-15',
      month: 'MARS', // créé en mars
    })).toBe('AVRIL'); // doit être aligné sur date_signed
  });

  it('garde month si status pas Signé', () => {
    expect(alignedMonthForDeal({
      status: 'En cours',
      date_signed: '2026-04-15',
      month: 'MARS',
    })).toBe('MARS');
  });

  it('garde month si pas de date_signed', () => {
    expect(alignedMonthForDeal({
      status: 'Signé',
      date_signed: null,
      month: 'MARS',
    })).toBe('MARS');
  });

  it('renvoie null si deal vide', () => {
    expect(alignedMonthForDeal(null)).toBeNull();
    expect(alignedMonthForDeal({})).toBeNull();
  });
});

describe('MONTHS constants', () => {
  it('a bien 12 mois en français', () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[0]).toBe('JANVIER');
    expect(MONTHS[11]).toBe('DÉCEMBRE');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// RDV pris vs dossier réel
// ─────────────────────────────────────────────────────────────────────────
describe('estSimpleRdv', () => {
  const rdv = (o = {}) => ({ lead_id: 'L1', product: 'Autre', pu: 0, pp_m: 0, ...o });

  it('reconnaît un RDV créé par la Lead Room', () => {
    expect(estSimpleRdv(rdv())).toBe(true);
  });

  it('cesse d’en être un dès qu’un produit est choisi', () => {
    expect(estSimpleRdv(rdv({ product: 'PER Individuel' }))).toBe(false);
  });

  it('cesse d’en être un dès qu’un montant est saisi', () => {
    expect(estSimpleRdv(rdv({ pu: 10000 }))).toBe(false);
    expect(estSimpleRdv(rdv({ pp_m: 150 }))).toBe(false);
  });

  it('ne touche jamais un dossier saisi à la main', () => {
    expect(estSimpleRdv({ lead_id: null, product: 'Autre', pu: 0, pp_m: 0 })).toBe(false);
  });

  it('résiste aux valeurs absentes', () => {
    expect(estSimpleRdv(null)).toBe(false);
    expect(estSimpleRdv({ lead_id: 'L1' })).toBe(true);
  });
});

describe('advisorMetrics : les RDV sortent du pipeline', () => {
  const M = 'JUILLET';
  const base = { month: M, advisor_code: 'AA', status: 'Prévu' };
  // Juillet réel : 7 vrais dossiers en cours, 60 rendez-vous.
  const juillet = [
    ...Array.from({ length: 60 }, (_, i) => ({ ...base, id: `r${i}`, lead_id: `L${i}`, product: 'Autre', pu: 0, pp_m: 0 })),
    ...Array.from({ length: 7 }, (_, i) => ({ ...base, id: `d${i}`, lead_id: null, product: 'PER Individuel', pu: 10000, pp_m: 0 })),
    { ...base, id: 's1', status: 'Signé', lead_id: null, product: 'Assurance Vie Française', pu: 50000, pp_m: 0 },
  ];

  it('compte 7 dossiers en pipeline, pas 67', () => {
    const m = advisorMetrics(juillet, M, 'AA');
    expect(m.pipelineCount).toBe(7);
    expect(m.rdvCount).toBe(60);
  });

  it('garde le total brut intact et expose le total hors RDV', () => {
    const m = advisorMetrics(juillet, M, 'AA');
    expect(m.total).toBe(68);
    expect(m.totalHorsRdv).toBe(8);
  });

  it('calcule le taux de signature sur les dossiers réels', () => {
    // 1 signé sur 8 dossiers réels = 13 %. Sur 68 lignes brutes : 1 %.
    expect(advisorMetrics(juillet, M, 'AA').signRate).toBe(13);
  });

  it('un RDV qualifié rejoint le pipeline', () => {
    const qualifie = juillet.map(d => (d.id === 'r0' ? { ...d, product: 'SCPI', pu: 20000 } : d));
    const m = advisorMetrics(qualifie, M, 'AA');
    expect(m.pipelineCount).toBe(8);
    expect(m.rdvCount).toBe(59);
    expect(m.puPipeline).toBe(90000);
  });

  it('les RDV ne pèsent rien en volume, ils sont à zéro', () => {
    const m = advisorMetrics(juillet, M, 'AA');
    expect(m.puPipeline).toBe(70000);
    expect(m.ppPipeline).toBe(0);
  });
});

describe('entonnoirLeads', () => {
  const rdv = (o = {}) => ({ lead_id: 'L', product: 'Autre', pu: 0, pp_m: 0, status: 'Prévu', ...o });
  const manuel = (o = {}) => ({ lead_id: null, product: 'PER Individuel', pu: 10000, status: 'Signé', ...o });

  it('compte les trois étages', () => {
    const e = entonnoirLeads([
      rdv(), rdv(), rdv(),
      rdv({ product: 'PER Individuel', pu: 5000 }),
      rdv({ product: 'PER Individuel', pu: 5000, status: 'Signé' }),
    ]);
    expect(e.rdvPris).toBe(5);
    expect(e.qualifies).toBe(2);
    expect(e.signes).toBe(1);
  });

  it('donne des taux à une décimale', () => {
    const e = entonnoirLeads(Array.from({ length: 216 }, (_, i) => rdv(i < 6 ? { product: 'PER Individuel', pu: 1, status: 'Signé' } : {})));
    expect(e.tauxSignature).toBe(2.8);
  });

  it('sépare ce qui vient des leads du reste', () => {
    const e = entonnoirLeads([rdv(), manuel(), manuel(), manuel({ status: 'Prévu' })]);
    expect(e.rdvPris).toBe(1);
    expect(e.horsLeads).toBe(3);
    expect(e.horsLeadsSignes).toBe(2);
  });

  it('ne divise pas par zéro', () => {
    expect(entonnoirLeads([]).tauxSignature).toBe(0);
    expect(entonnoirLeads(null).rdvPris).toBe(0);
  });

  it('ignore les lignes nulles', () => {
    expect(entonnoirLeads([null, rdv(), undefined]).rdvPris).toBe(1);
  });
});

describe('compterPipeline', () => {
  const base = (o) => ({ month: 'MAI', status: 'En cours', product: 'PER Individuel', pu: 1000, ...o });

  it('compte les dossiers en cours du mois, tout le cabinet sans code', () => {
    const deals = [
      base({ id: 'a', advisor_code: 'LH' }),
      base({ id: 'b', advisor_code: 'NANS' }),
      base({ id: 'c', advisor_code: 'LH', status: 'Signé' }),
    ];
    expect(compterPipeline(deals, 'MAI')).toBe(2);
  });

  it('se limite à un conseiller quand un code est donné', () => {
    const deals = [
      base({ id: 'a', advisor_code: 'LH' }),
      base({ id: 'b', advisor_code: 'NANS' }),
    ];
    expect(compterPipeline(deals, 'MAI', 'LH')).toBe(1);
  });

  it('exclut les RDV non qualifiés, des deux côtés', () => {
    // Un placeholder Lead Room : rattaché à un lead, sans produit ni montant.
    const rdv = { id: 'r', month: 'MAI', status: 'Prévu', advisor_code: 'LH', lead_id: 42, product: 'Autre', pu: 0, pp_m: 0 };
    const deals = [base({ id: 'a', advisor_code: 'LH' }), rdv];
    expect(compterPipeline(deals, 'MAI')).toBe(1);
    expect(compterPipeline(deals, 'MAI', 'LH')).toBe(1);
  });

  it('ignore les autres mois', () => {
    expect(compterPipeline([base({ id: 'a', advisor_code: 'LH', month: 'AVRIL' })], 'MAI')).toBe(0);
  });

  it('ne dépend plus de la priorité — le champ que personne ne renseigne', () => {
    const deals = [
      base({ id: 'a', advisor_code: 'LH', priority: 'Normale' }),
      base({ id: 'b', advisor_code: 'LH', priority: 'Haute' }),
    ];
    expect(compterPipeline(deals, 'MAI', 'LH')).toBe(2);
  });

  it('encaisse une entrée absente', () => {
    expect(compterPipeline(undefined, 'MAI')).toBe(0);
    expect(compterPipeline(null, 'MAI', 'LH')).toBe(0);
  });
});
