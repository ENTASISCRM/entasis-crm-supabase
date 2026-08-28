import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getClientName, statusLabel } from '../lib/ui-shared'
import { chercher, scoreTexte, segmenter } from '../lib/recherche'
import { lireRecents } from '../lib/recents'
import * as clientsService from '../services/clients'

// Palette de commandes Ctrl/Cmd+K.
//
// Deux états, deux métiers :
//   OUVERTE SANS RIEN TAPER — elle sert à REPRENDRE : les dernières fiches
//   consultées d'abord (rouvrir le client qu'on avait au téléphone il y a dix
//   minutes est le geste le plus fréquent de la journée), puis les actions,
//   puis les onglets. C'est l'écran d'accueil de ⌘K chez Attio et Linear, et
//   la raison pour laquelle il devient un réflexe.
//
//   EN TAPANT — elle CHERCHE, via lib/recherche.js : sans se soucier des
//   accents ni de l'ordre des mots, résultats classés par pertinence, la
//   partie qui correspond surlignée pour qu'on voie pourquoi une fiche
//   remonte.
//
// Elle AGIT aussi : « Nouveau dossier » vit ici, avec sa touche rappelée sur
// la ligne — c'est comme ça qu'on apprend les raccourcis, pas dans une page
// d'aide (pattern Superhuman).
//
// `pages` arrive DEJA filtré par rôle : App le construit depuis
// lib/navigation.js (même source que la sidebar).

export default function CommandPalette({ open, onClose, deals, pages, profile, onOpenDeal, onOpenClient, onGoTab, onNewDeal }) {
  const [query, setQuery] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  // Résultats de la table clients (recherche réseau débouncée) : un client
  // SANS dossier restait introuvable quand la palette ne cherchait que dans
  // les deals en mémoire.
  const [clientRows, setClientRows] = useState([])
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const scope = profile?.advisor_code || profile?.id || 'anon'

  // Reset à chaque ouverture puis focus du champ (après le rendu de l'overlay).
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelIdx(0)
      setClientRows([])
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) { setClientRows([]); return }
    let cancelled = false
    const t = setTimeout(() => {
      clientsService.searchByQuery(q)
        .then(rows => { if (!cancelled) setClientRows(rows || []) })
        .catch(() => {})
    }, 150)
    return () => { cancelled = true; clearTimeout(t) }
  }, [open, query])

  const results = useMemo(() => {
    if (!open) return []
    const q = query.trim()

    // Actions : la palette fait, pas seulement naviguer. La touche affichée
    // sur la ligne enseigne le raccourci direct.
    const actions = [
      onNewDeal && { type: 'action', key: 'act-new-deal', icon: '＋', label: 'Nouveau dossier', sub: 'Créer un dossier pour un client', kbd: 'N', run: onNewDeal },
    ].filter(Boolean)

    // Onglets de navigation (déjà filtrés par rôle via `pages`).
    const tabs = Object.entries(pages || {})
      .map(([id, label]) => ({ type: 'tab', key: `tab-${id}`, icon: '📁', label, sub: 'Onglet', run: () => onGoTab(id) }))

    // Sans requête : reprendre là où on en était, puis agir, puis naviguer.
    if (!q) {
      const recents = lireRecents(scope).map(r => ({
        type: r.type, key: `rec-${r.type}-${r.id}`, icon: r.type === 'deal' ? '📄' : '👤',
        label: r.label, sub: r.sub || 'Récent',
        run: r.type === 'deal'
          ? () => { const d = (deals || []).find(x => String(x.id) === r.id); if (d) onOpenDeal(d); else onOpenClient(r.id) }
          : () => onOpenClient(r.id),
      }))
      // Un dossier récent dont le deal n'est plus en mémoire (autre mois
      // chargé) retombe sur la fiche client : jamais un clic qui ne fait rien.
      return [...recents, ...actions, ...tabs].slice(0, 11)
    }

    // Clients : d'abord la table clients (un client SANS dossier reste
    // trouvable), puis les clients dérivés des deals en complément.
    const clientHits = []
    const seen = new Set()
    const versHit = (id, nom, code) => ({
      type: 'client', key: `cli-${id}`, icon: '👤', label: nom,
      sub: `Fiche client${code ? ` · ${code}` : ''}`, run: () => onOpenClient(id),
    })
    for (const c of chercher(clientRows || [], q, (x) => `${x.prenom || ''} ${x.nom || ''} ${x.advisor_code || ''}`, { max: 5 })) {
      const nom = `${c.prenom || ''} ${c.nom || ''}`.trim()
      if (!nom) continue
      seen.add(c.id)
      clientHits.push(versHit(c.id, nom, c.advisor_code))
    }
    const dealsClients = []
    for (const d of deals || []) {
      if (!d.client_id || seen.has(d.client_id)) continue
      seen.add(d.client_id)
      dealsClients.push(d)
    }
    for (const d of chercher(dealsClients, q, (x) => `${getClientName(x)} ${x.advisor_code || ''}`, { max: Math.max(0, 5 - clientHits.length) })) {
      clientHits.push(versHit(d.client_id, getClientName(d), d.advisor_code))
    }

    // Dossiers (ouverture directe en modale d'édition).
    const found = chercher(
      deals || [], q,
      (d) => `${getClientName(d)} ${d.product || ''} ${d.advisor_code || ''} ${d.company || ''}`,
      { max: 6 },
    ).map(d => ({
      type: 'deal', key: `deal-${d.id}`, icon: '📄',
      label: `${getClientName(d)} · ${d.product || '—'}`,
      sub: `${statusLabel(d.status) || d.status || ''} · ${d.month || ''} · ${d.advisor_code || ''}`,
      run: () => onOpenDeal(d),
    }))

    const actionHits = actions.filter(a => scoreTexte(a.label, q) > 0)
    const tabHits = chercher(tabs, q, (t) => t.label, { max: 4 })

    return [...clientHits, ...found, ...actionHits, ...tabHits].slice(0, 12)
  }, [open, query, deals, clientRows, pages, scope, onGoTab, onOpenClient, onOpenDeal, onNewDeal])

  // Garde l'index de sélection dans les bornes quand la liste change.
  useEffect(() => { setSelIdx(0) }, [query])

  if (!open) return null

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); const r = results[selIdx]; if (r) r.run() }
  }

  // La liste s'ouvre sur les récents : le titre de section le dit, sinon on
  // se demande pourquoi ces fiches-là sont proposées.
  const sansRequete = !query.trim()
  const premierRecent = sansRequete && results.some(r => r.key.startsWith('rec-'))

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
            placeholder="Client, dossier, action ou onglet…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--t1)' }}
          />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', border: '1px solid var(--bd)', borderRadius: 4, padding: '2px 6px' }}>Esc</span>
        </div>
        <div ref={listRef} style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
          {premierRecent && (
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--t3)', padding: '6px 12px 2px' }}>
              Reprendre
            </div>
          )}
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
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Marque texte={r.label} requete={query} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>
              </div>
              {r.kbd && <kbd className="kbd">{r.kbd}</kbd>}
              {i === selIdx && <span style={{ fontSize: 10, color: 'var(--t3)' }}>↵</span>}
            </div>
          ))}
          {!results.length && (
            <div style={{ padding: '18px 12px', fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>
              {sansRequete ? 'Tapez pour chercher un client, un dossier ou un onglet' : `Aucun résultat pour « ${query} »`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '8px 16px', borderTop: '1px solid var(--bd)', fontSize: 10.5, color: 'var(--t3)' }}>
          <span>↑↓ naviguer</span><span>↵ ouvrir</span><span>Esc fermer</span>
        </div>
      </div>
    </div>
  )
}

// Surligne la partie du libellé qui correspond à ce qui est tapé — le lien
// visuel entre la requête et le résultat, sans lequel une recherche tolérante
// aux accents paraît arbitraire.
function Marque({ texte, requete }) {
  const segments = useMemo(() => segmenter(texte, requete), [texte, requete])
  if (segments.length === 1 && !segments[0].marque) return texte
  return segments.map((s, i) => (
    s.marque ? <mark key={i} className="surlignage">{s.texte}</mark> : <span key={i}>{s.texte}</span>
  ))
}
