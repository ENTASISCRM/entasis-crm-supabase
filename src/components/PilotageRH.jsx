// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE RH — Module manager-only
// Édition des contrats des conseillers : type, salaire brut, paliers PP/PU,
// dates de début/fin, statut actif/inactif.
//
// CONFIDENTIALITÉ STRICTE
//   Composant rendu UNIQUEMENT si profile.role === 'manager'.
//   Les RLS Supabase doublent cette garde côté serveur.
//
// Doc canonique : src/lib/bareme-entasis.js
// Migration BDD : supabase/migrations/20260525130000_conseiller_contrats.sql
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import * as service from '../services/conseillerContrats'
import { TYPES_CONTRAT, LIBELLE_TYPE_CONTRAT } from '../lib/bareme-entasis'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')

const TYPE_COLORS = {
  GERANT:     { bg: 'var(--gold-soft, rgba(201,169,97,0.12))', fg: 'var(--gold-dk, #A6843F)' },
  CDI:        { bg: 'rgba(0,113,227,0.10)',                    fg: '#0071E3' },
  CDD:        { bg: 'rgba(0,113,227,0.10)',                    fg: '#0071E3' },
  ALTERNANT:  { bg: 'rgba(52,199,89,0.10)',                    fg: '#1F8B3B' },
  STAGIAIRE:  { bg: 'rgba(255,149,0,0.10)',                    fg: '#B36B00' },
  MANDATAIRE: { bg: 'rgba(0,0,0,0.04)',                        fg: 'var(--t2)' },
}

const EMPTY_CONTRAT = {
  matricule: '',
  full_name: '',
  type_contrat: 'CDI',
  salaire_brut_mensuel: 0,
  palier_pp_mensuel: 0,
  palier_pu_mensuel: 0,
  date_debut: new Date().toISOString().slice(0, 10),
  date_fin: null,
  actif: true,
  notes: '',
}

export default function PilotageRH() {
  const [contrats, setContrats] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // contrat en cours d'édition (modale)
  const [creating, setCreating] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [filterActif, setFilterActif] = useState('actifs')
  const [search, setSearch] = useState('')

  const reload = async () => {
    setLoading(true)
    try {
      const data = await service.list()
      setContrats(data)
    } catch (e) {
      toast.error('Erreur de chargement : ' + (e.message || ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const filtered = useMemo(() => {
    return contrats.filter(c => {
      if (filterType !== 'all' && c.type_contrat !== filterType) return false
      if (filterActif === 'actifs' && !c.actif) return false
      if (filterActif === 'inactifs' && c.actif) return false
      if (search) {
        const s = search.toLowerCase()
        if (!(c.full_name || '').toLowerCase().includes(s) &&
            !(c.matricule || '').toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [contrats, filterType, filterActif, search])

  const stats = useMemo(() => {
    const actifs = contrats.filter(c => c.actif)
    return {
      total: actifs.length,
      cdi: actifs.filter(c => c.type_contrat === 'CDI').length,
      cdd: actifs.filter(c => c.type_contrat === 'CDD').length,
      alternants: actifs.filter(c => c.type_contrat === 'ALTERNANT').length,
      stagiaires: actifs.filter(c => c.type_contrat === 'STAGIAIRE').length,
      mandataires: actifs.filter(c => c.type_contrat === 'MANDATAIRE').length,
      masseSalarialeMensuelle: actifs.reduce((sum, c) => sum + Number(c.salaire_brut_mensuel || 0), 0),
    }
  }, [contrats])

  const handleSave = async (payload) => {
    try {
      if (payload.id) {
        await service.update(payload.id, payload)
        toast.success('Contrat mis à jour')
      } else {
        await service.create(payload)
        toast.success('Contrat créé')
      }
      setEditing(null)
      setCreating(false)
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    }
  }

  const handleToggleActif = async (contrat) => {
    if (!confirm(`${contrat.actif ? 'Désactiver' : 'Réactiver'} le contrat de ${contrat.full_name} ?`)) return
    try {
      await service.setActif(contrat.id, !contrat.actif)
      toast.success(contrat.actif ? 'Contrat désactivé' : 'Contrat réactivé')
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <div>
          <div className="section-kicker">Module manager · Confidentiel</div>
          <div className="section-title">Pilotage RH</div>
          <div className="section-sub">Contrats, salaires, paliers de commission par conseiller. Les conseillers n'ont accès qu'à leur propre ligne.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nouveau contrat</button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid mb-24">
        <div className="kpi-card kpi-card-blue">
          <div className="kpi-label">Effectif actif</div>
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-hint">{stats.cdi} CDI · {stats.cdd} CDD · {stats.alternants} alt. · {stats.stagiaires} stag. · {stats.mandataires} mand.</div>
        </div>
        <div className="kpi-card kpi-card-gold">
          <div className="kpi-label">Masse salariale brute / mois</div>
          <div className="kpi-value">{fmtEur(stats.masseSalarialeMensuelle)}</div>
          <div className="kpi-hint">Hors charges patronales et variables</div>
        </div>
        <div className="kpi-card kpi-card-green">
          <div className="kpi-label">Masse salariale brute / an</div>
          <div className="kpi-value">{fmtEur(stats.masseSalarialeMensuelle * 12)}</div>
          <div className="kpi-hint">Sur 12 mois constants</div>
        </div>
        <div className="kpi-card kpi-card-amber">
          <div className="kpi-label">Mandataires</div>
          <div className="kpi-value">{stats.mandataires}</div>
          <div className="kpi-hint">Indépendants — facturent Entasis</div>
        </div>
      </div>

      {/* Toolbar filtres */}
      <div className="table-toolbar mb-16" style={{ marginBottom: 16 }}>
        <input className="search-input" placeholder="Rechercher un conseiller…"
               value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">Tous les types</option>
          {TYPES_CONTRAT.map(t => <option key={t} value={t}>{LIBELLE_TYPE_CONTRAT[t]}</option>)}
        </select>
        <select className="filter-select" value={filterActif} onChange={e => setFilterActif(e.target.value)}>
          <option value="actifs">Actifs seulement</option>
          <option value="inactifs">Inactifs seulement</option>
          <option value="all">Tous</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Conseiller</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Brut / mois</th>
              <th style={{ textAlign: 'right' }}>Palier PP</th>
              <th style={{ textAlign: 'right' }}>Palier PU</th>
              <th>Début</th>
              <th>Fin</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="table-empty-state">
                <div className="empty-title">Aucun contrat trouvé</div>
                <div className="empty-sub">Ajuste les filtres ou ajoute un nouveau contrat</div>
              </td></tr>
            ) : filtered.map(c => {
              const col = TYPE_COLORS[c.type_contrat] || TYPE_COLORS.CDI
              return (
                <tr key={c.id} style={{ opacity: c.actif ? 1 : 0.5 }}>
                  <td>
                    <div className="cell-primary">{c.full_name}</div>
                    <div className="cell-sub">{c.matricule ? `Mat. ${c.matricule}` : 'Sans matricule'}</div>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', padding: '3px 10px', borderRadius: 999,
                      fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
                      background: col.bg, color: col.fg,
                    }}>
                      {LIBELLE_TYPE_CONTRAT[c.type_contrat] || c.type_contrat}
                    </span>
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{fmtEur(c.salaire_brut_mensuel)}</td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{c.palier_pp_mensuel > 0 ? fmtEur(c.palier_pp_mensuel) : '—'}</td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{c.palier_pu_mensuel > 0 ? fmtEur(c.palier_pu_mensuel) : '—'}</td>
                  <td>{fmtDate(c.date_debut)}</td>
                  <td>{fmtDate(c.date_fin)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Éditer</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleToggleActif(c)}>
                        {c.actif ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modale d'édition / création */}
      {(editing || creating) && (
        <ContratModal
          contrat={editing || { ...EMPTY_CONTRAT }}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Modale d'édition / création de contrat
// ─────────────────────────────────────────────────────────────────────────
function ContratModal({ contrat, onClose, onSave }) {
  const [form, setForm] = useState(contrat)
  const isNew = !contrat.id

  const handleChange = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.full_name?.trim()) return toast.error('Nom requis')
    if (!form.type_contrat) return toast.error('Type de contrat requis')
    if (!form.date_debut) return toast.error('Date de début requise')
    onSave(form)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-head">
            <div>
              <div className="modal-title">{isNew ? 'Nouveau contrat' : `Éditer · ${contrat.full_name}`}</div>
              <div className="modal-subtitle">Confidentiel — données salariales</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Nom complet</label>
                <input className="form-input" value={form.full_name || ''}
                       onChange={e => handleChange('full_name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Matricule</label>
                <input className="form-input" value={form.matricule || ''}
                       onChange={e => handleChange('matricule', e.target.value)}
                       placeholder="00009…" />
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Type de contrat</label>
                <select className="form-select" value={form.type_contrat}
                        onChange={e => handleChange('type_contrat', e.target.value)}>
                  {TYPES_CONTRAT.map(t => <option key={t} value={t}>{LIBELLE_TYPE_CONTRAT[t]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Salaire brut mensuel (€)</label>
                <input className="form-input" type="number" step="0.01" min="0"
                       value={form.salaire_brut_mensuel}
                       onChange={e => handleChange('salaire_brut_mensuel', e.target.value)} />
                <div className="form-hint">0 pour mandataire / gérant</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Palier PP mensuel (€)</label>
                <input className="form-input" type="number" step="100" min="0"
                       value={form.palier_pp_mensuel}
                       onChange={e => handleChange('palier_pp_mensuel', e.target.value)} />
                <div className="form-hint">Seuil PP à atteindre pour débloquer variable. 0 = aucun palier.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Palier PU mensuel (€)</label>
                <input className="form-input" type="number" step="1000" min="0"
                       value={form.palier_pu_mensuel}
                       onChange={e => handleChange('palier_pu_mensuel', e.target.value)} />
                <div className="form-hint">Seuil PU à atteindre. 0 = aucun palier.</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Date de début</label>
                <input className="form-input" type="date"
                       value={form.date_debut || ''}
                       onChange={e => handleChange('date_debut', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Date de fin (optionnel)</label>
                <input className="form-input" type="date"
                       value={form.date_fin || ''}
                       onChange={e => handleChange('date_fin', e.target.value || null)} />
                <div className="form-hint">CDD, fin de stage, etc.</div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes manager (privées)</label>
              <textarea className="form-textarea" rows={3}
                        value={form.notes || ''}
                        onChange={e => handleChange('notes', e.target.value)}
                        placeholder="Commentaires internes, dérogations, contexte…" />
            </div>

            {!isNew && (
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
                  <input type="checkbox" checked={!!form.actif}
                         onChange={e => handleChange('actif', e.target.checked)} />
                  Contrat actif
                </label>
              </div>
            )}
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">{isNew ? 'Créer' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
