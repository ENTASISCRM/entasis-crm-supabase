// ═══════════════════════════════════════════════════════════════════════════
// La liste de choix partagée par Choix, Multi et TrouChoix : des radios ou
// des cases natives, une par choix présenté, dans l’ordre reçu du serveur.
// Après correction, chaque ligne dit ce qu’elle est : ta bonne réponse
// (« ✓ »), ta mauvaise réponse (« ✕ ») ou la réponse attendue que tu n’as
// pas cochée. Aucune bonne réponse n’est connue avant `resultat`.
// ═══════════════════════════════════════════════════════════════════════════

import { useId } from 'react'
import { etatChoix } from '../../../lib/academy/exercices'

const MARQUES = { juste: '✓', faux: '✕', attendu: 'la bonne réponse' }

/**
 * choix : les textes présentés ; multiple : cases plutôt que radios ;
 * estCoche(j), estBonne(j) ; onBascule(j) ; corrige : vrai après correction.
 */
export default function ListeChoix({ choix, multiple = false, estCoche, estBonne, onBascule, verrouille, corrige }) {
  const id = useId()
  const liste = Array.isArray(choix) ? choix : []
  return (
    <div className="ae-choix-liste">
      {liste.map((texte, j) => {
        const coche = !!estCoche?.(j)
        const etat = etatChoix(coche, !!estBonne?.(j), corrige)
        const marque = MARQUES[etat]
        return (
          <label key={j} className={`ae-choix${etat ? ` is-${etat}` : ''}`}>
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={`${id}-choix`}
              value={j}
              checked={coche}
              disabled={!!verrouille}
              onChange={() => onBascule?.(j)}
            />
            <span className="ae-choix-texte">{texte}</span>
            {marque && (etat === 'attendu'
              ? <span className="ae-choix-marque">{marque}</span>
              : <span className="ae-choix-marque" role="img" aria-label={etat}>{marque}</span>)}
          </label>
        )
      })}
    </div>
  )
}
