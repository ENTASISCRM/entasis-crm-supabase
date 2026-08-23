/* ─────────────────────────────────────────────────────────────────────────────
   SUBTABS — sous-onglets unifiés (Série A / A3).

   Remplace les 4 implémentations historiques (classe rh-tabs + 3 variantes de
   pills en styles inline). Un seul style pour toute l'app, accessible
   (role tablist/tab + aria-selected). Styles : .subtabs dans styles.css.

     <SubTabs
       tabs={[{ key: 'annuaire', label: 'Annuaire' }, { key: 'dossiers', label: 'Dossiers', badge: 3 }]}
       active={vue}
       onChange={setVue}
       ariaLabel="Sous-onglets Clients"
     />
───────────────────────────────────────────────────────────────────────────── */

export default function SubTabs({ tabs, active, onChange, ariaLabel, style }) {
  return (
    <div className="subtabs" role="tablist" aria-label={ariaLabel} style={style}>
      {tabs.map(({ key, label, badge }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={`subtab${active === key ? ' is-active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
          {badge > 0 && <span className="subtab-badge">{badge}</span>}
        </button>
      ))}
    </div>
  )
}
