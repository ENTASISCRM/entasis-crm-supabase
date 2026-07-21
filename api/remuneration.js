// api/remuneration.js
// Calcul des commissions cote SERVEUR. Le bareme (grille de taux, BAREME_PRODUITS)
// et le moteur calcul-commission.js ne partent plus dans le bundle navigateur :
// seule cette fonction les importe. Le navigateur envoie le mois, recoit les
// resultats deja calcules, jamais la grille de taux.
// Correctif audit securite 2026-07-03 (marge cabinet reservee a la direction).
//
// SECURITE : on cree un client Supabase avec le JWT de l APPELANT (pas le
// service_role), donc la RLS s applique exactement comme dans le navigateur.
// Un conseiller ne recoit que ses propres deals/contrat (pas d oracle de taux
// via des deals fabriques), un manager voit l equipe.

import { createClient } from '@supabase/supabase-js'
import {
  codesContrat,
  dealsDuConseiller,
  dealsDuMois,
  evaluerRentabilite,
  commissionsMois,
} from './_lib/calcul-commission.js'
import { TYPES_AVEC_SEUIL_RENTABILITE } from './_lib/bareme-entasis.js'

// Taux UCS (simulateur) fixe par TYPE de contrat, independant de la
// rentabilite du mois : salaries (CDI, CDD, Alternant, Stagiaire) au taux CDI
// (0,75 %), mandataires et gerants au taux mandataire (1,5 %, plein).
function tauxCdiApplicable(contrat) {
  return !!(contrat && TYPES_AVEC_SEUIL_RENTABILITE.includes(contrat.type_contrat))
}

const CLIENT_JOIN = 'id, nom, prenom, email, telephone, age, situation_familiale, nb_enfants, profession, revenus_annuels, patrimoine_estime, objectifs, notes, advisor_code, co_advisor_code'

// Meme forme que le fallback contrat absent cote client (evaluerRentabilite).
const RENTAB_VIDE = { rentabilise: true, brutCumule: 0, valeurCumulee: 0, ecart: 0 }
const COMM_VIDE = {
  variablePp: 0, variablePu: 0, variableHorsPalier: 0, total: 0,
  ppRealisee: 0, puRealisee: 0,
  palierPpAtteint: false, palierPuAtteint: false,
  rentabilise: true, detail: [],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' })

  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' })
  const token = authHeader.slice(7)

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: { user }, error: uErr } = await sb.auth.getUser(token)
  if (uErr || !user) return res.status(401).json({ error: 'Token invalide' })

  const { mode = 'perso', month, dateRefYear, dateRefMonthIndex } = req.body || {}
  // dateRef identique a monthStrToDate cote client : 15 du mois selectionne,
  // annee courante du navigateur (transmise pour eviter toute derive de mois).
  const dateRef = (Number.isInteger(dateRefYear) && Number.isInteger(dateRefMonthIndex))
    ? new Date(dateRefYear, dateRefMonthIndex, 15)
    : new Date()

  const { data: prof } = await sb
    .from('profiles').select('id, role, advisor_code, full_name').eq('id', user.id).maybeSingle()
  const isManager = prof?.role === 'manager'

  // Un contrat compte pour le mois de reference s il est EN POSTE sur ce mois :
  // commence au plus tard a la fin du mois, et pas termine avant le debut du mois.
  // Sans ce filtre, une embauche de septembre gonflait la masse fixe de juillet.
  const moisStart = new Date(dateRef.getFullYear(), dateRef.getMonth(), 1)
  const moisEnd = new Date(dateRef.getFullYear(), dateRef.getMonth() + 1, 0, 23, 59, 59)
  const enPosteCeMois = (c) =>
    (!c.date_debut || new Date(c.date_debut) <= moisEnd) &&
    (!c.date_fin || new Date(c.date_fin) >= moisStart)

  // Deals : la RLS cloisonne (conseiller = les siens, manager = tous).
  const { data: deals, error: dErr } = await sb
    .from('deals').select(`*, clients(${CLIENT_JOIN})`).order('created_at', { ascending: false })
  if (dErr) return res.status(500).json({ error: 'Deals: ' + dErr.message })

  // Calcule une ligne (rentab + comm) pour un contrat, moteur inchange.
  const calcLigne = (contrat, profileLie) => {
    const codes = codesContrat(contrat, profileLie)
    const dealsConseiller = dealsDuConseiller(deals || [], codes)
    const dealsMois = dealsDuMois(dealsConseiller, month)
    const rentab = evaluerRentabilite(contrat, dealsConseiller, profileLie, dateRef)
    const comm = commissionsMois(dealsMois, contrat, rentab, profileLie)
    return {
      contrat,
      rentab,
      comm,
      dealsMoisCount: dealsMois.length,
      totalBrut: Number(contrat.salaire_brut_mensuel || 0) + comm.total,
    }
  }

  try {
    if (mode === 'manager') {
      if (!isManager) return res.status(403).json({ error: 'Reserve a la direction' })
      const { data: contrats, error: cErr } = await sb
        .from('conseiller_contrats')
        .select('*, profile:profile_id(id, advisor_code, email, full_name)')
      if (cErr) return res.status(500).json({ error: 'Contrats: ' + cErr.message })
      const lignes = (contrats || [])
        .filter(c => c.actif && c.type_contrat !== 'GERANT' && enPosteCeMois(c))
        .map(c => calcLigne(c, c.profile || null))
      const totals = {
        fixe: lignes.reduce((s, l) => s + Number(l.contrat.salaire_brut_mensuel || 0), 0),
        variable: lignes.reduce((s, l) => s + l.comm.total, 0),
        total: lignes.reduce((s, l) => s + l.totalBrut, 0),
      }
      return res.status(200).json({ mode: 'manager', lignes, totals })
    }

    // perso : le contrat de l appelant (RLS restreint a sa propre ligne)
    const { data: contrat } = await sb
      .from('conseiller_contrats').select('*').eq('profile_id', user.id).eq('actif', true).maybeSingle()
    if (!contrat) {
      return res.status(200).json({ mode: 'perso', contrat: null, rentab: RENTAB_VIDE, comm: COMM_VIDE, dealsMoisCount: 0, tauxCdiApplicable: false })
    }
    const ligne = calcLigne(contrat, prof || null)
    return res.status(200).json({ mode: 'perso', ...ligne, tauxCdiApplicable: tauxCdiApplicable(contrat) })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Erreur calcul' })
  }
}
