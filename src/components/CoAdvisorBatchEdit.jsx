// ═══════════════════════════════════════════════════════════════════════════
// CO-ADVISOR BATCH EDIT — manager-only
//
// Table compacte de tous les deals, avec un dropdown "Co-conseiller"
// éditable inline pour chaque ligne. Save automatique au changement.
//
// CAS D'USAGE
// Pour les anciens deals où le manager principal a oublié de mettre un
// co-conseiller (cas Gianni Pichon 26/05), on peut ici corriger en masse
// sans avoir à ouvrir chaque modale deal une par une.
//
// SÉCURITÉ
// Le composant n'est rendu que pour les managers (PilotageRH > rôle).
// Les RLS deals autorisent les managers à UPDATE n'importe quelle ligne.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { MONTHS, isPipeline } from '../lib/metrics'

const STATUSES = ['Tous', 'Signé', 'Prévu', 'En cours', 'Annulé']

export default function CoAdvisorBatchEdit({ teamProfiles = [] }) {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterAdvisor, setFilterAdvisor] = useState('all')
  const [filterCo, setFilterCo] = useState('vide') // 'vide' | 'tous' | code spécifique
  const [filterStatus, setFilterStatus] = useState('Tous')
  const [filterMonth, setFilterMonth] = useState('12mois')
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState(null)

  // Codes advisor actifs pour les dropdowns
  const advisorOptions = useMemo(() => {
    return (teamProfiles || [])
      .filter(p => p?.is_active && p?.advisor_code)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }, [teamProfiles])

  // Charge les deals
  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, client, client_id, product, company, status, pp_m, pu, advisor_code, co_advisor_code, month, date_signed, created_at')
        .order('date_signed', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(2000)
      if (!alive) return
      if (error) {
        toast.error('Erreur chargement deals : ' + error.message)
        setDeals([])
      } else {
        setDeals(data || [])
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  // Filtrage
  const filtered = useMemo(() => {
    const monthSet = (() => {
      if (filterMonth === 'tous') return null
      if (filterMonth === '12mois') return new Set(MONTHS) // tous mois
      return new Set([filterMonth])
    })()
    return deals.filter(d => {
      if (filterAdvisor !== 'all' && d.advisor_code !== filterAdvisor) return false
      if (filterCo === 'vide' && d.co_advisor_code) return false
      if (filterCo !== 'vide' && filterCo !== 'tous' && d.co_advisor_code !== filterCo) return false
      if (filterStatus !== 'Tous' && d.status !== filterStatus) return false
      if (monthSet && !monthSet.has(d.month)) return false
      if (search) {
        const s = search.toLowerCase()
        const hay = `${d.client || ''} ${d.product || ''} ${d.company || ''} ${d.advisor_code || ''} ${d.co_advisor_code || ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    }).slice(0, 500)
  }, [deals, filterAdvisor, filterCo, filterStatus, filterMonth, search])

  // Update inline du co-conseiller
  async function updateCoAdvisor(dealId, newCode) {
    setSavingId(dealId)
    const value = newCode || null
    const { error } = await supabase
      .from('deals')
      .update({ co_advisor_code: value })
      .eq('id', dealId)
    setSavingId(null)
    if (error) {
      toast.error('Échec : ' + error.message)
      return
    }
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, co_advisor_code: value } : d))
    toast.success(value ? `Co-conseiller : ${value}` : 'Co-conseiller retiré', { duration: 1500 })
  }

  return (
    <div className="card mb-24">
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Réattribution co-conseillers
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginTop: 4 }}>
            Édition rapide en masse · {filtered.length} deal{filtered.length !== 1 ? 's' : ''} affichés
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            Corrige les anciens deals où le co-conseiller n'a pas été défini. Le dropdown sauvegarde automatiquement.
          </div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '12px 20px 20px' }}>
        {/* Filtres */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <input
            className="search-input"
            placeholder="Rechercher client / produit…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <select className="filter-select" value={filterAdvisor} onChange={e => setFilterAdvisor(e.target.value)}>
            <option value="all">Tous conseillers (principal)</option>
            {advisorOptions.map(p => (
              <option key={p.advisor_code} value={p.advisor_code}>{p.full_name} · {p.advisor_code}</option>
            ))}
          </select>
          <select className="filter-select" value={filterCo} onChange={e => setFilterCo(e.target.value)}>
            <option value="vide">Co-conseiller vide (à fixer)</option>
            <option value="tous">Tous (avec ou sans co)</option>
            {advisorOptions.map(p => (
              <option key={p.advisor_code} value={p.advisor_code}>Co = {p.full_name}</option>
            ))}
          </select>
          <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="12mois">12 mois</option>
            <option value="tous">Tous mois</option>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)', fontSize: 13 }}>
            Aucun deal ne correspond aux filtres. Essaie « Tous » sur co-conseiller pour voir ceux déjà attribués.
          </div>
        ) : (
          <div style={{ overflow: 'auto', maxHeight: 600 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Produit</th>
                  <th>Mois</th>
                  <th>Status</th>
                  <th>Conseiller principal</th>
                  <th style={{ minWidth: 200 }}>Co-conseiller (éditable)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(deal => {
                  const advisorPrincipal = advisorOptions.find(p => p.advisor_code === deal.advisor_code)
                  const isSaving = savingId === deal.id
                  return (
                    <tr key={deal.id}>
                      <td>
                        <div className="cell-primary">{deal.client || '—'}</div>
                        {deal.company && <div className="cell-sub">{deal.company}</div>}
                      </td>
                      <td>{deal.product || '—'}</td>
                      <td><span style={{ fontSize: 12, color: 'var(--t3)' }}>{deal.month}</span></td>
                      <td><span className={`badge ${deal.status === 'Signé' ? 'badge-success' : ''}`}>{deal.status}</span></td>
                      <td>
                        <div className="cell-primary">{advisorPrincipal?.full_name || deal.advisor_code || '—'}</div>
                        <div className="cell-sub" style={{ fontFamily: 'monospace' }}>{deal.advisor_code}</div>
                      </td>
                      <td>
                        <select
                          className="filter-select"
                          value={deal.co_advisor_code || ''}
                          onChange={e => updateCoAdvisor(deal.id, e.target.value)}
                          disabled={isSaving}
                          style={{ minWidth: 180, opacity: isSaving ? 0.5 : 1 }}
                        >
                          <option value="">— Aucun —</option>
                          {advisorOptions
                            .filter(p => p.advisor_code !== deal.advisor_code) // pas soi-même
                            .map(p => (
                              <option key={p.advisor_code} value={p.advisor_code}>
                                {p.full_name} · {p.advisor_code}
                              </option>
                            ))}
                        </select>
                        {isSaving && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--t3)' }}>⏳</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
