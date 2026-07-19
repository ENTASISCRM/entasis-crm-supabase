import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getClientName, statusLabel } from '../lib/ui-shared'

// Palette de commandes Ctrl/Cmd+K : un champ unique qui cherche dans les
// clients et dossiers deja charges en memoire, et liste les onglets de
// navigation. Entree ouvre la fiche client, le dossier, ou change d onglet.
// Aucune requete reseau : tout vient du state deals passe en prop.

// Onglets reserves au role manager, masques de la palette pour un conseiller.
const MANAGER_ONLY = new Set(['team', 'pilotage-rh', 'recrutement', 'editorial'])

export default function CommandPalette({ open, onClose, deals, pages, isManager, onOpenDeal, onOpenClient, onGoTab }) {
  const [query, setQuery] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Reset a chaque ouverture puis focus du champ (apres le rendu de l overlay).
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelIdx(0)
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  const results = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()

    // Onglets de navigation (filtres par role).
    const tabs = Object.entries(pages || {})
      .filter(([id]) => isManager || !MANAGER_ONLY.has(id))
      .filter(([, label]) => !q || label.toLowerCase().includes(q))
      .map(([id, label]) => ({ type: 'tab', key: `tab-${id}`, icon: '📁', label, sub: 'Onglet', run: () => onGoTab(id) }))

    // Sans requete saisie : la palette sert de menu de navigation rapide.
    if (!q) return tabs.slice(0, 9)

    // Clients uniques rattaches aux dossiers charges (dedupe par client_id).
    const clients = []
    const seen = new Set()
    for (const d of deals || []) {
      if (!d.client_id || seen.has(d.client_id)) continue
      const name = getClientName(d)
      if (!name.toLowerCase().includes(q)) continue
      seen.add(d.client_id)
      clients.push({ type: 'client', key: `cli-${d.client_id}`, icon: '👤', label: name, sub: `Fiche client · ${d.advisor_code || ''}`, run: () => onOpenClient(d.client_id) })
      if (clients.length >= 5) break
    }

    // Dossiers (ouverture directe en modale d edition).
    const found = []
    for (const d of deals || []) {
      const hay = `${getClientName(d)} ${d.product || ''} ${d.advisor_code || ''} ${d.company || ''}`.toLowerCase()
      if (!hay.includes(q)) continue
      found.push({ type: 'deal', key: `deal-${d.id}`, icon: '📄', label: `${getClientName(d)} · ${d.product || '—'}`, sub: `${statusLabel(d.status) || d.status || ''} · ${d.month || ''} · ${d.advisor_code || ''}`, run: () => onOpenDeal(d) })
      if (found.length >= 7) break
    }

    return [...clients, ...found, ...tabs.slice(0, 4)].slice(0, 12)
  }, [open, query, deals, pages, isManager, onGoTab, onOpenClient, onOpenDeal])

  // Garde l index de selection dans les bornes quand la liste change.
  useEffect(() => { setSelIdx(0) }, [query])

  if (!open) return null

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); const r = results[selIdx]; if (r) r.run() }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(20,20,25,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div style={{ width: 'min(560px, calc(100vw - 32px))', background: 'var(--card, #fff)', border: '1px solid var(--bd)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
          <span style={{ fontSize: 15, opacity: .6 }}>🔎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Client, dossier ou onglet…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--t1)' }}
          />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', border: '1px solid var(--bd)', borderRadius: 4, padding: '2px 6px' }}>Esc</span>
        </div>
        <div ref={listRef} style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
          {results.map((r, i) => (
            <div
              key={r.key}
              onClick={r.run}
              onMouseEnter={() => setSelIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                background: i === selIdx ? 'rgba(201,169,97,0.12)' : 'transparent',
                border: i === selIdx ? '1px solid rgba(201,169,97,0.35)' : '1px solid transparent',
              }}
            >
              <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{r.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>
              </div>
              {i === selIdx && <span style={{ fontSize: 10, color: 'var(--t3)' }}>↵</span>}
            </div>
          ))}
          {!results.length && (
            <div style={{ padding: '18px 12px', fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>Aucun résultat pour « {query} »</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '8px 16px', borderTop: '1px solid var(--bd)', fontSize: 10.5, color: 'var(--t3)' }}>
          <span>↑↓ naviguer</span><span>↵ ouvrir</span><span>Esc fermer</span>
        </div>
      </div>
    </div>
  )
}
