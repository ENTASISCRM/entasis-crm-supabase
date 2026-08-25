// ═══════════════════════════════════════════════════════════════════════════
// SERVICE : dernière écriture de chaque flux entrant
//
// Une seule ligne lue par table (la plus récente). Aucune donnée métier n'est
// rapatriée : uniquement une date. Un flux illisible — RLS, table absente —
// renvoie null et s'affiche « inconnu » plutôt que de casser l'écran.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../lib/supabase'
import { FLUX } from '../lib/sante-flux'

async function derniereEcriture(table) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return null
    return data?.created_at || null
  } catch {
    return null
  }
}

export async function chargerSanteFlux() {
  const paires = await Promise.all(
    FLUX.map(async (f) => [f.cle, await derniereEcriture(f.table)]),
  )
  return Object.fromEntries(paires)
}
