// src/services/signaux.js
// Signaux terrain (#8) : infos glanées hors RDV, rattachées à un client et à une
// famille, qui ressurgissent à une échéance comme déclencheur de mission.
// RLS me_signaux alignée sur clients (le conseiller ne voit que ses clients).

import { supabase } from '../lib/supabase'

export async function listSignaux() {
  const { data, error } = await supabase.from('me_signaux').select('*')
  if (error) throw error
  return data || []
}

export async function addSignal({ client_id, famille, texte, echeance, advisor_code }) {
  const { error } = await supabase.from('me_signaux').insert({
    client_id,
    famille: famille || null,
    texte,
    echeance: echeance || null,
    advisor_code: advisor_code || null,
  })
  if (error) throw error
}

export async function deleteSignal(id) {
  const { error } = await supabase.from('me_signaux').delete().eq('id', id)
  if (error) throw error
}
