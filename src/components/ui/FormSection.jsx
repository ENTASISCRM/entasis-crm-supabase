/* ─────────────────────────────────────────────────────────────────────────────
   FORM SECTION — section de formulaire repliable (Série B / B3).

   Utilisée par la modale dossier pour passer d'un mur de 49 champs à des
   sections ouvertes/repliées selon le contexte :

     <FormSection title="Équipe & suivi" hint="LOUIS · source Parrainage"
                  defaultOpen={false}>
       …champs…
     </FormSection>

   - `hint` : résumé affiché quand la section est repliée (l'utilisateur voit
     ce qu'elle contient sans l'ouvrir).
   - `forceOpen` : verrouille la section ouverte (ex. données de signature
     quand le statut passe à Signé).
   - Les valeurs vivent dans l'état du parent : replier (démonter) une
     section ne perd aucune saisie.
───────────────────────────────────────────────────────────────────────────── */
import { useState } from 'react'

export default function FormSection({ title, hint, defaultOpen = true, forceOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = forceOpen || open
  return (
    <div className={`form-pliable${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="form-pliable-bouton"
        aria-expanded={isOpen}
        onClick={() => setOpen(!isOpen)}
        disabled={forceOpen}
      >
        <span className="form-pliable-titre">{title}</span>
        {hint && !isOpen ? <span className="form-pliable-resume">{hint}</span> : null}
        {!forceOpen && (
          <svg className="form-pliable-chevron" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      {isOpen && <div className="form-pliable-corps">{children}</div>}
    </div>
  )
}
