/* ─────────────────────────────────────────────────────────────────────────────
   SKELETONS — états de chargement (Série A / A2).

   Remplacent les textes « Chargement… » : l'œil voit la structure de l'écran
   arriver au lieu d'attendre du vide. Styles dans styles.css (.skeleton).

     <Skeleton w={120} h={14} />          bloc unique
     <SkeletonText lines={3} />           paragraphe
     <SkeletonTable rows={6} cols={5} />  tableau complet (hors <table>)
     <SkeletonRows rows={5} cols={6} />   lignes à mettre DANS un <tbody>
     <SkeletonCards n={4} />              grille de cartes KPI
     <SkeletonPage />                     page générique (fallback Suspense)
───────────────────────────────────────────────────────────────────────────── */

export function Skeleton({ w, h = 12, r, style, className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      aria-hidden="true"
      style={{ width: w, height: h, borderRadius: r, ...style }}
    />
  )
}

export function SkeletonText({ lines = 3, gap = 10 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={12} w={`${88 - (i % 3) * 16}%`} />
      ))}
    </div>
  )
}

// Largeurs pseudo-aléatoires mais stables (pas de Math.random : rendu stable).
const CELL_WIDTHS = ['72%', '48%', '84%', '56%', '64%', '40%', '76%']

export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="skeleton-table" role="status" aria-label="Chargement">
      <div className="skeleton-table-head">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} h={10} w="52%" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="skeleton-table-row">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} h={12} w={CELL_WIDTHS[(r + c) % CELL_WIDTHS.length]} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Variante pour l'intérieur d'un <tbody> existant.
export function SkeletonRows({ rows = 5, cols = 5, cellPadding = '14px 16px' }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} style={{ padding: cellPadding }}>
              <Skeleton h={12} w={CELL_WIDTHS[(r + c) % CELL_WIDTHS.length]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function SkeletonCards({ n = 4, height = 92 }) {
  return (
    <div className="skeleton-cards" role="status" aria-label="Chargement">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton-card" style={{ height }}>
          <Skeleton h={10} w="45%" />
          <Skeleton h={22} w="60%" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonPage() {
  return (
    <div style={{ padding: 24 }} role="status" aria-label="Chargement">
      <Skeleton h={22} w={240} style={{ marginBottom: 18 }} />
      <SkeletonCards n={4} />
      <div style={{ height: 22 }} />
      <SkeletonTable rows={6} cols={5} />
    </div>
  )
}
