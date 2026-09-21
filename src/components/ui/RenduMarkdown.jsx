// src/components/ui/RenduMarkdown.jsx
// Rend un texte Markdown (contenu des leçons de l'Academy, explications de
// corrigé) en HTML assaini.
//
// marked n'assainit pas : son option sanitize a été retirée en v5 et le
// dépôt est en v18. Tout passe donc par DOMPurify avant d'atteindre
// dangerouslySetInnerHTML. Le contenu vient de l'administrateur de l'Academy,
// ce qui limite la portée sans la supprimer : un texte généré par un modèle
// de langage qui atterrirait dans une leçon transformerait une injection de
// prompt en XSS stocké.
//
// L'instance DOMPurify est propre à ce composant : le crochet qui ouvre les
// liens externes dans un nouvel onglet ne touche pas les autres écrans qui
// assainissent (EditorialHub).

import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const LIEN_EXTERNE = /^https?:\/\//i

// Un lien vers l'extérieur s'ouvre à côté, sans laisser la page d'origine
// accessible à la cible (rel). Les ancres et les liens internes (#/...)
// restent dans l'onglet. Posé après l'assainissement des attributs :
// DOMPurify ne les rejette pas et n'y revient pas.
function ouvrirLiensExternes(node) {
  if (!node || String(node.tagName).toUpperCase() !== 'A') return
  const href = node.getAttribute('href') || ''
  if (!LIEN_EXTERNE.test(href)) return
  node.setAttribute('target', '_blank')
  node.setAttribute('rel', 'noopener noreferrer')
}

const purifier = DOMPurify()
if (typeof purifier.addHook === 'function') {
  purifier.addHook('afterSanitizeAttributes', ouvrirLiensExternes)
}

// Sans DOM (rendu serveur, test sans navigateur), DOMPurify ne peut pas
// travailler et rendrait le texte tel quel : on ne rend rien plutôt que de
// l'HTML non assaini.
function versHtml(markdown) {
  const brut = marked.parse(markdown || '', { async: false })
  return purifier.isSupported ? purifier.sanitize(brut) : ''
}

export default function RenduMarkdown({ markdown, className }) {
  const html = useMemo(() => versHtml(markdown), [markdown])
  const classes = ['md-rendu', className].filter(Boolean).join(' ')
  return <div className={classes} dangerouslySetInnerHTML={{ __html: html }} />
}
