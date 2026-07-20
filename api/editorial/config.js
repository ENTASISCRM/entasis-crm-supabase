// api/editorial/config.js
// Configuration éditoriale (onglet Éditorial du CRM), manager only.
//   GET  → renvoie la config courante { brevo_list_id: {id, name} | null }
//   PUT  → enregistre la liste Brevo de la newsletter { id, name }
//
// Auth : session Supabase Bearer + rôle manager (helper requireManager,
// même pattern que /api/editorial/moderate). La table editorial_config est
// aussi RLS manager-only (double barrière).
//
// Variables d'environnement : SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.

import { requireManager } from './lib/manager-auth.js'

const KEY_BREVO_LIST = 'brevo_list_id'

export default async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).end()

  const auth = await requireManager(req, res)
  if (!auth) return
  const { admin } = auth

  try {
    if (req.method === 'GET') {
      const { data, error } = await admin
        .from('editorial_config')
        .select('key, value')
      if (error) throw new Error(error.message)
      const config = {}
      for (const row of data || []) config[row.key] = row.value
      return res.status(200).json({ brevo_list_id: config[KEY_BREVO_LIST] || null })
    }

    // PUT : enregistrer la liste Brevo
    const { id, name } = req.body || {}
    const listId = Number(id)
    if (!Number.isInteger(listId) || listId <= 0) {
      return res.status(400).json({ error: 'id de liste Brevo invalide (entier attendu)' })
    }
    const value = { id: listId, name: typeof name === 'string' ? name.slice(0, 200) : '' }

    const { error } = await admin
      .from('editorial_config')
      .upsert({ key: KEY_BREVO_LIST, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw new Error(error.message)

    return res.status(200).json({ brevo_list_id: value })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
