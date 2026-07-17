// api/editorial/moderate.js
// Actions de modération éditoriale depuis le CRM (onglet Éditorial) :
// publication immédiate ou rejet d'un package 'en_attente_veto'.
//
// Auth : session Supabase de l'utilisateur (Authorization: Bearer
// <access_token>), pattern identique à api/impersonate.js — verifyAuth valide
// le token via le client anon, puis le rôle est vérifié dans public.profiles
// via le client service_role (pas de session serveur pour propager auth.uid()
// dans les policies). Le HMAC reste le mécanisme des liens EMAIL (route veto) ;
// il n'est pas utilisé ici.
//
// POST { id: uuid, action: 'publish' | 'reject' }
// Réponses JSON :
//   200 { statut, commit_sha?, path? }   action effectuée
//   409 { error, statut }                package déjà traité (idempotence UI)
//   400 / 401 / 403 / 404 / 405 / 500
//
// Variables d'environnement requises (serveur uniquement) :
//   SUPABASE_URL, SUPABASE_ANON_KEY      validation du token utilisateur
//   SUPABASE_SERVICE_ROLE_KEY            lecture profil + updates packages
//   EDITORIAL_GH_TOKEN                   commit dans le repo du site (publish)

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../_auth.js'
import { publishPackage } from './lib/publish.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // 1. Session utilisateur valide
  let caller
  try {
    caller = await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  const { id, action } = req.body || {}
  if (typeof id !== 'string' || !['publish', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Paramètres attendus : id (uuid), action (publish|reject)' })
  }

  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!adminKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configuré côté serveur' })
  }
  const admin = createClient(process.env.SUPABASE_URL, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // 2. L'appelant doit être manager (double barrière avec le RLS : la table
    //    est déjà manager-only, ici on protège l'action côté route).
    const { data: callerProfile, error: profErr } = await admin
      .from('profiles')
      .select('id, email, role')
      .eq('id', caller.id)
      .single()
    if (profErr || !callerProfile) {
      return res.status(403).json({ error: 'Profil introuvable' })
    }
    if (callerProfile.role !== 'manager') {
      return res.status(403).json({ error: 'Action réservée aux managers' })
    }

    // 3. Package cible
    const { data: pkg, error: pkgErr } = await admin
      .from('editorial_packages')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (pkgErr) throw new Error(pkgErr.message)
    if (!pkg) return res.status(404).json({ error: 'Package introuvable' })

    // Idempotence : on n'agit que sur un package encore en attente de veto.
    if (pkg.statut !== 'en_attente_veto') {
      return res.status(409).json({ error: 'Package déjà traité', statut: pkg.statut })
    }

    if (action === 'reject') {
      const dateFr = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
      const { error: upErr } = await admin
        .from('editorial_packages')
        .update({
          statut: 'rejete',
          notes_revision: `Rejeté depuis le CRM par ${callerProfile.email} le ${dateFr}`,
        })
        .eq('id', id)
        .eq('statut', 'en_attente_veto') // garde anti-course avec le cron de publication
      if (upErr) throw new Error(upErr.message)
      return res.status(200).json({ statut: 'rejete' })
    }

    // action === 'publish' : même logique métier que la route veto,
    // via le module partagé (aucune duplication).
    const result = await publishPackage(admin, pkg)
    return res.status(200).json({ statut: 'publie', commit_sha: result.commitSha, path: result.path })
  } catch (err) {
    if (err.code === 'ALREADY_PUBLISHED') {
      return res.status(409).json({ error: 'Le fichier de cet article existe déjà dans le site', statut: 'publie' })
    }
    return res.status(500).json({ error: err.message })
  }
}
