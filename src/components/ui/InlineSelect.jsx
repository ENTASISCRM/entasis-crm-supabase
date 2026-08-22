/* ─────────────────────────────────────────────────────────────────────────────
   INLINE SELECT — modification directe dans un tableau (Série D / D2).

   Le geste des grilles Zoho/Airtable : changer un statut ou une priorité sans
   ouvrir de formulaire. Le select est invisible au repos (il ressemble au
   badge de la ligne) et se révèle au survol/focus.

     <InlineSelect
       value={deal.status}
       options={STATUS_OPTIONS}
       renderLabel={statusLabel}
       badgeClass={STATUS_CLASS[deal.status]}
       onChange={next => …}
       title="Changer le statut"
     />

   `onChange` n'est appelé que sur un changement réel. Le parent reste maître
   des garde-fous métier (dates obligatoires, confirmation…).
──────────────────────────────────────────────────────────────────────────── */

export default function InlineSelect({ value, options, onChange, renderLabel, badgeClass, title, disabled }) {
  const label = renderLabel ? renderLabel(value) : value
  if (disabled) {
    return <span className={badgeClass || 'badge'}>{label}</span>
  }
  return (
    <span className="inline-select" title={title}>
      <span className={`${badgeClass || 'badge'} inline-select-face`}>
        {label}
        <svg className="inline-select-chevron" width="10" height="10" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      <select
        className="inline-select-input"
        value={value || ''}
        aria-label={title}
        onClick={e => e.stopPropagation()}
        onChange={e => { e.stopPropagation(); if (e.target.value !== value) onChange(e.target.value) }}
      >
        {options.map(o => <option key={o} value={o}>{renderLabel ? renderLabel(o) : o}</option>)}
      </select>
    </span>
  )
}
