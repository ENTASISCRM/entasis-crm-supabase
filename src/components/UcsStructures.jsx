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
import * as clientsService from '../services/clients'

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
          <Simulator
            ucs={selectedUcs}
            profile={profile}
            isManager={isManager}
          />
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

// ─────────────────────────────────────────────────────────────────────────────
// Simulator : colonne droite, sticky, calcul commission temps réel
// ─────────────────────────────────────────────────────────────────────────────

function Simulator({ ucs, profile, isManager }) {
  const [montantStr, setMontantStr] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [clientResults, setClientResults] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedFeedback, setSavedFeedback] = useState('')

  // Reset montant + client quand on change d'UCS
  useEffect(() => {
    setMontantStr('')
    setSelectedClient(null)
    setClientSearch('')
    setSavedFeedback('')
  }, [ucs?.id])

  // Parse le montant tapé (accepte espaces et virgules)
  const montant = useMemo(() => {
    const cleaned = montantStr.replace(/[^\d,.]/g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : n
  }, [montantStr])

  const minimum = ucs?.minimum_requis ? Number(ucs.minimum_requis) : 0
  const isBelowMin = ucs && montant > 0 && montant < minimum
  const hasValidMontant = ucs && montant >= minimum

  // Calcul commission (pure function du service)
  const commission = useMemo(() => {
    if (!ucs || !hasValidMontant) return null
    return ucsService.computeCommission(montant, Number(ucs.upfront))
  }, [ucs, montant, hasValidMontant])

  const couponAnnuel = useMemo(() => {
    if (!ucs || !hasValidMontant) return null
    return ucsService.computeCouponAnnuel(montant, Number(ucs.coupon_client))
  }, [ucs, montant, hasValidMontant])

  // Format affichage avec espaces (européen)
  const formatInput = (v) => {
    if (!v) return ''
    const num = parseFloat(String(v).replace(/[^\d,.]/g, '').replace(',', '.'))
    if (isNaN(num)) return v
    return num.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  }

  const handleMontantChange = (e) => {
    // On garde le texte brut pour permettre la saisie progressive
    setMontantStr(e.target.value)
    setSavedFeedback('')
  }

  const handleQuickAdd = (amount) => {
    setMontantStr(String(Math.round(montant + amount)))
    setSavedFeedback('')
  }

  const handleReset = () => {
    setMontantStr('')
    setSavedFeedback('')
  }

  // Recherche client (debounced 300ms via setTimeout)
  useEffect(() => {
    if (!clientSearch || clientSearch.length < 2) {
      setClientResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const results = await clientsService.searchByQuery(clientSearch)
        setClientResults(results)
      } catch (e) {
        logger.warn('[UCS] client search failed', e)
        setClientResults([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  const handleSave = async () => {
    if (!ucs || !commission || !profile?.id) return
    setSaving(true)
    setSavedFeedback('')
    try {
      await ucsService.saveSimulation({
        ucsId: ucs.id,
        conseillerId: profile.id,
        clientId: selectedClient?.id || null,
        montant,
        commissionConseiller: commission.conseiller,
        commissionCabinet: commission.cabinet,
      })
      setSavedFeedback('Simulation enregistrée ✓')
    } catch (e) {
      logger.warn('[UCS] saveSimulation failed', e)
      setSavedFeedback(`Erreur : ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ───────────────── Render ─────────────────
  if (!ucs) {
    return (
      <div className="ucs-simulator">
        <h2 style={simulatorTitleStyle}>Simulateur de commission</h2>
        <p style={{ fontSize: 13, color: 'var(--t3)', margin: '8px 0 0' }}>
          Sélectionnez une UCS dans le catalogue pour démarrer une simulation.
        </p>
      </div>
    )
  }

  return (
    <div className="ucs-simulator">
      <h2 style={simulatorTitleStyle}>Simulateur de commission</h2>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
        {ucs.nom_ucs}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace' }}>
        {ucs.code_isin}
      </div>

      {/* Caractéristiques UCS sélectionnée */}
      <div style={{
        marginTop: 16,
        padding: 12,
        background: 'var(--bg)',
        borderRadius: 8,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px 12px',
        fontSize: 11,
      }}>
        <CharRow label="Compagnie" value={ucs.compagnie} />
        <CharRow label="Upfront" value={fmtPct(ucs.upfront)} highlight />
        <CharRow label="Coupon/an" value={fmtPct(ucs.coupon_client)} />
        <CharRow label="Mini ticket" value={fmtEuro(ucs.minimum_requis)} />
        <CharRow label="SRI" value={ucs.sri ?? '—'} />
        <CharRow label="Fin commerc." value={fmtDate(ucs.fin_commerc)} />
      </div>

      {/* Input montant */}
      <div style={{ marginTop: 20 }}>
        <label style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--t3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 6,
        }}>
          Montant client
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            inputMode="numeric"
            value={montantStr}
            onChange={handleMontantChange}
            placeholder={`Ex: ${fmtEuro(minimum * 4)}`}
            style={{
              width: '100%',
              padding: '12px 36px 12px 14px',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--t1)',
              border: `2px solid ${isBelowMin ? '#b91c1c' : 'var(--bd)'}`,
              borderRadius: 8,
              outline: 'none',
              fontFamily: 'inherit',
              background: '#fff',
            }}
          />
          <span style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 16,
            color: 'var(--t3)',
            fontWeight: 600,
            pointerEvents: 'none',
          }}>€</span>
        </div>
        {isBelowMin && (
          <div style={{
            marginTop: 6,
            fontSize: 11,
            color: '#b91c1c',
            fontWeight: 500,
          }}>
            ⚠ Montant inférieur au minimum requis ({fmtEuro(minimum)})
          </div>
        )}
        {montant > 0 && !isBelowMin && (
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--t3)' }}>
            {formatInput(montant)} €
          </div>
        )}
      </div>

      {/* Boutons rapides */}
      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[10000, 25000, 50000, 100000].map(a => (
          <button key={a} onClick={() => handleQuickAdd(a)} style={quickBtnStyle}>
            +{a / 1000}k
          </button>
        ))}
        <button onClick={handleReset} style={{ ...quickBtnStyle, background: 'transparent' }}>
          Reset
        </button>
      </div>

      {/* Bloc résultats */}
      {commission && (
        <div style={{
          marginTop: 20,
          padding: 16,
          background: 'linear-gradient(to bottom, rgba(201,169,97,0.06), rgba(201,169,97,0.02))',
          border: '1px solid var(--gold-line, rgba(201,169,97,0.3))',
          borderRadius: 10,
        }}>
          <ResultLine label="Montant placé client" value={fmtEuro(montant)} />
          <ResultDivider />
          <ResultLine label={`Upfront total (${fmtPct(ucs.upfront)})`} value={fmtEuro(commission.upfrontTotal)} muted />

          {/* Ma commission — la ligne hero (or, gras, grand) */}
          <div style={{
            marginTop: 14,
            marginBottom: isManager ? 10 : 0,
            padding: '10px 12px',
            background: '#fff',
            border: '2px solid var(--gold)',
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--gold)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              Ma commission (1,5 %)
            </span>
            <span style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--gold)',
              fontFamily: 'var(--font-serif, Georgia, serif)',
            }}>
              {fmtEuro(commission.conseiller)}
            </span>
          </div>

          {/* Rétention cabinet — visible manager seulement */}
          {isManager && (
            <>
              <ResultLine
                label={`Rétention cabinet (${fmtPct(Math.max(0, ucs.upfront - 1.5))})`}
                value={fmtEuro(commission.cabinet)}
                danger={commission.isUnderwater}
              />
              {commission.isUnderwater && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#b91c1c',
                }}>
                  ⚠ UCS non rentable cabinet, validation Louis requise
                </div>
              )}
            </>
          )}

          <ResultDivider />
          <ResultLine
            label={`Coupon annuel client (${fmtPct(ucs.coupon_client)})`}
            value={fmtEuro(couponAnnuel)}
            muted
          />
        </div>
      )}

      {/* Sélecteur client + bouton sauvegarder */}
      {commission && (
        <div style={{ marginTop: 16 }}>
          <label style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--t3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 6,
          }}>
            Rattacher à un client (optionnel)
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={selectedClient ? `${selectedClient.nom} ${selectedClient.prenom || ''}`.trim() : clientSearch}
              onChange={e => {
                setClientSearch(e.target.value)
                if (selectedClient) setSelectedClient(null)
              }}
              placeholder="Rechercher un client…"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 12,
                border: '1px solid var(--bd)',
                borderRadius: 6,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            {clientResults.length > 0 && !selectedClient && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid var(--bd)',
                borderRadius: 6,
                marginTop: 2,
                maxHeight: 200,
                overflowY: 'auto',
                zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}>
                {clientResults.map(c => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedClient(c)
                      setClientSearch('')
                      setClientResults([])
                    }}
                    style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--bd)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <div style={{ fontWeight: 600 }}>{c.nom} {c.prenom}</div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>{c.email} · {c.telephone}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '12px 16px',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              background: saving ? 'var(--t3)' : 'var(--t1)',
              border: 'none',
              borderRadius: 8,
              cursor: saving ? 'wait' : 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {saving ? 'Enregistrement...' : 'Sauvegarder cette simulation'}
          </button>

          {savedFeedback && (
            <div style={{
              marginTop: 8,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 500,
              background: savedFeedback.startsWith('Erreur')
                ? 'rgba(239,68,68,0.08)'
                : 'rgba(16,185,129,0.08)',
              color: savedFeedback.startsWith('Erreur') ? '#b91c1c' : '#047857',
              borderRadius: 4,
              textAlign: 'center',
            }}>
              {savedFeedback}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const simulatorTitleStyle = {
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--t1)',
  margin: 0,
  letterSpacing: '-0.005em',
}

const quickBtnStyle = {
  padding: '6px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--t2)',
  background: 'var(--bg)',
  border: '1px solid var(--bd)',
  borderRadius: 6,
  cursor: 'pointer',
}

function CharRow({ label, value, highlight }) {
  return (
    <>
      <span style={{ color: 'var(--t3)', fontWeight: 500 }}>{label}</span>
      <span style={{
        textAlign: 'right',
        fontWeight: highlight ? 700 : 600,
        color: highlight ? 'var(--gold)' : 'var(--t1)',
      }}>{value}</span>
    </>
  )
}

function ResultLine({ label, value, muted, danger }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '4px 0',
    }}>
      <span style={{
        fontSize: muted ? 11 : 12,
        color: danger ? '#b91c1c' : muted ? 'var(--t3)' : 'var(--t2)',
        fontWeight: 500,
      }}>{label}</span>
      <span style={{
        fontSize: muted ? 12 : 14,
        fontWeight: danger ? 700 : muted ? 500 : 600,
        color: danger ? '#b91c1c' : muted ? 'var(--t3)' : 'var(--t1)',
        fontFamily: 'monospace',
      }}>{value}</span>
    </div>
  )
}

function ResultDivider() {
  return <div style={{ height: 1, background: 'var(--bd)', margin: '6px 0' }} />
}
