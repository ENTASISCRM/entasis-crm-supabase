import { describe, it, expect } from 'vitest';
import {
  MONTHS,
  euro,
  pct,
  initials,
  currentMonth,
  getClientName,
  emptyDeal,
  normalizeDeal,
} from './ui-shared';

describe('euro', () => {
  it('formate un montant en EUR français', () => {
    expect(euro(1500)).toBe('1 500 €'); // espace insécable
    expect(euro(0)).toBe('0 €');
    expect(euro(null)).toBe('0 €');
    expect(euro(undefined)).toBe('0 €');
  });
});

describe('pct', () => {
  it('retourne le pourcentage arrondi', () => {
    expect(pct(50, 100)).toBe(50);
    expect(pct(33, 99)).toBe(33);
    expect(pct(150, 100)).toBe(150);
  });
  it('plafonné à 999%', () => {
    expect(pct(99999, 100)).toBe(999);
  });
  it('retourne 0 si target = 0', () => {
    expect(pct(50, 0)).toBe(0);
  });
});

describe('initials', () => {
  it('retourne les initiales en majuscules', () => {
    expect(initials('Louis Hatton')).toBe('LH');
    expect(initials('jean-claude van damme')).toBe('JV');
    expect(initials('Madonna')).toBe('M');
  });
  it('? si nom vide', () => {
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});

describe('currentMonth', () => {
  it('retourne un mois français en majuscules', () => {
    expect(MONTHS).toContain(currentMonth());
  });
});

describe('getClientName', () => {
  it('priorité au champ clients.nom (jointure)', () => {
    expect(getClientName({ clients: { nom: 'Marie' }, client: 'old' })).toBe('Marie');
  });
  it('fallback sur client', () => {
    expect(getClientName({ client: 'Pierre' })).toBe('Pierre');
  });
  it('fallback ultime sur Client', () => {
    expect(getClientName({})).toBe('Client');
    expect(getClientName(null)).toBe('Client');
  });
});

describe('emptyDeal', () => {
  it('retourne un deal vierge avec advisor_code optionnel', () => {
    const d = emptyDeal('LH');
    expect(d.advisor_code).toBe('LH');
    expect(d.status).toBe('En cours');
    expect(d.priority).toBe('Normale');
    expect(d.product).toBe('PER Individuel');
    expect(MONTHS).toContain(d.month);
  });
});

describe('normalizeDeal', () => {
  it('convertit pp_m et pu en nombres', () => {
    const d = normalizeDeal({ pp_m: '500', pu: '12000', client_age: '45' });
    expect(d.pp_m).toBe(500);
    expect(d.pu).toBe(12000);
    expect(d.client_age).toBe(45);
  });
  it('client_age null si vide', () => {
    expect(normalizeDeal({ pp_m: 0, pu: 0, client_age: '' }).client_age).toBeNull();
    expect(normalizeDeal({ pp_m: 0, pu: 0, client_age: null }).client_age).toBeNull();
  });
});

import { messageErreur } from './ui-shared';

describe('messageErreur', () => {
  it('traduit les erreurs réseau brutes en français', () => {
    expect(messageErreur(new TypeError('Failed to fetch'))).toMatch(/Connexion impossible/);
    expect(messageErreur('NetworkError when attempting to fetch resource.')).toMatch(/Connexion impossible/);
  });
  it('laisse passer les messages métier tels quels', () => {
    expect(messageErreur(new Error('Montant invalide'))).toBe('Montant invalide');
  });
  it('a un repli quand le message est vide', () => {
    expect(messageErreur(null)).toBe('Une erreur est survenue.');
    expect(messageErreur(new Error(''))).toBe('Une erreur est survenue.');
  });
});

import { exporterCsv, nombreFr } from './export-csv';

describe('export CSV', () => {
  it('formate les nombres à la française', () => {
    expect(nombreFr(1234.5)).toBe('1234,5');
    expect(nombreFr(null)).toBe('');
    expect(nombreFr(0)).toBe('0');
  });
  it('expose une fonction d export', () => {
    expect(typeof exporterCsv).toBe('function');
  });
});

describe('normalizeDeal — prochaine action (D3)', () => {
  it('convertit les valeurs vides en null pour la base', () => {
    const d = normalizeDeal({ next_action: '   ', next_action_date: '' });
    expect(d.next_action).toBeNull();
    expect(d.next_action_date).toBeNull();
  });
  it("n'injecte pas les champs absents (pas d'effacement en sauvegarde partielle)", () => {
    const d = normalizeDeal({ client: 'Dupont' });
    expect('next_action' in d).toBe(false);
    expect('next_action_date' in d).toBe(false);
  });
  it('conserve une action renseignée', () => {
    const d = normalizeDeal({ next_action: ' Relancer après relevé ', next_action_date: '2026-09-01' });
    expect(d.next_action).toBe('Relancer après relevé');
    expect(d.next_action_date).toBe('2026-09-01');
  });
});

describe('nombreFr — robustesse (revue Série D)', () => {
  it('arrondit le bruit flottant des montants calculés', () => {
    expect(nombreFr(102.88 * 12)).toBe('1234,56');
    expect(nombreFr(0.1 + 0.2)).toBe('0,3');
  });
  it('ne rend pas 0 pour une valeur non numérique', () => {
    expect(nombreFr('abc')).toBe('');
  });
  it('garde les entiers sans décimale', () => {
    expect(nombreFr(1234)).toBe('1234');
  });
});
