// src/lib/conformite-pdf.js
// Generateurs PDF du module Conformite : Recueil des exigences et besoins
// (8 pages) et Devoir de conseil (4 pages). La mise en page reproduit les
// documents modeles du cabinet : entete ENTASIS avec logo, bandeau titre
// gris avec trait accent navy, encadres cabinet et client sur les pages
// interieures, pied de page avec mention legale et numerotation X / Y.

import { jsPDF } from 'jspdf';
import {
  RISK_QUESTIONS,
  PROFILS,
  CABINET,
  INTRO_RECUEIL,
  NOTRE_CONSEIL_PER,
  OBLIGATIONS_PER,
  AVERTISSEMENTS_PER,
  ALERTE_ORIENTATION,
  DECLARATIONS_TEXTS,
  RGPD_TEXT,
  REGLEMENTAIRE_INTRO_DEVOIR,
  PPE_DEFINITION,
  orientationMismatch,
} from './conformite-questionnaire';

// Constantes de mise en page (unite : mm, format A4 portrait)
const PAGE_L = 210;
const MARGE = 12;
const CONTENT_W = PAGE_L - MARGE * 2;
const LIMITE_BAS = 264; // au dela du seuil, saut de page automatique
const PIED_Y = 268; // ligne de separation du pied de page

// Couleurs de la charte
const NAVY = [29, 46, 71];
const TEXTE = [44, 53, 72];
const GRIS_FOND = [244, 245, 247];
const GRIS_LABEL = [120, 126, 142];
const GRIS_BLOC = [90, 99, 120];
const GRIS_TRAIT = [205, 208, 216];
const BLEU_CLAIR = [222, 233, 244];
const OR = [197, 165, 90];

// Applique police, taille et couleur en un seul appel
function police(doc, style, taille, couleur) {
  doc.setFont('helvetica', style);
  doc.setFontSize(taille);
  doc.setTextColor(couleur[0], couleur[1], couleur[2]);
}

// Charge le logo public a l execution. Retourne null en cas d echec,
// le fallback texte prendra le relais.
async function chargerLogo() {
  try {
    const img = new Image();
    img.src = '/entasis-logo.png';
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

// Date en francais JJ/MM/AAAA. Accepte une string ISO, une Date, ou vide.
function dateFr(valeur) {
  if (!valeur) return '';
  const s = String(valeur);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function dateDuJourFr() {
  return dateFr(new Date());
}

// Date locale (annee, mois, jour) pour les noms de fichiers
function dateIsoLocale() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Nom de client nettoye pour un nom de fichier
function slugNom(nom) {
  const s = String(nom || 'Client')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || 'Client';
}

const ouiNon = (v) => (v ? 'Oui' : 'Non');

// Logo en haut a droite, fallback texte navy gras italique si absent
function dessinerLogo(ctx) {
  const doc = ctx.doc;
  if (ctx.logo && ctx.logo.width && ctx.logo.height) {
    const largeur = 30;
    const hauteur = largeur / (ctx.logo.width / ctx.logo.height);
    doc.addImage(ctx.logo, 'PNG', PAGE_L - MARGE - largeur, 14, largeur, hauteur);
  } else {
    police(doc, 'bolditalic', 16, NAVY);
    doc.text('Entasis', PAGE_L - MARGE, 21, { align: 'right' });
  }
}

// Pied de page : trait fin, mention legale complete en 6.5 pt, Page X / Y centre
function piedDePage(ctx) {
  const doc = ctx.doc;
  doc.setDrawColor(GRIS_TRAIT[0], GRIS_TRAIT[1], GRIS_TRAIT[2]);
  doc.setLineWidth(0.2);
  doc.line(MARGE, PIED_Y, MARGE + CONTENT_W, PIED_Y);
  police(doc, 'normal', 6.5, GRIS_LABEL);
  const lignes = doc.splitTextToSize(String(CABINET.footerLegal || ''), CONTENT_W - 4);
  doc.text(lignes, MARGE + 2, PIED_Y + 3.5, { lineHeightFactor: 1.3 });
  // La numerotation Page X / Y est posee en toute fin (numeroterPages) : avec
  // l alias putTotalPages, le centrage etait calcule sur la largeur de l alias
  // et le rendu final se retrouvait decale.
}

// Passe finale juste avant save : numerote chaque page avec le vrai total,
// centre correctement.
function numeroterPages(doc) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    police(doc, 'normal', 7.5, GRIS_LABEL);
    doc.text(`Page ${p} / ${total}`, PAGE_L / 2, 291.5, { align: 'center' });
  }
}

// Entete de la premiere page : bloc cabinet a gauche, conseiller dessous, logo a droite
function entetePremierePage(ctx) {
  const doc = ctx.doc;
  police(doc, 'bold', 11, TEXTE);
  doc.text(String(CABINET.nom || ''), MARGE, 17);
  police(doc, 'normal', 7.5, GRIS_LABEL);
  doc.text(String(CABINET.adresse || ''), MARGE, 21.5);
  doc.text(String(CABINET.tel || ''), MARGE, 25);
  police(doc, 'bold', 7.5, TEXTE);
  const wCons = doc.getTextWidth('Conseiller : ');
  doc.text('Conseiller : ', MARGE, 31);
  police(doc, 'normal', 7.5, GRIS_LABEL);
  doc.text(String(ctx.advisorName || ''), MARGE + wCons, 31);
  doc.text(String(ctx.advisorEmail || ''), MARGE, 34.5);
  dessinerLogo(ctx);
  ctx.y = 42;
}

// Entete des pages interieures : titre avec trait accent navy, sous titre
// produit, puis les deux encadres gris (cabinet a gauche, client a droite)
function enteteInterieure(ctx) {
  const doc = ctx.doc;
  police(doc, 'bold', 15, TEXTE);
  doc.text(String(ctx.titreInterieur || ''), MARGE, 19);
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(1.2);
  doc.line(MARGE, 21.6, MARGE + 17, 21.6);
  police(doc, 'bold', 10.5, TEXTE);
  doc.text(String(ctx.sousTitre || ''), MARGE, 27.5);

  const yBox = 32;
  const hBox = 36;
  const wBox = 89;
  const xDroit = MARGE + CONTENT_W - wBox;
  doc.setFillColor(GRIS_FOND[0], GRIS_FOND[1], GRIS_FOND[2]);
  doc.rect(MARGE, yBox, wBox, hBox, 'F');
  doc.rect(xDroit, yBox, wBox, hBox, 'F');

  // Encadre cabinet
  police(doc, 'bold', 10.5, TEXTE);
  doc.text(String(CABINET.nom || ''), MARGE + 5, yBox + 8);
  police(doc, 'normal', 7.5, GRIS_LABEL);
  doc.text(String(CABINET.adresse || ''), MARGE + 5, yBox + 14);
  doc.text(String(CABINET.tel || ''), MARGE + 5, yBox + 17.5);
  police(doc, 'bold', 7.5, TEXTE);
  const wCons = doc.getTextWidth('Conseiller : ');
  doc.text('Conseiller : ', MARGE + 5, yBox + 25);
  police(doc, 'normal', 7.5, GRIS_LABEL);
  doc.text(String(ctx.advisorName || ''), MARGE + 5 + wCons, yBox + 25);
  doc.text(String(ctx.advisorEmail || ''), MARGE + 5, yBox + 28.5);

  // Encadre client
  const c = ctx.client || {};
  police(doc, 'bold', 10.5, TEXTE);
  doc.text(`${c.nom || ''} ${c.prenom || ''}`.trim(), xDroit + 5, yBox + 8);
  police(doc, 'normal', 7.5, GRIS_LABEL);
  const adresseClient = [c.adresse, `${c.code_postal || ''} ${c.ville || ''}`.trim()]
    .filter(Boolean)
    .join(' ');
  const lignesAdr = doc.splitTextToSize(adresseClient, wBox - 10);
  doc.text(lignesAdr, xDroit + 5, yBox + 14);
  const yApresAdr = yBox + 14 + Math.max(lignesAdr.length, 1) * 3.5;
  doc.text(String(c.telephone || ''), xDroit + 5, yApresAdr);
  doc.text(String(c.email || ''), xDroit + 5, yApresAdr + 3.5);

  ctx.y = yBox + hBox + 9;
}

// Nouvelle page interieure : pied de page puis entete, curseur repositionne
function nouvellePage(ctx) {
  ctx.doc.addPage();
  piedDePage(ctx);
  enteteInterieure(ctx);
}

// Garantit la place pour un bloc de hauteur donnee, sinon saute de page
function assurer(ctx, hauteur) {
  if (ctx.y + hauteur > LIMITE_BAS) nouvellePage(ctx);
}

// Bandeau titre de la premiere page : fond gris, titre, trait accent navy,
// sous titre produit, puis les paragraphes d introduction (puces acceptees)
function bandeauTitre(ctx, introBrut, { tailleIntro = 9.5, interligneIntro = 4.6, couleurIntro = TEXTE } = {}) {
  const doc = ctx.doc;
  const pad = 7;
  const largeurTexte = CONTENT_W - pad * 2;

  police(doc, 'normal', tailleIntro, couleurIntro);
  const blocs = introBrut
    .map((l) => String(l).trim())
    .filter(Boolean)
    .map((chunk) => {
      const puce = /^[\u2022-]/.test(chunk);
      const texte = puce ? chunk.replace(/^[\u2022-]\s*/, '') : chunk;
      return { puce, lignes: doc.splitTextToSize(texte, largeurTexte - (puce ? 8 : 0)) };
    });
  const hIntro = blocs.reduce((s, b) => s + b.lignes.length * interligneIntro + 1.6, 0);
  const hauteur = pad + 6.5 + 11 + 8 + hIntro - 1.6 + pad;

  const yBande = ctx.y;
  doc.setFillColor(GRIS_FOND[0], GRIS_FOND[1], GRIS_FOND[2]);
  doc.rect(MARGE, yBande, CONTENT_W, hauteur, 'F');

  let y = yBande + pad + 6.5;
  police(doc, 'bold', 17, TEXTE);
  doc.text(String(ctx.titre || ''), MARGE + pad, y);
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(1.3);
  doc.line(MARGE + pad, y + 3.4, MARGE + pad + 18, y + 3.4);
  y += 11;
  police(doc, 'bold', 11.5, TEXTE);
  doc.text(String(ctx.sousTitre || ''), MARGE + pad, y);
  y += 8;
  blocs.forEach((b) => {
    police(doc, 'normal', tailleIntro, couleurIntro);
    if (b.puce) doc.text('•', MARGE + pad + 3, y);
    const x = MARGE + pad + (b.puce ? 8 : 0);
    b.lignes.forEach((l) => {
      doc.text(l, x, y);
      y += interligneIntro;
    });
    y += 1.6;
  });

  ctx.y = yBande + hauteur + 10;
}

// Titre de section souligne d un trait navy epais sur toute la largeur
function titreSection(ctx, titre) {
  assurer(ctx, 22);
  ctx.y += 2;
  const doc = ctx.doc;
  police(doc, 'bold', 13, TEXTE);
  doc.text(titre, MARGE, ctx.y);
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(0.9);
  doc.line(MARGE, ctx.y + 2.4, MARGE + CONTENT_W, ctx.y + 2.4);
  ctx.y += 11;
}

// Sous bloc gris bleu (Situation personnelle, Patrimoine financier, etc.)
function titreBloc(ctx, titre) {
  assurer(ctx, 14);
  police(ctx.doc, 'bold', 11, GRIS_BLOC);
  ctx.doc.text(titre, MARGE, ctx.y);
  ctx.y += 6.5;
}

// Intertitre gras simple (Notre Conseil, Declarations, etc.)
function intertitre(ctx, titre) {
  assurer(ctx, 14);
  police(ctx.doc, 'bold', 11, TEXTE);
  ctx.doc.text(titre, MARGE, ctx.y);
  ctx.y += 6.5;
}

// Paragraphe avec cesure automatique via splitTextToSize, saut de page par ligne
function paragraphe(ctx, texte, { taille = 10, style = 'normal', couleur = TEXTE, interligne = 5.2, x = MARGE, largeur = CONTENT_W } = {}) {
  const doc = ctx.doc;
  police(doc, style, taille, couleur);
  const lignes = doc.splitTextToSize(String(texte || ''), largeur);
  lignes.forEach((l) => {
    assurer(ctx, interligne);
    police(doc, style, taille, couleur);
    doc.text(l, x, ctx.y);
    ctx.y += interligne;
  });
}

// Suite de paragraphes separes par des sauts de ligne
function paragraphes(ctx, texte, opts = {}) {
  String(texte || '')
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((p) => {
      paragraphe(ctx, p, opts);
      ctx.y += 2.2;
    });
}

// Ligne question puis reponse en gras, avec cesure si la question est longue
function ligneMixte(ctx, avant, gras, { taille = 10, interligne = 5.4, couleurAvant = TEXTE, styleGras = 'bold' } = {}) {
  const doc = ctx.doc;
  police(doc, 'normal', taille, couleurAvant);
  const lignes = doc.splitTextToSize(`${avant} `, CONTENT_W);
  const wDerniere = doc.getTextWidth(`${lignes[lignes.length - 1]} `);
  police(doc, styleGras, taille, TEXTE);
  const wGras = doc.getTextWidth(String(gras));
  const grasApart = wDerniere + wGras > CONTENT_W;
  assurer(ctx, (lignes.length + (grasApart ? 1 : 0)) * interligne);
  police(doc, 'normal', taille, couleurAvant);
  lignes.forEach((l, i) => {
    doc.text(l, MARGE, ctx.y);
    if (i < lignes.length - 1) ctx.y += interligne;
  });
  police(doc, styleGras, taille, TEXTE);
  if (grasApart) {
    ctx.y += interligne;
    doc.text(String(gras), MARGE, ctx.y);
  } else {
    doc.text(String(gras), MARGE + wDerniere, ctx.y);
  }
  ctx.y += interligne;
}

// Phrase composee de segments normaux et gras enchaines sur la meme ligne
function ligneSegments(ctx, segments, { taille = 10, interligne = 5.4 } = {}) {
  const doc = ctx.doc;
  assurer(ctx, interligne + 2);
  let x = MARGE;
  segments.forEach((seg) => {
    police(doc, seg.gras ? 'bold' : 'normal', taille, TEXTE);
    String(seg.texte)
      .split(' ')
      .filter((m) => m.length)
      .forEach((mot) => {
        const morceau = `${mot} `;
        const w = doc.getTextWidth(morceau);
        if (x + w > MARGE + CONTENT_W) {
          x = MARGE;
          ctx.y += interligne;
          assurer(ctx, interligne);
          police(doc, seg.gras ? 'bold' : 'normal', taille, TEXTE);
        }
        doc.text(morceau, x, ctx.y);
        x += w;
      });
  });
  ctx.y += interligne;
}

// Grille de paires label valeur sur deux colonnes (label gris, valeur grasse).
// Les valeurs sont cesurees sur la largeur de leur colonne : une adresse ou un
// email long ne doit jamais chevaucher la colonne voisine ni la marge droite.
function grilleDeuxColonnes(ctx, gauche, droite) {
  const doc = ctx.doc;
  const lh = 5.6;
  const lhSuite = 4.8;
  const colX = [MARGE, MARGE + 94];
  const colW = [94, CONTENT_W - 94];
  const n = Math.max(gauche.length, droite.length);
  for (let i = 0; i < n; i++) {
    let lignesMax = 1;
    const rendus = [gauche[i], droite[i]].map((paire, c) => {
      if (!paire) return null;
      police(doc, 'normal', 10, GRIS_LABEL);
      const prefixe = `${paire[0]} : `;
      const wPrefixe = doc.getTextWidth(prefixe);
      police(doc, 'bold', 10, TEXTE);
      const wDispo = Math.max(20, colW[c] - wPrefixe - 4);
      const lignes = doc.splitTextToSize(String(paire[1] ?? ''), wDispo);
      lignesMax = Math.max(lignesMax, lignes.length);
      return { prefixe, wPrefixe, lignes, x: colX[c] };
    });
    assurer(ctx, lh + (lignesMax - 1) * lhSuite);
    rendus.forEach((r) => {
      if (!r) return;
      police(doc, 'normal', 10, GRIS_LABEL);
      doc.text(r.prefixe, r.x, ctx.y);
      police(doc, 'bold', 10, TEXTE);
      r.lignes.forEach((l, j) => doc.text(l, r.x + r.wPrefixe, ctx.y + j * lhSuite));
    });
    ctx.y += lh + (lignesMax - 1) * lhSuite;
  }
}

// Liste a puces
function puces(ctx, items, { taille = 10, interligne = 5.2, style = 'normal' } = {}) {
  const doc = ctx.doc;
  (items || []).forEach((item) => {
    police(doc, style, taille, TEXTE);
    const lignes = doc.splitTextToSize(String(item), CONTENT_W - 9);
    assurer(ctx, lignes.length * interligne + 1.2);
    police(doc, style, taille, TEXTE);
    doc.text('•', MARGE + 3, ctx.y);
    lignes.forEach((l) => {
      doc.text(l, MARGE + 8, ctx.y);
      ctx.y += interligne;
    });
    ctx.y += 1.2;
  });
}

// Tableau pays de fiscalite et numero : ligne de titre navy, ligne de valeurs bordee
function tableauFiscalite(ctx, pays, numero) {
  const doc = ctx.doc;
  assurer(ctx, 22);
  const hLigne = 7;
  const xMilieu = MARGE + CONTENT_W / 2;
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(MARGE, ctx.y, CONTENT_W, hLigne, 'F');
  police(doc, 'normal', 9.5, [255, 255, 255]);
  doc.text('Pays de fiscalité', MARGE + 3, ctx.y + 4.7);
  doc.text('Numéro de fiscalité', xMilieu + 3, ctx.y + 4.7);
  ctx.y += hLigne;
  doc.setDrawColor(TEXTE[0], TEXTE[1], TEXTE[2]);
  doc.setLineWidth(0.25);
  doc.rect(MARGE, ctx.y, CONTENT_W, hLigne);
  doc.line(xMilieu, ctx.y, xMilieu, ctx.y + hLigne);
  police(doc, 'bold', 9.5, TEXTE);
  doc.text(String(pays || ''), MARGE + 3, ctx.y + 4.7);
  doc.text(String(numero || ''), xMilieu + 3, ctx.y + 4.7);
  ctx.y += hLigne + 7;
}

// Tableau du Devoir de conseil : deux lignes grises Compagnie et Nom du produit.
// La valeur est cesuree sur la largeur de sa cellule (nom de produit long) et
// la hauteur de la ligne s adapte.
function tableauProduit(ctx, compagnie, nomProduit) {
  const doc = ctx.doc;
  assurer(ctx, 24);
  [['Compagnie', compagnie], ['Nom du produit', nomProduit]].forEach(([label, valeur]) => {
    police(doc, 'bold', 9, TEXTE);
    const lignes = doc.splitTextToSize(String(valeur || ''), CONTENT_W * 0.5);
    const h = Math.max(8, 4.4 + lignes.length * 4);
    assurer(ctx, h + 2);
    doc.setFillColor(GRIS_FOND[0], GRIS_FOND[1], GRIS_FOND[2]);
    doc.rect(MARGE, ctx.y, CONTENT_W, h, 'F');
    police(doc, 'normal', 9, TEXTE);
    doc.text(label, MARGE + 3, ctx.y + 5.2);
    police(doc, 'bold', 9, TEXTE);
    lignes.forEach((l, j) => doc.text(l, MARGE + CONTENT_W * 0.72, ctx.y + 5.2 + j * 4, { align: 'center' }));
    ctx.y += h + 2;
  });
  ctx.y += 3;
}

// Une option du profil de risque : case a cocher 3 x 3 mm dessinee, croix si
// selectionnee, libelle, puis les points en italique a la suite
function optionRisque(ctx, opt, cochee) {
  const doc = ctx.doc;
  const taille = 9;
  const lh = 4.3;
  const xTexte = MARGE + 8;
  const largeur = CONTENT_W - 8;
  police(doc, 'normal', taille, TEXTE);
  const lignes = doc.splitTextToSize(String(opt.label || ''), largeur);
  const wDerniere = doc.getTextWidth(`${lignes[lignes.length - 1]} `);
  const suffixe = `(${opt.points} point(s))`;
  police(doc, 'italic', taille, GRIS_LABEL);
  const wSuffixe = doc.getTextWidth(suffixe);
  const suffixeApart = wDerniere + wSuffixe > largeur;
  assurer(ctx, (lignes.length + (suffixeApart ? 1 : 0)) * lh + 0.8);

  const yCase = ctx.y - 2.4;
  doc.setDrawColor(TEXTE[0], TEXTE[1], TEXTE[2]);
  doc.setLineWidth(0.3);
  doc.rect(MARGE + 2, yCase, 3, 3);
  if (cochee) {
    doc.line(MARGE + 2.5, yCase + 0.5, MARGE + 4.5, yCase + 2.5);
    doc.line(MARGE + 4.5, yCase + 0.5, MARGE + 2.5, yCase + 2.5);
  }

  police(doc, 'normal', taille, TEXTE);
  lignes.forEach((l, i) => {
    doc.text(l, xTexte, ctx.y);
    if (i < lignes.length - 1) ctx.y += lh;
  });
  police(doc, 'italic', taille, GRIS_LABEL);
  if (suffixeApart) {
    ctx.y += lh;
    doc.text(suffixe, xTexte, ctx.y);
  } else {
    doc.text(suffixe, xTexte + wDerniere, ctx.y);
  }
  ctx.y += lh;
}

// Les 14 questions du profil de risque avec toutes leurs options
function sectionProfilRisque(ctx, reponses) {
  const doc = ctx.doc;
  const risque = (reponses && reponses.risque) || {};
  RISK_QUESTIONS.forEach((q, iQ) => {
    police(doc, 'bold', 10, TEXTE);
    const lignesQ = doc.splitTextToSize(`${iQ + 1}. ${q.label}`, CONTENT_W - 2);
    assurer(ctx, lignesQ.length * 4.8 + 7);
    police(doc, 'bold', 10, TEXTE);
    lignesQ.forEach((l) => {
      doc.text(l, MARGE + 1, ctx.y);
      ctx.y += 4.8;
    });
    ctx.y += 0.4;
    (q.options || []).forEach((opt, iO) => {
      const cochee = q.multi
        ? Array.isArray(risque[q.id]) && risque[q.id].includes(iO)
        : risque[q.id] === iO;
      optionRisque(ctx, opt, cochee);
    });
    ctx.y += 2.4;
  });
}

// Encadre bleu clair centre du profil investisseur (score, profil, description)
function encadreProfil(ctx, score, profil) {
  const doc = ctx.doc;
  const pad = 5;
  police(doc, 'normal', 10, TEXTE);
  const lignesDesc = doc.splitTextToSize(String((profil && profil.desc) || ''), CONTENT_W - pad * 2);
  const n = Math.max(lignesDesc.length, 1);
  const hauteur = pad + 4.5 + 6.5 + 7 + 6 + (n - 1) * 4.8 + pad;
  assurer(ctx, hauteur + 6);

  const yBox = ctx.y;
  doc.setFillColor(BLEU_CLAIR[0], BLEU_CLAIR[1], BLEU_CLAIR[2]);
  doc.rect(MARGE, yBox, CONTENT_W, hauteur, 'F');
  doc.setFillColor(OR[0], OR[1], OR[2]);
  doc.rect(MARGE, yBox, 1.2, hauteur, 'F');

  let y = yBox + pad + 4.5;
  const avant = 'Vous avez obtenu : ';
  const gras = `${score} points sur 30`;
  police(doc, 'normal', 11.5, GRIS_LABEL);
  const w1 = doc.getTextWidth(avant);
  police(doc, 'bold', 11.5, TEXTE);
  const w2 = doc.getTextWidth(gras);
  const x1 = MARGE + (CONTENT_W - w1 - w2) / 2;
  police(doc, 'normal', 11.5, GRIS_LABEL);
  doc.text(avant, x1, y);
  police(doc, 'bold', 11.5, TEXTE);
  doc.text(gras, x1 + w1, y);
  y += 6.5;
  police(doc, 'bold', 11, NAVY);
  doc.text('Votre profil investisseur est le suivant :', PAGE_L / 2, y, { align: 'center' });
  y += 7;
  police(doc, 'bold', 11.5, TEXTE);
  doc.text(String((profil && profil.label) || ''), PAGE_L / 2, y, { align: 'center' });
  y += 6;
  police(doc, 'normal', 10, TEXTE);
  lignesDesc.forEach((l) => {
    doc.text(l, MARGE + pad, y);
    y += 4.8;
  });

  ctx.y = yBox + hauteur + 10;
}

// Deux cadres de signature cote a cote, nom du courtier dans le cadre gauche
function blocSignatures(ctx, advisorName) {
  const doc = ctx.doc;
  assurer(ctx, 46);
  const wCadre = 88;
  const hCadre = 30;
  const xDroit = MARGE + CONTENT_W - wCadre;
  police(doc, 'bold', 10, TEXTE);
  doc.text('Signature du courtier', MARGE, ctx.y);
  doc.text('Signature du client', xDroit, ctx.y);
  ctx.y += 3;
  doc.setDrawColor(GRIS_TRAIT[0], GRIS_TRAIT[1], GRIS_TRAIT[2]);
  doc.setLineWidth(0.3);
  doc.rect(MARGE, ctx.y, wCadre, hCadre);
  doc.rect(xDroit, ctx.y, wCadre, hCadre);
  police(doc, 'bold', 10, TEXTE);
  doc.text(String(advisorName || ''), MARGE + 3, ctx.y + 6);
  ctx.y += hCadre + 8;
}

// Recueil des exigences et besoins, 8 pages du modele
export async function genRecueilPdf({ dossier, advisorName, advisorEmail }) {
  const logo = await chargerLogo();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rep = (dossier && dossier.reponses) || {};
  const sit = rep.situation || {};
  const pro = rep.professionnel || {};
  const regl = rep.reglementaire || {};
  const pat = rep.patrimoine || {};
  const ctr = rep.contrat || {};

  const ctx = {
    doc,
    y: 0,
    logo,
    titre: 'Recueil des exigences et besoins',
    titreInterieur: 'Recueil exigences et besoins',
    sousTitre: dossier.produit || 'Plan Epargne Retraite Individuel (PER IN)',
    advisorName,
    advisorEmail,
    client: sit,
  };

  piedDePage(ctx);
  entetePremierePage(ctx);
  bandeauTitre(ctx, String(INTRO_RECUEIL || '').split('\n'), {
    tailleIntro: 7.2,
    interligneIntro: 3.6,
    couleurIntro: GRIS_LABEL,
  });

  // Situation personnelle et professionnelle
  titreSection(ctx, 'Situation personnelle et professionnelle');
  titreBloc(ctx, 'Situation personnelle');
  grilleDeuxColonnes(
    ctx,
    [
      ['Nom Prénom', `${sit.nom || ''} ${sit.prenom || ''}`.trim()],
      ['Adresse', sit.adresse],
      ['Code postal', sit.code_postal],
      ['Ville', sit.ville],
      ['Pays', sit.pays],
      ['Nationalité', sit.nationalite],
      ['Téléphone', sit.telephone],
      ['Email', sit.email],
    ],
    [
      ['Situation matrimoniale', sit.situation_matrimoniale],
      ['Nombre d’enfants', sit.nb_enfants],
      ['Nombre de personnes à charge', sit.personnes_charge],
      ['Date de naissance', dateFr(sit.date_naissance)],
      ['Code postal de naissance', sit.cp_naissance],
      ['Ville de naissance', sit.ville_naissance],
      ['Pays de naissance', sit.pays_naissance],
    ]
  );
  ctx.y += 3;
  titreBloc(ctx, 'Situation Professionnelle');
  grilleDeuxColonnes(
    ctx,
    [
      ['Catégorie Métier INSEE', pro.categorie_insee],
      ['Métier INSEE', pro.metier],
      ['Statut professionnel', pro.statut],
    ],
    []
  );
  ctx.y += 4;

  // Informations reglementaires
  titreSection(ctx, 'Informations règlementaires');
  tableauFiscalite(ctx, regl.pays_fiscalite, regl.numero_fiscal);
  ligneMixte(ctx, 'Êtes vous de nationalité américaine ? (nationalité unique ou double nationalité) :', ouiNon(regl.us_nationalite));
  ctx.y += 1.5;
  ligneMixte(ctx, 'Êtes vous résident fiscal américain ? :', ouiNon(regl.us_resident));
  ctx.y += 3;
  ligneMixte(ctx, 'Êtes vous une personne politiquement exposée*? :', ouiNon(regl.ppe));
  paragraphe(ctx, PPE_DEFINITION, { taille: 7, style: 'italic', couleur: GRIS_LABEL, interligne: 3.4 });
  ctx.y += 3;
  ligneMixte(ctx, 'Avez-vous dans votre entourage proche une personne politiquement exposée ? :', ouiNon(regl.ppe_entourage));
  ctx.y += 3;
  paragraphe(ctx, 'Protection juridique', { interligne: 5 });
  paragraphe(ctx, regl.protection_juridique || '', { style: 'bold', interligne: 5 });
  ctx.y += 4;

  // Synthese patrimoniale
  titreSection(ctx, 'Synthèse patrimoniale');
  titreBloc(ctx, 'Patrimoine financier');
  grilleDeuxColonnes(
    ctx,
    [['Patrimoine financier du client', pat.fin_client]],
    [['Patrimoine financier du foyer', pat.fin_foyer]]
  );
  ctx.y += 3;
  titreBloc(ctx, 'Patrimoine immobilier');
  grilleDeuxColonnes(
    ctx,
    [
      ['Nombre de bien(s) détenu(s)', pat.immo_nb],
      ['Revenus annuels', pat.immo_revenus],
    ],
    [
      ['Valeurs totales des biens', pat.immo_valeur],
      ['Patrimoine immobilier du foyer', pat.immo_foyer],
    ]
  );
  ctx.y += 3;
  titreBloc(ctx, 'Revenu annuel imposable');
  grilleDeuxColonnes(
    ctx,
    [['Revenu annuel imposable du client', pat.revenu_client]],
    [['Revenu annuel imposable du foyer', pat.revenu_foyer]]
  );
  ctx.y += 3;
  titreBloc(ctx, 'Fiscalité');
  grilleDeuxColonnes(ctx, [['Tranche d’imposition', pat.tmi]], []);
  ctx.y += 3;
  titreBloc(ctx, 'Charges régulières');
  ligneMixte(ctx, 'Parts des revenus consacrées aux charges régulières (loyer, crédit...) :', pat.charges_part ?? '', { couleurAvant: GRIS_LABEL });
  ligneMixte(ctx, 'Capacité d’épargne :', pat.capacite_epargne ?? '', { couleurAvant: GRIS_LABEL });
  ligneMixte(ctx, 'Capacité d’endettement :', pat.capacite_endettement ?? '', { couleurAvant: GRIS_LABEL });
  ctx.y += 4;

  // Profil de risque, les 14 questions avec cases a cocher
  titreSection(ctx, 'Profil de risque');
  sectionProfilRisque(ctx, rep);
  ctx.y += 2;

  // Profil investisseur
  titreSection(ctx, 'Votre profil investisseur');
  const score = Number(dossier.score || 0);
  const profil =
    PROFILS.find((p) => p.label === dossier.profil) ||
    PROFILS.find((p) => score >= p.min && score <= p.max) ||
    PROFILS[0];
  encadreProfil(ctx, score, profil);

  // Donnees du contrat
  titreSection(ctx, 'Données du contrat');
  grilleDeuxColonnes(
    ctx,
    [['Début d’effet souhaitée', dateFr(ctr.date_effet || dossier.date_effet)]],
    [['Âge de départ à la retraite', ctr.age_retraite ? `${ctr.age_retraite} ans` : '']]
  );
  ctx.y += 4;

  // Notre proposition
  titreSection(ctx, 'Notre proposition');
  intertitre(ctx, 'Notre Conseil');
  const texteConseil = (rep.conseil && rep.conseil.texte) || NOTRE_CONSEIL_PER;
  paragraphes(ctx, texteConseil);
  ctx.y += 2;

  // Avertissements
  intertitre(ctx, 'Avertissements / Mises en garde éventuelles');
  puces(ctx, AVERTISSEMENTS_PER);
  if (orientationMismatch(rep)) {
    ctx.y += 1;
    paragraphe(ctx, ALERTE_ORIENTATION, { style: 'bold' });
  }
  ctx.y += 4;

  // Declarations
  intertitre(ctx, 'Déclarations');
  DECLARATIONS_TEXTS.forEach((t) => {
    paragraphes(ctx, t);
    ctx.y += 1.5;
  });
  ctx.y += 2;

  paragraphe(
    ctx,
    `Fait à ${ctr.fait_a || 'Paris'}, le ${dateDuJourFr()}, à retourner signé avec la mention « Bon pour Accord »`,
    { style: 'italic' }
  );
  ctx.y += 4;
  blocSignatures(ctx, advisorName);

  // Traitement de l information (RGPD)
  titreSection(ctx, 'Traitement de l’information');
  RGPD_TEXT.forEach((t) => {
    paragraphes(ctx, t);
    ctx.y += 1.5;
  });

  numeroterPages(doc);
  doc.save(`Recueil_besoins_${slugNom(sit.nom)}_${dateIsoLocale()}.pdf`);
}

// Devoir de conseil, 4 pages du modele
export async function genDevoirPdf({ dossier, advisorName, advisorEmail }) {
  const logo = await chargerLogo();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rep = (dossier && dossier.reponses) || {};
  const sit = rep.situation || {};
  const ctr = rep.contrat || {};
  const produit = dossier.produit || 'Plan Epargne Retraite Individuel (PER IN)';
  const nomComplet = `${sit.nom || ''} ${sit.prenom || ''}`.trim() || 'le client';

  const ctx = {
    doc,
    y: 0,
    logo,
    titre: 'Devoir de conseil',
    titreInterieur: 'Devoir de conseil',
    sousTitre: produit,
    advisorName,
    advisorEmail,
    client: sit,
  };

  piedDePage(ctx);
  entetePremierePage(ctx);
  bandeauTitre(ctx, String(REGLEMENTAIRE_INTRO_DEVOIR || '').split('\n'), {
    tailleIntro: 9.5,
    interligneIntro: 4.6,
  });

  // Avertissements d usage, verbatim du modele
  paragraphe(ctx, 'La société ENTASIS attire l’attention de son client sur le fait que la fourniture d’une information complète et sincère est une condition indispensable à la délivrance d’un conseil adapté.');
  ctx.y += 2.5;
  paragraphe(ctx, 'Les données à caractère personnel recueillies sont nécessaires pour conclure le présent contrat et pourront être utilisées par l’assureur et ses partenaires.');
  ctx.y += 2.5;
  paragraphe(ctx, 'A défaut de réponse à une question, une réponse incomplète ou erronée risque de compromettre la fiabilité et/ou la pertinence de cette étude et donc des solutions qui seront amenées à vous être proposées.');
  ctx.y += 2.5;
  paragraphe(ctx, `Au cours de nos entretiens vous, ${nomComplet}, nous avez :`);
  ctx.y += 2.5;
  paragraphe(ctx, `Consulté pour mettre en place un ${produit} et dans ce cadre nous avez communiqué les informations qui nous ont permis d’élaborer notre conseil.`);
  ctx.y += 4;
  paragraphe(ctx, 'Ce contrat de retraite supplémentaire à cotisations définies offre une possibilité de sortie en rente ou en capital lors de la liquidation. Certains cas de sortie anticipée (avant la date de départ en retraite) sont possibles, et notamment l’acquisition de la retraite principale (pour les provisions issues de versements facultatifs).');
  ctx.y += 4;
  paragraphe(ctx, 'Après avoir analysé avec attention votre situation et vos besoins, en qualité de courtier d’assurance catégorie B, nous avons identifié que le contrat ci-dessous correspond le mieux à vos besoins, vos attentes, vos exigences et à vos objectifs :');
  ctx.y += 3;

  tableauProduit(ctx, dossier.compagnie, dossier.nom_produit);

  paragraphe(ctx, 'Au cours de nos entretiens, nous avons en effet pris le soin de vous présenter les caractéristiques de ces garanties.');
  ctx.y += 1;
  ligneSegments(ctx, [
    { texte: 'Vous avez retenu le contrat' },
    { texte: dossier.nom_produit || '', gras: true },
    { texte: 'à effet du' },
    { texte: `${dateFr(dossier.date_effet || ctr.date_effet)}.`, gras: true },
  ]);

  // Page suivante : Notre Conseil, obligations et alertes
  nouvellePage(ctx);
  intertitre(ctx, 'Notre Conseil');
  const texteConseil = (rep.conseil && rep.conseil.texte) || NOTRE_CONSEIL_PER;
  paragraphes(ctx, texteConseil);
  ctx.y += 2;
  paragraphe(ctx, 'Enfin, nous souhaitons vous alerter sur le fait que le bon fonctionnement des principales garanties nécessite de votre part certaines obligations :');
  ctx.y += 2;
  puces(ctx, OBLIGATIONS_PER);
  ctx.y += 2;
  paragraphe(ctx, 'Les cotisations à un contrat PERIN bénéficient d’avantages sur le plan fiscal dans la limite du plafond retenu (154 bis ou 163 quatervicies du code général des impôts).');
  ctx.y += 3;
  paragraphe(ctx, 'Nous vous alertons sur le fait que :', { style: 'bold' });
  ctx.y += 1;
  puces(ctx, AVERTISSEMENTS_PER, { taille: 9.5, interligne: 4.6 });
  if (orientationMismatch(rep)) {
    ctx.y += 2;
    paragraphe(ctx, ALERTE_ORIENTATION, { style: 'bold' });
  }

  // Derniere page : modalites, exemplaires, signatures
  nouvellePage(ctx);
  paragraphe(ctx, 'Les modalités d’application du contrat et des garanties ci-dessus proposées sont détaillées dans les conditions particulières et/ou les dispositions générales et/ou la notice d’information et précisent notamment les conditions, montants et limites de garanties ainsi que les exclusions applicables.');
  ctx.y += 6;
  paragraphe(ctx, 'Le présent document a été établi en 2 exemplaires.');
  ctx.y += 2;
  paragraphe(ctx, `Fait à ${ctr.fait_a || 'Paris'}, le ${dateFr(dossier.created_at) || dateDuJourFr()}`);
  ctx.y += 2;
  paragraphe(ctx, 'Je reconnais avoir pris connaissance du présent document avant la conclusion du contrat.');
  ctx.y += 4;
  blocSignatures(ctx, advisorName);

  numeroterPages(doc);
  doc.save(`Devoir_conseil_${slugNom(sit.nom)}_${dateIsoLocale()}.pdf`);
}
