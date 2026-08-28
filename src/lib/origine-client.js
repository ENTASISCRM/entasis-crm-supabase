// ═══════════════════════════════════════════════════════════════════════════
// D'OÙ VIENT CE CLIENT
//
// Demandé par Louis le 26/08/2026 : savoir en un coup d'œil si un client vient
// d'une campagne, du réseau personnel du conseiller, ou d'ailleurs.
//
// PRINCIPE : l'origine est DÉRIVÉE, pas saisie.
//
// Trois champs de saisie manuelle livrés cette année sont restés vides pendant
// cinq mois — le journal d'échanges (0 ligne), la prochaine action (0 sur 465),
// la priorité (2 sur 465). On ne répète pas l'erreur. Un client dont un dossier
// porte un lead_id vient d'une campagne ; les autres sont des apports directs.
// Cela couvre les 379 clients immédiatement, sans rien demander à personne.
//
// La colonne clients.origine ne sert qu'à PRÉCISER un apport direct quand le
// conseiller le souhaite : réseau perso, recommandation, partenaire. Vide,
// l'affichage retombe sur la valeur dérivée. Jamais sur un blanc.
//
// LIMITE CONNUE : deals.lead_id pointe vers leads_room, le miroir figé depuis
// le 4 mai. Sur 216 dossiers issus d'un lead, 26 seulement retrouvent leur
// ligne locale. On sait donc dire « vient d'un lead » de façon fiable, mais on
// ne peut nommer la campagne que dans ces 26 cas. Le libellé le dit plutôt que
// d'inventer une campagne inconnue.
// ═══════════════════════════════════════════════════════════════════════════

// Précisions saisissables. Volontairement peu nombreuses : une liste longue
// finit en « Autre » pour tout le monde.
export const ORIGINES_MANUELLES = [
  { cle: 'reseau_perso',   libelle: 'Réseau perso',    aide: 'Relation personnelle du conseiller' },
  { cle: 'recommandation', libelle: 'Recommandation',  aide: 'Recommandé par un client existant' },
  { cle: 'partenaire',     libelle: 'Partenaire',      aide: 'Apporté par un expert-comptable, un avocat, un partenaire' },
  { cle: 'salon_evenement',libelle: 'Salon',           aide: 'Rencontré en salon ou événement' },
  { cle: 'autre',          libelle: 'Autre',           aide: '' },
]

const PAR_CLE = Object.fromEntries(ORIGINES_MANUELLES.map((o) => [o.cle, o]))

/**
 * Détermine l'origine d'un client.
 *
 * Ordre de priorité :
 *   1. la précision saisie par le conseiller, si elle existe
 *   2. la dérivation : un dossier rattaché à un lead → campagne
 *   3. la dérivation : des dossiers sans lead → apport direct
 *   4. aucun dossier → on ne sait pas, et on le dit
 *
 * @param {Object} client        ligne clients (peut porter `origine`)
 * @param {Array}  dealsDuClient dossiers de ce client
 * @param {Object} campagnes     { leadId: nomCampagne } quand on la connaît
 * @returns {{cle, libelle, detail, ton, saisi}}
 */
export function origineClient(client, dealsDuClient = [], campagnes = {}) {
  const deals = Array.isArray(dealsDuClient) ? dealsDuClient : []
  const avecLead = deals.find((d) => d?.lead_id)

  // 1. Précision saisie : elle prime, y compris sur un lead — un conseiller qui
  //    corrige l'origine sait quelque chose que la donnée ne dit pas.
  const saisie = client?.origine ? PAR_CLE[client.origine] : null
  if (saisie) {
    return {
      cle: saisie.cle,
      libelle: saisie.libelle,
      detail: avecLead ? 'Saisi — ce client a aussi un dossier issu d’une campagne' : 'Saisi par le conseiller',
      ton: saisie.cle === 'reseau_perso' || saisie.cle === 'recommandation' ? 'chaud' : 'neutre',
      saisi: true,
    }
  }

  // 2. Issu d'une campagne.
  if (avecLead) {
    const campagne = campagnes?.[avecLead.lead_id] || null
    return {
      cle: 'lead',
      libelle: campagne ? `Lead · ${campagne}` : 'Lead',
      detail: campagne
        ? `Campagne « ${campagne} »`
        : 'Campagne inconnue : le miroir Lead Room ne contient plus cette fiche',
      ton: 'campagne',
      saisi: false,
    }
  }

  // 3. Des dossiers, aucun lead : le conseiller l'a amené lui-même.
  if (deals.length > 0) {
    return {
      cle: 'direct',
      libelle: 'Apport direct',
      detail: 'Amené par le conseiller — précisez si c’est du réseau ou une recommandation',
      ton: 'chaud',
      saisi: false,
    }
  }

  // 4. Rien pour trancher. On ne devine pas.
  return {
    cle: 'inconnu',
    libelle: 'Origine inconnue',
    detail: 'Aucun dossier rattaché à ce client',
    ton: 'neutre',
    saisi: false,
  }
}

/**
 * Table { leadId: campagne } à partir des lignes leads_room disponibles.
 * Les leads absents du miroir n'y figurent pas — c'est voulu, on préfère
 * « campagne inconnue » à une campagne inventée.
 */
export function tableCampagnes(leadsRoom = []) {
  const t = {}
  for (const l of Array.isArray(leadsRoom) ? leadsRoom : []) {
    const nom = l?.campaign_slug || l?.campaign_id
    if (l?.id && nom) t[String(l.id)] = String(nom)
  }
  return t
}

/** Répartition des origines sur une liste de clients, pour le pilotage. */
export function repartitionOrigines(clients = [], dealsParClient = {}, campagnes = {}) {
  const compte = {}
  for (const c of Array.isArray(clients) ? clients : []) {
    const o = origineClient(c, dealsParClient[c?.id] || [], campagnes)
    compte[o.cle] = (compte[o.cle] || 0) + 1
  }
  return compte
}
