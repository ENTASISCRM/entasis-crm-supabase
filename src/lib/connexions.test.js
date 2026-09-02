import { describe, it, expect } from 'vitest'
import {
  estRecent, lieu, nomPays, appareil, nomDe, resumerParPersonne, signaler, quand, depuis,
  MINUTES_EN_DIRECT, PAYS_ATTENDU,
} from './connexions'

const LE_2_SEPT = new Date('2026-09-02T14:00:00Z')
const l = (o) => ({ id: o.id ?? 1, user_id: 'u1', email: 'demo@exemple.fr', full_name: 'Camille Ferrand', created_at: '2026-09-02T13:55:00Z', pays: 'FR', ville: 'Paris', ...o })

describe('lieu et pays', () => {
  it('écrit le pays en toutes lettres', () => {
    expect(nomPays('FR')).toBe('France')
    expect(nomPays('be')).toBe('Belgique')
  })

  it('rend le code tel quel pour un pays non répertorié', () => {
    expect(nomPays('JP')).toBe('JP')
  })

  it('assemble ville et pays', () => {
    expect(lieu(l({}))).toBe('Paris, France')
    expect(lieu(l({ ville: null }))).toBe('France')
    expect(lieu(l({ ville: 'Lyon', pays: null }))).toBe('Lyon')
  })

  it('dit un tiret quand l IP n a rien donné', () => {
    expect(lieu(l({ ville: null, pays: null }))).toBe('—')
    expect(lieu(null)).toBe('—')
  })
})

describe('appareil', () => {
  it('reconnaît Chrome sur Mac', () => {
    expect(appareil('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'))
      .toBe('Chrome sur Mac')
  })

  it('reconnaît Safari sur iPhone', () => {
    expect(appareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
      .toBe('Safari sur iPhone')
  })

  it('ne confond pas Edge avec Chrome, ni Chrome avec Safari', () => {
    expect(appareil('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0'))
      .toBe('Edge sur Windows')
  })

  it('dit un tiret sans user agent', () => {
    expect(appareil(null)).toBe('—')
    expect(appareil('   ')).toBe('—')
  })
})

describe('estRecent', () => {
  it('vrai dans la fenêtre en direct, faux au delà', () => {
    expect(estRecent('2026-09-02T13:55:00Z', MINUTES_EN_DIRECT, LE_2_SEPT)).toBe(true)
    expect(estRecent('2026-09-02T13:30:00Z', MINUTES_EN_DIRECT, LE_2_SEPT)).toBe(false)
  })

  it('faux sur une date illisible', () => {
    expect(estRecent('pas une date', MINUTES_EN_DIRECT, LE_2_SEPT)).toBe(false)
    expect(estRecent(null, MINUTES_EN_DIRECT, LE_2_SEPT)).toBe(false)
  })
})

describe('resumerParPersonne', () => {
  const lignes = [
    l({ id: 1, user_id: 'u1', full_name: 'Camille Ferrand', created_at: '2026-09-02T09:00:00Z' }),
    l({ id: 2, user_id: 'u1', full_name: 'Camille Ferrand', created_at: '2026-09-02T13:55:00Z' }),
    l({ id: 3, user_id: 'u2', full_name: 'Théo Vasseur', created_at: '2026-09-01T08:10:00Z', ville: 'Lyon' }),
  ]

  it('garde une ligne par personne, la connexion la plus récente', () => {
    const r = resumerParPersonne(lignes, LE_2_SEPT)
    expect(r).toHaveLength(2)
    expect(r[0].nom).toBe('Camille Ferrand')
    expect(r[0].derniere.id).toBe(2)
  })

  it('classe la personne vue le plus récemment en premier', () => {
    const r = resumerParPersonne(lignes, LE_2_SEPT)
    expect(r.map((p) => p.nom)).toEqual(['Camille Ferrand', 'Théo Vasseur'])
  })

  it('marque en direct celui qui vient de se connecter, pas les autres', () => {
    const r = resumerParPersonne(lignes, LE_2_SEPT)
    expect(r[0].enDirect).toBe(true)
    expect(r[1].enDirect).toBe(false)
  })

  it('compte les connexions de la fenêtre', () => {
    const r = resumerParPersonne(lignes, LE_2_SEPT)
    expect(r.find((p) => p.nom === 'Camille Ferrand').nbConnexions).toBe(2)
  })

  it('regroupe par email quand le profil n existe pas encore', () => {
    const sansProfil = [
      l({ id: 4, user_id: null, full_name: null, email: 'nouveau@exemple.fr', created_at: '2026-09-02T10:00:00Z' }),
      l({ id: 5, user_id: null, full_name: null, email: 'NOUVEAU@exemple.fr', created_at: '2026-09-02T11:00:00Z' }),
    ]
    const r = resumerParPersonne(sansProfil, LE_2_SEPT)
    expect(r).toHaveLength(1)
    expect(r[0].nom).toBe('NOUVEAU@exemple.fr')
  })

  it('ignore une ligne sans date lisible', () => {
    expect(resumerParPersonne([l({ created_at: null })], LE_2_SEPT)).toHaveLength(0)
  })
})

describe('signaler', () => {
  it('signale une connexion depuis un autre pays', () => {
    const lignes = [
      l({ id: 1, created_at: '2026-09-01T08:00:00Z', pays: 'FR', ville: 'Paris' }),
      l({ id: 2, created_at: '2026-09-02T08:00:00Z', pays: 'MA', ville: 'Casablanca' }),
    ]
    const s = signaler(lignes)
    expect(s.get(1)).toBeUndefined()
    expect(s.get(2)).toContain('hors-france')
  })

  it('signale une ville jamais vue pour cette personne', () => {
    const lignes = [
      l({ id: 1, created_at: '2026-09-01T08:00:00Z', ville: 'Paris' }),
      l({ id: 2, created_at: '2026-09-02T08:00:00Z', ville: 'Marseille' }),
    ]
    expect(signaler(lignes).get(2)).toContain('lieu-nouveau')
  })

  it('ne signale pas la toute première connexion connue d une personne', () => {
    const lignes = [l({ id: 1, created_at: '2026-09-01T08:00:00Z', ville: 'Paris' })]
    expect(signaler(lignes).size).toBe(0)
  })

  it('ne signale pas un retour dans une ville déjà vue', () => {
    const lignes = [
      l({ id: 1, created_at: '2026-09-01T08:00:00Z', ville: 'Paris' }),
      l({ id: 2, created_at: '2026-09-01T18:00:00Z', ville: 'Lyon' }),
      l({ id: 3, created_at: '2026-09-02T08:00:00Z', ville: 'Paris' }),
    ]
    const s = signaler(lignes)
    expect(s.get(2)).toContain('lieu-nouveau')
    expect(s.get(3)).toBeUndefined()
  })

  it('raisonne par personne, pas globalement', () => {
    const lignes = [
      l({ id: 1, user_id: 'u1', created_at: '2026-09-01T08:00:00Z', ville: 'Paris' }),
      l({ id: 2, user_id: 'u2', created_at: '2026-09-02T08:00:00Z', ville: 'Lyon' }),
    ]
    // Lyon est nouveau pour le cabinet, mais c est la première de Théo : muet.
    expect(signaler(lignes).size).toBe(0)
  })

  it('cumule les deux motifs sur une même ligne', () => {
    const lignes = [
      l({ id: 1, created_at: '2026-09-01T08:00:00Z', pays: 'FR', ville: 'Paris' }),
      l({ id: 2, created_at: '2026-09-02T08:00:00Z', pays: 'ES', ville: 'Madrid' }),
    ]
    expect(signaler(lignes).get(2)).toEqual(['hors-france', 'lieu-nouveau'])
  })

  it('tient le pays attendu depuis la constante', () => {
    expect(PAYS_ATTENDU).toBe('FR')
  })
})

describe('affichage du temps', () => {
  it('formate une date à la française', () => {
    expect(quand('2026-09-02T12:32:00Z')).toMatch(/2 sept\. à \d{2}:\d{2}/)
    expect(quand(null)).toBe('—')
  })

  it('dit depuis combien de temps', () => {
    expect(depuis('2026-09-02T13:59:30Z', LE_2_SEPT)).toBe('à l instant')
    expect(depuis('2026-09-02T13:45:00Z', LE_2_SEPT)).toBe('il y a 15 min')
    expect(depuis('2026-09-02T09:00:00Z', LE_2_SEPT)).toBe('il y a 5 h')
    expect(depuis('2026-08-30T14:00:00Z', LE_2_SEPT)).toBe('il y a 3 j')
  })
})

describe('nomDe', () => {
  it('préfère le nom du profil, retombe sur l email', () => {
    expect(nomDe(l({}))).toBe('Camille Ferrand')
    expect(nomDe(l({ full_name: null }))).toBe('demo@exemple.fr')
    expect(nomDe(l({ full_name: null, email: null }))).toBe('Compte inconnu')
  })
})
