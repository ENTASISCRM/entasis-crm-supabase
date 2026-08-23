/* ─────────────────────────────────────────────────────────────────────────────
   EXPORT CSV — (Série D / D7).

   Exporte exactement ce que l'écran affiche (filtres et tri compris) vers un
   fichier ouvrable dans Excel : compta, analyses, publipostage.

   Choix volontaires pour Excel FR :
   - séparateur point-virgule (Excel français découpe sur `;`)
   - BOM UTF-8 en tête, sinon les accents ressortent en « MÃ©nard »
   - nombres au format français (virgule décimale) laissés aux appelants
   - toute valeur commençant par = + - @ est préfixée d'une apostrophe :
     protection contre l'injection de formule dans le tableur.
──────────────────────────────────────────────────────────────────────────── */

function cellule(valeur) {
  if (valeur == null) return ''
  let s = String(valeur)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  // Guillemets doublés + encadrement si séparateur, guillemet ou saut de ligne.
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * @param {string} nomFichier  sans extension, ex. 'clients-2026-08'
 * @param {string[]} colonnes  en-têtes affichés
 * @param {Array<Array>} lignes valeurs, même ordre que `colonnes`
 */
export function exporterCsv(nomFichier, colonnes, lignes) {
  const contenu = [colonnes, ...lignes]
    .map(l => l.map(cellule).join(';'))
    .join('\r\n')
  const blob = new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomFichier}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Libération différée : Safari lit encore l'URL au moment du clic.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Date du jour en suffixe de nom de fichier (2026-08-22).
export const suffixeDate = () => new Date().toISOString().slice(0, 10)

// Nombre au format français sans séparateur de milliers (Excel FR le relit
// comme un nombre, contrairement à « 12 345,00 » avec espace insécable).
// Arrondi à 2 décimales : les montants sont issus de calculs flottants
// (pp_m × 12) et sortaient sinon en « 1234,5600000000001 ».
export const nombreFr = (v) => {
  if (v == null || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  // Pas de décimale inutile : 1234 reste « 1234 », 1234.5 devient « 1234,5 ».
  return String(Math.round(n * 100) / 100).replace('.', ',')
}
