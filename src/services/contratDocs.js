// ═══════════════════════════════════════════════════════════════════════════
// SERVICE : documents des contrats de travail (Pilotage RH)
// Stockage Supabase Storage, bucket prive 'contrats-rh'.
// CONFIDENTIALITE STRICTE : les policies storage n autorisent que les
// managers (is_manager), un conseiller ne peut ni lister ni telecharger.
//
// Organisation par CATEGORIE de document :
//   <contrat_id>/<categorie>/<timestamp>-<nom-nettoye>
// Les fichiers historiques poses a la racine <contrat_id>/ (avant les
// categories) sont rattaches a la categorie « contrat ».
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../lib/supabase'

const BUCKET = 'contrats-rh'

// Les cases du dossier salarie. CERFA : seulement pour les alternants
// (filtre fait cote UI), le reste vaut pour tout le monde.
export const CATEGORIES = [
  { key: 'contrat', label: 'Contrat de travail', hint: 'contrat signé, avenants' },
  { key: 'cerfa', label: 'CERFA alternance', hint: 'formulaire d apprentissage signé' },
  { key: 'identite', label: 'Pièce d identité', hint: 'CNI ou passeport' },
  { key: 'secu', label: 'Sécurité sociale', hint: 'carte vitale ou attestation' },
]

// Nettoie un nom de fichier (accents, espaces, caracteres speciaux)
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

// Tous les documents d un contrat, groupes par categorie.
// 1 requete racine + 1 par sous dossier present (4 max).
export async function listDocsParCategorie(contratId) {
  const base = String(contratId)
  const vide = () => Object.fromEntries(CATEGORIES.map((c) => [c.key, []]))
  const out = vide()
  const { data, error } = await supabase.storage.from(BUCKET).list(base, { limit: 100 })
  if (error) throw error
  const sousDossiers = []
  for (const e of data || []) {
    if (e.name === '.emptyFolderPlaceholder') continue
    if (e.id === null) {
      if (out[e.name]) sousDossiers.push(e.name)
      continue
    }
    // Fichier historique a la racine : categorie contrat
    out.contrat.push({ name: e.name, path: `${base}/${e.name}`, size: e.metadata?.size })
  }
  await Promise.all(sousDossiers.map(async (cat) => {
    const { data: files } = await supabase.storage.from(BUCKET).list(`${base}/${cat}`, { limit: 100 })
    for (const f of files || []) {
      if (f.name === '.emptyFolderPlaceholder') continue
      out[cat].push({ name: f.name, path: `${base}/${cat}/${f.name}`, size: f.metadata?.size })
    }
  }))
  return out
}

export async function uploadDoc(contratId, file, categorie = 'contrat') {
  const path = `${contratId}/${categorie}/${Date.now()}-${slugFichier(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw error
  return path
}

// URL signee temporaire (5 min) pour ouvrir ou telecharger un document
export async function urlPath(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

export async function deletePath(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

// Quels contrats ont au moins un document joint ? Une seule requete : les
// dossiers a la racine du bucket sont les ids de contrat.
export async function contratsAvecDocs() {
  const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) return new Set()
  return new Set((data || []).filter((f) => f.id === null).map((f) => f.name))
}
