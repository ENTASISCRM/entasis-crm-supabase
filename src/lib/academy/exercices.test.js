import { describe, it, expect } from 'vitest'
import {
  TYPES, reponseVide, reponseComplete, reponseAEnvoyer, normaliserSaisie, rendreBonneReponse,
  estBonneReponse, etatChoix, xpSession, itemsAJouer, enonceCourt, jetonSession,
} from './exercices'

// Les payloads tels que les présente academy_presenter_item : choix,
// éléments et colonne de droite déjà mélangés, jamais de corrigé.
const P = {
  choix: { enonce: 'Le PER se débloque à quel moment ?', choix: ['À tout moment', 'À la retraite', 'Après 5 ans'] },
  vrai_faux: { enonce: 'Une allocation diversifiée supprime le risque de perte en capital.' },
  multi: { enonce: 'Cochez ce qui compte dans l’allocation.', choix: ['Les parts de sa société', 'Le rendement passé', 'Ses biens immobiliers', 'Son épargne salariale'] },
  ordre: { enonce: 'Remettez la démarche dans l’ordre.', elements: ['Tracer par écrit', 'Écouter et reformuler', 'Expliquer sans promettre', 'Étudier par poche'] },
  association: { enonce: 'Associez chaque notion à sa définition.', gauche: ['Tolérance', 'Capacité', 'Volatilité'], droite: ['Amplitude des variations', 'Ce que le client accepte de voir bouger', 'Ce qu’il peut perdre'] },
  trou_choix: { phrase: 'La diversification s’apprécie au niveau du ___ dans sa globalité.', choix: ['fonds', 'portefeuille', 'contrat'] },
  trou_saisie: { phrase: 'L indicateur de risque du DIC va de 1 à ___.', aide: 'Un chiffre' },
  carte: { recto: 'Le cadrage étroit', verso: 'Regarder le court terme et le projeter sur le long terme.' },
}

describe('TYPES et reponseVide', () => {
  it('connaît les huit types', () => {
    expect(TYPES).toEqual(['choix', 'vrai_faux', 'multi', 'ordre', 'association', 'trou_choix', 'trou_saisie', 'carte'])
  })
  it('donne une valeur vide par type, jamais complète', () => {
    expect(reponseVide('choix')).toBeNull()
    expect(reponseVide('vrai_faux')).toBeNull()
    expect(reponseVide('multi')).toEqual([])
    expect(reponseVide('ordre')).toEqual([])
    expect(reponseVide('association')).toEqual([])
    expect(reponseVide('trou_choix')).toBeNull()
    expect(reponseVide('trou_saisie')).toBe('')
    expect(reponseVide('carte')).toBeNull()
    for (const t of TYPES) expect(reponseComplete(t, reponseVide(t), P[t])).toBe(false)
  })
})

describe('reponseComplete', () => {
  it('choix et trou_choix : un indice présenté qui existe', () => {
    expect(reponseComplete('choix', 1, P.choix)).toBe(true)
    expect(reponseComplete('choix', 0, P.choix)).toBe(true)
    expect(reponseComplete('choix', 3, P.choix)).toBe(false)
    expect(reponseComplete('choix', -1, P.choix)).toBe(false)
    expect(reponseComplete('choix', '1', P.choix)).toBe(false)
    expect(reponseComplete('trou_choix', 2, P.trou_choix)).toBe(true)
    expect(reponseComplete('trou_choix', 5, P.trou_choix)).toBe(false)
  })
  it('vrai_faux : un booléen', () => {
    expect(reponseComplete('vrai_faux', true, P.vrai_faux)).toBe(true)
    expect(reponseComplete('vrai_faux', false, P.vrai_faux)).toBe(true)
    expect(reponseComplete('vrai_faux', 'true', P.vrai_faux)).toBe(false)
    expect(reponseComplete('vrai_faux', null, P.vrai_faux)).toBe(false)
  })
  it('multi : au moins une case, indices valides et distincts', () => {
    expect(reponseComplete('multi', [0], P.multi)).toBe(true)
    expect(reponseComplete('multi', [0, 2, 3], P.multi)).toBe(true)
    expect(reponseComplete('multi', [], P.multi)).toBe(false)
    expect(reponseComplete('multi', [0, 0], P.multi)).toBe(false)
    expect(reponseComplete('multi', [4], P.multi)).toBe(false)
  })
  it('ordre : tous les éléments, une fois chacun', () => {
    expect(reponseComplete('ordre', [1, 3, 2, 0], P.ordre)).toBe(true)
    expect(reponseComplete('ordre', [1, 3, 2], P.ordre)).toBe(false)
    expect(reponseComplete('ordre', [1, 1, 2, 0], P.ordre)).toBe(false)
    expect(reponseComplete('ordre', [1, 3, 2, 4], P.ordre)).toBe(false)
    expect(reponseComplete('ordre', [0], { enonce: 'x', elements: [] })).toBe(false)
  })
  it('association : chaque ligne de gauche appariée à une ligne de droite distincte', () => {
    expect(reponseComplete('association', [[0, 1], [1, 2], [2, 0]], P.association)).toBe(true)
    expect(reponseComplete('association', [[0, 1], [1, 2]], P.association)).toBe(false)
    expect(reponseComplete('association', [[0, 1], [1, 1], [2, 0]], P.association)).toBe(false)
    expect(reponseComplete('association', [[0, 1], [0, 2], [2, 0]], P.association)).toBe(false)
    expect(reponseComplete('association', [[0, 1], [1, 2], [2, 3]], P.association)).toBe(false)
    expect(reponseComplete('association', [[0, 1], [1, 2], 2], P.association)).toBe(false)
  })
  it('trou_saisie : autre chose que des espaces ou de la ponctuation', () => {
    expect(reponseComplete('trou_saisie', '7', P.trou_saisie)).toBe(true)
    expect(reponseComplete('trou_saisie', '  sept ', P.trou_saisie)).toBe(true)
    expect(reponseComplete('trou_saisie', '   ', P.trou_saisie)).toBe(false)
    expect(reponseComplete('trou_saisie', '...', P.trou_saisie)).toBe(false)
    expect(reponseComplete('trou_saisie', null, P.trou_saisie)).toBe(false)
  })
  it('carte : jugée sue ou à revoir, pas seulement retournée', () => {
    expect(reponseComplete('carte', { retournee: true, su: true }, P.carte)).toBe(true)
    expect(reponseComplete('carte', { su: false }, P.carte)).toBe(true)
    expect(reponseComplete('carte', { retournee: true }, P.carte)).toBe(false)
    expect(reponseComplete('carte', null, P.carte)).toBe(false)
  })
  it('un type inconnu n’est jamais complet', () => {
    expect(reponseComplete('devinette', 1, {})).toBe(false)
  })
})

describe('reponseAEnvoyer', () => {
  it('une carte n’envoie que su, une saisie part sans espaces de bord, le reste tel quel', () => {
    expect(reponseAEnvoyer('carte', { retournee: true, su: true })).toEqual({ su: true })
    expect(reponseAEnvoyer('carte', { retournee: true })).toEqual({ su: false })
    expect(reponseAEnvoyer('trou_saisie', '  Sept ')).toBe('Sept')
    expect(reponseAEnvoyer('ordre', [2, 0, 1])).toEqual([2, 0, 1])
    expect(reponseAEnvoyer('vrai_faux', false)).toBe(false)
  })
})

describe('normaliserSaisie, même règle que academy_normaliser', () => {
  it('minuscules, accents retirés, espaces réduits, ponctuation de bord retirée', () => {
    expect(normaliserSaisie('  Épargne   Salariale ! ')).toBe('epargne salariale')
    expect(normaliserSaisie('« Cœur »')).toBe('cour')
    expect(normaliserSaisie('(Sept).')).toBe('sept')
    expect(normaliserSaisie('déjà-vu, ça')).toBe('deja-vu, ca')
    expect(normaliserSaisie('ÀÉÎÕÜŸÆ')).toBe('aeiouya')
    expect(normaliserSaisie("l'assurance vie")).toBe("l'assurance vie")
    expect(normaliserSaisie('\tdeux\nlignes ')).toBe('deux lignes')
  })
  it('vaut chaîne vide sur rien ou sur de la ponctuation seule', () => {
    expect(normaliserSaisie(null)).toBe('')
    expect(normaliserSaisie(undefined)).toBe('')
    expect(normaliserSaisie('')).toBe('')
    expect(normaliserSaisie(' ?! ')).toBe('')
    expect(normaliserSaisie(7)).toBe('7')
  })
})

describe('rendreBonneReponse', () => {
  it('choix et trou_choix : le texte du choix présenté', () => {
    expect(rendreBonneReponse('choix', P.choix, 1)).toBe('À la retraite')
    expect(rendreBonneReponse('trou_choix', P.trou_choix, 1)).toBe('portefeuille')
    expect(rendreBonneReponse('choix', P.choix, 9)).toBe('')
  })
  it('vrai_faux : Vrai ou Faux', () => {
    expect(rendreBonneReponse('vrai_faux', P.vrai_faux, false)).toBe('Faux')
    expect(rendreBonneReponse('vrai_faux', P.vrai_faux, true)).toBe('Vrai')
    expect(rendreBonneReponse('vrai_faux', P.vrai_faux, null)).toBe('')
  })
  it('multi : les choix cochés, un par ligne, dans l’ordre présenté', () => {
    expect(rendreBonneReponse('multi', P.multi, [3, 0, 2])).toBe('Les parts de sa société\nSes biens immobiliers\nSon épargne salariale')
  })
  it('ordre : une liste numérotée dans le bon ordre', () => {
    expect(rendreBonneReponse('ordre', P.ordre, [1, 3, 2, 0])).toBe('1. Écouter et reformuler\n2. Étudier par poche\n3. Expliquer sans promettre\n4. Tracer par écrit')
  })
  it('association : « gauche : droite » par paire', () => {
    expect(rendreBonneReponse('association', P.association, [[0, 1], [1, 2], [2, 0]]))
      .toBe('Tolérance : Ce que le client accepte de voir bouger\nCapacité : Ce qu’il peut perdre\nVolatilité : Amplitude des variations')
  })
  it('trou_saisie : les textes acceptés séparés par « ou »', () => {
    expect(rendreBonneReponse('trou_saisie', P.trou_saisie, ['7', 'sept'])).toBe('7 ou sept')
    expect(rendreBonneReponse('trou_saisie', P.trou_saisie, ['7'])).toBe('7')
  })
  it('carte : rien à rendre', () => {
    expect(rendreBonneReponse('carte', P.carte, {})).toBe('')
  })
  it('supporte un payload absent ou une bonne réponse illisible', () => {
    expect(rendreBonneReponse('choix', null, 0)).toBe('')
    expect(rendreBonneReponse('multi', P.multi, null)).toBe('')
    expect(rendreBonneReponse('ordre', P.ordre, 'x')).toBe('')
    expect(rendreBonneReponse('association', P.association, [1, [0, 0]])).toBe('Tolérance : Amplitude des variations')
  })
})

describe('etatChoix', () => {
  it('avant correction : on ou rien', () => {
    expect(etatChoix(true, true, false)).toBe('on')
    expect(etatChoix(true, false, false)).toBe('on')
    expect(etatChoix(false, true, false)).toBe('')
  })
  it('après correction : juste, faux, attendu ou rien', () => {
    expect(etatChoix(true, true, true)).toBe('juste')
    expect(etatChoix(true, false, true)).toBe('faux')
    expect(etatChoix(false, true, true)).toBe('attendu')
    expect(etatChoix(false, false, true)).toBe('')
  })
})

describe('estBonneReponse, la correction locale du rejeu', () => {
  it('choix, trou_choix, vrai_faux', () => {
    expect(estBonneReponse('choix', 1, 1)).toBe(true)
    expect(estBonneReponse('choix', 0, 1)).toBe(false)
    expect(estBonneReponse('trou_choix', 2, 2)).toBe(true)
    expect(estBonneReponse('vrai_faux', false, false)).toBe(true)
    expect(estBonneReponse('vrai_faux', true, false)).toBe(false)
    expect(estBonneReponse('vrai_faux', null, false)).toBe(false)
  })
  it('multi : mêmes cases quel que soit l’ordre', () => {
    expect(estBonneReponse('multi', [2, 0, 3], [0, 2, 3])).toBe(true)
    expect(estBonneReponse('multi', [0, 2], [0, 2, 3])).toBe(false)
    expect(estBonneReponse('multi', [], [])).toBe(false)
  })
  it('ordre : la même suite, dans le même ordre', () => {
    expect(estBonneReponse('ordre', [1, 3, 2, 0], [1, 3, 2, 0])).toBe(true)
    expect(estBonneReponse('ordre', [3, 1, 2, 0], [1, 3, 2, 0])).toBe(false)
  })
  it('association : les mêmes paires quel que soit l’ordre de pose', () => {
    expect(estBonneReponse('association', [[2, 0], [0, 1], [1, 2]], [[0, 1], [1, 2], [2, 0]])).toBe(true)
    expect(estBonneReponse('association', [[0, 2], [1, 1], [2, 0]], [[0, 1], [1, 2], [2, 0]])).toBe(false)
  })
  it('trou_saisie : comparaison normalisée avec chaque texte accepté', () => {
    expect(estBonneReponse('trou_saisie', ' SEPT. ', ['7', 'sept'])).toBe(true)
    expect(estBonneReponse('trou_saisie', 'huit', ['7', 'sept'])).toBe(false)
    expect(estBonneReponse('trou_saisie', '', ['', '7'])).toBe(false)
  })
  it('carte : sue ou pas', () => {
    expect(estBonneReponse('carte', { su: true }, {})).toBe(true)
    expect(estBonneReponse('carte', { su: false }, {})).toBe(false)
    expect(estBonneReponse('carte', null, {})).toBe(false)
  })
})

describe('xpSession, comme academy_terminer_entrainement', () => {
  it('10 par bon hors carte, 5 par carte sue', () => {
    expect(xpSession(8, 0, false, false)).toBe(80)
    expect(xpSession(8, 2, false, false)).toBe(70)
    expect(xpSession(0, 0, false, false)).toBe(0)
  })
  it('20 de plus pour une session parfaite, 10 pour la première du jour', () => {
    expect(xpSession(12, 0, true, false)).toBe(140)
    expect(xpSession(12, 0, false, true)).toBe(130)
    expect(xpSession(12, 3, true, true)).toBe(135)
  })
  it('ne compte pas plus de cartes que de bons, ni de valeurs négatives ou illisibles', () => {
    expect(xpSession(2, 5, false, false)).toBe(10)
    expect(xpSession(-3, 0, false, true)).toBe(10)
    expect(xpSession('4', '1', false, false)).toBe(35)
    expect(xpSession(null, undefined, true, true)).toBe(30)
  })
})

describe('itemsAJouer', () => {
  const entrainement = {
    entrainement_id: 'e1',
    items: [
      { item_id: 'i3', rang: 3, type: 'carte', payload: P.carte },
      { item_id: 'i1', rang: 1, type: 'choix', payload: P.choix },
      { item_id: 'i2', rang: 2, type: 'ordre', payload: P.ordre },
    ],
    reponses_deja: [{ item_id: 'i1', correcte: true }],
  }
  it('trie par rang et saute les items déjà répondus', () => {
    expect(itemsAJouer(entrainement).map((it) => it.item_id)).toEqual(['i2', 'i3'])
  })
  it('sans reprise, tout se joue ; sans session, rien', () => {
    expect(itemsAJouer({ ...entrainement, reponses_deja: [] }).map((it) => it.item_id)).toEqual(['i1', 'i2', 'i3'])
    expect(itemsAJouer(null)).toEqual([])
    expect(itemsAJouer({ items: null })).toEqual([])
  })
})

describe('enonceCourt et jetonSession', () => {
  it('prend l’énoncé, la phrase ou le recto, et coupe long', () => {
    expect(enonceCourt({ payload: P.choix })).toBe('Le PER se débloque à quel moment ?')
    expect(enonceCourt({ payload: P.trou_choix })).toBe('La diversification s’apprécie au niveau du ___ dans sa globalité.')
    expect(enonceCourt({ payload: P.carte })).toBe('Le cadrage étroit')
    expect(enonceCourt({ enonce_court: 'Depuis la base' })).toBe('Depuis la base')
    expect(enonceCourt({ payload: { enonce: 'a'.repeat(200) } }, 20)).toBe(`${'a'.repeat(19)}…`)
    expect(enonceCourt(null)).toBe('')
  })
  it('rend un uuid v4 à chaque appel', () => {
    const a = jetonSession()
    const b = jetonSession()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })
})

describe('normaliserSaisie et l apostrophe typographique', () => {
  it('rend égales l apostrophe droite et l apostrophe typographique', async () => {
    const { normaliserSaisie } = await import('./exercices.js')
    expect(normaliserSaisie('l’avis d’imposition')).toBe(normaliserSaisie("l'avis d'imposition"))
  })
})
