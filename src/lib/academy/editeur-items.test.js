import { describe, it, expect } from 'vitest'
import {
  TYPES_ITEM, compterMots, etatItem, enonceCourt, validerItem, bonneReponseApercu,
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
