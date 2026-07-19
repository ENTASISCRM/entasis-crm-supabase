// src/services/offres.js
// Couche de calcul et d action des Playbooks Offres (vague C).
//
// Deux roles :
//   1  LIRE et enrichir le portefeuille visible (RLS) en objets clients prets
//      pour les predicats des offres (config/offres.js).
//   2  COMPTER les cibles d une offre et GENERER les missions correspondantes
//      dans le moteur V3 Multi equipement (table me_missions via missions.js).
//
// Perimetre : la vue client_equipment et la table clients portent la meme RLS
// (manager voit tout, conseiller voit ses clients). Aucune requete filtree ici,
// c est la base qui applique le perimetre.

import { supabase } from '../lib/supabase'
import { listEquipment } from './equipment'
import { listMissions, upsertMission } from './missions'

// Fabrique l objet client enrichi attendu par les predicats cible(client).
// Fusionne une ligne client_equipment (familles, revenus, patrimoine, statut)
// avec la base clients (age, nb enfants, non exposes par la vue).
export function enrichir(equip = {}, base = null) {
  const familles = Array.isArray(equip.familles) ? equip.familles : []
  const b = base || {}
  return {
    client_id: equip.client_id,
    nom: equip.nom || '',
    prenom: equip.prenom || '',
    nomComplet: `${equip.prenom || ''} ${equip.nom || ''}`.trim() || '(sans nom)',
    advisor_code: equip.advisor_code || null,
    statut: equip.statut_pro || '',
    profession: equip.profession || '',
    revenus: Number(equip.revenus_annuels || 0),
    patrimoine: Number(equip.patrimoine_estime || 0),
    familles,
    nb_familles: Number(equip.nb_familles != null ? equip.nb_familles : familles.length),
    nb_enfants: b.nb_enfants != null ? Number(b.nb_enfants) : null,
    age: b.age != null ? Number(b.age) : null,
  }
}

// Age et nombre d enfants ne sont pas exposes par la vue client_equipment :
// on les lit sur la table clients (meme RLS) pour completer l enrichissement.
// En cas d echec (colonne, RLS, reseau) on renvoie une liste vide : les offres
// actuelles n utilisent ni age ni nb_enfants, l enrichissement degrade sans
// casser le calcul des cibles.
async function lireClientsBase() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, age, nb_enfants')
  if (error) return []
  return data || []
}

// Charge une fois le portefeuille visible et renvoie la liste des clients
// enrichis, prete a passer aux predicats des offres.
export async function chargerClientsEnrichis() {
  const [equip, base] = await Promise.all([listEquipment(), lireClientsBase()])
  const baseParId = new Map((base || []).map((c) => [c.id, c]))
  return (equip || []).map((e) => enrichir(e, baseParId.get(e.client_id)))
}

// Liste des clients cibles d une offre sur un portefeuille deja enrichi.
// Un predicat qui leve (data incomplete) exclut simplement le client.
export function ciblesDe(offre, clients) {
  if (!offre || typeof offre.cible !== 'function') return []
  return (clients || []).filter((c) => {
    try { return offre.cible(c) } catch { return false }
  })
}

// Nombre de clients cibles d une offre (base de l affichage en direct).
export function compterCibles(offre, clients) {
  return ciblesDe(offre, clients).length
}

// Lance la campagne : cree une mission a_attaquer sur famille_cible pour chaque
// client cible SANS mission existante sur cette famille (quel que soit son
// statut : on ne recree jamais un binome client plus famille deja present).
// Renvoie le nombre de missions reellement creees.
export async function genererMissions(offre, clientsCibles) {
  if (!offre || !offre.famille_cible || !Array.isArray(clientsCibles) || clientsCibles.length === 0) return 0

  let existantes = []
  try { existantes = await listMissions() } catch { existantes = [] }
  const dejaPrises = new Set(
    existantes.filter((m) => m.famille === offre.famille_cible).map((m) => m.client_id),
  )

  let crees = 0
  for (const c of clientsCibles) {
    if (!c || !c.client_id || dejaPrises.has(c.client_id)) continue
    try {
      await upsertMission({
        client_id: c.client_id,
        famille: offre.famille_cible,
        patch: {
          statut: 'a_attaquer',
          montant_estime: offre.ticket_estime,
          advisor_code: c.advisor_code || null,
        },
      })
      // On marque tout de suite le client pour ne pas le recompter si la liste
      // contenait un doublon, et pour rester exact meme sur reprise partielle.
      dejaPrises.add(c.client_id)
      crees += 1
    } catch {
      // Une ecriture refusee (RLS, reseau) ne bloque pas le reste de la campagne.
    }
  }
  return crees
}
