// ═══════════════════════════════════════════════════════════════════════════
// SANTÉ DES FLUX ENTRANTS
//
// Le 4 mai 2026 à 13h37, la Lead Room a tenté de synchroniser dans le CRM et
// reçu « Invalid API key ». Elle a réessayé une vingtaine de fois en vingt
// minutes, puis s'est tue. Trois flux se sont arrêtés ce jour-là — la synchro
// des leads, le miroir leads_room, et les appels Aircall — et personne ne
// s'en est aperçu pendant près de quatre mois.
//
// Pire : l'email quotidien de la Lead Room a continué de partir, en lisant
// une table figée. Il annonçait des rendez-vous de mai comme « actions du
// jour ». Une intégration morte est plus dangereuse qu'une intégration
// absente, parce qu'elle continue de servir des données périmées.
//
// Ce module ne répare aucun flux : il les surveille. On lui donne la date de
// dernière écriture de chacun, il dit lesquels ont décroché.
// ═══════════════════════════════════════════════════════════════════════════

const MS_JOUR = 24 * 60 * 60 * 1000

// Les flux alimentés par une machine, pas par un conseiller. Le délai est
// propre à chacun : les leads arrivent en continu, l'immobilier se
// resynchronise plus rarement.
export const FLUX = [
  { cle: 'leads', libelle: 'Leads (campagnes)', table: 'leads', seuilJours: 14,
    note: 'Nouveaux leads issus des campagnes d’acquisition.' },
  { cle: 'leads_room', libelle: 'Miroir Lead Room', table: 'leads_room', seuilJours: 14,
    note: 'Copie locale des leads de la Lead Room. C’est cette table que lit l’email quotidien.' },
  { cle: 'calls', libelle: 'Appels (Aircall)', table: 'calls', seuilJours: 14,
    note: 'Appels remontés par Aircall, avec transcription Modjo.' },
  { cle: 'sync', libelle: 'Journal de synchro', table: 'lead_sync_logs', seuilJours: 14,
    note: 'Trace des échanges entre la Lead Room et le CRM.' },
  { cle: 'programmes', libelle: 'Programmes immobiliers', table: 'programmes', seuilJours: 60,
    note: 'Catalogue des programmes neufs, resynchronisé périodiquement.' },
]

export const joursDepuis = (date, maintenant = new Date()) => {
  if (!date) return null
  const t = new Date(date)
  if (Number.isNaN(t.getTime())) return null
  return Math.floor((maintenant.getTime() - t.getTime()) / MS_JOUR)
}

/**
 * Évalue la santé de chaque flux à partir de sa dernière écriture.
 *
 * Trois états, pas plus :
 *   ok       — écrit récemment
 *   decroche — rien depuis son seuil : le flux a décroché
 *   vide     — jamais rien reçu, ou impossible à lire
 *
 * @param {Object} dernieres  { cle: dateISO | null }
 * @param {Date}   maintenant date de référence (injectable pour les tests)
 */
export function santeFlux(dernieres, maintenant = new Date()) {
  return FLUX.map((f) => {
    const derniere = dernieres?.[f.cle] ?? null
    const jours = joursDepuis(derniere, maintenant)
    const etat = jours == null ? 'vide' : jours >= f.seuilJours ? 'decroche' : 'ok'
    return { ...f, derniere, jours, etat }
  }).sort((a, b) => {
    const rang = { decroche: 0, vide: 1, ok: 2 }
    return rang[a.etat] - rang[b.etat] || (b.jours ?? -1) - (a.jours ?? -1)
  })
}

/** Résumé d'une phrase pour la bannière : combien de flux ont décroché. */
export function resumeSante(flux) {
  const decroches = flux.filter((f) => f.etat === 'decroche')
  if (decroches.length === 0) return null
  const pire = decroches[0]
  return {
    nombre: decroches.length,
    pire,
    texte: decroches.length === 1
      ? `${pire.libelle} n'a rien reçu depuis ${pire.jours} jours.`
      : `${decroches.length} flux n'alimentent plus le CRM, dont ${pire.libelle} depuis ${pire.jours} jours.`,
  }
}
