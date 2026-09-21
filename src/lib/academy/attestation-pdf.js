// src/lib/academy/attestation-pdf.js
// ═══════════════════════════════════════════════════════════════════════════
// Attestation interne de réalisation d'un module de l'Entasis Academy.
//
// Une page A4, remise au collaborateur qui a validé le quiz d'un module.
// C'est un document interne : il dit qui a suivi quoi, quand, avec quel
// score, et qui a relu le contenu. Il ne vaut ni certification
// réglementaire ni justificatif d'heures DDA, et la mention qui le dit est
// obligatoire en bas de page. Rien sur la rémunération, ni celle du
// collaborateur ni celle du cabinet.
//
// Charte : navy #0A1628, or #C9A961, texte ardoise, comme les fiches
// dispositif (fiches-immo-pdf). jsPDF est importé au clic seulement.
// ═══════════════════════════════════════════════════════════════════════════

const NAVY = [10, 22, 40]
const OR = [201, 169, 97]
const OR_CLAIR = [251, 246, 236]
const OR_SOMBRE = [122, 96, 40]
const ARDOISE = [44, 53, 72]
const GRIS = [122, 130, 145]
const BLANC = [255, 255, 255]

const PAGE = { l: 22, r: 22, w: 210, h: 297 }
const LARGEUR = PAGE.w - PAGE.l - PAGE.r
const PARIS = 'Europe/Paris'

export const TITRE_ATTESTATION = 'Attestation interne de réalisation'

export const MENTION_INTERNE = 'Document interne à Entasis Conseil. '
  + 'Cette attestation ne constitue ni une certification réglementaire '
  + 'ni un justificatif d\'heures de formation DDA.'

// jsPDF n'embarque que du WinAnsi : les caractères hors de cette table
// sortent en points d'interrogation. On garde les accents français, on
// remplace les signes typographiques (apostrophes courbes, tirets longs,
// points médians, puces, espaces insécables) par leurs équivalents simples.
export const ascii = (t) => String(t ?? '')
  .replace(/[\u2018\u2019\u201b]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/[\u00b7\u2022\u2027]/g, '-')
  .replace(/\u2026/g, '...')
  .replace(/\u00a0|\u202f|\u2009/g, ' ')

// ─── Fonctions pures (testées) ────────────────────────────────────────────

function instant(valeur) {
  const d = valeur instanceof Date ? valeur : new Date(String(valeur || ''))
  return Number.isNaN(d.getTime()) ? null : d
}

/** « 21 septembre 2026 », tel qu'on le vit à Paris, quel que soit le fuseau du poste. */
export function jourParis(valeur) {
  const d = instant(valeur)
  if (!d) return ''
  return d.toLocaleDateString('fr-FR', { timeZone: PARIS, day: 'numeric', month: 'long', year: 'numeric' })
}

/** AAAA-MM-JJ à Paris, pour le nom du fichier. */
export function dateFichier(valeur) {
  const d = instant(valeur)
  if (!d) return 'sans-date'
  // 'fr-CA' rend AAAA-MM-JJ.
  return d.toLocaleDateString('fr-CA', { timeZone: PARIS })
}

export function slugModule(texte) {
  const slug = ascii(texte).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return slug || 'module'
}

/** « 4 bonnes réponses sur 5 », au singulier pour 0 et 1. */
export function libelleScore(score, total) {
  const bonnes = Number(score)
  const questions = Number(total)
  if (!Number.isFinite(bonnes) || !Number.isFinite(questions) || questions <= 0) return ''
  const mot = bonnes > 1 ? 'bonnes réponses' : 'bonne réponse'
  return `${bonnes} ${mot} sur ${questions}`
}

export function nomFichierAttestation({ slug, titreModule, delivreeLe }) {
  return `Entasis-attestation-${slugModule(slug || titreModule)}-${dateFichier(delivreeLe)}.pdf`
}

/**
 * Les lignes du corps de l'attestation, dans l'ordre où le PDF les imprime.
 * Une donnée absente retire sa ligne : jamais de « undefined » sur un
 * document remis à quelqu'un.
 */
export function texteAttestation({ numero, delivreeLe, nomCollaborateur, titreModule, competence, score, total, reluPar } = {}) {
  const nom = String(nomCollaborateur || '').trim() || 'Collaborateur non renseigné'
  const module = String(titreModule || '').trim() || 'Module non renseigné'
  const lignes = [
    `Entasis Conseil atteste que ${nom} a suivi et validé le module de formation interne « ${module} ».`,
  ]
  const comp = String(competence || '').trim()
  if (comp) lignes.push(`Compétence travaillée : ${comp}.`)
  const scoreTexte = libelleScore(score, total)
  if (scoreTexte) lignes.push(`Quiz de validation : ${scoreTexte}.`)
  const jour = jourParis(delivreeLe)
  if (jour) lignes.push(`Validé le ${jour}.`)
  const num = String(numero || '').trim()
  if (num) lignes.push(`Attestation n° ${num}.`)
  const relecteur = String(reluPar || '').trim()
  if (relecteur) lignes.push(`Contenu relu par ${relecteur}.`)
  return lignes
}

// ─── PDF ──────────────────────────────────────────────────────────────────

function fond(doc, couleur) { doc.setFillColor(...couleur) }
function encre(doc, couleur) { doc.setTextColor(...couleur) }

/** Construit le document sans l'enregistrer (pour un lot ou un aperçu). */
export async function construireAttestation(donnees = {}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  // Bandeau navy, filet or. Pas de logo : le fichier public est navy sur
  // fond clair, illisible sur ce bandeau, on écrit le nom du cabinet.
  fond(doc, NAVY)
  doc.rect(0, 0, PAGE.w, 60, 'F')
  fond(doc, OR)
  doc.rect(0, 60, PAGE.w, 1.2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  encre(doc, OR)
  doc.text('ENTASIS CONSEIL', PAGE.l, 18)
  doc.text('ENTASIS ACADEMY', PAGE.w - PAGE.r, 18, { align: 'right' })

  doc.setFontSize(22)
  encre(doc, BLANC)
  doc.text(ascii(TITRE_ATTESTATION), PAGE.l, 36)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  encre(doc, [180, 190, 205])
  doc.text('Formation interne du cabinet', PAGE.l, 45)

  // Nom et module, en grand : c'est ce qu'on lit d'abord.
  const nom = String(donnees.nomCollaborateur || '').trim() || 'Collaborateur non renseigné'
  const module = String(donnees.titreModule || '').trim() || 'Module non renseigné'
  let y = 86
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  encre(doc, GRIS)
  doc.text('DÉLIVRÉE À', PAGE.l, y)
  y += 9
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  encre(doc, NAVY)
  doc.text(doc.splitTextToSize(ascii(nom), LARGEUR), PAGE.l, y)
  y += 14
  fond(doc, OR)
  doc.rect(PAGE.l, y - 4, 18, 0.9, 'F')
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  encre(doc, GRIS)
  doc.text('MODULE', PAGE.l, y)
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  encre(doc, ARDOISE)
  const titreModule = doc.splitTextToSize(ascii(module), LARGEUR)
  doc.text(titreModule, PAGE.l, y)
  y += titreModule.length * 6.5 + 10

  // Corps : les lignes de texteAttestation, une seule source de vérité pour
  // la formulation.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  encre(doc, ARDOISE)
  for (const ligne of texteAttestation(donnees)) {
    const rendu = doc.splitTextToSize(ascii(ligne), LARGEUR)
    doc.text(rendu, PAGE.l, y)
    y += rendu.length * 5.6 + 3.2
  }

  // Mention obligatoire, dans un encadré or au dessus du pied de page.
  doc.setFontSize(8.5)
  const mention = doc.splitTextToSize(ascii(MENTION_INTERNE), LARGEUR - 14)
  const hauteurMention = mention.length * 4.2 + 8
  const yMention = PAGE.h - 24 - hauteurMention - 8
  fond(doc, OR_CLAIR)
  doc.roundedRect(PAGE.l, yMention, LARGEUR, hauteurMention, 2, 2, 'F')
  fond(doc, OR)
  doc.rect(PAGE.l, yMention, 1.5, hauteurMention, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  encre(doc, OR_SOMBRE)
  doc.text(mention, PAGE.l + 7, yMention + 6)

  // Pied de page navy.
  fond(doc, NAVY)
  doc.rect(0, PAGE.h - 20, PAGE.w, 20, 'F')
  fond(doc, OR)
  doc.rect(0, PAGE.h - 20, PAGE.w, 0.6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  encre(doc, BLANC)
  doc.text('ENTASIS CONSEIL', PAGE.l, PAGE.h - 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  encre(doc, [150, 162, 180])
  doc.text('Entasis Academy - attestation interne, sans valeur réglementaire.', PAGE.l, PAGE.h - 6.5)
  const num = String(donnees.numero || '').trim()
  if (num) doc.text(ascii(`N° ${num}`), PAGE.w - PAGE.r, PAGE.h - 11, { align: 'right' })

  return doc
}

/** Construit l'attestation et lance le téléchargement. @returns {Promise<string>} nom du fichier */
export async function genererAttestation(donnees = {}) {
  const doc = await construireAttestation(donnees)
  const nomFichier = nomFichierAttestation(donnees)
  doc.save(nomFichier)
  return nomFichier
}
