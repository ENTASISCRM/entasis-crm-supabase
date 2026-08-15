// api/mandataires.js
// Conformite des mandataires (onglet Pilotage RH). Trois actions :
//   - verif_inpi   : interroge Pappers (registre national des entreprises)
//                    pour un SIREN et renvoie l etat d immatriculation
//   - commissions  : commissions versees par Entasis a chaque mandataire,
//                    ventilees par trimestre (barème serveur, jamais expose)
//   - relance      : mail au mandataire pour reclamer sa declaration URSSAF
//                    du trimestre (envoi DECLENCHE PAR LA DIRECTION, jamais
//                    automatique), depuis la boite Gmail d Entasis
//
// SECURITE : toutes les actions sont reservees aux profils RH (is_rh()).
// La cle Pappers reste server side. Les destinataires du mail sont lus en
// base, jamais fournis par le client.

import { createClient } from '@supabase/supabase-js'
import {
  codesContrat, dealsDuConseiller,
  evaluerRentabilite, commissionsMois,
} from './_lib/calcul-commission.js'
import { envoyerMailGmail } from './_lib/gmail.js'

const CLIENT_JOIN = 'id, nom, prenom, age, situation_familiale, nb_enfants, profession, revenus_annuels, patrimoine_estime, advisor_code, co_advisor_code'

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

  const action = String(req.body?.action || '')

  try {
    // ── Verification INPI / RNE via Pappers ───────────────────────────────
    if (action === 'verif_inpi') {
      const siren = String(req.body?.siren || '').replace(/\s/g, '')
      if (!/^\d{9}$/.test(siren)) return res.status(400).json({ error: 'SIREN invalide (9 chiffres attendus)' })
      if (!process.env.PAPPERS_API_KEY) return res.status(500).json({ error: 'Cle Pappers absente' })

      const r = await fetch(`https://api.pappers.fr/v2/entreprise?api_token=${process.env.PAPPERS_API_KEY}&siren=${siren}`)
      if (r.status === 404) {
        return res.status(200).json({
          statut: 'introuvable',
          detail: 'Aucune entreprise trouvee pour ce SIREN au registre national.',
        })
      }
      if (!r.ok) return res.status(502).json({ error: `Pappers ${r.status}` })
      const e = await r.json()

      const cessee = e.entreprise_cessee === true || !!e.date_cessation
      const denomination = e.nom_entreprise || e.denomination || e.sigle ||
        [e.prenom, e.nom].filter(Boolean).join(' ') || null
      const immat = e.date_immatriculation_rne || e.date_immatriculation_rcs || e.date_creation || null
      const detail = [
        e.forme_juridique || null,
        e.statut_rcs || null,
        e.code_naf ? `NAF ${e.code_naf}` : null,
        cessee && e.date_cessation ? `cessation ${e.date_cessation}` : null,
      ].filter(Boolean).join(' · ')

      return res.status(200).json({
        statut: cessee ? 'cessee' : 'actif',
        denomination,
        forme_juridique: e.forme_juridique || null,
        immatriculation: immat,
        detail: detail || null,
      })
    }

    // ── Commissions versees par trimestre ────────────────────────────────
    // Le trimestre est deduit de la DATE DE SIGNATURE reelle, jamais du
    // libelle de mois du dossier : les deux peuvent diverger (un dossier
    // signe en decembre 2025 porte parfois un libelle recycle). Un dossier
    // signe sans date n est attribue a aucun trimestre et remonte a part.
    if (action === 'commissions') {
      const annee = Number(req.body?.annee)
      if (!Number.isInteger(annee) || annee < 2020 || annee > 2100) {
        return res.status(400).json({ error: 'Annee invalide' })
      }
      const { data: contrats, error: cErr } = await sb
        .from('conseiller_contrats')
        .select('*, profile:profile_id(id, advisor_code, email, full_name)')
        .eq('type_contrat', 'MANDATAIRE')
      if (cErr) throw cErr
      const { data: deals, error: dErr } = await sb
        .from('deals').select(`*, clients(${CLIENT_JOIN})`)
      if (dErr) throw dErr

      const out = {}
      for (const contrat of contrats || []) {
        const profil = contrat.profile || null
        const codes = codesContrat(contrat, profil)
        const dealsConseiller = dealsDuConseiller(deals || [], codes, profil?.id || null)

        // Fenetre du mandat : hors de cette periode, aucune commission n est
        // due au titre du mandat (arrivee ou fin en cours d annee).
        const debut = contrat.date_debut ? new Date(`${String(contrat.date_debut).slice(0, 10)}T00:00:00`) : null
        const fin = contrat.date_fin ? new Date(`${String(contrat.date_fin).slice(0, 10)}T23:59:59`) : null

        const parMois = new Map()
        let sansDate = 0
        for (const d of dealsConseiller) {
          if (d.status !== 'Signé') continue
          if (!d.date_signed) { sansDate++; continue }
          // Minuit LOCAL comme debut/fin ci dessus (new Date('YYYY-MM-DD')
          // serait minuit UTC : un dossier du 1er avril basculerait en T1
          // sur un runtime a decalage negatif).
          const dt = new Date(`${String(d.date_signed).slice(0, 10)}T00:00:00`)
          if (Number.isNaN(dt.getTime())) { sansDate++; continue }
          if (dt.getFullYear() !== annee) continue
          if (debut && dt < debut) continue
          if (fin && dt > fin) continue
          const m = dt.getMonth()
          parMois.set(m, [...(parMois.get(m) || []), d])
        }

        const trimestres = { 1: 0, 2: 0, 3: 0, 4: 0 }
        for (const [m, dealsM] of parMois) {
          const rentab = evaluerRentabilite(contrat, dealsConseiller, profil, new Date(annee, m, 15))
          const comm = commissionsMois(dealsM, contrat, rentab, profil)
          trimestres[Math.floor(m / 3) + 1] += Number(comm.total || 0)
        }

        // Trimestres reellement couverts par le mandat (pour l affichage)
        const couverts = [1, 2, 3, 4].filter((t) => {
          const dT = new Date(annee, (t - 1) * 3, 1)
          const fT = new Date(annee, t * 3, 0, 23, 59, 59)
          return (!debut || debut <= fT) && (!fin || fin >= dT)
        })

        out[contrat.id] = {
          T1: Math.round(trimestres[1] * 100) / 100,
          T2: Math.round(trimestres[2] * 100) / 100,
          T3: Math.round(trimestres[3] * 100) / 100,
          T4: Math.round(trimestres[4] * 100) / 100,
          couverts,
          sansDate,
        }
      }
      return res.status(200).json({ annee, commissions: out })
    }

    // ── Relance URSSAF (declenchee par la direction) ──────────────────────
    if (action === 'relance') {
      const { contrat_id: contratId } = req.body || {}
      const annee = Number(req.body?.annee)
      const trimestre = Number(req.body?.trimestre)
      if (!contratId || !Number.isInteger(annee) || ![1, 2, 3, 4].includes(trimestre)) {
        return res.status(400).json({ error: 'Requete incomplete' })
      }
      const { data: contrat, error: cErr } = await sb
        .from('conseiller_contrats')
        .select('id, full_name, type_contrat, profile:profile_id(email, full_name)')
        .eq('id', contratId).maybeSingle()
      if (cErr) throw cErr
      if (!contrat || contrat.type_contrat !== 'MANDATAIRE') {
        return res.status(400).json({ error: 'Contrat mandataire introuvable' })
      }
      const dest = contrat.profile?.email
      if (!dest) return res.status(400).json({ error: 'Aucune adresse mail connue pour ce mandataire' })

      const { data: prof } = await sb
        .from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()
      const prenom = String(contrat.full_name || '').trim().split(' ')[0] || ''

      await envoyerMailGmail({
        to: [dest],
        repondreA: prof?.email || undefined,
        sujet: `Declaration URSSAF T${trimestre} ${annee} : copie a nous transmettre`,
        corps: `Bonjour ${prenom},\n\n`
          + `J espere que vous allez bien.\n\n`
          + `Dans le cadre du suivi de nos partenariats en mandat, pourriez-vous nous transmettre `
          + `la copie de votre declaration trimestrielle URSSAF du T${trimestre} ${annee}, `
          + `mentionnant le chiffre d affaires declare sur la periode ?\n\n`
          + `Ce document nous permet de rapprocher les commissions que nous vous avons versees `
          + `avec vos declarations, comme le prevoit notre obligation de vigilance.\n\n`
          + `Un simple retour par mail avec le justificatif en piece jointe suffit.\n\n`
          + `Bien a vous,\n${prof?.full_name || 'La direction'}\nEntasis Conseil`,
      })

      // Le mail est parti : un echec de tracabilite ne doit pas faire croire
      // a un echec d envoi (sinon la direction relance une seconde fois).
      let avertissement = null
      const { error: upErr } = await sb.from('mandataire_urssaf').upsert({
        contrat_id: contratId,
        annee,
        trimestre,
        relance_le: new Date().toISOString(),
        relance_par: prof?.full_name || 'Direction',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'contrat_id,annee,trimestre' })
      if (upErr) {
        console.error('[mandataires] tracabilite relance', upErr)
        avertissement = 'Relance envoyée mais non enregistrée dans le suivi'
      }

      return res.status(200).json({ sent: true, destinataire: dest, avertissement })
    }

    return res.status(400).json({ error: 'Action inconnue' })
  } catch (e) {
    console.error('[mandataires]', action, e)
    return res.status(500).json({ error: e?.message || 'Erreur serveur' })
  }
}
