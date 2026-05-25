// src/components/Structureurs.jsx
// Page "Structureurs" (manager only) — patch #3 Louis.
//
// Layout :
//   1. Header
//   2. Actions prioritaires (encart rouge/orange/gris)
//   3. 4 KPI cards (actifs, upfront global, UCS en cours, volume YTD)
//   4. Tableau partenaires (tri/filtre, lien fiche détail)
//
// Export Excel : à venir en V2 (la base actuelle n'a pas de lib XLSX
// installée et on a convenu "pas de deps lourdes" — la page principale
// suffit largement pour l'usage Louis).

import { useEffect, useMemo, useState } from 'react'
import { logger } from '../lib/logger'
import * as structureursService from '../services/structureurs'

const UPFRONT_TARGET = 3.0   // seuil de rentabilité cabinet (1,5% conseiller + 1,5% mini cabinet)

export default function Structureurs({ profile }) {
  const isManager = profile?.role === 'manager'
  const [enriched, setEnriched] = useState([])
  const [actions, setActions] = useState([])
  const [kpis, setKpis] = useState({ activeCount: 0, upfrontGlobal: null, ucsEnCours: 0, volumeTotal: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterCompagnie, setFilterCompagnie] = useState('all')
  const [sortBy, setSortBy] = useState('volume')   // volume / upfront / contact / ucsEnCours

  const reload = () => {
    setLoading(true)
    return Promise.all([
      structureursService.listEnriched(),
      structureursService.getPriorityActions(),
      structureursService.getDashboardKpis(),
    ])
      .then(([list, acts, k]) => {
        setEnriched(list)
        setActions(acts)
        setKpis(k)
        setError('')
      })
      .catch(e => {
        logger.warn('[Structureurs] load failed', e)
        setError(e.message || 'Erreur de chargement')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!isManager) return
    let active = true
    setLoading(true)
    Promise.all([
      structureursService.listEnriched(),
      structureursService.getPriorityActions(),
      structureursService.getDashboardKpis(),
    ])
      .then(([list, acts, k]) => {
        if (!active) return
        setEnriched(list)
        setActions(acts)
        setKpis(k)
      })
      .catch(e => {
        logger.warn('[Structureurs] load failed', e)
        if (active) setError(e.message || 'Erreur de chargement')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isManager])

  // Filtrage + tri
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return enriched
      .filter(s => {
        if (filterCompagnie !== 'all' && !(s.compagnies_travaillees || []).includes(filterCompagnie)) return false
        if (q && !s.nom.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'volume') return (b.volumePlace || 0) - (a.volumePlace || 0)
        if (sortBy === 'upfront') return (b.upfrontMoyen || 0) - (a.upfrontMoyen || 0)
        if (sortBy === 'ucsEnCours') return (b.ucsEnCours || 0) - (a.ucsEnCours || 0)
        if (sortBy === 'contact') {
          const ad = a.date_dernier_contact ? new Date(a.date_dernier_contact).getTime() : 0
          const bd = b.date_dernier_contact ? new Date(b.date_dernier_contact).getTime() : 0
          return bd - ad
        }
        return 0
      })
  }, [enriched, search, filterCompagnie, sortBy])

  // ─── Garde-fou rôle ───
  if (!isManager) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
        <p>Cette page est réservée à la direction.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      <Header />

      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)' }}>Chargement…</div>
      )}

      {error && !loading && (
        <div style={{
          padding: 16,
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12,
          color: '#b91c1c',
          fontSize: 13,
          marginBottom: 16,
        }}>
          Erreur : {error}
          <br />
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            La table structureurs n'est peut-être pas encore créée.
            Vérifie que la migration SQL a été appliquée.
          </span>
        </div>
      )}

      {!loading && !error && (
        <>
          <PriorityActions actions={actions} />
          <Kpis kpis={kpis} count={enriched.length} />
          <FiltersBar
            search={search}
            setSearch={setSearch}
            filterCompagnie={filterCompagnie}
            setFilterCompagnie={setFilterCompagnie}
            sortBy={sortBy}
            setSortBy={setSortBy}
            count={filtered.length}
            total={enriched.length}
          />
          <PartenairesTable rows={filtered} onReload={reload} />
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{
        fontFamily: 'var(--font-serif, Georgia, serif)',
        fontSize: 28,
        fontWeight: 700,
        color: 'var(--t1)',
        margin: 0,
        letterSpacing: '-0.01em',
      }}>
        Structureurs
      </h1>
      <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>
        Pilotage des partenaires commerciaux du cabinet (négociation upfront, suivi contacts).
        {' '}<strong style={{ color: 'var(--t1)' }}>Direction uniquement.</strong>
      </p>
    </div>
  )
}

function PriorityActions({ actions }) {
  if (!actions.length) {
    return (
      <div style={{
        marginBottom: 20,
        padding: 14,
        background: 'rgba(21,128,61,0.06)',
        border: '1px solid rgba(21,128,61,0.2)',
        borderRadius: 10,
        fontSize: 13,
        color: '#15803d',
      }}>
        Aucune action prioritaire — tous les structureurs sont à jour.
      </div>
    )
  }

  return (
    <div style={{
      marginBottom: 20,
      background: '#fff',
      border: '2px solid var(--gold)',
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--gold)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 10,
      }}>
        Actions prioritaires
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((a, i) => {
          const color = a.severity === 'high' ? '#b91c1c'
                      : a.severity === 'medium' ? '#c2410c'
                      : 'var(--t2)'
          return (
            <div key={i} style={{
              padding: '10px 12px',
              borderLeft: `3px solid ${color}`,
              background: a.severity === 'high' ? 'rgba(239,68,68,0.04)' : 'var(--bg)',
              borderRadius: 4,
              fontSize: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <span style={{ color, lineHeight: 1.4 }}>{a.message}</span>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--t3)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}>→ {a.cta}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Kpis({ kpis, count }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      marginBottom: 20,
    }}>
      <KpiCard
        label="Structureurs actifs"
        value={kpis.activeCount}
        hint={`sur ${count} référencés`}
      />
      <KpiCard
        label="Upfront moyen global"
        value={kpis.upfrontGlobal != null ? `${kpis.upfrontGlobal.toFixed(2)}%` : '—'}
        hint={`seuil rentabilité : ${UPFRONT_TARGET}%`}
        accent={
          kpis.upfrontGlobal != null && kpis.upfrontGlobal < UPFRONT_TARGET ? 'danger' : 'ok'
        }
      />
      <KpiCard
        label="UCS en cours"
        value={kpis.ucsEnCours}
        hint="toutes campagnes"
      />
      <KpiCard
        label="Volume placé YTD"
        value={fmtEuroCompact(kpis.volumeTotal)}
        hint="simulations enregistrées"
      />
    </div>
  )
}

function KpiCard({ label, value, hint, accent }) {
  const color = accent === 'danger' ? '#b91c1c' : 'var(--t1)'
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--bd)',
      borderRadius: 12,
      padding: '16px 18px',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--t3)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontSize: 26,
        fontWeight: 700,
        color,
        fontFamily: 'var(--font-serif, Georgia, serif)',
        lineHeight: 1.1,
      }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{hint}</div>
    </div>
  )
}

function FiltersBar({ search, setSearch, filterCompagnie, setFilterCompagnie, sortBy, setSortBy, count, total }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--bd)',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      flexWrap: 'wrap',
    }}>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher un structureur…"
        style={{
          flex: 1,
          minWidth: 200,
          maxWidth: 300,
          padding: '8px 12px',
          fontSize: 13,
          border: '1px solid var(--bd)',
          borderRadius: 6,
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase' }}>Compagnie</span>
        {[
          { v: 'all', l: 'Toutes' },
          { v: 'SWISSLIFE', l: 'Swisslife' },
          { v: 'ABEILLE', l: 'Abeille' },
        ].map(opt => {
          const active = filterCompagnie === opt.v
          return (
            <button key={opt.v} onClick={() => setFilterCompagnie(opt.v)} style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${active ? 'var(--t1)' : 'var(--bd)'}`,
              background: active ? 'var(--t1)' : '#fff',
              color: active ? '#fff' : 'var(--t2)',
              cursor: 'pointer',
            }}>{opt.l}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
        <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase' }}>Tri</span>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            padding: '6px 10px',
            fontSize: 12,
            border: '1px solid var(--bd)',
            borderRadius: 6,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          <option value="volume">Volume placé</option>
          <option value="upfront">Upfront moyen</option>
          <option value="ucsEnCours">UCS en cours</option>
          <option value="contact">Date dernier contact</option>
        </select>
      </div>
      <div style={{ fontSize: 12, color: 'var(--t3)' }}>
        <strong style={{ color: 'var(--t1)' }}>{count}</strong> / {total}
      </div>
    </div>
  )
}

function PartenairesTable({ rows, onReload }) {
  if (rows.length === 0) {
    return (
      <div style={{
        padding: 24,
        textAlign: 'center',
        color: 'var(--t3)',
        fontSize: 12,
        background: 'var(--bg)',
        border: '1px dashed var(--bd)',
        borderRadius: 12,
      }}>
        Aucun structureur ne correspond aux filtres.
      </div>
    )
  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--bd)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--bd)' }}>
              <Th>Nom</Th>
              <Th>Compagnies</Th>
              <Th align="right">UCS en cours</Th>
              <Th align="right">Upfront moyen</Th>
              <Th align="right">Volume placé</Th>
              <Th>Dernier contact</Th>
              <Th>Contact</Th>
              <Th align="center">Statut</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => <PartenaireRow key={s.id} s={s} onReload={onReload} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PartenaireRow({ s, onReload }) {
  const initials = s.nom.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase()
  const contactStale = s.isContactStale

  const handleToggleActive = async (e) => {
    e.stopPropagation()
    try {
      await structureursService.update(s.id, { actif: !s.actif })
      await onReload?.()
    } catch (err) {
      alert(`Erreur : ${err.message}`)
    }
  }

  return (
    <tr style={{ borderTop: '1px solid var(--bd)' }}>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: '#0A1F44',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.03em',
            flexShrink: 0,
          }}>{initials}</div>
          <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{s.nom}</span>
        </div>
      </Td>
      <Td>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(s.compagnies_travaillees || []).length === 0 ? (
            <span style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>—</span>
          ) : (
            (s.compagnies_travaillees || []).map(c => (
              <span key={c} style={{
                padding: '2px 7px',
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 4,
                background: c === 'SWISSLIFE' ? 'rgba(201,169,97,0.15)' : 'rgba(10,31,68,0.08)',
                color: c === 'SWISSLIFE' ? '#7c5e1e' : '#0A1F44',
                letterSpacing: '0.03em',
              }}>{c}</span>
            ))
          )}
        </div>
      </Td>
      <Td align="right" style={{ fontWeight: 600 }}>{s.ucsEnCours}</Td>
      <Td align="right" style={{ fontWeight: 700, color: s.upfrontMoyen != null && s.upfrontMoyen < UPFRONT_TARGET ? '#b91c1c' : 'var(--t1)' }}>
        {s.upfrontMoyen != null ? `${s.upfrontMoyen.toFixed(2)}%` : '—'}
      </Td>
      <Td align="right">{fmtEuroCompact(s.volumePlace)}</Td>
      <Td style={{ color: contactStale ? '#b91c1c' : 'var(--t2)' }}>
        {s.date_dernier_contact ? fmtDate(s.date_dernier_contact) : <em style={{ opacity: 0.7 }}>Jamais</em>}
      </Td>
      <Td>
        {s.email ? (
          <a
            href={`mailto:${s.email}`}
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--gold)', fontSize: 11, textDecoration: 'none' }}
          >{s.email}</a>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>—</span>
        )}
      </Td>
      <Td align="center">
        <button
          onClick={handleToggleActive}
          style={{
            padding: '3px 8px',
            fontSize: 10,
            fontWeight: 600,
            borderRadius: 4,
            border: 'none',
            background: s.actif ? '#15803d' : 'var(--t3)',
            color: '#fff',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >{s.actif ? 'Actif' : 'Inactif'}</button>
      </Td>
    </tr>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '10px 12px',
      textAlign: align,
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--t3)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}

function Td({ children, align = 'left', style = {} }) {
  return (
    <td style={{
      padding: '12px',
      textAlign: align,
      fontSize: 12,
      color: 'var(--t1)',
      ...style,
    }}>{children}</td>
  )
}

// ─── Helpers de formatage ───

function fmtEuroCompact(n) {
  if (n == null || isNaN(n) || n === 0) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)} k€`
  return `${n.toFixed(0)} €`
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
