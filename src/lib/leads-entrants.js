// ═══════════════════════════════════════════════════════════════════════════
// LEADS ENTRANTS : la liste de travail « lead reçu, premier appel »
//
// Item A6 du plan d'amélioration (docs/plan_amelioration.md). La table
// public.leads est alimentée chaque jour par le pont depuis la Lead Room et
// n'était lue par aucun écran : l'onglet Leads Live n'est qu'une iframe vers
// la Lead Room, qui impose une seconde connexion avec un autre mot de passe.
// Cette lib range les leads pour l'écran, sans réseau, donc testable.
//
// Les statuts de la copie CRM sont plus pauvres que ceux de la Lead Room :
// available, booked, dead, released. « signed » n'existe pas ici, c'est
// justement la fuite que le rapprochement manager rend visible
// (api/leads-rapprochement.js).
//
// Les numéros sont stockés au format international sans le plus
// (33612345678). On les montre comme on les lit en France (06 12 34 56 78)
// et on les compose avec le plus (+33612345678), sinon le téléphone du poste
// refuse l'appel.
// ═══════════════════════════════════════════════════════════════════════════

import { correspond } from './recherche'
import { emptyDeal } from './ui-shared'

const HEURE_MS = 3600000
const JOUR_MS = 86400000

// Un lead mort ou rendu ne se rappelle pas : il sort de la liste de travail.
const STATUTS_MORTS = new Set(['dead', 'released'])

const instant = (v) => {
  const t = new Date(v || '').getTime()
  return Number.isNaN(t) ? null : t
}

/** Heures écoulées depuis created_at, null si la date est illisible. */
export function ageHeures(createdAt, today = new Date()) {
  const recu = instant(createdAt)
  const now = instant(today)
  if (recu == null || now == null) return null
  return Math.max(0, (now - recu) / HEURE_MS)
}

/**
 * Deux formes d'un numéro : celle qu'on lit et celle qu'on compose.
 * Français (33 puis neuf chiffres, ou dix chiffres commençant par 0) :
 * « 06 12 34 56 78 » et « +33612345678 ». Étranger : « +41 791 234 567 ».
 * Un préfixe 00, un plus ou des espaces en entrée sont tolérés.
 */
// Indicatifs des departements et collectivites d outre mer.
const OUTRE_MER = ['262', '269', '590', '594', '596', '508', '681', '687', '689']

export function formaterTelephone(brut) {
  const chiffres = String(brut ?? '').replace(/\D/g, '').replace(/^00/, '')
  if (!chiffres) return { affiche: '', appel: null }
  let international = chiffres
  if (chiffres.length === 10 && chiffres.startsWith('0')) international = '33' + chiffres.slice(1)
  const francais = international.length === 11 && international.startsWith('33')
  // Outre mer : indicatif a trois chiffres puis neuf chiffres, le numero
  // se lit comme en metropole (+262 692 00 00 00). Sans ce cas, un lead de
  // La Reunion s affichait « +26 269 200 000 0 ».
  const outreMer = OUTRE_MER.find(code => international.startsWith(code)) && international.length === 12
  const affiche = francais
    ? ('0' + international.slice(2)).replace(/(\d{2})(?=\d)/g, '$1 ')
    : outreMer
      ? `+${international.slice(0, 3)} ${international.slice(3, 6)} ${international.slice(6).replace(/(\d{2})(?=\d)/g, '$1 ')}`
      : `+${international.slice(0, 2)} ${international.slice(2).replace(/(\d{3})(?=\d)/g, '$1 ')}`.trim()
  return { affiche, appel: `+${international}` }
}

/** Le lead tel que l'écran l'affiche : âge et téléphone déjà calculés. */
export function enrichirLead(lead, today = new Date()) {
  const tel = formaterTelephone(lead?.telephone)
  return {
    ...lead,
    ageHeures: ageHeures(lead?.created_at, today),
    telephoneAffiche: tel.affiche,
    telephoneAppel: tel.appel,
  }
}

const parPlusRecent = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))

/**
 * Range les leads en quatre groupes pour l'écran.
 *   aMoi     : pris par moi, ni mort ni rendu (un lead booké reste à moi)
 *   nouveaux : disponibles, personne ne les a pris
 *   enCours  : pris par un collègue, ou bookés
 *   morts    : dead ou released, comptés mais pas affichés
 * Chaque groupe est trié du plus récent au plus ancien.
 */
export function classerLeads(leads, { profileId, today = new Date() } = {}) {
  const liste = Array.isArray(leads) ? leads : []
  const aMoi = []
  const nouveaux = []
  const enCours = []
  const morts = []
  for (const brut of liste) {
    if (!brut) continue
    const lead = enrichirLead(brut, today)
    const statut = String(lead.status || '').toLowerCase()
    if (STATUTS_MORTS.has(statut)) { morts.push(lead); continue }
    if (profileId && lead.taken_by === profileId) { aMoi.push(lead); continue }
    if (statut === 'available' && !lead.taken_by) { nouveaux.push(lead); continue }
    enCours.push(lead)
  }
  for (const g of [aMoi, nouveaux, enCours, morts]) g.sort(parPlusRecent)
  return { aMoi, nouveaux, enCours, morts, total: aMoi.length + nouveaux.length + enCours.length + morts.length }
}

// Tout ce par quoi on peut chercher un lead. Le téléphone y figure trois
// fois : brut (33612345678), affiché (06 12 34 56 78) et affiché sans espaces
// (0612345678), pour qu'un numéro tapé d'une traite ou par morceaux trouve.
export const texteRechercheLead = (lead) => {
  const affiche = lead?.telephoneAffiche ?? formaterTelephone(lead?.telephone).affiche
  return [
    lead?.nom, lead?.email, lead?.campagne, lead?.telephone,
    affiche, String(affiche || '').replace(/\s/g, ''),
  ].filter(Boolean).join(' ')
}

/** Filtre tolérant (accents, ordre des mots, une lettre) sur nom, email, campagne, téléphone. */
export function rechercherLeads(leads, requete) {
  const liste = Array.isArray(leads) ? leads : []
  if (!String(requete || '').trim()) return liste
  return liste.filter((l) => correspond(texteRechercheLead(l), requete))
}

/**
 * Le dossier prérempli qu'ouvre la modale « Créer le dossier » depuis un lead.
 * Même brouillon que celui que le pont écrit quand un RDV est calé : source
 * lead_room, lead_id posé, produit « Autre », statut « Prévu ». À la
 * sauvegarde, App.jsx retrouve un brouillon existant par lead_id, email ou
 * téléphone et le complète au lieu de créer un doublon.
 */
export function dossierPourLead(lead, advisorCode) {
  const tel = formaterTelephone(lead?.telephone)
  return {
    ...emptyDeal(advisorCode),
    client: String(lead?.nom || '').trim(),
    client_phone: tel.affiche,
    client_email: String(lead?.email || '').trim(),
    source: 'lead_room',
    lead_id: lead?.id ?? null,
    product: 'Autre',
    status: 'Prévu',
  }
}

/**
 * Médiane, en heures, du délai entre la réception d'un lead et sa prise
 * (created_at vers taken_at), sur les leads pris ces 30 derniers jours.
 * null s'il n'y en a aucun : l'en tête ne montre alors rien plutôt qu'un zéro
 * trompeur.
 */
export function delaiPremierAppel(leads, { today = new Date(), jours = 30 } = {}) {
  const now = instant(today)
  if (now == null) return null
  const depuis = now - jours * JOUR_MS
  const delais = []
  for (const l of (Array.isArray(leads) ? leads : [])) {
    const pris = instant(l?.taken_at)
    const recu = instant(l?.created_at)
    if (pris == null || recu == null || pris < depuis) continue
    const h = (pris - recu) / HEURE_MS
    if (h >= 0) delais.push(h)
  }
  if (!delais.length) return null
  delais.sort((a, b) => a - b)
  const m = delais.length >> 1
  return delais.length % 2 ? delais[m] : (delais[m - 1] + delais[m]) / 2
}

/** « 41 min », « 3 h » ou « 2 j » : ce qu'on lit dans l'en tête. */
export function libelleDelai(heures) {
  if (heures == null || Number.isNaN(Number(heures))) return ''
  const h = Number(heures)
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.round(h)} h`
  return `${Math.round(h / 24)} j`
}

/** « reçu il y a 2 h », ou la date au delà de 48 h. */
export function libelleRecu(lead, today = new Date()) {
  const h = lead?.ageHeures ?? ageHeures(lead?.created_at, today)
  if (h == null) return ''
  if (h < 1) return `reçu il y a ${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `reçu il y a ${Math.round(h)} h`
  const d = new Date(lead.created_at)
  return `reçu le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}
