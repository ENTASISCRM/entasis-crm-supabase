// api/nav-batch.js — Vercel serverless function
//
// VL de plusieurs fonds en UN seul appel. L'écran Marchés faisait un
// aller-retour navigateur→Vercel par fonds : 25 requêtes, puis 37 après
// l'ajout des supports Abeille. Chacune repayait le TLS, la vérification du
// jeton et le risque de démarrage à froid.
//
// Ici la vérification d'auth a lieu une fois, et les appels vers Yahoo et
// Morningstar partent côté serveur, huit à la fois (cf. _lib/nav-fonds.js).
import { verifyAuth } from './_auth.js'
import { vlDesFonds } from './_lib/nav-fonds.js'
import { appliquerCors } from './_lib/cors.js'

// Garde-fou : le référentiel fait 37 fonds. 100 laisse de la marge sans
// transformer l'endpoint en proxy de masse.
const MAX_FONDS = 100

export default async function handler(req, res) {
  appliquerCors(req, res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  try {
    await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  const fonds = req.body?.fonds
  if (!Array.isArray(fonds)) return res.status(400).json({ error: 'fonds[] requis' })
  if (fonds.length === 0) return res.status(200).json({ resultats: {} })
  if (fonds.length > MAX_FONDS) return res.status(400).json({ error: `Maximum ${MAX_FONDS} fonds par appel` })

  const demandes = fonds.map((f) => ({ isin: f?.isin, ticker: f?.ticker, msId: f?.msId }))
  const reponses = await vlDesFonds(demandes)

  // Indexé par ISIN : l'appelant retrouve chaque fonds sans dépendre de
  // l'ordre. Une VL absente vaut null — l'écran affiche « — » pour cette
  // ligne sans que tout le tableau échoue.
  const resultats = {}
  reponses.forEach((r, i) => {
    const isin = demandes[i].isin
    if (!isin) return
    resultats[isin] = r?.erreur ? null : r
  })
  return res.status(200).json({ resultats })
}
