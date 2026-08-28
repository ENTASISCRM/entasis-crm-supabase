// ═══════════════════════════════════════════════════════════════════════════
// CE QU'ON VIENT DE CONSULTER
//
// Une palette de commandes qui s'ouvre sur une liste d'onglets ne sert qu'à
// naviguer. Ouverte sur les dernières fiches consultées, elle sert à
// REPRENDRE — et c'est ce qu'on fait vingt fois par jour : rouvrir le client
// qu'on avait au téléphone il y a dix minutes.
//
// C'est l'écran d'accueil de la palette chez Attio, Linear et Superhuman, et
// la seule raison pour laquelle ⌘K y devient un réflexe : on l'ouvre même
// sans savoir ce qu'on cherche.
//
// Stocké par conseiller dans localStorage — c'est un confort d'affichage, pas
// une donnée du cabinet. Rien ne part en base : l'historique de consultation
// d'un conseiller n'a pas à être lisible par les autres.
// ═══════════════════════════════════════════════════════════════════════════

const PREFIX = 'entasis.recents.'

// Six : de quoi remplir l'ouverture de la palette sans la transformer en
// historique à faire défiler. Au-delà, on cherche plus vite en tapant.
export const MAX_RECENTS = 6

const cle = (scope) => `${PREFIX}${scope || 'anon'}`
const identite = (e) => `${e?.type}:${e?.id}`

/**
 * Insère une entrée en tête, sans doublon, en bornant la liste.
 * Fonction pure : c'est elle qui porte la règle, le stockage n'est qu'un tuyau.
 */
export function fusionnerRecents(liste, entree) {
  if (!entree?.type || !entree?.id) return Array.isArray(liste) ? liste : []
  const propre = {
    type: String(entree.type),
    id: String(entree.id),
    label: String(entree.label || '').slice(0, 120),
    sub: String(entree.sub || '').slice(0, 120),
  }
  const reste = (Array.isArray(liste) ? liste : [])
    .filter((e) => e?.type && e?.id && identite(e) !== identite(propre))
  return [propre, ...reste].slice(0, MAX_RECENTS)
}

/** Les dernières fiches consultées, la plus récente en tête. */
export function lireRecents(scope) {
  try {
    const brut = JSON.parse(window.localStorage.getItem(cle(scope)) || '[]')
    if (!Array.isArray(brut)) return []
    // Le contenu vient du stockage local, donc de l'extérieur du code : on ne
    // le rend qu'après avoir vérifié qu'il a la forme attendue.
    return brut
      .filter((e) => e && typeof e === 'object' && e.type && e.id)
      .slice(0, MAX_RECENTS)
      .map((e) => ({
        type: String(e.type), id: String(e.id),
        label: String(e.label || ''), sub: String(e.sub || ''),
      }))
  } catch {
    return []
  }
}

/**
 * Note une fiche comme consultée. Ne lève jamais : en navigation privée ou
 * quota plein, on perd le confort, jamais la session.
 */
export function noterRecent(scope, entree) {
  try {
    const suivant = fusionnerRecents(lireRecents(scope), entree)
    window.localStorage.setItem(cle(scope), JSON.stringify(suivant))
    return suivant
  } catch {
    return []
  }
}

/** Retire une fiche (suppression d'un client : ne pas la proposer encore). */
export function oublierRecent(scope, type, id) {
  try {
    const suivant = lireRecents(scope).filter((e) => identite(e) !== `${type}:${id}`)
    window.localStorage.setItem(cle(scope), JSON.stringify(suivant))
    return suivant
  } catch {
    return []
  }
}
