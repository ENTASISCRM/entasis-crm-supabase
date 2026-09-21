// ═══════════════════════════════════════════════════════════════════════════
// Carte mémoire : le recto, un bouton Retourner, puis le verso et deux
// boutons « Je savais » / « À revoir ». C’est le collaborateur qui se juge :
// valeur = { retournee, su }. « Je savais » vaut une bonne réponse, « À
// revoir » une mauvaise (la base ajuste la force de l’item en conséquence).
// ═══════════════════════════════════════════════════════════════════════════

export default function Carte({ payload, valeur, onChange, verrouille, resultat }) {
  const p = payload || {}
  const retournee = valeur?.retournee === true || !!verrouille || !!resultat
  const jugee = typeof valeur?.su === 'boolean'
  return (
    <div className="ae-exo ae-carte-exo">
      <div className={`ae-carte${retournee ? ' is-verso' : ''}`}>
        <div className="ae-carte-kicker">{retournee ? 'Verso' : 'Recto'}</div>
        {retournee && <div className="ae-carte-recto-rappel">{p.recto}</div>}
        <div className="ae-carte-face">{retournee ? p.verso : p.recto}</div>
      </div>
      {!retournee && (
        <div className="ae-carte-actions">
          <button type="button" className="btn btn-primary ae-btn-large" onClick={() => onChange?.({ retournee: true })}>Retourner</button>
        </div>
      )}
      {retournee && !verrouille && !jugee && (
        <div className="ae-carte-actions">
          <span className="ae-carte-question">Tu la savais ?</span>
          <button type="button" className="btn btn-outline ae-btn-large" onClick={() => onChange?.({ retournee: true, su: false })}>À revoir</button>
          <button type="button" className="btn btn-primary ae-btn-large" onClick={() => onChange?.({ retournee: true, su: true })}>Je savais</button>
        </div>
      )}
      {jugee && (
        <p className="ae-aide">{valeur.su ? 'Marquée comme sue.' : 'Marquée à revoir : elle reviendra vite.'}</p>
      )}
    </div>
  )
}
