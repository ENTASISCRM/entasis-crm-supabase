/* ─────────────────────────────────────────────────────────────────────────────
   CONFIRM DIALOG — remplaçant maison de window.confirm() (Série A / A1).

   Usage :
     import { confirmDialog } from './components/ui/confirm'
     if (!(await confirmDialog({
       title: 'Supprimer ce dossier ?',
       message: 'Cette action est irréversible.',
       confirmLabel: 'Supprimer',
       danger: true,
     }))) return

   API promise-based pour rester un drop-in de window.confirm : les call sites
   deviennent async mais gardent leur structure `if (!ok) return`.
   Monté dans un root React dédié hors de l'arbre App — aucun provider requis.
───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

function ConfirmBox({ title, message, confirmLabel, cancelLabel, danger, onResolve }) {
  const primaryRef = useRef(null)
  const cancelRef = useRef(null)

  useEffect(() => {
    // Danger → focus sur Annuler (Entrée ne détruit rien par accident).
    // Sinon → focus sur Confirmer (même réflexe Entrée que window.confirm).
    const el = danger ? cancelRef.current : primaryRef.current
    el?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onResolve(false)
      } else if (e.key === 'Tab') {
        // Mini focus-trap : seulement 2 boutons, on boucle entre les deux.
        e.preventDefault()
        const next = document.activeElement === cancelRef.current ? primaryRef.current : cancelRef.current
        next?.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [danger, onResolve])

  return (
    <div
      className="modal-overlay confirm-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onResolve(false) }}
    >
      <div className="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div id="confirm-title" className="confirm-title">{title}</div>
        {message ? <div className="confirm-message">{message}</div> : null}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={() => onResolve(false)}>
            {cancelLabel}
          </button>
          <button
            ref={primaryRef}
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onResolve(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function confirmDialog(opts = {}) {
  const {
    title = 'Confirmer ?',
    message = '',
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    danger = false,
  } = typeof opts === 'string' ? { title: opts } : opts

  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const previouslyFocused = document.activeElement
    let done = false
    const onResolve = (value) => {
      if (done) return
      done = true
      // unmount différé : jamais de root.unmount() synchrone depuis un
      // event handler React du même root.
      setTimeout(() => {
        root.unmount()
        host.remove()
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus()
      }, 0)
      resolve(value)
    }
    root.render(
      <ConfirmBox
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        danger={danger}
        onResolve={onResolve}
      />
    )
  })
}
