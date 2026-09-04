// ═══════════════════════════════════════════════════════════════════════════
// UNIVERS DES UNITÉS DE COMPTE, PAR PARTENAIRE
//
// L'écran Allocations types tient sur la doctrine écrite en tête de
// src/config/allocations.js : « RIEN N'EST INVENTÉ », et le CRM « affiche et
// contrôle, il ne conçoit pas ». Ce module en est le socle : il donne accès à
// la liste des supports que l'assureur commercialise vraiment, pour qu'aucun
// écran n'ait à deviner si un fonds existe encore, dans quelle classe il
// tombe, ni s'il a quitté le contrat depuis la dernière proposition envoyée.
//
// DEUX FICHIERS, extraits des listes officielles et servis depuis public/,
// donc à la racine du site :
//
//   swisslife  829 supports et 125 sorties. Source : SL Retraite et Épargne,
//              liste de juin 2026. Renseigné jusqu'aux frais de gestion et
//              aux performances nettes.
//   abeille    165 supports, aucune sortie publiée. Source : panorama des UC
//              de décembre 2024. Ni frais ni performances : le panorama ne
//              les donne pas. On ne comble pas le trou, on affiche ce qu'on
//              a, et un classement qui s'appuie sur ces champs le sait.
//
// Ce module ne recommande rien et ne pondère rien. Il charge, il cherche, il
// alerte. Tout ce qui propose vit dans src/lib/moteur-allocation.js.
//
// CE QUI SE PAIE À CHAQUE OUVERTURE D'ONGLET. Le fichier SwissLife pèse
// 253 ko. On le télécharge une fois par session et par partenaire, jamais
// deux : la mémoïsation ci dessous garde la promesse elle même, pas seulement
// son résultat, pour que deux composants montés en même temps partagent le
// même appel réseau au lieu d'en lancer deux.
// ═══════════════════════════════════════════════════════════════════════════

import { chercher as ordonnerParPertinence, normaliser } from '../lib/recherche'

// Les fichiers vivent dans public/, que Vite et Vercel servent à la racine.
// Pas de `cache: 'no-store'` ici, contrairement à version.json : ces listes ne
// bougent qu'à la republication d'un assureur, et Vercel sert les fichiers
// statiques en `must-revalidate`. Le navigateur repasse donc par un 304, ce
// qui coûte un aller retour et non 253 ko.
export const FICHIERS = {
  swisslife: '/data/univers-uc-swisslife.json',
  abeille: '/data/univers-uc-abeille.json',
}

// ─────────────────────────────────────────────────────────────────────────
// VERROU DE LA DIRECTION : LES FONDS D'ATTENTE
//
// Aucun monétaire, aucun fonds euro, aucun fonds d'attente ne peut être
// proposé, jamais. Un arbitrage qui range un client sur du monétaire n'est
// pas un conseil, c'est une salle d'attente facturée.
//
// Ces motifs sont cherchés dans la forme normalisée du texte (minuscules,
// accents retirés, apostrophes ramenées à des espaces par `normaliser`).
// D'où « n ayant pas vocation a etre souscrit » et non la phrase d'origine.
//
// Ce qu'ils attrapent dans les fichiers réels :
//   « Monétaire EUR » et « Monétaire Devises »              SwissLife
//   « Fonds monétaire n'ayant pas vocation à être souscrit » SwissLife
//   « Monétaire »                                            Abeille
// soit 10 supports sur 829 chez SwissLife, 2 sur 165 chez Abeille.
//
// La liste est volontairement plus large que les libellés observés : mieux
// vaut écarter un support de trop que d'en proposer un d'attente. Les termes
// anglais y sont, parce que les listes mélangent les deux langues et qu'un
// « Euro Liquidity » mal catégorisé passerait sinon.
//
// Vérifié sur les deux fichiers : aucun de ces motifs ne prend un support
// qui ne soit pas déjà monétaire par sa catégorie. « cash » a été écarté
// exprès, il attraperait les fonds actions « free cash flow ».
// ─────────────────────────────────────────────────────────────────────────
export const CLASSES_ATTENTE = [
  'monetaire',
  'money market',
  'liquidite',
  'liquidity',
  'tresorerie',
  'fonds en euro',
  'fonds euro',
  'n ayant pas vocation a etre souscrit',
  // Arbitres par la direction le 04/09/2026, apres coup d oeil sur la donnee
  // reelle. « court terme » ne prend aujourd hui que les cinq supports de la
  // categorie « Obligations Diversifiés EUR - Court terme » chez SwissLife :
  // ce sont des fonds d attente en pratique, meme si l assureur ne les nomme
  // pas ainsi. Les fonds de credit a duree courte, eux, ne sont pas vises et
  // ne portent pas ce libelle : « short duration » reste hors liste.
  'court terme',
  // Un seul support concerne, HSBC Clic Euro 85 G. Un capital protege n est
  // pas un placement que le cabinet propose depuis cet ecran : la protection
  // se paie sur la performance, et le moteur ne doit pas l offrir de lui meme.
  'capital protege',
]

/**
 * Le support est il un fonds d'attente, donc interdit de proposition ?
 *
 * On regarde la catégorie ET le nom. La catégorie suffit sur les deux
 * fichiers d'aujourd'hui, mais une ligne d'allocation recopiée d'une
 * proposition n'en porte pas : elle n'a qu'un nom. On accepte donc aussi
 * `fonds`, le champ que portent les lignes de src/config/allocations.js.
 *
 * @param {Object} support support de l'univers, ou ligne d'allocation
 * @returns {boolean}
 */
export function estFondsDAttente(support) {
  if (!support || typeof support !== 'object') return false
  const champs = [support.categorie, support.nom, support.fonds]
  return champs.some((champ) => {
    if (!champ) return false
    const texte = normaliser(champ)
    return CLASSES_ATTENTE.some((motif) => texte.includes(motif))
  })
}

// ─────────────────────────────────────────────────────────────────────────
// CHARGEMENT
// ─────────────────────────────────────────────────────────────────────────

// Forme comparable d'un ISIN. Les listes des assureurs les écrivent en
// majuscules ; ce qui arrive d'une saisie ou d'un copier coller, non.
const cleIsin = (isin) => String(isin ?? '').replace(/\s+/g, '').toUpperCase()

// Mémoïsation par partenaire, pour la durée de la session. On garde la
// PROMESSE : deux onglets ouverts au même instant se partagent un seul appel.
const memo = new Map()

/**
 * Charge l'univers d'un partenaire et le garde en mémoire pour la session.
 *
 * Rejette si le partenaire est inconnu, si le fichier ne répond pas, s'il
 * n'est pas du JSON, ou s'il ne porte pas de liste de supports. L'appelant
 * gère l'échec : l'écran doit dire que la liste est indisponible plutôt que
 * de laisser croire à un univers vide, ce qui reviendrait à afficher qu'un
 * assureur ne commercialise plus rien.
 *
 * Un échec ne reste pas collé au cache : on oublie la promesse rejetée pour
 * qu'un second essai, après un réseau revenu, puisse aboutir.
 *
 * @param {string} partenaireCle 'swisslife' ou 'abeille'
 * @returns {Promise<{partenaire, sourceFichier, publie, extraitLe, supports, sorties, parIsin}>}
 */
export async function chargerUnivers(partenaireCle) {
  const cle = String(partenaireCle ?? '').trim().toLowerCase()
  const chemin = FICHIERS[cle]
  if (!chemin) {
    throw new Error(`Univers UC : partenaire inconnu « ${partenaireCle} ». Attendu : ${Object.keys(FICHIERS).join(', ')}.`)
  }

  const dejaLa = memo.get(cle)
  if (dejaLa) return dejaLa

  const promesse = telecharger(cle, chemin).catch((erreur) => {
    // Sans cet oubli, une coupure réseau d'une seconde condamnerait l'écran
    // jusqu'au rechargement complet du CRM.
    memo.delete(cle)
    throw erreur
  })
  memo.set(cle, promesse)
  return promesse
}

async function telecharger(cle, chemin) {
  const reponse = await fetch(chemin)
  if (!reponse?.ok) {
    throw new Error(`Univers UC ${cle} : ${chemin} a répondu ${reponse?.status ?? 'sans statut'}.`)
  }

  let brut
  try {
    brut = await reponse.json()
  } catch {
    throw new Error(`Univers UC ${cle} : ${chemin} n'est pas du JSON lisible.`)
  }

  if (!brut || !Array.isArray(brut.supports)) {
    throw new Error(`Univers UC ${cle} : ${chemin} ne porte aucune liste de supports.`)
  }

  const supports = brut.supports
  const parIsin = new Map()
  for (const support of supports) {
    if (support?.isin) parIsin.set(cleIsin(support.isin), support)
  }

  const univers = {
    partenaire: brut.partenaire ?? cle,
    // Le nom du document est ce que le conseiller cite quand un client
    // demande d'où sort la liste. Il fait partie de la donnée, pas du décor.
    sourceFichier: brut.sourceFichier ?? null,
    publie: brut.publie ?? null,
    extraitLe: brut.extraitLe ?? null,
    supports,
    sorties: Array.isArray(brut.sorties) ? brut.sorties : [],
    parIsin,
  }

  // On indexe tout de suite : la première frappe dans la barre de recherche
  // ne doit pas payer la normalisation des 829 lignes.
  indexer(univers)
  return univers
}

// ─────────────────────────────────────────────────────────────────────────
// INDEX DE RECHERCHE
//
// Normaliser 829 lignes coûte environ 1 ms. Le faire à chaque frappe, sur
// une barre de recherche, c'est 1 ms rendue à chaque lettre pour un résultat
// toujours identique. On normalise donc une fois, au chargement, et on garde
// le résultat dans un WeakMap indexé par l'objet univers : rien n'est ajouté
// aux supports eux mêmes, qui restent la donnée brute de l'assureur.
//
// Le WeakMap sert aussi aux univers fabriqués à la main, dans les tests et
// dans les écrans qui composent une liste : `chercher` les indexe à la volée
// au premier appel.
// ─────────────────────────────────────────────────────────────────────────
const INDEX = new WeakMap()

function indexer(univers) {
  const dejaLa = INDEX.get(univers)
  if (dejaLa) return dejaLa

  const texte = new Map()
  const classe = new Map()
  for (const support of univers.supports ?? []) {
    if (!support || typeof support !== 'object') continue
    // L'ISIN et la société de gestion entrent dans la botte de foin : un
    // conseiller cherche « pictet » aussi souvent qu'il colle un ISIN lu sur
    // un relevé.
    texte.set(support, normaliser([support.nom, support.isin, support.societeGestion, support.categorie].filter(Boolean).join(' ')))
    classe.set(support, normaliser(support.categorie ?? ''))
  }

  const sorties = new Map()
  for (const sortie of univers.sorties ?? []) {
    if (sortie?.isin) sorties.set(cleIsin(sortie.isin), sortie)
  }

  const index = { texte, classe, sorties }
  INDEX.set(univers, index)
  return index
}

// ─────────────────────────────────────────────────────────────────────────
// RECHERCHE
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cherche dans l'univers d'un partenaire. Utilisable au fil de la frappe.
 *
 * Le classement est celui de src/lib/recherche : accents ignorés, ordre des
 * mots libre, tolérance à une lettre. Le CRM n'a qu'une recherche, et c'est
 * celle là ; on ne réintroduit pas un `includes` sur du texte saisi.
 *
 * @param {Object} univers    rendu par chargerUnivers, ou fabriqué à la main
 * @param {Object} [criteres]
 * @param {string} [criteres.q]       texte tapé : nom, ISIN, société de gestion
 * @param {string} [criteres.classe]  fragment de catégorie, « actions », « obligations »
 * @param {number} [criteres.sriMax]  indicateur de risque maximal accepté
 * @param {number} [criteres.limite]  borne le nombre de résultats
 * @returns {Array} les supports eux mêmes, jamais une copie modifiée
 */
export function chercher(univers, { q, classe, sriMax, limite } = {}) {
  if (!univers || typeof univers !== 'object' || !Array.isArray(univers.supports)) return []
  const index = indexer(univers)
  let liste = univers.supports

  if (classe) {
    const cherchee = normaliser(classe)
    if (cherchee) {
      liste = liste.filter((s) => (index.classe.get(s) ?? normaliser(s?.categorie ?? '')).includes(cherchee))
    }
  }

  if (Number.isFinite(sriMax)) {
    // Un support sans SRI ne prouve pas qu'il tient sous le plafond : 10 des
    // 165 supports Abeille n'en portent pas. On les écarte plutôt que de
    // supposer à leur place. Le conseiller qui les cherche les trouve sans
    // plafond.
    liste = liste.filter((s) => Number.isFinite(s?.sri) && s.sri <= sriMax)
  }

  const borne = Number.isFinite(limite) && limite >= 0 ? limite : null
  // Une limite à zéro veut dire zéro résultat. `chercher` de src/lib/recherche
  // teste `opts.max` en booléen et rendrait la liste entière : on tranche ici.
  if (borne === 0) return []

  const requete = String(q ?? '').trim()
  if (!requete) {
    // Sans requête, on garde l'ordre du fichier : c'est celui de l'assureur,
    // par classe d'actifs. Le CRM affiche, il ne reclasse pas.
    return borne === null ? liste.slice() : liste.slice(0, borne)
  }

  const opts = borne === null ? {} : { max: borne }
  return ordonnerParPertinence(liste, requete, (s) => index.texte.get(s) ?? '', opts)
}

// ─────────────────────────────────────────────────────────────────────────
// SORTIES DU CONTRAT
// ─────────────────────────────────────────────────────────────────────────

// Deux des 125 sorties SwissLife n'ont aucun motif dans la liste de juin
// 2026. On ne fabrique pas la raison : on dit qu'elle manque. Une allocation
// qui cite ce support doit être revue, motif ou pas.
const MOTIF_ABSENT = "Sortie annoncée par l'assureur, sans motif indiqué dans sa liste"

/**
 * Le support cité par une ligne d'allocation a t il quitté le contrat ?
 *
 * Sert à mettre en garde sur une allocation recopiée d'une proposition
 * ancienne. Cas vécu : Eurose C (FR0007051040) figure encore dans deux
 * allocations types alors que SwissLife l'a fait absorber le 21/05/2026.
 *
 * Attention, un support peut être À LA FOIS dans la liste et dans les
 * sorties : cinq le sont chez SwissLife en juin 2026, encore souscriptibles
 * mais déjà annoncés sortants. La sortie prime, elle est rendue quand même.
 *
 * @returns {{isin: string, nom: string, motif: string}|null}
 */
export function sortieDuContrat(univers, isin) {
  if (!univers || typeof univers !== 'object') return null
  const cle = cleIsin(isin)
  if (!cle) return null

  const sortie = indexer(univers).sorties.get(cle)
  if (!sortie) return null

  return {
    isin: sortie.isin,
    nom: sortie.nom ?? '',
    motif: String(sortie.motif ?? '').trim() || MOTIF_ABSENT,
  }
}
