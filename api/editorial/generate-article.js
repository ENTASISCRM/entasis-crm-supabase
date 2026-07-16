// api/editorial/generate-article.js
// Route Vercel de génération manuelle d'un package éditorial. Le cœur de la
// génération vit dans api/editorial/lib/generation.js (module partagé avec le
// cron GitHub Actions — la génération dure ~5-6 min et NE TIENT PAS dans une
// fonction Vercel en prod : cette route sert aux tests locaux via le harnais
// scripts/test-generate-article.mjs, le cron passe par
// scripts/editorial/generate-and-notify.mjs).
//
// Variables d'environnement requises (serveur uniquement, JAMAIS VITE_) :
//   EDITORIAL_SECRET          secret partagé, comparé timing-safe au header
//                             'x-editorial-secret'
//   ANTHROPIC_API_KEY         clé API Anthropic
//   SUPABASE_URL              URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY clé service role (bypass RLS pour l'insert)
//
// POST { theme?: string, sujet?: string }
//   theme absent → rotation automatique (thème le moins récemment utilisé).
// Réponses : 200 {id, sujet, article_slug, statut} · 401 · 405 · 400 (theme
// invalide) · 409 (slug dupliqué) · 502 (sortie modèle invalide) · 500.

import { createClient } from '@supabase/supabase-js'
import { safeEqual } from './lib/token.js'
import { generateEditorialPackage, insertPackage } from './lib/generation.js'

export default async function handler(req, res) {
  // 1. Auth par secret partagé, timing-safe
  const secret = process.env.EDITORIAL_SECRET
  const provided = req.headers['x-editorial-secret']
  if (!secret || typeof provided !== 'string' || !safeEqual(provided, secret)) {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  if (req.method !== 'POST') return res.status(405).end()

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configuration Supabase serveur manquante' })
  }
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const body = req.body || {}
    const sujet = typeof body.sujet === 'string' ? body.sujet.substring(0, 300) : undefined

    const { theme, pkg } = await generateEditorialPackage(admin, { theme: body.theme, sujet })
    const inserted = await insertPackage(admin, { theme, sujet, pkg, statut: 'genere' })

    return res.status(200).json({
      id: inserted.id,
      sujet: inserted.sujet,
      article_slug: inserted.article_slug,
      statut: inserted.statut,
    })
  } catch (err) {
    if (err.code === 'BAD_THEME') return res.status(400).json({ error: err.message })
    if (err.code === 'SLUG_CONFLICT') return res.status(409).json({ error: err.message })
    if (err.code === 'MODEL_OUTPUT') {
      return res.status(502).json({ error: `Sortie modèle invalide : ${err.message}` })
    }
    return res.status(500).json({ error: err.message })
  }
}
