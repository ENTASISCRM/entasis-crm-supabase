// ═══════════════════════════════════════════════════════════════════════════
// SERVICE : documents des contrats de travail (Pilotage RH)
// Stockage Supabase Storage, bucket prive 'contrats-rh'.
// CONFIDENTIALITE STRICTE : les policies storage n autorisent que les
// managers (is_manager), un conseiller ne peut ni lister ni telecharger.
// Chemin des fichiers : <contrat_id>/<timestamp>-<nom-nettoye>
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../lib/supabase'

const BUCKET = 'contrats-rh'

// Nettoie un nom de fichier (accents, espaces, caracteres speciaux) pour un
// chemin storage sur : « Contrat Théo Dupont.pdf » devient « Contrat-Theo-Dupont.pdf »
const slugFichier = (name) => {
  const i = name.lastIndexOf('.')
  const base = (i > 0 ? name.slice(0, i) : name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const ext = i > 0 ? name.slice(i).toLowerCase() : ''
  return `${base || 'document'}${ext}`
}

// Nom d affichage : retire le prefixe timestamp pose a l upload
export const nomAffiche = (name) => name.replace(/^\d{10,16}-/, '')

export async function listDocs(contratId) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(String(contratId), { sortBy: { column: 'name', order: 'desc' } })
  if (error) throw error
  return (data || []).filter((f) => f.name !== '.emptyFolderPlaceholder')
}

export async function uploadDoc(contratId, file) {
  const path = `${contratId}/${Date.now()}-${slugFichier(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw error
  return path
}

// URL signee temporaire (5 min) pour ouvrir ou telecharger le document
export async function urlDoc(contratId, name) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(`${contratId}/${name}`, 300)
  if (error) throw error
  return data.signedUrl
}

export async function deleteDoc(contratId, name) {
  const { error } = await supabase.storage.from(BUCKET).remove([`${contratId}/${name}`])
  if (error) throw error
}

// Quels contrats ont au moins un document joint ? Une seule requete : les
// dossiers a la racine du bucket sont les ids de contrat (les dossiers ont
// id null dans la reponse storage, contrairement aux fichiers).
export async function contratsAvecDocs() {
  const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) return new Set()
  return new Set((data || []).filter((f) => f.id === null).map((f) => f.name))
}
