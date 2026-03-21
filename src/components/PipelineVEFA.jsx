import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const euro = (v) => Number(v||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0})

const COLUMNS = [
  { id: 'prospect', label: 'Prospect', color: '#6b7280' },
  { id: 'presente', label: 'Présenté', color: '#93c5fd' },
  { id: 'reservation', label: 'Réservation', color: '#C9A84C' },
  { id: 'financement', label: 'Financement', color: '#f97316' },
  { id: 'acte', label: 'Acte', color: '#22c55e' },
  { id: 'livraison', label: 'Livraison', color: '#15803d' },
  { id: 'honoraires', label: 'Honoraires', color: '#10b981' },
]

function KanbanCard({ dossier, conseillerName }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dossier.id,
    data: { dossier },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const dateKey = dossier.date_reservation || dossier.date_acte || dossier.created_at
  const dateStr = dateKey ? new Date(dateKey).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="immo-kanban-card">
      <div className="immo-kanban-card-name">{dossier.client_nom || 'Client'}</div>
      <div className="immo-kanban-card-programme">{dossier.notes?.split('\n')[0]?.slice(0, 30) || '—'}</div>
      {dossier.prix_lot && <div className="immo-kanban-card-prix">{euro(dossier.prix_lot)}</div>}
      <div className="immo-kanban-card-footer">
        <span>{conseillerName}</span>
        <span>{dateStr}</span>
      </div>
    </div>
  )
}

export default function PipelineVEFA({ profile, teamProfiles }) {
  const [dossiers, setDossiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterConseiller, setFilterConseiller] = useState(profile?.role === 'manager' ? 'tous' : profile?.id || 'tous')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  useEffect(() => {
    loadDossiers()
  }, [])

  async function loadDossiers() {
    setLoading(true)
    const { data } = await supabase.from('dossiers_immo').select('*').order('created_at', { ascending: false })
    setDossiers(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (filterConseiller === 'tous') return dossiers
    return dossiers.filter(d => d.conseiller_id === filterConseiller)
  }, [dossiers, filterConseiller])

  const columnDossiers = useMemo(() => {
    const map = {}
    COLUMNS.forEach(col => { map[col.id] = filtered.filter(d => d.statut_pipeline === col.id) })
    return map
  }, [filtered])

  const conseillerName = (id) => {
    const p = teamProfiles?.find(t => t.id === id)
    return p?.advisor_code || p?.full_name?.split(' ').map(n => n[0]).join('') || '—'
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return

    const dossierId = active.id
    const dossier = dossiers.find(d => d.id === dossierId)
    if (!dossier) return

    // Find target column - could be dropping on a column or on another card
    let targetColumn = null

    // Check if dropping on a column droppable
    const overCol = COLUMNS.find(c => c.id === over.id)
    if (overCol) {
      targetColumn = overCol.id
    } else {
      // Dropping on another card - find which column that card is in
      const overDossier = dossiers.find(d => d.id === over.id)
      if (overDossier) {
        targetColumn = overDossier.statut_pipeline
      }
    }

    if (!targetColumn || targetColumn === dossier.statut_pipeline) return

    // Optimistic update
    setDossiers(prev => prev.map(d => d.id === dossierId ? { ...d, statut_pipeline: targetColumn } : d))

    const { error } = await supabase
      .from('dossiers_immo')
      .update({ statut_pipeline: targetColumn, updated_at: new Date().toISOString() })
      .eq('id', dossierId)

    if (error) {
      toast.error('Erreur de mise à jour')
      await loadDossiers() // revert
    } else {
      toast.success(`Dossier déplacé vers ${COLUMNS.find(c => c.id === targetColumn)?.label}`)
    }
  }

  if (loading) {
    return (
      <div className="immo-loading">
        <div className="loading-spinner" />
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 12 }}>Chargement du pipeline...</div>
      </div>
    )
  }

  return (
    <div className="immo-pipeline-vefa">
      {/* Filter bar */}
      <div className="immo-pipeline-toolbar">
        <div className="immo-section-title">Pipeline VEFA</div>
        <select className="immo-filter-select" value={filterConseiller} onChange={e => setFilterConseiller(e.target.value)}>
          <option value="tous">Tous les conseillers</option>
          {(teamProfiles || []).filter(t => t.is_active).map(t => (
            <option key={t.id} value={t.id}>{t.full_name || t.advisor_code}</option>
          ))}
        </select>
      </div>

      {/* Kanban */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="immo-kanban">
          {COLUMNS.map(col => {
            const colDossiers = columnDossiers[col.id] || []
            const totalMontant = colDossiers.reduce((s, d) => s + (d.prix_lot || 0), 0)
            return (
              <DroppableColumn key={col.id} col={col} count={colDossiers.length} totalMontant={totalMontant}>
                <SortableContext items={colDossiers.map(d => d.id)} strategy={verticalListSortingStrategy}>
                  {colDossiers.map(d => (
                    <KanbanCard key={d.id} dossier={d} conseillerName={conseillerName(d.conseiller_id)} />
                  ))}
                </SortableContext>
                {colDossiers.length === 0 && (
                  <div className="immo-kanban-empty">Aucun dossier</div>
                )}
              </DroppableColumn>
            )
          })}
        </div>
      </DndContext>
    </div>
  )
}

function DroppableColumn({ col, count, totalMontant, children }) {
  const { setNodeRef } = useSortable({ id: col.id, data: { type: 'column' } })

  return (
    <div ref={setNodeRef} className="immo-kanban-column">
      <div className="immo-kanban-column-header" style={{ borderTopColor: col.color }}>
        <div className="immo-kanban-column-title">
          {col.label}
          <span className="immo-kanban-count">{count}</span>
        </div>
        {totalMontant > 0 && (
          <div className="immo-kanban-column-total">{euro(totalMontant)}</div>
        )}
      </div>
      <div className="immo-kanban-column-body">
        {children}
      </div>
    </div>
  )
}
