// ═══════════════════════════════════════════════════════════════════════════
// Feuille de temps mensuelle automatique (cron GitHub Actions, le 1er du mois).
// Calcule la feuille du MOIS ECOULE depuis Supabase (service role), genere le
// PDF (meme contenu que le bouton de Smart RH) et l envoie par GMAIL au nom
// de Louis via le compte de service (delegation domaine, scope gmail.send).
// Pas de Brevo ici : demande explicite de Louis, le mail part de sa boite.
//
// Env requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//              GOOGLE_SERVICE_ACCOUNT_KEY (JSON ou base64),
//              COMPTABLE_EMAIL (destinataire), EXPEDITEUR_EMAIL (defaut louis).
// ═══════════════════════════════════════════════════════════════════════════

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import {
  soldeConges, joursOuvres, joursOuvresSimples, joursDemande,
} from '../../src/lib/conges-solde.js'

const EXPEDITEUR = process.env.EXPEDITEUR_EMAIL || 'louis.hatton@entasis-conseil.fr'
const DESTINATAIRE = process.env.COMPTABLE_EMAIL || 'louis.hatton@entasis-conseil.fr'
const TYPE_ECOLE = 'École / CFA'
const ORDRE_PDF = { ALTERNANT: 0, STAGIAIRE: 1, CDI: 2, CDD: 3 }
const MOIS_LONGS = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
const sa = (x) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

// ── Donnees ────────────────────────────────────────────────────────────────
async function chargerDonnees() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: contrats, error: e1 } = await sb
    .from('conseiller_contrats')
    .select('*, profile:profile_id(id, role, email)')
  if (e1) throw e1
  const { data: conges, error: e2 } = await sb.from('rh_conges').select('*')
  if (e2) throw e2
  return { contrats: contrats || [], conges: conges || [] }
}

// ── Calcul de la feuille (miroir du bouton Smart RH) ───────────────────────
export function calculerFeuille({ contrats, conges, annee, moisNum }) {
  const nbJ = new Date(annee, moisNum, 0).getDate()
  const moisIso = `${annee}-${String(moisNum).padStart(2, '0')}`
  const mDeb = `${moisIso}-01`
  const mFin = `${moisIso}-${String(nbJ).padStart(2, '0')}`
  const finDeMois = new Date(annee, moisNum - 1, nbJ, 23, 59)
  const clip = (a, b) => [a < mDeb ? mDeb : a, (!b || b > mFin) ? mFin : b]

  const vus = new Map()
  for (const k of contrats) {
    if (!k.actif) continue
    if (k.profile?.role === 'manager') continue
    if (!(k.type_contrat in ORDRE_PDF)) continue
    if (k.date_debut && k.date_debut > mFin) continue
    if (k.date_fin && k.date_fin < mDeb) continue
    const cle = k.profile_id || (k.full_name || '').toLowerCase().trim()
    if (!cle || vus.has(cle)) continue
    vus.set(cle, k)
  }

  const lignes = Array.from(vus.values()).map((k) => {
    const [pDeb, pFin] = clip(k.date_debut || mDeb, k.date_fin)
    const ouvres = joursOuvresSimples(pDeb, pFin)
    const absPerso = conges.filter((c) =>
      c.statut === 'valide' && c.demandeur_id && c.demandeur_id === k.profile_id &&
      c.date_debut <= mFin && (c.date_fin || c.date_debut) >= mDeb)
    let absOuvres = 0, ecoleOuvres = 0, cpDecomptes = 0
    const details = []
    for (const c of absPerso) {
      const [aDeb, aFin] = clip(c.date_debut, c.date_fin || c.date_debut)
      let jo = joursOuvresSimples(aDeb, aFin)
      if (c.demi_journee && jo > 0) jo = Math.max(0.5, jo - 0.5)
      let jd = joursOuvres(aDeb, aFin)
      if (c.demi_journee && jd > 0) jd = Math.max(0.5, jd - 0.5)
      if (c.type === TYPE_ECOLE) ecoleOuvres += jo
      else absOuvres += jo
      if (c.type === 'Congé payé') cpDecomptes += jd
      details.push({ nom: k.full_name, type: c.type, du: aDeb, au: aFin, jo, jd })
    }
    const solde = soldeConges(k, conges.filter((c) => c.demandeur_id === k.profile_id), finDeMois)
    return { k, ouvres, absOuvres, ecoleOuvres, travailles: ouvres - absOuvres - ecoleOuvres, cpDecomptes, solde, details }
  }).sort((a, b) =>
    (ORDRE_PDF[a.k.type_contrat] - ORDRE_PDF[b.k.type_contrat]) ||
    (a.k.full_name || '').localeCompare(b.k.full_name || ''))

  const futurs = []
  for (const l of lignes) {
    for (const c of conges.filter((c) =>
      c.statut === 'valide' && c.type === 'Congé payé' &&
      c.demandeur_id && c.demandeur_id === l.k.profile_id && c.date_debut > mFin)) {
      futurs.push({ nom: l.k.full_name, du: c.date_debut, au: c.date_fin || c.date_debut, jd: joursDemande(c) })
    }
  }
  const arrivees = contrats.filter((k) => k.actif && (k.type_contrat in ORDRE_PDF) && k.profile?.role !== 'manager' && k.date_debut >= mDeb && k.date_debut <= mFin)
  const departs = contrats.filter((k) => k.actif && (k.type_contrat in ORDRE_PDF) && k.profile?.role !== 'manager' && k.date_fin && k.date_fin >= mDeb && k.date_fin <= mFin)
  const arriveesFutures = contrats
    .filter((k) => k.actif && (k.type_contrat in ORDRE_PDF) && k.profile?.role !== 'manager' && k.date_debut && k.date_debut > mFin)
    .sort((a, b) => a.date_debut.localeCompare(b.date_debut))
  return { lignes, futurs, arrivees, departs, arriveesFutures, nbJ }
}

// ── PDF ────────────────────────────────────────────────────────────────────
export function genererPdf({ lignes, futurs, arrivees, departs, arriveesFutures, annee, moisNum }) {
  const fmtD = (s) => { const d = new Date(`${String(s).slice(0, 10)}T00:00:00`); return d.toLocaleDateString('fr-FR') }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const navy = [10, 22, 40]; const gold = [201, 169, 97]; const gris = [110, 120, 135]
  let y = 0
  doc.setFillColor(...navy); doc.rect(0, 0, 210, 26, 'F')
  doc.setTextColor(...gold); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
  doc.text('ENTASIS CONSEIL', 14, 9)
  doc.setTextColor(255, 255, 255); doc.setFontSize(15)
  doc.text(sa(`Feuille de temps equipe · ${MOIS_LONGS[moisNum - 1]} ${annee}`), 14, 17)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 205, 215)
  doc.text(sa(`Document comptabilite · envoi automatique du 1er du mois`), 14, 22.5)
  y = 34

  const cols = [
    { t: 'Salarie', x: 14, w: 46 }, { t: 'Contrat', x: 60, w: 22 },
    { t: 'J. ouvres', x: 82, w: 20, r: true }, { t: 'Absences', x: 102, w: 20, r: true },
    { t: 'Travailles', x: 122, w: 22, r: true }, { t: 'CP decomptes', x: 144, w: 26, r: true },
    { t: 'Solde CP', x: 170, w: 26, r: true },
  ]
  const rowH = 7
  const drawHead = () => {
    doc.setFillColor(...navy); doc.rect(14, y, 182, rowH, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
    for (const c of cols) doc.text(c.t, c.r ? c.x + c.w - 2 : c.x + 2, y + 4.8, c.r ? { align: 'right' } : undefined)
    y += rowH
  }
  drawHead()
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  lignes.forEach((l, i) => {
    if (y > 265) { doc.addPage(); y = 20; drawHead(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8) }
    if (i % 2 === 0) { doc.setFillColor(246, 244, 239); doc.rect(14, y, 182, rowH, 'F') }
    doc.setTextColor(30, 35, 45)
    doc.text(sa(l.k.full_name).slice(0, 30), 16, y + 4.8)
    doc.setTextColor(...gris)
    doc.text(sa({ ALTERNANT: 'Alternant', STAGIAIRE: 'Stagiaire' }[l.k.type_contrat] || l.k.type_contrat), 62, y + 4.8)
    doc.setTextColor(30, 35, 45)
    doc.text(String(l.ouvres), 100, y + 4.8, { align: 'right' })
    if (l.absOuvres > 0) { doc.setTextColor(255, 59, 48); doc.setFont('helvetica', 'bold') }
    doc.text(String(l.absOuvres), 120, y + 4.8, { align: 'right' })
    doc.setTextColor(30, 35, 45); doc.setFont('helvetica', 'normal')
    doc.text(String(l.travailles), 142, y + 4.8, { align: 'right' })
    doc.text(String(l.cpDecomptes), 168, y + 4.8, { align: 'right' })
    doc.text(l.solde ? String(l.solde.restant) : '-', 194, y + 4.8, { align: 'right' })
    y += rowH
  })
  doc.setDrawColor(...gold); doc.setLineWidth(0.5); doc.line(14, y, 196, y)
  y += 10

  const tousDetails = lignes.flatMap((l) => l.details)
  doc.setFontSize(10); doc.setTextColor(...navy); doc.setFont('helvetica', 'bold')
  doc.text('Detail des absences du mois', 14, y); y += 6
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  if (tousDetails.length === 0) {
    doc.setTextColor(...gris); doc.text('Aucune absence validee sur le mois.', 14, y); y += 6
  } else {
    for (const d of tousDetails) {
      if (y > 275) { doc.addPage(); y = 20 }
      doc.setTextColor(30, 35, 45)
      doc.text(sa(`${d.nom} · ${d.type} · du ${fmtD(d.du)} au ${fmtD(d.au)} · ${d.jo} j ouvres${d.type === 'Congé payé' ? ` (${d.jd} decomptes)` : ''}`), 14, y)
      y += 5
    }
    y += 3
  }

  if (futurs.length > 0) {
    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFontSize(10); doc.setTextColor(...navy); doc.setFont('helvetica', 'bold')
    doc.text('Absences validees a venir (deja deduites du solde CP)', 14, y); y += 6
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    for (const f of futurs.sort((a, b) => a.du.localeCompare(b.du))) {
      if (y > 275) { doc.addPage(); y = 20 }
      doc.setTextColor(30, 35, 45)
      doc.text(sa(`${f.nom} · du ${fmtD(f.du)} au ${fmtD(f.au)} · ${f.jd} j decomptes`), 14, y); y += 5
    }
    y += 3
  }

  if (arrivees.length > 0 || departs.length > 0) {
    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFontSize(10); doc.setTextColor(...navy); doc.setFont('helvetica', 'bold')
    doc.text('Mouvements du mois', 14, y); y += 6
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 35, 45)
    for (const k of arrivees) { doc.text(sa(`Arrivee : ${k.full_name} (${k.type_contrat}) le ${fmtD(k.date_debut)}`), 14, y); y += 5 }
    for (const k of departs) { doc.text(sa(`Fin de contrat : ${k.full_name} (${k.type_contrat}) le ${fmtD(k.date_fin)}`), 14, y); y += 5 }
  }

  if (arriveesFutures.length > 0) {
    if (y > 255) { doc.addPage(); y = 20 } else { y += 3 }
    doc.setFontSize(10); doc.setTextColor(...navy); doc.setFont('helvetica', 'bold')
    doc.text('Arrivees prevues', 14, y); y += 6
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 35, 45)
    for (const k of arriveesFutures) {
      if (y > 275) { doc.addPage(); y = 20 }
      doc.text(sa(`${k.full_name} (${{ ALTERNANT: 'Alternant', STAGIAIRE: 'Stagiaire' }[k.type_contrat] || k.type_contrat}) : arrivee le ${fmtD(k.date_debut)}`), 14, y); y += 5
    }
  }

  doc.setFontSize(7); doc.setTextColor(...gris)
  doc.text(sa('Decompte CP : lundi a jeudi = 1 j, vendredi = 2 j (il emporte le samedi), week-ends et jours feries non decomptes.'), 14, 290)
  return Buffer.from(doc.output('arraybuffer'))
}

// ── Envoi Gmail (compte de service, delegation domaine) ────────────────────
async function tokenGmail() {
  let raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/^"|"$/g, '')
  const compte = JSON.parse(raw.includes('private_key') ? raw : Buffer.from(raw, 'base64').toString())
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const hdr = b64u({ alg: 'RS256', typ: 'JWT' })
  const pld = b64u({ iss: compte.client_email, sub: EXPEDITEUR, scope: 'https://www.googleapis.com/auth/gmail.send', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  const signer = crypto.createSign('RSA-SHA256'); signer.update(`${hdr}.${pld}`)
  const sig = signer.sign(compte.private_key).toString('base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${hdr}.${pld}.${sig}`,
  })
  const j = await r.json()
  if (!j.access_token) {
    throw new Error(`Delegation gmail.send refusee pour ${compte.client_email} : ${JSON.stringify(j)}. ` +
      'Ajouter le scope https://www.googleapis.com/auth/gmail.send au client dans admin.google.com (delegation au niveau du domaine).')
  }
  return j.access_token
}

async function envoyerGmail({ pdf, nomFichier, sujet, corps }) {
  const token = await tokenGmail()
  const boundary = 'entasis' + Date.now()
  const mime = [
    `From: ${EXPEDITEUR}`,
    `To: ${DESTINATAIRE}`,
    `Subject: =?UTF-8?B?${Buffer.from(sujet).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    corps,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${nomFichier}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${nomFichier}"`,
    '',
    pdf.toString('base64'),
    `--${boundary}--`,
  ].join('\r\n')
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(EXPEDITEUR)}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') }),
  })
  if (!r.ok) throw new Error(`Gmail send ${r.status}: ${await r.text()}`)
}

// ── Main : feuille du mois ECOULE ──────────────────────────────────────────
const estMain = process.argv[1] && process.argv[1].endsWith('feuille-temps-mensuelle.mjs')
if (estMain) {
  const now = new Date()
  const prec = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const annee = prec.getFullYear()
  const moisNum = prec.getMonth() + 1
  console.log(`[feuille-temps] calcul ${moisNum}/${annee}…`)
  const donnees = await chargerDonnees()
  const feuille = calculerFeuille({ ...donnees, annee, moisNum })
  console.log(`[feuille-temps] ${feuille.lignes.length} salaries`)
  const pdf = genererPdf({ ...feuille, annee, moisNum })
  const moisIso = `${annee}-${String(moisNum).padStart(2, '0')}`
  await envoyerGmail({
    pdf,
    nomFichier: `feuille-temps-entasis-${moisIso}.pdf`,
    sujet: `Feuille de temps Entasis · ${MOIS_LONGS[moisNum - 1]} ${annee}`,
    corps: `Bonjour,\n\nVeuillez trouver ci-joint la feuille de temps de l equipe Entasis pour ${MOIS_LONGS[moisNum - 1]} ${annee} : jours travailles, absences detaillees, conges decomptes et soldes, plus les mouvements de contrats.\n\nCe mail est envoye automatiquement par le CRM le 1er de chaque mois.\n\nBien a vous,\nLouis Hatton\nEntasis Conseil`,
  })
  console.log(`[feuille-temps] envoye a ${DESTINATAIRE}`)
}
