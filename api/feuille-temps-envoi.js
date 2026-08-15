// api/feuille-temps-envoi.js
// Envoi de la feuille de temps a la comptable, DECLENCHE A LA MAIN par la
// direction depuis la carte Comptabilite de Smart RH (decision Louis : pas
// d envoi planifie). Le PDF est genere ici puis part par GMAIL depuis la
// boite de Louis (compte de service, delegation domaine, pas de Brevo).
//
// SECURITE : reserve aux profils RH (public.is_rh()), donnees lues avec le
// JWT de l appelant (RLS identique au navigateur), destinataire fixe par la
// variable d environnement COMPTABLE_EMAIL (jamais fourni par le client).

import { createClient } from '@supabase/supabase-js'
import { calculerFeuille, genererPdf } from '../scripts/rh/feuille-temps-mensuelle.mjs'
import { envoyerMailGmail } from './_lib/gmail.js'

const MOIS_LONGS = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']

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

  const { data: estRh } = await sb.rpc('is_rh')
  if (estRh !== true) return res.status(403).json({ error: 'Reserve a la direction RH' })

  const mois = String(req.body?.mois || '')
  if (!/^\d{4}-\d{2}$/.test(mois)) return res.status(400).json({ error: 'Mois invalide (attendu YYYY-MM)' })
  const [annee, moisNum] = mois.split('-').map(Number)
  if (moisNum < 1 || moisNum > 12) return res.status(400).json({ error: 'Mois invalide' })

  try {
    const { data: contrats, error: e1 } = await sb
      .from('conseiller_contrats')
      .select('*, profile:profile_id(id, role, email)')
    if (e1) throw e1
    const { data: conges, error: e2 } = await sb.from('rh_conges').select('*')
    if (e2) throw e2

    const feuille = calculerFeuille({ contrats: contrats || [], conges: conges || [], annee, moisNum })
    if (feuille.lignes.length === 0) return res.status(400).json({ error: 'Aucun salarie sur ce mois' })
    const pdf = genererPdf({ ...feuille, annee, moisNum })

    const destinataire = process.env.COMPTABLE_EMAIL || 'louis.hatton@entasis-conseil.fr'
    await envoyerMailGmail({
      to: [destinataire],
      pieces: [{ nom: `feuille-temps-entasis-${mois}.pdf`, contenu: pdf, mime: 'application/pdf' }],
      sujet: `Feuille de temps Entasis · ${MOIS_LONGS[moisNum - 1]} ${annee}`,
      corps: `Bonjour,\n\nVeuillez trouver ci-joint la feuille de temps de l equipe Entasis pour ${MOIS_LONGS[moisNum - 1]} ${annee} : jours travailles, absences detaillees, conges decomptes et soldes, plus les mouvements de contrats.\n\nBien a vous,\nLouis Hatton\nEntasis Conseil`,
    })
    return res.status(200).json({ sent: true, destinataire, salaries: feuille.lignes.length })
  } catch (e) {
    console.error('[feuille-temps-envoi]', e)
    return res.status(500).json({ error: e?.message || 'Erreur envoi' })
  }
}
