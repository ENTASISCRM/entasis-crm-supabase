import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Le rendu markdown a besoin d un DOM (DOMPurify) : sans jsdom, on le
// remplace par un rendu brut. Ce que l’on teste ici, c est l’éditeur.
vi.mock('../ui/RenduMarkdown', () => ({
  default: ({ markdown }) => <div className="rendu-markdown-simule">{markdown}</div>,
}))

import { EditeurVersionVue, FormulaireExercice, JoueurApercu } from './EditeurVersion'

// Un deck fictif : un exercice de chaque type, en indices originaux, tout
// inventé. Le mémo fait soixante et onze mots, exprès en dessous de la
// fourchette visée.
const items = [
  { id: 'i1', ordre: 1, type: 'choix', competence: 'Blocage et déblocage anticipé', difficulte: 1, archive_le: null,
    payload: { enonce: 'Parmi les cas de déblocage anticipé, lequel n’est pas un accident de la vie ?', choix: ['Le chômage', 'La résidence principale', 'Le surendettement', 'La liquidation'] },
    corrige: { index: 1 }, explication: 'La résidence principale est le seul cas hors accident de la vie.', statistiques: { reponses: 0, correctes: 0 } },
  { id: 'i2', ordre: 2, type: 'vrai_faux', competence: 'Blocage et déblocage anticipé', difficulte: 1, archive_le: null,
    payload: { enonce: 'Un besoin de trésorerie passager débloque un PER.' }, corrige: { vrai: false }, explication: 'Non.', statistiques: { reponses: 0, correctes: 0 } },
  { id: 'i3', ordre: 3, type: 'multi', competence: 'Cas de déblocage', difficulte: 2, archive_le: null,
    payload: { enonce: 'Cochez les cas de déblocage anticipé.', choix: ['Surendettement', 'Résidence principale', 'Résidence secondaire', 'Invalidité', 'Voyage'] },
    corrige: { indices: [0, 1, 3] }, explication: 'Trois cas.', statistiques: { reponses: 0, correctes: 0 } },
  { id: 'i4', ordre: 4, type: 'ordre', competence: 'Ordre des priorités', difficulte: 2, archive_le: null,
    payload: { enonce: 'Remettez les étapes dans l’ordre.', elements: ['Épargne disponible', 'Prévoyance', 'PER'] },
    corrige: { ordre: [1, 0, 2] }, explication: 'Protéger, puis épargner, puis bloquer.', statistiques: { reponses: 0, correctes: 0 } },
  { id: 'i5', ordre: 5, type: 'association', competence: 'Choix des enveloppes', difficulte: 2, archive_le: null,
    payload: { enonce: 'Associez chaque enveloppe à ce qu’elle apporte.', gauche: ['PER', 'Livret'], droite: ['Liquidité immédiate', 'Déduction à l’entrée'] },
    corrige: { paires: [[0, 1], [1, 0]] }, explication: 'Chaque enveloppe a son objectif.', statistiques: { reponses: 0, correctes: 0 } },
  { id: 'i6', ordre: 6, type: 'trou_choix', competence: 'Gestion pilotée', difficulte: 1, archive_le: null,
    payload: { phrase: 'Par défaut, un PER est en gestion ___.', choix: ['libre', 'pilotée', 'obligatoire', 'programmée'] },
    corrige: { index: 1 }, explication: 'La gestion pilotée est le mode par défaut.', statistiques: { reponses: 0, correctes: 0 } },
  { id: 'i7', ordre: 7, type: 'trou_saisie', competence: 'Plafond de déduction', difficulte: 3, archive_le: null,
    payload: { phrase: 'Le plafond non utilisé se reporte sur les ___ années suivantes.', aide: 'Un chiffre.' },
    corrige: { reponses: ['3', 'trois'] }, explication: 'Trois années.', statistiques: { reponses: 0, correctes: 0 } },
  { id: 'i8', ordre: 8, type: 'carte', competence: 'Loi PACTE', difficulte: 1, archive_le: null,
    payload: { recto: 'Depuis quand le PER existe t il ?', verso: 'Depuis le 1er octobre 2020, loi PACTE.' },
    corrige: {}, explication: '', statistiques: { reponses: 0, correctes: 0 } },
]

const MEMO = `## Le PER en une page

Le PER est bloqué jusqu’à la retraite, sauf six cas de déblocage anticipé : cinq accidents de la vie et l’achat de la résidence principale.
Le plafond de déduction non utilisé se reporte sur les trois années suivantes. Par défaut, la gestion est pilotée.
Avant de verser sur un PER, on protège les revenus par la prévoyance et on constitue une épargne disponible.`

const version = (o) => ({
  id: 'v2', module_id: 'm1', slug: 'per-et-retraite', theme: 'per-retraite', niveau: 'fondamentaux', ordre: 3, numero: 2, statut: 'brouillon',
  titre: 'PER et préparation de la retraite', objectif: 'Expliquer le PER à un client.', competence: 'PER', duree_minutes: 10,
  prerequis: ['methode-entasis'], seuil_reussite: 0.8, memo_md: MEMO,
  sources: [{ titre: 'Le PER', url: 'https://www.service-public.fr/', emetteur: 'Service public', date_consultation: '2026-09-21' }],
  a_completer: ['Le circuit de souscription du cabinet'], fictif: false,
  publie_le: null, relu_par: null, relu_le: null, commentaire_relecture: null, archive_le: null,
  items, affectations: 4, validations: 2, ...o,
})

const rendre = (v) => renderToStaticMarkup(<EditeurVersionVue version={v} onNaviguer={() => {}} onRecharger={() => {}} />)
const champsActifs = (html) => html.match(/<(input|textarea|select)\b(?![^>]*\bdisabled\b)[^>]*>/g) || []

describe('EditeurVersionVue, un brouillon', () => {
  it('montre la fiche, le mémo avec son aperçu et son compteur de mots, et la publication', () => {
    const html = rendre(version())
    expect(html).toContain('Version 2 · brouillon · 8 exercices · mémo présent')
    expect(html).not.toContain('Version publiée : lecture seule')
    expect(html).toContain('La fiche du deck')
    expect(html).toContain('value="PER et préparation de la retraite"')
    expect(html).toContain('value="methode-entasis"')
    expect(html).toContain('Le PER | https://www.service-public.fr/ | Service public | 2026-09-21')
    // Le mémo est dans la zone de saisie et dans l’aperçu rendu.
    expect(html).toContain('id="aca-version-memo"')
    expect(html).toContain('rendu-markdown-simule')
    expect(html).toContain('Le PER en une page')
    // Le compteur de mots : le mémo fictif fait 69 mots, donc court.
    expect(html).toMatch(/aca-mots aca-mots-court[^>]*>69 mots · un peu court, viser 180 à 260/)
    expect(html).toContain('Publier cette version')
    expect(html).toContain('au moins 12 exercices avec corrigé, un mémo conseillé')
    expect(html).toContain('8 exercices en jeu')
    expect(html).toContain('Mémo présent')
    expect(html).toContain('Prévisualiser comme un collaborateur')
    // Le titre n’est pas désactivé.
    expect(html).toMatch(/<input id="aca-version-titre" class="form-input" value="PER[^"]*"\s*\/>/)
  })

  it('le compteur de mots dit quand le mémo est dans la fourchette, trop long ou absent', () => {
    const dedans = rendre(version({ memo_md: 'mot '.repeat(200) }))
    expect(dedans).toMatch(/aca-mots aca-mots-bon[^>]*>200 mots · viser 180 à 260/)
    const long = rendre(version({ memo_md: 'mot '.repeat(300) }))
    expect(long).toMatch(/aca-mots aca-mots-long[^>]*>300 mots · un peu long/)
    const vide = rendre(version({ memo_md: '' }))
    expect(vide).toContain('0 mot · aucun mémo pour l instant')
    expect(vide).toContain('sans mémo')
    expect(vide).toContain('Pas de mémo : conseillé avant de publier')
  })

  it('liste les exercices dans l’ordre : numéro, type, compétence, difficulté, énoncé court, gestes', () => {
    const html = rendre(version())
    expect(html).toContain('Exercices · 8 en jeu')
    // Les huit types, dans l’ordre des items, avec leur libellé (le premier
    // badge gris est le statut de la version).
    const types = [...html.matchAll(/<span class="badge badge-normal">([^<]+)<\/span>/g)].map((m) => m[1])
    expect(types.slice(1, 9)).toEqual(['Choix unique', 'Vrai ou faux', 'Choix multiples', 'Remettre dans l’ordre', 'Associer', 'Texte à trou', 'Texte à compléter', 'Carte mémoire'])
    expect(html).toContain('Blocage et déblocage anticipé · difficulté 1')
    expect(html).toContain('Plafond de déduction · difficulté 3')
    expect(html).toContain('Par défaut, un PER est en gestion ___.')
    expect(html).toContain('Depuis quand le PER existe t il ?')
    expect(html.match(/>Prévisualiser<\/button>/g)).toHaveLength(8)
    expect(html.match(/>Modifier<\/button>/g)).toHaveLength(8)
    expect(html.match(/>Archiver<\/button>/g)).toHaveLength(8)
    expect(html).not.toContain('Restaurer')
    // Le choix du type et le bouton d’ajout.
    expect(html).toContain('id="aca-nouvel-exo-type"')
    expect(html).toContain('Nouvel exercice')
    // Les formulaires ne sont pas dépliés tant qu’on ne modifie pas.
    expect(html).not.toContain('aca-exo-formulaire')
    // Les corrigés ne s’affichent pas dans la liste.
    expect(html).not.toContain('Bonne réponse')
  })

  it('signale « Formulation à revoir » sous 40 % de réussite avec au moins 8 réponses', () => {
    const avec = (statistiques) => rendre(version({ items: [{ ...items[0], statistiques }] }))
    const basse = avec({ reponses: 12, correctes: 3 })
    expect(basse).toContain('12 réponses, 25 % de réussite')
    expect(basse).toContain('Formulation à revoir')

    const bonne = avec({ reponses: 12, correctes: 7 })
    expect(bonne).toContain('12 réponses, 58 % de réussite')
    expect(bonne).not.toContain('Formulation à revoir')

    // Trop peu de réponses : le taux ne dit rien, pas d’alerte.
    const rare = avec({ reponses: 5, correctes: 1 })
    expect(rare).toContain('5 réponses, 20 % de réussite')
    expect(rare).not.toContain('Formulation à revoir')

    // Sans réponse, pas de statistique du tout.
    expect(rendre(version())).not.toMatch(/\d+ réponses?, \d+ % de réussite/)
  })

  it('un exercice archivé est marqué, sorti du compte et propose Restaurer', () => {
    const html = rendre(version({ items: [items[0], { ...items[1], archive_le: '2026-09-20T10:00:00+00:00' }] }))
    expect(html).toContain('Exercices · 1 en jeu · 1 archivé')
    expect(html).toContain('<span class="badge badge-cancelled">Archivé</span>')
    expect(html.match(/>Restaurer<\/button>/g)).toHaveLength(1)
    expect(html.match(/>Archiver<\/button>/g)).toHaveLength(1)
    expect(html).toContain('Version 2 · brouillon · 1 exercice · mémo présent')
    expect(html).toContain('1 exercice en jeu')
  })

  it('le bouton Publier est désactivé tant que le relecteur n’est pas nommé', () => {
    const html = rendre(version())
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Publier cette version<\/button>/)
    expect(html).toContain('Relu par (obligatoire)')
    expect(html).toContain('Imposer une nouvelle formation aux collaborateurs déjà affectés (la validation antérieure est conservée)')
  })

  it('sans exercice, le dit et ne propose pas la prévisualisation', () => {
    const html = rendre(version({ items: [] }))
    expect(html).toContain('Aucun exercice. Un deck publié en compte au moins 12.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Prévisualiser comme un collaborateur\s*<\/button>/)
    expect(html).toContain('0 exercice en jeu')
  })
})

describe('EditeurVersionVue, une version publiée', () => {
  const publiee = version({ statut: 'publie', publie_le: '2026-09-10T09:00:00+00:00', relu_par: 'Camille Exemple', relu_le: '2026-09-10T09:00:00+00:00' })

  it('est en lecture seule : bandeau, champs désactivés, pas d’ajout, pas de publication', () => {
    const html = rendre(publiee)
    expect(html).toContain('Version publiée : lecture seule. Créez un nouveau brouillon pour modifier.')
    expect(html).toContain('Version 2 · publié · 8 exercices · mémo présent · relu par Camille Exemple')
    expect(html).toContain('<span class="badge badge-signed">Publié</span>')
    expect(champsActifs(html)).toEqual([])
    expect(html).not.toContain('Nouvel exercice')
    expect(html).not.toContain('Publier cette version')
    expect(html).not.toContain('>Archiver</button>')
    expect(html.match(/>Voir<\/button>/g)).toHaveLength(8)
    expect(html).toContain('relue par Camille Exemple')
    expect(html).toContain('en ligne depuis le 10/09/2026 à 11h00')
  })
})

describe('FormulaireExercice, les huit formulaires', () => {
  const formulaire = (item, lectureSeule) => renderToStaticMarkup(
    <FormulaireExercice version={{ id: 'v2' }} item={item} lectureSeule={lectureSeule} onRecharger={() => {}} onFermer={() => {}} />,
  )

  it('en lecture seule pour une version publiée : chaque type rend ses champs, tous désactivés, corrigé compris', () => {
    for (const item of items) {
      const html = formulaire(item, true)
      expect(champsActifs(html), item.type).toEqual([])
      expect(html).toContain('id="aca-exo-' + item.id + '-competence"')
      expect(html).toContain('id="aca-exo-' + item.id + '-difficulte"')
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enregistrer l’exercice<\/button>/)
    }
    // Choix unique : quatre champs et la radio de la bonne réponse cochée.
    const choix = formulaire(items[0], true)
    expect(choix).toContain('Les 4 choix, et la bonne réponse')
    expect(choix).toMatch(/<input type="radio" id="aca-exo-i1-bonne-1"[^>]*checked=""/)
    expect(choix).toContain('value="La résidence principale"')
    // Vrai ou faux : la radio Fausse cochée.
    const vf = formulaire(items[1], true)
    expect(vf).toContain('Affirmation')
    expect(vf).toMatch(/<input type="radio" id="aca-exo-i2-faux"[^>]*checked=""/)
    // Multi : cinq choix, trois cases cochées.
    const multi = formulaire(items[2], true)
    expect(multi).toContain('De 4 à 6 choix, cochez les bonnes réponses')
    expect(multi.match(/<input type="checkbox"[^>]*checked=""/g)).toHaveLength(3)
    // Ordre : les éléments dans le bon ordre, Monter et Descendre.
    const ordre = formulaire(items[3], true)
    expect(ordre).toContain('Les éléments, dans le bon ordre')
    expect(ordre.indexOf('value="Prévoyance"')).toBeLessThan(ordre.indexOf('value="Épargne disponible"'))
    expect(ordre).toContain('Monter')
    expect(ordre).toContain('Descendre')
    // Association : les lignes en face à face.
    const assoc = formulaire(items[4], true)
    expect(assoc).toContain('Les paires, chaque ligne de gauche en face de la sienne')
    expect(assoc).toMatch(/value="PER"[\s\S]*value="Déduction à l’entrée"[\s\S]*value="Livret"[\s\S]*value="Liquidité immédiate"/)
    // Texte à trou : la phrase et les quatre choix.
    const trouChoix = formulaire(items[5], true)
    expect(trouChoix).toContain('Phrase avec un trou')
    expect(trouChoix).toContain('Par défaut, un PER est en gestion ___.')
    expect(trouChoix).toContain('value="pilotée"')
    // Texte à compléter : l’aide et les réponses acceptées, une par ligne.
    const saisie = formulaire(items[6], true)
    expect(saisie).toContain('Réponses acceptées')
    expect(saisie).toContain('value="Un chiffre."')
    expect(saisie).toMatch(/<textarea id="aca-exo-i7-reponses"[^>]*>3\ntrois<\/textarea>/)
    // Carte : recto, verso, explication facultative.
    const carte = formulaire(items[7], true)
    expect(carte).toContain('Recto (la question)')
    expect(carte).toContain('Verso (la réponse)')
    expect(carte).toContain('Explication (facultative)')
    expect(carte).toContain('Depuis le 1er octobre 2020, loi PACTE.')
  })

  it('un nouvel exercice a ses champs vides et actifs, et un bouton Ajouter', () => {
    const html = formulaire({ type: 'trou_saisie' }, false)
    expect(html).toContain('id="aca-exo-nouveau-phrase"')
    expect(html).toContain('Un seul trou, écrit ___ (trois tirets bas).')
    expect(html).toContain('Ajouter l’exercice')
    expect(html).toContain('Abandonner')
    expect(champsActifs(html).length).toBeGreaterThan(3)
    const multi = formulaire({ type: 'multi' }, false)
    expect(multi.match(/aria-label="Choix \d"/g)).toHaveLength(4)
    expect(multi).toContain('Ajouter un choix')
  })
})

describe('JoueurApercu, la prévisualisation d’un exercice', () => {
  it('rend chacun des huit types avec le composant de la session, Vérifier désactivé avant la saisie', () => {
    for (const item of items) {
      const html = renderToStaticMarkup(<JoueurApercu item={item} />)
      expect(html, item.type).toContain('ae-exo')
      expect(html, item.type).not.toContain('aca-bandeau')
      if (item.type === 'carte') {
        // Une carte se retourne d’abord : pas de Vérifier avant le jugement.
        expect(html).toContain('Retourner')
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Vérifier<\/button>/)
      } else {
        expect(html, item.type).toMatch(/<button[^>]*disabled=""[^>]*>Vérifier<\/button>/)
      }
    }
    // Les choix sont présentés dans l’ordre saisi, sans mélange, et sans
    // marquer la bonne réponse.
    const choix = renderToStaticMarkup(<JoueurApercu item={items[0]} />)
    expect(choix.indexOf('Le chômage')).toBeLessThan(choix.indexOf('La résidence principale'))
    expect(choix.indexOf('La résidence principale')).toBeLessThan(choix.indexOf('Le surendettement'))
    expect(choix).not.toContain('is-attendu')
    expect(choix).not.toContain('la bonne réponse')
    // Un type inconnu ne casse pas la modale.
    const inconnu = renderToStaticMarkup(<JoueurApercu item={{ id: 'x', type: 'qcm', payload: {} }} />)
    expect(inconnu).toContain('role="alert"')
    expect(inconnu).toContain('Type d’exercice inconnu : qcm')
  })
})
