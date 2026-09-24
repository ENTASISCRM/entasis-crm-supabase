// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, assainissement des schémas SVG
//
// Un schéma est un texte SVG rangé en base (academy_module_versions.schemas,
// payload.figure d’un exercice), écrit par l’administrateur de l’Academy ou
// par le générateur de decks. Il n’est jamais rendu tel quel : tout passe
// par assainirSvg avant d’atteindre dangerouslySetInnerHTML (composant
// Schema). Un texte hostile qui atterrirait en base (injection dans un mémo
// généré, compte administrateur compromis) ne doit pas devenir un XSS
// stocké chez tous les conseillers.
//
// Deux étages :
//   1. une PRÉ VÉRIFICATION par expressions régulières sur le texte brut,
//      qui refuse d’emblée ce que le guide d’auteur interdit : balise
//      script, foreignObject, image, iframe, object, embed ou style,
//      attribut on*, adresse javascript: ou data:, lien href qui ne renvoie
//      pas à l’intérieur du schéma (#…), url() vers l’extérieur, déclaration
//      ou instruction XML au milieu du texte, plus de 24 000 caractères.
//      Elle tourne partout, y compris sous Node (tests) ;
//   2. DOMPurify (profil svg, liste blanche d’éléments, crochets qui
//      retirent les href externes et les url() externes), qui a besoin d’un
//      DOM : c’est lui qui fait l’assainissement complet, dans le
//      navigateur. Sous Node, DOMPurify n’est pas supporté (isSupported
//      faux) et rendrait le texte tel quel : on ne l’appelle pas, le texte
//      pré vérifié passe (rien ne s’exécute sans DOM). Avec un DOM mais sans
//      DOMPurify, on refuse. Le harnais visuel vérifie le rendu réel.
//
// Instance DOMPurify propre à ce module (même motif que RenduMarkdown) : ses
// crochets ne touchent pas les autres écrans qui assainissent.
//
// La racine est ensuite normalisée : role="img", aria-label (alt donné,
// sinon <title> du schéma, sinon « Schéma ») et width="100%",
// les width et height fixes retirés (le schéma prend la largeur de sa
// figure, la hauteur suit le viewBox).
// ═══════════════════════════════════════════════════════════════════════════

import DOMPurify from 'dompurify'

/** Longueur maximale d’un schéma, en caractères (même seuil qu’en base). */
export const LONGUEUR_MAX = 24000

/** Ce que ni la pré vérification ni DOMPurify ne laissent passer. */
export const BALISES_INTERDITES = Object.freeze(['script', 'foreignObject', 'image', 'iframe', 'object', 'embed', 'style'])

/** La liste blanche des éléments d’un schéma (spec § Schémas), en minuscules. */
export const BALISES_AUTORISEES = Object.freeze([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc',
  'defs', 'marker', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'use',
])

const AUTORISEES = new Set(BALISES_AUTORISEES)
const INTERDITES_MIN = BALISES_INTERDITES.map((b) => b.toLowerCase())

const COMMENTAIRE = /<!--[\s\S]*?-->/g
const PROLOGUE = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!DOCTYPE[^[>]*>\s*)?/i
const RACINE = /^<svg[\s>/]/i
const DECLARATION = /<[!?]/
const BALISE_INTERDITE = new RegExp(`<\\s*/?\\s*(${BALISES_INTERDITES.join('|')})\\b`, 'i')
const GESTIONNAIRE = /(?:^|[\s/"'<])on[a-z]+\s*=/i
const PROTOCOLE = /=\s*["']?\s*(?:javascript|vbscript|data)\s*:/i
const HREF = /(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
const URL_EXTERNE = /url\s*\(\s*["']?\s*(?!#)/i
const TITRE = /<title[^>]*>([^<]*)<\/title>/i

const refus = (raison) => ({ ok: false, raison })

const decoderEntites = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const echapperAttribut = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * La pré vérification seule : { ok: true, corps } (texte sans commentaires
 * ni prologue) ou { ok: false, raison }. Exportée pour les tests et pour
 * l’éditeur, qui peut dire tout de suite pourquoi un SVG collé est refusé.
 */
export function preVerifierSvg(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return refus('Schéma vide')
  if (texte.length > LONGUEUR_MAX) return refus('Schéma trop long (24 000 caractères au plus)')
  const corps = texte.replace(COMMENTAIRE, '').replace(PROLOGUE, '').trim()
  if (!RACINE.test(corps)) return refus('Le texte ne commence pas par une balise svg')
  if (DECLARATION.test(corps)) return refus('Déclaration ou instruction XML interdite dans le schéma')
  const balise = corps.match(BALISE_INTERDITE)
  if (balise) {
    const canonique = BALISES_INTERDITES[INTERDITES_MIN.indexOf(balise[1].toLowerCase())] || balise[1]
    return refus(`Balise interdite : ${canonique}`)
  }
  if (GESTIONNAIRE.test(corps)) return refus('Attribut de gestionnaire d’événement (on…) interdit')
  if (PROTOCOLE.test(corps)) return refus('Adresse javascript: ou data: interdite')
  for (const m of corps.matchAll(HREF)) {
    const valeur = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (!valeur.startsWith('#')) return refus('Lien externe interdit, seuls les renvois internes (#…) sont acceptés')
  }
  if (URL_EXTERNE.test(corps)) return refus('Ressource externe interdite dans url()')
  return { ok: true, corps }
}

// ─── DOMPurify ────────────────────────────────────────────────────────────

const purifier = DOMPurify()
const DOMPURIFY_SUPPORTE = purifier.isSupported === true && typeof purifier.addHook === 'function'

// Liste blanche : tout élément hors liste est retiré (son texte est gardé,
// KEEP_CONTENT). allowedTags est la copie de travail de cet appel.
function nEstPasAutorise(node, data) {
  if (!node || node.nodeType !== 1 || !data || !data.allowedTags) return
  if (!AUTORISEES.has(data.tagName)) data.allowedTags[data.tagName] = false
}

// Attributs : href et xlink:href internes seulement, aucun url() vers
// l’extérieur (style, fill, stroke, marker, clip-path…), aucun on*.
function attributSur(node, data) {
  const nom = String(data.attrName || '')
  const valeur = String(data.attrValue ?? '')
  if (nom.startsWith('on')) data.keepAttr = false
  else if ((nom === 'href' || nom === 'xlink:href') && !valeur.trim().startsWith('#')) data.keepAttr = false
  else if (URL_EXTERNE.test(valeur)) data.keepAttr = false
}

if (DOMPURIFY_SUPPORTE) {
  purifier.addHook('uponSanitizeElement', nEstPasAutorise)
  purifier.addHook('uponSanitizeAttribute', attributSur)
}

const CONFIG = Object.freeze({
  USE_PROFILES: { svg: true },
  // use n’est pas dans le profil svg de DOMPurify ; il n’entre qu’avec un
  // href interne (crochet ci dessus).
  ADD_TAGS: ['use'],
  FORBID_TAGS: [...INTERDITES_MIN],
  // Un schéma ne prend jamais le focus ; les attributs data-* n’y servent à rien.
  FORBID_ATTR: ['tabindex'],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
  // On récupère l’arbre plutôt qu’une chaîne : seul le premier élément (la
  // racine svg) est gardé, ce qu’une balise HTML glissée dans le schéma
  // aurait rejeté après la racine (sortie du contenu étranger) tombe.
  RETURN_DOM: true,
})

// ─── Racine ───────────────────────────────────────────────────────────────

const ATTRIBUT = /([^\s=/>"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g
// Retirés de la racine avant de poser les nôtres : les dimensions fixes, et
// ce qui contredirait role="img" + aria-label (aria-hidden, focus).
const RETIRES = new Set(['width', 'height', 'role', 'aria-label', 'aria-hidden', 'tabindex', 'focusable'])

// La fin de la balise ouvrante : le premier > hors guillemets.
function finBaliseOuvrante(svg) {
  let guillemet = null
  for (let i = 4; i < svg.length; i += 1) {
    const ch = svg[i]
    if (guillemet) { if (ch === guillemet) guillemet = null; continue }
    if (ch === '"' || ch === "'") guillemet = ch
    else if (ch === '>') return i
  }
  return -1
}

/**
 * Pose sur la racine role="img", aria-label et width="100%",
 * après avoir retiré les width et height fixes. Le reste des attributs est
 * conservé tel quel. Rend null si la balise ouvrante est illisible.
 */
export function poserRacine(svg, label) {
  const texte = String(svg || '')
  if (!RACINE.test(texte)) return null
  const fin = finBaliseOuvrante(texte)
  if (fin < 0) return null
  const brut = texte.slice(4, fin).replace(/\/\s*$/, '')
  const autoFermante = /\/\s*$/.test(texte.slice(4, fin))
  const gardes = []
  for (const m of brut.matchAll(ATTRIBUT)) {
    const nom = m[1]
    if (RETIRES.has(nom.toLowerCase())) continue
    gardes.push(m[2] === undefined ? nom : `${nom}=${m[2]}`)
  }
  // Pas de height : « auto » n est pas une longueur valide pour un attribut
  // SVG, le navigateur le refusait et le journalisait a chaque schema affiche
  // (harnais visuel du 24/09/2026). La hauteur est l affaire du CSS, qui la
  // pose deja en height: auto sur .ac-schema-image svg, et une regle CSS passe
  // de toute facon avant un attribut de presentation.
  gardes.push('role="img"', `aria-label="${echapperAttribut(label)}"`, 'width="100%"')
  return `<svg ${gardes.join(' ')}${autoFermante ? ' /' : ''}>${texte.slice(fin + 1)}`
}

// Le libellé accessible : alt fourni, sinon le <title> du schéma, sinon « Schéma ».
function libelleAccessible(corps, alt) {
  const propre = String(alt || '').replace(/\s+/g, ' ').trim()
  if (propre) return propre
  const titre = corps.match(TITRE)
  const t = titre ? decoderEntites(titre[1]).replace(/\s+/g, ' ').trim() : ''
  return t || 'Schéma'
}

/**
 * Assainit un schéma SVG venu de la base. Rend { ok: true, svg } (svg prêt
 * pour dangerouslySetInnerHTML) ou { ok: false, raison }. `alt` devient
 * l’aria-label de la racine (sinon le <title>, sinon « Schéma »).
 *
 * Sous Node (sans DOM), seule la pré vérification joue : suffisant pour les
 * tests, puisque rien ne s’y exécute ; dans le navigateur, DOMPurify fait
 * l’assainissement complet.
 */
export function assainirSvg(texte, { alt } = {}) {
  const pre = preVerifierSvg(texte)
  if (!pre.ok) return pre
  const label = libelleAccessible(pre.corps, alt)
  let propre = pre.corps
  if (DOMPURIFY_SUPPORTE) {
    const corps = purifier.sanitize(pre.corps, CONFIG)
    const racine = corps && corps.firstElementChild
    if (!racine || String(racine.nodeName).toLowerCase() !== 'svg') return refus('Le schéma ne contient rien de rendable après assainissement')
    propre = String(racine.outerHTML || '').trim()
    if (!RACINE.test(propre)) return refus('Le schéma ne contient rien de rendable après assainissement')
  } else if (typeof document !== 'undefined') {
    return refus('Assainissement indisponible dans ce navigateur')
  }
  const svg = poserRacine(propre, label)
  if (!svg) return refus('Balise svg illisible')
  return { ok: true, svg }
}
