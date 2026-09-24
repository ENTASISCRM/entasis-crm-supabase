// ═══════════════════════════════════════════════════════════════════════════
// PICTO : les pictogrammes des succès et des défis de l’Entasis Academy
//
// La base range une icône comme un MOT CLÉ (colonne academy_succes.icone :
// pas, cible, eclair… ; défis : session, parfaite, justes…), jamais un
// emoji ni une image. Ce composant rend le dessin correspondant en SVG
// inline, 24 × 24, traits de 2 px en currentColor : la couleur suit le
// texte qui l’entoure (jeton de :root), un succès verrouillé se grise par
// CSS sans autre dessin. Un mot clé inconnu tombe sur un pictogramme neutre
// plutôt que sur rien, pour qu’un nouveau succès semé côté base reste
// lisible avant que le client ne le connaisse.
//
// Décoratif par nature (aria-hidden) : le texte voisin porte le sens.
// ═══════════════════════════════════════════════════════════════════════════

const TRAIT = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

// Chaque dessin est une liste d’éléments dans le repère 0 0 24 24.
const DESSINS = {
  // Succès (spec § Succès)
  pas: [
    <path key="a" d="M12.5 21.5c-2.6 0-4.5-2.8-4.5-6.5s1.9-6 4.5-6 4.5 2.3 4.5 6-1.9 6.5-4.5 6.5z" />,
    <circle key="b" cx="6.5" cy="7" r="1" />,
    <circle key="c" cx="9.5" cy="4.5" r="1" />,
    <circle key="d" cx="13.5" cy="3.5" r="1" />,
    <circle key="e" cx="17.5" cy="5" r="1" />,
  ],
  cible: [
    <circle key="a" cx="12" cy="12" r="9" />,
    <circle key="b" cx="12" cy="12" r="5" />,
    <circle key="c" cx="12" cy="12" r="1" />,
  ],
  eclair: [<path key="a" d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />],
  couronne: [
    <path key="a" d="M3 17.5 2 7l5.5 4L12 4l4.5 7L22 7l-1 10.5z" />,
    <path key="b" d="M4 21h16" />,
  ],
  bouclier: [
    <path key="a" d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
    <path key="b" d="M9 12l2 2 4-4" />,
  ],
  etoile: [<path key="a" d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />],
  livres: [
    <rect key="a" x="3" y="4" width="4" height="16" rx="1" />,
    <rect key="b" x="9" y="4" width="4" height="16" rx="1" />,
    <path key="c" d="M15.5 5l4 1-3.5 14-4-1z" />,
  ],
  bibliotheque: [
    <rect key="a" x="3" y="3" width="18" height="18" rx="2" />,
    <path key="b" d="M3 12h18M7 3v9M11 3v9M15 3v9M9 12v9M14 12v9" />,
  ],
  flamme: [<path key="a" d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-6 1-9z" />],
  compteur: [
    <path key="a" d="M5 17a8 8 0 1 1 14 0" />,
    <path key="b" d="M12 17l3.5-4.5" />,
    <circle key="c" cx="12" cy="17" r="1" />,
  ],
  medaille: [
    <circle key="a" cx="12" cy="15" r="5" />,
    <path key="b" d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8" />,
  ],
  soleil: [
    <circle key="a" cx="12" cy="12" r="4" />,
    <path key="b" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
  ],
  lune: [<path key="a" d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />],
  fleche: [
    <path key="a" d="M4 18l6-6 4 4 6-8" />,
    <path key="b" d="M15 8h5v5" />,
  ],
  calendrier: [
    <rect key="a" x="3" y="5" width="18" height="16" rx="2" />,
    <path key="b" d="M3 10h18M8 3v4M16 3v4" />,
    <path key="c" d="M9 15.5l2 2 4-4" />,
  ],
  palier: [<path key="a" d="M3 20h5v-5h5v-5h5V5h3" />],
  // Défis du jour (spec § Défis du jour)
  session: [
    <circle key="a" cx="12" cy="12" r="9" />,
    <path key="b" d="M10 8.5v7l5.5-3.5z" />,
  ],
  parfaite: [
    <circle key="a" cx="12" cy="12" r="9" />,
    <path key="b" d="M8 12.5l2.5 2.5L16 9.5" />,
  ],
  justes: [<path key="a" d="M2.5 13l4 4L14 9.5M10 16.5l2 1.5 9.5-9.5" />],
  revision: [
    <path key="a" d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />,
    <path key="b" d="M20.5 3.5v5h-5" />,
  ],
  deck: [
    <rect key="a" x="3" y="8" width="14" height="13" rx="2" />,
    <path key="b" d="M7 5h12a2 2 0 0 1 2 2v12" />,
  ],
  combo: [
    <path key="a" d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.4 1.4" />,
    <path key="b" d="M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4" />,
  ],
  matin: [
    <path key="a" d="M3 18h18" />,
    <path key="b" d="M6 18a6 6 0 0 1 12 0" />,
    <path key="c" d="M12 2v3M4.2 6.2l2.1 2.1M19.8 6.2l-2.1 2.1" />,
  ],
  decks: [
    <rect key="a" x="3" y="3" width="11" height="14" rx="2" />,
    <path key="b" d="M10 7h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2" />,
  ],
  // Repli : un mot clé que le client ne connaît pas encore.
  neutre: [
    <circle key="a" cx="12" cy="12" r="9" />,
    <path key="b" d="M8 12h8" />,
  ],
}

/**
 * Le pictogramme d’un mot clé (`nom`), `taille` en pixels (20 par défaut).
 * Un nom inconnu, vide ou mal typé rend le pictogramme neutre.
 */
export function Picto({ nom, taille }) {
  const cle = typeof nom === 'string' && Object.prototype.hasOwnProperty.call(DESSINS, nom.trim().toLowerCase()) ? nom.trim().toLowerCase() : 'neutre'
  const px = Math.max(8, Math.round(Number(taille) || 20))
  return (
    <svg className={`ac-picto ac-picto-${cle}`} viewBox="0 0 24 24" width={px} height={px} aria-hidden="true" focusable="false" {...TRAIT}>
      {DESSINS[cle]}
    </svg>
  )
}

export default Picto
