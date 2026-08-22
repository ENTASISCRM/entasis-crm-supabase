/* ─────────────────────────────────────────────────────────────────────────────
   CENTRE DE NOTIFICATIONS — cloche de la topbar (Série D / D5).

   Le CRM sait déjà des choses utiles (un dossier signé par un collègue, un
   congé qui attend une validation, un package éditorial en attente de veto)
   mais ne les disait à personne : il fallait ouvrir le bon écran au bon
   moment. La cloche rend ces signaux visibles, façon Attio/Monday.

   Principe : aucune table de notifications, aucun polling supplémentaire. On
   dérive les signaux des données DÉJÀ chargées par l'application (deals en
   temps réel, congés, compteur éditorial). Le « lu » est local au poste
   (localStorage) — pas de synchronisation multi-appareil, volontairement
   simple.
──────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePersistedState } from '../../hooks/usePersistedState'

const fmtJour = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const auj = new Date()
  const hier = new Date(Date.now() - 86400000)
  const memeJour = (a, b) => a.toDateString() === b.toDateString()
  if (memeJour(d, auj)) return `aujourd'hui ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (memeJour(d, hier)) return 'hier'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export default function NotificationsBell({ items = [], scope = 'anon' }) {
  const [open, setOpen] = useState(false)
  // Horodatage de la dernière consultation : tout signal postérieur est « non lu ».
  const [luJusqua, setLuJusqua] = usePersistedState('notifs.luJusqua', null, scope)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const nonLus = useMemo(
    () => items.filter(i => !luJusqua || String(i.date || '') > String(luJusqua)).length,
    [items, luJusqua]
  )

  function basculer() {
    const ouvrir = !open
    setOpen(ouvrir)
    // Marqué lu à l'ouverture : le badge retombe, la liste reste consultable.
    if (ouvrir && items.length) {
      const plusRecent = items.reduce((max, i) => (String(i.date || '') > max ? String(i.date) : max), '')
      if (plusRecent) setLuJusqua(plusRecent)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className="btn btn-ghost btn-sm btn-icon"
        onClick={basculer}
        title="Notifications"
        aria-label={nonLus ? `Notifications, ${nonLus} non lue${nonLus > 1 ? 's' : ''}` : 'Notifications'}
        aria-expanded={open}
        style={{ position: 'relative' }}
      >
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 3a4.5 4.5 0 00-4.5 4.5c0 2.5-.6 4-1.2 4.9-.3.5.05 1.1.65 1.1h10.1c.6 0 .95-.6.65-1.1-.6-.9-1.2-2.4-1.2-4.9A4.5 4.5 0 0010 3z"
            stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
          <path d="M8.2 16a1.9 1.9 0 003.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        {nonLus > 0 && <span className="notif-dot tnum">{nonLus > 9 ? '9+' : nonLus}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <span>Notifications</span>
            <span style={{ fontSize: 11.5, color: 'var(--t3)', fontWeight: 500 }}>
              {items.length} signal{items.length > 1 ? 'aux' : ''}
            </span>
          </div>
          <div className="notif-body">
            {items.length === 0 ? (
              <div style={{ padding: '22px 16px', textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
                Rien de neuf — tout est à jour.
              </div>
            ) : items.map(i => (
              <button key={i.id} className="notif-item" onClick={() => { setOpen(false); i.onOpen?.() }}>
                <span className="notif-item-dot" style={{ background: i.couleur || 'var(--gold)' }}/>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="notif-item-titre">{i.titre}</span>
                  {i.detail && <span className="notif-item-detail">{i.detail}</span>}
                </span>
                <span className="notif-item-date">{fmtJour(i.date)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
