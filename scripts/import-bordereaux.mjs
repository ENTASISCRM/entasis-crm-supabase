#!/usr/bin/env node
// scripts/import-bordereaux.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Import des bordereaux de commissions REELLEMENT PAYES vers
// production_encaissee, avec source = BORDEREAU.
//
//   node scripts/import-bordereaux.mjs <dossier> 2026 [--ecrire]
//
// SANS --ecrire, le script ne fait que LIRE et rendre son rapport.
//
// Deux formats sont reconnus.
//   ABEILLE via ASSELIO : « Export Bordereau AAAA_MM_JJ.csv », separateur
//     point virgule, une colonne « N° Bordereau de rétrocession » qui
//     identifie le lot, et « Commission TTC reçue ».
//   SWISS LIFE : « Bordereau des encaissements_*.csv », dont la premiere
//     cellule d en tete concatene la reference de l intermediaire et la date
//     du bordereau. Seules les lignes ENR-DETAIL a 26 champs sont du detail :
//     les lignes TOTAL et TO sont des recapitulatifs, et 178 lignes du jeu
//     n ont que 23 champs, ce qui decalait toutes les colonnes.
//
// TROIS PIEGES, tous rencontres le 06/09/2026 sur les fichiers reels.
//   1. Le meme bordereau est telecharge plusieurs fois, sous des noms
//      differents et avec des colonnes en plus. On regroupe par REFERENCE et
//      on ne garde que la version la plus fournie, jamais la somme.
//   2. Les bordereaux portent des lignes NEGATIVES, ce sont des reprises.
//      Elles doivent etre gardees telles quelles : le total est un net.
//   3. La date qui compte est l ECHEANCE, pas la date du bordereau. Un seul
//      bordereau peut porter plusieurs echeances.
//
// AUCUNE DONNEE CLIENT NE SORT D ICI. Le rapport compte, il ne nomme pas.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { argv, exit, env } from 'node:process'
import { createClient } from '@supabase/supabase-js'

const [, , dossier, anneeArg, ...options] = argv
const annee = Number(anneeArg)
const ecrire = options.includes('--ecrire')

if (!dossier || !Number.isInteger(annee)) {
  console.error('Usage : node scripts/import-bordereaux.mjs <dossier> <annee> [--ecrire]')
  exit(1)
}
if (!existsSync(dossier) || !statSync(dossier).isDirectory()) {
  console.error(`Dossier introuvable : ${dossier}`)
  exit(1)
}

// ── Lecture CSV a point virgule, guillemets compris ───────────────────────
function lireCsv(texte) {
  const lignes = []
  let champ = ''
  let ligne = []
  let dansGuillemets = false
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i]
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i += 1 } else dansGuillemets = false
      } else champ += c
    } else if (c === '"') dansGuillemets = true
    else if (c === ';') { ligne.push(champ); champ = '' }
    else if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = '' }
    else if (c !== '\r') champ += c
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne) }
  return lignes
}

const nombre = (v) => {
  const s = String(v ?? '').replace(/[\u00A0\u202F\s]/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

// « MM/AAAA » vers le premier jour du mois. C est la date d echeance qui
// fait foi : annee et mois de production_encaissee en sont derives.
function dateEcheance(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, mois, an] = m
  return `${an}-${String(Number(mois)).padStart(2, '0')}-01`
}

const propre = (v) => String(v ?? '').replace(/[\u00A0\u202F]/g, ' ').trim().replace(/\s+/g, ' ')

// ── Format ABEILLE via ASSELIO ────────────────────────────────────────────
function lireAbeille(lignes) {
  const enTete = lignes[0].map((c) => propre(c).replace(/^\uFEFF/, ''))
  const col = (nom) => enTete.indexOf(nom)
  const iRef = col('N° Bordereau de rétrocession')
  if (iRef < 0) return null
  const iEch = col('Date Échéance initiale')
  const iCie = col('Compagnie')
  const iClient = col('Nom client')
  const iTtc = col('Commission TTC reçue')
  const iConsContrat = col('Conseiller contrat')
  const iConsClient = col('Conseiller client')
  const iTypo = col('Typologie contrat')

  const out = []
  for (let n = 1; n < lignes.length; n += 1) {
    const r = lignes[n]
    if (!r || r.length <= iTtc) continue
    const ref = propre(r[iRef])
    if (!ref) continue
    out.push({
      lot: ref,
      date_signature: dateEcheance(r[iEch]),
      client_nom: propre(r[iClient]) || 'INCONNU',
      produit: propre(r[iTypo]) || null,
      compagnie: propre(r[iCie]) || 'ABEILLE',
      commission_encaissee: nombre(r[iTtc]),
      signataire: propre(r[iConsContrat]) || propre(r[iConsClient]) || null,
    })
  }
  return out
}

// ── Format SWISS LIFE ─────────────────────────────────────────────────────
function lireSwissLife(lignes) {
  const ref = propre(lignes[0]?.[0]).replace(/^\uFEFF/, '')
  if (!/^ENC\d+/.test(ref)) return null
  const out = []
  for (let n = 1; n < lignes.length; n += 1) {
    const r = lignes[n]
    // Seules les lignes de DETAIL completes portent des colonnes alignees.
    // Les lignes TOTAL et TO sont des recapitulatifs, et les lignes courtes
    // decalent toutes les colonnes si on les lit.
    if (!r || r.length < 26 || propre(r[1]) !== 'DE') continue
    out.push({
      lot: ref,
      date_signature: dateEcheance(r[13]),
      client_nom: propre(r[8]) || 'INCONNU',
      produit: propre(r[12]) || null,
      compagnie: propre(r[19]) || 'SWISS LIFE',
      commission_encaissee: nombre(r[18]),
      signataire: propre(r[6]) || null,
    })
  }
  return out
}

// ── Balayage du dossier ───────────────────────────────────────────────────
const parLot = new Map()
const fichiersLus = []
const ignores = []

// Le dossier de telechargements contient des milliers de fichiers, dont des
// PDF de plusieurs mega octets : les lire tous en memoire fait tomber node.
// On ne touche qu aux deux familles de noms connues, et jamais au dela de
// vingt mega octets.
const NOMS_ATTENDUS = /^(Export Bordereau|Bordereau des encaissements)/i
const TAILLE_MAX = 20 * 1024 * 1024

for (const nom of readdirSync(dossier)) {
  if (!NOMS_ATTENDUS.test(nom)) continue
  const chemin = join(dossier, nom)
  const info = statSync(chemin)
  if (!info.isFile() || info.size > TAILLE_MAX) continue
  let texte
  try { texte = readFileSync(chemin, 'utf8') } catch { continue }
  if (!texte.includes(';')) continue

  const lignes = lireCsv(texte)
  if (!lignes.length) continue
  const rows = lireAbeille(lignes) || lireSwissLife(lignes)
  if (!rows || !rows.length) { ignores.push(nom); continue }
  fichiersLus.push(nom)

  // Piege 1 : le meme bordereau existe en plusieurs copies. On garde la plus
  // fournie, on n additionne JAMAIS.
  for (const lot of new Set(rows.map((r) => r.lot))) {
    const duLot = rows.filter((r) => r.lot === lot)
    const connu = parLot.get(lot)
    if (!connu || duLot.length > connu.rows.length) {
      parLot.set(lot, { rows: duLot, fichier: nom })
    }
  }
}

// ── Rapport ───────────────────────────────────────────────────────────────
const euros = (v) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const tousLots = [...parLot.entries()].sort((a, b) => a[0].localeCompare(b[0]))

console.log(`\n=== Bordereaux, ${fichiersLus.length} fichiers lus, ${ignores.length} ignores ===`)
console.log(`  ${tousLots.length} bordereaux distincts apres dedoublonnage\n`)

const retenues = []
const refus = []
for (const [lot, { rows, fichier }] of tousLots) {
  const sansDate = rows.filter((r) => !r.date_signature).length
  const deLAnnee = rows.filter((r) => r.date_signature?.startsWith(String(annee)))
  const total = deLAnnee.reduce((s, r) => s + r.commission_encaissee, 0)
  const negatives = deLAnnee.filter((r) => r.commission_encaissee < 0).length
  if (sansDate) refus.push(`${lot} : ${sansDate} lignes sans echeance lisible`)
  if (!deLAnnee.length) continue
  retenues.push(...deLAnnee)
  const mois = [...new Set(deLAnnee.map((r) => r.date_signature.slice(0, 7)))].sort()
  console.log(`  ${lot.padEnd(28)} ${String(deLAnnee.length).padStart(5)} lignes  ${euros(total).padStart(12)} EUR  ${mois.join(' ')}${negatives ? `  (${negatives} reprises)` : ''}`)
  void fichier
}

const total = retenues.reduce((s, r) => s + r.commission_encaissee, 0)
const parMois = {}
for (const r of retenues) {
  const m = r.date_signature.slice(0, 7)
  parMois[m] = (parMois[m] || 0) + r.commission_encaissee
}

console.log(`\n  lignes retenues pour ${annee} : ${retenues.length}`)
console.log(`  commission encaissee        : ${euros(total)} EUR\n`)
console.log('  par mois d echeance :')
for (const m of Object.keys(parMois).sort()) {
  console.log(`    ${m}  ${euros(parMois[m]).padStart(12)} EUR`)
}

const sansSignataire = retenues.filter((r) => !r.signataire).length
if (sansSignataire) {
  console.log(`\n  ${sansSignataire} lignes sans conseiller identifie sur le bordereau.`)
  console.log('  Elles comptent pour le cabinet mais ne seront rattachees a personne.')
}

if (refus.length) {
  console.log(`\n=== ${refus.length} ANOMALIES ===`)
  for (const r of refus) console.log(`  ${r}`)
}

if (!ecrire) {
  console.log('\nLecture seule. Ajoutez --ecrire pour enregistrer dans production_encaissee.')
  exit(0)
}

// ── Ecriture ──────────────────────────────────────────────────────────────
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
let cle = env.SUPABASE_SERVICE_ROLE_KEY
if (!url) { console.error('\nSUPABASE_URL est necessaire pour ecrire.'); exit(1) }
if (!cle) {
  const { createInterface } = await import('node:readline/promises')
  const { stdin, stdout } = await import('node:process')
  const rl = createInterface({ input: stdin, output: stdout })
  console.log('\nCle de service Supabase (Project Settings, API, service_role).')
  cle = (await rl.question('Colle la ici : ')).trim()
  rl.close()
}
if (!cle) { console.error('\nSans cle de service, rien ne peut etre ecrit.'); exit(1) }

const sb = createClient(url, cle, { auth: { persistSession: false } })

// Rattachement du signataire du bordereau a un profil du CRM, par le nom.
const { data: profils } = await sb.from('profiles').select('id, advisor_code, full_name')
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
const motsDe = (s) => new Set(sansAccent(s).split(/[^A-Z]+/).filter((w) => w.length > 2))
const parProfil = (profils || []).map((p) => ({ ...p, mots: motsDe(p.full_name) }))

function trouverProfil(signataire) {
  if (!signataire) return null
  const mots = motsDe(signataire)
  if (!mots.size) return null
  let meilleur = null
  let score = 0
  for (const p of parProfil) {
    let n = 0
    for (const m of mots) if (p.mots.has(m)) n += 1
    if (n > score) { score = n; meilleur = p }
  }
  // Au moins deux mots communs : un prenom seul ne suffit pas a rattacher.
  return score >= 2 ? meilleur : null
}

const inconnus = new Set()
const lignesAEcrire = retenues.map((r) => {
  const p = trouverProfil(r.signataire)
  if (r.signataire && !p) inconnus.add(r.signataire)
  return {
    date_signature: r.date_signature,
    client_nom: r.client_nom,
    produit: r.produit,
    volume_pp: 0,
    volume_pu: 0,
    compagnie: r.compagnie,
    provenance: null,
    commission_encaissee: r.commission_encaissee,
    commission_attendue: 0,
    retrocession: 0,
    advisor_code: p?.advisor_code || null,
    profile_id: p?.id || null,
    source: 'BORDEREAU',
    import_lot: r.lot,
  }
})

if (inconnus.size) {
  console.log(`\n  ${inconnus.size} libelles de conseiller non rattaches a un profil.`)
  console.log('  Ces lignes comptent pour le cabinet, pas pour une personne.')
}

// On remplace le lot plutot que d empiler des doublons.
const lots = [...new Set(lignesAEcrire.map((l) => l.import_lot))]
for (const lot of lots) {
  await sb.from('production_encaissee').delete().eq('source', 'BORDEREAU').eq('import_lot', lot)
}
for (let i = 0; i < lignesAEcrire.length; i += 200) {
  const { error } = await sb.from('production_encaissee').insert(lignesAEcrire.slice(i, i + 200))
  if (error) { console.error('\nEcriture interrompue :', error.message); exit(1) }
}
console.log(`\n${lignesAEcrire.length} lignes ecrites dans production_encaissee, ${lots.length} bordereaux.`)
