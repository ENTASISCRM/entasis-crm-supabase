import { describe, it, expect } from 'vitest'
import { TITRES, xpMin, titrePour, niveauPour, phraseClassement, libellesDefi } from './niveaux'

// La table de la spec du 22 septembre 2026 (§ Niveaux et titres) : le
// miroir client doit la reproduire à l’identique, sinon la barre de niveau
// animerait vers un seuil que le serveur ne connaît pas.
const TABLE = [
  [1, 0, 'Débutant'],
  [2, 100, 'Apprenti'],
  [3, 250, 'Initié'],
  [4, 450, 'Confirmé'],
  [5, 700, 'Solide'],
  [6, 1000, 'Expert'],
  [7, 1350, 'Maître'],
  [8, 1750, 'Mentor'],
  [9, 2200, 'Virtuose'],
  [10, 2700, 'Légende'],
]

describe('xpMin et TITRES, la table de la spec', () => {
  it('reproduit les dix seuils et les dix titres', () => {
    for (const [niveau, seuil, titre] of TABLE) {
      expect(xpMin(niveau)).toBe(seuil)
      expect(titrePour(niveau)).toBe(titre)
      expect(TITRES[niveau - 1]).toBe(titre)
    }
    expect(TITRES).toHaveLength(10)
  })
  it('continue la formule au delà de 10 et garde le titre Légende', () => {
    expect(xpMin(11)).toBe(3250)
    expect(xpMin(12)).toBe(3850)
    expect(titrePour(11)).toBe('Légende')
    expect(titrePour(40)).toBe('Légende')
  })
  it('ramène un niveau illisible ou nul au niveau 1', () => {
    expect(xpMin(0)).toBe(0)
    expect(xpMin(null)).toBe(0)
    expect(xpMin('abc')).toBe(0)
    expect(titrePour(0)).toBe('Débutant')
    expect(titrePour(undefined)).toBe('Débutant')
  })
})

describe('niveauPour, la forme exacte d’academy_niveau', () => {
  it('trouve le niveau de chaque seuil et de la valeur juste avant', () => {
    for (const [niveau, seuil, titre] of TABLE) {
      const n = niveauPour(seuil)
      expect(n.niveau).toBe(niveau)
      expect(n.titre).toBe(titre)
      expect(n.xp_min).toBe(seuil)
      expect(n.xp_suivant).toBe(xpMin(niveau + 1))
      expect(n.xp_total).toBe(seuil)
      expect(n.progression_pct).toBe(0)
      if (niveau > 1) expect(niveauPour(seuil - 1).niveau).toBe(niveau - 1)
    }
  })
  it('rend toutes les clés attendues et la progression entre les deux seuils', () => {
    expect(niveauPour(300)).toEqual({ niveau: 3, titre: 'Initié', xp_min: 250, xp_suivant: 450, xp_total: 300, progression_pct: 25 })
    expect(niveauPour(448)).toEqual({ niveau: 3, titre: 'Initié', xp_min: 250, xp_suivant: 450, xp_total: 448, progression_pct: 99 })
    expect(niveauPour(50)).toEqual({ niveau: 1, titre: 'Débutant', xp_min: 0, xp_suivant: 100, xp_total: 50, progression_pct: 50 })
  })
  it('arrondit au plus proche, comme round() dans academy_niveau', () => {
    // 449 sur 250..450 : 99,5 % → 100 ; 101 sur 100..250 : 0,67 % → 1.
    expect(niveauPour(449).progression_pct).toBe(100)
    expect(niveauPour(449).niveau).toBe(3)
    expect(niveauPour(101).progression_pct).toBe(1)
    expect(niveauPour(2699).progression_pct).toBe(100)
    expect(niveauPour(2699).niveau).toBe(9)
  })
  it('monte au delà du niveau 10 avec le titre Légende', () => {
    // 300 sur 550 : 54,5 % → 55 (round).
    expect(niveauPour(3000)).toEqual({ niveau: 10, titre: 'Légende', xp_min: 2700, xp_suivant: 3250, xp_total: 3000, progression_pct: 55 })
    expect(niveauPour(3250).niveau).toBe(11)
    expect(niveauPour(3250).titre).toBe('Légende')
    expect(niveauPour(100000).niveau).toBe(62)
  })
  it('traite un XP illisible, négatif ou décimal comme un entier positif', () => {
    expect(niveauPour(null).niveau).toBe(1)
    expect(niveauPour(-40)).toEqual(niveauPour(0))
    expect(niveauPour('250').niveau).toBe(3)
    expect(niveauPour(99.9).niveau).toBe(1)
    expect(niveauPour(99.9).xp_total).toBe(99)
  })
})

describe('phraseClassement, une phrase sans nom', () => {
  const base = { semaine: '2026-09-21', participants: 9, xp_moi: 160, xp_premier: 200, xp_devant: 180, ecart_premier: 40 }
  it('rang 3 sur 9, 40 XP derrière le premier', () => {
    expect(phraseClassement({ ...base, rang: 3, xp_devant: 200 })).toBe('3e sur 9 cette semaine, 40 XP derrière le premier')
  })
  it('signale la place au dessus quand elle est à portée', () => {
    expect(phraseClassement({ ...base, rang: 3, xp_devant: 170 })).toBe('3e sur 9 cette semaine, 10 XP de la place au dessus')
    // Au rang 2, la place au dessus est le premier : on parle du premier.
    expect(phraseClassement({ ...base, rang: 2, xp_moi: 190, xp_devant: 200, ecart_premier: 10 })).toBe('2e sur 9 cette semaine, 10 XP derrière le premier')
    // Trop loin de la place au dessus : on parle du premier.
    expect(phraseClassement({ ...base, rang: 4, xp_moi: 100, xp_devant: 150, ecart_premier: 100 })).toBe('4e sur 9 cette semaine, 100 XP derrière le premier')
  })
  it('premier de la semaine', () => {
    expect(phraseClassement({ ...base, rang: 1, xp_moi: 200, xp_devant: null, ecart_premier: 0 })).toBe('Premier de la semaine !')
    expect(phraseClassement({ semaine: '2026-09-21', rang: 1, participants: 1, xp_moi: 30, xp_premier: 30, xp_devant: null, ecart_premier: 0 })).toBe('Premier de la semaine !')
  })
  it('personne n’a encore joué', () => {
    expect(phraseClassement({ semaine: '2026-09-21', rang: 1, participants: 9, xp_moi: 0, xp_premier: 0, xp_devant: null, ecart_premier: 0 })).toBe('Personne n’a encore joué cette semaine')
    expect(phraseClassement({ participants: 0 })).toBe('Personne n’a encore joué cette semaine')
    expect(phraseClassement(null)).toBe('Personne n’a encore joué cette semaine')
    expect(phraseClassement(undefined)).toBe('Personne n’a encore joué cette semaine')
  })
  it('les autres ont joué, pas moi', () => {
    expect(phraseClassement({ ...base, rang: 6, xp_moi: 0, xp_devant: 20, ecart_premier: 200 })).toBe('Pas encore d’XP cette semaine, une session et tu entres au classement')
  })
  it('calcule l’écart avec le premier quand le serveur ne le rend pas', () => {
    expect(phraseClassement({ rang: 2, participants: 3, xp_moi: 50, xp_premier: 120 })).toBe('2e sur 3 cette semaine, 70 XP derrière le premier')
  })
  it('ne cite jamais un nom ni un identifiant', () => {
    const phrase = phraseClassement({ ...base, rang: 3, prenom: 'Camille', profile_id: '11111111-1111-1111-1111-111111111111' })
    expect(phrase).not.toContain('Camille')
    expect(phrase).not.toContain('1111')
  })
})

describe('libellesDefi, le catalogue des huit défis', () => {
  it('connaît les huit codes de la spec avec titre, description et pictogramme', () => {
    expect(Object.keys(libellesDefi).sort()).toEqual(['combo_5', 'deck_neuf', 'deux_decks', 'dus_10', 'justes_15', 'matin_10h', 'parfaite_1', 'sessions_2'])
    expect(libellesDefi.sessions_2.titre).toBe('Deux sessions aujourd’hui')
    expect(libellesDefi.parfaite_1.titre).toBe('Une session parfaite')
    expect(libellesDefi.justes_15.titre).toBe('Quinze bonnes réponses')
    expect(libellesDefi.dus_10.titre).toBe('Dix révisions')
    expect(libellesDefi.deck_neuf.titre).toBe('Un deck de plus')
    expect(libellesDefi.combo_5.titre).toBe('Combo de cinq')
    expect(libellesDefi.matin_10h.titre).toBe('Avant dix heures')
    expect(libellesDefi.deux_decks.titre).toBe('Deux decks différents')
    for (const l of Object.values(libellesDefi)) {
      expect(l.description.length).toBeGreaterThan(10)
      expect(['session', 'parfaite', 'justes', 'revision', 'deck', 'combo', 'matin', 'decks']).toContain(l.icone)
      // Textes d’écran : apostrophe typographique, aucun tiret.
      expect(l.titre).not.toMatch(/[-'–—]/)
      expect(l.description).not.toMatch(/[-'–—]/)
    }
  })
  it('est figé', () => {
    expect(Object.isFrozen(libellesDefi)).toBe(true)
    expect(Object.isFrozen(libellesDefi.combo_5)).toBe(true)
  })
})
