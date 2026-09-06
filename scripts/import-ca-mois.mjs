#!/usr/bin/env node
// scripts/import-ca-mois.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Import du grand livre CA MOIS vers production_encaissee.
//
//   node scripts/import-ca-mois.mjs "/chemin/CA MOIS.xlsx" 2026 [--ecrire]
//
// SANS --ecrire, le script ne fait que LIRE et rendre son rapport. C est le
// mode par defaut, volontairement : on regarde ce qui va entrer avant d ecrire.
//
// Il REFUSE d ecrire quoi que ce soit si une ligne est douteuse :
//   - signataire inconnu (regle de la specification)
//   - date de signature absente
//   - annee de la date differente de l annee demandee (le fichier porte des
//     fautes de frappe, trois lignes datees 2020 au lieu de 2026)
// Mieux vaut corriger le fichier que d ecrire une ligne fausse dans le grand
// livre qui sert a juger les gens.
//
// AUCUNE DONNEE CLIENT NE SORT D ICI. Le rapport ne montre aucun nom, il
// compte. Le fichier source n est jamais copie dans le depot.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs'
import { argv, exit, env } from 'node:process'
import { createClient } from '@supabase/supabase-js'

// Correspondance des libelles du fichier vers les codes du CRM. Les libelles
// du CA MOIS ne sont pas ceux de la base : c est cette table qui les relie.
const SIGNATAIRES = {
  LOUIS: 'LH',
  CLEM: 'CLEMENTM',
  THOMAS: 'THOMASPOPEA',
  QUENTIN: 'QUENTIN B',
  DANY: 'DB',
  // Les autres portent deja leur code du CRM.
  JEAN: 'JEAN', NANS: 'NANS', GIANNI: 'GIANNI', ALEXIS: 'ALEXIS',
  VICTOR: 'VICTOR', ARTHUR: 'ARTHUR', OSCAR: 'OSCAR', PAULIN: 'PAULIN',
}

const MOIS_FEUILLE = {
  JANVIER: 1, FEVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6,
  JUILLET: 7, AOUT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12,
}

const [, , chemin, anneeArg, ...options] = argv
const annee = Number(anneeArg)
const ecrire = options.includes('--ecrire')

if (!chemin || !Number.isInteger(annee)) {
  console.error('Usage : node scripts/import-ca-mois.mjs "<fichier.xlsx>" <annee> [--ecrire]')
  exit(1)
}
if (!existsSync(chemin)) {
  console.error(`Fichier introuvable : ${chemin}`)
  exit(1)
}

// openpyxl n existe pas en JS : on lit le xlsx par son XML, sans dependance.
const { default: XLSX } = await import('xlsx').catch(() => ({ default: null }))
if (!XLSX) {
  console.error('Le paquet xlsx est absent. Installez le : npm i -D xlsx')
  exit(1)
}

const classeur = XLSX.read(readFileSync(chemin), { cellDates: true })
const feuilles = classeur.SheetNames.filter((n) => n.includes(String(annee)))
if (feuilles.length === 0) {
  console.error(`Aucune feuille pour ${annee} dans ce fichier.`)
  exit(1)
}

// Le tableur rend les dates tantot en objet Date, tantot en texte francais
// « 16/07/2026 ». new Date() sur ce texte le lit a l americaine et renvoie le
// 7 aout, ou rien du tout. On lit donc le format explicitement.
function lireDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const t = String(v).trim()
  const fr = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (fr) {
    const [, j, m, a] = fr
    const d = new Date(Number(a), Number(m) - 1, Number(j))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

const lignes = []
const refus = []

for (const nomFeuille of feuilles) {
  const moisAttendu = MOIS_FEUILLE[nomFeuille.replace(/\s*\d{4}\s*/, '').trim().toUpperCase()]
  const brut = XLSX.utils.sheet_to_json(classeur.Sheets[nomFeuille], { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })
  const enTete = (brut[0] || []).map((c) => String(c || '').trim().toUpperCase())
  const col = (nom) => enTete.indexOf(nom)

  const iNom = col('NOM'), iDate = col('DATE SIGNATURE'), iProd = col('PRODUIT')
  const iPp = col('VOLUME PP'), iPu = col('VOLUME PU'), iCie = col('COMPAGNIE')
  const iProv = col('PROVENANCE'), iCom = col('COM'), iTouche = col('TOUCHÉ')
  const iSign = col('SIGNATAIRE')

  for (let n = 1; n < brut.length; n += 1) {
    const r = brut[n]
    if (!r || !r[iNom] || !String(r[iNom]).trim()) continue
    const nomClient = String(r[iNom]).trim()
    if (nomClient.toUpperCase().startsWith('TOTAL')) continue

    const ou = `${nomFeuille} ligne ${n + 1}`
    const dateBrute = r[iDate]

    if (!dateBrute) { refus.push({ ou, motif: 'date de signature absente' }); continue }
    const d = lireDate(dateBrute)
    if (!d) { refus.push({ ou, motif: `date illisible (${dateBrute})` }); continue }
    if (d.getFullYear() !== annee) {
      refus.push({ ou, motif: `annee ${d.getFullYear()} au lieu de ${annee}, faute de frappe probable` })
      continue
    }
    if (moisAttendu && d.getMonth() + 1 !== moisAttendu) {
      refus.push({ ou, motif: `date du mois ${d.getMonth() + 1} dans la feuille ${nomFeuille}` })
      continue
    }

    const libelle = String(r[iSign] || '').trim().toUpperCase()
    if (!libelle) { refus.push({ ou, motif: 'signataire absent' }); continue }
    const code = SIGNATAIRES[libelle]
    if (!code) { refus.push({ ou, motif: `signataire inconnu : ${libelle}` }); continue }

    const nombre = (v) => {
      const x = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'))
      return Number.isFinite(x) ? x : 0
    }
    // Une ligne marquee CYCLE porte une commission ATTENDUE, pas encaissee :
    // la distinguer evite de lire un mois blanc la ou des contrats sont signes.
    const touche = String(r[iTouche] || '').toUpperCase()
    const montant = nombre(r[iCom])
    const attendue = /CYCLE|A VENIR|ATTENDU/.test(touche) || montant === 0

    lignes.push({
      date_signature: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      client_nom: nomClient,
      produit: String(r[iProd] || '').trim() || null,
      volume_pp: nombre(r[iPp]),
      volume_pu: nombre(r[iPu]),
      compagnie: String(r[iCie] || '').trim() || null,
      provenance: String(r[iProv] || '').trim() || null,
      commission_encaissee: attendue ? 0 : montant,
      commission_attendue: attendue ? montant : 0,
      advisor_code: code,
      source: 'CA MOIS',
      import_lot: `${annee}-${new Date().toISOString().slice(0, 10)}`,
    })
  }
}

const euros = (v) => Math.round(v).toLocaleString('fr-FR')
const encaisse = lignes.reduce((s, l) => s + l.commission_encaissee, 0)
const attendu = lignes.reduce((s, l) => s + l.commission_attendue, 0)
const clients = new Set(lignes.map((l) => l.client_nom.toUpperCase())).size

console.log(`\n=== CA MOIS ${annee}, ${feuilles.length} feuilles lues ===`)
console.log(`  lignes retenues        ${lignes.length}`)
console.log(`  clients uniques        ${clients}`)
console.log(`  commission encaissee   ${euros(encaisse)} EUR`)
console.log(`  commission attendue    ${euros(attendu)} EUR`)
console.log(`  total                  ${euros(encaisse + attendu)} EUR`)

const parCode = {}
for (const l of lignes) parCode[l.advisor_code] = (parCode[l.advisor_code] || 0) + 1
console.log('\n  par signataire :')
for (const [c, n] of Object.entries(parCode).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${c.padEnd(14)} ${n}`)
}

if (refus.length) {
  console.log(`\n=== ${refus.length} LIGNES REFUSEES, a corriger dans le fichier ===`)
  for (const r of refus) console.log(`  ${r.ou.padEnd(26)} ${r.motif}`)
  console.log('\nRien n a ete ecrit. Corrigez le fichier, puis relancez.')
  exit(2)
}

if (!ecrire) {
  console.log('\nLecture seule. Ajoutez --ecrire pour enregistrer dans production_encaissee.')
  exit(0)
}

const url = env.SUPABASE_URL
const cle = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !cle) {
  console.error('\nSUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont necessaires pour ecrire.')
  exit(1)
}
const sb = createClient(url, cle, { auth: { persistSession: false } })

// Rattachement du signataire a son profil, par le code du CRM.
const { data: profils } = await sb.from('profiles').select('id, advisor_code').not('advisor_code', 'is', null)
const parAdvisor = Object.fromEntries((profils || []).map((p) => [p.advisor_code, p.id]))
const orphelins = [...new Set(lignes.map((l) => l.advisor_code))].filter((c) => !parAdvisor[c])
if (orphelins.length) {
  console.error(`\nCodes sans profil dans le CRM : ${orphelins.join(', ')}. Rien n a ete ecrit.`)
  exit(2)
}
for (const l of lignes) l.profile_id = parAdvisor[l.advisor_code]

// On remplace le lot de l annee plutot que d empiler des doublons.
await sb.from('production_encaissee').delete().eq('annee', annee).eq('source', 'CA MOIS')
for (let i = 0; i < lignes.length; i += 200) {
  const { error } = await sb.from('production_encaissee').insert(lignes.slice(i, i + 200))
  if (error) { console.error('\nEcriture interrompue :', error.message); exit(1) }
}
console.log(`\n${lignes.length} lignes ecrites dans production_encaissee.`)
