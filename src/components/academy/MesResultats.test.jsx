import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MesResultatsVue } from './MesResultats'

const AUJOURDHUI = '2026-09-21T09:00:00Z'

// Ce que rend academy_mes_resultats : une série de trois jours, trois
// sessions sur deux decks, deux semaines d XP, deux exercices faibles dont
// un déjà dû.
const resultats = {
  serie: 3, meilleure: 9, xp_total: 860,
  sessions: [
    { id: 's3', version_id: 'v2', slug: 'per-et-retraite', titre: 'Le PER et la retraite', demarree_le: '2026-09-20T07:00:00Z', terminee_le: '2026-09-20T07:06:00Z', nb_bons: 12, nb_total: 12, xp: 150 },
    { id: 's2', version_id: 'v2', slug: 'per-et-retraite', titre: 'Le PER et la retraite', demarree_le: '2026-09-13T07:00:00Z', terminee_le: '2026-09-13T07:08:00Z', nb_bons: 7, nb_total: 12, xp: 80 },
    { id: 's1', version_id: 'v3', slug: 'scpi', titre: 'Les SCPI', demarree_le: '2026-09-12T07:00:00Z', terminee_le: '2026-09-12T07:05:00Z', nb_bons: 9, nb_total: 12, xp: 100 },
  ],
  semaines: [
    { semaine: '2026-09-07', xp: 180, sessions: 2 },
    { semaine: '2026-09-14', xp: 150, sessions: 1 },
  ],
  items_faibles: [
    { item_id: 'i1', version_id: 'v2', titre_module: 'Le PER et la retraite', slug: 'per-et-retraite', competence: 'Plafonds de déduction', enonce_court: 'Le plafond de déduction du PER se calcule sur…', force: 1, prochaine_le: '2026-09-19T10:00:00Z' },
    { item_id: 'i2', version_id: 'v3', titre_module: 'Les SCPI', slug: 'scpi', competence: 'Frais', enonce_court: 'Les frais de souscription d’une SCPI', force: 2, prochaine_le: '2026-09-24T10:00:00Z' },
  ],
}

const rendre = (r = resultats) => renderToStaticMarkup(<MesResultatsVue resultats={r} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} />)

describe('MesResultatsVue', () => {
  it('série, meilleure série, XP total et sous titre', () => {
    const html = rendre()
    expect(html).toContain('3 sessions terminées · 28 bonnes réponses sur 36 · 860 XP')
    expect(html).toContain('Série en cours')
    expect(html).toContain('>3 jours<')
    expect(html).toContain('Meilleure série')
    expect(html).toContain('>9 jours<')
    expect(html).toContain('XP total')
    expect(html).toContain('>860<')
    expect(html).toContain('class="ac-flamme"')
  })

  it('l XP par semaine : barres CSS à hauteur relative et tableau lisible', () => {
    const html = rendre()
    expect(html).toContain('XP par semaine')
    expect(html).toContain('class="ac-barres"')
    expect(html).toContain('height:100%')
    expect(html).toContain('height:83%')
    expect(html).toContain('Semaine du 07/09')
    expect(html).toContain('Semaine du 14/09')
    expect(html).toContain('>180<')
    expect(html).toContain('>150<')
  })

  it('le tableau des sessions : deck, date à Paris, bons sur total, XP', () => {
    const html = rendre()
    expect(html).toContain('20/09/2026 à 09h06')
    expect(html).toContain('>12/12<')
    expect(html).toContain('>7/12<')
    expect(html).toContain('>9/12<')
    expect(html).toContain('Les SCPI')
  })

  it('les exercices à consolider : force sur 5, prochaine date, bouton vers le deck', () => {
    const html = rendre()
    expect(html).toContain('Exercices à consolider')
    expect(html).toContain('Le plafond de déduction du PER se calcule sur…')
    expect(html).toContain('Le PER et la retraite · Plafonds de déduction')
    expect(html).toContain('aria-label="Force 1 sur 5"')
    expect(html).toContain('force 1/5 · à revoir depuis le 19/09/2026')
    expect(html).toContain('force 2/5 · prochaine révision le 24/09/2026')
    expect((html.match(/ac-force-point on/g) || []).length).toBe(3)
    expect((html.match(/>S’entraîner</g) || []).length).toBe(2)
    expect(html).toContain('>2<')
  })

  it('sans exercice faible, on le dit', () => {
    const html = rendre({ ...resultats, items_faibles: [] })
    expect(html).toContain('Aucun exercice fragile')
    expect(html).toContain('aucun exercice fragile')
  })

  it('état vide', () => {
    const html = rendre({ serie: 0, meilleure: 0, xp_total: 0, sessions: [], semaines: [], items_faibles: [] })
    expect(html).toContain('Aucune session pour l’instant')
    expect(html).toContain('Voir Aujourd hui')
  })
})

// ── Gamification (migration 8) : niveau et compteur de succès ───────────────
// academy_mes_resultats rend en plus niveau (forme d academy_niveau) et
// succes (tout le catalogue avec obtenu_le ou null).
const gamifie = {
  ...resultats,
  niveau: { niveau: 5, titre: 'Solide', xp_min: 700, xp_suivant: 1000, xp_total: 860, progression_pct: 53 },
  succes: [
    { code: 'premiere_session', titre: 'Premier pas', description: 'Terminer une première session.', icone: 'pas', ordre: 1, secret: false, obtenu_le: '2026-09-01T18:30:00Z' },
    { code: 'session_parfaite', titre: 'Sans faute', description: 'Réussir les douze exercices d’une session.', icone: 'cible', ordre: 2, secret: false, obtenu_le: '2026-09-20T18:00:00Z' },
    { code: 'combo_6', titre: 'Six d’affilée', description: 'Enchaîner six bonnes réponses.', icone: 'eclair', ordre: 3, secret: false, obtenu_le: null },
  ],
}

describe('MesResultatsVue, gamification', () => {
  it('la carte de niveau reprend celle d’Aujourd hui', () => {
    const html = rendre(gamifie)
    expect(html).toContain('ac-kpi-kicker">Niveau<')
    expect(html).toContain('ac-niveau-pastille" aria-hidden="true">5<')
    expect(html).toContain('ac-niveau-titre">Solide<')
    expect(html).toContain('niveau 5 · 860 XP au total')
    expect(html).toContain('140 XP avant Expert')
  })

  it('le compteur de succès et son lien vers la galerie', () => {
    const html = rendre(gamifie)
    expect(html).toContain('ac-kpi-kicker">Succès<')
    expect(html).toContain('>2 <')
    expect(html).toContain('sur 3</span>')
    expect(html).toContain('débloqués par tes sessions')
    expect(html).toContain('>Tous mes succès</button>')
  })

  it('un serveur sans niveau ni succès : le niveau se recalcule, la carte des succès disparaît', () => {
    const html = rendre()
    expect(html).toContain('ac-niveau-titre">Solide<')
    expect(html).not.toContain('ac-kpi-kicker">Succès<')
    expect(html).not.toContain('Tous mes succès')
  })

  it('aucun succès débloqué : la carte invite à la première session', () => {
    const html = rendre({ ...gamifie, succes: gamifie.succes.map((s) => ({ ...s, obtenu_le: null })) })
    expect(html).toContain('la première session terminée en débloque un')
    expect(html).toContain('>0 <')
  })
})
