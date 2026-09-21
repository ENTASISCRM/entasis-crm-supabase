// ═══════════════════════════════════════════════════════════════════════════
// COURONNES ET FLAMME : les deux signes de maîtrise de l’Entasis Academy
//
// Cinq couronnes par deck (0 à 5, calculées par academy_couronnes) et une
// flamme pour la série de jours. Tout est dessiné en CSS et en SVG inline,
// aucun emoji : la couleur suit les jetons de :root (or pour une couronne
// gagnée, bordure pour une couronne vide, orange et or pour la flamme).
// Un lecteur d’écran reçoit le texte, pas les dessins.
// ═══════════════════════════════════════════════════════════════════════════

const NB_COURONNES = 5

/** « 3 couronnes sur 5 », singulier à 1. */
const libelle = (n) => `${n} couronne${n > 1 ? 's' : ''} sur ${NB_COURONNES}`

function Couronne({ pleine }) {
  return (
    <svg className={`ac-couronne${pleine ? ' on' : ''}`} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M3 17.5 L2 7 L7.5 11 L12 4 L16.5 11 L22 7 L21 17.5 Z" />
      <rect x="3" y="18.8" width="18" height="2.4" rx="0.8" />
    </svg>
  )
}

/**
 * Les cinq couronnes d’un deck. `n` est borné à 0..5 ; `taille` 'grande'
 * pour l’en tête d’un deck.
 */
export function Couronnes({ n, taille }) {
  const acquises = Math.max(0, Math.min(NB_COURONNES, Number(n) || 0))
  return (
    <span className={`ac-couronnes${taille === 'grande' ? ' grande' : ''}`} role="img" aria-label={libelle(acquises)}>
      {Array.from({ length: NB_COURONNES }).map((_, i) => <Couronne key={i} pleine={i < acquises} />)}
    </span>
  )
}

/** La flamme de la série : vive quand la série court, éteinte à zéro ou en danger. */
export function Flamme({ eteinte }) {
  return (
    <span className={`ac-flamme${eteinte ? ' eteinte' : ''}`} aria-hidden="true">
      <span className="ac-flamme-coeur" />
    </span>
  )
}
