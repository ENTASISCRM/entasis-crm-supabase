// ═══════════════════════════════════════════════════════════════════════════
// FORMAT CSV : l échappement et l assemblage, une seule fois
//
// Deux endroits produisaient le meme CSV avec chacun leur copie de la
// protection contre l injection de formule : src/lib/export-csv.js (le
// telechargement depuis un ecran) et src/lib/campagnes.js (une variante qui
// n avait plus d appelant). Une correction de la protection dans l un ne se
// serait pas propagee a l autre. Les regles vivent donc ici, dans un module
// pur, sans aucune dependance : il se teste sans navigateur et sans base.
//
// Choix volontaires pour Excel francais :
//   separateur point virgule, BOM UTF-8 en tete, fins de ligne CRLF, et
//   toute valeur commencant par = + - @ prefixee d une apostrophe.
// ═══════════════════════════════════════════════════════════════════════════

/** Une cellule echappee : protection formule, guillemets doubles, encadrement. */
export function cellule(valeur) {
  if (valeur == null) return ''
  let s = String(valeur)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

/** Le fichier entier, BOM compris, pret pour un Blob text/csv. */
export function contenuCsv(colonnes, lignes) {
  const toutes = [colonnes || [], ...(Array.isArray(lignes) ? lignes : [])]
  return '﻿' + toutes.map((l) => (l || []).map(cellule).join(';')).join('\r\n')
}
