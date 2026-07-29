// Notifications mail Smart RH : appel fire and forget vers /api/rh-notify.
// Un echec d envoi ne doit JAMAIS bloquer l action metier (la demande ou la
// decision est deja enregistree quand on notifie).
import { supabase } from './supabase'

export async function notifierRH(type, conge) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch('/api/rh-notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ type, conge }),
    })
  } catch (e) {
    console.error('[rh-notify] envoi impossible', e)
  }
}
