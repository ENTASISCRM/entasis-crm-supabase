// ═══════════════════════════════════════════════════════════════════════════
// Une phrase à trou : le « ___ » du payload devient un trou visible qui
// affiche ce que le collaborateur a choisi ou tapé, ou des points de
// suspension tant qu’il n’a rien mis. Partagé par TrouChoix et TrouSaisie.
// ═══════════════════════════════════════════════════════════════════════════

const TROU = /_{3,}/

/** phrase : le texte avec ___ ; contenu : ce qui remplit le trou ; etat : '', 'rempli', 'juste', 'faux'. */
export default function Phrase({ phrase, contenu, etat = '' }) {
  const texte = String(phrase || '')
  const m = TROU.exec(texte)
  const rempli = contenu != null && String(contenu) !== ''
  const trou = (
    <span className={`ae-trou${rempli ? ' is-rempli' : ''}${etat ? ` is-${etat}` : ''}`}>
      {rempli ? String(contenu) : '…'}
    </span>
  )
  if (!m) return <p className="ae-phrase">{texte} {trou}</p>
  return (
    <p className="ae-phrase">
      {texte.slice(0, m.index)}
      {trou}
      {texte.slice(m.index + m[0].length)}
    </p>
  )
}
