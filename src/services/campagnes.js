// src/services/campagnes.js
// Couche d'accès Supabase pour les campagnes ciblées (tables campagnes et
// campagne_cibles, migration 20260902090000).
//
// La RLS fait le tri : tout le cabinet lit les campagnes, seule la direction
// les crée et insère des cibles, un conseiller ne voit et ne met à jour que
// ses propres cibles. Rien ici ne filtre « pour protéger » : les filtres ne
// servent qu'à l'affichage.
//
// Toute écriture passe par verifierEcriture ou verifierEcritureLot : une
// ligne que la base refuse en silence doit se voir, jamais passer pour
// enregistrée.

import { supabase } from '../lib/supabase'
import { verifierEcriture, verifierEcritureLot, MOTIF_DROITS, MOTIF_PROPRIETE } from '../lib/ecriture-verifiee'
import { STATUTS_CIBLE } from '../lib/campagnes'

// PostgREST accepte des lots bien plus gros, mais 200 lignes gardent chaque
// requête courte et un refus lisible (« 150 sur 200 traités »).
const TAILLE_LOT = 200

const COLONNES_CAMPAGNE = 'id, nom, criteres, sequence_key, accroche, created_by, created_at, cloturee_at'
const COLONNES_CIBLE = 'id, campagne_id, client_id, advisor_code, statut, note, updated_at, updated_by'

async function idUtilisateur() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  } catch {
    return null
  }
}

/** Toutes les campagnes visibles, la plus récente d'abord. */
export async function listerCampagnes() {
  const { data, error } = await supabase
    .from('campagnes')
    .select(COLONNES_CAMPAGNE)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Crée la campagne puis ses cibles par lots. Chaque lot est vérifié : une
 * insertion refusée lève, et la campagne à moitié remplie est retirée pour
 * ne pas laisser une liste tronquée chez les conseillers.
 *
 * @param {{ nom: string, criteres: Object, sequence_key?: string, accroche?: string }} campagne
 * @param {Array<{ id: string, advisor_code?: string }>} cibles clients ciblés (id de la fiche)
 * @returns {Promise<{ id: string, nbCibles: number }>}
 */
export async function creerCampagne({ nom, criteres, sequence_key, accroche }, cibles) {
  const nomPropre = String(nom || '').trim()
  if (!nomPropre) throw new Error('Le nom de la campagne est vide.')
  const liste = (Array.isArray(cibles) ? cibles : []).filter((c) => c?.id)
  if (liste.length === 0) throw new Error('Aucune cible : la campagne ne serait envoyée à personne.')

  const auteur = await idUtilisateur()
  const creation = await supabase
    .from('campagnes')
    .insert({
      nom: nomPropre,
      criteres: criteres || {},
      sequence_key: sequence_key || null,
      accroche: String(accroche || '').trim() || null,
      created_by: auteur,
    })
    .select('id')
  const [campagne] = verifierEcriture(creation, 'Création de la campagne', MOTIF_DROITS)

  let inserees = 0
  try {
    for (let i = 0; i < liste.length; i += TAILLE_LOT) {
      const lot = liste.slice(i, i + TAILLE_LOT).map((c) => ({
        campagne_id: campagne.id,
        client_id: c.id,
        advisor_code: c.advisor_code || null,
        updated_by: auteur,
      }))
      const reponse = await supabase.from('campagne_cibles').insert(lot).select('id')
      inserees += verifierEcritureLot(reponse, lot.length, 'Enregistrement des cibles').length
    }
  } catch (e) {
    // La suppression est en cascade sur les cibles déjà écrites. Si elle
    // échoue à son tour, c'est l'erreur d'origine qu'on remonte.
    await supabase.from('campagnes').delete().eq('id', campagne.id).then(() => {}, () => {})
    throw e
  }
  return { id: campagne.id, nbCibles: inserees }
}

/**
 * Les cibles encore à contacter, avec la fiche client et la campagne
 * jointes. La RLS rend celles du conseiller connecté (toutes pour la
 * direction). Les campagnes clôturées sont écartées ici, à l'affichage.
 */
export async function listerMesCibles() {
  const { data, error } = await supabase
    .from('campagne_cibles')
    .select(`${COLONNES_CIBLE}, clients(id, nom, prenom, telephone, email), campagnes(id, nom, accroche, sequence_key, created_at, cloturee_at)`)
    .eq('statut', 'a_contacter')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []).filter((c) => !c.campagnes?.cloturee_at)
}

/**
 * Fait avancer une cible dans l'entonnoir. note : undefined la laisse en
 * place, null ou chaîne vide l'efface.
 */
export async function majStatutCible(id, statut, note) {
  if (!id) throw new Error('Cible sans identifiant.')
  if (!STATUTS_CIBLE.some((s) => s.cle === statut)) throw new Error(`Statut de suivi inconnu : ${statut}`)
  const patch = { statut, updated_at: new Date().toISOString(), updated_by: await idUtilisateur() }
  if (note !== undefined) patch.note = String(note || '').trim() || null
  const reponse = await supabase.from('campagne_cibles').update(patch).eq('id', id).select('id')
  return verifierEcriture(reponse, 'Mise à jour de la cible', MOTIF_PROPRIETE)
}

/** Les cibles d'une campagne, avec la fiche client, pour le détail direction. */
export async function listerCiblesCampagne(campagneId) {
  if (!campagneId) return []
  const { data, error } = await supabase
    .from('campagne_cibles')
    .select(`${COLONNES_CIBLE}, clients(id, nom, prenom, telephone, email)`)
    .eq('campagne_id', campagneId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Les cibles de plusieurs campagnes en une requête, colonnes légères : de
 * quoi calculer l'entonnoir de chaque campagne (lib/campagnes.entonnoir).
 */
export async function listerCiblesParCampagnes(campagneIds) {
  const ids = (Array.isArray(campagneIds) ? campagneIds : []).filter(Boolean)
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('campagne_cibles')
    .select('id, campagne_id, advisor_code, statut')
    .in('campagne_id', ids)
  if (error) throw error
  return data || []
}

/** Clôture une campagne : elle disparaît de l'accueil des conseillers. */
export async function cloturerCampagne(id) {
  if (!id) throw new Error('Campagne sans identifiant.')
  const reponse = await supabase
    .from('campagnes')
    .update({ cloturee_at: new Date().toISOString() })
    .eq('id', id)
    .is('cloturee_at', null)
    .select('id')
  return verifierEcriture(reponse, 'Clôture de la campagne', MOTIF_DROITS)
}
