import { describe, it, expect } from 'vitest'
import {
  TYPES_ITEM, compterMots, etatItem, enonceCourt, validerItem, bonneReponseApercu,
  decouperMemo, normaliserCle, figureItem,
} from './editeur-items'

// Un formulaire complet par type, tel que l’éditeur le construit : tout
// inventé, aucune donnée client.
const base = { competence: 'Blocage', difficulte: '2', explication: 'Parce que.' }
const formulaires = {
  choix: { ...base, type: 'choix', enonce: 'Quel cas ?', choix: ['A', 'B', 'C', 'D'], bonne: 2 },
  trou_choix: { ...base, type: 'trou_choix', phrase: 'Le PER est en gestion ___ par défaut.', choix: ['libre', 'pilotée', 'obligatoire', 'programmée'], bonne: 1 },
  vrai_faux: { ...base, type: 'vrai_faux', enonce: 'Le PER est bloqué.', vrai: true },
  multi: { ...base, type: 'multi', enonce: 'Cochez.', choix: ['A', 'B', 'C', 'D', 'E'], coches: [3, 0] },
  ordre: { ...base, type: 'ordre', enonce: 'Dans l’ordre.', elements: ['Un', 'Deux', 'Trois'] },
  association: { ...base, type: 'association', enonce: 'Associez.', gauche: ['PER', 'Livret'], droite: ['Bloqué', 'Liquide'] },
  trou_saisie: { ...base, type: 'trou_saisie', phrase: 'Report sur ___ ans.', aide: 'Un chiffre.', reponses: '3\ntrois\n\n3' },
  carte: { ...base, type: 'carte', explication: '', recto: 'Depuis quand ?', verso: 'Octobre 2020.' },
}

describe('validerItem', () => {
  it('construit un patch en indices originaux pour chacun des huit types', () => {
    for (const type of TYPES_ITEM) {
      const { erreur, patch } = validerItem(formulaires[type])
      expect(erreur, type).toBeUndefined()
      expect(patch.type).toBe(type)
      expect(patch.competence).toBe('Blocage')
      expect(patch.difficulte).toBe(2)
    }
    expect(validerItem(formulaires.choix).patch).toMatchObject({ payload: { enonce: 'Quel cas ?', choix: ['A', 'B', 'C', 'D'] }, corrige: { index: 2 } })
    expect(validerItem(formulaires.trou_choix).patch.corrige).toEqual({ index: 1 })
    expect(validerItem(formulaires.vrai_faux).patch.corrige).toEqual({ vrai: true })
    // Les cases cochées sont triées et dédoublonnées.
    expect(validerItem(formulaires.multi).patch.corrige).toEqual({ indices: [0, 3] })
    // Un ordre saisi dans le bon ordre : corrigé identité.
    expect(validerItem(formulaires.ordre).patch).toMatchObject({ payload: { elements: ['Un', 'Deux', 'Trois'] }, corrige: { ordre: [0, 1, 2] } })
    // Une association saisie en face à face : corrigé diagonale.
    expect(validerItem(formulaires.association).patch.corrige).toEqual({ paires: [[0, 0], [1, 1]] })
    // Les réponses acceptées, une par ligne, sans doublon ni ligne vide.
    expect(validerItem(formulaires.trou_saisie).patch).toMatchObject({ payload: { phrase: 'Report sur ___ ans.', aide: 'Un chiffre.' }, corrige: { reponses: ['3', 'trois'] } })
    expect(validerItem(formulaires.carte).patch).toEqual({ type: 'carte', competence: 'Blocage', difficulte: 2, explication: '', payload: { recto: 'Depuis quand ?', verso: 'Octobre 2020.' }, corrige: {} })
  })

  it('refuse un champ vide, avec un message clair', () => {
    expect(validerItem({ ...formulaires.choix, competence: ' ' }).erreur).toMatch(/compétence est obligatoire/)
    expect(validerItem({ ...formulaires.choix, explication: '' }).erreur).toMatch(/explication est obligatoire/)
    expect(validerItem({ ...formulaires.choix, enonce: '' }).erreur).toBe('L’énoncé est obligatoire')
    expect(validerItem({ ...formulaires.choix, choix: ['A', '', 'C', 'D'] }).erreur).toBe('Les 4 choix sont obligatoires')
    expect(validerItem({ ...formulaires.ordre, elements: ['Un', ' '] }).erreur).toMatch(/vide/)
    expect(validerItem({ ...formulaires.association, droite: ['Bloqué', ''] }).erreur).toMatch(/vide/)
    expect(validerItem({ ...formulaires.carte, verso: '' }).erreur).toBe('Le verso de la carte est obligatoire')
    expect(validerItem({ ...formulaires.trou_saisie, reponses: '\n \n' }).erreur).toMatch(/au moins une réponse acceptée/)
  })

  it('exige exactement un trou ___ dans une phrase', () => {
    expect(validerItem({ ...formulaires.trou_saisie, phrase: 'Pas de trou.' }).erreur).toMatch(/trou écrit ___/)
    expect(validerItem({ ...formulaires.trou_saisie, phrase: 'Deux ___ trous ___.' }).erreur).toMatch(/un seul trou/)
    expect(validerItem({ ...formulaires.trou_choix, phrase: 'Quatre ____ tirets.' }).erreur).toMatch(/exactement trois tirets bas/)
  })

  it('vérifie les bornes : bonne réponse cochée, au moins deux éléments, difficulté 1 à 3', () => {
    expect(validerItem({ ...formulaires.choix, bonne: 7 }).erreur).toBe('Cochez la bonne réponse')
    expect(validerItem({ ...formulaires.choix, bonne: -1 }).erreur).toBe('Cochez la bonne réponse')
    expect(validerItem({ ...formulaires.multi, coches: [] }).erreur).toBe('Cochez au moins une bonne réponse')
    expect(validerItem({ ...formulaires.multi, coches: [0, 1, 2, 3, 4] }).erreur).toMatch(/Toutes les réponses/)
    expect(validerItem({ ...formulaires.multi, choix: ['A', 'B', 'C'] }).erreur).toMatch(/de 4 à 6/)
    expect(validerItem({ ...formulaires.multi, coches: [9] }).erreur).toBe('Cochez au moins une bonne réponse')
    expect(validerItem({ ...formulaires.ordre, elements: ['Seul'] }).erreur).toMatch(/au moins deux éléments/)
    expect(validerItem({ ...formulaires.association, gauche: ['PER'], droite: ['Bloqué'] }).erreur).toMatch(/au moins deux paires/)
    expect(validerItem({ ...formulaires.association, gauche: ['PER', 'Livret', 'AV'] }).erreur).toMatch(/au moins deux paires/)
    expect(validerItem({ ...formulaires.choix, difficulte: '5' }).erreur).toBe('La difficulté va de 1 à 3')
    expect(validerItem({ ...formulaires.choix, choix: ['A', 'A', 'C', 'D'] }).erreur).toBe('Deux choix sont identiques')
    expect(validerItem({ type: 'inconnu' }).erreur).toBe('Type d’exercice inconnu')
  })
})

describe('etatItem', () => {
  it('remet les éléments d’un ordre dans le bon ordre et les paires en face à face', () => {
    const ordre = etatItem({ type: 'ordre', payload: { enonce: 'E', elements: ['Trois', 'Un', 'Deux'] }, corrige: { ordre: [1, 2, 0] } })
    expect(ordre.elements).toEqual(['Un', 'Deux', 'Trois'])
    const assoc = etatItem({ type: 'association', payload: { enonce: 'E', gauche: ['PER', 'Livret'], droite: ['Liquide', 'Bloqué'] }, corrige: { paires: [[0, 1], [1, 0]] } })
    expect(assoc.gauche).toEqual(['PER', 'Livret'])
    expect(assoc.droite).toEqual(['Bloqué', 'Liquide'])
    // Le tour complet : ce qui est affiché redonne un corrigé identité / diagonale.
    expect(validerItem({ ...assoc, competence: 'c', explication: 'e' }).patch.corrige).toEqual({ paires: [[0, 0], [1, 1]] })
  })

  it('garde l’ordre du payload quand le corrigé est absent ou incomplet', () => {
    expect(etatItem({ type: 'ordre', payload: { elements: ['B', 'A'] }, corrige: { ordre: [1] } }).elements).toEqual(['B', 'A'])
    expect(etatItem({ type: 'association', payload: { gauche: ['a', 'b'], droite: ['x', 'y'] }, corrige: {} }).droite).toEqual(['x', 'y'])
  })

  it('remplit quatre choix pour un nouvel exercice et lit les champs existants', () => {
    const neuf = etatItem({ type: 'choix' })
    expect(neuf.choix).toEqual(['', '', '', ''])
    expect(neuf.difficulte).toBe('2')
    expect(etatItem({ type: 'multi' }).choix).toHaveLength(4)
    expect(etatItem({ type: 'ordre' }).elements).toEqual(['', ''])
    const existant = etatItem({ type: 'trou_saisie', competence: 'Plafond', difficulte: 3, explication: 'X', payload: { phrase: 'Sur ___ ans.', aide: 'Un chiffre.' }, corrige: { reponses: ['3', 'trois'] } })
    expect(existant).toMatchObject({ competence: 'Plafond', difficulte: '3', phrase: 'Sur ___ ans.', aide: 'Un chiffre.', reponses: '3\ntrois' })
    expect(etatItem({ type: 'vrai_faux', corrige: { vrai: false } }).vrai).toBe(false)
    expect(etatItem({ type: 'multi', payload: { choix: ['a', 'b', 'c', 'd', 'e'] }, corrige: { indices: [4, 1] } }).coches).toEqual([4, 1])
    // Un type inconnu retombe sur le choix unique.
    expect(etatItem({ type: 'qcm' }).type).toBe('choix')
  })
})

describe('bonneReponseApercu', () => {
  it('rend la bonne réponse dans la forme du serveur, indices originaux = présentés', () => {
    expect(bonneReponseApercu('choix', { index: 2 })).toBe(2)
    expect(bonneReponseApercu('trou_choix', { index: 0 })).toBe(0)
    expect(bonneReponseApercu('vrai_faux', { vrai: true })).toBe(true)
    expect(bonneReponseApercu('vrai_faux', {})).toBe(false)
    expect(bonneReponseApercu('multi', { indices: [0, 3] })).toEqual([0, 3])
    expect(bonneReponseApercu('ordre', { ordre: [0, 1, 2] })).toEqual([0, 1, 2])
    expect(bonneReponseApercu('association', { paires: [[0, 0], [1, 1]] })).toEqual([[0, 0], [1, 1]])
    expect(bonneReponseApercu('trou_saisie', { reponses: ['3', 'trois'] })).toEqual(['3', 'trois'])
    expect(bonneReponseApercu('carte', {})).toEqual({})
    expect(bonneReponseApercu('choix', null)).toBe(-1)
  })
})

describe('compterMots et enonceCourt', () => {
  it('compte les mots séparés par des blancs', () => {
    expect(compterMots('')).toBe(0)
    expect(compterMots('  un\ndeux   trois ')).toBe(3)
    expect(compterMots('## Titre\n\n1. Un point')).toBe(5)
  })
  it('coupe un énoncé long et lit la phrase ou le recto', () => {
    expect(enonceCourt({ payload: { enonce: 'Court' } })).toBe('Court')
    expect(enonceCourt({ payload: { phrase: 'Sur ___ ans.' } })).toBe('Sur ___ ans.')
    expect(enonceCourt({ payload: { recto: 'Depuis quand ?' } })).toBe('Depuis quand ?')
    const long = enonceCourt({ payload: { enonce: 'mot '.repeat(60) } }, 20)
    expect(long.length).toBeLessThanOrEqual(20)
    expect(long.endsWith('…')).toBe(true)
    expect(enonceCourt({})).toBe('')
  })
})

// ─── Les schémas : le marqueur du mémo et la figure d’un exercice ──────────

describe('normaliserCle', () => {
  it('rend des minuscules sans espace ni ponctuation', () => {
    expect(normaliserCle('Frise')).toBe('frise')
    // Ni espace ni accent : une clé se retape à l’identique dans un mémo.
    expect(normaliserCle('  Les Sept Etapes ')).toBe('lesseptetapes')
    expect(normaliserCle('étapes')).toBe('tapes')
    expect(normaliserCle('trois_poches-2')).toBe('trois_poches-2')
    expect(normaliserCle(null)).toBe('')
    expect(normaliserCle(12)).toBe('12')
  })
})

describe('decouperMemo', () => {
  it('coupe le mémo autour des marqueurs, dans l’ordre de lecture', () => {
    const memo = '## Les étapes\n\nOn ouvre.\n\n[schema:frise]\n\nPuis on conclut.\n\n[schema:poches]'
    expect(decouperMemo(memo)).toEqual([
      { type: 'texte', texte: '## Les étapes\n\nOn ouvre.' },
      { type: 'schema', cle: 'frise' },
      { type: 'texte', texte: 'Puis on conclut.' },
      { type: 'schema', cle: 'poches' },
    ])
  })

  it('un mémo sans marqueur ne fait qu’un morceau de texte, un mémo vide aucun', () => {
    expect(decouperMemo('Une page de mémo.')).toEqual([{ type: 'texte', texte: 'Une page de mémo.' }])
    expect(decouperMemo('   ')).toEqual([])
    expect(decouperMemo(null)).toEqual([])
  })

  it('la clé est normalisée, les marqueurs collés se suivent', () => {
    expect(decouperMemo('[schema:Frise]\n[schema:POCHES]')).toEqual([
      { type: 'schema', cle: 'frise' },
      { type: 'schema', cle: 'poches' },
    ])
  })

  it('le compteur de mots du mémo ignore les marqueurs', () => {
    expect(compterMots('un deux [schema:frise] trois')).toBe(3)
    expect(compterMots('[schema:frise]')).toBe(0)
  })
})

describe('figureItem', () => {
  it('rend la figure du mode choisi, ou rien', () => {
    expect(figureItem({ figure_mode: 'aucune' })).toEqual({ figure: null })
    expect(figureItem({})).toEqual({ figure: null })
    expect(figureItem({ figure_mode: 'ref', figure_ref: 'Frise' })).toEqual({ figure: { ref: 'frise' } })
    expect(figureItem({ figure_mode: 'svg', figure_svg: '<svg></svg>', figure_alt: ' Les sept étapes ' }))
      .toEqual({ figure: { svg: '<svg></svg>', alt: 'Les sept étapes' } })
    // Sans texte de remplacement, la clé alt ne part pas.
    expect(figureItem({ figure_mode: 'svg', figure_svg: '<svg></svg>' })).toEqual({ figure: { svg: '<svg></svg>' } })
  })

  it('refuse une figure incomplète ou trop longue, avec un message clair', () => {
    expect(figureItem({ figure_mode: 'ref', figure_ref: '' }).erreur).toContain('Choisissez le schéma')
    expect(figureItem({ figure_mode: 'svg', figure_svg: '  ' }).erreur).toContain('Collez le SVG')
    const enorme = { figure_mode: 'svg', figure_svg: `<svg>${'a'.repeat(24000)}</svg>` }
    expect(figureItem(enorme).erreur).toBe('La figure dépasse 24\u00a0000 caractères : elle ne serait pas rendue')
  })
})

describe('la figure dans etatItem et validerItem', () => {
  it('etatItem lit payload.figure et choisit le mode', () => {
    const sans = etatItem({ type: 'choix' })
    expect(sans.figure_mode).toBe('aucune')
    expect(sans.figure_ref).toBe('')
    const ref = etatItem({ type: 'choix', payload: { enonce: 'A', figure: { ref: 'Frise' } } })
    expect(ref).toMatchObject({ figure_mode: 'ref', figure_ref: 'frise', figure_svg: '' })
    const propre = etatItem({ type: 'choix', payload: { enonce: 'A', figure: { svg: '<svg />', alt: 'Une frise' } } })
    expect(propre).toMatchObject({ figure_mode: 'svg', figure_svg: '<svg />', figure_alt: 'Une frise' })
  })

  it('validerItem pose la figure dans le payload, sans toucher au corrigé', () => {
    const { patch } = validerItem({ ...formulaires.choix, figure_mode: 'ref', figure_ref: 'frise' })
    expect(patch.payload).toEqual({ enonce: 'Quel cas ?', choix: ['A', 'B', 'C', 'D'], figure: { ref: 'frise' } })
    expect(patch.corrige).toEqual({ index: 2 })
    // Une carte aussi peut porter une figure.
    const carte = validerItem({ ...formulaires.carte, figure_mode: 'svg', figure_svg: '<svg />' })
    expect(carte.patch.payload.figure).toEqual({ svg: '<svg />' })
    // Sans figure, le payload ne gagne pas de clé.
    expect(validerItem(formulaires.choix).patch.payload.figure).toBeUndefined()
  })

  it('une figure incomplète arrête l’enregistrement avant le reste', () => {
    const { erreur, patch } = validerItem({ ...formulaires.choix, figure_mode: 'svg', figure_svg: '' })
    expect(patch).toBeUndefined()
    expect(erreur).toContain('Collez le SVG')
  })
})
