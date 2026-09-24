import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MonParcoursVue, CarteNiveau } from './MonParcours'

const AUJOURDHUI = '2026-09-21'

// Un parcours fictif, tel que le rend academy_mon_parcours : une série de
// quatre jours en danger, l objectif du jour pas encore atteint, un deck en
// retard avec des exercices dus, un deck validé, un deck non commencé.
const parcours = {
  aujourdhui: AUJOURDHUI,
  serie: { serie: 4, meilleure: 9, dernier_jour: '2026-09-20', objectif_quotidien: 2, sessions_aujourdhui: 0, objectif_atteint: false, en_danger: true },
  xp: { total: 860, aujourdhui: 0, semaine: 140 },
  items_dus: 7,
  affectations: [
    {
      id: 'a1', module_id: 'm1', version_id: 'v1', parcours_id: 'p1', parcours_titre: 'Fondamentaux du conseiller',
      obligatoire: true, echeance: '2026-09-10', statut: 'en_cours', en_retard: true,
      slug: 'per-et-retraite', titre: 'Le PER et la retraite', theme: 'per-retraite', niveau: 'fondamentaux', duree_minutes: 15,
      nb_items: 40, couronnes: 1, items_vus: 24, items_dus: 5, xp: 320, sessions: 4, derniere_session: '2026-09-19T10:00:00Z', valide_le: null, version_statut: 'publie', created_at: '2026-08-01',
    },
    {
      id: 'a2', module_id: 'm2', version_id: 'v2', parcours_id: 'p1', parcours_titre: 'Fondamentaux du conseiller',
      obligatoire: true, echeance: '2026-09-01', statut: 'valide', en_retard: false,
      slug: 'assurance-vie', titre: 'L’assurance vie', theme: 'assurance-vie', niveau: 'fondamentaux', duree_minutes: 12,
      nb_items: 36, couronnes: 3, items_vus: 36, items_dus: 2, xp: 540, sessions: 9, derniere_session: '2026-09-15T10:00:00Z', valide_le: '2026-08-30T10:00:00Z', version_statut: 'publie', created_at: '2026-08-01',
    },
    {
      id: 'a3', module_id: 'm3', version_id: 'v3', parcours_id: null, parcours_titre: null,
      obligatoire: false, echeance: '2026-09-25', statut: 'non_commence', en_retard: false,
      slug: 'scpi', titre: 'Les SCPI', theme: 'immobilier-patrimonial', niveau: 'decouverte', duree_minutes: 10,
      nb_items: 30, couronnes: 0, items_vus: 0, items_dus: 0, xp: 0, sessions: 0, derniere_session: null, valide_le: null, version_statut: 'publie', created_at: '2026-09-01',
    },
  ],
  dernieres_reussites: [
    { version_id: 'v2', titre: 'L’assurance vie', slug: 'assurance-vie', valide_le: '2026-08-30T10:00:00Z', attestation: 'EA-2026-0007' },
  ],
  temps_actif_s: 5400,
  temps_actif_7j_s: 1500,
}

const rendre = (p = parcours) => renderToStaticMarkup(<MonParcoursVue parcours={p} aujourdhui={AUJOURDHUI} onNaviguer={() => {}} onObjectif={() => {}} />)

describe('MonParcoursVue (Aujourd hui)', () => {
  it('l’en tête dit Aujourd hui, la série en danger, la flamme en CSS sans emoji', () => {
    const html = rendre()
    expect(html).toContain('section-title">Aujourd hui')
    expect(html).toContain('>4 jours<')
    expect(html).toContain('meilleure série : 9 jours')
    expect(html).toContain('badge badge-urgent">En danger')
    expect(html).toContain('Une session aujourd’hui et la série continue.')
    expect(html).toContain('class="ac-flamme eteinte"')
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('l’objectif du jour : sessions faites sur objectif, barre, bouton Objectif', () => {
    const html = rendre()
    expect(html).toContain('Objectif du jour')
    expect(html).toContain('>0/2<')
    expect(html).toContain('2 sessions par jour')
    expect(html).toContain('>Objectif<')
    expect(html).toContain('aria-expanded="false"')
    // Le sélecteur ne s’ouvre qu’au clic.
    expect(html).not.toContain('ac-objectif-select')
  })

  it('objectif atteint : le badge remplace le rappel', () => {
    const atteint = { ...parcours, serie: { ...parcours.serie, sessions_aujourdhui: 2, objectif_atteint: true, en_danger: false } }
    const html = rendre(atteint)
    expect(html).toContain('badge badge-signed">Objectif atteint')
    expect(html).toContain('>2/2<')
    expect(html).toContain('team-bar-fill signed')
    expect(html).not.toContain('En danger')
  })

  it('XP du jour et de la semaine, exercices dus', () => {
    const html = rendre()
    expect(html).toContain('140 XP cette semaine · 860 au total')
    expect(html).toContain('>7<')
    expect(html).toContain('7 exercices à revoir')
  })

  it('une carte par deck : couronnes, exercices vus et dus, échéance, retard, S entraîner et Voir le deck', () => {
    const html = rendre()
    expect((html.match(/<article class="card card-p ac-deck/g) || []).length).toBe(3)
    expect(html).toContain('aria-label="1 couronne sur 5"')
    expect(html).toContain('aria-label="3 couronnes sur 5"')
    expect(html).toContain('aria-label="0 couronne sur 5"')
    expect(html).toContain('24 sur 40 exercices vus')
    expect(html).toContain('5 exercices à revoir')
    expect(html).toContain('Fondamentaux du conseiller · obligatoire')
    expect(html).toContain('badge badge-urgent">En retard')
    expect((html.match(/>En retard</g) || []).length).toBe(1)
    expect(html).toContain('Échéance dépassée de 11 jours')
    expect(html).toContain('À rendre dans 4 jours')
    expect(html).toContain('badge badge-signed">Validé')
    expect((html.match(/>S’entraîner</g) || []).length).toBe(3)
    expect((html.match(/>Voir le deck</g) || []).length).toBe(4)
  })

  it('les decks en retard passent avant ceux qui ont des exercices dus, les validés à la fin', () => {
    const html = rendre()
    const per = html.indexOf('Le PER et la retraite')
    const av = html.indexOf('ac-carte-titre">L’assurance vie')
    const scpi = html.indexOf('Les SCPI')
    expect(per).toBeLessThan(av)
    expect(per).toBeLessThan(scpi)
    // Le deck validé mais avec des exercices dus passe avant le deck non commencé.
    expect(av).toBeLessThan(scpi)
  })

  it('le sous titre résume decks validés, retards et exercices à revoir ; les réussites sont listées', () => {
    const html = rendre()
    expect(html).toContain('1 sur 3 decks affectés validé · 1 en retard · 7 exercices à revoir')
    expect(html).toContain('Dernières réussites')
    expect(html).toContain('EA-2026-0007')
    expect(html).toContain('Validé le 30/08/2026')
  })

  it('sans affectation, l’état vide renvoie au catalogue et la série reste visible', () => {
    const vide = { aujourdhui: AUJOURDHUI, serie: { serie: 0, meilleure: 0, objectif_quotidien: 1, sessions_aujourdhui: 0, objectif_atteint: false, en_danger: false }, xp: { total: 0, aujourdhui: 0, semaine: 0 }, items_dus: 0, affectations: [], dernieres_reussites: [] }
    const html = rendre(vide)
    expect(html).toContain('Rien ne t est encore affecté : le catalogue est ouvert')
    expect(html).toContain('Ouvrir le catalogue')
    expect(html).toContain('>0 jour<')
    expect(html).toContain('Une session terminée aujourd’hui lance ta série.')
    expect(html).toContain('aucun exercice en attente de révision')
    expect(html).not.toContain('S’entraîner')
  })

  it('une version archivée : badge Version remplacée et renvoi au catalogue à la place de S entraîner', () => {
    const p = { ...parcours, affectations: [{ ...parcours.affectations[2], version_statut: 'archive' }] }
    const html = rendre(p)
    expect(html).toContain('badge badge-normal">Version remplacée')
    expect(html).toContain('>Deck remplacé, voir le catalogue</button>')
    expect(html).not.toContain('S’entraîner')
    expect(html).not.toContain('#/formation/entrainement/')
    expect(html).toContain('>Voir le deck</button>')
  })

  it('un deck sans exercice : S entraîner désactivé avec l’aide', () => {
    const p = { ...parcours, affectations: [{ ...parcours.affectations[2], nb_items: 0, items_vus: 0 }] }
    const html = rendre(p)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Aucun exercice dans ce deck"[^>]*>S’entraîner<\/button>/)
    expect(html).toContain('class="ac-muet">Aucun exercice dans ce deck<')
    expect(html).not.toContain('Version remplacée')
  })
})

// ── Gamification (migration 8) : niveau, défis, classement, succès ──────────
// Ce que academy_mon_parcours rend en plus depuis la spec du 22 septembre.
const gamifie = {
  ...parcours,
  niveau: { niveau: 2, titre: 'Apprenti', xp_min: 100, xp_suivant: 250, xp_total: 180, progression_pct: 53 },
  defis: [
    { code: 'sessions_2', titre: 'Deux sessions aujourd’hui', description: 'Terminer deux sessions aujourd’hui.', cible: 2, progression: 1, fait: false, xp: 30 },
    { code: 'justes_15', titre: 'Quinze bonnes réponses', description: 'Donner quinze bonnes réponses dans des sessions terminées.', cible: 15, progression: 15, fait: true, xp: 30 },
    { code: 'combo_5', titre: 'Combo de cinq', description: 'Enchaîner cinq bonnes réponses dans une session.', cible: 1, progression: 0, fait: false, xp: 25 },
  ],
  classement: { semaine: '2026-09-21', rang: 3, participants: 9, xp_moi: 140, xp_premier: 180, xp_devant: 150, ecart_premier: 40 },
  succes: {
    obtenus: 7, total: 21,
    recents: [
      { code: 'serie_3', titre: 'Trois jours', icone: 'flamme', obtenu_le: '2026-09-20T18:00:00Z' },
      { code: 'combo_6', titre: 'Six d’affilée', icone: 'eclair', obtenu_le: '2026-09-19T18:00:00Z' },
      { code: 'premiere_session', titre: 'Premier pas', icone: 'pas', obtenu_le: '2026-09-01T18:00:00Z' },
    ],
  },
}

describe('MonParcoursVue, gamification', () => {
  it('la carte de niveau : titre, palier, XP total, barre et ce qui reste avant le palier suivant', () => {
    const html = rendre(gamifie)
    expect(html).toContain('ac-kpi-kicker">Niveau<')
    expect(html).toContain('ac-niveau-pastille" aria-hidden="true">2<')
    expect(html).toContain('ac-niveau-titre">Apprenti<')
    expect(html).toContain('niveau 2 · 180 XP au total')
    expect(html).toContain('width:53%')
    expect(html).toContain('70 XP avant Initié')
  })

  it('le niveau se recalcule côté client quand le serveur ne le rend pas encore', () => {
    // Même jeu sans clé niveau : l XP total du parcours (860) donne le niveau 5.
    const html = rendre({ ...gamifie, niveau: undefined })
    expect(html).toContain('ac-niveau-titre">Solide<')
    expect(html).toContain('niveau 5 · 860 XP au total')
    expect(html).toContain('140 XP avant Expert')
  })

  it('CarteNiveau au dernier titre : le palier suivant se nomme par son numéro', () => {
    const html = renderToStaticMarkup(<CarteNiveau niveau={{ niveau: 10, titre: 'Légende', xp_min: 2700, xp_suivant: 3250, xp_total: 2800, progression_pct: 18 }} xpTotal={2800} />)
    expect(html).toContain('ac-niveau-titre">Légende<')
    expect(html).toContain('450 XP avant le niveau 11')
  })

  it('les trois défis du jour : pictogramme, condition, barre vers la cible, XP, coche', () => {
    const html = rendre(gamifie)
    expect(html).toContain('ac-bloc-titre">Défis du jour<')
    expect((html.match(/<li class="card card-p ac-defi/g) || []).length).toBe(3)
    expect(html).toContain('ac-defi-titre">Deux sessions aujourd’hui<')
    expect(html).toContain('Enchaîner cinq bonnes réponses dans une session.')
    expect(html).toContain('aria-label="1 sur 2"')
    expect(html).toContain('>1/2<')
    expect(html).toContain('>15/15<')
    expect(html).toContain('ac-defi-xp">+30 XP<')
    expect(html).toContain('ac-defi-xp">+25 XP<')
    // Le défi fait porte la coche, le liseré vert et le badge.
    expect(html).toContain('class="card card-p ac-defi fait"')
    expect(html).toContain('aria-label="Défi fait"')
    expect(html).toContain('badge badge-signed">Fait<')
    expect(html).toContain('class="ac-picto ac-picto-session"')
    expect(html).toContain('class="ac-picto ac-picto-combo"')
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('un serveur qui ne rend pas encore les défis le dit, sans laisser un trou', () => {
    const html = rendre(parcours)
    expect(html).toContain('Défis du jour')
    expect(html).toContain('Les défis du jour arrivent avec la prochaine mise à jour de la formation.')
    expect(html).not.toContain('ac-defi-xp')
    // Sans classement ni succès rendus, ces blocs ne s’affichent pas du tout.
    expect(html).not.toContain('Classement de la semaine')
    expect(html).not.toContain('Succès récents')
  })

  it('le classement de la semaine : rang, participants, écarts, phrase, aucun nom', () => {
    const html = rendre(gamifie)
    expect(html).toContain('ac-bloc-titre">Classement de la semaine<')
    expect(html).toContain('>3e<')
    expect(html).toContain('sur 9 participants')
    expect(html).toContain('3e sur 9 cette semaine, 10 XP de la place au dessus')
    expect(html).toContain('>140 XP cette semaine<')
    expect(html).toContain('>40 XP derrière le premier<')
    expect(html).toContain('>10 XP de la place au dessus<')
    expect(html).toContain('Classement anonyme : ni les noms ni les scores des collègues n’apparaissent.')
  })

  it('premier de la semaine : la phrase change et aucun écart ne s’affiche', () => {
    const p = { ...gamifie, classement: { semaine: '2026-09-21', rang: 1, participants: 9, xp_moi: 180, xp_premier: 180, xp_devant: null, ecart_premier: 0 } }
    const html = rendre(p)
    expect(html).toContain('Premier de la semaine !')
    expect(html).toContain('>1er<')
    expect(html).not.toContain('derrière le premier')
  })

  it('sans XP cette semaine : non classé, et la phrase invite à jouer', () => {
    const p = { ...gamifie, classement: { semaine: '2026-09-21', rang: 9, participants: 9, xp_moi: 0, xp_premier: 180, xp_devant: 20, ecart_premier: 180 } }
    const html = rendre(p)
    expect(html).toContain('>Non classé<')
    expect(html).toContain('Pas encore d’XP cette semaine, une session et tu entres au classement')
  })

  it('les succès récents : trois pictogrammes, le compteur et le lien vers la galerie', () => {
    const html = rendre(gamifie)
    expect(html).toContain('ac-bloc-titre">Succès récents<')
    expect((html.match(/<li class="ac-succes-puce">/g) || []).length).toBe(3)
    expect(html).toContain('class="ac-picto ac-picto-flamme"')
    expect(html).toContain('class="ac-picto ac-picto-eclair"')
    expect(html).toContain('class="ac-picto ac-picto-pas"')
    expect(html).toContain('ac-succes-titre">Trois jours<')
    expect(html).toContain('Obtenu le 20/09/2026')
    expect(html).toContain('>7 sur 21<')
    expect(html).toContain('>Tous mes succès</button>')
  })

  it('aucun succès encore : le bloc le dit et garde le lien', () => {
    const p = { ...gamifie, succes: { obtenus: 0, total: 21, recents: [] } }
    const html = rendre(p)
    expect(html).toContain('Aucun succès pour l’instant : la première session terminée en débloque un.')
    expect(html).toContain('>0 sur 21<')
    expect(html).toContain('>Tous mes succès</button>')
  })

  it('la flamme s’anime quand une session est déjà terminée aujourd’hui', () => {
    const p = { ...gamifie, serie: { ...gamifie.serie, sessions_aujourdhui: 1, en_danger: false, objectif_atteint: false } }
    const html = rendre(p)
    expect(html).toContain('class="ac-flamme-vive"')
    expect(html).toContain('class="ac-flamme"')
    // En danger ou série à zéro, la flamme reste éteinte et fixe.
    expect(rendre(gamifie)).not.toContain('ac-flamme-vive')
  })
})
