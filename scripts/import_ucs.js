#!/usr/bin/env node
// scripts/import_ucs.js
// Import du CSV `data/ucs_export_groupement.csv` dans la table
// `ucs_structures` (project Supabase tvgbblbceqvdtqnbeoik).
//
// Usage :
//   1. Placer le CSV à `data/ucs_export_groupement.csv` (entête : etat,nom_ucs,
//      code_isin,compagnie,upfront,minimum_requis,coupon_client,constatation,
//      sri,enveloppe_restante,fin_commerc,couleur_badge)
//   2. Exporter les variables :
//        export SUPABASE_URL=https://tvgbblbceqvdtqnbeoik.supabase.co
//        export SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
//   3. Lancer :
//        node scripts/import_ucs.js
//
// Le script utilise un UPSERT sur code_isin → idempotent et rejouable
// sans risque de doublon.
//
// Alternative : utiliser l'interface admin dans le CRM (Mode administrateur
// → Choisir un fichier CSV). C'est ce que ce script fait en CLI.

const fs = require('node:fs')
const path = require('node:path')

const CSV_PATH = path.join(__dirname, '..', 'data', 'ucs_export_groupement.csv')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises')
  process.exit(1)
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`❌ Fichier introuvable : ${CSV_PATH}`)
  console.error('   Placez l\'export du groupement à cet emplacement et relancez.')
  process.exit(1)
}

// ─── Parser CSV minimaliste (identique à celui du composant React) ───
function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQuotes = !inQuotes; continue }
    if (c === ',' && !inQuotes) { cells.push(cur); cur = ''; continue }
    cur += c
  }
  cells.push(cur)
  return cells
}

function parseCsv(text) {
  const errors = []
  const rows = []
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) {
    return { rows, errors: ['CSV vide ou pas d\'en-tête'] }
  }
  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const expected = [
    'etat', 'nom_ucs', 'code_isin', 'compagnie', 'upfront',
    'minimum_requis', 'coupon_client', 'constatation', 'sri',
    'enveloppe_restante', 'fin_commerc', 'couleur_badge',
  ]
  const missing = expected.filter(c => !header.includes(c))
  if (missing.length) {
    return { rows, errors: [`Colonnes manquantes : ${missing.join(', ')}`] }
  }
  const idx = Object.fromEntries(expected.map(c => [c, header.indexOf(c)]))

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const row = {
      etat: String(cells[idx.etat] || '').trim().toUpperCase(),
      nom_ucs: String(cells[idx.nom_ucs] || '').trim(),
      code_isin: String(cells[idx.code_isin] || '').trim().toUpperCase(),
      compagnie: String(cells[idx.compagnie] || '').trim(),
      upfront: parseFloat(cells[idx.upfront]),
      minimum_requis: parseFloat(cells[idx.minimum_requis]),
      coupon_client: parseFloat(cells[idx.coupon_client]),
      constatation: String(cells[idx.constatation] || '').trim().toUpperCase() || null,
      sri: cells[idx.sri] ? parseInt(cells[idx.sri], 10) : null,
      enveloppe_restante: cells[idx.enveloppe_restante]
        ? parseFloat(cells[idx.enveloppe_restante])
        : null,
      fin_commerc: cells[idx.fin_commerc] || null,
      couleur_badge: cells[idx.couleur_badge] || null,
    }
    if (!['EN_COURS', 'CLOTURE', 'ANNULATION'].includes(row.etat)) {
      errors.push(`L${i + 1} : etat invalide "${row.etat}"`)
      continue
    }
    if (!row.code_isin || !row.nom_ucs || !row.compagnie) {
      errors.push(`L${i + 1} : champs requis manquants`)
      continue
    }
    if (isNaN(row.upfront) || isNaN(row.minimum_requis) || isNaN(row.coupon_client)) {
      errors.push(`L${i + 1} : montants invalides`)
      continue
    }
    rows.push(row)
  }
  return { rows, errors }
}

// ─── Upsert via REST API Supabase (Prefer: resolution=merge-duplicates) ───
async function upsertBatch(rows) {
  const url = `${SUPABASE_URL}/rest/v1/ucs_structures?on_conflict=code_isin`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status} : ${text}`)
  }
  return res.json()
}

// ─── Main ───
(async () => {
  console.log(`📂 Lecture de ${CSV_PATH}…`)
  const text = fs.readFileSync(CSV_PATH, 'utf-8')
  const { rows, errors } = parseCsv(text)

  console.log(`✅ ${rows.length} lignes valides`)
  if (errors.length) {
    console.warn(`⚠ ${errors.length} erreur(s) de parsing :`)
    errors.slice(0, 10).forEach(e => console.warn('   - ' + e))
    if (errors.length > 10) console.warn(`   ... et ${errors.length - 10} autres`)
  }

  if (rows.length === 0) {
    console.error('❌ Aucune ligne à importer, abandon.')
    process.exit(1)
  }

  console.log(`🚀 Upsert dans ucs_structures (project ${SUPABASE_URL.match(/\/\/([^.]+)/)?.[1]})…`)
  try {
    const result = await upsertBatch(rows)
    console.log(`✅ ${result.length} UCS importées avec succès`)
    process.exit(0)
  } catch (e) {
    console.error(`❌ Erreur d'import : ${e.message}`)
    process.exit(1)
  }
})()
