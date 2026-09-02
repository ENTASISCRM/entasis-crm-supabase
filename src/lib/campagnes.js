// ═══════════════════════════════════════════════════════════════════════════
// CAMPAGNES : le ciblage en direct sur les fiches clients
//
// Le 1er septembre, la direction a chiffré une campagne prévoyance à la main
// en comptant les fiches où le statut professionnel était renseigné : sur
// 381 fiches, 49 clients connus comme TNS ou chefs d'entreprise, 42 avec des
// revenus, 20 avec un âge, et 308 fiches sans statut du tout. Cette lib rend
// ce comptage instantané et, surtout, montre ce que les fiches vides coûtent
// en cibles.
//
// Le principe qui compte : un client dont le champ demandé est vide n'est
// ni une cible ni un exclu. Il est « non évaluable » pour ce champ, et il
// est compté comme tel. Une campagne prévoyance TNS qui trouve 49 cibles et
// 308 statuts inconnus dit à la direction où est le vrai gisement : dans
// les fiches à compléter, pas dans les 49.
//
// Tout ici est pur : des fiches et des lignes de la vue client_equipment en
// entrée, des comptes en sortie. Ça se teste sans navigateur. Aucun montant
// de commission, aucune marge : on compte des clients.
// ═══════════════════════════════════════════════════════════════════════════

import { SEUILS, ARGUMENTAIRES } from '../config/multiEquipementRules'

// ─── La forme des critères ────────────────────────────────────────────────
// Un tableau vide ou une valeur nulle signifie « pas de critère ». Les nombres
// s'entendent « au moins » (revenusMin, patrimoineMin, enfantsMin, ageMin) ou
// « au plus » (ageMax), bornes comprises.
export const CRITERES_VIDES = Object.freeze({
  statuts: [],
  ageMin: null,
  ageMax: null,
  revenusMin: null,
  patrimoineMin: null,
  situations: [],
  enfantsMin: null,
  famillesPresentes: [],
  famillesAbsentes: [],
  conseillers: [],
})

// Les situations familiales telles que la fiche client les propose
// (ClientModal). Reprises ici pour que la case à cocher et la valeur en base
// soient le même mot.
export const SITUATIONS_FAMILIALES = ['Célibataire', 'Marié', 'Pacsé', 'Divorcé', 'Veuf']

// Statuts de suivi d'une cible, dans l'ordre de l'entonnoir. La clé est la
// valeur en base (contrainte check de campagne_cibles).
export const STATUTS_CIBLE = [
  { cle: 'a_contacter', label: 'À contacter' },
  { cle: 'contacte', label: 'Contacté' },
  { cle: 'rdv', label: 'Rendez vous' },
  { cle: 'signe', label: 'Signé' },
  { cle: 'pas_interesse', label: 'Pas intéressé' },
]
export const libelleStatutCible = (cle) => STATUTS_CIBLE.find((s) => s.cle === cle)?.label || cle || ''

// Champs de la fiche qu'un critère peut rendre non évaluable, avec le libellé
// court affiché sous le compteur (« statut inconnu sur 308 »).
export const CHAMPS_EVALUES = [
  { champ: 'statut_pro', libelle: 'statut inconnu' },
  { champ: 'age', libelle: 'âge inconnu' },
  { champ: 'revenus_annuels', libelle: 'revenus inconnus' },
  { champ: 'patrimoine_estime', libelle: 'patrimoine inconnu' },
  { champ: 'situation_familiale', libelle: 'situation inconnue' },
  { champ: 'nb_enfants', libelle: 'enfants inconnus' },
]

const listeOuVide = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== '') : [])
const nombreOuNull = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Complète des critères partiels avec la forme vide, pour ne jamais lire un tableau absent. */
export function normaliserCriteres(criteres) {
  const c = criteres || {}
  // Une fourchette d'âge saisie à l'envers (60 à 40) est remise à l'endroit
  // plutôt que de ne cibler personne sans le dire.
  let ageMin = nombreOuNull(c.ageMin)
  let ageMax = nombreOuNull(c.ageMax)
  if (ageMin != null && ageMax != null && ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin]
  return {
    statuts: listeOuVide(c.statuts),
    ageMin,
    ageMax,
    revenusMin: nombreOuNull(c.revenusMin),
    patrimoineMin: nombreOuNull(c.patrimoineMin),
    situations: listeOuVide(c.situations),
    enfantsMin: nombreOuNull(c.enfantsMin),
    famillesPresentes: listeOuVide(c.famillesPresentes),
    famillesAbsentes: listeOuVide(c.famillesAbsentes),
    conseillers: listeOuVide(c.conseillers),
  }
}

/** Vrai si au moins un critère est posé. Sans critère, tout le monde est cible. */
export function criteresActifs(criteres) {
  const c = normaliserCriteres(criteres)
  return c.statuts.length > 0 || c.ageMin != null || c.ageMax != null || c.revenusMin != null
    || c.patrimoineMin != null || c.situations.length > 0 || c.enfantsMin != null
    || c.famillesPresentes.length > 0 || c.famillesAbsentes.length > 0 || c.conseillers.length > 0
}

// ─── L'âge ────────────────────────────────────────────────────────────────

const jourISO = (d = new Date()) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/**
 * Âge d'un client : calculé depuis date_naissance quand elle existe (la
 * fiche vieillit toute seule), sinon le champ age saisi, sinon null.
 * today : jour ISO (AAAA MM JJ) ou Date ; par défaut aujourd'hui.
 */
export function ageDe(client, today) {
  const naissance = client?.date_naissance ? String(client.date_naissance).slice(0, 10) : null
  if (naissance && /^\d{4}-\d{2}-\d{2}$/.test(naissance)) {
    const ref = today == null ? jourISO() : (today instanceof Date ? jourISO(today) : String(today).slice(0, 10))
    const [an, mois, jour] = naissance.split('-').map(Number)
    const [anR, moisR, jourR] = ref.split('-').map(Number)
    if ([an, mois, jour, anR, moisR, jourR].every(Number.isFinite)) {
      let age = anR - an
      if (moisR < mois || (moisR === mois && jourR < jour)) age -= 1
      if (age >= 0 && age < 130) return age
    }
  }
  const saisi = nombreOuNull(client?.age)
  return saisi != null && saisi > 0 ? Math.floor(saisi) : null
}

// ─── Les champs et leur vacuité ───────────────────────────────────────────
// Revenus et patrimoine à zéro ne disent rien : une fiche créée depuis un
// dossier porte 0 ou null selon l'écran qui l'a créée. Même chose pour
// nb_enfants, dont la valeur par défaut est 0.

const texteVide = (v) => v == null || String(v).trim() === ''
const montantConnu = (v) => { const n = nombreOuNull(v); return n != null && n > 0 }
const enfantsConnus = (v) => { const n = nombreOuNull(v); return n != null && n > 0 }

// Accents, casse, apostrophes et ponctuation ignorés : « Chef d entreprise »
// et « Chef d'entreprise » sont le même statut.
const normaliserTexte = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const dansListe = (liste, valeur) => {
  const cible = normaliserTexte(valeur)
  return liste.some((x) => normaliserTexte(x) === cible)
}

// Chaque critère dit : est il demandé, le champ est il renseigné, le client
// passe t il. Ordre : celui de CHAMPS_EVALUES pour les champs de fiche, puis
// les familles et le conseiller qui ne sont jamais « inconnus ».
const EVALUATEURS = [
  {
    champ: 'statut_pro',
    demande: (c) => c.statuts.length > 0,
    connu: (cl) => !texteVide(cl.statut_pro),
    passe: (cl, c) => dansListe(c.statuts, cl.statut_pro),
  },
  {
    champ: 'age',
    demande: (c) => c.ageMin != null || c.ageMax != null,
    connu: (cl) => cl.age != null,
    passe: (cl, c) => (c.ageMin == null || cl.age >= c.ageMin) && (c.ageMax == null || cl.age <= c.ageMax),
  },
  {
    champ: 'revenus_annuels',
    demande: (c) => c.revenusMin != null,
    connu: (cl) => montantConnu(cl.revenus_annuels),
    passe: (cl, c) => Number(cl.revenus_annuels) >= c.revenusMin,
  },
  {
    champ: 'patrimoine_estime',
    demande: (c) => c.patrimoineMin != null,
    connu: (cl) => montantConnu(cl.patrimoine_estime),
    passe: (cl, c) => Number(cl.patrimoine_estime) >= c.patrimoineMin,
  },
  {
    champ: 'situation_familiale',
    demande: (c) => c.situations.length > 0,
    connu: (cl) => !texteVide(cl.situation_familiale),
    passe: (cl, c) => dansListe(c.situations, cl.situation_familiale),
  },
  {
    champ: 'nb_enfants',
    demande: (c) => c.enfantsMin != null,
    connu: (cl) => enfantsConnus(cl.nb_enfants),
    passe: (cl, c) => Number(cl.nb_enfants) >= c.enfantsMin,
  },
  {
    champ: null,
    demande: (c) => c.famillesPresentes.length > 0,
    connu: () => true,
    passe: (cl, c) => c.famillesPresentes.every((f) => cl.familles.includes(f)),
  },
  {
    champ: null,
    demande: (c) => c.famillesAbsentes.length > 0,
    connu: () => true,
    passe: (cl, c) => c.famillesAbsentes.every((f) => !cl.familles.includes(f)),
  },
  {
    champ: null,
    demande: (c) => c.conseillers.length > 0,
    connu: () => true,
    passe: (cl, c) => c.conseillers.includes(cl.advisor_code),
  },
]

const nonEvaluablesVides = () => Object.fromEntries(CHAMPS_EVALUES.map(({ champ }) => [champ, 0]))

/**
 * Évalue les critères sur les fiches.
 *
 * Un client passe d'abord tous les critères qu'on PEUT évaluer sur sa fiche.
 * S'il échoue à l'un d'eux, il est exclu, et on ne le compte nulle part. S'il
 * les passe tous mais qu'un champ demandé est vide, il est non évaluable pour
 * chacun de ces champs : c'est précisément ce que la fiche vide coûte en
 * cibles. S'il passe tout et que tout est connu, c'est une cible.
 *
 * @param {Array}  clients      lignes de la table clients
 * @param {Array}  equipement   lignes de la vue client_equipment (familles par client_id)
 * @param {Object} criteres     voir CRITERES_VIDES
 * @param {Object} [opts]       { today } jour de référence pour l'âge
 * @returns {{ cibles: Array, nonEvaluables: Object, nbNonEvaluables: number, exclus: number, total: number }}
 */
export function evaluerCibles(clients, equipement, criteres, { today } = {}) {
  const c = normaliserCriteres(criteres)
  const fiches = Array.isArray(clients) ? clients.filter(Boolean) : []
  const famillesParClient = new Map()
  for (const e of (Array.isArray(equipement) ? equipement : [])) {
    if (e?.client_id) famillesParClient.set(e.client_id, Array.isArray(e.familles) ? e.familles : [])
  }

  const demandes = EVALUATEURS.filter((ev) => ev.demande(c))
  const cibles = []
  const nonEvaluables = nonEvaluablesVides()
  let nbNonEvaluables = 0
  let exclus = 0

  for (const fiche of fiches) {
    const client = {
      ...fiche,
      age: ageDe(fiche, today),
      familles: famillesParClient.get(fiche.id) || [],
    }
    const inconnus = []
    let exclu = false
    for (const ev of demandes) {
      if (!ev.connu(client)) { inconnus.push(ev.champ); continue }
      if (!ev.passe(client, c)) { exclu = true; break }
    }
    if (exclu) { exclus += 1; continue }
    if (inconnus.length > 0) {
      nbNonEvaluables += 1
      for (const champ of inconnus) nonEvaluables[champ] += 1
      continue
    }
    cibles.push(client)
  }

  return { cibles, nonEvaluables, nbNonEvaluables, exclus, total: fiches.length }
}

/**
 * La ligne grise sous le compteur : « statut inconnu sur 308, revenus
 * inconnus sur 12 », un libellé par champ, tri décroissant. Chaîne vide
 * quand tout est connu.
 */
export function libelleNonEvaluables(nonEvaluables) {
  const n = nonEvaluables || {}
  return CHAMPS_EVALUES
    .map(({ champ, libelle }) => ({ libelle, nombre: Number(n[champ]) || 0 }))
    .filter((x) => x.nombre > 0)
    .sort((a, b) => b.nombre - a.nombre)
    .map((x) => `${x.libelle} sur ${x.nombre}`)
    .join(', ')
}

// ─── Les campagnes préconfigurées ─────────────────────────────────────────
// Les seuils viennent des règles du Multi équipement, l'accroche reprend
// l'argumentaire de la famille quand il existe. La séquence proposée est la
// relance devis standard : trois contacts sur quinze jours.

// Figées en profondeur : l'écran charge ces critères dans son état et les
// tableaux ne doivent pas se partager entre le gabarit et le formulaire.
const figer = (criteres) => {
  const c = normaliserCriteres(criteres)
  for (const k of Object.keys(c)) if (Array.isArray(c[k])) Object.freeze(c[k])
  return Object.freeze(c)
}
const preconfiguree = ({ cle, nom, criteres, accroche, sequence_key = 'relance_devis' }) => Object.freeze({
  cle, nom, accroche, sequence_key, criteres: figer(criteres),
})

export const CAMPAGNES_PRECONFIGUREES = [
  preconfiguree({
    cle: 'prevoyance_tns',
    nom: 'Prévoyance TNS',
    criteres: { statuts: ['TNS', "Chef d'entreprise", 'Profession libérale'], famillesAbsentes: ['prevoyance'] },
    accroche: ARGUMENTAIRES.prevoyance,
  }),
  preconfiguree({
    cle: 'per_hauts_revenus',
    nom: 'PER hauts revenus',
    criteres: { revenusMin: SEUILS.revenusFortPotentiel, famillesAbsentes: ['per'] },
    accroche: ARGUMENTAIRES.per,
  }),
  preconfiguree({
    cle: 'scpi',
    nom: 'SCPI',
    criteres: { revenusMin: SEUILS.revenusScpi, famillesAbsentes: ['scpi'] },
    accroche: ARGUMENTAIRES.scpi,
  }),
  preconfiguree({
    cle: 'mutuelle_madelin',
    nom: 'Mutuelle Madelin',
    criteres: { statuts: ['TNS', 'Profession libérale'], famillesAbsentes: ['mutuelle'] },
    accroche: ARGUMENTAIRES.mutuelle,
  }),
  preconfiguree({
    cle: 'succession',
    nom: 'Succession',
    criteres: { ageMin: 60, patrimoineMin: SEUILS.patrimoineFortPotentiel },
    // Aucune règle du Multi équipement ne couvre la transmission : accroche
    // propre à la campagne, courte, sans promesse chiffrée.
    accroche: 'Vous avez construit un patrimoine : organiser sa transmission maintenant, c est choisir qui reçoit quoi et alléger les droits pour vos proches. On fait le point ensemble ?',
    sequence_key: 'apres_rdv',
  }),
  preconfiguree({
    cle: 'retraite',
    nom: 'Retraite',
    criteres: { ageMin: 50, ageMax: 64, famillesAbsentes: ['per'] },
    accroche: ARGUMENTAIRES.per,
  }),
]

export const campagnePreconfiguree = (cle) => CAMPAGNES_PRECONFIGUREES.find((c) => c.cle === cle) || null

// ─── Le résumé lisible des critères ───────────────────────────────────────

// Le séparateur de milliers français est une espace insécable ; selon la
// version d'ICU il sort fin (U+202F) ou classique (U+00A0). On fixe le
// classique pour que l'affichage et les tests ne dépendent pas du moteur.
const euros = (n) => `${Number(n).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} €`

/**
 * Les critères en une phrase courte, pour la liste des campagnes et la
 * confirmation de lancement. labels : clé de famille vers libellé.
 */
export function resumeCriteres(criteres, { famillesLabels = {}, conseillersLabels = {} } = {}) {
  const c = normaliserCriteres(criteres)
  const fam = (k) => famillesLabels[k] || k
  const cons = (k) => conseillersLabels[k] || k
  const parts = []
  if (c.statuts.length) parts.push(c.statuts.join(' ou '))
  if (c.ageMin != null && c.ageMax != null) parts.push(`${c.ageMin} à ${c.ageMax} ans`)
  else if (c.ageMin != null) parts.push(`${c.ageMin} ans et plus`)
  else if (c.ageMax != null) parts.push(`${c.ageMax} ans et moins`)
  if (c.revenusMin != null) parts.push(`revenus dès ${euros(c.revenusMin)}`)
  if (c.patrimoineMin != null) parts.push(`patrimoine dès ${euros(c.patrimoineMin)}`)
  if (c.situations.length) parts.push(c.situations.join(' ou '))
  if (c.enfantsMin != null) parts.push(`${c.enfantsMin} enfant${c.enfantsMin > 1 ? 's' : ''} ou plus`)
  if (c.famillesPresentes.length) parts.push(`avec ${c.famillesPresentes.map(fam).join(', ')}`)
  if (c.famillesAbsentes.length) parts.push(`sans ${c.famillesAbsentes.map(fam).join(', ')}`)
  if (c.conseillers.length) parts.push(`conseillers ${c.conseillers.map(cons).join(', ')}`)
  return parts.join(' · ')
}

// ─── L'entonnoir ──────────────────────────────────────────────────────────

const compteurVide = () => Object.fromEntries(STATUTS_CIBLE.map(({ cle }) => [cle, 0]))

/**
 * Comptes par statut de suivi, en tout et par conseiller. Prend les lignes de
 * campagne_cibles (statut, advisor_code). Aucun montant : des clients.
 *
 * @returns {{ total: number, parStatut: Object, parConseiller: Array<{ advisor_code, total, parStatut }> }}
 */
export function entonnoir(cibles) {
  const liste = Array.isArray(cibles) ? cibles.filter(Boolean) : []
  const parStatut = compteurVide()
  const parCode = new Map()
  for (const cible of liste) {
    const statut = STATUTS_CIBLE.some((s) => s.cle === cible.statut) ? cible.statut : 'a_contacter'
    parStatut[statut] += 1
    const code = cible.advisor_code || '—'
    if (!parCode.has(code)) parCode.set(code, { advisor_code: code, total: 0, parStatut: compteurVide() })
    const ligne = parCode.get(code)
    ligne.total += 1
    ligne.parStatut[statut] += 1
  }
  const parConseiller = [...parCode.values()]
    .sort((a, b) => (b.total - a.total) || a.advisor_code.localeCompare(b.advisor_code))
  return { total: liste.length, parStatut, parConseiller }
}

// ─── L'export CSV ─────────────────────────────────────────────────────────
// Même format que lib/export-csv : point virgule (Excel français), BOM UTF-8,
// retour chariot Windows, guillemets doublés, et une apostrophe devant toute
// valeur qui ressemble à une formule.

export const COLONNES_CSV = ['Nom', 'Prénom', 'Téléphone', 'Email', 'Conseiller', 'Statut', 'Âge', 'Revenus', 'Patrimoine', 'Familles']

const nombreFr = (v) => {
  const n = nombreOuNull(v)
  return n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ',')
}

/** Les valeurs d'une ligne, dans l'ordre de COLONNES_CSV. */
export function ligneCsv(cible, { famillesLabels = {}, conseillersLabels = {} } = {}) {
  const c = cible || {}
  const familles = Array.isArray(c.familles) ? c.familles : []
  return [
    c.nom ?? '',
    c.prenom ?? '',
    c.telephone ?? '',
    c.email ?? '',
    conseillersLabels[c.advisor_code] || c.advisor_code || '',
    libelleStatutCible(c.statut || 'a_contacter'),
    c.age == null ? '' : String(c.age),
    nombreFr(c.revenus_annuels),
    nombreFr(c.patrimoine_estime),
    familles.map((f) => famillesLabels[f] || f).join(', '),
  ]
}

// L'écran exporte avec exporterCsv (src/lib/export-csv.js), qui journalise et
// partage l'échappement de src/lib/csv-format.js. Cette lib ne fabrique que
// les lignes : pas de seconde protection contre les formules à maintenir.

// ─── Petits utilitaires pour les écrans ───────────────────────────────────

/** Nom de fichier sans accent ni espace : « Prévoyance TNS » devient prevoyance-tns. */
export function slugCampagne(nom) {
  return String(nom || 'campagne')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'campagne'
}

/**
 * Regroupe des cibles (avec leur campagne jointe) par campagne, en ne gardant
 * que celles à contacter d'une campagne non clôturée. Pour l'accueil du
 * conseiller.
 */
export function regrouperMesCibles(cibles) {
  const parCampagne = new Map()
  for (const cible of (Array.isArray(cibles) ? cibles : [])) {
    if (!cible || cible.statut !== 'a_contacter') continue
    const campagne = cible.campagnes || {}
    if (campagne.cloturee_at) continue
    const id = cible.campagne_id || campagne.id
    if (!id) continue
    if (!parCampagne.has(id)) {
      parCampagne.set(id, {
        id, nom: campagne.nom || 'Campagne', accroche: campagne.accroche || '',
        sequence_key: campagne.sequence_key || null, created_at: campagne.created_at || null, cibles: [],
      })
    }
    parCampagne.get(id).cibles.push(cible)
  }
  const groupes = [...parCampagne.values()]
  for (const g of groupes) {
    g.cibles.sort((a, b) => String(a.clients?.nom || '').localeCompare(String(b.clients?.nom || ''), 'fr'))
  }
  return groupes.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}
