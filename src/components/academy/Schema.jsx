// ═══════════════════════════════════════════════════════════════════════════
// SCHÉMA : une figure SVG d’un mémo ou d’un exercice, assainie avant rendu
//
// Le SVG vient de la base (academy_module_versions.schemas ou payload.figure
// d’un item) et n’est jamais posé tel quel : assainirSvg (lib/academy/svg)
// le passe par la pré vérification puis par DOMPurify, force role="img",
// aria-label et width 100 %. Un texte refusé s’affiche
// « Schéma indisponible », la légende reste : elle dit ce qu’il faut retenir.
//
// alt sert de libellé accessible ; à défaut le titre, à défaut le <title>
// du SVG. La hauteur maximale sur téléphone (45 % de la fenêtre, sans
// défilement interne) est l’affaire du CSS de la classe ac-schema.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import { assainirSvg } from '../../lib/academy/svg'

const texte = (v) => (v == null ? '' : String(v).trim())

export function Schema({ svg, titre, legende, alt }) {
  const t = texte(titre)
  const l = texte(legende)
  const a = texte(alt) || t
  const resultat = useMemo(() => assainirSvg(svg, { alt: a }), [svg, a])
  return (
    <figure className="ac-schema">
      {resultat.ok
        ? <div className="ac-schema-image" dangerouslySetInnerHTML={{ __html: resultat.svg }} />
        : <p className="ac-schema-indisponible">Schéma indisponible</p>}
      {(t || l) && (
        <figcaption className="ac-schema-legende">
          {t && <strong className="ac-schema-titre">{t}</strong>}
          {l && <span className="ac-schema-texte">{l}</span>}
        </figcaption>
      )}
    </figure>
  )
}

export default Schema
