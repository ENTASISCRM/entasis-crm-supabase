// api/pnl-charges.js
// ═══════════════════════════════════════════════════════════════════════════
// Ajouter, ajuster et supprimer une charge fixe.
//
// C est une route d ECRITURE dans une table confidentielle : elle exige
// exactement les memes trois preuves que la lecture, dans le meme ordre.
//   1. le jeton Supabase, qui dit qui vous etes ;
//   2. le jeton de deverrouillage, signe, lie a votre compte ET a votre
//      session, valable quinze minutes ;
//   3. le drapeau acces_pnl, relu en base a CHAQUE appel.
// Sans les trois, elle ne touche pas la base.
//
// Elle n accepte que des colonnes nommees une a une. Passer l objet du
// navigateur tel quel laisserait ecrire n importe quelle colonne, y compris
// celles qu on ne veut pas voir bouger depuis un ecran.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'
import { verifierJeton } from './_lib/pnl-jeton.js'

const REFUS = { error: 'Acces refuse' }

// Les seules valeurs admises. Une periodicite libre casserait la colonne
// calculee qui ramene tout au mois.
const PERIODICITES = ['MENSUEL', 'TRIMESTRIEL', 'ANNUEL', 'PONCTUEL']
const FIABILITES = ['FACTURE', 'MOYENNE', 'ESTIMATION']
const CATEGORIES = ['LOCAUX', 'OUTILS', 'COMPTABILITE', 'ASSURANCES', 'BANQUE',
  'PUBLICITE', 'VEHICULE', 'SOCIAL', 'FORMATION', 'AUTRE']

function adminClient() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!cle) return null
  return createClient(process.env.SUPABASE_URL, cle, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function journaliser(admin, { req, user, action, detail }) {
  try {
    await admin.from('pnl_acces_log').insert({
      profile_id: user?.id || null,
      email: user?.email || null,
      action,
      detail: detail ? String(detail).slice(0, 300) : null,
      ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || null,
      agent: req.headers['user-agent']?.slice(0, 300) || null,
    })
  } catch { /* le journal ne bloque jamais */ }
}

function sessionIdDuJeton(req) {
  try {
    const brut = (req.headers.authorization || '').replace('Bearer ', '')
    const charge = JSON.parse(Buffer.from(brut.split('.')[1], 'base64url').toString('utf8'))
    return charge?.session_id || null
  } catch { return null }
}

const texte = (v, max) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

// On construit la ligne colonne par colonne, jamais par recopie de l objet
// recu. Ce qui n est pas nomme ici n est pas ecrivable depuis l ecran.
function lignePropre(corps, { partielle }) {
  const out = {}
  const erreurs = []

  const poser = (cle, valeur, obligatoire, controle) => {
    if (valeur === undefined) {
      if (obligatoire && !partielle) erreurs.push(`${cle} est obligatoire`)
      return
    }
    const v = controle(valeur)
    if (v === undefined) { erreurs.push(`${cle} invalide`); return }
    out[cle] = v
  }

  poser('categorie', corps.categorie, true, (v) => {
    const s = String(v ?? '').trim().toUpperCase()
    return CATEGORIES.includes(s) ? s : undefined
  })
  poser('libelle', corps.libelle, true, (v) => texte(v, 120) ?? undefined)
  poser('fournisseur', corps.fournisseur, false, (v) => texte(v, 120))
  poser('montant', corps.montant, true, (v) => {
    const n = Number(v)
    // Un montant negatif serait un avoir, pas une charge fixe : il ferait
    // baisser le total sans que rien ne le dise a l ecran.
    return Number.isFinite(n) && n >= 0 && n <= 1e7 ? Math.round(n * 100) / 100 : undefined
  })
  poser('periodicite', corps.periodicite, true, (v) => {
    const s = String(v ?? '').trim().toUpperCase()
    return PERIODICITES.includes(s) ? s : undefined
  })
  poser('actif', corps.actif, false, (v) => (typeof v === 'boolean' ? v : undefined))
  poser('a_arbitrer', corps.a_arbitrer, false, (v) => (typeof v === 'boolean' ? v : undefined))
  poser('fiabilite', corps.fiabilite, false, (v) => {
    if (v === null || v === '') return null
    const s = String(v).trim().toUpperCase()
    return FIABILITES.includes(s) ? s : undefined
  })
  poser('source', corps.source, false, (v) => texte(v, 200))
  poser('notes', corps.notes, false, (v) => texte(v, 1000))
  const date = (v) => {
    if (v === null || v === '') return null
    const s = String(v).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined
  }
  poser('date_debut', corps.date_debut, false, date)
  poser('date_fin', corps.date_fin, false, date)

  if (out.date_debut && out.date_fin && out.date_fin < out.date_debut) {
    erreurs.push('la date de fin precede la date de debut')
  }
  return { ligne: out, erreurs }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' })

  const secret = process.env.PNL_SECRET
  const admin = adminClient()
  if (!secret || !admin) return res.status(500).json({ error: 'Espace rentabilite non configure' })

  let user
  try { user = await verifyAuth(req) }
  catch { return res.status(401).json(REFUS) }

  const jeton = req.headers['x-pnl-jeton'] || req.body?.jeton
  const v = verifierJeton({ jeton, userId: user.id, sessionId: sessionIdDuJeton(req), secret })
  if (!v.ok) {
    await journaliser(admin, { req, user, action: 'refus', detail: `charges, jeton refuse : ${v.motif}` })
    return res.status(403).json(REFUS)
  }

  const { data: profil } = await admin
    .from('profiles').select('acces_pnl, is_active').eq('id', user.id).maybeSingle()
  if (!profil?.acces_pnl || profil.is_active === false) {
    await journaliser(admin, { req, user, action: 'refus', detail: 'charges, drapeau retire entre temps' })
    return res.status(403).json(REFUS)
  }

  const action = String(req.body?.action || '')
  const id = req.body?.id ? String(req.body.id) : null
  const estUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '')

  try {
    if (action === 'creer') {
      const { ligne, erreurs } = lignePropre(req.body?.charge || {}, { partielle: false })
      if (erreurs.length) return res.status(400).json({ error: erreurs.join(', ') })
      const { data, error } = await admin.from('charges_fixes').insert(ligne)
        .select('*').single()
      if (error) throw error
      await journaliser(admin, { req, user, action: 'charge_creee', detail: `${data.categorie} ${data.libelle}` })
      return res.status(200).json({ charge: data })
    }

    if (action === 'modifier') {
      if (!estUuid(id)) return res.status(400).json({ error: 'Identifiant manquant' })
      const { ligne, erreurs } = lignePropre(req.body?.charge || {}, { partielle: true })
      if (erreurs.length) return res.status(400).json({ error: erreurs.join(', ') })
      if (!Object.keys(ligne).length) return res.status(400).json({ error: 'Rien a modifier' })
      ligne.updated_at = new Date().toISOString()
      const { data, error } = await admin.from('charges_fixes').update(ligne).eq('id', id)
        .select('*').single()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Charge introuvable' })
      await journaliser(admin, { req, user, action: 'charge_modifiee', detail: `${data.libelle} : ${Object.keys(ligne).join(', ')}` })
      return res.status(200).json({ charge: data })
    }

    if (action === 'supprimer') {
      if (!estUuid(id)) return res.status(400).json({ error: 'Identifiant manquant' })
      // On rend la ligne supprimee : l ecran peut proposer d annuler sans
      // avoir a la redemander, et le journal garde ce qui a disparu.
      const { data, error } = await admin.from('charges_fixes').delete().eq('id', id)
        .select('*').maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'Charge introuvable' })
      await journaliser(admin, { req, user, action: 'charge_supprimee',
        detail: `${data.categorie} ${data.libelle} ${data.montant} ${data.periodicite}` })
      return res.status(200).json({ supprimee: data })
    }

    return res.status(400).json({ error: 'Action inconnue' })
  } catch (e) {
    await journaliser(admin, { req, user, action: 'refus', detail: `charges, erreur : ${e.message}` })
    return res.status(500).json({ error: 'Enregistrement impossible' })
  }
}
