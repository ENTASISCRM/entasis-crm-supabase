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
