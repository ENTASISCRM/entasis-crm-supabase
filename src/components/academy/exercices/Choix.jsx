// Choix unique : des radios natifs, un par choix présenté. valeur = l indice
// présenté coché, null avant. resultat.bonne_reponse = l indice attendu.

import ListeChoix from './ListeChoix'

export default function Choix({ payload, valeur, onChange, verrouille, resultat }) {
  const p = payload || {}
  const bonne = resultat ? resultat.bonne_reponse : null
  return (
    <fieldset className="ae-exo">
      <legend className="ae-enonce">{p.enonce}</legend>
      <ListeChoix
        choix={p.choix}
        estCoche={(j) => valeur === j}
        estBonne={(j) => j === bonne}
        onBascule={(j) => onChange?.(j)}
        verrouille={verrouille}
        corrige={!!resultat}
      />
    </fieldset>
  )
}
