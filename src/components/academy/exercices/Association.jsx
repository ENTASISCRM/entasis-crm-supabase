// ═══════════════════════════════════════════════════════════════════════════
// Associer : on sélectionne une case à gauche puis une à droite, la paire se
// pose au dessus des colonnes et disparaît des colonnes ; un bouton la
// défait. valeur = [[gauche, droite présentée], ...]. La colonne de droite
// arrive mélangée par le serveur et reste dans cet ordre. Après correction,
// chaque paire est juste ou fausse par rapport à resultat.bonne_reponse.
// La sélection en attente (la case de gauche choisie, pas encore appariée)
// est un état local : elle ne fait pas partie de la réponse.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'

const liste = (v) => (Array.isArray(v) ? v : [])

export default function Association({ payload, valeur, onChange, verrouille, resultat }) {
  const [attente, setAttente] = useState(null)
  const p = payload || {}
  const gauche = liste(p.gauche)
  const droite = liste(p.droite)
  const paires = liste(valeur).filter((paire) => Array.isArray(paire) && paire.length === 2)
  const gauchesPrises = new Set(paires.map((paire) => paire[0]))
  const droitesPrises = new Set(paires.map((paire) => paire[1]))
  const attendu = resultat
    ? new Map(liste(resultat.bonne_reponse).filter((paire) => Array.isArray(paire)).map(([g, d]) => [g, d]))
    : null

  const poser = (j) => {
    if (attente == null) return
    onChange?.([...paires, [attente, j]])
    setAttente(null)
  }
  const defaire = (g) => {
    onChange?.(paires.filter((paire) => paire[0] !== g))
    setAttente(null)
  }

  return (
    <div className="ae-exo">
      <p className="ae-enonce">{p.enonce}</p>
      {paires.length > 0 && (
        <ul className="ae-paires" aria-label="Tes paires">
          {paires.map(([g, d]) => {
            const etat = attendu ? (attendu.get(g) === d ? 'juste' : 'faux') : ''
            return (
              <li key={g} className={`ae-paire${etat ? ` is-${etat}` : ''}`}>
                <span className="ae-paire-gauche">{gauche[g]}</span>
                <span className="ae-paire-sep" aria-hidden="true">:</span>
                <span className="ae-paire-droite">{droite[d]}</span>
                {etat && <span className="ae-choix-marque" role="img" aria-label={etat}>{etat === 'juste' ? '✓' : '✕'}</span>}
                {!verrouille && (
                  <button type="button" className="btn btn-ghost btn-sm ae-paire-defaire" aria-label={`Défaire la paire ${gauche[g]}`} onClick={() => defaire(g)}>
                    ✕
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {paires.length === 0 && <p className="ae-aide">Choisis une case à gauche, puis sa correspondance à droite.</p>}
      {(gauchesPrises.size < gauche.length || droitesPrises.size < droite.length) && (
        <div className="ae-colonnes">
          <div className="ae-colonne" aria-label="Colonne de gauche">
            {gauche.map((texte, g) => gauchesPrises.has(g) ? null : (
              <button key={g} type="button" className={`ae-tuile${attente === g ? ' is-attente' : ''}`} aria-pressed={attente === g}
                disabled={!!verrouille} onClick={() => setAttente(attente === g ? null : g)}>
                {texte}
              </button>
            ))}
          </div>
          <div className="ae-colonne" aria-label="Colonne de droite">
            {droite.map((texte, d) => droitesPrises.has(d) ? null : (
              <button key={d} type="button" className="ae-tuile" disabled={!!verrouille || attente == null} onClick={() => poser(d)}>
                {texte}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
