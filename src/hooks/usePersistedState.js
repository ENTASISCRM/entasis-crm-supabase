/* ─────────────────────────────────────────────────────────────────────────────
   usePersistedState — état mémorisé par utilisateur (Série D / D1).

   Même signature que useState, mais la valeur survit au rechargement et au
   changement d'onglet. Sert aux filtres, tris et vues des écrans de travail
   (pipeline, annuaire, dossiers) : plus besoin de re-régler ses filtres à
   chaque visite — le réflexe des « vues sauvegardées » d'Attio/Zoho.

     const [statusF, setStatusF] = usePersistedState('deals.status', 'Tous', userKey)

   - `scope` (le code conseiller) isole les préférences par utilisateur sur un
     poste partagé.
   - localStorage indisponible (navigation privée, quota) → dégrade en simple
     useState, jamais d'erreur visible.
──────────────────────────────────────────────────────────────────────────── */
import { useState, useEffect, useRef } from 'react'

const PREFIX = 'entasis.pref.'

function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function usePersistedState(name, defaultValue, scope = 'anon') {
  const key = `${PREFIX}${scope}.${name}`
  // Lecture unique au montage (le composant se remonte quand le scope change).
  const [value, setValue] = useState(() => readStored(key, defaultValue))
  const keyRef = useRef(key)

  // Changement de scope (connexion d'un autre conseiller sans rechargement) :
  // on relit les préférences du nouveau, sans écraser celles de l'ancien.
  // La bascule de keyRef se fait DANS le rendu qui suit, pas ici, pour que
  // l'effet d'écriture ci-dessous puisse détecter le décalage.
  useEffect(() => {
    if (keyRef.current === key) return
    keyRef.current = key
    setValue(readStored(key, defaultValue))
  }, [key, defaultValue])

  useEffect(() => {
    // Au commit où la clé change, cet effet s'exécute AVEC la nouvelle clé mais
    // encore l'ancienne valeur : écrire ici écraserait les préférences du
    // nouveau scope avec celles du précédent. On attend que la relecture
    // ci-dessus ait aligné la valeur.
    if (keyRef.current !== key) return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch { /* quota plein ou stockage bloqué : la session reste fonctionnelle */ }
  }, [key, value])

  return [value, setValue]
}

// Efface toutes les préférences d'affichage (bouton « Réinitialiser »).
export function resetPreferences(scope) {
  try {
    const p = `${PREFIX}${scope}.`
    Object.keys(window.localStorage)
      .filter(k => k.startsWith(p))
      .forEach(k => window.localStorage.removeItem(k))
  } catch { /* stockage indisponible */ }
}
