import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey)

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder', {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storageKey:         'entasis-auth-v1',
    storage:            typeof window !== 'undefined' ? window.localStorage : undefined,
  },
})

// Filet de sécurité session : un onglet qui dort (laptop fermé) peut rater le
// rafraîchissement automatique du jeton et se réveiller en « JWT expired ».
// Au retour sur l onglet, on force une vérification de session : si le jeton
// est expiré mais renouvelable, il est rafraîchi immédiatement.
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') supabase.auth.getSession()
  })
}
