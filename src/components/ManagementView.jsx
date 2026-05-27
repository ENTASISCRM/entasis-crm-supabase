// ═══════════════════════════════════════════════════════════════════════════
// MANAGEMENT VIEW — Pilotage équipe (remplace l'ancien ForecastView)
//
// Vue manager-only qui permet d'identifier en un coup d'œil :
//   • Les KPIs globaux du cabinet ce mois (PP/PU signées vs objectif)
//   • Les top performeurs et ceux à booster
//   • Pour chaque conseiller : ses chiffres signés/projetés, son régime,
//     son écart vs M-1
//
// Phase 2 (à venir) : croiser avec Lead Room pour les RDV passés et
// outcomes (no-shows, joints, à relancer).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import {
  advisorMetrics,
  MONTHS,
  annualize,
  dealMatchesAdvisor,
} from '../lib/metrics'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})
const pctNum = (a, b) => (b > 0 ? Math.round((Number(a || 0) / Number(b)) * 100) : 0)
const safeDiv = (a, b) => (b > 0 ? a / b : 0)

export default function ManagementView({ deals, objectifs, month, profile, teamProfiles, canEditObjectifs, onSaveObjectif }) {
  const isManager = profile?.role === 'manager'
  const [formObj, setFormObj] = useState({ pp_target: '', pu_target: '' })
  useEffect(() => {
    setFormObj({
      pp_target: objectifs?.[month]?.pp_target ?? '',
      pu_target: objectifs?.[month]?.pu_target ?? '',
    })
  }, [objectifs, month])

  const activeAdvisors = useMemo(
    () => (teamProfiles || []).filter(p => p?.is_active && p?.advisor_code),
    [teamProfiles]
  )

  // Calcule les stats du mois courant + delta vs mois précédent pour chaque conseiller
  const rows = useMemo(() => {
    const prevIdx = MONTHS.indexOf(month) - 1
    const prevMonth = prevIdx >= 0 ? MONTHS[prevIdx] : null
    return activeAdvisors.map(p => {
      const m = advisorMetrics(deals, month, p.advisor_code)
      const prev = prevMonth ? advisorMetrics(deals, prevMonth, p.advisor_code) : null
      const dPp = prev ? m.ppSigned - prev.ppSigned : 0
      const dPu = prev ? m.puSigned - prev.puSigned : 0
      const dSigned = prev ? m.signedCount - prev.signedCount : 0
      return {
        profile: p,
        m,
        prev,
        dPp,
        dPu,
        dSigned,
        totalBrut: m.ppSigned + m.puSigned,
      }
    })
  }, [deals, month, activeAdvisors])

  const targets = objectifs?.[month] || { pp_target: 0, pu_target: 0 }

  // Totaux cabinet (basés sur les rows calculés)
  const cabinet = useMemo(() => {
    const ppSigned = rows.reduce((s, r) => s + r.m.ppSigned, 0)
    const puSigned = rows.reduce((s, r) => s + r.m.puSigned, 0)
    const ppProj = rows.reduce((s, r) => s + r.m.ppProjected, 0)
    const puProj = rows.reduce((s, r) => s + r.m.puProjected, 0)
    const totalSigned = rows.reduce((s, r) => s + r.m.signedCount, 0)
    const totalPipeline = rows.reduce((s, r) => s + r.m.pipelineCount, 0)
    return { ppSigned, puSigned, ppProj, puProj, totalSigned, totalPipeline }
  }, [rows])

  // Top performeurs (par variable estimé = ppSigned + puSigned / 10) — simple ranking
  const topPerformeurs = useMemo(
    () => [...rows].sort((a, b) => b.totalBrut - a.totalBrut).slice(0, 3),
    [rows]
  )
  // À booster : ceux qui ont 0 signature ce mois OU une chute > 50 % vs M-1
  const aBooster = useMemo(
    () => [...rows]
      .filter(r => r.m.signedCount === 0 || (r.prev && r.prev.signedCount > 0 && r.dSigned < 0))
      .sort((a, b) => a.totalBrut - b.totalBrut)
      .slice(0, 3),
    [rows]
  )

  async function submitObj(e) {
    e.preventDefault()
    if (!canEditObjectifs) return
    await onSaveObjectif({
      month,
      pp_target: Number(formObj.pp_target || 0),
      pu_target: Number(formObj.pu_target || 0),
    })
  }

  // Tri du tableau
  const [sortKey, setSortKey] = useState('totalBrut')
  const [sortDir, setSortDir] = useState('desc')
  const sortedRows = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      let av, bv
      switch (sortKey) {
        case 'nom': av = a.profile.full_name || a.profile.advisor_code; bv = b.profile.full_name || b.profile.advisor_code; break
        case 'signed': av = a.m.signedCount; bv = b.m.signedCount; break
        case 'pp': av = a.m.ppSigned; bv = b.m.ppSigned; break
        case 'pu': av = a.m.puSigned; bv = b.m.puSigned; break
        case 'pipeline': av = a.m.pipelineCount; bv = b.m.pipelineCount; break
        case 'delta': av = a.dPp; bv = b.dPp; break
        case 'totalBrut':
        default: av = a.totalBrut; bv = b.totalBrut
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [rows, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Pilotage équipe · {month}</div>
          <div className="section-title">Management</div>
          <div className="section-sub">
            Vue d'ensemble équipe : performances individuelles, top, retardataires.
          </div>
        </div>
      </div>

      {/* ─── KPIs globaux cabinet ──────────────────────────────────── */}
      <div className="kpi-grid mb-24">
        <KpiCard
          label="PP signée cabinet"
          value={fmtEur(cabinet.ppSigned)}
          target={targets.pp_target}
          progress={pctNum(cabinet.ppSigned, targets.pp_target)}
          accent="gold"
        />
        <KpiCard
          label="PU signée cabinet"
          value={fmtEur(cabinet.puSigned)}
          target={targets.pu_target}
          progress={pctNum(cabinet.puSigned, targets.pu_target)}
          accent="blue"
        />
        <KpiCard
          label="Dossiers signés"
          value={cabinet.totalSigned.toFixed(0)}
          hint={`${cabinet.totalPipeline} en pipeline`}
          accent="green"
        />
        <KpiCard
          label="Conseillers actifs"
          value={activeAdvisors.length}
          hint={`${rows.filter(r => r.m.signedCount > 0).length} ont signé ce mois`}
          accent="amber"
        />
      </div>

      {/* ─── Top performeurs + À booster ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, marginBottom: 24 }}>
        <PodiumCard
          titre="Top performeurs"
          subtitle="Les 3 conseillers avec le plus de signatures ce mois"
          rows={topPerformeurs}
          color="#10B981"
          emoji="🏆"
        />
        <PodiumCard
          titre="À booster"
          subtitle="Conseillers à 0 signature ou en chute vs mois précédent"
          rows={aBooster}
          color="#EF4444"
          emoji="⚠"
        />
      </div>

      {/* ─── Tableau performance équipe ────────────────────────────── */}
      <div className="card mb-24" style={{ overflow: 'hidden' }}>
        <div className="panel-head">
          <div>
            <div className="section-kicker">Performance équipe</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
              Détail par conseiller · clique sur une colonne pour trier
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <SortableTh label="Conseiller" col="nom" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th>Type</th>
                <SortableTh label="Signés" col="signed" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="PP signée" col="pp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="PU signée" col="pu" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="Pipeline" col="pipeline" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="Δ vs M-1" col="delta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <RowConseiller key={r.profile.advisor_code} r={r} />
              ))}
              {sortedRows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>
                  Aucun conseiller actif. Vérifie que les profils ont un <code>advisor_code</code> dans <code>profiles</code>.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Objectifs cabinet (en bas, plus compact) ──────────────── */}
      {canEditObjectifs && (
        <div className="card card-p" style={{ background: 'var(--bg)', padding: '14px 20px' }}>
          <form onSubmit={submitObj} style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 4 }}>
                Objectifs cabinet · {month}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>S'applique au cabinet entier (pas individuel).</div>
            </div>
            <div style={{ flex: '0 0 180px' }}>
              <label className="form-label" style={{ fontSize: 11 }}>PP annualisée (€)</label>
              <input className="form-input" type="number" value={formObj.pp_target}
                onChange={e => setFormObj(p => ({ ...p, pp_target: e.target.value }))} />
            </div>
            <div style={{ flex: '0 0 180px' }}>
              <label className="form-label" style={{ fontSize: 11 }}>PU (€)</label>
              <input className="form-input" type="number" value={formObj.pu_target}
                onChange={e => setFormObj(p => ({ ...p, pu_target: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">Enregistrer</button>
          </form>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Composants internes
// ─────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, target, progress, hint, accent = 'gold' }) {
  const colors = {
    gold: { bd: 'var(--gold)', txt: 'var(--gold-dk)' },
    blue: { bd: '#0071E3', txt: '#0071E3' },
    green: { bd: '#10B981', txt: '#10B981' },
    amber: { bd: '#F59E0B', txt: '#B45309' },
  }[accent] || { bd: 'var(--gold)', txt: 'var(--gold-dk)' }
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${colors.bd}` }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: 'var(--t1)' }}>{value}</div>
      {target ? (
        <div style={{ marginTop: 6 }}>
          <div style={{ height: 4, background: 'rgba(0,0,0,0.05)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, progress)}%`, height: '100%', background: colors.bd, transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            <strong style={{ color: colors.txt }}>{progress}%</strong> de {fmtEur(target)}
          </div>
        </div>
      ) : (
        <div className="kpi-hint">{hint || ''}</div>
      )}
    </div>
  )
}

function PodiumCard({ titre, subtitle, rows, color, emoji }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${color}`, overflow: 'hidden' }}>
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: color, textTransform: 'uppercase' }}>
            {emoji} {titre}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '4px 0' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
            Aucun conseiller dans cette catégorie.
          </div>
        ) : rows.map((r, i) => (
          <div key={r.profile.advisor_code} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--bd)' : 'none',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `${color}1A`, color, fontWeight: 700, fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--t1)', fontSize: 14 }}>
                {r.profile.full_name || r.profile.advisor_code}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                {r.m.signedCount} dossier{r.m.signedCount !== 1 ? 's' : ''} · {fmtEur(r.totalBrut)} prod.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtEur(r.m.ppSigned)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>PP signée</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SortableTh({ label, col, sortKey, sortDir, onSort, align }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left' }}
      title={`Trier par ${label}`}>
      {label}
      <span style={{ marginLeft: 4, color: active ? 'var(--gold)' : 'var(--t3)', fontSize: 10 }}>
        {active ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
      </span>
    </th>
  )
}

function RowConseiller({ r }) {
  const code = r.profile.advisor_code
  const typeContrat = r.profile.role === 'manager' ? 'Manager' : 'Conseiller'
  const isAlerte = r.m.signedCount === 0
  return (
    <tr style={{ background: isAlerte ? 'rgba(239,68,68,0.03)' : undefined }}>
      <td>
        <div className="cell-primary">{r.profile.full_name || code}</div>
        <div className="cell-sub" style={{ fontFamily: 'monospace' }}>{code}</div>
      </td>
      <td>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: 'var(--bg)', color: 'var(--t2)',
        }}>{typeContrat}</span>
      </td>
      <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
        {r.m.signedCount.toFixed(r.m.signedCount % 1 === 0 ? 0 : 1)}
      </td>
      <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(r.m.ppSigned)}</td>
      <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(r.m.puSigned)}</td>
      <td className="cell-mono" style={{ textAlign: 'right', color: 'var(--t3)' }}>{fmtEur(r.m.ppPipeline)}</td>
      <td className="cell-mono" style={{ textAlign: 'right' }}>
        {r.prev ? (
          <span style={{
            color: r.dPp > 0 ? '#10B981' : r.dPp < 0 ? '#EF4444' : 'var(--t3)',
            fontWeight: 600,
          }}>
            {r.dPp > 0 ? '+' : ''}{fmtEur(r.dPp)}
          </span>
        ) : (
          <span style={{ color: 'var(--t3)' }}>—</span>
        )}
      </td>
      <td>
        {isAlerte ? (
          <span className="badge" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
            À booster
          </span>
        ) : r.m.signedCount >= 3 ? (
          <span className="badge badge-signed">Au top</span>
        ) : (
          <span className="badge" style={{ background: 'var(--bg)', color: 'var(--t2)' }}>OK</span>
        )}
      </td>
    </tr>
  )
}
