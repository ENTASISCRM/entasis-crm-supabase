// api/editorial/veto.js
// Route Vercel GET frappée par les liens d'action des emails de relecture :
//   /api/editorial/veto?id={uuid}&action={reject|publish}&token={hmac}
// Exécution légère (< 1 s pour reject, < 5 s pour publish : un commit GitHub).
//
// - token = HMAC-SHA256(id:action, EDITORIAL_SECRET) → 403 si invalide.
// - action=reject  : statut 'rejete' + notes_revision datée.
// - action=publish : publication immédiate via le module partagé publish.js.
// - Idempotent : re-cliquer un lien déjà traité affiche l'état actuel sans
//   erreur ni double action (seuls les packages 'en_attente_veto' sont agis).
//
// Variables d'environnement requises (serveur uniquement) :
//   EDITORIAL_SECRET          clé HMAC des liens
//   SUPABASE_URL              URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY lecture/écriture editorial_packages
//   EDITORIAL_GH_TOKEN        commit dans le repo du site (action publish)

import { createClient } from '@supabase/supabase-js'
import { verifyVetoToken } from './lib/token.js'
import { publishPackage } from './lib/publish.js'

const STATUT_LABELS = {
  genere: 'généré (hors circuit de veto)',
  en_attente_veto: 'en attente de relecture',
  publie: 'publié',
  rejete: 'rejeté',
}

function page(res, status, title, message, extra = '') {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — Journal Entasis</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #f6f5f2;
         color: #1f2937; display: flex; justify-content: center; padding: 12vh 16px 0; }
  main { background: #fff; border: 1px solid #e5e2da; border-radius: 8px;
         max-width: 460px; padding: 32px 36px; }
  h1 { font-size: 1.15rem; margin: 0 0 12px; }
  p  { margin: 8px 0; line-height: 1.5; font-size: .95rem; }
  .muted { color: #6b7280; font-size: .85rem; margin-top: 16px; }
</style>
</head>
<body><main><h1>${title}</h1><p>${message}</p>${extra}
<p class="muted">Agent éditorial Entasis — cette page peut être fermée.</p></main></body>
</html>`
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(html)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { id, action, token } = req.query || {}
  const secret = process.env.EDITORIAL_SECRET

  if (!secret || typeof id !== 'string' || !['reject', 'publish'].includes(action) ||
      !verifyVetoToken(id, action, token, secret)) {
    return page(res, 403, 'Lien invalide',
      'Ce lien d’action est invalide ou a été altéré. Aucune action n’a été effectuée.')
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return page(res, 500, 'Erreur de configuration',
      'Configuration Supabase serveur manquante. Aucune action n’a été effectuée.')
  }
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: pkg, error } = await admin
      .from('editorial_packages')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!pkg) {
      return page(res, 404, 'Article introuvable', 'Aucun package éditorial ne correspond à ce lien.')
    }

    const titre = pkg.article_frontmatter?.title || pkg.sujet

    // Idempotence : on n'agit que sur un package encore en attente de veto.
    if (pkg.statut !== 'en_attente_veto') {
      return page(res, 200, 'Déjà traité',
        `« ${titre} » est actuellement <strong>${STATUT_LABELS[pkg.statut] || pkg.statut}</strong>. Aucune nouvelle action n’a été effectuée.`)
    }

    if (action === 'reject') {
      const dateFr = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
      const { error: upErr } = await admin
        .from('editorial_packages')
        .update({ statut: 'rejete', notes_revision: `Rejeté par email le ${dateFr}` })
        .eq('id', id)
        .eq('statut', 'en_attente_veto') // garde anti-course avec le cron de publication
      if (upErr) throw new Error(upErr.message)
      return page(res, 200, 'Article rejeté',
        `« ${titre} » ne sera pas publié. Il reste consultable en base (statut « rejeté »).`)
    }

    // action === 'publish' : publication immédiate
    const result = await publishPackage(admin, pkg)
    return page(res, 200, 'Article publié',
      `« ${titre} » vient d’être publié : le fichier a été commité dans le site (${result.path}). Le déploiement se lance automatiquement — l’article sera en ligne dans quelques minutes.`,
      `<p><a href="https://www.entasis-conseil.fr/journal/${pkg.article_slug}">Voir l’article →</a></p>`)
  } catch (err) {
    if (err.code === 'ALREADY_PUBLISHED') {
      return page(res, 200, 'Déjà publié',
        'Le fichier de cet article existe déjà dans le site. Aucune nouvelle action n’a été effectuée.')
    }
    return page(res, 500, 'Erreur',
      `L’action n’a pas pu aboutir : ${err.message}. Vous pouvez réessayer en recliquant le lien.`)
  }
}
