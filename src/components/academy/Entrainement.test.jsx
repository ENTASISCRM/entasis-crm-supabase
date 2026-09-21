import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntrainementVue } from './Entrainement'
import Choix from './exercices/Choix'
import VraiFaux from './exercices/VraiFaux'
import Multi from './exercices/Multi'
import Ordre from './exercices/Ordre'
import Association from './exercices/Association'
import TrouChoix from './exercices/TrouChoix'
import TrouSaisie from './exercices/TrouSaisie'
import Carte from './exercices/Carte'
import { LIBELLE_TYPES, libelleCouronnes, libelleType } from '../../lib/academy/statuts'

// Des items tels que les présente academy_demarrer_entrainement : choix,
// éléments et colonne de droite déjà mélangés, jamais de corrigé. Noms et
// énoncés inventés.
const ITEMS = {
  choix: { item_id: 'i1', rang: 1, type: 'choix', competence: 'Sortie du PER', difficulte: 1, payload: { enonce: 'Le PER se débloque à quel moment ?', choix: ['À tout moment', 'À la retraite', 'Après 5 ans'] } },
  vrai_faux: { item_id: 'i2', rang: 2, type: 'vrai_faux', competence: 'Diversification', difficulte: 1, payload: { enonce: 'Une allocation diversifiée supprime le risque de perte en capital.' } },
  multi: { item_id: 'i3', rang: 3, type: 'multi', competence: 'Diversification', difficulte: 2, payload: { enonce: 'Cochez ce qui compte dans l’allocation.', choix: ['Les parts de sa société', 'Le rendement passé', 'Ses biens immobiliers'] } },
  ordre: { item_id: 'i4', rang: 4, type: 'ordre', competence: 'Méthode', difficulte: 2, payload: { enonce: 'Remettez la démarche dans l’ordre.', elements: ['Tracer par écrit', 'Écouter et reformuler', 'Expliquer sans promettre'] } },
  association: { item_id: 'i5', rang: 5, type: 'association', competence: 'Tolérance et capacité', difficulte: 1, payload: { enonce: 'Associez chaque notion à sa définition.', gauche: ['Tolérance', 'Capacité'], droite: ['Ce qu’il peut perdre', 'Ce que le client accepte de voir bouger'] } },
  trou_choix: { item_id: 'i6', rang: 6, type: 'trou_choix', competence: 'Diversification', difficulte: 1, payload: { phrase: 'La diversification s’apprécie au niveau du ___ dans sa globalité.', choix: ['fonds', 'portefeuille'] } },
  trou_saisie: { item_id: 'i7', rang: 7, type: 'trou_saisie', competence: 'Lecture du DIC', difficulte: 1, payload: { phrase: 'L indicateur de risque du DIC va de 1 à ___.', aide: 'Un chiffre' } },
  carte: { item_id: 'i8', rang: 8, type: 'carte', competence: 'Horizon', difficulte: 1, payload: { recto: 'Le cadrage étroit', verso: 'Regarder le court terme et le projeter sur le long terme.' } },
}

const rien = () => {}
const vue = (props) => renderToStaticMarkup(
  <EntrainementVue
    titre="Le PER et la retraite" phase="jeu" item={ITEMS.choix} rang={1} total={12} rejeu={false}
    valeur={null} resultat={null} envoi={false} erreurReponse={null} erreurDefinitive={false} fin={null} erreurFin={null} nbARejouer={0}
    onChange={rien} onVerifier={rien} onContinuer={rien} onRejouer={rien} onReessayer={rien} onReessayerFin={rien}
    onQuitter={rien} onEncore={rien} onRetourDeck={rien} {...props}
  />,
)
const exo = (Composant, props) => renderToStaticMarkup(
  <Composant payload={props.payload} valeur={props.valeur ?? null} onChange={rien} verrouille={!!props.verrouille} resultat={props.resultat ?? null} />,
)
const VERT = (bonne_reponse, explication = 'Parce que.') => ({ correcte: true, bonne_reponse, explication, force: 2, deja: false })
const ROUGE = (bonne_reponse, explication = 'Parce que.') => ({ correcte: false, bonne_reponse, explication, force: 1, deja: false })

describe('libellés', () => {
  it('LIBELLE_TYPES porte les huit types', () => {
    expect(Object.keys(LIBELLE_TYPES)).toEqual(['choix', 'vrai_faux', 'multi', 'ordre', 'association', 'trou_choix', 'trou_saisie', 'carte'])
    expect(libelleType('ordre')).toBe('Remettre dans l’ordre')
    expect(libelleType('inconnu')).toBe('inconnu')
  })
  it('libelleCouronnes accorde et borne', () => {
    expect(libelleCouronnes(0)).toBe('Aucune couronne')
    expect(libelleCouronnes(1)).toBe('1 couronne')
    expect(libelleCouronnes(3)).toBe('3 couronnes')
    expect(libelleCouronnes(9)).toBe('5 couronnes')
    expect(libelleCouronnes(null)).toBe('Aucune couronne')
    expect(libelleCouronnes('2')).toBe('2 couronnes')
  })
})

describe('EntrainementVue, le déroulé', () => {
  it('état initial : Quitter, progression, compteur, radios natifs, Vérifier désactivé, aucune bonne réponse', () => {
    const html = vue()
    expect(html).toContain('>Quitter<')
    expect(html).toContain('Le PER et la retraite')
    expect(html).toContain('width:8%')
    expect(html).toContain('class="ae-sr" aria-live="polite">Exercice 1 sur 12<')
    expect(html).toContain('class="ae-corps" tabindex="-1"')
    expect(html).toContain('>Choix unique<')
    expect(html).toContain('<legend class="ae-enonce">Le PER se débloque à quel moment ?</legend>')
    expect((html.match(/type="radio"/g) || []).length).toBe(3)
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Vérifier<\/button>/)
    expect(html).not.toContain('ae-bandeau')
    expect(html).not.toContain('On y revient')
  })

  it('une valeur saisie active Vérifier', () => {
    const html = vue({ valeur: 1 })
    expect(html).toContain('class="ae-choix is-on"')
    expect(html).not.toMatch(/disabled=""[^>]*>Vérifier/)
  })

  it('pendant l’envoi : Correction… et saisie verrouillée', () => {
    const html = vue({ valeur: 1, envoi: true })
    expect(html).toContain('Correction…')
    expect((html.match(/type="radio"[^>]*disabled=""/g) || []).length).toBe(3)
  })

  it('résultat vert : bandeau signed, explication, Continuer, plus de Vérifier', () => {
    const html = vue({ valeur: 1, resultat: VERT(1, 'Le PER se débloque à la retraite, sauf cas prévus.') })
    expect(html).toContain('class="ae-bandeau is-vert" role="status" aria-live="polite"')
    expect(html).toContain('>Bonne réponse<')
    expect(html).toContain('Le PER se débloque à la retraite, sauf cas prévus.')
    expect(html).toContain('>Continuer</button>')
    expect(html).not.toContain('>Vérifier<')
    expect(html).toContain('class="ae-choix is-juste"')
    expect(html).not.toContain('ae-bandeau-bonne')
  })

  it('résultat rouge : bandeau cancelled, la bonne réponse en clair, ta réponse marquée fausse', () => {
    const html = vue({ valeur: 0, resultat: ROUGE(1, 'La sortie se fait à la retraite.') })
    expect(html).toContain('class="ae-bandeau is-rouge" role="status" aria-live="polite"')
    expect(html).toContain('Pas tout à fait')
    expect(html).toContain('class="ae-bandeau-lignes">À la retraite<')
    expect(html).toContain('La sortie se fait à la retraite.')
    expect(html).toContain('class="ae-choix is-faux"')
    expect(html).toContain('class="ae-choix is-attendu"')
    expect(html).toContain('la bonne réponse')
  })

  it('résultat rouge sur un ordre : la bonne réponse en liste numérotée', () => {
    const html = vue({ item: ITEMS.ordre, valeur: [0, 1, 2], resultat: ROUGE([1, 2, 0]) })
    expect(html).toContain('1. Écouter et reformuler\n2. Expliquer sans promettre\n3. Tracer par écrit')
  })

  it('échec réseau : message role alert, Réessayer, la réponse saisie reste cochée et la saisie est verrouillée', () => {
    const html = vue({ valeur: 2, erreurReponse: 'Connexion impossible, le réseau ne répond pas.' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Connexion impossible')
    expect(html).toContain('Ta réponse est conservée.')
    expect(html).toContain('>Réessayer</button>')
    expect(html).toContain('class="ae-choix is-on"')
    expect(html).not.toContain('>Vérifier<')
    expect(html).not.toContain('Retour au deck')
    // La base a peut être déjà la réponse : les contrôles sont désactivés.
    expect((html.match(/type="radio"[^>]*disabled=""/g) || []).length).toBe(3)
  })

  it('échec réseau sur une saisie : le champ texte est désactivé, la valeur reste', () => {
    const html = vue({ item: ITEMS.trou_saisie, valeur: 'sept', erreurReponse: 'Connexion impossible, le réseau ne répond pas.' })
    expect(html).toMatch(/<input[^>]*type="text"[^>]*disabled=""/)
    expect(html).toContain('value="sept"')
  })

  it('refus de la base (pas une coupure) : Retour au deck remplace Réessayer', () => {
    const html = vue({ valeur: 2, erreurReponse: 'Accès refusé.', erreurDefinitive: true })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Accès refusé.')
    expect(html).toContain('>Retour au deck</button>')
    expect(html).not.toContain('>Réessayer</button>')
    expect(html).not.toContain('Ta réponse est conservée.')
    expect((html.match(/type="radio"[^>]*disabled=""/g) || []).length).toBe(3)
  })

  it('en rejeu : le kicker On y revient et un vert qui reste compté faux', () => {
    const html = vue({ rejeu: true, rang: 1, total: 3, valeur: 1, resultat: VERT(1) })
    expect(html).toContain('class="ae-revient-kicker">On y revient<')
    expect(html).toContain('On y revient · Exercice 1 sur 3')
    expect(html).toContain('Cette fois c’est bon')
    expect(html).toContain('reste compté faux')
  })

  it('une carte n’a pas de bouton Vérifier : elle se juge', () => {
    const html = vue({ item: ITEMS.carte })
    expect(html).not.toContain('>Vérifier<')
    expect(html).toContain('>Retourner</button>')
  })

  it('un type inconnu ne casse pas l’écran', () => {
    const html = vue({ item: { item_id: 'x', rang: 1, type: 'devinette', payload: {} } })
    expect(html).toContain('Type d’exercice inconnu')
  })
})

describe('EntrainementVue, les écrans', () => {
  it('On y revient : le nombre d’exercices ratés et Continuer', () => {
    const html = vue({ phase: 'revient', nbARejouer: 3 })
    expect(html).toContain('>On y revient<')
    expect(html).toContain('3 exercices ratés')
    expect(html).toContain('restent comptés faux')
    expect(html).toContain('>Continuer</button>')
    expect(html).toContain('>Quitter<')
  })

  it('bilan en cours, puis échec du bilan avec Réessayer', () => {
    expect(vue({ phase: 'terminaison' })).toContain('Bilan en cours')
    const html = vue({ phase: 'terminaison', erreurFin: 'Connexion impossible, le réseau ne répond pas.' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('il ne manque que le bilan')
    expect(html).toContain('>Réessayer</button>')
    expect(html).toContain('>Retour au deck</button>')
  })

  it('écran de fin : XP, bons sur total, série, première du jour, couronnes, deck validé, erreurs, boutons', () => {
    const fin = {
      entrainement_id: 'e1', version_id: 'v1', nb_bons: 10, nb_total: 12, xp: 110, premiere_du_jour: true, serie: 4, meilleure_serie: 6,
      couronnes_avant: 2, couronnes_apres: 3, valide: true, attestation: { numero: 'EA-2026-0007', delivree_le: '2026-09-21T09:10:00Z' },
      erreurs: [
        { item_id: 'i1', competence: 'Sortie du PER', enonce_court: 'Le PER se débloque à quel moment ?' },
        { item_id: 'i4', competence: 'Méthode', enonce_court: 'Remettez la démarche dans l’ordre.' },
      ],
      statut_module: 'valide', xp_total_version: 310,
    }
    const html = vue({ phase: 'fin', fin })
    expect(html).toContain('Session terminée')
    expect(html).toContain('+110 XP')
    expect(html).toContain('10 bonnes réponses sur 12')
    expect(html).toContain('4 jours')
    expect(html).toContain('première session du jour')
    expect(html).toContain('Meilleure série : 6 jours')
    expect(html).toContain('aria-label="2 couronnes sur 5"')
    expect(html).toContain('aria-label="3 couronnes sur 5"')
    expect((html.match(/ac-couronne on/g) || []).length).toBe(5)
    expect((html.match(/<svg/g) || []).length).toBe(10)
    expect(html).toContain('3 couronnes : une de plus.')
    expect(html).toContain('Deck validé')
    expect(html).toContain('EA-2026-0007')
    expect(html).toContain('À retravailler')
    expect(html).toContain('Sortie du PER')
    expect(html).toContain('Remettez la démarche dans l’ordre.')
    expect(html).toContain('>Encore une session</button>')
    expect(html).toContain('>Retour au deck</button>')
    expect(html).not.toContain('Sans faute')
  })

  it('écran de fin sans faute ni validation, une seule session dans la série', () => {
    const fin = { nb_bons: 12, nb_total: 12, xp: 140, premiere_du_jour: false, serie: 1, meilleure_serie: 1, couronnes_avant: 0, couronnes_apres: 1, valide: false, attestation: null, erreurs: [] }
    const html = vue({ phase: 'fin', fin })
    expect(html).toContain('+140 XP')
    expect(html).toContain('12 bonnes réponses sur 12')
    expect(html).toContain('>1 jour<')
    expect(html).not.toContain('première session du jour')
    expect(html).toContain('Sans faute.')
    expect(html).not.toContain('Deck validé')
    expect(html).toContain('aria-label="0 couronne sur 5"')
    expect(html).toContain('aria-label="1 couronne sur 5"')
    expect(html).toContain('1 couronne : une de plus.')
  })
})

describe('Choix', () => {
  it('initial : radios, aucun coché', () => {
    const html = exo(Choix, { payload: ITEMS.choix.payload })
    expect((html.match(/type="radio"/g) || []).length).toBe(3)
    expect(html).not.toContain('checked')
    expect(html).not.toContain('is-')
  })
  it('vert : le choix coché est juste', () => {
    const html = exo(Choix, { payload: ITEMS.choix.payload, valeur: 1, verrouille: true, resultat: VERT(1) })
    expect(html).toContain('class="ae-choix is-juste"')
    expect(html).toContain('✓')
    expect((html.match(/disabled=""/g) || []).length).toBe(3)
  })
  it('rouge : ton choix faux, le bon attendu', () => {
    const html = exo(Choix, { payload: ITEMS.choix.payload, valeur: 2, verrouille: true, resultat: ROUGE(1) })
    expect(html).toContain('class="ae-choix is-faux"')
    expect(html).toContain('class="ae-choix is-attendu"')
    expect(html).toContain('✕')
  })
})

describe('VraiFaux', () => {
  it('initial : deux radios Vrai et Faux', () => {
    const html = exo(VraiFaux, { payload: ITEMS.vrai_faux.payload })
    expect((html.match(/type="radio"/g) || []).length).toBe(2)
    expect(html).toContain('>Vrai<')
    expect(html).toContain('>Faux<')
  })
  it('vert : Faux coché et attendu', () => {
    const html = exo(VraiFaux, { payload: ITEMS.vrai_faux.payload, valeur: false, verrouille: true, resultat: VERT(false) })
    expect(html).toMatch(/class="ae-choix is-juste"[^>]*>.*?>Faux</)
  })
  it('rouge : Vrai coché, Faux attendu', () => {
    const html = exo(VraiFaux, { payload: ITEMS.vrai_faux.payload, valeur: true, verrouille: true, resultat: ROUGE(false) })
    expect(html).toMatch(/is-faux"[^>]*>.*?>Vrai</)
    expect(html).toMatch(/is-attendu"[^>]*>.*?>Faux</)
  })
})

describe('Multi', () => {
  it('initial : des cases et l’aide « plusieurs réponses »', () => {
    const html = exo(Multi, { payload: ITEMS.multi.payload, valeur: [] })
    expect((html.match(/type="checkbox"/g) || []).length).toBe(3)
    expect(html).toContain('Plusieurs réponses possibles.')
  })
  it('vert : les deux cases cochées sont justes', () => {
    const html = exo(Multi, { payload: ITEMS.multi.payload, valeur: [2, 0], verrouille: true, resultat: VERT([0, 2]) })
    expect((html.match(/is-juste/g) || []).length).toBe(2)
    expect(html).not.toContain('is-faux')
  })
  it('rouge : une case fausse, une attendue', () => {
    const html = exo(Multi, { payload: ITEMS.multi.payload, valeur: [0, 1], verrouille: true, resultat: ROUGE([0, 2]) })
    expect((html.match(/is-juste/g) || []).length).toBe(1)
    expect((html.match(/is-faux/g) || []).length).toBe(1)
    expect((html.match(/is-attendu/g) || []).length).toBe(1)
  })
})

describe('Ordre', () => {
  it('initial : pile vide, tous les éléments à placer, Retirer le dernier désactivé', () => {
    const html = exo(Ordre, { payload: ITEMS.ordre.payload, valeur: [] })
    expect(html).toContain('ils s’empilent ici')
    expect((html.match(/class="ae-tuile"/g) || []).length).toBe(3)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retirer le dernier<\/button>/)
  })
  it('en cours : deux posés numérotés, un restant', () => {
    const html = exo(Ordre, { payload: ITEMS.ordre.payload, valeur: [1, 2] })
    expect(html).toContain('class="ae-pile-numero">1<')
    expect(html).toContain('class="ae-pile-numero">2<')
    expect(html).toContain('Écouter et reformuler')
    expect((html.match(/class="ae-tuile"/g) || []).length).toBe(1)
    expect(html).not.toMatch(/disabled=""[^>]*>Retirer le dernier/)
  })
  it('vert : chaque position juste, plus de bouton Retirer', () => {
    const html = exo(Ordre, { payload: ITEMS.ordre.payload, valeur: [1, 2, 0], verrouille: true, resultat: VERT([1, 2, 0]) })
    expect((html.match(/ae-pile-item is-juste/g) || []).length).toBe(3)
    expect(html).not.toContain('Retirer le dernier')
  })
  it('rouge : la position fausse est marquée', () => {
    const html = exo(Ordre, { payload: ITEMS.ordre.payload, valeur: [2, 1, 0], verrouille: true, resultat: ROUGE([1, 2, 0]) })
    expect((html.match(/ae-pile-item is-faux/g) || []).length).toBe(2)
    expect((html.match(/ae-pile-item is-juste/g) || []).length).toBe(1)
  })
})

describe('Association', () => {
  it('initial : deux colonnes, la droite désactivée tant que rien n’est choisi à gauche', () => {
    const html = exo(Association, { payload: ITEMS.association.payload, valeur: [] })
    expect(html).toContain('Choisis une case à gauche')
    expect(html).toContain('aria-label="Colonne de gauche"')
    expect(html).toContain('aria-label="Colonne de droite"')
    expect((html.match(/aria-pressed="false"/g) || []).length).toBe(2)
    expect((html.match(/class="ae-tuile" disabled=""/g) || []).length).toBe(2)
  })
  it('une paire posée : elle sort des colonnes et se défait', () => {
    const html = exo(Association, { payload: ITEMS.association.payload, valeur: [[0, 1]] })
    expect(html).toContain('class="ae-paire"')
    expect(html).toContain('aria-label="Défaire la paire Tolérance"')
    expect(html).toContain('Capacité')
    expect((html.match(/aria-pressed/g) || []).length).toBe(1)
  })
  it('vert : les paires justes, plus de bouton Défaire', () => {
    const html = exo(Association, { payload: ITEMS.association.payload, valeur: [[0, 1], [1, 0]], verrouille: true, resultat: VERT([[0, 1], [1, 0]]) })
    expect((html.match(/ae-paire is-juste/g) || []).length).toBe(2)
    expect(html).not.toContain('Défaire')
    expect(html).not.toContain('ae-colonnes')
  })
  it('rouge : les paires inversées sont fausses', () => {
    const html = exo(Association, { payload: ITEMS.association.payload, valeur: [[0, 0], [1, 1]], verrouille: true, resultat: ROUGE([[0, 1], [1, 0]]) })
    expect((html.match(/ae-paire is-faux/g) || []).length).toBe(2)
  })
})

describe('TrouChoix', () => {
  it('initial : la phrase avec un trou vide et les radios', () => {
    const html = exo(TrouChoix, { payload: ITEMS.trou_choix.payload })
    expect(html).toContain('class="ae-trou">…<')
    expect(html).toContain('dans sa globalité.')
    expect((html.match(/type="radio"/g) || []).length).toBe(2)
  })
  it('vert : le trou porte le choix, en juste', () => {
    const html = exo(TrouChoix, { payload: ITEMS.trou_choix.payload, valeur: 1, verrouille: true, resultat: VERT(1) })
    expect(html).toContain('class="ae-trou is-rempli is-juste">portefeuille<')
  })
  it('rouge : le trou en faux, le bon choix attendu', () => {
    const html = exo(TrouChoix, { payload: ITEMS.trou_choix.payload, valeur: 0, verrouille: true, resultat: ROUGE(1) })
    expect(html).toContain('class="ae-trou is-rempli is-faux">fonds<')
    expect(html).toContain('is-attendu')
  })
})

describe('TrouSaisie', () => {
  it('initial : un champ texte étiqueté, l’aide en indication', () => {
    const html = exo(TrouSaisie, { payload: ITEMS.trou_saisie.payload, valeur: '' })
    expect(html).toMatch(/<label for="[^"]+" class="ae-saisie-label">Ta réponse<\/label>/)
    expect(html).toContain('type="text"')
    expect(html).toContain('placeholder="Un chiffre"')
    expect(html).toContain('autoComplete="off"')
    expect(html).toContain('class="ae-trou">…<')
  })
  it('vert : le champ et le trou en juste, désactivé', () => {
    const html = exo(TrouSaisie, { payload: ITEMS.trou_saisie.payload, valeur: 'sept', verrouille: true, resultat: VERT(['7', 'sept']) })
    expect(html).toContain('ae-saisie is-juste')
    expect(html).toContain('class="ae-trou is-rempli is-juste">sept<')
    expect(html).toContain('disabled=""')
  })
  it('rouge : le champ en faux', () => {
    const html = exo(TrouSaisie, { payload: ITEMS.trou_saisie.payload, valeur: 'huit', verrouille: true, resultat: ROUGE(['7', 'sept']) })
    expect(html).toContain('ae-saisie is-faux')
    expect(html).toContain('value="huit"')
  })
})

describe('Carte', () => {
  it('initial : le recto seul et Retourner', () => {
    const html = exo(Carte, { payload: ITEMS.carte.payload })
    expect(html).toContain('>Recto<')
    expect(html).toContain('Le cadrage étroit')
    expect(html).not.toContain('Regarder le court terme')
    expect(html).toContain('>Retourner</button>')
    expect(html).not.toContain('Je savais')
  })
  it('retournée : le verso et les deux jugements', () => {
    const html = exo(Carte, { payload: ITEMS.carte.payload, valeur: { retournee: true } })
    expect(html).toContain('>Verso<')
    expect(html).toContain('Regarder le court terme')
    expect(html).toContain('>Je savais</button>')
    expect(html).toContain('>À revoir</button>')
    expect(html).not.toContain('Retourner')
  })
  it('vert : jugée sue, plus de boutons', () => {
    const html = exo(Carte, { payload: ITEMS.carte.payload, valeur: { retournee: true, su: true }, verrouille: true, resultat: VERT({}) })
    expect(html).toContain('Marquée comme sue.')
    expect(html).not.toContain('<button')
  })
  it('rouge : jugée à revoir', () => {
    const html = exo(Carte, { payload: ITEMS.carte.payload, valeur: { retournee: true, su: false }, verrouille: true, resultat: ROUGE({}) })
    expect(html).toContain('Marquée à revoir')
    expect(html).not.toContain('<button')
  })
})
