// Texte à compléter : un champ de saisie, Entrée vérifie (le formulaire de
// la session soumet). valeur = le texte tapé. Le serveur compare après
// normalisation (minuscules, sans accents) ; resultat.bonne_reponse = les
// textes acceptés.

import { useId } from 'react'
import Phrase from './Phrase'

export default function TrouSaisie({ payload, valeur, onChange, verrouille, resultat }) {
  const id = useId()
  const p = payload || {}
  const texte = valeur == null ? '' : String(valeur)
  const etat = resultat ? (resultat.correcte ? 'juste' : 'faux') : (texte.trim() ? 'rempli' : '')
  return (
    <div className="ae-exo">
      <Phrase phrase={p.phrase} contenu={texte.trim()} etat={etat} />
      <label htmlFor={`${id}-saisie`} className="ae-saisie-label">Ta réponse</label>
      <input
        id={`${id}-saisie`}
        type="text"
        className={`form-input ae-saisie${etat === 'juste' ? ' is-juste' : etat === 'faux' ? ' is-faux' : ''}`}
        value={texte}
        placeholder={p.aide || ''}
        disabled={!!verrouille}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        onChange={(e) => onChange?.(e.target.value)}
      />
      {p.aide && <p className="ae-aide">{p.aide}</p>}
    </div>
  )
}
