// ═══════════════════════════════════════════════════════════════════════════
// JAUGE DE COMPLÉTUDE : une barre fine, un pourcentage, et au survol la liste
// des champs qui manquent avec leur poids.
//
// Deux tailles : la jauge de l'en tête de fiche (barre, pourcentage,
// niveau), et la jauge compacte d'une ligne de liste (barre, pourcentage).
// Le calcul vit dans lib/completude.js, testé à part. Les couleurs vont du
// gris à l'or puis au vert : on encourage, on ne gronde pas.
//
// Accessible au clavier : la jauge prend le focus et la bulle s'ouvre comme au
// survol ; l'attribut title porte le même contenu pour les lecteurs d'écran.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import { scoreCompletude, NIVEAUX } from '../../lib/completude'
import './completude.css'

export default function JaugeCompletude({ client, compact = false }) {
  const { score, manquants, niveau } = useMemo(() => scoreCompletude(client), [client])
  const libelleNiveau = NIVEAUX[niveau]?.libelle || ''
  const resume = manquants.length
    ? `Fiche à ${score} %. Il manque : ${manquants.map((m) => m.libelle.toLowerCase()).join(', ')}.`
    : `Fiche complète, ${score} %.`

  return (
    <span
      className={`cpl-jauge${compact ? ' cpl-compact' : ''}`}
      data-niveau={niveau}
      role="img"
      aria-label={resume}
      title={resume}
      tabIndex={0}
    >
      <span className="cpl-barre" aria-hidden="true">
        <span className="cpl-remplissage" style={{ width: `${score}%` }} />
      </span>
      <span className="cpl-pct" aria-hidden="true">{score} %</span>
      {!compact && <span className="cpl-libelle" aria-hidden="true">{libelleNiveau}</span>}
      {manquants.length > 0 && (
        <span className="cpl-bulle" aria-hidden="true">
          <span className="cpl-bulle-titre">Il manque {manquants.length} champ{manquants.length > 1 ? 's' : ''}</span>
          <ul>
            {manquants.map((m) => (
              <li key={m.cle}>
                {m.libelle} <span className="cpl-bulle-poids">· {m.poids} pt{m.poids > 1 ? 's' : ''}</span>
              </li>
            ))}
          </ul>
        </span>
      )}
    </span>
  )
}
