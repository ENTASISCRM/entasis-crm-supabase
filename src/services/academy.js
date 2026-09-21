// src/services/academy.js
// Couche d'accès Supabase de l'Entasis Academy, la rubrique de formation
// interne (migrations 20260921_academy_1_socle et 20260921_academy_2_fonctions).
//
// Presque tout passe par des fonctions SQL security definer qui lisent
// l'identité dans auth.uid() : un collaborateur ne voit que son parcours, ses
// tentatives et ses rappels ; la direction lit le pilotage, les fiches et la
// matrice des compétences ; seul l'administrateur de l'Academy crée,
// versionne, publie et archive les modules. Rien ici ne filtre « pour
// protéger » : la base tranche, le navigateur affiche.
//
// Trois tables s'écrivent en direct sous RLS :
//   * academy_progression_lecons : le collaborateur ne peut poser que sa
//     propre position de lecture (colonnes position et updated_at, la ligne
//     est créée par academy_ouvrir_session ; terminee_le ne se pose que par
//     academy_terminer_lecon, un déclencheur l'impose) ;
//   * academy_parametres : l'administrateur seul ;
//   * academy_commentaires_coaching : la direction seule.
// Ces écritures se terminent par .select('id') et passent par
// verifierEcriture : une ligne que la base refuse en silence doit se voir.

import { supabase } from '../lib/supabase'
import { verifierEcriture, MOTIF_DROITS } from '../lib/ecriture-verifiee'
import { logger } from '../lib/logger'

// Les seules colonnes que l'écran des réglages peut écrire. Une colonne
// inconnue ferait refuser tout le PATCH par PostgREST (400 PGRST204).
const COLONNES_PARAMETRES = [
  'seuil_reussite_defaut', 'delai_j7', 'delai_j30', 'questions_par_quiz',
  'questions_par_revision', 'retention_intervalles_mois', 'inactivite_secondes',
  'pas_battement_secondes', 'notice_donnees',
]

async function idUtilisateur() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  } catch {
    return null
  }
}

// Journalise l'échec sous le nom de la fonction du service, puis relance :
// l'écran garde l'erreur d'origine (message PostgREST ou refus RLS).
async function journaliser(nomFonction, fn) {
  try {
    return await fn()
  } catch (e) {
    logger.error(`[academy] ${nomFonction}`, e)
    throw e
  }
}

// Un appel de fonction SQL. `defaut` remplace un data null (tableau vide
// pour une liste, null pour un objet).
function appel(nomFonction, fonctionSql, params, defaut = null) {
  return journaliser(nomFonction, async () => {
    const { data, error } = await supabase.rpc(fonctionSql, params)
    if (error) throw error
    return data ?? defaut
  })
}

// ─── Réseau ───────────────────────────────────────────────────────────────

const MOTIFS_RESEAU = ['failed to fetch', 'networkerror', 'load failed', 'network request failed']

/** Vrai pour une coupure réseau (fetch qui n'a pas abouti), faux pour tout le reste. */
export function estErreurReseau(e) {
  const message = String(e?.message ?? e ?? '').toLowerCase()
  return MOTIFS_RESEAU.some((motif) => message.includes(motif))
}

/**
 * Rejoue `fn` sur une erreur réseau, et seulement sur celle là : un refus de
 * la RLS, une contrainte violée ou une session expirée ne changeront pas
 * en réessayant, on les remonte tout de suite. Sert aux écritures de fond
 * (battement d'activité, position de lecture) qu'une coupure de réseau
 * d'une seconde ne doit pas transformer en erreur à l'écran.
 */
export async function avecRetry(fn, { essais = 3, attentesMs = [800, 1600] } = {}) {
  const total = Math.max(1, Number(essais) || 1)
  let derniere
  for (let i = 0; i < total; i += 1) {
    try {
      return await fn()
    } catch (e) {
      derniere = e
      if (!estErreurReseau(e) || i === total - 1) throw e
      const attente = attentesMs[Math.min(i, attentesMs.length - 1)] ?? 0
      await new Promise((resolve) => setTimeout(resolve, attente))
    }
  }
  throw derniere
}

// ─── Collaborateur : catalogue, parcours, leçons ──────────────────────────

/** Les modules publiés, avec l'affectation du collaborateur s'il en a une. */
export async function listerCatalogue() {
  return appel('listerCatalogue', 'academy_catalogue', undefined, [])
}

/** Un module complet (leçons, affectation, validation, attestation, tentatives). */
export async function lireModule(slug) {
  if (!slug) throw new Error('Module sans identifiant.')
  return appel('lireModule', 'academy_module', { p_slug: slug })
}

/** Le tableau de bord du collaborateur : affectations, révisions, temps actif. */
export async function monParcours() {
  return appel('monParcours', 'academy_mon_parcours')
}

/** Toutes les tentatives soumises par le collaborateur. */
export async function mesTentatives() {
  return appel('mesTentatives', 'academy_mes_tentatives', undefined, [])
}

/** Les rappels du jour (échéances, révisions) regroupés par type. */
export async function mesRappels() {
  return appel('mesRappels', 'academy_mes_rappels', undefined, [])
}

/** Une leçon avec son contenu, sa mini question et la progression du lecteur. */
export async function lireLecon(leconId) {
  if (!leconId) throw new Error('Leçon sans identifiant.')
  return appel('lireLecon', 'academy_lecon', { p_lecon_id: leconId })
}

/**
 * Ouvre une session de lecture. Le jeton (uuid tiré par le navigateur) rend
 * l'appel rejouable : un second envoi du même jeton rend la même session.
 * @returns {Promise<string>} identifiant de session
 */
export async function ouvrirSession(leconId, jeton) {
  if (!leconId) throw new Error('Leçon sans identifiant.')
  if (!jeton) throw new Error('Session sans jeton.')
  return appel('ouvrirSession', 'academy_ouvrir_session', { p_lecon_id: leconId, p_jeton: jeton })
}

/** Un battement d'activité. Rejoué sur coupure réseau. @returns {Promise<string>} horodatage */
export async function battement(sessionId) {
  if (!sessionId) throw new Error('Battement sans session.')
  return journaliser('battement', () => avecRetry(async () => {
    const { data, error } = await supabase.rpc('academy_battement', { p_session_id: sessionId })
    if (error) throw error
    return data
  }))
}

/**
 * Enregistre la position de reprise d'une leçon.
 *
 * Pas d'upsert PostgREST ici : la base ne donne au navigateur que le droit
 * d'écrire position et updated_at (grant par colonne), et PostgREST pose
 * toutes les colonnes envoyées dans le ON CONFLICT DO UPDATE, ce que la base
 * refuserait. On met donc la ligne à jour (elle existe dès l'ouverture de la
 * session) et, seulement si elle manque, on la crée sans écraser une ligne
 * apparue entre temps (onConflict, ignoreDuplicates).
 */
export async function sauverPosition(leconId, versionId, position) {
  if (!leconId) throw new Error('Leçon sans identifiant.')
  return journaliser('sauverPosition', () => avecRetry(async () => {
    const profileId = await idUtilisateur()
    if (!profileId) throw new Error('Session expirée : reconnectez vous pour enregistrer la progression.')
    const valeur = position && typeof position === 'object' ? position : {}

    const maj = await supabase
      .from('academy_progression_lecons')
      .update({ position: valeur, updated_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .eq('lecon_id', leconId)
      .select('id')
    if (maj.error) throw maj.error
    if (Array.isArray(maj.data) && maj.data.length > 0) return maj.data

    if (!versionId) throw new Error('Enregistrement de la progression : la version du module est inconnue.')
    const creation = await supabase
      .from('academy_progression_lecons')
      .upsert(
        { profile_id: profileId, lecon_id: leconId, version_id: versionId, position: valeur },
        { onConflict: 'profile_id,lecon_id', ignoreDuplicates: true },
      )
      .select('id')
    return verifierEcriture(creation, 'Enregistrement de la progression', MOTIF_DROITS)
  }))
}

/**
 * Termine une leçon : la base juge la mini question et pose terminee_le.
 * @returns {Promise<{ correcte: boolean, explication: string, terminee_le: string, statut_module: string }>}
 */
export async function terminerLecon(leconId, reponse) {
  if (!leconId) throw new Error('Leçon sans identifiant.')
  return appel('terminerLecon', 'academy_terminer_lecon', { p_lecon_id: leconId, p_reponse: reponse ?? null })
}

// ─── Quiz et révisions ────────────────────────────────────────────────────

/**
 * Ouvre une tentative (quiz de module ou révision). Le jeton rend l'appel
 * rejouable comme pour la session. Les questions arrivent sans corrigé.
 */
export async function ouvrirTentative(versionId, type, jeton) {
  if (!versionId) throw new Error('Tentative sans version de module.')
  if (!jeton) throw new Error('Tentative sans jeton.')
  return appel('ouvrirTentative', 'academy_ouvrir_tentative', { p_version_id: versionId, p_type: type, p_jeton: jeton })
}

/**
 * Soumet les réponses ({ question_id: index }) et reçoit le corrigé complet,
 * le score et, le cas échéant, l'attestation délivrée.
 */
export async function soumettreTentative(tentativeId, reponses) {
  if (!tentativeId) throw new Error('Tentative sans identifiant.')
  return appel('soumettreTentative', 'academy_soumettre_tentative', {
    p_tentative_id: tentativeId,
    p_reponses: reponses && typeof reponses === 'object' ? reponses : {},
  })
}

/** Le corrigé d'une tentative déjà soumise, même objet que la soumission. */
export async function corrige(tentativeId) {
  if (!tentativeId) throw new Error('Tentative sans identifiant.')
  return appel('corrige', 'academy_corrige', { p_tentative_id: tentativeId })
}

// ─── Direction : pilotage, fiches, matrice ────────────────────────────────

/** Le pilotage sur une période (dates AAAA-MM-JJ, null pour tout). */
export async function pilotage(depuis = null, jusqua = null) {
  return appel('pilotage', 'academy_pilotage', { p_depuis: depuis || null, p_jusqua: jusqua || null })
}

/** La fiche formation d'un collaborateur. */
export async function fiche(profileId) {
  if (!profileId) throw new Error('Fiche sans collaborateur.')
  return appel('fiche', 'academy_fiche', { p_profile_id: profileId })
}

/** La matrice compétences par collaborateur. */
export async function matrice() {
  return appel('matrice', 'academy_matrice_competences')
}

/** Un commentaire de coaching sur la fiche d'un collaborateur (direction). */
export async function commenterCoaching(profileId, texte) {
  if (!profileId) throw new Error('Commentaire sans collaborateur.')
  const texteNet = String(texte || '').trim()
  if (!texteNet) throw new Error('Le commentaire est vide.')
  return journaliser('commenterCoaching', async () => {
    const reponse = await supabase
      .from('academy_commentaires_coaching')
      .insert({ profile_id: profileId, auteur_id: await idUtilisateur(), texte: texteNet })
      .select('id')
    return verifierEcriture(reponse, 'Enregistrement du commentaire', MOTIF_DROITS)
  })
}

// ─── Administration : affectations ────────────────────────────────────────

/**
 * Affecte un module ou un parcours à des collaborateurs.
 * @returns {Promise<number>} nombre d'affectations créées
 */
export async function affecter({ profileIds, moduleId = null, parcoursId = null, echeance = null, obligatoire = true }) {
  const ids = (Array.isArray(profileIds) ? profileIds : []).filter(Boolean)
  if (ids.length === 0) throw new Error('Aucun collaborateur à affecter.')
  if (!moduleId && !parcoursId) throw new Error('Rien à affecter : ni module ni parcours.')
  return appel('affecter', 'academy_affecter', {
    p_profile_ids: ids,
    p_module_id: moduleId || null,
    p_parcours_id: parcoursId || null,
    p_echeance: echeance || null,
    p_obligatoire: obligatoire !== false,
  }, 0)
}

export async function modifierEcheance(affectationId, echeance, obligatoire = null) {
  if (!affectationId) throw new Error('Affectation sans identifiant.')
  return appel('modifierEcheance', 'academy_modifier_echeance', {
    p_affectation_id: affectationId,
    p_echeance: echeance || null,
    p_obligatoire: obligatoire ?? null,
  })
}

export async function retirerAffectation(affectationId) {
  if (!affectationId) throw new Error('Affectation sans identifiant.')
  return appel('retirerAffectation', 'academy_retirer_affectation', { p_affectation_id: affectationId })
}

// ─── Administration : modules, versions, parcours, réglages ───────────────

/** La vue d'ensemble de l'administration (modules, parcours, collaborateurs, journal). */
export async function adminVue() {
  return appel('adminVue', 'academy_admin_vue')
}

/** Une version complète, corrigés inclus (administrateur seulement). */
export async function versionAdmin(versionId) {
  if (!versionId) throw new Error('Version sans identifiant.')
  return appel('versionAdmin', 'academy_version_admin', { p_version_id: versionId })
}

/** @returns {Promise<{ module_id: string, version_id: string }>} */
export async function creerModule({ slug, titre, theme, niveau }) {
  const slugNet = String(slug || '').trim()
  const titreNet = String(titre || '').trim()
  if (!slugNet || !titreNet) throw new Error('Un module a besoin d\'un identifiant et d\'un titre.')
  return appel('creerModule', 'academy_creer_module', {
    p_slug: slugNet, p_titre: titreNet, p_theme: theme || null, p_niveau: niveau || null,
  })
}

/** Ouvre un brouillon à partir de la version en ligne. @returns {Promise<string>} */
export async function nouvelleVersion(moduleId) {
  if (!moduleId) throw new Error('Module sans identifiant.')
  return appel('nouvelleVersion', 'academy_nouvelle_version', { p_module_id: moduleId })
}

export async function enregistrerVersion(versionId, patch) {
  if (!versionId) throw new Error('Version sans identifiant.')
  return appel('enregistrerVersion', 'academy_enregistrer_version', { p_version_id: versionId, p_patch: patch || {} })
}

/** leconId null crée la leçon. @returns {Promise<string>} identifiant de la leçon */
export async function enregistrerLecon(versionId, leconId, patch) {
  if (!versionId) throw new Error('Version sans identifiant.')
  return appel('enregistrerLecon', 'academy_enregistrer_lecon', {
    p_version_id: versionId, p_lecon_id: leconId || null, p_patch: patch || {},
  })
}

/** questionId null crée la question. @returns {Promise<string>} identifiant de la question */
export async function enregistrerQuestion(versionId, questionId, patch) {
  if (!versionId) throw new Error('Version sans identifiant.')
  return appel('enregistrerQuestion', 'academy_enregistrer_question', {
    p_version_id: versionId, p_question_id: questionId || null, p_patch: patch || {},
  })
}

/**
 * Publie une version relue. `imposer` remet en formation ceux qui avaient
 * validé la version précédente.
 */
export async function publierVersion(versionId, { reluPar, commentaire = null, imposer = false } = {}) {
  if (!versionId) throw new Error('Version sans identifiant.')
  const relecteur = String(reluPar || '').trim()
  if (!relecteur) throw new Error('Une version ne se publie pas sans relecteur.')
  return appel('publierVersion', 'academy_publier_version', {
    p_version_id: versionId,
    p_relu_par: relecteur,
    p_commentaire: String(commentaire || '').trim() || null,
    p_imposer_nouvelle_formation: imposer === true,
  })
}

export async function archiverVersion(versionId) {
  if (!versionId) throw new Error('Version sans identifiant.')
  return appel('archiverVersion', 'academy_archiver_version', { p_version_id: versionId })
}

/** parcoursId null crée le parcours. @returns {Promise<string>} */
export async function enregistrerParcours(parcoursId, patch) {
  return appel('enregistrerParcours', 'academy_enregistrer_parcours', {
    p_parcours_id: parcoursId || null, p_patch: patch || {},
  })
}

/** Les réglages du cabinet (une seule ligne, id = true). Administrateur seulement. */
export async function enregistrerParametres(patch) {
  const propre = {}
  for (const cle of COLONNES_PARAMETRES) {
    if (patch && patch[cle] !== undefined) propre[cle] = patch[cle]
  }
  if (Object.keys(propre).length === 0) throw new Error('Aucun réglage à enregistrer.')
  propre.updated_at = new Date().toISOString()
  return journaliser('enregistrerParametres', async () => {
    const reponse = await supabase
      .from('academy_parametres')
      .update(propre)
      .eq('id', true)
      .select('id')
    return verifierEcriture(reponse, 'Enregistrement des paramètres', MOTIF_DROITS)
  })
}
