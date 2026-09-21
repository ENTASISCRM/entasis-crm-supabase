// ═══════════════════════════════════════════════════════════════════════════
// Remettre dans l’ordre, sans glisser déposer : on tape les éléments dans
// l’ordre voulu, ils s’empilent en haut, numérotés ; un bouton retire le
// dernier posé. valeur = les indices présentés dans l’ordre choisi.
// Après correction, chaque position de la pile est juste ou fausse par
// rapport à resultat.bonne_reponse (les indices présentés dans le bon ordre).
// ═══════════════════════════════════════════════════════════════════════════

const liste = (v) => (Array.isArray(v) ? v : [])

export default function Ordre({ payload, valeur, onChange, verrouille, resultat }) {
  const p = payload || {}
  const elements = liste(p.elements)
  const choisis = liste(valeur)
  const restants = elements.map((_, i) => i).filter((i) => !choisis.includes(i))
  const bonne = resultat ? liste(resultat.bonne_reponse) : null

  return (
    <div className="ae-exo">
      <p className="ae-enonce">{p.enonce}</p>
      <ol className="ae-pile" aria-label="Ton ordre">
        {choisis.map((i, k) => {
          const etat = bonne ? (bonne[k] === i ? 'juste' : 'faux') : ''
          return (
            <li key={i} className={`ae-pile-item${etat ? ` is-${etat}` : ''}`}>
              <span className="ae-pile-numero">{k + 1}</span>
              <span className="ae-pile-texte">{elements[i]}</span>
              {etat && <span className="ae-choix-marque" role="img" aria-label={etat}>{etat === 'juste' ? '✓' : '✕'}</span>}
            </li>
          )
        })}
      </ol>
      {choisis.length === 0 && <p className="ae-aide">Tape les éléments dans l’ordre voulu, ils s’empilent ici.</p>}
      {!verrouille && (
        <div className="ae-pile-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={choisis.length === 0} onClick={() => onChange?.(choisis.slice(0, -1))}>
            Retirer le dernier
          </button>
        </div>
      )}
      {restants.length > 0 && (
        <div className="ae-tuiles" aria-label="Éléments à placer">
          {restants.map((i) => (
            <button key={i} type="button" className="ae-tuile" disabled={!!verrouille} onClick={() => onChange?.([...choisis, i])}>
              {elements[i]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
