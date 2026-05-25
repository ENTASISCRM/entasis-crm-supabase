// src/components/UcsStructures.jsx
// Onglet "UCS Produits Structurés" : catalogue + simulateur de commission.
//
// Layout 2 colonnes (60% / 40%) sur desktop, empilé sur mobile.
// Charte Entasis : navy #0A1F44, or #C9A961, fond clair beige.
//
// Pour le simulateur (colonne droite), voir UCS-4.
// Pour l'interface admin (CSV upload + édition inline), voir UCS-5.

import { useEffect, useMemo, useState } from 'react'
import { logger } from '../lib/logger'
import * as ucsService from '../services/ucsStructures'

const ETATS = [
  { value: 'EN_COURS',   label: 'En cours',   color: '#15803d' },
  { value: 'CLOTURE',    label: 'Clôturé',    color: '#c2410c' },
  { value: 'ANNULATION', label: 'Annulé',     color: '#b91c1c' },
]

const FILTER_STORAGE_KEY = 'ucs.filters.v1'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────────────────

const fmtEuro = (n) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
}

const fmtPct = (n) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 3 }) + '%'
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const daysUntil = (iso) => {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.floor(ms / 86400000)
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistance des filtres par conseiller (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS = {
  etats: ['EN_COURS'],
  compagnies: [],          // [] = toutes
  sriMax: 7,
  ticketMin: 'all',        // 'all' / '1000' / '25000'
  search: '',
}

function loadFilters() {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_FILTERS
  }
}

function saveFilters(filters) {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters))
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default function UcsStructures({ profile }) {
  const isManager = profile?.role === 'manager'
  const [ucs, setUcs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUcsId, setSelectedUcsId] = useState(null)
  const [filters, setFilters] = useState(loadFilters)

  // Charge le catalogue
  useEffect(() => {
    let active = true
    setLoading(true)
    ucsService.listAll()
      .then(data => { if (active) { setUcs(data); setError('') } })
      .catch(e => {
        logger.warn('[UCS] listAll failed', e)
        if (active) setError(e.message || 'Erreur de chargement du catalogue')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Persistance filtres
  useEffect(() => { saveFilters(filters) }, [filters])

  // Liste des compagnies présentes dans le catalogue (pour le dropdown filtre)
  const allCompagnies = useMemo(() => {
    const set = new Set(ucs.map(u => u.compagnie).filter(Boolean))
    return Array.from(set).sort()
  }, [ucs])

  // Application des filtres (tri EN_COURS first + upfront DESC déjà côté service).
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    const ticketMin = filters.ticketMin === 'all' ? 0 : Number(filters.ticketMin)
    return ucs.filter(u => {
      if (filters.etats.length && !filters.etats.includes(u.etat)) return false
      if (filters.compagnies.length && !filters.compagnies.includes(u.compagnie)) return false
      if (u.sri != null && u.sri > filters.sriMax) return false
      if (ticketMin > 0 && Number(u.minimum_requis) < ticketMin) return false
      if (q) {
        const hay = `${u.nom_ucs} ${u.code_isin} ${u.compagnie}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [ucs, filters])

  const selectedUcs = ucs.find(u => u.id === selectedUcsId) || null

  // ─────────────────────────── Handlers filtres ───────────────────────────
  const toggleEtat = (value) => {
    setFilters(f => ({
      ...f,
      etats: f.etats.includes(value)
        ? f.etats.filter(e => e !== value)
        : [...f.etats, value],
    }))
  }

  const toggleCompagnie = (value) => {
    setFilters(f => ({
      ...f,
      compagnies: f.compagnies.includes(value)
        ? f.compagnies.filter(c => c !== value)
        : [...f.compagnies, value],
    }))
  }

  const resetFilters = () => setFilters(DEFAULT_FILTERS)

  // ───────────────────────────────── Render ─────────────────────────────────
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      <Header isManager={isManager} />

      {loading && <LoadingState />}
      {error && !loading && <ErrorState error={error} />}
      {!loading && !error && ucs.length === 0 && <EmptyState isManager={isManager} />}

      {!loading && !error && ucs.length > 0 && (
        <div className="ucs-layout">
          <div className="ucs-catalogue">
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              allCompagnies={allCompagnies}
              toggleEtat={toggleEtat}
              toggleCompagnie={toggleCompagnie}
              resetFilters={resetFilters}
              count={filtered.length}
              total={ucs.length}
            />
            <CatalogueTable
              ucs={filtered}
              selectedId={selectedUcsId}
              onSelect={setSelectedUcsId}
            />
          </div>
          <div className="ucs-simulator">
            <p style={{ color: 'var(--t3)', fontSize: 12, fontStyle: 'italic', margin: 0 }}>
              {selectedUcs
                ? `Sélection : ${selectedUcs.nom_ucs}`
                : 'Sélectionnez une UCS dans le catalogue'}
              {' · Simulateur à venir (UCS-4)'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Header({ isManager }) {
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
        UCS Produits Structurés
      </h1>
      <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>
        Catalogue des produits structurés du groupement et simulateur de commission.
        {' '}<strong style={{ color: 'var(--gold)' }}>Commission conseiller : 1,5 % fixe</strong>
        {isManager && ' · Rétention cabinet = Upfront − 1,5 %'}
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
      Chargement du catalogue...
    </div>
  )
}

function ErrorState({ error }) {
  return (
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
        La table UCS n'est peut-être pas encore créée. Vérifie que la migration SQL a été appliquée.
      </span>
    </div>
  )
}

function EmptyState({ isManager }) {
  return (
    <div style={{
      padding: 32,
      textAlign: 'center',
      color: 'var(--t3)',
      fontSize: 13,
      background: 'var(--bg)',
      border: '1px dashed var(--bd)',
      borderRadius: 12,
    }}>
      Aucune UCS dans le catalogue.
      {isManager && (
        <>
          <br />
          <span style={{ fontSize: 12 }}>
            Importez le CSV du groupement via l'interface admin (à venir).
          </span>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterBar : chips Etat, dropdown Compagnie, slider SRI, ticket min, recherche
// ─────────────────────────────────────────────────────────────────────────────

function FilterBar({ filters, setFilters, allCompagnies, toggleEtat, toggleCompagnie, resetFilters, count, total }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--bd)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Ligne 1 : recherche + reset + compteur */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
          <input
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Rechercher (nom UCS, ISIN, compagnie)…"
            style={{
              width: '100%',
              padding: '8px 32px 8px 12px',
              fontSize: 13,
              border: '1px solid var(--bd)',
              borderRadius: 8,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {filters.search && (
            <button
              onClick={() => setFilters(f => ({ ...f, search: '' }))}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--t3)', fontSize: 16, padding: 0, lineHeight: 1,
              }}
              aria-label="Effacer la recherche"
            >×</button>
          )}
        </div>
        <button onClick={resetFilters} style={{
          padding: '6px 12px',
          fontSize: 12,
          background: 'var(--bg)',
          border: '1px solid var(--bd)',
          borderRadius: 6,
          color: 'var(--t2)',
          cursor: 'pointer',
        }}>Reset filtres</button>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t3)' }}>
          <strong style={{ color: 'var(--t1)' }}>{count}</strong> UCS sur {total}
        </div>
      </div>

      {/* Ligne 2 : chips Etat + compagnies + SRI + ticket */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Etat chips */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>État</span>
          {ETATS.map(e => {
            const active = filters.etats.includes(e.value)
            return (
              <button
                key={e.value}
                onClick={() => toggleEtat(e.value)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 12,
                  border: `1px solid ${active ? e.color : 'var(--bd)'}`,
                  background: active ? e.color : '#fff',
                  color: active ? '#fff' : 'var(--t2)',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >{e.label}</button>
            )
          })}
        </div>

        {/* Compagnie multi-select (dropdown simple en chips) */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Compagnie</span>
          {allCompagnies.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>—</span>
          ) : (
            allCompagnies.map(c => {
              const active = filters.compagnies.includes(c)
              return (
                <button
                  key={c}
                  onClick={() => toggleCompagnie(c)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 10.5,
                    fontWeight: 500,
                    borderRadius: 10,
                    border: `1px solid ${active ? 'var(--t1)' : 'var(--bd)'}`,
                    background: active ? 'var(--t1)' : '#fff',
                    color: active ? '#fff' : 'var(--t2)',
                    cursor: 'pointer',
                  }}
                >{c}</button>
              )
            })
          )}
        </div>

        {/* SRI max */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>SRI ≤</span>
          <input
            type="range"
            min={1}
            max={7}
            value={filters.sriMax}
            onChange={e => setFilters(f => ({ ...f, sriMax: Number(e.target.value) }))}
            style={{ width: 80 }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', minWidth: 12 }}>{filters.sriMax}</span>
        </div>

        {/* Ticket mini */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Mini</span>
          {[
            { v: 'all',   l: 'Tous' },
            { v: '1000',  l: '1k€' },
            { v: '25000', l: '25k€' },
          ].map(opt => {
            const active = filters.ticketMin === opt.v
            return (
              <button
                key={opt.v}
                onClick={() => setFilters(f => ({ ...f, ticketMin: opt.v }))}
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--bd)'}`,
                  background: active ? 'var(--gold)' : '#fff',
                  color: active ? '#fff' : 'var(--t2)',
                  cursor: 'pointer',
                }}
              >{opt.l}</button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CatalogueTable : tableau dense, clic = sélection (chargement du simulateur)
// ─────────────────────────────────────────────────────────────────────────────

function CatalogueTable({ ucs, selectedId, onSelect }) {
  if (ucs.length === 0) {
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
        Aucune UCS ne correspond aux filtres actuels.
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
              <Th>État</Th>
              <Th>Nom UCS</Th>
              <Th>ISIN</Th>
              <Th>Compagnie</Th>
              <Th align="right">Upfront</Th>
              <Th align="right">Mini</Th>
              <Th align="right">Coupon/an</Th>
              <Th>Constat.</Th>
              <Th align="center">SRI</Th>
              <Th align="right">Enveloppe</Th>
              <Th align="right">Fin commerc.</Th>
            </tr>
          </thead>
          <tbody>
            {ucs.map(u => (
              <Row key={u.id} u={u} selected={u.id === selectedId} onClick={() => onSelect(u.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '8px 12px',
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
      padding: '10px 12px',
      textAlign: align,
      fontSize: 12,
      color: 'var(--t1)',
      borderTop: '1px solid var(--bd)',
      whiteSpace: 'nowrap',
      ...style,
    }}>{children}</td>
  )
}

function Row({ u, selected, onClick }) {
  const etat = ETATS.find(e => e.value === u.etat)
  const isEnveloppeDanger = u.enveloppe_restante != null && Number(u.enveloppe_restante) < 0
  const dUntilFin = daysUntil(u.fin_commerc)
  const isFinSoon = dUntilFin != null && dUntilFin >= 0 && dUntilFin < 30
  const isFinPast = dUntilFin != null && dUntilFin < 0

  return (
    <tr
      onClick={onClick}
      style={{
        cursor: 'pointer',
        background: selected ? 'rgba(10,31,68,0.06)' : 'transparent',
        boxShadow: selected ? 'inset 3px 0 0 var(--gold)' : 'none',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <Td>
        <span style={{
          display: 'inline-block',
          padding: '2px 8px',
          fontSize: 9,
          fontWeight: 700,
          color: '#fff',
          background: etat?.color || '#666',
          borderRadius: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>{etat?.label || u.etat}</span>
      </Td>
      <Td style={{ maxWidth: 280, whiteSpace: 'normal', lineHeight: 1.3 }}>
        {u.couleur_badge && (
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: 3,
            background: u.couleur_badge,
            marginRight: 6,
            verticalAlign: 'middle',
          }} />
        )}
        <span style={{ fontWeight: 600 }}>{u.nom_ucs}</span>
      </Td>
      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--t2)' }}>{u.code_isin}</Td>
      <Td>
        <span style={{
          padding: '2px 8px',
          fontSize: 10,
          fontWeight: 600,
          borderRadius: 4,
          background: 'rgba(201,169,97,0.12)',
          color: '#7c5e1e',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}>{u.compagnie}</span>
      </Td>
      <Td align="right" style={{ fontWeight: 700, color: 'var(--t1)' }}>{fmtPct(u.upfront)}</Td>
      <Td align="right">{fmtEuro(u.minimum_requis)}</Td>
      <Td align="right">{fmtPct(u.coupon_client)}</Td>
      <Td style={{ fontSize: 10.5, color: 'var(--t3)' }}>{u.constatation || '—'}</Td>
      <Td align="center">
        <span style={{
          display: 'inline-block',
          minWidth: 18,
          padding: '1px 5px',
          fontSize: 10,
          fontWeight: 700,
          borderRadius: 3,
          background: 'var(--bg)',
          border: '1px solid var(--bd)',
        }}>{u.sri ?? '—'}</span>
      </Td>
      <Td align="right" style={{ color: isEnveloppeDanger ? '#b91c1c' : 'var(--t1)', fontWeight: isEnveloppeDanger ? 600 : 400 }}>
        {fmtEuro(u.enveloppe_restante)}
      </Td>
      <Td align="right" style={{ color: isFinPast ? '#b91c1c' : isFinSoon ? '#c2410c' : 'var(--t2)' }}>
        {fmtDate(u.fin_commerc)}
        {isFinSoon && !isFinPast && (
          <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.8 }}>({dUntilFin}j)</span>
        )}
      </Td>
    </tr>
  )
}
