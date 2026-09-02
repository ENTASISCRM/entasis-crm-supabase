// ═══════════════════════════════════════════════════════════════════════════
// NOMS PROPRES : casse, separation prenom / nom, telephones
//
// Constats en base au 1er septembre 2026 : 331 fiches clients sur 381 ont
// tout dans le champ nom et rien dans prenom (« Aurélie Exemple » dans nom),
// les profils conseillers arrivent de Google avec une casse sale
// (« charlotte Billard »), une fiche contrat est libellee « MOREL Hyppolite »
// (nom d abord) et une autre « Eliott  Bec » avec deux espaces.
//
// Ce module ne fait que PROPOSER : aucune fonction n ecrit en base. Une
// separation est toujours montree a une personne, qui la valide ou la
// corrige. C est pour cela que separerNomComplet rend une confiance et une
// raison lisibles, et pas seulement deux chaines.
//
// Fonctions pures, sans dependance, testees dans noms.test.js.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Particules qui restent en minuscule et qui annoncent le nom de famille :
 * tout ce qui suit la premiere particule appartient au nom.
 * « d » couvre le d apostrophe (« d'Artagnan »).
 */
export const PARTICULES = Object.freeze([
  'de', 'du', 'des', 'le', 'la', 'les', 'van', 'von', 'der', 'den', 'd',
])

const APOSTROPHES = /['’]/

// Une civilite, une conjonction ou une parenthese dans le libelle signale un
// couple (« M et Mme DUPONT ») ou une annotation (« Jean DUPONT (père) ») :
// aucune heuristique ne sait ou est le prenom, la proposition ne doit jamais
// etre precochee. Sur les 27 fiches « sures » du 2 septembre, 4 auraient recu
// « Mme » ou « M et Mme » comme prenom.
const CIVILITES = new Set(['m', 'm.', 'mr', 'mr.', 'mme', 'mme.', 'mlle', 'mlle.', 'monsieur', 'madame', 'mademoiselle', 'dr', 'dr.', 'me', 'pr', 'pr.'])
const CONJONCTIONS = new Set(['et', '&', '/', 'ou'])
export function contientCiviliteOuCouple(liste) {
  return liste.some((m) => {
    const bas = m.toLowerCase()
    return CIVILITES.has(bas) || CONJONCTIONS.has(bas) || /[()]/.test(m)
  })
}

// Decoupe en mots sur les blancs, en absorbant les espaces multiples et les
// espaces insecables (« Eliott  Bec » donne bien deux mots).
function mots(texte) {
  return String(texte ?? '').trim().split(/\s+/).filter(Boolean)
}

function nbLettres(mot) {
  return (mot.match(/\p{L}/gu) || []).length
}

// Un mot ecrit tout en majuscules avec au moins deux lettres est une
// convention voulue (« MOREL ») : on ne la casse pas, et elle designe
// presque toujours le nom de famille.
export function estToutMajuscule(mot) {
  const m = String(mot ?? '')
  return nbLettres(m) >= 2 && m === m.toUpperCase() && m !== m.toLowerCase()
}

// Particule au sens large : « de », « La », « d'Artagnan » (prefixe d
// apostrophe). Insensible a la casse, car on cherche a la reconnaitre avant
// de decider de la casse a lui donner.
export function estParticule(mot) {
  const m = String(mot ?? '')
  if (!m) return false
  const bas = m.toLowerCase()
  if (PARTICULES.includes(bas)) return true
  const [tete, ...reste] = bas.split(APOSTROPHES)
  return reste.length > 0 && tete === 'd'
}

// Premiere lettre en majuscule, le reste en minuscule. Les accents sont
// conserves tels quels : toUpperCase gere « é » vers « É » sans les retirer.
function capitaliser(segment) {
  if (!segment) return segment
  const premiere = segment[0].toUpperCase()
  return premiere + segment.slice(1).toLowerCase()
}

// Casse d un seul mot. On ne touche qu a un mot ecrit TOUT en minuscules :
// il prend sa majuscule (« charlotte » devient « Charlotte »), tiret et
// apostrophe compris (« jean-michel » devient « Jean-Michel », « o'brien »
// devient « O'Brien », « d'artagnan » devient « d'Artagnan »). Un mot qui
// porte deja une majuscule est rendu tel quel : « McCarthy », « LeBlanc »,
// « O'Neil », « Le Goff » et « MOREL » sont des choix, pas des fautes.
// Meme regle que la fonction SQL normaliser_nom_complet (profils).
function casseMot(mot, premier) {
  if (mot !== mot.toLowerCase()) return mot
  // Une particule saisie en minuscule reste en minuscule, sauf en tete de
  // libelle ou elle est le debut du nom (« Le Goff Paul » saisi « le goff »).
  if (!premier && PARTICULES.includes(mot)) return mot
  return mot
    .split('-')
    .map((partie) => {
      const morceaux = partie.split(/(['’])/)
      // morceaux alterne texte, apostrophe, texte, apostrophe...
      return morceaux
        .map((m, i) => {
          if (i % 2 === 1) return m
          const suivi = i + 2 < morceaux.length
          if (i === 0 && suivi && m === 'd' && !premier) return 'd'
          return capitaliser(m)
        })
        .join('')
    })
    .join('-')
}

/**
 * Espaces multiples reduits et casse propre pour chaque mot ecrit tout en
 * minuscules. Ne touche ni aux accents, ni aux mots deja tout en majuscules,
 * ni a un mot qui porte deja une majuscule quelque part.
 * « charlotte  billard » devient « Charlotte Billard »
 * « MOREL hyppolite » devient « MOREL Hyppolite »
 * « paulin de la fontaine » devient « Paulin de la Fontaine »
 * « Paul Le Goff », « Sophie McCarthy », « Sean O'Neil » restent tels quels
 */
export function normaliserNomComplet(texte) {
  return mots(texte).map((mot, i) => casseMot(mot, i === 0)).join(' ')
}

/**
 * Propose une separation prenom / nom d un libelle complet, avec une
 * confiance et une raison. Ne modifie pas la casse des mots : ce qui est
 * rendu est ce qui a ete saisi, seulement decoupe.
 *
 * Heuristiques, dans cet ordre :
 *  1. vide ou un seul mot : pas de prenom, faible ;
 *  2. un mot tout en majuscules d au moins deux lettres est le nom, le
 *     reste le prenom, quel que soit l ordre (« MOREL Hyppolite ») : haute ;
 *  3. une particule est detectee : tout ce qui la suit est le nom
 *     (« Paulin de La Fontaine ») : haute ;
 *  4. deux mots : premier = prenom, second = nom : moyenne ;
 *  5. trois mots ou plus sans indice : premier = prenom, reste = nom : faible.
 *
 * Un prenom compose avec tiret (« Jean-Michel ») compte pour un seul mot.
 *
 * @returns {{ prenom: string, nom: string, confiance: 'haute'|'moyenne'|'faible', raison: string }}
 */
export function separerNomComplet(texte) {
  const liste = mots(texte)

  if (liste.length === 0) {
    return { prenom: '', nom: '', confiance: 'faible', raison: 'Libellé vide' }
  }
  if (liste.length === 1) {
    return { prenom: '', nom: liste[0], confiance: 'faible', raison: 'Un seul mot, pas de prénom à extraire' }
  }
  if (contientCiviliteOuCouple(liste)) {
    const majuscules = liste.filter(estToutMajuscule)
    return {
      prenom: '',
      nom: (majuscules.length ? majuscules : liste).join(' '),
      confiance: 'faible',
      raison: 'Civilité, couple ou annotation détecté, à séparer à la main',
    }
  }

  // 2. Les mots tout en majuscules forment le nom, sauf si tout est en
  //    majuscules (aucun indice, on retombe sur l ordre des mots).
  const majuscules = liste.filter(estToutMajuscule)
  if (majuscules.length > 0 && majuscules.length < liste.length) {
    return {
      prenom: liste.filter((m) => !estToutMajuscule(m)).join(' '),
      nom: majuscules.join(' '),
      confiance: 'haute',
      raison: 'Nom écrit en majuscules',
    }
  }

  // 3. Une particule annonce le nom : tout ce qui suit lui appartient.
  const indexParticule = liste.findIndex(estParticule)
  if (indexParticule > 0) {
    return {
      prenom: liste.slice(0, indexParticule).join(' '),
      nom: liste.slice(indexParticule).join(' '),
      confiance: 'haute',
      raison: `Particule « ${liste[indexParticule]} » détectée`,
    }
  }
  if (indexParticule === 0) {
    // Le libelle commence par la particule : le nom est la chaine de
    // particules plus le mot qui suit, et ce qui reste, s il y a quelque
    // chose, est le prenom (« de La Fontaine Paulin »).
    let fin = 0
    while (fin < liste.length && estParticule(liste[fin])) fin++
    fin = Math.min(fin + 1, liste.length)
    const reste = liste.slice(fin)
    return {
      prenom: reste.join(' '),
      nom: liste.slice(0, fin).join(' '),
      confiance: reste.length > 0 ? 'moyenne' : 'faible',
      raison: 'Commence par une particule',
    }
  }

  // 4. Deux mots : l usage courant, prenom puis nom.
  if (liste.length === 2) {
    return { prenom: liste[0], nom: liste[1], confiance: 'moyenne', raison: 'Deux mots, prénom puis nom' }
  }

  // 5. Trois mots ou plus, sans indice.
  return {
    prenom: liste[0],
    nom: liste.slice(1).join(' '),
    confiance: 'faible',
    raison: `${liste.length} mots sans indice, à vérifier`,
  }
}

// Espaces multiples reduits, sans autre transformation.
function nettoyerEspaces(texte) {
  return String(texte ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * Rend un numero francais au format « 06 12 34 56 78 », quelle que soit la
 * saisie : 0612345678, +33 6 12 34 56 78, 33612345678, 06.12.34.56.78,
 * +33 (0)6 12 34 56 78. Un numero non reconnu (etranger, incomplet) est
 * rendu tel quel, espaces doubles retires : on ne bloque jamais la saisie.
 */
export function normaliserTelephone(texte) {
  const brut = nettoyerEspaces(texte)
  if (!brut) return ''
  let t = brut.replace(/[\s.()-]/g, '')
  if (t.startsWith('+33')) t = t.slice(3)
  else if (t.startsWith('0033')) t = t.slice(4)
  else if (/^33\d{9,10}$/.test(t)) t = t.slice(2)
  else if (/^0\d{9}$/.test(t)) t = t.slice(1)
  else return brut
  // Apres retrait du prefixe pays, il peut rester le 0 national entre
  // parentheses de la forme +33 (0)6.
  if (/^0\d{9}$/.test(t)) t = t.slice(1)
  if (!/^[1-9]\d{8}$/.test(t)) return brut
  return ('0' + t).replace(/(\d{2})(?=\d)/g, '$1 ')
}

/**
 * Valeur pour un lien tel: : chiffres et signe plus uniquement.
 * « +33 6 12 34 56 78 » donne « +33612345678 », « 06.12.34.56.78 » donne
 * « 0612345678 ». Vide si rien de composable.
 */
export function telephoneAppel(texte) {
  const brut = String(texte ?? '').trim()
  if (!brut) return ''
  const plus = brut.startsWith('+') ? '+' : ''
  const chiffres = brut.replace(/\D/g, '')
  return chiffres ? plus + chiffres : ''
}
