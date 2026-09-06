// api/pnl.js
// ═══════════════════════════════════════════════════════════════════════════
// Les chiffres de rentabilite. Exige LES DEUX jetons : celui de Supabase (qui
// dit qui vous etes) et celui du deverrouillage (qui dit que vous avez donne
// le code, dans cette session, il y a moins de quinze minutes).
//
// Sans les deux, la route repond 403 et ne calcule RIEN : elle ne touche meme
// pas la base. C est ici que le bareme s applique, jamais dans le navigateur.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'
import { verifierJeton } from './_lib/pnl-jeton.js'
import {
  retrocessionsAnnuelles, appliquerRetrocessions,
  contributionsAnnuelles, enrichirContributions,
} from './_lib/pnl-retrocessions.js'

const REFUS = { error: 'Acces refuse' }

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' })

  const secret = process.env.PNL_SECRET
  const admin = adminClient()
  if (!secret || !admin) return res.status(500).json({ error: 'Espace rentabilite non configure' })

  // ── Les deux jetons, avant toute lecture de donnee ───────────────────────
  let user
  try { user = await verifyAuth(req) }
  catch { return res.status(401).json(REFUS) }

  const jeton = req.headers['x-pnl-jeton'] || req.body?.jeton
  const v = verifierJeton({
    jeton, userId: user.id, sessionId: sessionIdDuJeton(req), secret,
  })
  if (!v.ok) {
    await journaliser(admin, { req, user, action: 'refus', detail: `jeton refuse : ${v.motif}` })
    return res.status(403).json(REFUS)
  }

  // Ceinture et bretelles : le drapeau est revalide a CHAQUE lecture. Si Louis
  // le retire a quelqu un, son jeton de quinze minutes ne lui sert plus.
  const { data: profil } = await admin
    .from('profiles').select('acces_pnl, is_active').eq('id', user.id).maybeSingle()
  if (!profil?.acces_pnl || profil.is_active === false) {
    await journaliser(admin, { req, user, action: 'refus', detail: 'drapeau retire entre temps' })
    return res.status(403).json(REFUS)
  }

  const annee = Number(req.body?.annee) || new Date().getFullYear()
  const vue = String(req.body?.vue || 'tout')
  // L ecran peut demander la vue avec ou sans la part de frais fixes. Ce
  // choix ne deplace que des couts entre les personnes : le resultat du
  // cabinet, lui, prend toujours la structure pour son montant annuel entier.
  const repartir = typeof req.body?.repartir === 'boolean' ? req.body.repartir : null

  try {
    // ── Les lignes par personne, calculees en base ────────────────────────
    const { data: lignesBrutes, error } = await admin.rpc('pnl_conseiller_annuel', {
      p_annee: annee, p_repartir: repartir,
    })
    if (error) throw error

    // ── La retrocession due aux conseillers ───────────────────────────────
    // La moitie de l equipe est payee a la commission, et c est le SEUL cout
    // d un mandataire. On rejoue le bareme deja configure dans le CRM, mois
    // par mois, plutot que d inventer un taux : les deux ecrans, fiche de
    // remuneration et rentabilite, doivent dire la meme chose.
    const [{ data: deals }, { data: contrats }] = await Promise.all([
      admin.from('deals').select('*'),
      admin.from('conseiller_contrats')
        .select('*, profile:profile_id(id, advisor_code, full_name, is_active)'),
    ])

    const retro = retrocessionsAnnuelles({
      deals: deals || [], contrats: contrats || [], annee,
    })
    const avecRetro = appliquerRetrocessions(lignesBrutes || [], retro)

    // ── Qui a produit, en direct depuis le CRM ────────────────────────────
    // Le total reste celui de la banque, seul montant reel. La cle de partage
    // vient du CRM, qui connait le co conseil : une affaire signee a deux
    // compte pour moitie a chacun. Une affaire signee aujourd hui bouge donc
    // la rentabilite de chacun sans aucune saisie.
    const contributions = contributionsAnnuelles({
      deals: deals || [], contrats: contrats || [], annee,
    })

    // ── Le mensuel, lu directement du grand livre ─────────────────────────
    const { data: mensuel } = await admin
      .from('production_encaissee')
      .select('mois, volume_pp, volume_pu, commission_encaissee, commission_attendue, retrocession')
      .eq('annee', annee)
      // Le mensuel du cabinet vient des RELEVES BANCAIRES : c est le seul
      // chiffre reconcilie a l euro pres. Les bordereaux servent a savoir QUI
      // a produit, pas COMBIEN le cabinet a encaisse.
      .eq('source', 'BANQUE')

    const parMois = Array.from({ length: 12 }, (_, i) => ({
      mois: i + 1, pp: 0, pu: 0, commission: 0, attendue: 0, retrocession: 0, contrats: 0,
    }))
    for (const l of mensuel || []) {
      const m = parMois[(l.mois || 1) - 1]
      if (!m) continue
      m.pp += Number(l.volume_pp || 0)
      m.pu += Number(l.volume_pu || 0)
      m.commission += Number(l.commission_encaissee || 0)
      m.attendue += Number(l.commission_attendue || 0)
      m.retrocession += Number(l.retrocession || 0)
      m.contrats += 1
    }

    // ── Le cout mensuel COURANT ───────────────────────────────────────────
    // L annuel dit combien ca a coute. Celui ci dit combien ca coute en ce
    // moment, et c est la seule base pour repondre a « combien il manque ».
    const { data: courantLignes } = await admin.rpc('pnl_cout_mensuel_courant', {})
    const courant = Array.isArray(courantLignes) ? courantLignes[0] : courantLignes

    // ── Les charges fixes, poste par poste ────────────────────────────────
    // On envoie le detail : un chiffre agrege que personne ne peut ouvrir
    // redevient une hypothese au bout de trois mois.
    const { data: charges } = await admin
      .from('charges_fixes')
      .select('categorie, libelle, fournisseur, montant, periodicite, montant_mensuel, actif, fiabilite, source, a_arbitrer, notes')
      .order('categorie').order('montant_mensuel', { ascending: false })

    // Ce que le grand livre contient, par source. Le module ne compte QUE les
    // bordereaux reellement payes : le CA MOIS mesure la production signee,
    // pas l encaissement, et les deux sont decales d un a trois mois.
    const { data: sources } = await admin
      .from('v_production_par_source').select('*').eq('annee', annee)

    // ── Le pilotage : ou en est on de l objectif de resultat ──────────────
    // Mois passes : la tresorerie reelle, calee sur les soldes bancaires.
    // Mois a venir : le cout previsionnel, sans inventer de recette.
    const { data: pilotageLignes } = await admin.rpc('pnl_pilotage', { p_annee: annee })

    const { data: prm } = await admin
      .from('pnl_parametres')
      .select('frais_fixes_mensuels, repartir_frais_fixes, mutuelle_mensuelle, objectif_resultat_annuel, source_attribution')
      .eq('id', true).maybeSingle()

    // La structure est prise pour son montant annuel entier : un bureau vide
    // se paye quand meme, que le poste ait ete occupe ou non.
    const structureMensuelle = Number(courant?.frais_fixes ?? prm?.frais_fixes_mensuels ?? 0)

    const encaisseBanque = (mensuel || []).reduce((t, l) => t + Number(l.commission_encaissee || 0), 0)
    // Le CRM dit QUI a travaille et sur quoi, le grand livre dit COMBIEN.
    // On enrichit, on ne remplace pas : les deals du CRM ne couvrent pas les
    // premiers mois de l annee.
    const lignes = enrichirContributions(avecRetro, contributions)

    const cabinet = {
      encaisse_banque: encaisseBanque,
      structure_mensuelle: structureMensuelle,
      structure_annuelle: structureMensuelle * 12,
      repartir: repartir == null ? Boolean(prm?.repartir_frais_fixes) : repartir,
      mutuelle_en_place: Number(prm?.mutuelle_mensuelle || 0) > 0,
      objectif: Number(prm?.objectif_resultat_annuel || 0),
      // Un bordereau dit sur quel compte le contrat est loge, pas qui a vendu.
      // C est le grand livre CA MOIS, qui porte le signataire, qui attribue.
      source_attribution: prm?.source_attribution || 'CA MOIS',
      pilotage: pilotageLignes || [],
      courant: courant || null,
      charges: charges || [],
      sources: sources || [],
    }

    await journaliser(admin, { req, user, action: 'lecture', detail: `annee ${annee}, vue ${vue}` })

    return res.status(200).json({ annee, lignes, parMois, cabinet })
  } catch (e) {
    await journaliser(admin, { req, user, action: 'refus', detail: `erreur : ${e.message}` })
    return res.status(500).json({ error: 'Calcul impossible' })
  }
}
