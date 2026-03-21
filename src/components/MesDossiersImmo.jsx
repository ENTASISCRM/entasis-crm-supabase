import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { PROMPT_IMMOBILIER } from '../config/promptImmo'

const euro = (v) => Number(v||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0})

const PIPELINE_LABELS = {
  prospect: 'Prospect',
  presente: 'Présenté',
  reservation: 'Réservation',
  financement: 'Financement',
  acte: 'Acte',
  livraison: 'Livraison',
  honoraires: 'Honoraires',
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

const DISPOSITIFS = ['LLI', 'LMNP', 'PTZ', 'Bailleur Privé', 'RP']
const OBJECTIFS = ['Investissement locatif', 'Résidence principale']

export default function MesDossiersImmo({ profile, teamProfiles, setActiveTab }) {
  const [dossiers, setDossiers] = useState([])
  const [programmes, setProgrammes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('tous')
  const [showModal, setShowModal] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [editingDossier, setEditingDossier] = useState(null)

  const emptyDossier = () => ({
    client_nom: '',
    client_email: '',
    client_telephone: '',
    programme_id: '',
    dispositif_retenu: 'LLI',
    objectif: 'investissement',
    budget_total: '',
    apport: '',
    conseiller_id: profile?.id || '',
    notes: '',
    statut_pipeline: 'prospect',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [dosRes, progRes] = await Promise.all([
      supabase.from('dossiers_immo').select('*').order('created_at', { ascending: false }),
      supabase.from('programmes').select('id, nom, ville').order('nom', { ascending: true }),
    ])
    setDossiers(dosRes.data || [])
    setProgrammes(progRes.data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const mine = profile?.role === 'manager' ? dossiers : dossiers.filter(d => d.conseiller_id === profile?.id)
    if (filter === 'tous') return mine
    if (filter === 'en_cours') return mine.filter(d => !['honoraires', 'livraison'].includes(d.statut_pipeline))
    if (filter === 'signes') return mine.filter(d => ['acte', 'livraison', 'honoraires'].includes(d.statut_pipeline))
    if (filter === 'livres') return mine.filter(d => d.statut_pipeline === 'livraison' || d.statut_pipeline === 'honoraires')
    return mine
  }, [dossiers, filter, profile])

  async function saveDossier(dossier) {
    const payload = {
      ...dossier,
      budget_total: dossier.budget_total ? Number(dossier.budget_total) : null,
      apport: dossier.apport ? Number(dossier.apport) : null,
      programme_id: dossier.programme_id || null,
      conseiller_id: dossier.conseiller_id || profile?.id,
    }

    let result
    if (dossier.id) {
      result = await supabase.from('dossiers_immo').update(payload).eq('id', dossier.id)
    } else {
      result = await supabase.from('dossiers_immo').insert(payload)
    }

    if (result.error) {
      toast.error('Erreur : ' + result.error.message)
      return
    }
    toast.success(dossier.id ? 'Dossier mis à jour' : 'Dossier créé')
    setShowModal(false)
    setEditingDossier(null)
    await loadData()
  }

  function openCreate() {
    setEditingDossier(emptyDossier())
    setShowModal(true)
  }

  function openEdit(dossier) {
    setEditingDossier({ ...dossier })
    setShowModal(true)
  }

  async function askAI(message) {
    setAiLoading(true)
    setAiResponse('')
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: PROMPT_IMMOBILIER,
          messages: [{ role: 'user', content: message }]
        })
      })
      const data = await response.json()
      setAiResponse(data.content?.[0]?.text || 'Pas de réponse')
    } catch (err) {
      setAiResponse('Erreur : ' + err.message)
    }
    setAiLoading(false)
  }

  const conseillerName = (id) => {
    const p = teamProfiles?.find(t => t.id === id)
    return p?.advisor_code || p?.full_name || '—'
  }

  const programmeName = (id) => {
    const p = programmes.find(pr => pr.id === id)
    return p ? `${p.nom} · ${p.ville || ''}` : '—'
  }

  if (loading) {
    return (
      <div className="immo-loading">
        <div className="loading-spinner" />
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 12 }}>Chargement des dossiers...</div>
      </div>
    )
  }

  return (
    <div className="immo-dossiers">
      {/* Toolbar */}
      <div className="immo-dossiers-toolbar">
        <div className="immo-pills">
          {[['tous','Tous'],['en_cours','En cours'],['signes','Signés'],['livres','Livrés']].map(([key, label]) => (
            <button key={key} className={`immo-pill${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-immo-ai" onClick={() => setShowAI(!showAI)} title="Assistant IA">✨</button>
          <button className="btn-immo-primary" onClick={openCreate}>+ Nouveau dossier</button>
        </div>
      </div>

      {/* AI Panel */}
      {showAI && (
        <div className="immo-ai-panel">
          <div className="immo-ai-header">
            <span>Assistant IA Immobilier</span>
            <button className="immo-ai-close" onClick={() => setShowAI(false)}>✕</button>
          </div>
          <div className="immo-ai-shortcuts">
            <button className="immo-ai-shortcut" onClick={() => askAI('Aide-moi à qualifier un client investisseur immobilier')}>Qualifier</button>
            <button className="immo-ai-shortcut" onClick={() => askAI('Compare les dispositifs LLI, LMNP et PTZ')}>Recommander dispositif</button>
            <button className="immo-ai-shortcut" onClick={() => askAI('Analyse les critères pour choisir un programme neuf')}>Analyser programme</button>
            <button className="immo-ai-shortcut" onClick={() => askAI('Rédige un email de proposition immobilier neuf')}>Rédiger email</button>
          </div>
          <div className="immo-ai-input-wrap">
            <input className="immo-ai-input" placeholder="Décrivez le profil de votre client..." value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && aiInput.trim()) { askAI(aiInput); setAiInput('') } }} />
            <button className="btn-immo-small" onClick={() => { if (aiInput.trim()) { askAI(aiInput); setAiInput('') } }} disabled={aiLoading}>
              {aiLoading ? '...' : 'Envoyer'}
            </button>
          </div>
          {aiResponse && (
            <div className="immo-ai-response">
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{aiResponse}</pre>
            </div>
          )}
        </div>
      )}

      {/* Dossiers list */}
      {filtered.length === 0 ? (
        <div className="immo-empty" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Aucun dossier</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>Créez votre premier dossier immobilier neuf</div>
          <button className="btn-immo-primary" style={{ marginTop: 16 }} onClick={openCreate}>+ Nouveau dossier</button>
        </div>
      ) : (
        <div className="immo-dossiers-list">
          {filtered.map(dossier => {
            const color = PIPELINE_COLORS[dossier.statut_pipeline] || '#6b7280'
            const dateKey = dossier.date_reservation || dossier.date_financement || dossier.date_acte || dossier.created_at
            const dateStr = dateKey ? new Date(dateKey).toLocaleDateString('fr-FR') : '—'
            return (
              <div key={dossier.id} className="immo-dossier-row">
                <div className="immo-dossier-row-main">
                  <div className="immo-dossier-client">
                    <div className="immo-dossier-client-name">{dossier.client_nom || 'Client'}</div>
                    <div className="immo-dossier-client-sub">Conseiller : {conseillerName(dossier.conseiller_id)}</div>
                  </div>
                  <div className="immo-dossier-programme">
                    <div>{dossier.programme_id ? programmeName(dossier.programme_id) : '—'}</div>
                    <div className="immo-dossier-date">
                      <span className="immo-pipeline-badge" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                        {PIPELINE_LABELS[dossier.statut_pipeline] || dossier.statut_pipeline}
                      </span>
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>{dateStr}</span>
                    </div>
                  </div>
                  <div className="immo-dossier-amount">
                    {dossier.prix_lot ? euro(dossier.prix_lot) : dossier.budget_total ? euro(dossier.budget_total) : '—'}
                  </div>
                </div>
                <div className="immo-dossier-row-actions">
                  <button className="btn-immo-small-ghost" onClick={() => openEdit(dossier)}>Modifier</button>
                  <button className="btn-immo-small-ghost" onClick={() => setActiveTab('immo-pipeline')}>Voir pipeline</button>
                  {dossier.url_espace_partenaire && (
                    <a href={dossier.url_espace_partenaire} target="_blank" rel="noopener noreferrer" className="btn-immo-small-ghost">↗ Espace partenaire</a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal create/edit */}
      {showModal && editingDossier && (
        <DossierModal
          dossier={editingDossier}
          programmes={programmes}
          teamProfiles={teamProfiles}
          profile={profile}
          onClose={() => { setShowModal(false); setEditingDossier(null) }}
          onSave={saveDossier}
        />
      )}
    </div>
  )
}

function DossierModal({ dossier, programmes, teamProfiles, profile, onClose, onSave }) {
  const [form, setForm] = useState({ ...dossier })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.client_nom?.trim()) {
      toast.error('Nom du client requis')
      return
    }
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="immo-modal-overlay" onClick={onClose}>
      <div className="immo-modal" onClick={e => e.stopPropagation()}>
        <div className="immo-modal-header">
          <div className="immo-modal-title">{dossier.id ? 'Modifier le dossier' : 'Nouveau dossier immobilier'}</div>
          <button className="immo-ai-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="immo-modal-form">
          <div className="immo-form-grid">
            <div className="immo-form-group">
              <label>Nom du client *</label>
              <input value={form.client_nom || ''} onChange={e => set('client_nom', e.target.value)} placeholder="Jean Dupont" required />
            </div>
            <div className="immo-form-group">
              <label>Email</label>
              <input type="email" value={form.client_email || ''} onChange={e => set('client_email', e.target.value)} placeholder="jean@email.com" />
            </div>
            <div className="immo-form-group">
              <label>Téléphone</label>
              <input value={form.client_telephone || ''} onChange={e => set('client_telephone', e.target.value)} placeholder="06 12 34 56 78" />
            </div>
            <div className="immo-form-group">
              <label>Programme</label>
              <select value={form.programme_id || ''} onChange={e => set('programme_id', e.target.value)}>
                <option value="">— Sélectionner —</option>
                {programmes.map(p => <option key={p.id} value={p.id}>{p.nom} · {p.ville || ''}</option>)}
              </select>
            </div>
            <div className="immo-form-group">
              <label>Dispositif fiscal</label>
              <select value={form.dispositif_retenu || ''} onChange={e => set('dispositif_retenu', e.target.value)}>
                {DISPOSITIFS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="immo-form-group">
              <label>Objectif</label>
              <select value={form.objectif || ''} onChange={e => set('objectif', e.target.value)}>
                {OBJECTIFS.map(o => <option key={o} value={o.toLowerCase().replace(/ /g, '_')}>{o}</option>)}
              </select>
            </div>
            <div className="immo-form-group">
              <label>Budget total (€)</label>
              <input type="number" value={form.budget_total || ''} onChange={e => set('budget_total', e.target.value)} placeholder="300000" />
            </div>
            <div className="immo-form-group">
              <label>Apport (€)</label>
              <input type="number" value={form.apport || ''} onChange={e => set('apport', e.target.value)} placeholder="50000" />
            </div>
            <div className="immo-form-group">
              <label>Conseiller</label>
              <select value={form.conseiller_id || ''} onChange={e => set('conseiller_id', e.target.value)}>
                <option value={profile?.id}>{profile?.full_name || profile?.advisor_code || 'Moi'}</option>
                {(teamProfiles || []).filter(t => t.id !== profile?.id && t.is_active).map(t => (
                  <option key={t.id} value={t.id}>{t.full_name || t.advisor_code}</option>
                ))}
              </select>
            </div>
            <div className="immo-form-group">
              <label>Statut pipeline</label>
              <select value={form.statut_pipeline || 'prospect'} onChange={e => set('statut_pipeline', e.target.value)}>
                {Object.entries(PIPELINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="immo-form-group" style={{ marginTop: 12 }}>
            <label>Notes</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Notes libres..." />
          </div>
          <div className="immo-modal-footer">
            <button type="button" className="btn-immo-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-immo-primary" disabled={saving}>
              {saving ? 'Enregistrement...' : dossier.id ? 'Mettre à jour' : 'Créer le dossier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
