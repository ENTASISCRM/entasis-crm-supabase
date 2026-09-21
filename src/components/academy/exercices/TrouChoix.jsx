// Texte à trou avec des choix : la phrase montre le choix coché dans le
// trou, les radios sont ceux de Choix. valeur = l indice présenté.

import ListeChoix from './ListeChoix'
import Phrase from './Phrase'

export default function TrouChoix({ payload, valeur, onChange, verrouille, resultat }) {
  const p = payload || {}
  const choix = Array.isArray(p.choix) ? p.choix : []
  const bonne = resultat ? resultat.bonne_reponse : null
  const etat = resultat ? (resultat.correcte ? 'juste' : 'faux') : (Number.isInteger(valeur) ? 'rempli' : '')
  return (
    <fieldset className="ae-exo">
      <legend className="ae-enonce ae-sr">Complète la phrase</legend>
      <Phrase phrase={p.phrase} contenu={Number.isInteger(valeur) ? choix[valeur] : null} etat={etat} />
      <ListeChoix
        choix={choix}
        estCoche={(j) => valeur === j}
        estBonne={(j) => j === bonne}
        onBascule={(j) => onChange?.(j)}
        verrouille={verrouille}
        corrige={!!resultat}
      />
    </fieldset>
  )
}
