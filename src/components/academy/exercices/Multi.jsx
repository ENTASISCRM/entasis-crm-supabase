// Choix multiples : des cases natives. valeur = les indices présentés
// cochés, dans l’ordre où ils ont été cochés. resultat.bonne_reponse = les
// indices attendus.

import ListeChoix from './ListeChoix'

export default function Multi({ payload, valeur, onChange, verrouille, resultat }) {
  const p = payload || {}
  const coches = Array.isArray(valeur) ? valeur : []
  const bonnes = resultat && Array.isArray(resultat.bonne_reponse) ? resultat.bonne_reponse : []
  const basculer = (j) => onChange?.(coches.includes(j) ? coches.filter((k) => k !== j) : [...coches, j])
  return (
    <fieldset className="ae-exo">
      <legend className="ae-enonce">{p.enonce}</legend>
      <p className="ae-aide">Plusieurs réponses possibles.</p>
      <ListeChoix
        choix={p.choix}
        multiple
        estCoche={(j) => coches.includes(j)}
        estBonne={(j) => bonnes.includes(j)}
        onBascule={basculer}
        verrouille={verrouille}
        corrige={!!resultat}
      />
    </fieldset>
  )
}
