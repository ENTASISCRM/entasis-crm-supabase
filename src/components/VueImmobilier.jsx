import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const euro = (v) => Number(v||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0})

const PROMOTEUR_COLORS = {
  greencity: { bg: 'rgba(22, 163, 74, 0.15)', text: '#4ade80', border: 'rgba(22,163,74,0.3)' },
  nexity: { bg: 'rgba(37, 99, 235, 0.15)', text: '#60a5fa', border: 'rgba(37,99,235,0.3)' },
  'lp-promotion': { bg: 'rgba(234, 88, 12, 0.15)', text: '#fb923c', border: 'rgba(234,88,12,0.3)' },
}

const PIPELINE_COLORS = {
  prospect: '#6b7280',
  presente: '#93c5fd',
  reservation: '#C9A84C',
  financement: '#f97316',
  acte: '#22c55e',
  livraison: '#15803d',
  honoraires: '#10b981',
}

const PIPELINE_LABELS = {
  prospect: 'Prospect',
  presente: 'Présenté',
  reservation: 'Réservation',
  financement: 'Financement',
  acte: 'Acte',
  livraison: 'Livraison',
  honoraires: 'Honoraires',
}

const STATUT_LABELS = {
  nouveau: 'NOUVEAU',
  disponible: 'DISPONIBLE',
  dernieres_opportunites: 'DERNIÈRES OPPS',
  travaux: 'TRAVAUX',
  livre: 'LIVRÉ',
}

const STATUT_COLORS = {
  nouveau: { bg: 'rgba(22,163,74,0.15)', text: '#4ade80', border: 'rgba(22,163,74,0.3)' },
  disponible: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  dernieres_opportunites: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
  travaux: { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af', border: 'rgba(107,114,128,0.3)' },
  livre: { bg: 'rgba(22,163,74,0.1)', text: '#86efac', border: 'rgba(22,163,74,0.2)' },
}

const DISPOSITIF_COLORS = {
  LLI: { bg: 'rgba(161,98,7,0.2)', text: '#fbbf24' },
  LMNP: { bg: 'rgba(37,99,235,0.2)', text: '#60a5fa' },
  PTZ: { bg: 'rgba(22,163,74,0.2)', text: '#4ade80' },
  'Bailleur Privé': { bg: 'rgba(139,92,246,0.2)', text: '#a78bfa' },
}

export default function VueImmobilier({ profile, setActiveTab }) {
  const [dossiers, setDossiers] = useState([])
  const [programmes, setProgrammes] = useState([])
  const [promoteurs, setPromoteurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterPromoteur, setFilterPromoteur] = useState('tous')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [dosRes, progRes, promRes] = await Promise.all([
      supabase.from('dossiers_immo').select('*').order('created_at', { ascending: false }),
      supabase.from('programmes').select('*').order('nom', { ascending: true }),
      supabase.from('promoteurs').select('*').order('nom', { ascending: true }),
    ])
    setDossiers(dosRes.data || [])
    setProgrammes(progRes.data || [])
    setPromoteurs(promRes.data || [])
    setLoading(false)
  }

  const kpis = useMemo(() => {
    const actifs = dossiers.filter(d => d.statut_pipeline !== 'honoraires')
    const honorairesDossiers = dossiers.filter(d => d.honoraires_percus)
    const totalHonoraires = honorairesDossiers.reduce((s, d) => s + (d.honoraires_ht || 0), 0)
    const totalPrevi = dossiers.filter(d => !d.honoraires_percus && d.honoraires_ht).reduce((s, d) => s + (d.honoraires_ht || 0), 0)
    const volumeVEFA = dossiers.filter(d => ['reservation', 'financement', 'acte', 'livraison', 'honoraires'].includes(d.statut_pipeline)).reduce((s, d) => s + (d.prix_lot || 0), 0)
    return {
      honoraires: totalHonoraires,
      previsionnels: totalPrevi,
      volumeVEFA,
      dossiersActifs: actifs.length,
    }
  }, [dossiers])

  const filteredProgrammes = useMemo(() => {
    if (filterPromoteur === 'tous') return programmes
    return programmes.filter(p => p.promoteur_slug === filterPromoteur)
  }, [programmes, filterPromoteur])

  const recentDossiers = useMemo(() => {
    const mine = profile?.role === 'manager' ? dossiers : dossiers.filter(d => d.conseiller_id === profile?.id)
    return mine.filter(d => d.statut_pipeline !== 'honoraires').slice(0, 5)
  }, [dossiers, profile])

  if (loading) {
    return (
      <div className="immo-loading">
        <div className="loading-spinner" />
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 12 }}>Chargement immobilier...</div>
      </div>
    )
  }

  return (
    <div className="immo-dashboard">
      <div className="immo-header">
        <div>
          <div className="immo-kicker">Vue direction · Immobilier Neuf</div>
          <div className="immo-title">Tableau de bord</div>
        </div>
        <button className="btn-immo-primary" onClick={() => setActiveTab('immo-dossiers')}>
          + Nouveau dossier
        </button>
      </div>

      {/* KPI Cards */}
      <div className="immo-kpi-grid">
        <div className="immo-kpi-card" style={{ borderTopColor: '#22c55e' }}>
          <div className="immo-kpi-label">Honoraires signés</div>
          <div className="immo-kpi-value">{euro(kpis.honoraires)}</div>
        </div>
        <div className="immo-kpi-card" style={{ borderTopColor: '#C9A84C' }}>
          <div className="immo-kpi-label">Prévisionnels</div>
          <div className="immo-kpi-value">{euro(kpis.previsionnels)}</div>
        </div>
        <div className="immo-kpi-card" style={{ borderTopColor: '#3b82f6' }}>
          <div className="immo-kpi-label">Volume VEFA réservé</div>
          <div className="immo-kpi-value">{euro(kpis.volumeVEFA)}</div>
        </div>
        <div className="immo-kpi-card" style={{ borderTopColor: '#8b5cf6' }}>
          <div className="immo-kpi-label">Dossiers actifs</div>
          <div className="immo-kpi-value">{kpis.dossiersActifs}</div>
        </div>
      </div>

      {/* Main content: Programmes + Pipeline */}
      <div className="immo-main-grid">
        {/* Left: Programmes */}
        <div className="immo-section">
          <div className="immo-section-header">
            <div className="immo-section-title">Programmes disponibles</div>
            <div className="immo-pills">
              <button className={`immo-pill${filterPromoteur === 'tous' ? ' active' : ''}`} onClick={() => setFilterPromoteur('tous')}>Tous</button>
              {promoteurs.map(p => (
                <button key={p.slug} className={`immo-pill${filterPromoteur === p.slug ? ' active' : ''}`} onClick={() => setFilterPromoteur(p.slug)}>{p.nom.split(' ')[0]}</button>
              ))}
            </div>
          </div>
          {filteredProgrammes.length === 0 ? (
            <div className="immo-empty">
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏗️</div>
              <div style={{ fontWeight: 600 }}>Aucun programme</div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Synchronisez les programmes depuis le catalogue</div>
              <button className="btn-immo-secondary" style={{ marginTop: 12 }} onClick={() => setActiveTab('immo-programmes')}>Voir le catalogue</button>
            </div>
          ) : (
            <div className="immo-programmes-grid">
              {filteredProgrammes.slice(0, 6).map(prog => {
                const pc = PROMOTEUR_COLORS[prog.promoteur_slug] || PROMOTEUR_COLORS.greencity
                const sc = STATUT_COLORS[prog.statut] || STATUT_COLORS.disponible
                return (
                  <div key={prog.id} className="immo-programme-card">
                    <div className="immo-programme-card-top">
                      {prog.statut && prog.statut !== 'disponible' && (
                        <span className="immo-badge" style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                          {STATUT_LABELS[prog.statut] || prog.statut}
                        </span>
                      )}
                      <span className="immo-badge" style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}>
                        {prog.promoteur_slug === 'greencity' ? 'GreenCity' : prog.promoteur_slug === 'nexity' ? 'Nexity' : 'LP Promotion'}
                      </span>
                    </div>
                    <div className="immo-programme-name">{prog.nom}</div>
                    <div className="immo-programme-ville">{prog.ville}{prog.code_postal ? ` · ${prog.code_postal}` : ''}</div>
                    {prog.typologies?.length > 0 && (
                      <div className="immo-programme-typos">
                        {prog.typologies.map(t => <span key={t} className="immo-typo-badge">{t}</span>)}
                      </div>
                    )}
                    {prog.dispositifs?.length > 0 && (
                      <div className="immo-programme-dispositifs">
                        {prog.dispositifs.map(d => {
                          const dc = DISPOSITIF_COLORS[d] || { bg: 'rgba(107,114,128,0.2)', text: '#9ca3af' }
                          return <span key={d} className="immo-dispositif-badge" style={{ background: dc.bg, color: dc.text }}>{d}</span>
                        })}
                      </div>
                    )}
                    {prog.prix_a_partir_de && (
                      <div className="immo-programme-prix">À partir de {euro(prog.prix_a_partir_de)}</div>
                    )}
                    <div className="immo-programme-actions">
                      <button className="btn-immo-small" onClick={() => setActiveTab('immo-dossiers')}>+ Dossier</button>
                      {prog.url_fiche && (
                        <a href={prog.url_fiche} target="_blank" rel="noopener noreferrer" className="btn-immo-small-ghost">Voir ↗</a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {filteredProgrammes.length > 6 && (
            <button className="btn-immo-link" onClick={() => setActiveTab('immo-programmes')}>
              Voir les {filteredProgrammes.length} programmes →
            </button>
          )}
        </div>

        {/* Right: Pipeline rapide */}
        <div className="immo-section immo-pipeline-section">
          <div className="immo-section-header">
            <div className="immo-section-title">Pipeline rapide</div>
          </div>
          {recentDossiers.length === 0 ? (
            <div className="immo-empty">
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <div style={{ fontWeight: 600 }}>Aucun dossier actif</div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Créez votre premier dossier immobilier</div>
            </div>
          ) : (
            <div className="immo-pipeline-list">
              {recentDossiers.map(dossier => {
                const color = PIPELINE_COLORS[dossier.statut_pipeline] || '#6b7280'
                return (
                  <div key={dossier.id} className="immo-pipeline-item" onClick={() => setActiveTab('immo-dossiers')}>
                    <div className="immo-pipeline-avatar">
                      {(dossier.client_nom || '?').split(' ').slice(0, 2).map(n => n[0] || '').join('').toUpperCase()}
                    </div>
                    <div className="immo-pipeline-info">
                      <div className="immo-pipeline-name">{dossier.client_nom || 'Client'}</div>
                      <div className="immo-pipeline-programme">{dossier.notes?.split('\n')[0] || 'Programme'}</div>
                    </div>
                    <span className="immo-pipeline-badge" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                      {PIPELINE_LABELS[dossier.statut_pipeline] || dossier.statut_pipeline}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <button className="btn-immo-link" onClick={() => setActiveTab('immo-pipeline')}>
            Voir tout le pipeline →
          </button>
        </div>
      </div>
    </div>
  )
}
