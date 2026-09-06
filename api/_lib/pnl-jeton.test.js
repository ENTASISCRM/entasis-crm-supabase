// Le verrou de l espace rentabilite. C est la donnee la plus sensible du
// cabinet : chaque barriere a son test, et un test qui casse doit bloquer la
// mise en ligne.

import { describe, it, expect } from 'vitest'
import {
  empreinteCode, verifierCode, signerJeton, verifierJeton, egaliteSure,
  DUREE_JETON_MS, MAX_TENTATIVES,
} from './pnl-jeton.js'

const SECRET = 'secret-de-test-jamais-en-production'
const LOUIS = 'aaaaaaaa-0000-0000-0000-000000000001'
const JEAN  = 'bbbbbbbb-0000-0000-0000-000000000002'

describe('empreinte du code', () => {
  it('ne stocke jamais le code en clair', () => {
    const e = empreinteCode('MonCodeSecret2026')
    expect(e).not.toContain('MonCodeSecret2026')
    expect(e.startsWith('scrypt$')).toBe(true)
  })

  it('reconnait le bon code', () => {
    const e = empreinteCode('MonCodeSecret2026')
    expect(verifierCode('MonCodeSecret2026', e)).toBe(true)
  })

  it('refuse un mauvais code, meme a une lettre pres', () => {
    const e = empreinteCode('MonCodeSecret2026')
    expect(verifierCode('MonCodeSecret2025', e)).toBe(false)
    expect(verifierCode('moncodesecret2026', e)).toBe(false)
    expect(verifierCode('', e)).toBe(false)
  })

  it('donne deux empreintes differentes pour le meme code (sel aleatoire)', () => {
    expect(empreinteCode('identique')).not.toBe(empreinteCode('identique'))
  })

  it('ne plante pas sur une empreinte absente ou corrompue', () => {
    expect(verifierCode('x', null)).toBe(false)
    expect(verifierCode('x', 'nimportequoi')).toBe(false)
    expect(verifierCode('x', 'scrypt$a$b$c$d$e')).toBe(false)
  })
})

describe('jeton de deverrouillage', () => {
  it('accepte le jeton de celui a qui il a ete remis', () => {
    const j = signerJeton({ userId: LOUIS, sessionId: 's1', secret: SECRET })
    expect(verifierJeton({ jeton: j, userId: LOUIS, sessionId: 's1', secret: SECRET }).ok).toBe(true)
  })

  it('REFUSE le jeton de Louis presente par quelqu un d autre', () => {
    const j = signerJeton({ userId: LOUIS, sessionId: 's1', secret: SECRET })
    const v = verifierJeton({ jeton: j, userId: JEAN, sessionId: 's1', secret: SECRET })
    expect(v.ok).toBe(false)
    expect(v.motif).toMatch(/autre utilisateur/)
  })

  it('REFUSE un jeton reutilise depuis une autre session', () => {
    const j = signerJeton({ userId: LOUIS, sessionId: 'session-du-bureau', secret: SECRET })
    const v = verifierJeton({ jeton: j, userId: LOUIS, sessionId: 'autre-session', secret: SECRET })
    expect(v.ok).toBe(false)
    expect(v.motif).toMatch(/autre session/)
  })

  it('REFUSE un jeton expire, a la seconde pres', () => {
    const t0 = Date.now()
    const j = signerJeton({ userId: LOUIS, sessionId: 's1', secret: SECRET, maintenant: t0 })
    expect(verifierJeton({ jeton: j, userId: LOUIS, sessionId: 's1', secret: SECRET, maintenant: t0 + DUREE_JETON_MS - 1 }).ok).toBe(true)
    const v = verifierJeton({ jeton: j, userId: LOUIS, sessionId: 's1', secret: SECRET, maintenant: t0 + DUREE_JETON_MS + 1 })
    expect(v.ok).toBe(false)
    expect(v.motif).toMatch(/expire/)
  })

  it('REFUSE un jeton fabrique avec un autre secret', () => {
    const j = signerJeton({ userId: LOUIS, sessionId: 's1', secret: 'secret-vole-ou-devine' })
    const v = verifierJeton({ jeton: j, userId: LOUIS, sessionId: 's1', secret: SECRET })
    expect(v.ok).toBe(false)
    expect(v.motif).toMatch(/signature/)
  })

  it('REFUSE un jeton dont on a rallonge la validite a la main', () => {
    const j = signerJeton({ userId: LOUIS, sessionId: 's1', secret: SECRET })
    const [corps, sig] = j.split('.')
    const charge = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8'))
    charge.exp = Date.now() + 10 * 365 * 24 * 3600 * 1000   // dix ans
    const truque = `${Buffer.from(JSON.stringify(charge)).toString('base64url')}.${sig}`
    expect(verifierJeton({ jeton: truque, userId: LOUIS, sessionId: 's1', secret: SECRET }).ok).toBe(false)
  })

  it('REFUSE un jeton absent, vide ou malforme', () => {
    for (const j of [null, '', 'sansPoint', '..', undefined]) {
      expect(verifierJeton({ jeton: j, userId: LOUIS, sessionId: 's1', secret: SECRET }).ok).toBe(false)
    }
  })

  it('refuse de signer sans secret, plutot que de signer avec du vide', () => {
    expect(() => signerJeton({ userId: LOUIS, sessionId: 's1', secret: '' })).toThrow(/PNL_SECRET/)
    expect(verifierJeton({ jeton: 'a.b', userId: LOUIS, secret: '' }).ok).toBe(false)
  })
})

describe('comparaison a temps constant', () => {
  it('reste juste quelle que soit la longueur', () => {
    expect(egaliteSure('abc', 'abc')).toBe(true)
    expect(egaliteSure('abc', 'abd')).toBe(false)
    expect(egaliteSure('abc', 'abcd')).toBe(false)
    expect(egaliteSure('', '')).toBe(true)
    expect(egaliteSure(null, undefined)).toBe(true)
  })
})

describe('regles du verrou', () => {
  it('bloque au cinquieme essai, pas au sixieme', () => {
    expect(MAX_TENTATIVES).toBe(5)
  })
  it('ouvre pour quinze minutes, pas davantage', () => {
    expect(DUREE_JETON_MS).toBe(15 * 60 * 1000)
  })
})
