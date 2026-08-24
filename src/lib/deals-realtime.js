// ═══════════════════════════════════════════════════════════════════════════
// FUSION DES ÉVÉNEMENTS REALTIME DANS LA LISTE DES DOSSIERS
//
// Les trois handlers Supabase (INSERT / UPDATE / DELETE) faisaient de la
// chirurgie de tableau en ligne dans App.jsx. Sortis ici pour être testés :
// une erreur à cet endroit se voit tout de suite à l'écran, chez tous les
// conseillers connectés à la fois.
//
// Invariant à tenir : dealsService.listAll() trie par created_at DÉCROISSANT,
// et l'annuaire affiche le tableau dans son ordre quand aucune colonne de tri
// n'est choisie (« ordre de création »). Un dossier inséré doit donc arriver
// EN TÊTE. Il arrivait en queue — un dossier tout juste signé par un collègue
// s'affichait donc tout en bas, à la place du plus ancien.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insère un dossier reçu par Realtime, en tête pour respecter l'ordre
 * antichronologique. Ignore un identifiant déjà présent : l'auteur du dossier
 * l'a déjà ajouté localement, et l'événement lui revient par le canal.
 */
export function insererDeal(liste, nouveau) {
  if (!nouveau?.id) return liste
  if (liste.some((d) => d.id === nouveau.id)) return liste
  return [nouveau, ...liste]
}

/**
 * Applique une mise à jour. Le payload Realtime ne porte pas la jointure
 * clients(...) : on fusionne au lieu de remplacer, sinon la ligne perdrait
 * le nom du client jusqu'au prochain rechargement complet.
 */
export function majDeal(liste, modifie) {
  if (!modifie?.id) return liste
  return liste.map((d) => (d.id === modifie.id ? { ...d, ...modifie } : d))
}

/**
 * Retire un dossier supprimé. payload.old ne contient que la clé primaire
 * quand la table est en REPLICA IDENTITY par défaut, d'où la garde sur l'id.
 */
export function retirerDeal(liste, id) {
  if (!id) return liste
  return liste.filter((d) => d.id !== id)
}

/**
 * Remplace un dossier par sa version complète (jointure client incluse),
 * récupérée après un INSERT. Ne fait rien si la ligne a disparu entre-temps :
 * la réinsérer ressusciterait un dossier supprimé pendant le vol.
 */
export function completerDeal(liste, complet) {
  if (!complet?.id) return liste
  if (!liste.some((d) => d.id === complet.id)) return liste
  return liste.map((d) => (d.id === complet.id ? complet : d))
}
