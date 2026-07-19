// src/services/ratios.js
// Couche d acces et agregation pour le Cockpit conseillers (idee 85).
// Un cockpit resume, par conseiller et sur le mois courant plus les 3 mois
// precedents : nombre de deals signes, collecte (pu plus pp_m fois douze des
// Signe), nombre de clients, taux de multi equipement du portefeuille,
// missions cross sell gagnees ce mois et missions reportees.
//
// La RLS fait tout le perimetre : le manager recoit le cabinet entier, le
// conseiller ne recoit que ses propres lignes. Aucune ecriture ici, lecture
// pure. L agregation est isolee dans computeCockpit (fonction pure, testable
// hors reseau) pour garder le composant leger.

import { supabase } from '../lib/supabase'

// Les n derniers mois calendaires (courant inclus), du plus ancien au plus
// recent, au format YYYY-MM. Sert de colonnes a la serie de collecte.
export function derniersMois(n = 4) {
  const out = []
  const base = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

// Deals signes depuis le premier jour de la fenetre. date_signed est un TEXT
// ISO YYYY-MM-DD, donc comparable lexicographiquement avec un gte sur la borne.
export async function listDealsSignes(moisDebut) {
  const { data, error } = await supabase
    .from('deals')
    .select('advisor_code, date_signed, pp_m, pu')
    .eq('status', 'Signé')
    .not('date_signed', 'is', null)
    .gte('date_signed', `${moisDebut}-01`)
  if (error) throw error
  return data || []
}

// Portefeuille : un id plus le conseiller, pour compter les clients par
// conseiller (le denominateur du portefeuille).
export async function listClientsLeger() {
  const { data, error } = await supabase.from('clients').select('id, advisor_code')
  if (error) throw error
  return data || []
}

// Equipement par client (vue client_equipment, RLS security invoker) :
// conseiller plus nombre de familles detenues, base du taux de multi.
export async function listEquipementLeger() {
  const { data, error } = await supabase.from('client_equipment').select('advisor_code, nb_familles')
  if (error) throw error
  return data || []
}

// Missions cross sell (table me_missions, RLS alignee clients) : etat, montant
// reel et date, pour compter les gagnees du mois et les reportees en cours.
export async function listMissionsLeger() {
  const { data, error } = await supabase
    .from('me_missions')
    .select('advisor_code, statut, montant_reel, updated_at')
  if (error) throw error
  return data || []
}

// Charge tout ce qu il faut pour le cockpit en un aller retour parallele.
export async function loadCockpit(nMois = 4) {
  const mois = derniersMois(nMois)
  const [deals, clients, equip, missions] = await Promise.all([
    listDealsSignes(mois[0]),
    listClientsLeger(),
    listEquipementLeger(),
    listMissionsLeger(),
  ])
  return { mois, deals, clients, equip, missions }
}

// ─── Agregation pure ─────────────────────────────────────────────────────
// Construit une ligne par conseiller. Le manager en obtient plusieurs, le
// conseiller une seule (la RLS a deja filtre les donnees en amont). La
// collecte est attribuee au advisor_code principal du deal ; la co detention
// n est pas repartie ici, ce serait une autre regle de calcul.
export function computeCockpit({ mois, deals, clients, equip, missions, team = [], isManager, advisorCode }) {
  const moisCourant = mois[mois.length - 1]
  const idxMois = new Map(mois.map((m, i) => [m, i]))
  const nomParCode = new Map((team || []).map((p) => [p.advisor_code, p.full_name]))

  // Ensemble des conseillers a afficher. Manager : tous ceux qui apparaissent
  // dans une source. Conseiller : lui seul (donnees deja restreintes par RLS).
  const codes = new Set()
  if (isManager) {
    for (const d of deals) if (d.advisor_code) codes.add(d.advisor_code)
    for (const c of clients) if (c.advisor_code) codes.add(c.advisor_code)
    for (const e of equip) if (e.advisor_code) codes.add(e.advisor_code)
    for (const m of missions) if (m.advisor_code) codes.add(m.advisor_code)
  } else if (advisorCode) {
    codes.add(advisorCode)
  }

  const lignes = []
  for (const code of codes) {
    // Collecte mois par mois sur la fenetre (serie du sparkline).
    const serie = mois.map(() => 0)
    let nbDealsMois = 0
    for (const d of deals) {
      if (d.advisor_code !== code) continue
      const mk = (d.date_signed || '').slice(0, 7)
      const i = idxMois.get(mk)
      if (i == null) continue
      serie[i] += Number(d.pu || 0) + Number(d.pp_m || 0) * 12
      if (mk === moisCourant) nbDealsMois += 1
    }
    const collecteMois = serie[serie.length - 1]
    // Moyenne des mois precedents : la reference personnelle du conseiller,
    // hors mois courant. C est cette base qui sert de comparaison, jamais les
    // autres conseillers (confidentialite Remuneration, pas de palmares).
    const precedents = serie.slice(0, -1)
    const baseline = precedents.length ? precedents.reduce((s, v) => s + v, 0) / precedents.length : 0

    // Portefeuille et taux de multi equipement.
    const nbClients = clients.filter((c) => c.advisor_code === code).length
    const eqCode = equip.filter((e) => e.advisor_code === code)
    const multi = eqCode.filter((e) => Number(e.nb_familles || 0) >= 2).length
    const tauxMulti = eqCode.length ? Math.round((100 * multi) / eqCode.length) : 0

    // Missions cross sell : gagnees du mois (via updated_at) et reportees en cours.
    const misCode = missions.filter((m) => m.advisor_code === code)
    const gagneesMois = misCode.filter(
      (m) => m.statut === 'gagnee' && (m.updated_at || '').slice(0, 7) === moisCourant,
    ).length
    const reportees = misCode.filter((m) => m.statut === 'reportee').length

    lignes.push({
      code,
      nom: nomParCode.get(code) || code,
      serie,
      collecteMois,
      baseline,
      deltaPct: baseline > 0 ? Math.round(((collecteMois - baseline) / baseline) * 100) : null,
      nbDealsMois,
      nbClients,
      tauxMulti,
      multi,
      eqCount: eqCode.length,
      gagneesMois,
      reportees,
    })
  }
  // Tri alphabetique, jamais par performance : aucun classement entre pairs.
  lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  return { mois, moisCourant, lignes }
}

// ─── Completude des fiches clients (constructeur 3) ──────────────────────────
// Objectif : forcer la saisie des fiches, la data est capitale. Une fiche est
// « complete » selon EXACTEMENT la meme regle que le verrou de signature en
// base (fonction exiger_fiche_complete_a_la_signature) : email, telephone,
// statut_pro et profession non vides apres trim, revenus_annuels et
// patrimoine_estime non null (zero compte comme une valeur saisie, le verrou ne
// teste que is null). date_naissance ne compte PAS dans l obligatoire, c est un
// bonus pour les anniversaires, signale a part comme « recommande ». Aucune
// ecriture, tout est lecture pure et agregation pure.

// Les six champs obligatoires, memes que le verrou de signature.
export const CHAMPS_OBLIGATOIRES = ['email', 'telephone', 'statut_pro', 'profession', 'revenus_annuels', 'patrimoine_estime']

// Un champ texte est renseigne si, une fois trimme, il n est pas vide.
function texteRenseigne(v) {
  return String(v ?? '').trim() !== ''
}

// Un champ numerique est renseigne des qu il n est pas null (zero compte comme
// une valeur saisie, exactement comme le verrou qui ne teste que is null).
function nombreRenseigne(v) {
  return v !== null && v !== undefined
}

// Les champs obligatoires manquants sur une fiche, en libelles lisibles, dans le
// meme ordre et avec les memes mots que le message d erreur du verrou.
export function champsManquants(client) {
  const manque = []
  if (!texteRenseigne(client?.email)) manque.push('email')
  if (!texteRenseigne(client?.telephone)) manque.push('téléphone')
  if (!texteRenseigne(client?.statut_pro)) manque.push('statut')
  if (!texteRenseigne(client?.profession)) manque.push('profession')
  if (!nombreRenseigne(client?.revenus_annuels)) manque.push('revenus annuels')
  if (!nombreRenseigne(client?.patrimoine_estime)) manque.push('patrimoine estimé')
  return manque
}

// Une fiche est complete quand aucun champ obligatoire ne manque.
export function ficheComplete(client) {
  return champsManquants(client).length === 0
}

// date_naissance : bonus (anniversaires), signale a part comme recommande.
export function naissanceRenseignee(client) {
  return texteRenseigne(client?.date_naissance)
}

// Les codes conseiller rattaches a une fiche : le principal et le co conseiller
// s il existe et differe. La fiche compte pour chacun d eux (perimetre
// advisor_code / co_advisor_code), sans jamais compter deux fois le meme code.
function codesDuClient(client) {
  const codes = new Set()
  if (texteRenseigne(client?.advisor_code)) codes.add(client.advisor_code)
  if (texteRenseigne(client?.co_advisor_code)) codes.add(client.co_advisor_code)
  return codes
}

// Fonction pure : le taux de completude par conseiller. Chaque fiche est
// attribuee a son conseiller principal ET a son co conseiller. Retourne une
// ligne par code { code, total, complets, incompletes, pct, sansNaissance },
// triee par PIRE taux d abord (ceux a relancer en tete), egalite departagee par
// le plus grand nombre d incompletes puis par code.
export function completudeParConseiller(clients = []) {
  const parCode = new Map()
  for (const c of clients) {
    const complete = ficheComplete(c)
    const naissance = naissanceRenseignee(c)
    for (const code of codesDuClient(c)) {
      let ligne = parCode.get(code)
      if (!ligne) { ligne = { code, total: 0, complets: 0, sansNaissance: 0 }; parCode.set(code, ligne) }
      ligne.total += 1
      if (complete) ligne.complets += 1
      if (!naissance) ligne.sansNaissance += 1
    }
  }
  const lignes = [...parCode.values()].map((l) => ({
    ...l,
    incompletes: l.total - l.complets,
    pct: l.total ? Math.round((100 * l.complets) / l.total) : 0,
  }))
  lignes.sort((a, b) => a.pct - b.pct || b.incompletes - a.incompletes || String(a.code).localeCompare(String(b.code), 'fr'))
  return lignes
}

// Fonction pure : l agregat sur un lot de fiches, chaque fiche comptee une seule
// fois (la carte « Tes fiches » du conseiller, ou un total cabinet). La RLS a
// deja restreint le perimetre en amont, donc les fiches recues sont bien celles
// que l on doit compter.
export function completudeGlobale(clients = []) {
  const total = clients.length
  let complets = 0
  let sansNaissance = 0
  for (const c of clients) {
    if (ficheComplete(c)) complets += 1
    if (!naissanceRenseignee(c)) sansNaissance += 1
  }
  return {
    total,
    complets,
    incompletes: total - complets,
    sansNaissance,
    pct: total ? Math.round((100 * complets) / total) : 0,
  }
}

// Fetch dedie : les fiches avec les six champs obligatoires, plus
// co_advisor_code (double rattachement) et date_naissance (bonus). La RLS fait
// le perimetre (manager tout le cabinet, conseiller ses fiches). Lecture pure.
export async function listClientsCompletude() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, advisor_code, co_advisor_code, email, telephone, statut_pro, profession, revenus_annuels, patrimoine_estime, date_naissance')
  if (error) throw error
  return data || []
}
