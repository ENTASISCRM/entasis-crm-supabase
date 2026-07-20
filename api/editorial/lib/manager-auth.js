// api/editorial/lib/manager-auth.js
// Auth manager partagée par les routes éditoriales protégées par session
// (config, brevo-lists — même pattern que moderate.js) : verifyAuth valide le
// token Bearer via le client anon, puis le rôle est vérifié dans
// public.profiles via le client service_role (pas de session serveur pour
// propager auth.uid() dans les policies).
//
// Renvoie { admin } (client service_role prêt à l'emploi) si l'appelant est
// manager. Sinon écrit la réponse d'erreur (401/403/500) sur `res` et renvoie
// null : l'appelant doit s'arrêter si le retour est null.

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../../_auth.js'

export async function requireManager(req, res) {
  let caller
  try {
    caller = await verifyAuth(req)
  } catch {
    res.status(401).json({ error: 'Non autorisé' })
    return null
  }

  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!adminKey) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configuré côté serveur' })
    return null
  }
  const admin = createClient(process.env.SUPABASE_URL, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, role')
    .eq('id', caller.id)
    .single()
  if (error || !profile) {
    res.status(403).json({ error: 'Profil introuvable' })
    return null
  }
  if (profile.role !== 'manager') {
    res.status(403).json({ error: 'Action réservée aux managers' })
    return null
  }

  return { admin, profile }
}
