import { describe, it, expect } from 'vitest';
import {
  jourDe,
  heureDe,
  avecHeureConservee,
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

describe('dates de rendez-vous Lead Room', () => {
  // date_expected est un instant UTC : le RDV de 12h30 a Paris est stocke
  // 10:30:00+00:00, et c'est 12h30 que le client a recu dans son mail. Ces
  // tests verrouillent l'heure de Paris, jamais l'heure UTC brute.
  const RDV_SEPTEMBRE = '2026-09-16T10:30:00+00:00'   // 12h30 a Paris (ete)
  const RDV_JANVIER = '2026-01-14T09:00:00+00:00'     // 10h00 a Paris (hiver)

  it('affiche le jour tel qu on le vit a Paris', () => {
    expect(jourDe(RDV_SEPTEMBRE)).toBe('2026-09-16')
    expect(jourDe('2026-09-16')).toBe('2026-09-16')
    expect(jourDe(null)).toBe('')
  })

  it('bascule le jour au bon moment : 00h30 a Paris, pas 22h30 la veille', () => {
    expect(jourDe('2026-09-15T22:30:00+00:00')).toBe('2026-09-16')
  })

  it('donne l heure de Paris, celle que le client a recue', () => {
    expect(heureDe(RDV_SEPTEMBRE)).toBe('12h30')
    expect(heureDe(RDV_JANVIER)).toBe('10h00')
    expect(heureDe('2026-09-16')).toBeNull()
    expect(heureDe(undefined)).toBeNull()
  })

  it('deplace le jour sans decaler l heure du rendez-vous', () => {
    const deplace = avecHeureConservee('2026-09-20', RDV_SEPTEMBRE)
    expect(heureDe(deplace)).toBe('12h30')
    expect(jourDe(deplace)).toBe('2026-09-20')
  })

  it('tient le passage ete vers hiver : 12h30 reste 12h30 en decembre', () => {
    const enHiver = avecHeureConservee('2026-12-20', RDV_SEPTEMBRE)
    expect(heureDe(enHiver)).toBe('12h30')
    expect(jourDe(enHiver)).toBe('2026-12-20')
  })

  it('tient le passage hiver vers ete : 10h00 reste 10h00 en juillet', () => {
    const enEte = avecHeureConservee('2026-07-02', RDV_JANVIER)
    expect(heureDe(enEte)).toBe('10h00')
    expect(jourDe(enEte)).toBe('2026-07-02')
  })

  it('reste une date simple quand il n y avait pas d heure', () => {
    expect(avecHeureConservee('2026-09-20', '2026-09-16')).toBe('2026-09-20')
    expect(avecHeureConservee('2026-09-20', '')).toBe('2026-09-20')
  })

  it('vide le champ si le conseiller efface la date', () => {
    expect(avecHeureConservee('', RDV_SEPTEMBRE)).toBe('')
  })
})
