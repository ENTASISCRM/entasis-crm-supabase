// ═══════════════════════════════════════════════════════════════════════════
// EXPORT DES LEADS SANS SUITE, POUR UNE CAMPAGNE DE RECONTACT
//
// Demande de Louis du 24 septembre : sortir une liste de leads à rappeler
// sans repasser par une requête SQL à la main. Le geste vivait jusqu'ici dans
// l'éditeur SQL de la Lead Room, donc réservé à qui sait écrire un select.
//
// Ce que la copie CRM permet, et ce qu'elle ne permet pas :
//   * les statuts d'ici sont plus pauvres que ceux de la Lead Room
//     (available, contacted, booked, dead, released). « dead » est ce que la
//     Lead Room appelle un refus, « released » un lead rendu au pool.
//   * il n'y a PAS de date de refus dans la copie. L'ancienneté se mesure
//     donc sur le dernier mouvement (updated_at), et l'écran le dit dans ces
//     mots : « sans mouvement depuis plus de deux mois ». Ne pas écrire
//     « refusé depuis », ce serait faux.
//   * il n'y a pas de note d'appel ici. Une note utile (« ne pas rappeler »,
//     « rendez vous pris ») vit dans la Lead Room : le fichier ne peut pas la
//     porter, et c'est une limite à connaître avant de distribuer la liste.
//
// Le vocabulaire du fichier ne porte aucun jugement sur le lead : décision de
// Louis, un conseiller qui reçoit une liste étiquetée « refusés » ne la
// travaille pas. Les colonnes disent le fait (dernier mouvement), pas le
// verdict.
//
// Aucun accès réseau ici : tout est pur, donc testé sans base ni navigateur.
// ═══════════════════════════════════════════════════════════════════════════

import { formaterTelephone } from './leads-entrants'

// Les statuts de la copie CRM qui valent « personne ne le travaille plus ».
// Un lead rendu (released) redevient disponible dans la Lead Room, il n'est
// donc proposé que sur demande explicite : sinon on rappellerait quelqu'un
// qu'un collègue est peut être en train de reprendre.
export const STATUT_SANS_SUITE = 'dead'
export const STATUT_RENDU = 'released'

// « Plus de deux mois », la règle que Louis a posée.
export const ANCIENNETE_JOURS = 60

// Ce qu'on peut demander comme volume. Le seuil de journalisation des exports
// est à 100 lignes (SEUIL_EXPORT_MASSIF) : au delà, la trace porte la marque
// « massif », ce qui est voulu, pas un accident.
export const NOMBRES = [25, 50, 100]

const JOUR_MS = 86400000

const instant = (v) => {
  const t = new Date(v || '').getTime()
  return Number.isNaN(t) ? null : t
}

/** Le dernier mouvement connu du lead, updated_at sinon created_at. */
export function dernierMouvement(lead) {
  return instant(lead?.updated_at) ?? instant(lead?.created_at)
}

/** Les campagnes présentes dans une liste, classées, sans les vides. */
export function campagnesDe(leads) {
  const vues = new Set()
  for (const l of (Array.isArray(leads) ? leads : [])) {
    const c = String(l?.campagne || '').trim()
    if (c) vues.add(c)
  }
  return [...vues].sort((a, b) => a.localeCompare(b, 'fr'))
}

/**
 * La sélection à exporter.
 *
 * @param {Array} leads
 * @param {Object} opts
 * @param {string} opts.campagne     '' pour toutes
 * @param {boolean} opts.avecRendus  inclure les leads rendus au pool
 * @param {number} opts.jours        ancienneté minimale du dernier mouvement
 * @param {number} opts.nombre       0 pour tout prendre
 * @param {Date}   opts.today
 *
 * Un lead sans numéro est écarté : la liste sert à appeler. Le classement
 * met le mouvement le plus récent en tête, à égalité d'ancienneté le plus
 * frais est le plus tiède.
 */
export function selectionRecontact(leads, {
  campagne = '', avecRendus = false, jours = ANCIENNETE_JOURS, nombre = 0, today = new Date(),
} = {}) {
  const maintenant = instant(today)
  if (maintenant == null) return []
  const limite = maintenant - Math.max(0, Number(jours) || 0) * JOUR_MS
  const cible = String(campagne || '').trim()

  const retenus = []
  for (const lead of (Array.isArray(leads) ? leads : [])) {
    if (!lead) continue
    const statut = String(lead.status || '').toLowerCase()
    if (statut !== STATUT_SANS_SUITE && !(avecRendus && statut === STATUT_RENDU)) continue
    if (cible && String(lead.campagne || '').trim() !== cible) continue
    if (!formaterTelephone(lead.telephone).appel) continue
    const bouge = dernierMouvement(lead)
    if (bouge == null || bouge > limite) continue
    retenus.push(lead)
  }

  retenus.sort((a, b) => (dernierMouvement(b) ?? 0) - (dernierMouvement(a) ?? 0))
  const n = Math.max(0, Math.trunc(Number(nombre) || 0))
  return n > 0 ? retenus.slice(0, n) : retenus
}

const dateFr = (v) => {
  const t = instant(v)
  return t == null ? '' : new Date(t).toLocaleDateString('fr-FR')
}

export const COLONNES_RECONTACT = Object.freeze([
  'Nom', 'Téléphone', 'Email', 'Campagne', 'TMI', 'Patrimoine', 'Actifs',
  'Reçu le', 'Dernier mouvement',
])

/** Les lignes du fichier, dans l'ordre de COLONNES_RECONTACT. */
export function lignesRecontact(leads) {
  return (Array.isArray(leads) ? leads : []).filter(Boolean).map((l) => [
    String(l.nom || '').trim(),
    formaterTelephone(l.telephone).affiche,
    String(l.email || '').trim(),
    String(l.campagne || '').trim(),
    String(l.tmi || '').trim(),
    String(l.patrimoine_net || '').trim(),
    String(l.actifs || '').trim(),
    dateFr(l.created_at),
    dateFr(l.updated_at || l.created_at),
  ])
}

/** « leads-recontact-article_790_2026-2026-09-24 », sans extension. */
export function nomFichierRecontact(campagne, suffixe) {
  const c = String(campagne || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return ['leads-recontact', c || 'toutes-campagnes', suffixe].filter(Boolean).join('-')
}

/** Ce que le bandeau annonce avant l'export : « 50 leads sur 103 éligibles ». */
export function resumeSelection(nbRetenus, nbEligibles) {
  const r = Math.max(0, Number(nbRetenus) || 0)
  const e = Math.max(0, Number(nbEligibles) || 0)
  if (e === 0) return 'Aucun lead éligible'
  if (r >= e) return e > 1 ? `${e} leads éligibles` : '1 lead éligible'
  return `${r} ${r > 1 ? 'leads' : 'lead'} sur ${e} éligibles`
}
