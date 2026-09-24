// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, les exercices côté écran
//
// La base tire les items, mélange les choix et corrige (migration 6,
// academy_demarrer_entrainement et academy_repondre) ; le navigateur ne voit
// jamais un corrigé avant d’avoir répondu. Ce qui reste ici est ce qu’il
// faut pour jouer une session sans réseau ni React : la valeur vide de
// chaque type, savoir si une saisie est complète, écrire une bonne réponse
// en clair, normaliser un texte comme la base le fait, et recompter les XP
// comme academy_repondre et academy_terminer_entrainement (pour animer et
// pour le repli, jamais pour remplacer ce que le serveur rend).
//
// Les identifiants de réponse sont des INDICES PRÉSENTÉS : le serveur a
// mélangé les choix, les éléments ou la colonne de droite, et le client
// répond dans l’ordre reçu. Rien ici ne remélange.
// ═══════════════════════════════════════════════════════════════════════════

export const TYPES = ['choix', 'vrai_faux', 'multi', 'ordre', 'association', 'trou_choix', 'trou_saisie', 'carte']

const liste = (v) => (Array.isArray(v) ? v : [])
const texte = (v) => (v == null ? '' : String(v))
const entier = (v) => Number.isInteger(v) && v >= 0
const indicesValides = (tab, n) => liste(tab).every((i) => entier(i) && i < n)
const sansDoublon = (tab) => new Set(tab).size === tab.length
const trier = (tab) => [...tab].sort((a, b) => a - b)
const memesListes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * La valeur d’une réponse pas encore saisie, par type : null pour un choix
 * ou un vrai/faux, un tableau vide pour les types à plusieurs éléments,
 * une chaîne vide pour la saisie, null pour une carte pas retournée.
 */
export function reponseVide(type) {
  switch (type) {
    case 'multi':
    case 'ordre':
    case 'association':
      return []
    case 'trou_saisie':
      return ''
    default:
      return null
  }
}

/**
 * Vrai quand la saisie peut partir à la correction. Un choix doit viser un
 * choix présenté, un multi cocher au moins une case, un ordre placer tous
 * les éléments une fois chacun, une association apparier chaque ligne de
 * gauche à une ligne de droite distincte, une saisie contenir autre chose
 * que des espaces, une carte avoir été jugée « sue » ou « à revoir ».
 */
export function reponseComplete(type, valeur, payload) {
  const p = payload || {}
  switch (type) {
    case 'choix':
    case 'trou_choix':
      return entier(valeur) && valeur < liste(p.choix).length
    case 'vrai_faux':
      return typeof valeur === 'boolean'
    case 'multi': {
      const v = liste(valeur)
      return v.length > 0 && indicesValides(v, liste(p.choix).length) && sansDoublon(v)
    }
    case 'ordre': {
      const v = liste(valeur)
      const n = liste(p.elements).length
      return n > 0 && v.length === n && indicesValides(v, n) && sansDoublon(v)
    }
    case 'association': {
      const v = liste(valeur)
      const ng = liste(p.gauche).length
      const nd = liste(p.droite).length
      if (ng === 0 || v.length !== ng) return false
      if (!v.every((paire) => Array.isArray(paire) && paire.length === 2)) return false
      const gauches = v.map((paire) => paire[0])
      const droites = v.map((paire) => paire[1])
      return indicesValides(gauches, ng) && sansDoublon(gauches) && indicesValides(droites, nd) && sansDoublon(droites)
    }
    case 'trou_saisie':
      return normaliserSaisie(valeur) !== ''
    case 'carte':
      return typeof valeur?.su === 'boolean'
    default:
      return false
  }
}

/**
 * Ce qui part à academy_repondre : la carte n’envoie que { su }, la saisie
 * part telle quelle une fois débarrassée des espaces de bord (la base
 * normalise elle même), le reste est envoyé comme saisi.
 */
export function reponseAEnvoyer(type, valeur) {
  if (type === 'carte') return { su: valeur?.su === true }
  if (type === 'trou_saisie') return texte(valeur).trim()
  return valeur
}

// Même règle que academy_normaliser en base : minuscules, accents retirés,
// espaces réduits à un seul, ponctuation de bord retirée.
const ACCENTS_DE = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ'
const ACCENTS_VERS = 'aaaaaaceeeeiiiinooooouuuuyyoa'
const BORD = /^[ .,;:!?'"«»()]+|[ .,;:!?'"«»()]+$/g

/** La saisie d’un texte à trou telle que la base la compare aux réponses acceptées. */
export function normaliserSaisie(v) {
  // L apostrophe typographique du contenu vaut l’apostrophe droite du clavier.
  let s = texte(v).toLowerCase().replace(/\u2019/g, "'")
  let sortie = ''
  for (const ch of s) {
    const i = ACCENTS_DE.indexOf(ch)
    sortie += i >= 0 ? ACCENTS_VERS[i] : ch
  }
  s = sortie.replace(/\s+/g, ' ')
  return s.replace(BORD, '')
}

/**
 * La bonne réponse, telle que la rend academy_repondre (indices présentés),
 * écrite en clair pour le bandeau de correction. Plusieurs lignes sont
 * séparées par un retour à la ligne : le texte des choix cochés pour un
 * multi, une liste numérotée pour un ordre, « gauche : droite » pour une
 * association, les textes acceptés séparés par « ou » pour une saisie.
 * Une carte n’a pas de bonne réponse : chaîne vide.
 */
export function rendreBonneReponse(type, payload, bonne) {
  const p = payload || {}
  const choix = liste(p.choix)
  switch (type) {
    case 'choix':
    case 'trou_choix':
      return texte(choix[bonne])
    case 'vrai_faux':
      return bonne === true ? 'Vrai' : bonne === false ? 'Faux' : ''
    case 'multi':
      return trier(liste(bonne)).map((i) => texte(choix[i])).filter(Boolean).join('\n')
    case 'ordre': {
      const elements = liste(p.elements)
      return liste(bonne).map((i, k) => `${k + 1}. ${texte(elements[i])}`).join('\n')
    }
    case 'association': {
      const gauche = liste(p.gauche)
      const droite = liste(p.droite)
      return liste(bonne)
        .filter((paire) => Array.isArray(paire))
        .map(([g, d]) => `${texte(gauche[g])} : ${texte(droite[d])}`)
        .join('\n')
    }
    case 'trou_saisie':
      return liste(bonne).map(texte).filter(Boolean).join(' ou ')
    default:
      return ''
  }
}

/**
 * L’état d’une ligne de choix à l’écran : avant correction, 'on' si cochée,
 * sinon '' ; après correction, 'juste' (cochée et attendue), 'faux' (cochée
 * mais pas attendue), 'attendu' (attendue mais pas cochée), sinon ''.
 */
export function etatChoix(coche, estBonne, corrige) {
  if (!corrige) return coche ? 'on' : ''
  if (estBonne) return coche ? 'juste' : 'attendu'
  return coche ? 'faux' : ''
}

/**
 * Vrai si la saisie vaut la bonne réponse rendue par la base. Sert au rejeu
 * des erreurs en fin de session : la base a déjà corrigé une fois et rendu
 * la bonne réponse, on la rejoue en local sans nouvel appel.
 */
export function estBonneReponse(type, valeur, bonne) {
  switch (type) {
    case 'choix':
    case 'trou_choix':
      return entier(valeur) && valeur === bonne
    case 'vrai_faux':
      return typeof valeur === 'boolean' && valeur === bonne
    case 'multi':
      return liste(bonne).length > 0 && memesListes(trier(liste(valeur)), trier(liste(bonne)))
    case 'ordre':
      return liste(bonne).length > 0 && memesListes(liste(valeur), liste(bonne))
    case 'association': {
      const cle = (paires) => liste(paires)
        .filter((paire) => Array.isArray(paire))
        .map(([g, d]) => `${g}:${d}`)
        .sort()
      return liste(bonne).length > 0 && memesListes(cle(valeur), cle(bonne))
    }
    case 'trou_saisie': {
      const n = normaliserSaisie(valeur)
      return n !== '' && liste(bonne).map(normaliserSaisie).includes(n)
    }
    case 'carte':
      return valeur?.su === true
    default:
      return false
  }
}

// ─── XP, le miroir de la règle serveur (migration 8) ──────────────────────
//
// Le serveur seul fait foi : academy_repondre rend xp_gagne, xp_session,
// combo et combo_max, academy_terminer_entrainement rend xp_detail. Ce qui
// suit recalcule la même règle pour animer (compteur qui monte) et pour le
// repli quand une réponse ou un bilan arrive sans ces champs.

/** Le combo à partir duquel chaque bonne réponse rapporte 5 XP de plus. */
export const COMBO_BONUS = 3

/**
 * L’XP d’une réponse, comme academy_repondre : 10 pour une bonne réponse,
 * 5 pour une carte sue, 0 pour une mauvaise réponse ou une carte à revoir ;
 * +5 quand le combo APRÈS cette réponse (bonnes réponses d’affilée, carte
 * sue comprise) atteint 3. Une erreur remet le combo à zéro : 0 XP.
 */
export function xpReponse(type, correcte, combo) {
  if (correcte !== true) return 0
  const base = type === 'carte' ? 5 : 10
  const c = Math.max(0, Math.floor(Number(combo) || 0))
  return base + (c >= COMBO_BONUS ? 5 : 0)
}

/**
 * La ventilation des XP d’une liste de réponses, pour le bilan :
 * { reponses (somme des 10 et des 5), combo (somme des bonus +5), total,
 * combo_max, nb_bons }. Les réponses sont lues dans l’ordre donné
 * ({ type, correcte, combo? }) ; le combo courant se recalcule (une bonne
 * réponse l’augmente, une erreur le remet à zéro) sauf quand la réponse
 * porte le combo rendu par le serveur, qui prime (reprise d’une session
 * ouverte, réponses déjà enregistrées).
 */
export function ventilationXp(reponses) {
  let courant = 0
  let comboMax = 0
  let base = 0
  let bonus = 0
  let bons = 0
  for (const r of liste(reponses)) {
    const correcte = r?.correcte === true
    if (Number.isInteger(r?.combo) && r.combo >= 0) courant = correcte ? r.combo : 0
    else courant = correcte ? courant + 1 : 0
    if (courant > comboMax) comboMax = courant
    if (!correcte) continue
    bons += 1
    const xp = xpReponse(r.type, true, courant)
    const b = courant >= COMBO_BONUS ? 5 : 0
    base += xp - b
    bonus += b
  }
  return { reponses: base, combo: bonus, total: base + bonus, combo_max: comboMax, nb_bons: bons }
}

/**
 * Les XP d’une session, comme academy_terminer_entrainement : 10 par bonne
 * réponse hors carte, 5 par carte sue (les cartes sues sont comptées dans
 * les bonnes réponses), plus les bonus de combo (xpCombo, la clé `combo` de
 * ventilationXp), 20 de plus pour une session parfaite, 10 de plus pour la
 * première session du jour, plus l’XP des défis du jour complétés par la
 * session (xpDefis, que seul le serveur connaît). Sert au repli quand le
 * bilan arrive sans xp_detail.
 */
export function xpSession(nbBons, nbCartes, parfaite, premiere, xpCombo = 0, xpDefis = 0) {
  const bons = Math.max(0, Math.floor(Number(nbBons) || 0))
  const cartes = Math.max(0, Math.min(bons, Math.floor(Number(nbCartes) || 0)))
  const combo = Math.max(0, Math.floor(Number(xpCombo) || 0))
  const defis = Math.max(0, Math.floor(Number(xpDefis) || 0))
  return (bons - cartes) * 10 + cartes * 5 + combo + (parfaite ? 20 : 0) + (premiere ? 10 : 0) + defis
}

/**
 * Vrai quand academy_repondre refuse parce que la session est déjà finie
 * (« Session terminee ») ou que l’item n’en fait pas partie : il n’y a plus
 * rien à réessayer, la session passe au bilan. Comparé sans accent ni casse,
 * comme la base écrit ses messages.
 */
export function erreurSessionClose(e) {
  const m = normaliserSaisie(e?.message ?? e)
  return m.includes('session terminee') || m.includes('ne fait pas partie de la session')
}

/**
 * Les items qu’il reste à jouer dans une session rendue par
 * academy_demarrer_entrainement : dans l’ordre des rangs, sans ceux déjà
 * répondus (reprise d’une session ouverte de moins de deux heures).
 */
export function itemsAJouer(entrainement) {
  const deja = new Set(liste(entrainement?.reponses_deja).map((r) => r?.item_id).filter(Boolean))
  return liste(entrainement?.items)
    .filter((it) => it && it.item_id && !deja.has(it.item_id))
    .sort((a, b) => (Number(a.rang) || 0) - (Number(b.rang) || 0))
}

/** L’énoncé court d’un item, quel que soit son type, pour une liste d’erreurs. */
export function enonceCourt(item, longueur = 120) {
  const p = item?.payload || {}
  const brut = texte(p.enonce || p.phrase || p.recto || item?.enonce_court || '')
  return brut.length > longueur ? `${brut.slice(0, longueur - 1)}…` : brut
}

const hex = (n) => {
  let s = ''
  for (let i = 0; i < n; i += 1) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

/**
 * Le jeton d’une session, au format uuid v4 : crypto.randomUUID quand le
 * navigateur l offre, sinon un repli qui garde le format (la base n’exige
 * que l’unicité). Rend l’ouverture rejouable sans doubler la session.
 */
export function jetonSession() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`
}
