import { describe, it, expect } from 'vitest'
import { formatScore, seuilTexte, reponsesCompletes, notionsARevoir, jetonClient } from './quiz'

const NBSP = ' '

describe('formatScore', () => {
  it('écrit le score et le pourcentage arrondi, espace insécable avant le %', () => {
    expect(formatScore(4, 5)).toBe(`4/5 · 80${NBSP}%`)
    expect(formatScore(2, 3)).toBe(`2/3 · 67${NBSP}%`)
    expect(formatScore(5, 5)).toBe(`5/5 · 100${NBSP}%`)
  })
  it('tient sur un total nul ou absent', () => {
    expect(formatScore(0, 0)).toBe(`0/0 · 0${NBSP}%`)
    expect(formatScore(null, null)).toBe(`0/0 · 0${NBSP}%`)
  })
})

describe('seuilTexte', () => {
  it('arrondit le nombre de bonnes réponses vers le haut', () => {
    expect(seuilTexte(0.8, 5)).toBe(`Seuil : 4 bonnes réponses sur 5 (80${NBSP}%)`)
    expect(seuilTexte(0.8, 3)).toBe(`Seuil : 3 bonnes réponses sur 3 (80${NBSP}%)`)
    expect(seuilTexte(0.7, 10)).toBe(`Seuil : 7 bonnes réponses sur 10 (70${NBSP}%)`)
  })
  it('met le singulier pour une seule bonne réponse', () => {
    expect(seuilTexte(0.8, 1)).toBe(`Seuil : 1 bonne réponse sur 1 (80${NBSP}%)`)
  })
})

describe('reponsesCompletes', () => {
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]
  it('vrai quand chaque question a une réponse entière', () => {
    expect(reponsesCompletes(questions, { q1: 0, q2: 3, q3: 1 })).toBe(true)
  })
  it('faux dès qu une question est sans réponse ou avec une valeur non entière', () => {
    expect(reponsesCompletes(questions, { q1: 0, q2: 3 })).toBe(false)
    expect(reponsesCompletes(questions, { q1: 0, q2: 3, q3: null })).toBe(false)
    expect(reponsesCompletes(questions, { q1: 0, q2: 3, q3: '1' })).toBe(false)
    expect(reponsesCompletes(questions, { q1: 0, q2: 3, q3: 1.5 })).toBe(false)
    expect(reponsesCompletes(questions, null)).toBe(false)
  })
  it('accepte des questions portant question_id, et une liste vide est complète', () => {
    expect(reponsesCompletes([{ question_id: 'q1' }], { q1: 2 })).toBe(true)
    expect(reponsesCompletes([], {})).toBe(true)
  })
})

describe('notionsARevoir', () => {
  it('liste les compétences des réponses fausses, sans doublon, dans l ordre', () => {
    expect(notionsARevoir([
      { question_id: 'q1', correcte: true, competence: 'Fiscalité du PER' },
      { question_id: 'q2', correcte: false, competence: 'Sortie en capital' },
      { question_id: 'q3', correcte: false, competence: 'Plafonds de versement' },
      { question_id: 'q4', correcte: false, competence: 'Sortie en capital' },
      { question_id: 'q5', correcte: false, competence: '' },
    ])).toEqual(['Sortie en capital', 'Plafonds de versement'])
  })
  it('rien à revoir quand tout est juste ou vide', () => {
    expect(notionsARevoir([{ correcte: true, competence: 'A' }])).toEqual([])
    expect(notionsARevoir([])).toEqual([])
    expect(notionsARevoir(null)).toEqual([])
  })
})

describe('jetonClient', () => {
  const FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  it('rend un uuid v4 différent à chaque appel', () => {
    const a = jetonClient()
    const b = jetonClient()
    expect(a).toMatch(FORMAT)
    expect(b).toMatch(FORMAT)
    expect(a).not.toBe(b)
  })
  it('garde le format sans crypto.randomUUID', () => {
    const original = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(jetonClient()).toMatch(FORMAT)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
})
