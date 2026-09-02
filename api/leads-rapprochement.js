// api/leads-rapprochement.js
// Rapprochement « signé dans la Lead Room, jamais saisi dans le CRM »,
// réservé au manager. La Lead Room connaît un statut « signed » que la copie
// CRM des leads n'a pas : une affaire signée là bas peut donc rester sans
// dossier ici, ou avec un brouillon « Prévu · Autre » jamais converti. Cette
// fonction lit les deux bases et rend la liste des cas à rattraper.
//
// Modèle : api/remuneration.js et api/team-calendar.js. L'appelant est
// authentifié par verifyAuth, son rôle est lu avec le client service_role
// (aucune RLS ne s'applique sur la base de la Lead Room, on contrôle donc le
// rôle nous mêmes), puis on lit la Lead Room avec sa propre clé, qui ne
// quitte jamais le serveur.
//
// Variables d'environnement (Vercel, côté serveur uniquement) :
//   SUPABASE_URL, SUPABASE_ANON_KEY          base CRM, vérification du jeton (api/_auth.js)
//   SUPABASE_SERVICE_ROLE_KEY                base CRM, rôle de l'appelant, dossiers, profils
//   LEADROOM_SUPABASE_URL                    projet Supabase de la Lead Room (mtqowhjshvgkpkhnpilb)
//   LEADROOM_SUPABASE_SERVICE_ROLE_KEY       sa clé service_role, lecture seule ici
// Si les deux dernières manquent, la réponse est un 500 explicite
// « Accès Lead Room non configuré côté serveur » et l'écran le dit en une ligne.
//
// Jamais de montant ni de commission : le select des dossiers ne lit ni
// pp_m, ni pu, ni frais.

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'
import { rapprocherLeads } from './_lib/rapprochement-leads.js'

const JOURS = 120
const STATUTS_LEAD_ROOM = ['signed', 'rdv']
const LIMITE_LEADS = 500
// PostgREST passe les filtres `in` dans l'URL : on découpe pour rester loin
// de la limite de longueur.
const LOT = 100

const sansSession = { auth: { persistSession: false, autoRefreshToken: false } }

async function parLots(ids, lire) {
  const tout = []
  for (let i = 0; i < ids.length; i += LOT) {
    const { data, error } = await lire(ids.slice(i, i + LOT))
    if (error) throw error
    tout.push(...(data || []))
  }
  return tout
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

  // 1. Authentifier l'appelant (vrai jeton Supabase)
  let caller
  try {
    caller = await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  // 2. Rôle manager, lu avec le client service_role de la base CRM
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!adminKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configuré côté serveur' })
  const admin = createClient(process.env.SUPABASE_URL, adminKey, sansSession)
  const { data: prof, error: profErr } = await admin
    .from('profiles').select('role').eq('id', caller.id).maybeSingle()
  if (profErr || !prof) return res.status(403).json({ error: 'Profil appelant introuvable' })
  if (prof.role !== 'manager') return res.status(403).json({ error: 'Réservé à la direction' })

  // 3. Accès à la base de la Lead Room
  const lrUrl = (process.env.LEADROOM_SUPABASE_URL || '').trim()
  const lrKey = (process.env.LEADROOM_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!lrUrl || !lrKey) {
    return res.status(500).json({ error: 'Accès Lead Room non configuré côté serveur' })
  }
  const leadRoom = createClient(lrUrl, lrKey, sansSession)

  try {
    // 4. Les leads signés ou avec RDV posé, côté Lead Room, sur 120 jours
    const depuis = new Date(Date.now() - JOURS * 86400000).toISOString()
    const { data: leadsLr, error: lrErr } = await leadRoom
      .from('leads')
      .select('id, name, status, taken_by, taken_at, updated_at, rdv_date, email, phone')
      .in('status', STATUTS_LEAD_ROOM)
      .gte('updated_at', depuis)
      .order('updated_at', { ascending: false })
      .limit(LIMITE_LEADS)
    if (lrErr) return res.status(502).json({ error: 'Lead Room : ' + lrErr.message })
    const leads = leadsLr || []
    if (!leads.length) return res.status(200).json({ lignes: [], jours: JOURS })

    // 5. Les dossiers CRM qui portent un de ces lead_id (sans aucun montant)
    const ids = leads.map((l) => String(l.id))
    const deals = await parLots(ids, (lot) => admin
      .from('deals')
      .select('lead_id, status, product, advisor_code, client, client_email, client_phone')
      .in('lead_id', lot))

    // 6. Nommer le conseiller : preneur Lead Room (advisors) puis profil CRM
    //    par email. Facultatif : une lecture qui échoue laisse « inconnu ».
    const advisorParId = new Map()
    const codeParEmail = new Map()
    try {
      const preneurs = Array.from(new Set(leads.map((l) => l.taken_by).filter(Boolean).map(String)))
      if (preneurs.length) {
        const advisors = await parLots(preneurs, (lot) => leadRoom
          .from('advisors').select('id, email').in('id', lot))
        for (const a of advisors) advisorParId.set(String(a.id), { email: a.email })
        const emails = advisors.map((a) => String(a.email || '').trim().toLowerCase()).filter(Boolean)
        if (emails.length) {
          const profils = await parLots(emails, (lot) => admin
            .from('profiles').select('email, advisor_code').in('email', lot))
          for (const p of profils) {
            if (p.email && p.advisor_code) codeParEmail.set(String(p.email).trim().toLowerCase(), p.advisor_code)
          }
        }
      }
    } catch (e) {
      console.warn('[leads-rapprochement] conseiller introuvable :', e?.message)
    }

    const lignes = rapprocherLeads(leads, deals, { advisorParId, codeParEmail })
    return res.status(200).json({ lignes, jours: JOURS })
  } catch (e) {
    console.error('[leads-rapprochement]', e)
    return res.status(500).json({ error: e?.message || 'Erreur de rapprochement' })
  }
}
