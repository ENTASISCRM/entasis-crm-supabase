#!/usr/bin/env node
// Verifie les schemas et les figures d un deck (scripts/academy/decks/*.json)
// avant de generer les migrations : c est le controle du guide de style de
// la spec du 22 septembre 2026 (docs/superpowers/specs/2026-09-22-academy-gamification-design.md).
//
// Pourquoi : un svg part en base tel quel et sera assaini cote client
// (src/lib/academy/svg.js) ; ce qui n est pas dans la liste blanche
// disparait au rendu sans prevenir personne. Un texte trop petit ou qui
// deborde du cadre ne se voit qu en le dessinant. On verifie donc a sec
// (structure, motifs interdits, palette, textes) puis on rend chaque svg
// dans un navigateur a 640 et 320 px de large, capture a l appui.
//
// Ce qui est controle, par schema et par figure propre :
//   viewBox="0 0 640 360", xmlns svg, <title> present (et egal au titre du
//   schema), fond blanc plein, elements et attributs de la liste blanche
//   seulement (jamais script, foreignObject, image, style, on*, href
//   externe, url( dans style), palette du cabinet, police system-ui,
//   tailles de 13 a 20, textes sans tiret ni cadratin ni apostrophe droite
//   ni emoji, moins de 12 000 caracteres, xml bien forme, aucun texte hors
//   du cadre, textes qui ne se chevauchent pas (avertissement).
// Par deck : chaque figure { ref } pointe vers une cle de schema, chaque
// marqueur [schema:cle] du memo aussi, chaque exercice a un corrige
// coherent avec son type (memes regles que l editeur et que
// academy_verifier_reponse), et un exercice nouveau (au dela du seed 7
// committe) porte une figure, sinon la migration 9 ne le semerait pas.
// Enfin la place des exercices deja semes : type ET enonce compares au
// seed 7 committe, parce que la migration 9 retrouve un exercice par son
// seul (ordre, type) et poserait la figure sur le voisin si le deck avait
// intercale ou deplace quelque chose (erreur) ; un enonce simplement
// recrit ne remonte qu en avertissement, la migration 9 ne reecrivant
// jamais un exercice deja seme.
//
// Usage : node scripts/academy/verifier-schemas.mjs [slug]   (sans slug : tous)
// Captures : tests/visuel/captures/schemas/<slug>-<cle>-<largeur>.png
// Code de sortie : 0 si tout est OK, 1 sinon (les avertissements ne comptent pas).
//
// Variables d environnement (comme tests/visuel/controle.mjs) :
//   PLAYWRIGHT_CHROMIUM_PATH chemin d un chromium deja installe (sinon celui de playwright)
//   PLAYWRIGHT_MODULE_DIR    dossier contenant node_modules/playwright (vide : celui du depot)
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const racine = join(ici, '..', '..')
const dossierDecks = join(ici, 'decks')
const dossierCaptures = join(racine, 'tests', 'visuel', 'captures', 'schemas')

// ── Le guide de style, en constantes ────────────────────────────────────────
const VIEWBOX = '0 0 640 360'
const LARGEURS = [640, 320]
const LIMITE_SCHEMA = 12000
const TAILLE_MIN = 13
const TAILLE_MAX = 20
const POLICE = 'system-ui'
const ELEMENTS_PERMIS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc',
  'defs', 'marker', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'use'])
const PALETTE = new Map([
  ['#162443', 'navy'], ['#c5a55a', 'gold'], ['#f5edd8', 'gold clair'], ['#8a95a8', 'silver'], ['#2c3548', 'charcoal'],
  ['#ffffff', 'blanc'], ['#fff', 'blanc'], ['white', 'blanc'],
])
const COULEURS_LIBRES = new Set(['none', 'transparent', 'inherit', 'currentcolor'])
const MOTIFS_INTERDITS = [
  { nom: '<script', re: /<script/i },
  { nom: 'gestionnaire on*=', re: /(^|[\s"'/<])on\w+\s*=/i },
  { nom: 'javascript:', re: /javascript:/i },
  { nom: '<foreignObject', re: /<foreignObject/i },
  { nom: '<image', re: /<image/i },
  { nom: 'href externe', re: /href\s*=\s*["']?\s*(https?:|\/\/)/i },
  { nom: 'adresse data: ou vbscript:', re: /=\s*["']?\s*(?:vbscript|data)\s*:/i },
  { nom: 'url() vers l exterieur (seul url(#…) est permis)', re: /url\(\s*["']?\s*(?!#)/i },
  { nom: '<style (retire par l assainisseur client)', re: /<style/i },
  { nom: '@import ou @font-face (police externe)', re: /@import|@font-face/i },
  { nom: '<link', re: /<link/i },
  { nom: '<iframe, <object ou <embed', re: /<(iframe|object|embed)\b/i },
]
// Ce que l assainisseur client (src/lib/academy/svg.js) refuse en plus : une
// declaration ou instruction XML au milieu du texte (hors prologue et commentaires).
const COMMENTAIRE = /<!--[\s\S]*?-->/g
const PROLOGUE = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!DOCTYPE[^[>]*>\s*)?/i
const TYPES_ITEM = ['choix', 'vrai_faux', 'multi', 'ordre', 'association', 'trou_choix', 'trou_saisie', 'carte']
const TYPES_NOUVEAUX = new Set(['choix', 'multi', 'trou_choix'])

// ── Petits outils ────────────────────────────────────────────────────────────
const texte = (v) => (v == null ? '' : String(v))
const entier = (v) => (Number.isInteger(v) ? v : (typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : null))
const decoderEntites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')

/** Les balises ouvrantes du svg : nom (en minuscules) et chaine d attributs. */
function balises(svg) {
  const liste = []
  for (const m of svg.matchAll(/<([a-zA-Z][\w:.-]*)((?:\s+[^<>]*?)?)\/?>/g)) {
    liste.push({ nom: m[1].toLowerCase(), nomExact: m[1], attributs: attributs(m[2] || '') })
  }
  return liste
}
function attributs(chaine) {
  const liste = []
  for (const m of chaine.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) liste.push({ nom: m[1], valeur: m[2] ?? m[3] ?? '' })
  return liste
}
/** Les textes visibles ou lus : contenu des text, tspan, title et desc, balises retirees. */
function textesDuSvg(svg) {
  const liste = []
  for (const m of svg.matchAll(/<(text|tspan|title|desc)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const brut = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (brut) liste.push({ balise: m[1].toLowerCase(), texte: decoderEntites(brut) })
  }
  return liste
}
/** Le premier <title> du svg (texte), ou null. */
function titreDuSvg(svg) {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(svg)
  return m ? decoderEntites(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()) : null
}

/**
 * Ce qui identifie un exercice d une version a l autre : son enonce, sa
 * phrase a trou ou son recto. Le melange d un ordre ou d une association
 * ne le touche pas, il se compare donc au seed deja seme.
 */
const signature = (payload) => texte(payload?.enonce ?? payload?.phrase ?? payload?.recto).replace(/\s+/g, ' ').trim()

/** Les problemes d un texte de l ecran (titre, legende, alt, textes du svg) selon les regles de la maison. */
function problemesTexte(t) {
  const p = []
  if (/[\u2014\u2015]/.test(t)) p.push('tiret cadratin')
  if (/\u2013/.test(t)) p.push('demi cadratin')
  if (/\p{L}-\p{L}|(^|\s)-\s|\s-($|\s)|^-\s/u.test(t)) p.push('tiret (la maison ecrit sans trait d union ni tiret d enumeration)')
  if (/'/.test(t)) p.push('apostrophe droite (utiliser l apostrophe typographique ’)')
  if (/\p{Extended_Pictographic}/u.test(t)) p.push('emoji')
  return p
}

// ── Controle a sec d un svg ──────────────────────────────────────────────────
/**
 * Verifie un svg contre le guide. `attendu` = { titre } pour un schema
 * (le <title> doit le reprendre), {} pour une figure propre.
 * Rend { erreurs: [], avertissements: [] }.
 */
function controlerSvg(svg, attendu = {}) {
  const erreurs = []
  const avertissements = []
  const t = texte(svg)
  if (!t.trim()) return { erreurs: ['svg vide'], avertissements }
  if (t.length > LIMITE_SCHEMA) erreurs.push(`${t.length} caracteres, maximum ${LIMITE_SCHEMA}`)
  for (const m of MOTIFS_INTERDITS) if (m.re.test(t)) erreurs.push(`motif interdit : ${m.nom}`)
  if (/<[!?]/.test(t.replace(COMMENTAIRE, '').replace(PROLOGUE, ''))) erreurs.push('declaration ou instruction XML au milieu du schema (l assainisseur client la refuse)')

  const liste = balises(t)
  const racineSvg = liste.find((b) => b.nom === 'svg')
  if (!racineSvg || !/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg\b/i.test(t)) {
    erreurs.push('le texte doit commencer par la balise <svg')
  } else {
    const attr = (nom) => racineSvg.attributs.find((a) => a.nom === nom)?.valeur
    const vb = (attr('viewBox') || '').trim().replace(/\s+/g, ' ')
    if (vb !== VIEWBOX) erreurs.push(`viewBox « ${vb || 'absent'} » (attendu ${VIEWBOX})`)
    if (attr('xmlns') !== 'http://www.w3.org/2000/svg') erreurs.push('xmlns="http://www.w3.org/2000/svg" manquant sur <svg> (sans lui, DOMParser ne rend rien)')
    if (attr('width') && !/^100%$/.test(attr('width'))) avertissements.push(`width="${attr('width')}" sur <svg> : le client force width="100%", inutile de le poser`)
  }

  // Elements et attributs.
  const inconnus = new Set()
  for (const b of liste) {
    if (b.nom.startsWith('?') || b.nom.startsWith('!')) continue
    if (!ELEMENTS_PERMIS.has(b.nom)) inconnus.add(b.nomExact)
    for (const a of b.attributs) {
      const nomMin = a.nom.toLowerCase()
      if (/^on\w+/.test(nomMin)) erreurs.push(`attribut ${a.nom} sur <${b.nomExact}>`)
      if ((nomMin === 'href' || nomMin === 'xlink:href') && !a.valeur.trim().startsWith('#')) erreurs.push(`${a.nom}="${a.valeur.slice(0, 40)}" sur <${b.nomExact}> : seul un lien interne #… est permis`)
      if (nomMin === 'style' && /url\s*\(/i.test(a.valeur)) erreurs.push(`style avec url( sur <${b.nomExact}>`)
      if (nomMin === 'font-family' && !a.valeur.trim().toLowerCase().startsWith(POLICE)) erreurs.push(`font-family="${a.valeur}" : le guide impose « system-ui, -apple-system, Segoe UI, sans-serif »`)
      if (nomMin === 'style' && /font-family\s*:\s*(?!system-ui)/i.test(a.valeur)) erreurs.push(`font-family hors guide dans style sur <${b.nomExact}>`)
    }
  }
  if (inconnus.size) erreurs.push(`elements hors liste blanche : ${[...inconnus].join(', ')}`)

  // Fond blanc plein : un rect 640 x 360 blanc.
  const fond = liste.find((b) => b.nom === 'rect' && b.attributs.some((a) => a.nom === 'width' && /^(640|100%)$/.test(a.valeur))
    && b.attributs.some((a) => a.nom === 'height' && /^(360|100%)$/.test(a.valeur))
    && b.attributs.some((a) => a.nom === 'fill' && /^(#fff|#ffffff|white)$/i.test(a.valeur.trim())))
  if (!fond) erreurs.push('pas de fond blanc plein (<rect x="0" y="0" width="640" height="360" fill="#FFFFFF"/> en premier)')

  // Palette.
  const horsPalette = new Set()
  for (const m of t.matchAll(/(?:fill|stroke|stop-color|color)\s*[:=]\s*["']?\s*([^"';\s>]+)/gi)) {
    const v = m[1].trim().toLowerCase()
    if (PALETTE.has(v) || COULEURS_LIBRES.has(v) || v.startsWith('url(')) continue
    horsPalette.add(m[1].trim())
  }
  if (horsPalette.size) erreurs.push(`couleurs hors palette : ${[...horsPalette].join(', ')} (navy #162443, gold #C5A55A, gold clair #F5EDD8, silver #8A95A8, charcoal #2C3548, blanc)`)

  // Tailles de texte.
  const tailles = [...t.matchAll(/font-size\s*[:=]\s*["']?\s*([\d.]+)/gi)].map((m) => Number(m[1]))
  const petites = tailles.filter((v) => v < TAILLE_MIN)
  const grandes = tailles.filter((v) => v > TAILLE_MAX)
  if (petites.length) erreurs.push(`font-size sous ${TAILLE_MIN} : ${[...new Set(petites)].join(', ')} (illisible a 320 px)`)
  if (grandes.length) erreurs.push(`font-size au dessus de ${TAILLE_MAX} : ${[...new Set(grandes)].join(', ')}`)
  const aDuTexte = liste.some((b) => b.nom === 'text')
  if (aDuTexte && !/font-family/i.test(t)) erreurs.push('aucune font-family : poser font-family="system-ui, -apple-system, Segoe UI, sans-serif" sur <svg> ou sur chaque <text>')
  if (aDuTexte && !tailles.length) erreurs.push('aucune font-size : chaque texte se lit entre 13 et 20')

  // Titre et textes.
  const titre = titreDuSvg(t)
  if (titre == null) erreurs.push('<title> absent (il reprend le titre du schema, lu par les lecteurs d ecran)')
  else if (attendu.titre && titre !== attendu.titre.trim()) erreurs.push(`<title> « ${titre} » differe du titre « ${attendu.titre.trim()} »`)
  const textesVus = new Set()
  for (const { balise, texte: tx } of textesDuSvg(t)) {
    for (const p of problemesTexte(tx)) {
      const cle = `${p}|${tx}`
      if (textesVus.has(cle)) continue
      textesVus.add(cle)
      erreurs.push(`${p} dans <${balise}> « ${tx.slice(0, 60)} »`)
    }
  }
  return { erreurs, avertissements }
}

// ── Coherence des exercices ──────────────────────────────────────────────────
// L editeur d administration (src/lib/academy/editeur-items.js) a le dernier
// mot sur ce qui fait un exercice valable : on le rejoue quand node sait le
// charger. Mais le code de l application s importe sans extension (« ./svg »),
// ce que vite resout et que node ne resout pas : des qu un de ces fichiers
// gagne un import relatif, le chargement casse. Le verificateur ne tombe donc
// pas avec lui, il le dit et s en tient a ses propres regles (les memes,
// recopiees ci dessous et alignees sur academy_verifier_reponse).
let editeur = null
let panneEditeur = null
async function chargerEditeur() {
  try {
    const m = await import(new URL('../../src/lib/academy/editeur-items.js', import.meta.url))
    if (typeof m.etatItem === 'function' && typeof m.validerItem === 'function') editeur = m
    else panneEditeur = 'etatItem ou validerItem absent du module'
  } catch (e) {
    panneEditeur = e?.message || String(e)
  }
}

/** Les problemes d un item (payload et corrige), memes regles que l editeur et que academy_verifier_reponse. */
function problemesItem(it) {
  const p = []
  const type = it?.type
  if (!TYPES_ITEM.includes(type)) return [`type inconnu « ${type} »`]
  const payload = it.payload && typeof it.payload === 'object' ? it.payload : {}
  const corrige = it.corrige && typeof it.corrige === 'object' ? it.corrige : {}
  const liste = (v) => (Array.isArray(v) ? v : null)
  const distincts = (l) => new Set(l.map((x) => texte(x).trim())).size === l.length

  if (type === 'choix' || type === 'trou_choix') {
    const choix = liste(payload.choix)
    if (!choix || choix.length !== 4) p.push(`${choix ? choix.length : 'aucun'} choix (il en faut exactement 4)`)
    else if (!distincts(choix)) p.push('deux choix identiques')
    const idx = entier(corrige.index)
    if (idx == null || idx < 0 || idx >= (choix ? choix.length : 4)) p.push(`corrige.index « ${corrige.index} » hors des choix`)
    if (type === 'trou_choix' && !texte(payload.phrase).includes('___')) p.push('payload.phrase sans « ___ »')
    if (type === 'choix' && !texte(payload.enonce).trim()) p.push('enonce vide')
  } else if (type === 'vrai_faux') {
    if (typeof corrige.vrai !== 'boolean') p.push('corrige.vrai doit etre true ou false')
    if (!texte(payload.enonce).trim()) p.push('enonce vide')
  } else if (type === 'multi') {
    const choix = liste(payload.choix)
    if (!choix || choix.length < 4 || choix.length > 6) p.push(`${choix ? choix.length : 'aucun'} choix (de 4 a 6)`)
    else if (!distincts(choix)) p.push('deux choix identiques')
    const indices = liste(corrige.indices)
    if (!indices || !indices.length) p.push('corrige.indices vide')
    else {
      const nb = choix ? choix.length : 0
      if (indices.some((i) => entier(i) == null || i < 0 || i >= nb)) p.push(`corrige.indices hors des choix : ${JSON.stringify(indices)}`)
      if (new Set(indices).size !== indices.length) p.push('corrige.indices en double')
      if (nb && indices.length >= nb) p.push('toutes les reponses sont bonnes')
    }
    if (!texte(payload.enonce).trim()) p.push('enonce vide')
  } else if (type === 'ordre') {
    const elements = liste(payload.elements)
    const ordre = liste(corrige.ordre)
    if (!elements || elements.length < 2) p.push('moins de deux elements')
    else if (!distincts(elements)) p.push('deux elements identiques')
    if (!ordre) p.push('corrige.ordre absent')
    else if (elements && (ordre.length !== elements.length || new Set(ordre).size !== ordre.length || ordre.some((i) => entier(i) == null || i < 0 || i >= elements.length))) {
      p.push(`corrige.ordre n est pas une permutation de 0 a ${elements.length - 1} : ${JSON.stringify(ordre)}`)
    }
  } else if (type === 'association') {
    const gauche = liste(payload.gauche)
    const droite = liste(payload.droite)
    const paires = liste(corrige.paires)
    if (!gauche || !droite || gauche.length < 2 || gauche.length !== droite.length) p.push('gauche et droite doivent avoir la meme longueur, au moins 2')
    else if (!distincts(gauche) || !distincts(droite)) p.push('deux lignes identiques dans une colonne')
    if (!paires) p.push('corrige.paires absent')
    else if (gauche && droite) {
      const nb = gauche.length
      const ok = paires.length === nb && paires.every((pr) => Array.isArray(pr) && pr.length === 2 && entier(pr[0]) != null && entier(pr[1]) != null && pr[0] >= 0 && pr[0] < nb && pr[1] >= 0 && pr[1] < droite.length)
        && new Set(paires.map((pr) => pr[0])).size === nb && new Set(paires.map((pr) => pr[1])).size === nb
      if (!ok) p.push(`corrige.paires doit apparier chaque gauche a une droite distincte : ${JSON.stringify(paires)}`)
    }
  } else if (type === 'trou_saisie') {
    const reponses = liste(corrige.reponses)
    if (!reponses || !reponses.length || reponses.some((r) => !texte(r).trim())) p.push('corrige.reponses vide ou avec une reponse vide')
    if (!texte(payload.phrase).includes('___')) p.push('payload.phrase sans « ___ »')
  } else if (type === 'carte') {
    if (!texte(payload.recto).trim() || !texte(payload.verso).trim()) p.push('recto ou verso vide')
    if (Object.keys(corrige).length) p.push('une carte n a pas de corrige')
  }
  if (type !== 'carte' && !texte(it.explication).trim()) p.push('explication vide')
  if (!texte(it.competence).trim()) p.push('competence vide')
  // L editeur a le dernier mot quand il a pu etre charge.
  if (editeur) {
    const v = editeur.validerItem(editeur.etatItem(it))
    if (v.erreur) p.push(`editeur : ${v.erreur}`)
  }
  return [...new Set(p)]
}

/**
 * Le seed 7 tel qu il est committe (HEAD), exercice par exercice dans l
 * ordre : { types, signatures }. Tout item du deck au dela est
 * « nouveau ». Null quand le seed n est pas encore dans git ou qu il ne
 * se relit pas (format change) : on ne devine alors rien plutot que de
 * declarer tout le deck nouveau.
 */
function semeAuHead(slug) {
  const slugSql = slug.replace(/-/g, '_')
  try {
    const noms = execFileSync('git', ['ls-tree', '--name-only', 'HEAD', 'supabase/migrations/'], { cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').filter((f) => /academy_7_decks_\d+_/.test(f) && f.endsWith(`_${slugSql}.sql`))
    if (!noms.length) return null
    const sql = execFileSync('git', ['show', `HEAD:${noms[0]}`], { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    const types = []
    const signatures = []
    for (const m of sql.matchAll(/values \(v_ver, (\d+), \$academy_deck\$(\w+)\$academy_deck\$, \$academy_deck\$[\s\S]*?\$academy_deck\$, \d, \$academy_deck\$([\s\S]*?)\$academy_deck\$::jsonb\)/g)) {
      const rang = Number(m[1]) - 1
      types[rang] = m[2]
      let payload = null
      try { payload = JSON.parse(m[3]) } catch { payload = null }
      signatures[rang] = signature(payload)
    }
    return types.length ? { types, signatures } : null
  } catch {
    return null
  }
}

// ── Rendu dans le navigateur ─────────────────────────────────────────────────
function chargerPlaywright() {
  const dossier = process.env.PLAYWRIGHT_MODULE_DIR
  const require = createRequire(dossier ? join(dossier, 'package.json') : join(racine, 'package.json'))
  return require('playwright')
}

/**
 * Rend un svg a chaque largeur, depose les captures et rend les problemes
 * vus par le navigateur : xml mal forme, texte hors cadre, textes qui se
 * chevauchent (avertissement).
 */
async function rendre(page, svg, prefixe) {
  const erreurs = []
  const avertissements = []
  const captures = []
  for (const largeur of LARGEURS) {
    await page.setViewportSize({ width: largeur + 32, height: 900 })
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      body { margin: 16px; background: #e6e8ee; }
      #cadre { width: ${largeur}px; }
      #cadre svg { display: block; width: 100%; height: auto; }
    </style></head><body><div id="cadre"></div></body></html>`)
    const resultat = await page.evaluate((texteSvg) => {
      const doc = new DOMParser().parseFromString(texteSvg, 'image/svg+xml')
      const faute = doc.querySelector('parsererror')
      if (faute) return { xml: (faute.textContent || 'xml mal forme').replace(/\s+/g, ' ').trim().slice(0, 160) }
      const cadre = document.getElementById('cadre')
      cadre.appendChild(document.importNode(doc.documentElement, true))
      const svgEl = cadre.querySelector('svg')
      const r = cadre.getBoundingClientRect()
      const hors = []
      const boites = []
      for (const el of svgEl.querySelectorAll('text')) {
        let b
        try { b = el.getBBox() } catch { continue }
        if (b.width === 0 && b.height === 0) continue
        const libelle = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
        if (b.x < -0.5 || b.y < -0.5 || b.x + b.width > 640.5 || b.y + b.height > 360.5) hors.push(`« ${libelle} » (${Math.round(b.x)}, ${Math.round(b.y)}, ${Math.round(b.width)} x ${Math.round(b.height)})`)
        boites.push({ libelle, x: b.x, y: b.y, w: b.width, h: b.height })
      }
      const chevauchements = []
      for (let i = 0; i < boites.length; i++) {
        for (let k = i + 1; k < boites.length; k++) {
          const a = boites[i]; const c = boites[k]
          const dx = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)
          const dy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y)
          if (dx > 2 && dy > 2) chevauchements.push(`« ${a.libelle} » et « ${c.libelle} »`)
        }
      }
      return { hauteur: Math.round(r.height), hors, chevauchements }
    }, svg)
    if (resultat.xml) { erreurs.push(`xml mal forme : ${resultat.xml}`); break }
    if (largeur === LARGEURS[0]) {
      for (const h of resultat.hors) erreurs.push(`texte hors du cadre 640 x 360 : ${h}`)
      for (const c of resultat.chevauchements.slice(0, 5)) avertissements.push(`textes qui se chevauchent : ${c}`)
    }
    const chemin = join(dossierCaptures, `${prefixe}-${largeur}.png`)
    await page.locator('#cadre').screenshot({ path: chemin })
    captures.push(chemin)
  }
  return { erreurs, avertissements, captures }
}

// ── Un deck ──────────────────────────────────────────────────────────────────
function lireDeck(chemin) {
  return JSON.parse(readFileSync(chemin, 'utf8'))
}

async function verifierDeck(deck, page) {
  const lignes = []
  let nbErreurs = 0
  const ligne = (etat, sujet, details = []) => {
    lignes.push(`  ${etat.padEnd(4)} ${sujet}`)
    for (const d of details) lignes.push(`         ${d}`)
  }
  const signaler = (sujet, erreurs, avertissements = [], captures = []) => {
    nbErreurs += erreurs.length
    const details = [...erreurs.map((e) => `erreur : ${e}`), ...avertissements.map((a) => `attention : ${a}`), ...captures.map((c) => `capture : ${c.replace(racine + '/', '')}`)]
    ligne(erreurs.length ? 'ERR' : 'OK', sujet, details)
  }

  const schemas = Array.isArray(deck.schemas) ? deck.schemas : []
  // Un « schemas » qui n est pas un tableau reste une erreur meme quand le
  // deck n a par ailleurs ni schema ni figure : il ne doit pas passer par
  // la sortie courte « rien a verifier ».
  const schemasMalFormes = deck.schemas != null && !Array.isArray(deck.schemas)
  const items = Array.isArray(deck.items) ? deck.items : []
  const figures = items.filter((it) => it.figure != null)
  const seme = semeAuHead(deck.slug)
  const nbSemes = seme ? seme.types.length : items.length
  const nouveaux = items.map((it, i) => ({ it, ordre: i + 1 })).filter(({ ordre }) => ordre > nbSemes)

  const entete = `${deck.slug} : ${schemas.length} schema(s), ${figures.length} figure(s), ${nouveaux.length} exercice(s) nouveau(x)${seme ? '' : ' (seed 7 absent de git : aucun exercice considere nouveau)'}`
  if (!schemasMalFormes && !schemas.length && !figures.length) {
    return { lignes: [`${entete} : sans schema, rien a verifier`], nbErreurs: 0 }
  }
  lignes.push(entete)
  if (schemasMalFormes) signaler('schemas', ['« schemas » doit etre un tableau [ { cle, titre, svg, legende } ]'])

  // Schemas.
  const cles = new Set()
  for (const s of schemas) {
    const cle = texte(s?.cle).trim()
    const erreurs = []
    if (!/^[a-z0-9_]+$/.test(cle)) erreurs.push(`cle « ${s?.cle} » invalide (minuscules, chiffres, soulignes)`)
    if (cles.has(cle)) erreurs.push('cle en double')
    cles.add(cle)
    if (!texte(s?.titre).trim()) erreurs.push('titre vide')
    if (!texte(s?.legende).trim()) erreurs.push('legende vide')
    for (const champ of ['titre', 'legende']) for (const p of problemesTexte(texte(s?.[champ]))) erreurs.push(`${p} dans ${champ}`)
    const sec = controlerSvg(s?.svg, { titre: texte(s?.titre) })
    erreurs.push(...sec.erreurs)
    const avertissements = [...sec.avertissements]
    if (texte(s?.legende).split(/[.!?]\s/).length > 2) avertissements.push('legende de plus de deux phrases (la spec en veut une ou deux)')
    let captures = []
    if (!erreurs.length && page) {
      const r = await rendre(page, s.svg, `${deck.slug}-${cle}`)
      erreurs.push(...r.erreurs); avertissements.push(...r.avertissements); captures = r.captures
    } else if (!page) {
      erreurs.push('rendu impossible (navigateur indisponible)')
    }
    signaler(`schema ${cle || '?'}`, erreurs, avertissements, captures)
  }

  // Marqueurs du memo.
  for (const m of texte(deck.memo_md).matchAll(/\[schema:([^\]]*)\]/g)) {
    const ref = m[1].trim()
    if (!cles.has(ref)) signaler(`memo [schema:${ref}]`, [`aucun schema « ${ref} » dans le deck`])
  }

  // Figures.
  for (const it of figures) {
    const f = it.figure
    const erreurs = []
    const avertissements = []
    let captures = []
    if (!f || typeof f !== 'object') erreurs.push('figure mal formee (attendu { ref } ou { svg, alt })')
    else if (f.ref != null) {
      if (f.svg != null || f.alt != null) erreurs.push('ref OU svg, pas les deux')
      if (!cles.has(texte(f.ref).trim())) erreurs.push(`aucun schema « ${f.ref} » dans le deck`)
    } else {
      if (!texte(f.alt).trim()) erreurs.push('alt vide (texte lu a la place de la figure)')
      for (const p of problemesTexte(texte(f.alt))) erreurs.push(`${p} dans alt`)
      if (cles.has(texte(it.cle))) erreurs.push(`la cle d item « ${it.cle} » est aussi une cle de schema : les captures se recouvriraient`)
      const sec = controlerSvg(f.svg, {})
      erreurs.push(...sec.erreurs); avertissements.push(...sec.avertissements)
      if (!erreurs.length && page) {
        const r = await rendre(page, f.svg, `${deck.slug}-${it.cle}`)
        erreurs.push(...r.erreurs); avertissements.push(...r.avertissements); captures = r.captures
      } else if (!page) erreurs.push('rendu impossible (navigateur indisponible)')
    }
    signaler(`figure de ${it.cle} (${it.type})`, erreurs, avertissements, captures)
  }

  // Exercices : derive par rapport au seed committe, puis coherence. La
  // migration 9 retrouve un exercice par son seul (ordre, type) ; deux
  // exercices du meme type se ressemblent donc pour elle, et un exercice
  // intercale ferait poser la figure sur le voisin. On compare aussi les
  // enonces, place par place.
  if (seme) {
    const derives = []
    const modifies = []
    const placeDansLeSeed = new Map()
    seme.signatures.forEach((s, i) => { if (s && !placeDansLeSeed.has(s)) placeDansLeSeed.set(s, i + 1) })
    items.slice(0, nbSemes).forEach((it, i) => {
      if (seme.types[i] && it.type !== seme.types[i]) {
        derives.push(`exercice ${i + 1} (${it.cle}) est de type ${it.type}, le seed committe porte ${seme.types[i]} : un exercice a ete intercale, deplace ou change de type, la migration 9 poserait la figure sur le mauvais exercice`)
        return
      }
      const attendue = seme.signatures[i]
      const vue = signature(it.payload)
      if (!attendue || attendue === vue) return
      const place = placeDansLeSeed.get(vue)
      if (place) derives.push(`exercice ${i + 1} (${it.cle}) porte l enonce de l exercice ${place} du seed committe : un exercice a ete intercale ou deplace, la migration 9 poserait la figure sur le mauvais exercice`)
      else modifies.push(`exercice ${i + 1} (${it.cle}) : l enonce a change depuis le seed committe (« ${attendue.slice(0, 50)} » puis « ${vue.slice(0, 50)} ») ; la migration 9 ne reecrit pas un exercice existant, la base gardera l ancien texte`)
    })
    if (items.length < nbSemes) derives.push(`le deck a ${items.length} exercices, le seed committe en a ${nbSemes} : un exercice a ete retire`)
    if (derives.length || modifies.length) signaler('ordre des exercices', derives, modifies)
  }
  for (const it of items) {
    const p = problemesItem(it)
    if (p.length) signaler(`exercice ${it.cle} (${it.type})`, p)
  }
  for (const { it, ordre } of nouveaux) {
    const erreurs = []
    const avertissements = []
    if (it.figure == null) erreurs.push('exercice nouveau sans figure : la migration 9 ne seme que les exercices qui portent une figure')
    if (!TYPES_NOUVEAUX.has(it.type)) avertissements.push(`type ${it.type} : la spec attend choix, multi ou trou_choix pour un exercice nouveau`)
    if (erreurs.length || avertissements.length) signaler(`exercice nouveau ${it.cle} (ordre ${ordre})`, erreurs, avertissements)
  }
  if (nouveaux.length && !nouveaux.some(({ it }) => it.figure == null)) ligne('OK', `${nouveaux.length} exercice(s) nouveau(x) avec figure et corrige coherent`)

  return { lignes, nbErreurs }
}

// ── Point d entree ───────────────────────────────────────────────────────────
async function principal() {
  await chargerEditeur()
  const slug = process.argv[2]
  const fichiers = readdirSync(dossierDecks).filter((f) => f.endsWith('.json')).sort()
  const choisis = slug ? fichiers.filter((f) => basename(f, '.json') === slug) : fichiers
  if (!choisis.length) {
    console.error(`Aucun deck « ${slug} » dans ${dossierDecks}`)
    process.exit(1)
  }
  const decks = choisis.map((f) => lireDeck(join(dossierDecks, f)))
  const aRendre = decks.some((d) => (Array.isArray(d.schemas) && d.schemas.length) || (Array.isArray(d.items) && d.items.some((it) => it.figure != null)))

  let browser = null
  let page = null
  let panne = null
  if (aRendre) {
    try {
      const { chromium } = chargerPlaywright()
      browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined })
      page = await browser.newPage({ viewport: { width: 672, height: 900 } })
      mkdirSync(dossierCaptures, { recursive: true })
    } catch (e) {
      panne = e?.message || String(e)
    }
  }
  let total = 0
  const sortie = (l) => process.stdout.write(l + '\n')
  if (panneEditeur) sortie(`Attention : l editeur d administration n a pas pu etre charge (${panneEditeur}), les regles du verificateur seules s appliquent. Cause courante : un import relatif sans « .js » dans src/lib/academy.\n`)
  try {
    for (const d of decks) {
      const r = await verifierDeck(d, page)
      total += r.nbErreurs
      sortie(r.lignes.join('\n'))
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
  if (panne) sortie(`\nNavigateur indisponible (${panne}) : les rendus n ont pas ete faits, PLAYWRIGHT_CHROMIUM_PATH ou PLAYWRIGHT_MODULE_DIR a poser.`)
  sortie('')
  sortie(total ? `${total} erreur(s).` : 'Aucune erreur.')
  if (aRendre && existsSync(dossierCaptures)) sortie(`Captures : ${dossierCaptures}`)
  process.exit(total ? 1 : 0)
}

principal().catch((e) => {
  console.error(`Verification impossible : ${e?.message || e}`)
  process.exit(1)
})
