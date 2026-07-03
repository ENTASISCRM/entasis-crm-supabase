// src/lib/remuneration-api.js
// Appelle le calcul de commission cote serveur (api/remuneration.js). Le bareme
// ne transite plus par le navigateur ; on envoie le mois, on recoit les
// resultats deja calcules (memes objets rentab/comm qu avant).
// Correctif audit securite 2026-07-03.

import { supabase } from './supabase'
import { MONTHS } from './ui-shared'

/**
 * @param {'perso'|'manager'} mode
 * @param {string} month  libelle FR ('JUILLET'...)
 * @returns perso  : { contrat, rentab, comm, dealsMoisCount }
 *          manager: { lignes:[{contrat,rentab,comm,totalBrut}], totals }
 */
export async function fetchRemuneration(mode, month) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Session expiree, reconnecte toi.')
  const res = await fetch('/api/remuneration', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      mode,
      month,
      dateRefYear: new Date().getFullYear(),
      dateRefMonthIndex: MONTHS.indexOf(month),
    }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error || `Erreur ${res.status}`)
  }
  return res.json()
}
