import { createClient } from '@supabase/supabase-js'

export async function verifyAuth(req) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Token manquant')
  }

  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new Error('Token invalide')

  return user
}