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
  alignedMonthForDeal,
} from './metrics';

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
    expect(m.signedCount).toBe(1 + 0.5);
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

  it('hotDeals = priorité Urgente ou Haute', () => {
    const m = advisorMetrics([
      { id: 'a', month: 'MAI', advisor_code: 'LH', status: 'En cours', pp_m: 100, priority: 'Urgente' },
      { id: 'b', month: 'MAI', advisor_code: 'LH', status: 'En cours', pp_m: 100, priority: 'Normale' },
    ], 'MAI', 'LH');
    expect(m.hotDeals.length).toBe(1);
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
