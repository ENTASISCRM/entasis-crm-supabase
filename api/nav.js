// api/nav.js — Vercel serverless function
//
// VL d'UN fonds. La logique vit dans _lib/nav-fonds.js, partagée avec
// api/nav-batch.js qui traite l'écran Marchés en un seul appel.
// Cet endpoint reste pour les usages unitaires (ajout d'un fonds, rafraîchi
// d'une ligne) et pour ne casser aucun appelant existant.
import { verifyAuth } from './_auth.js'
import { vlDuFonds, isinValide } from './_lib/nav-fonds.js'
import { appliquerCors } from './_lib/cors.js'

export default async function handler(req, res) {
  appliquerCors(req, res, 'GET')

  // Auth : proxy réservé aux utilisateurs CRM authentifiés (cf. audit
  // sécurité 2026-07-14). Empêche l'usage du endpoint comme proxy ouvert.
  try {
    await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  const { isin, ticker, msId } = req.query
  if (!isin) return res.status(400).json({ error: 'isin required' })
  if (!isinValide(isin)) return res.status(400).json({ error: 'Format ISIN invalide' })

  const r = await vlDuFonds({ isin, ticker, msId })
  if (r.erreur) {
    const code = r.erreur === 'not found' || r.erreur.startsWith('no ') || r.erreur === 'flat data' ? 404 : 500
    return res.status(code).json({ error: r.erreur, isin: r.isin, symbol: r.symbol })
  }
  return res.status(200).json(r)
}
