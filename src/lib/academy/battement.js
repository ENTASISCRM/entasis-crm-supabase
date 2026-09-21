// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, la machine d état des battements d activité
//
// Spec §3.5 : un battement toutes les 30 s, envoyé seulement si la page est
// visible et qu une interaction a eu lieu depuis moins de 120 s. En base,
// academy_battement() horodate avec now() et fusionne les intervalles ; le
// navigateur n envoie jamais une durée, seulement un signe de vie.
//
// Aucun timer ni Date.now() ici : le composant pousse les événements du
// navigateur (visibilitychange, clics, défilement, ouverture et fermeture
// de la leçon) avec leur horodatage, puis appelle doitEnvoyer(Date.now())
// sur son setInterval. La règle est donc testable à la milliseconde près.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {{pasMs?: number, inactiviteMs?: number}} reglages
 *   pasMs         écart minimal entre deux envois (défaut 30 s)
 *   inactiviteMs  silence au delà duquel on cesse d envoyer (défaut 120 s)
 */
export function creerBattement({ pasMs = 30000, inactiviteMs = 120000 } = {}) {
  let visible = true
  let ouvert = false
  let ouvertA = null
  let derniereInteraction = null
  let dernierEnvoi = null
  // Le dernier horodatage vu, pour que etat() sache si l inactivité est
  // dépassée sans qu on lui passe l heure.
  let dernierInstant = null

  const noter = (t) => {
    if (typeof t === 'number' && (dernierInstant == null || t > dernierInstant)) dernierInstant = t
  }

  const inactif = (t) =>
    derniereInteraction == null || t == null || t - derniereInteraction >= inactiviteMs

  /**
   * Un événement du navigateur, horodaté en ms.
   * @param {'visible'|'cache'|'interaction'|'ouvert'|'ferme'} type
   * @param {number} t
   */
  function evenement(type, t) {
    noter(t)
    switch (type) {
      case 'visible':
        visible = true
        break
      case 'cache':
        visible = false
        break
      case 'interaction':
        derniereInteraction = t
        break
      case 'ouvert':
        // Ouvrir une leçon est un geste : il compte comme interaction, et
        // le premier envoi attend un pas complet depuis cet instant.
        ouvert = true
        ouvertA = t
        derniereInteraction = t
        dernierEnvoi = null
        break
      case 'ferme':
        ouvert = false
        break
      default:
        break
    }
  }

  /**
   * Vrai s il faut envoyer un battement maintenant : leçon ouverte, page
   * visible, interaction récente, et au moins un pas depuis le dernier
   * envoi (ou depuis l ouverture). Quand vrai, l envoi est noté à t : deux
   * appels au même instant n envoient qu une fois.
   */
  function doitEnvoyer(t) {
    noter(t)
    if (!ouvert || !visible || inactif(t)) return false
    const reference = dernierEnvoi == null ? ouvertA : dernierEnvoi
    if (reference == null || t - reference < pasMs) return false
    dernierEnvoi = t
    return true
  }

  /** L état courant, pour l affichage et les tests. */
  function etat() {
    return {
      visible,
      ouvert,
      derniereInteraction,
      dernierEnvoi,
      enPause: !visible || inactif(dernierInstant),
    }
  }

  return { evenement, doitEnvoyer, etat }
}
