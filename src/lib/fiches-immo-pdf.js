// src/lib/fiches-immo-pdf.js
// ═══════════════════════════════════════════════════════════════════════════
// Fiche PDF d un dispositif immobilier, pour le conseiller.
//
// Une page A4 recto verso, lisible en diagonale avant un rendez vous : a qui
// ca s adresse, comment ca marche, ce qui plait, ce qui fait capoter, et les
// questions a poser. Rien sur la remuneration, ni celle du conseiller ni
// celle du cabinet.
//
// Charte : navy #0A1628, or #C9A961, texte ardoise. jsPDF est deja au bundle
// (import dynamique, la fiche ne se genere qu au clic).
// ═══════════════════════════════════════════════════════════════════════════

import { FICHES_MAJ } from '../config/fichesImmo'

const NAVY = [10, 22, 40]
const OR = [201, 169, 97]
const OR_CLAIR = [251, 246, 236]
const ARDOISE = [44, 53, 72]
const GRIS = [122, 130, 145]
const BLANC = [255, 255, 255]
const ROUGE = [176, 58, 46]

const PAGE = { l: 18, r: 18, w: 210, h: 297 }
const LARGEUR = PAGE.w - PAGE.l - PAGE.r

// jsPDF n embarque que du WinAnsi : les caracteres hors de cette table
// sortent en points d interrogation. On garde les accents francais, on
// remplace les signes typographiques que l on utilise (apostrophes courbes,
// tirets longs, espaces insecables) par leurs equivalents simples.
const ascii = (t) => String(t ?? '')
  .replace(/[‘’‛]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/…/g, '...')
  .replace(/\u00a0|\u202f|\u2009/g, ' ')

export function nomFichierFiche(fiche) {
  const slug = ascii(fiche.dispositif).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `Entasis-fiche-${slug}.pdf`
}

export async function genererFiche(fiche, partenaire, conseiller) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const ctx = { doc, y: 0, page: 1 }

  enTete(ctx, fiche, partenaire)
  ctx.y = 62

  bloc(ctx, 'À qui ça s’adresse', fiche.pourQui, { puce: 'or' })
  bloc(ctx, 'Le principe, en clair', fiche.principe)
  encadreOr(ctx, fiche.avantage.titre, fiche.avantage.points)
  if (fiche.chiffres?.length) tableauChiffres(ctx, fiche.chiffres)
  bloc(ctx, 'Ce qui fait capoter un dossier', fiche.vigilance, { puce: 'rouge' })
  bloc(ctx, 'Les questions à poser au client', fiche.questions, { numerote: true })

  piedsDePage(ctx, partenaire, conseiller)
  return doc
}

export async function telechargerFiche(fiche, partenaire, conseiller) {
  const doc = await genererFiche(fiche, partenaire, conseiller)
  doc.save(nomFichierFiche(fiche))
}

// Toutes les fiches d un partenaire dans une archive, pour l onboarding d un
// nouveau conseiller.
export async function telechargerLot(fiches, partenaire, conseiller) {
  const [{ default: JSZip }] = await Promise.all([import('jszip')])
  const zip = new JSZip()
  for (const f of fiches) {
    const doc = await genererFiche(f, partenaire, conseiller)
    zip.file(nomFichierFiche(f), doc.output('blob'))
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Entasis-fiches-${partenaire ? ascii(partenaire.societe).replace(/\s+/g, '-') : 'immobilier'}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── Mise en page ─────────────────────────────────────────────────────────

function fond(doc, couleur) { doc.setFillColor(...couleur) }
function encre(doc, couleur) { doc.setTextColor(...couleur) }

function enTete({ doc }, fiche, partenaire) {
  fond(doc, NAVY)
  doc.rect(0, 0, PAGE.w, 52, 'F')
  fond(doc, OR)
  doc.rect(0, 52, PAGE.w, 1.2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  encre(doc, OR)
  doc.text('FICHE DISPOSITIF', PAGE.l, 15)

  doc.setFontSize(24)
  encre(doc, BLANC)
  doc.text(ascii(fiche.dispositif), PAGE.l, 27)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  encre(doc, [180, 190, 205])
  doc.text(ascii(fiche.titre), PAGE.l, 34)

  doc.setFontSize(9)
  encre(doc, [150, 162, 180])
  const accroche = doc.splitTextToSize(ascii(fiche.accroche), LARGEUR - 4)
  doc.text(accroche, PAGE.l, 42)

  if (partenaire) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    encre(doc, OR)
    doc.text(ascii(partenaire.societe.toUpperCase()), PAGE.w - PAGE.r, 15, { align: 'right' })
  }
}

function sautDePageSiBesoin(ctx, hauteur) {
  if (ctx.y + hauteur < PAGE.h - 24) return
  ctx.doc.addPage()
  ctx.page += 1
  fond(ctx.doc, NAVY)
  ctx.doc.rect(0, 0, PAGE.w, 3, 'F')
  ctx.y = 20
}

function titreSection(ctx, texte) {
  const { doc } = ctx
  sautDePageSiBesoin(ctx, 16)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  encre(doc, NAVY)
  doc.text(ascii(texte), PAGE.l, ctx.y)
  fond(doc, OR)
  doc.rect(PAGE.l, ctx.y + 1.8, 14, 0.8, 'F')
  ctx.y += 8
}

function bloc(ctx, titre, lignes, { puce = 'navy', numerote = false } = {}) {
  const { doc } = ctx
  titreSection(ctx, titre)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  lignes.forEach((ligne, i) => {
    const texte = doc.splitTextToSize(ascii(ligne), LARGEUR - 7)
    sautDePageSiBesoin(ctx, texte.length * 4.6 + 3)
    if (numerote) {
      doc.setFont('helvetica', 'bold')
      encre(doc, OR)
      doc.text(`${i + 1}.`, PAGE.l, ctx.y)
      doc.setFont('helvetica', 'normal')
    } else {
      fond(doc, puce === 'rouge' ? ROUGE : puce === 'or' ? OR : NAVY)
      doc.circle(PAGE.l + 1.4, ctx.y - 1.2, 1, 'F')
    }
    encre(doc, ARDOISE)
    doc.text(texte, PAGE.l + 6, ctx.y)
    ctx.y += texte.length * 4.6 + 2.6
  })
  ctx.y += 4
}

function encadreOr(ctx, titre, points) {
  const { doc } = ctx
  doc.setFontSize(9.5)
  const rendus = points.map((p) => doc.splitTextToSize(ascii(p), LARGEUR - 16))
  const hauteur = 13 + rendus.reduce((s, r) => s + r.length * 4.6 + 2.4, 0)
  sautDePageSiBesoin(ctx, hauteur + 6)

  fond(doc, OR_CLAIR)
  doc.roundedRect(PAGE.l, ctx.y - 4, LARGEUR, hauteur, 2, 2, 'F')
  fond(doc, OR)
  doc.rect(PAGE.l, ctx.y - 4, 1.5, hauteur, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  encre(doc, [122, 96, 40])
  doc.text(ascii(titre), PAGE.l + 7, ctx.y + 2)
  let y = ctx.y + 9
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  encre(doc, ARDOISE)
  rendus.forEach((r) => {
    fond(doc, OR)
    doc.circle(PAGE.l + 8.4, y - 1.2, 0.9, 'F')
    doc.text(r, PAGE.l + 12, y)
    y += r.length * 4.6 + 2.4
  })
  ctx.y += hauteur + 6
}

function tableauChiffres(ctx, chiffres) {
  const { doc } = ctx
  const hauteurLigne = 7.5
  sautDePageSiBesoin(ctx, chiffres.length * hauteurLigne + 12)
  titreSection(ctx, 'Les chiffres à retenir')
  chiffres.forEach((c, i) => {
    if (i % 2 === 0) {
      fond(doc, [248, 249, 251])
      doc.rect(PAGE.l, ctx.y - 4.2, LARGEUR, hauteurLigne, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    encre(doc, GRIS)
    doc.text(ascii(c.label), PAGE.l + 3, ctx.y)
    doc.setFont('helvetica', 'bold')
    encre(doc, NAVY)
    doc.text(ascii(c.valeur), PAGE.w - PAGE.r - 3, ctx.y, { align: 'right' })
    ctx.y += hauteurLigne
  })
  ctx.y += 5
}

function piedsDePage(ctx, partenaire, conseiller) {
  const { doc } = ctx
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p)
    fond(doc, NAVY)
    doc.rect(0, PAGE.h - 20, PAGE.w, 20, 'F')
    fond(doc, OR)
    doc.rect(0, PAGE.h - 20, PAGE.w, 0.6, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    encre(doc, BLANC)
    doc.text('ENTASIS CONSEIL', PAGE.l, PAGE.h - 13)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.6)
    encre(doc, [150, 162, 180])
    const referent = partenaire
      ? `Votre référent ${ascii(partenaire.metier)} : ${ascii(partenaire.referent)} - ${partenaire.email}`
      : ''
    doc.text(referent, PAGE.l, PAGE.h - 9)
    doc.text(
      ascii(`Document interne d’aide à la qualification, à jour au ${FICHES_MAJ}. Ne pas remettre au client en l’état.`),
      PAGE.l, PAGE.h - 5.6,
    )
    doc.text(
      ascii('Entasis ne commercialise pas de lots. Chiffres fiscaux à confirmer par le référent avant tout engagement.'),
      PAGE.l, PAGE.h - 2.4,
    )
    doc.setFontSize(7)
    encre(doc, [150, 162, 180])
    doc.text(`${p}/${total}`, PAGE.w - PAGE.r, PAGE.h - 13, { align: 'right' })
    if (conseiller) {
      doc.setFontSize(6.6)
      doc.text(ascii(conseiller), PAGE.w - PAGE.r, PAGE.h - 9, { align: 'right' })
    }
  }
}
