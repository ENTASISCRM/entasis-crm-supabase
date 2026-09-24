// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, l édition d’un exercice et les règles du mémo
//
// Un exercice (item) porte son énoncé dans `payload` et sa réponse dans
// `corrige`, les deux en indices ORIGINAUX : c’est le serveur qui mélange
// à l’ouverture d’une session et le collaborateur répond en indices
// présentés. L’éditeur, lui, montre toujours l’ordre original ; pour un
// « remettre dans l’ordre » il montre même les éléments dans le bon ordre
// (corrigé = identité), pour une association les lignes gauche et droite en
// face (corrigé = diagonale) : c’est plus simple à relire pour Louis.
//
// Un exercice peut aussi porter une FIGURE dans `payload.figure` : soit
// { ref } qui renvoie à un schéma de la version (academy_module_versions.
// schemas), soit { svg, alt } propre à l’exercice. Le mémo, lui, place ses
// schémas avec un marqueur [schema:cle] ; ce fichier tient les deux règles,
// parce que le compteur de mots du mémo doit ignorer ces marqueurs et que
// l’écran du deck a besoin de la même découpe pour rendre les figures au
// bon endroit.
//
// Rien ici ne touche à React ni au réseau : l’état d’un formulaire, sa
// validation, le patch envoyé à academy_enregistrer_item et la bonne
// réponse de l’aperçu (les choix présentés sans mélange, la comparaison
// rejouée par estBonneReponse de lib/academy/exercices) se testent à sec.
// ═══════════════════════════════════════════════════════════════════════════

import { LONGUEUR_MAX } from './svg'

/** Les huit types, dans l’ordre du choix « Nouvel exercice ». */
export const TYPES_ITEM = ['choix', 'vrai_faux', 'multi', 'ordre', 'association', 'trou_choix', 'trou_saisie', 'carte']

/** Nombre de choix d’un choix unique ou d’un texte à trou : toujours quatre. */
export const NB_CHOIX = 4
/** Un choix multiple propose de quatre à six réponses. */
export const MULTI_MIN = 4
export const MULTI_MAX = 6
/** Un mémo se lit d’un trait : on vise cette fourchette de mots. */
export const MEMO_MOTS = { min: 180, max: 260 }

const TROU = '___'
const texte = (v) => (v == null ? '' : String(v))
const tableau = (v) => (Array.isArray(v) ? v : [])
const textes = (v) => tableau(v).map(texte)
const entier = (v, defaut) => {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : defaut
}
// Le séparateur de milliers français est une espace insécable (même parti
// pris que lib/campagnes.js : on fixe la classique, pas la fine d ICU).
const milliers = (n) => Number(n).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')
const remplir = (liste, n) => {
  const l = [...liste]
  while (l.length < n) l.push('')
  return l
}

// ─── Le mémo et ses schémas ────────────────────────────────────────────────

// Le marqueur qui place un schéma dans un mémo : [schema:cle], seul sur sa
// ligne. La clé ne porte ni espace ni majuscule ; on reste tolérant à la
// lecture (majuscules acceptées, clé normalisée ensuite) pour qu’un mémo
// écrit à la main ne perde pas sa figure en silence.
const MARQUEUR = /\[schema:([^\]\s]{1,64})\]/i
const MARQUEUR_PARTOUT = new RegExp(MARQUEUR.source, 'gi')

/** La clé d’un schéma, telle qu’on la range : minuscules, sans espace. */
export function normaliserCle(v) {
  return texte(v).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '')
}

/** Nombre de mots d’un texte, marqueurs [schema:…] exclus. */
export function compterMots(t) {
  return texte(t).replace(MARQUEUR_PARTOUT, ' ').split(/\s+/).filter(Boolean).length
}

/**
 * Découpe un mémo en morceaux autour des marqueurs : une suite de
 * { type: 'texte', texte } et { type: 'schema', cle }. Les morceaux de
 * texte se rendent chacun par le rendu markdown ; comme un marqueur occupe
 * sa ligne, la découpe tombe entre deux blocs et ne coupe jamais une liste
 * ni un tableau en deux.
 */
export function decouperMemo(markdown) {
  const morceaux = texte(markdown).split(MARQUEUR)
  const parties = []
  morceaux.forEach((v, i) => {
    if (i % 2 === 1) {
      const cle = normaliserCle(v)
      if (cle) parties.push({ type: 'schema', cle })
      return
    }
    const t = v.trim()
    if (t) parties.push({ type: 'texte', texte: t })
  })
  return parties
}

/** Les réponses acceptées d’un texte à compléter : une par ligne, sans les vides. */
export const lignes = (t) => texte(t).split('\n').map((l) => l.trim()).filter(Boolean)

/**
 * L’état de formulaire d’un item, pour les huit types à la fois : les champs
 * qu’un type n’utilise pas restent à vide. `item` peut être { type } seul
 * pour un nouvel exercice.
 */
export function etatItem(item) {
  const it = item || {}
  const type = TYPES_ITEM.includes(it.type) ? it.type : 'choix'
  const p = it.payload && typeof it.payload === 'object' ? it.payload : {}
  const c = it.corrige && typeof it.corrige === 'object' ? it.corrige : {}
  const choix = textes(p.choix)
  const fig = p.figure && typeof p.figure === 'object' ? p.figure : {}
  const figureRef = normaliserCle(fig.ref)
  const figureSvg = texte(fig.svg)

  // Les éléments d’un « ordre » s’affichent dans le bon ordre ; un corrigé
  // absent ou incomplet laisse l’ordre du payload.
  let elements = textes(p.elements)
  const ordre = tableau(c.ordre).map((i) => entier(i, -1))
  if (ordre.length === elements.length && elements.length > 0 && ordre.every((i) => i >= 0 && i < elements.length) && new Set(ordre).size === ordre.length) {
    elements = ordre.map((i) => elements[i])
  }

  // Les paires d’une association s’affichent en face à face.
  const gauche = textes(p.gauche)
  let droite = textes(p.droite)
  const paires = tableau(c.paires)
  if (paires.length === gauche.length && gauche.length > 0) {
    const parGauche = new Map(paires.map((pr) => [entier(pr?.[0], -1), entier(pr?.[1], -1)]))
    const alignee = gauche.map((_, g) => {
      const d = parGauche.get(g)
      return d != null && d >= 0 && d < droite.length ? droite[d] : null
    })
    if (alignee.every((v) => v != null)) droite = alignee
  }

  return {
    type,
    competence: texte(it.competence),
    difficulte: String(it.difficulte ?? 2),
    explication: texte(it.explication),
    enonce: texte(p.enonce),
    phrase: texte(p.phrase),
    choix: type === 'multi' ? remplir(choix, MULTI_MIN) : remplir(choix.slice(0, NB_CHOIX), NB_CHOIX),
    bonne: entier(c.index, 0),
    vrai: c.vrai === true || c.vrai === 'true',
    coches: tableau(c.indices).map((i) => entier(i, -1)).filter((i) => i >= 0),
    elements: elements.length ? elements : ['', ''],
    gauche: gauche.length ? gauche : ['', ''],
    droite: droite.length ? droite : ['', ''],
    aide: texte(p.aide),
    reponses: textes(c.reponses).join('\n'),
    recto: texte(p.recto),
    verso: texte(p.verso),
    figure_mode: figureRef ? 'ref' : (figureSvg.trim() ? 'svg' : 'aucune'),
    figure_ref: figureRef,
    figure_svg: figureSvg,
    figure_alt: texte(fig.alt),
  }
}

/** Le texte d’un énoncé court pour une liste : la question, la phrase ou le recto. */
export function enonceItem(item) {
  const p = item?.payload && typeof item.payload === 'object' ? item.payload : {}
  return texte(p.enonce || p.phrase || p.recto).trim()
}

/** Un énoncé coupé à `max` caractères, avec des points de suspension. */
export function enonceCourt(item, max = 110) {
  const e = enonceItem(item).replace(/\s+/g, ' ')
  return e.length > max ? `${e.slice(0, max - 1).trimEnd()}…` : e
}

// Une phrase à trou porte exactement un « ___ » (trois tirets bas, pas
// quatre) : le message dit lequel des deux cas pose problème.
function erreurTrou(phrase) {
  const p = texte(phrase)
  if (!p.trim()) return 'La phrase est obligatoire'
  const trous = p.match(/_{3,}/g) || []
  if (trous.length === 0) return 'La phrase doit contenir un trou écrit ___ (trois tirets bas)'
  if (trous.length > 1) return 'Une phrase ne porte qu’un seul trou ___'
  if (trous[0] !== TROU) return 'Le trou s’écrit avec exactement trois tirets bas : ___'
  return null
}

const vides = (liste) => liste.some((v) => !texte(v).trim())

/** Les trois états du champ « Figure » d’un exercice. */
export const FIGURES = ['aucune', 'ref', 'svg']

/**
 * La figure d’un exercice depuis l’état du formulaire : { figure: null }
 * quand il n’y en a pas, { figure: { ref } } pour un schéma de la version,
 * { figure: { svg, alt } } pour une figure propre, ou { erreur }. Le SVG est
 * refusé ici, avant l’envoi, au delà de la longueur que la base et
 * l’assainisseur acceptent.
 */
export function figureItem(f) {
  const mode = FIGURES.includes(f?.figure_mode) ? f.figure_mode : 'aucune'
  if (mode === 'ref') {
    const ref = normaliserCle(f.figure_ref)
    if (!ref) return { erreur: 'Choisissez le schéma de la version, ou mettez la figure à « Aucune »' }
    return { figure: { ref } }
  }
  if (mode === 'svg') {
    const svg = texte(f.figure_svg).trim()
    if (!svg) return { erreur: 'Collez le SVG de la figure, ou mettez la figure à « Aucune »' }
    if (svg.length > LONGUEUR_MAX) return { erreur: `La figure dépasse ${milliers(LONGUEUR_MAX)} caractères : elle ne serait pas rendue` }
    const alt = texte(f.figure_alt).trim()
    return { figure: alt ? { svg, alt } : { svg } }
  }
  return { figure: null }
}

/**
 * Vérifie l’état d’un formulaire et construit le patch pour
 * academy_enregistrer_item. Rend { erreur } avec un message lisible, ou
 * { patch } prêt à envoyer (type, competence, difficulte, explication,
 * payload, corrige) en indices originaux. La figure, commune aux huit
 * types, s’ajoute au payload une fois le reste vérifié.
 */
export function validerItem(f) {
  const { erreur, figure } = figureItem(f)
  if (erreur) return { erreur }
  const resultat = validerChamps(f)
  if (resultat.erreur || !figure) return resultat
  return { patch: { ...resultat.patch, payload: { ...resultat.patch.payload, figure } } }
}

function validerChamps(f) {
  const type = f?.type
  if (!TYPES_ITEM.includes(type)) return { erreur: 'Type d’exercice inconnu' }
  const competence = texte(f.competence).trim()
  if (!competence) return { erreur: 'La compétence est obligatoire : elle nourrit les notions faibles du pilotage' }
  const difficulte = entier(f.difficulte, 2)
  if (difficulte < 1 || difficulte > 3) return { erreur: 'La difficulté va de 1 à 3' }
  const explication = texte(f.explication).trim()
  if (type !== 'carte' && !explication) return { erreur: 'L’explication est obligatoire : c’est la ligne lue après la réponse, juste ou fausse' }

  const base = { type, competence, difficulte, explication }
  const enonce = texte(f.enonce).trim()
  const besoinEnonce = () => (enonce ? null : 'L’énoncé est obligatoire')

  if (type === 'choix' || type === 'trou_choix') {
    const choix = tableau(f.choix).slice(0, NB_CHOIX).map((v) => texte(v).trim())
    const probleme = type === 'choix' ? besoinEnonce() : erreurTrou(f.phrase)
    if (probleme) return { erreur: probleme }
    if (choix.length < NB_CHOIX || vides(choix)) return { erreur: `Les ${NB_CHOIX} choix sont obligatoires` }
    if (new Set(choix).size !== choix.length) return { erreur: 'Deux choix sont identiques' }
    const index = entier(f.bonne, -1)
    if (index < 0 || index >= NB_CHOIX) return { erreur: 'Cochez la bonne réponse' }
    const payload = type === 'choix' ? { enonce, choix } : { phrase: texte(f.phrase).trim(), choix }
    return { patch: { ...base, payload, corrige: { index } } }
  }

  if (type === 'vrai_faux') {
    const probleme = besoinEnonce()
    if (probleme) return { erreur: probleme }
    return { patch: { ...base, payload: { enonce }, corrige: { vrai: f.vrai === true } } }
  }

  if (type === 'multi') {
    const probleme = besoinEnonce()
    if (probleme) return { erreur: probleme }
    const choix = tableau(f.choix).map((v) => texte(v).trim())
    if (choix.length < MULTI_MIN || choix.length > MULTI_MAX) return { erreur: `Un choix multiple propose de ${MULTI_MIN} à ${MULTI_MAX} réponses` }
    if (vides(choix)) return { erreur: 'Aucun choix ne peut rester vide' }
    if (new Set(choix).size !== choix.length) return { erreur: 'Deux choix sont identiques' }
    const indices = [...new Set(tableau(f.coches).map((i) => entier(i, -1)))].filter((i) => i >= 0 && i < choix.length).sort((a, b) => a - b)
    if (indices.length === 0) return { erreur: 'Cochez au moins une bonne réponse' }
    if (indices.length === choix.length) return { erreur: 'Toutes les réponses ne peuvent pas être bonnes' }
    return { patch: { ...base, payload: { enonce, choix }, corrige: { indices } } }
  }

  if (type === 'ordre') {
    const probleme = besoinEnonce()
    if (probleme) return { erreur: probleme }
    const elements = tableau(f.elements).map((v) => texte(v).trim())
    if (elements.length < 2) return { erreur: 'Il faut au moins deux éléments à remettre dans l’ordre' }
    if (vides(elements)) return { erreur: 'Aucun élément ne peut rester vide' }
    if (new Set(elements).size !== elements.length) return { erreur: 'Deux éléments sont identiques' }
    return { patch: { ...base, payload: { enonce, elements }, corrige: { ordre: elements.map((_, i) => i) } } }
  }

  if (type === 'association') {
    const probleme = besoinEnonce()
    if (probleme) return { erreur: probleme }
    const gauche = tableau(f.gauche).map((v) => texte(v).trim())
    const droite = tableau(f.droite).map((v) => texte(v).trim())
    if (gauche.length < 2 || gauche.length !== droite.length) return { erreur: 'Il faut au moins deux paires, chaque ligne de gauche en face de la sienne' }
    if (vides(gauche) || vides(droite)) return { erreur: 'Aucune case d’une paire ne peut rester vide' }
    if (new Set(gauche).size !== gauche.length || new Set(droite).size !== droite.length) return { erreur: 'Deux lignes d’une même colonne sont identiques' }
    return { patch: { ...base, payload: { enonce, gauche, droite }, corrige: { paires: gauche.map((_, i) => [i, i]) } } }
  }

  if (type === 'trou_saisie') {
    const probleme = erreurTrou(f.phrase)
    if (probleme) return { erreur: probleme }
    const reponses = [...new Set(lignes(f.reponses))]
    if (reponses.length === 0) return { erreur: 'Donnez au moins une réponse acceptée, une par ligne' }
    const payload = { phrase: texte(f.phrase).trim() }
    const aide = texte(f.aide).trim()
    if (aide) payload.aide = aide
    return { patch: { ...base, payload, corrige: { reponses } } }
  }

  // carte
  const recto = texte(f.recto).trim()
  const verso = texte(f.verso).trim()
  if (!recto) return { erreur: 'Le recto de la carte est obligatoire' }
  if (!verso) return { erreur: 'Le verso de la carte est obligatoire' }
  return { patch: { ...base, payload: { recto, verso }, corrige: {} } }
}

/**
 * La bonne réponse d’un aperçu, dans la forme que rend academy_repondre :
 * l’aperçu présente les choix tels quels (aucun mélange), les indices
 * présentés sont donc les indices originaux du corrigé. Sert à l’aperçu
 * administrateur seulement, jamais à une vraie session ; la comparaison
 * avec la saisie passe ensuite par estBonneReponse (lib/academy/exercices).
 */
export function bonneReponseApercu(type, corrige) {
  const c = corrige && typeof corrige === 'object' ? corrige : {}
  if (type === 'choix' || type === 'trou_choix') return entier(c.index, -1)
  if (type === 'vrai_faux') return c.vrai === true
  if (type === 'multi') return tableau(c.indices).map((i) => entier(i, -1)).filter((i) => i >= 0)
  if (type === 'ordre') return tableau(c.ordre).map((i) => entier(i, -1))
  if (type === 'association') return tableau(c.paires).map((p) => [entier(p?.[0], -1), entier(p?.[1], -1)])
  if (type === 'trou_saisie') return textes(c.reponses)
  return {}
}
