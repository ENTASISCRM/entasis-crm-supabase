// src/services/academy.js
// Couche d'accès Supabase de l'Entasis Academy, la rubrique de formation
// interne (migrations 20260921_academy_1 à 6 ; le mode entraînement est la
// migration 6).
//
// Presque tout passe par des fonctions SQL security definer qui lisent
// l'identité dans auth.uid() : un collaborateur ne voit que ses decks, ses
// sessions, sa série et ses rappels ; la direction lit le pilotage, les
// fiches et la matrice ; seul l'administrateur de l'Academy crée, versionne,
// publie et archive les decks. Rien ici ne filtre « pour protéger » : la base
// tranche, le navigateur affiche. Une session d'entraînement se joue par
// trois fonctions : demarrerEntrainement (tirage et mélange côté serveur),
// repondre (correction immédiate, répétition espacée, battement d'activité),
// terminerEntrainement (XP, série, couronnes, validation).
//
// Deux tables s'écrivent en direct sous RLS :
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

/** Un deck complet : mémo, maîtrise, sessions, affectation, validation, attestation. */
export async function lireModule(slug) {
  if (!slug) throw new Error('Module sans identifiant.')
  return appel('lireModule', 'academy_module', { p_slug: slug })
}

/** Le tableau de bord du collaborateur : affectations, révisions, temps actif. */
export async function monParcours() {
  return appel('monParcours', 'academy_mon_parcours')
}


/** Les rappels du jour (échéances, révisions) regroupés par type. */
export async function mesRappels() {
  return appel('mesRappels', 'academy_mes_rappels', undefined, [])
}

/**
 * La formation est ouverte au cabinet dès qu'un module est publié. Avant,
 * seuls la direction et l'administrateur voient l'onglet Formation : la
 * relecture se fait sans que l'équipe découvre une rubrique vide. Lecture
 * directe sous RLS (un collaborateur ne voit que les versions publiées) ;
 * une erreur vaut « fermée », jamais une ouverture par défaut.
 */
export async function formationOuverte() {
  try {
    const { data, error } = await supabase.from('academy_module_versions').select('id').eq('statut', 'publie').limit(1)
    if (error) throw error
    return Array.isArray(data) && data.length > 0
  } catch (e) {
    logger.error('[academy] formationOuverte', e)
    return false
  }
}

/**
 * Ouvre une session d'entraînement sur un deck. Le jeton (uuid tiré par le
 * navigateur) rend l'appel rejouable : un second envoi rend la même session.
 * Rend { entrainement_id, version_id, titre, slug, items:[{item_id, rang,
 * type, competence, payload}], reponses_deja:[{item_id, correcte}] }.
 */
export async function demarrerEntrainement(versionId, jeton) {
  if (!versionId) throw new Error('Deck sans identifiant.')
  if (!jeton) throw new Error('Session sans jeton.')
  return appel('demarrerEntrainement', 'academy_demarrer_entrainement', { p_version_id: versionId, p_jeton: jeton })
}

/**
 * Répond à un exercice : la base corrige, met la répétition espacée à jour et
 * compte le temps actif. Rejoué sur coupure réseau (idempotent par item).
 * Rend { correcte, bonne_reponse, explication, force, deja }.
 */
export async function repondre(entrainementId, itemId, reponse) {
  if (!entrainementId || !itemId) throw new Error('Réponse sans session ou sans exercice.')
  return journaliser('repondre', () => avecRetry(async () => {
    const { data, error } = await supabase.rpc('academy_repondre', { p_entrainement_id: entrainementId, p_item_id: itemId, p_reponse: reponse ?? null })
    if (error) throw error
    return data
  }))
}

/**
 * Termine la session : XP, série, couronnes, validation. Rend le résumé
 * { nb_bons, nb_total, xp, serie, couronnes_avant, couronnes_apres, valide,
 * attestation, erreurs:[...] }. Rejouer rend le même résumé.
 */
export async function terminerEntrainement(entrainementId) {
  if (!entrainementId) throw new Error('Session sans identifiant.')
  return journaliser('terminerEntrainement', () => avecRetry(async () => {
    const { data, error } = await supabase.rpc('academy_terminer_entrainement', { p_entrainement_id: entrainementId })
    if (error) throw error
    return data
  }))
}

/** Sessions, XP par semaine, série et exercices faibles du collaborateur. */
export async function mesResultats() {
  return appel('mesResultats', 'academy_mes_resultats')
}

/** Nombre de sessions visées par jour (1 à 10). */
export async function objectifQuotidien(objectif) {
  return appel('objectifQuotidien', 'academy_objectif_quotidien', { p_objectif: Number(objectif) || 1 }, null)
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

/**
 * Crée (itemId null) ou modifie un exercice d'un brouillon. Le patch porte
 * type, competence, difficulte, payload, corrige, explication, ordre,
 * archive. Rend l'identifiant de l'exercice.
 */
export async function enregistrerItem(versionId, itemId, patch) {
  if (!versionId) throw new Error('Version sans identifiant.')
  return appel('enregistrerItem', 'academy_enregistrer_item', { p_version_id: versionId, p_item_id: itemId || null, p_patch: patch || {} })
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
