// Vrai ou faux : deux grands radios. valeur = true ou false, null avant.
// resultat.bonne_reponse = le booléen attendu.

import ListeChoix from './ListeChoix'

const CHOIX = ['Vrai', 'Faux']
const valeurDe = (j) => j === 0

export default function VraiFaux({ payload, valeur, onChange, verrouille, resultat }) {
  const p = payload || {}
  const bonne = resultat ? resultat.bonne_reponse : null
  return (
    <fieldset className="ae-exo ae-vrai-faux">
      <legend className="ae-enonce">{p.enonce}</legend>
      <ListeChoix
        choix={CHOIX}
        estCoche={(j) => typeof valeur === 'boolean' && valeur === valeurDe(j)}
        estBonne={(j) => typeof bonne === 'boolean' && bonne === valeurDe(j)}
        onBascule={(j) => onChange?.(valeurDe(j))}
        verrouille={verrouille}
        corrige={!!resultat}
      />
    </fieldset>
  )
}
