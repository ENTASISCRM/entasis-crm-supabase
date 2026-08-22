/* ─────────────────────────────────────────────────────────────────────────────
   SORTABLE TH — en-tête de colonne triable (Série B / B7).

   Était défini à l'identique dans App.jsx et ManagementView.jsx ; source
   unique ici, avec aria-sort en prime pour les lecteurs d'écran.
───────────────────────────────────────────────────────────────────────────── */

export default function SortableTh({ label, col, sortKey, sortDir, onSort, align }) {
  const active = sortKey === col
  return (
    <th
      onClick={() => onSort(col)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left' }}
      title={`Trier par ${label}`}
    >
      {label}
      <span style={{ marginLeft: 4, color: active ? 'var(--gold)' : 'var(--t3)', fontSize: 10 }}>
        {active ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
      </span>
    </th>
  )
}
