// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE — comment on trouve quelqu'un quand on tape son nom
//
// Ce que faisait le CRM jusqu'ici, partout : `texte.toLowerCase().includes(q)`.
// Sur une base française, trois choses cassent immédiatement.
//
// 1. LES ACCENTS. 48 des 379 clients en portent un. Tapé « aurelie », le
//    champ ne trouve pas « Aurélie » — personne ne tape les accents dans une
//    barre de recherche, et le conseiller conclut que la fiche n'existe pas.
//
// 2. L'ORDRE DES MOTS. La recherche interrogeait `nom` et `prenom`
//    séparément. Chercher « vacher hervé » ne trouvait rien : `nom` vaut
//    « Vacher », `prenom` vaut « Hervé », et aucun des deux ne contient la
//    phrase entière. Le nom complet, tapé comme on le prononce, ne marchait
//    pas.
//
// 3. LA SAISIE DES FICHES EST HÉTÉROGÈNE. 330 fiches sur 379 ont `prenom`
//    vide et tout le nom dans `nom` (« Aurélie buiret ») ; 49 seulement ont
//    les deux champs séparés. Une recherche qui suppose une structure se
//    trompe sur l'une des deux moitiés de la base. Ici on concatène et on
//    raisonne en jetons — la structure n'a plus d'importance.
//
// PRINCIPE : on compare des JETONS, pas des chaînes. Chaque mot tapé doit se
// retrouver quelque part dans la fiche, dans n'importe quel ordre. Le score
// récompense un début de mot plutôt qu'un milieu, et un mot entier plutôt
// qu'un fragment — « Cadet » remonte avant « Decadet » quand on tape « cadet ».
//
// La tolérance à la frappe (« cadt » → « Cadet ») est volontairement étroite :
// sous-suite dans UN SEUL mot, à partir de 3 lettres, et la première lettre
// doit correspondre. Sans ces trois gardes, une recherche floue remonte tout
// et ne vaut plus rien.
// ═══════════════════════════════════════════════════════════════════════════

// Les ligatures ne se décomposent pas en NFD : « œ » reste « œ ». Rare, mais
// Lecœur et Lenœud existent, et une recherche qui échoue sur un nom propre
// est exactement ce qu'on cherche à supprimer.
const LIGATURES = { œ: 'oe', Œ: 'oe', æ: 'ae', Æ: 'ae', ß: 'ss' }

/**
 * Forme comparable d'un texte : minuscules, sans accent ni ligature,
 * ponctuation ramenée à des espaces, espaces normalisés.
 * « Jean-Émile O'Brien » → « jean emile o brien »
 */
export function normaliser(texte) {
  return String(texte ?? '')
    .replace(/[œŒæÆß]/g, (c) => LIGATURES[c])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marques diacritiques combinantes
    .toLowerCase()
    // Le trait d'union et l'apostrophe séparent des mots ici : « Jean-Paul »
    // doit se trouver aussi bien en tapant « jean » qu'en tapant « paul ».
    .replace(/[^a-z0-9@.+]+/g, ' ')
    .trim()
}

/** Découpe une requête en jetons comparables. Vide si rien de cherchable. */
export function jetons(requete) {
  const n = normaliser(requete)
  return n ? n.split(' ').filter(Boolean) : []
}

// Le jeton est-il une sous-suite du mot ? « cadt » ⊂ « cadet ».
function sousSuite(mot, jeton) {
  let i = 0
  for (const c of mot) {
    if (c === jeton[i]) i++
    if (i === jeton.length) return true
  }
  return false
}

// Score d'un jeton contre la liste des mots du texte. 0 = introuvable.
function scoreJeton(mots, jeton) {
  let meilleur = 0
  for (const mot of mots) {
    if (mot === jeton) return 100                    // le mot exact
    if (mot.startsWith(jeton)) {
      // Un début de mot est une intention claire. Plus le mot restant est
      // court, plus la correspondance est franche : « cadet » sur « Cadet »
      // vaut mieux que « cad » sur « Cadenat ».
      meilleur = Math.max(meilleur, 70 + Math.round((jeton.length / mot.length) * 20))
      continue
    }
    if (mot.includes(jeton)) { meilleur = Math.max(meilleur, 45); continue }
    // Tolérance à la frappe, sous garde : au moins 3 lettres, même initiale,
    // et à l'intérieur d'un seul mot.
    if (jeton.length >= 3 && mot[0] === jeton[0] && sousSuite(mot, jeton)) {
      meilleur = Math.max(meilleur, 20)
    }
  }
  return meilleur
}

/**
 * Score d'un texte pour une requête. 0 si un seul jeton reste introuvable —
 * ajouter un mot doit toujours restreindre le résultat, jamais l'élargir.
 *
 * @param {string} texte    tout ce qui décrit la fiche, concaténé
 * @param {string|string[]} requete
 * @returns {number} 0 = pas de correspondance ; plus haut = plus pertinent
 */
export function scoreTexte(texte, requete) {
  const cherches = Array.isArray(requete) ? requete : jetons(requete)
  if (!cherches.length) return 0
  const mots = normaliser(texte).split(' ').filter(Boolean)
  if (!mots.length) return 0

  let total = 0
  for (const j of cherches) {
    const s = scoreJeton(mots, j)
    if (!s) return 0
    total += s
  }
  // Moyenne, pour qu'une requête longue ne l'emporte pas mécaniquement sur
  // une courte quand on trie des résultats de provenances différentes.
  let score = total / cherches.length

  // À score égal, la fiche la plus courte est la plus précise : « Cadet »
  // devant « Cadet-Villeneuve » quand on a tapé « cadet ».
  score += Math.max(0, 6 - mots.length)

  // Départage seulement, volontairement faible. On a d'abord donné 8 points
  // à une correspondance en tête de fiche — c'était une erreur ici : 330
  // fiches sur 379 stockent « Prénom Nom » dans un seul champ, donc le
  // PATRONYME est le dernier mot, et c'est par lui qu'on cherche quelqu'un.
  // Un bonus fort faisait remonter « Cadenat Paul » devant « Cédric Cadet »
  // pour « cad ». La franchise de la correspondance doit primer ; la position
  // ne sert plus qu'à trancher entre deux fiches par ailleurs identiques.
  if (mots[0] === cherches[0]) score += 2
  else if (mots[0]?.startsWith(cherches[0])) score += 1

  return score
}

/**
 * Filtre et trie une liste par pertinence.
 *
 * @param {Array}    items
 * @param {string}   requete
 * @param {Function} texteDe  item → chaîne cherchable (nom, email, code…)
 * @param {Object}   [opts]
 * @param {number}   [opts.max]        borne le nombre de résultats
 * @param {Function} [opts.departage]  comparateur appliqué à score égal
 * @returns {Array} les items eux-mêmes, ordonnés
 */
export function chercher(items, requete, texteDe, opts = {}) {
  const liste = Array.isArray(items) ? items : []
  const cherches = jetons(requete)
  if (!cherches.length) return opts.max ? liste.slice(0, opts.max) : liste

  const notes = []
  for (const item of liste) {
    const s = scoreTexte(texteDe(item), cherches)
    if (s > 0) notes.push({ item, s })
  }
  notes.sort((a, b) => (b.s - a.s) || (opts.departage ? opts.departage(a.item, b.item) : 0))
  const ordonne = notes.map((n) => n.item)
  return opts.max ? ordonne.slice(0, opts.max) : ordonne
}

/** Vrai si le texte correspond à la requête. Remplaçant direct de `includes`. */
export function correspond(texte, requete) {
  return scoreTexte(texte, requete) > 0
}

/**
 * Découpe un texte pour l'affichage en marquant ce qui correspond, afin que
 * le conseiller voie POURQUOI une fiche remonte — le détail qui fait qu'une
 * liste de résultats se lit d'un coup d'œil au lieu de se déchiffrer.
 *
 * Ne marque que les correspondances littérales (début ou intérieur de mot) :
 * surligner une sous-suite (« c…a…d…t ») donnerait un mot en confettis.
 *
 * @returns {Array<{texte: string, marque: boolean}>}
 */
export function segmenter(texte, requete) {
  // NFC d'abord : un « é » saisi en forme décomposée (e + accent) occupe deux
  // positions et ferait glisser tout le repérage d'un cran.
  const brut = String(texte ?? '').normalize('NFC')
  const cherches = jetons(requete)
  if (!brut || !cherches.length) return [{ texte: brut, marque: false }]

  // La normalisation peut changer la longueur (ligatures, accents composés) :
  // on ne peut pas indexer le texte d'origine avec les positions du texte
  // normalisé. On normalise donc caractère par caractère en gardant, pour
  // chaque position normalisée, la position d'origine dont elle vient.
  let norm = ''
  const origine = []
  for (let i = 0; i < brut.length; i++) {
    const c = normaliser(brut[i])
    // normaliser() coupe les espaces de bord : un caractère de ponctuation
    // isolé revient vide. On le représente par un espace pour ne pas décaler.
    const morceau = c || ' '
    for (const ch of morceau) { norm += ch; origine.push(i) }
  }

  const marques = new Array(brut.length).fill(false)
  for (const j of cherches) {
    let depuis = 0
    for (;;) {
      const at = norm.indexOf(j, depuis)
      if (at === -1) break
      for (let k = at; k < at + j.length && k < origine.length; k++) marques[origine[k]] = true
      depuis = at + 1
    }
  }

  const segments = []
  for (let i = 0; i < brut.length; i++) {
    const m = marques[i]
    const dernier = segments[segments.length - 1]
    if (dernier && dernier.marque === m) dernier.texte += brut[i]
    else segments.push({ texte: brut[i], marque: m })
  }
  return segments
}
