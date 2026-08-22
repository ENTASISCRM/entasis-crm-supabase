/* ─────────────────────────────────────────────────────────────────────────────
   KANBAN — primitives drag & drop partagées (Série B / B5).

   Trois briques composables sur dnd-kit, pour que tous les kanbans de l'app
   (pipeline commercial, pipeline VEFA…) aient le même geste :

     <KanbanDnd onMove={({itemData, overId, overData}) => …}>
       <KanbanColumn id="En cours" className="pipeline-col">
         <KanbanCard id={deal.id} data={{ type:'card', colId:'En cours', deal }}>
           …contenu de la carte…
         </KanbanCard>
       </KanbanColumn>
     </KanbanDnd>

   - Le seuil d'activation (8 px) préserve le clic simple : ouvrir une carte
     reste un clic, la déplacer demande un vrai glisser.
   - Chaque carte déclare `colId` dans son data : la résolution de la colonne
     cible (lâcher sur une colonne OU sur une carte) est triviale côté appelant.
   - Pas de tri intra-colonne : l'ordre vient des données, comme partout.
───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useRef } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, closestCorners } from '@dnd-kit/core'

export function KanbanDnd({ onMove, children }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  function handleDragEnd(event) {
    const { active, over } = event
    if (!active || !over) return
    onMove({
      itemId: active.id,
      itemData: active.data?.current,
      overId: over.id,
      overData: over.data?.current,
    })
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  )
}

// Résout la colonne cible d'un drop : directement la colonne survolée, ou la
// colonne de la carte survolée.
export function targetColumnOf({ overId, overData }) {
  if (overData?.type === 'column') return overId
  return overData?.colId ?? null
}

export function KanbanColumn({ id, className = '', children, ...rest }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'column' } })
  return (
    <div ref={setNodeRef} className={`${className}${isOver ? ' kanban-col--over' : ''}`} {...rest}>
      {children}
    </div>
  )
}

export function KanbanCard({ id, data, className, style, onClick, children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data })
  // Après un drop, le navigateur émet encore un click sur la carte : sans ce
  // garde-fou, chaque glisser-déposer ouvrait aussi la modale d'édition.
  // Le drapeau expire de lui-même : si aucun click ne suit le drop (pointeur
  // relâché hors de la carte), le clic suivant ne doit pas être avalé.
  const wasDragged = useRef(false)
  if (isDragging) wasDragged.current = true
  useEffect(() => {
    if (isDragging || !wasDragged.current) return
    const t = setTimeout(() => { wasDragged.current = false }, 180)
    return () => clearTimeout(t)
  }, [isDragging])
  // Phase capture : couvre aussi un drag initié sur un lien tel:/mailto: ou
  // un bouton interne de la carte — le click post-drop est neutralisé avant
  // d'atteindre sa cible (sinon le drop composait le numéro / ouvrait le mail).
  const handleClickCapture = (e) => {
    if (!wasDragged.current) return
    wasDragged.current = false
    e.stopPropagation()
    e.preventDefault()
  }
  const st = {
    ...style,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative',
    cursor: 'grab',
  }
  return (
    <div ref={setNodeRef} className={className} style={st} onClickCapture={handleClickCapture} onClick={onClick} {...attributes} {...listeners}>
      {children}
    </div>
  )
}
