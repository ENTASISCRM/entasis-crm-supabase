// ═══════════════════════════════════════════════════════════════════════════
// ALERTES SUR LES CONTRATS
//
// L'écran Pilotage RH signale déjà les fins de contrat et les fiches
// terminées. Le problème n'était pas l'absence d'information : c'était qu'il
// fallait aller la chercher. Au 24/08/2026, quatre contrats expiraient dans
// les six semaines — dont trois des meilleurs producteurs, la même semaine de
// septembre — et quatre personnes arrivaient sans compte pour se connecter.
// Rien ne le disait à l'accueil.
//
// Ce module dérive ces alertes pour la cloche de notifications. Il ne lit rien
// et n'écrit rien : on lui passe les contrats, il rend une liste. La logique
// de dates est ici plutôt qu'en ligne dans App.jsx, pour être testable.
// ═══════════════════════════════════════════════════════════════════════════

// Six semaines : assez tôt pour relancer une alternance ou lancer un
// recrutement, assez tard pour ne pas devenir du bruit permanent.
export const JOURS_AVANT_FIN = 45

// Un mois avant l'arrivée : le délai raisonnable pour créer un compte, une
// adresse mail et préparer l'onboarding.
export const JOURS_AVANT_ARRIVEE = 30

const MS_JOUR = 24 * 60 * 60 * 1000

// Les dates de contrat sont des 'YYYY-MM-DD' sans heure. On compare au jour,
// pas à la milliseconde, sinon « expire aujourd'hui » bascule en « terminé »
// selon l'heure de connexion.
const auJour = (d) => {
  if (!d) return null
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return null
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}

export const joursEntre = (depuis, jusqua) => {
  const a = auJour(depuis)
  const b = auJour(jusqua)
  if (a == null || b == null) return null
  return Math.round((b - a) / MS_JOUR)
}

const nom = (c) => (c?.full_name || c?.profile?.full_name || 'Contrat sans nom').trim()

const fmt = (d) => {
  const t = auJour(d)
  return t == null ? '—' : new Date(t).toLocaleDateString('fr-FR')
}

/**
 * Dérive les alertes RH d'une liste de contrats.
 *
 * Trois familles, volontairement peu nombreuses — une cloche qui crie tous les
 * jours finit ignorée :
 *   • fin-proche    : contrat borné qui se termine sous 45 jours
 *   • termine-actif : date de fin passée mais fiche encore active (l'effectif
 *                     affiché est faux, et le contrat reste modifiable)
 *   • sans-compte   : personne arrivée ou attendue sous 30 jours, sans profil
 *                     Supabase — elle ne pourra pas se connecter le jour J
 *
 * @param {Array}  contrats   lignes conseiller_contrats, jointure profile incluse
 * @param {Date}   aujourdhui date de référence (injectable pour les tests)
 * @returns {Array} alertes triées par urgence, la plus pressante d'abord
 */
export function alertesContrats(contrats, aujourdhui = new Date()) {
  const out = []

  for (const c of contrats || []) {
    if (!c?.actif) continue

    const restant = c.date_fin ? joursEntre(aujourdhui, c.date_fin) : null

    if (restant != null && restant < 0) {
      out.push({
        id: `contrat-termine-${c.id}`,
        type: 'termine-actif',
        contratId: c.id,
        date: c.date_fin,
        urgence: 0,
        titre: `${nom(c)} — contrat terminé, fiche encore active`,
        detail: `Fin le ${fmt(c.date_fin)}. L'effectif affiché la compte encore.`,
      })
    } else if (restant != null && restant <= JOURS_AVANT_FIN) {
      out.push({
        id: `contrat-fin-${c.id}`,
        type: 'fin-proche',
        contratId: c.id,
        date: c.date_fin,
        urgence: 1 + restant,
        titre: restant === 0
          ? `${nom(c)} — contrat terminé aujourd'hui`
          : `${nom(c)} — fin de contrat dans ${restant} jour${restant > 1 ? 's' : ''}`,
        detail: `${c.type_contrat || 'Contrat'} jusqu'au ${fmt(c.date_fin)}.`,
      })
    }

    // Une fiche sans profil lié n'est pas un problème tant que la personne
    // n'est pas attendue : on n'alerte qu'à l'approche de la date de début.
    if (!c.profile_id) {
      const avantArrivee = c.date_debut ? joursEntre(aujourdhui, c.date_debut) : null
      if (avantArrivee != null && avantArrivee <= JOURS_AVANT_ARRIVEE) {
        const arrive = avantArrivee <= 0
        out.push({
          id: `contrat-sans-compte-${c.id}`,
          type: 'sans-compte',
          contratId: c.id,
          date: c.date_debut,
          urgence: arrive ? 0 : 1 + avantArrivee,
          titre: arrive
            ? `${nom(c)} — arrivé(e), toujours sans compte`
            : `${nom(c)} — arrive dans ${avantArrivee} jour${avantArrivee > 1 ? 's' : ''}, sans compte`,
          detail: `Aucun profil lié : ${arrive ? 'elle ou il ne peut pas se connecter' : 'à créer avant le'} ${arrive ? '' : fmt(c.date_debut)}`.trim(),
        })
      }
    }
  }

  return out.sort((a, b) => a.urgence - b.urgence || String(a.date).localeCompare(String(b.date)))
}
