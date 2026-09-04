// ════════════════════════════════════════════════════════════════════════════
// MOTEUR D’INFLEXIONS SUR UNE ALLOCATION TYPE
//
// Ce que fait ce module : il regarde les lignes d’un pôle, retrouve la famille
// d’actifs de chaque support dans l’univers du partenaire, et rend la liste
// des mouvements que la note du régime courant documente. Rien de plus.
//
// Il dit aussi quelles inclinaisons ne trouvent rien à viser dans ce pôle, et
// pourquoi (inclinaisonsSansCible, plus bas) : un argument long et sourcé
// affiché sans rien en face se lisait comme une panne du moteur.
//
// Ce qu’il ne fait pas, et ne fera pas :
//   il n’applique rien tout seul (appliquerPropositions est appelé par
//   l’écran, sur un geste du conseiller) ;
//   il ne normalise jamais le total (verrou 3) ;
//   il ne touche jamais au pôle prudent Abeille (verrou 1) ;
//   il ne propose jamais un monétaire, un fonds euro ou un fonds d’attente
//   (verrou 2), ni en renfort d’une ligne, ni en remplacement.
//
// Chaque proposition repart avec le pourquoi et les sources de l’inclinaison
// dont elle sort. C’est la condition pour qu’elle s’affiche : une proposition
// sans raison lisible serait un ordre déguisé, et le CRM n’en donne pas.
//
// Les trois verrous sont relus dans VERROUS à chaque appel plutôt que recopiés
// ici : le jour où la direction en ajoute un, il n’y a qu’un endroit à changer.
// ════════════════════════════════════════════════════════════════════════════

import { familleDuSupport, INCLINAISONS, REGIME_COURANT, VERROUS } from '../config/conjoncture'
import { estFondsDAttente } from '../config/univers-uc'

// Les poids s’affichent à la décimale dans l’écran Allocations types, comme
// dans melanger() : on arrondit pareil, sinon un mélange à 12,3 % ressortirait
// à 12,299999999999999 % après une inflexion.
const arrondi = (n) => Math.round(n * 10) / 10

/**
 * Verrou 1. Le pôle prudent Abeille ne bouge jamais : c’est l’allocation
 * servie aux clients les plus prudents du cabinet, elle se change par mail de
 * l’assureur et pas par un moteur.
 */
export function estVerrouille(poleId) {
  return VERROUS.polesIntouchables.includes(poleId)
}

// Verrou 2, lu sur le référentiel plutôt que réécrit en motifs ici : le jour
// où un monétaire de plus entre dans la liste d’un assureur, il est verrouillé
// le jour même, sans toucher au moteur.
const estIntouchable = (famille) => VERROUS.famillesIntouchables.includes(famille)

// On accepte aussi bien la clé du régime que l’objet REGIMES correspondant :
// l’écran passe l’un ou l’autre selon qu’il vient du sélecteur ou du réglage
// de la direction. Sans rien, c’est le régime courant qui s’applique.
const cleDuRegime = (regime) => {
  if (!regime) return REGIME_COURANT.cle
  return (typeof regime === 'string' ? regime : regime.cle) || REGIME_COURANT.cle
}

/**
 * Une seule inclinaison retenue par famille, et c’est le point délicat.
 *
 * Deux entrées de la note du 04/09/2026 visent les obligations souveraines,
 * la duration longue et la dette française. Additionner leurs points ferait
 * sortir le mouvement de la borne posée par la direction : cette borne est une
 * borne par famille, pas par argument. On garde donc la plus forte ampleur, et
 * à ampleur égale la première écrite, l’ordre de la note étant celui dans
 * lequel elle a été arbitrée.
 *
 * Si deux inclinaisons d’un même régime se contredisent, l’une renforçant ce
 * que l’autre allège, la famille ne produit plus rien du tout. Arbitrer une
 * contradiction est une décision, et le moteur n’en prend pas.
 */
const inclinaisonsRetenues = (cleRegime) => {
  const retenues = new Map()
  for (const inclinaison of INCLINAISONS[cleRegime] || []) {
    const { famille, sens, ampleur } = inclinaison || {}
    if (!famille || !VERROUS.sensQuiBougent.includes(sens)) continue
    if (!retenues.has(famille)) {
      retenues.set(famille, inclinaison)
      continue
    }
    const deja = retenues.get(famille)
    if (deja === null) continue
    if (deja.sens !== sens) {
      retenues.set(famille, null)
      continue
    }
    const points = VERROUS.pointsParAmpleur[ampleur] || 0
    const pointsDeja = VERROUS.pointsParAmpleur[deja.ampleur] || 0
    if (points > pointsDeja) retenues.set(famille, inclinaison)
  }
  return retenues
}

/**
 * Les inflexions proposées sur les lignes d’un pôle, pour un régime donné.
 *
 * Rend un tableau, éventuellement vide, dans l’ordre des lignes reçues : c’est
 * l’ordre du tableau à l’écran, la proposition doit se lire en face de sa
 * ligne.
 *
 * Une ligne ne produit une proposition que si toutes ces conditions tiennent :
 * le pôle n’est pas verrouillé, le support est connu de l’univers du
 * partenaire, sa famille n’est pas intouchable, cette famille porte une
 * inclinaison qui bouge pour ce régime, et le mouvement n’est pas nul.
 *
 * @param {object}   arg
 * @param {string}   arg.poleId   identifiant du pôle (ALLOCATIONS)
 * @param {Array}    arg.lignes   [{ fonds, isin, poids }]
 * @param {string|object} arg.regime  clé de régime, ou régime, ou rien
 * @param {object}   arg.univers  univers du partenaire (chargerUnivers)
 */
export function proposerInflexions({ poleId, lignes, regime, univers } = {}) {
  // Verrou 1 en premier, avant tout calcul : sur ce pôle il n’y a rien à
  // calculer, même pas pour afficher ce qu’on aurait proposé.
  if (estVerrouille(poleId)) return []

  const retenues = inclinaisonsRetenues(cleDuRegime(regime))
  if (!retenues.size) return []

  const parIsin = univers?.parIsin
  const propositions = []

  for (const ligne of lignes || []) {
    // Support inconnu de l’univers : on ne devine pas la famille sur le nom
    // du fonds recopié dans l’allocation, il vient d’une proposition papier et
    // il est parfois abrégé.
    const support = parIsin?.get?.(ligne?.isin)
    if (!support) continue

    const famille = familleDuSupport(support)
    if (!famille || estIntouchable(famille)) continue

    const inclinaison = retenues.get(famille)
    if (!inclinaison) continue

    const poids = arrondi(Number(ligne.poids) || 0)
    const points = VERROUS.pointsParAmpleur[inclinaison.ampleur] || 0
    const sens = inclinaison.sens === 'renforcer' ? 1 : -1

    // Le plancher rabote le mouvement au lieu de le refuser : alléger de deux
    // points une ligne qui en pèse un la sort, elle ne la passe pas à moins un.
    // Le delta rendu est le mouvement réel, pas le mouvement souhaité.
    const poidsPropose = arrondi(Math.max(VERROUS.poidsPlancher, poids + sens * points))
    const delta = arrondi(poidsPropose - poids)
    if (delta === 0) continue

    propositions.push({
      isin: ligne.isin,
      fonds: ligne.fonds,
      poids,
      famille,
      sens: inclinaison.sens,
      ampleur: inclinaison.ampleur,
      delta,
      poidsPropose,
      pourquoi: inclinaison.pourquoi,
      sources: [...(inclinaison.sources || [])],
    })
  }

  return propositions
}

/**
 * Applique des propositions à des lignes, et rien d’autre.
 *
 * Verrou 3 : le total n’est PAS normalisé. Si le pôle faisait 105 % avant, il
 * fait 103 % après une inflexion de deux points, et l’écran le montre. La
 * remise à 100 % reste le geste explicite déjà codé dans
 * src/config/allocations.js.
 *
 * Une ligne tombée à 0 n’est pas non plus supprimée : la faire disparaître
 * serait une seconde décision, celle de sortir le support, et elle appartient
 * au conseiller. Un poids à 0 se voit, une ligne effacée ne se voit plus.
 */
export function appliquerPropositions(lignes, propositions) {
  const parIsin = new Map((propositions || []).map((p) => [p.isin, p]))
  return (lignes || []).map((ligne) => {
    const proposition = parIsin.get(ligne?.isin)
    return proposition ? { ...ligne, poids: proposition.poidsPropose } : { ...ligne }
  })
}

// ════════════════════════════════════════════════════════════════════════════
// LE SILENCE DU MOTEUR, DIT AU LIEU D’ÊTRE SUBI
//
// Les deux inclinaisons les mieux documentées de la note du 04/09/2026, la
// duration longue et la dette souveraine française, visent oblig_souverain. Or
// aucune des 84 catégories SwissLife ni des 5 catégories Abeille ne déclare un
// émetteur souverain ou une duration : familleDuSupport ne rend donc quasiment
// jamais cette famille, et proposerInflexions ne produit rien en face de ces
// deux entrées. L’écran montrait un argument long et sourcé, et rien à côté ;
// le conseiller en concluait que le moteur était cassé, ou pire, que
// l’allocation ne portait pas ce risque.
//
// Cette fonction nomme ce silence. Elle n’invente aucune cible et n’élargit
// aucune famille : ranger les « Obligations Diversifiées EUR » en souverain
// serait le raccourci que la direction a refusé, la note vise le « au delà de
// dix ans », que le CRM ne sait pas lire dans les listes des assureurs.
//
// Les causes ne se rattrapent pas de la même façon, elles sont donc rendues
// distinctes :
//   aucune_ligne_du_pole            aucune ligne du pôle n’appartient à cette
//                                   famille. C’est une information sur le
//                                   portefeuille, et elle se règle en le
//                                   regardant.
//   famille_absente_des_listes      aucun support de la liste du partenaire ne
//                                   se classe dans cette famille. C’est une
//                                   limite de la donnée de l’assureur, le
//                                   portefeuille n’y est pour rien, et rien
//                                   dans le CRM ne la lèvera.
//   pole_verrouille                 verrou 1. Ni un manque ni une limite : une
//                                   décision.
//   aucun_mouvement_sur_les_lignes  la famille est bien portée par le pôle et
//                                   rien n’est proposé dessus, par exemple une
//                                   ligne déjà à zéro qu’une inclinaison
//                                   allège. Le fait est rendu tel quel, sans
//                                   lui désigner une cause qu’on n’a pas.
//
// Ce qui n’y figure pas, volontairement :
//   les 'maintenir', qui ne produisent rien par construction et ne sont donc
//   pas un manque ;
//   l’entrée sans famille, qui vise le calendrier d’exécution et pas une classe
//   d’actifs ;
//   les inclinaisons dont la famille a reçu des propositions, y compris celle
//   des deux souveraines que le moteur n’a pas retenue : il y a bien quelque
//   chose à lire en face de cette ligne, sous l’argument de sa jumelle.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Les inclinaisons du régime qui ne trouvent aucune ligne à viser dans le pôle,
 * avec la raison de ce silence.
 *
 * Même argument d’appel que proposerInflexions, à dessein : l’écran calcule les
 * deux sur le même contexte, et l’un ne peut pas parler d’un autre pôle que
 * l’autre. proposerInflexions ne change ni de signature ni de comportement.
 *
 * Rend un tableau, éventuellement vide, dans l’ordre du tableau du régime.
 * Chaque entrée porte le rang de l’inclinaison dans INCLINAISONS[regime] :
 * c’est ce rang qui permet d’afficher la réponse en face de la bonne ligne,
 * deux entrées pouvant viser la même famille.
 *
 * @param {object}   arg
 * @param {string}   arg.poleId   identifiant du pôle (ALLOCATIONS)
 * @param {Array}    arg.lignes   [{ fonds, isin, poids }]
 * @param {string|object} arg.regime  clé de régime, ou régime, ou rien
 * @param {object}   arg.univers  univers du partenaire (chargerUnivers)
 */
export function inclinaisonsSansCible({ poleId, lignes, regime, univers } = {}) {
  const inclinaisons = INCLINAISONS[cleDuRegime(regime)] || []

  const quiBougent = []
  inclinaisons.forEach((inclinaison, rang) => {
    const { famille, sens } = inclinaison || {}
    if (!famille || !VERROUS.sensQuiBougent.includes(sens)) return
    quiBougent.push({ rang, inclinaison })
  })
  if (!quiBougent.length) return []

  const decrire = ({ rang, inclinaison }, cause, lignesNonClassees) => ({
    rang,
    famille: inclinaison.famille,
    classe: inclinaison.classe,
    sens: inclinaison.sens,
    ampleur: inclinaison.ampleur,
    cause,
    lignesNonClassees,
  })

  // Verrou 1 avant tout calcul, comme dans proposerInflexions : sur ce pôle on
  // ne regarde même pas les lignes, donc on n’en compte aucune non plus.
  if (estVerrouille(poleId)) {
    return quiBougent.map((entree) => decrire(entree, 'pole_verrouille', null))
  }

  // Sans liste de supports, le moteur se tait au lieu de déclarer toutes les
  // familles absentes : ce serait accuser l’assureur d’un trou qui n’est qu’un
  // chargement manquant. L’écran, lui, sait dire que la liste n’est pas là.
  const supports = univers?.supports
  if (!Array.isArray(supports) || !supports.length) return []

  const famillesDesListes = new Set()
  for (const support of supports) {
    const famille = familleDuSupport(support)
    if (famille) famillesDesListes.add(famille)
  }

  // Les familles que le pôle porte, lues exactement comme les propositions les
  // lisent : par l’univers, jamais par le nom recopié dans l’allocation.
  const parIsin = univers?.parIsin
  const famillesDuPole = new Set()
  let lignesNonClassees = 0
  for (const ligne of lignes || []) {
    const support = parIsin?.get?.(ligne?.isin)
    const famille = support ? familleDuSupport(support) : null
    if (famille) famillesDuPole.add(famille)
    // Absente de la liste, ou présente et classée nulle part : dans les deux cas
    // le moteur ne sait pas ce que porte cette ligne. On compte ces lignes pour
    // que « aucune ligne de cette famille » se lise avec sa réserve.
    else lignesNonClassees += 1
  }

  // Le diagnostic se lit sur les propositions réellement rendues, pas sur une
  // seconde lecture des règles : les deux ne peuvent pas diverger, et l’écran
  // ne peut pas annoncer un manque à côté d’une proposition affichée.
  const famillesServies = new Set(
    proposerInflexions({ poleId, lignes, regime, univers }).map((p) => p.famille),
  )

  const sansCible = []
  for (const entree of quiBougent) {
    const { famille } = entree.inclinaison
    if (famillesServies.has(famille)) continue
    let cause = 'aucun_mouvement_sur_les_lignes'
    if (!famillesDesListes.has(famille)) cause = 'famille_absente_des_listes'
    else if (!famillesDuPole.has(famille)) cause = 'aucune_ligne_du_pole'
    sansCible.push(decrire(entree, cause, lignesNonClassees))
  }
  return sansCible
}

// Tri par intérêt, dans l’ordre demandé par la direction : le SRI d’abord,
// puis les frais, puis la performance. Une donnée absente ne fait pas gagner
// de rang, elle passe derrière : Abeille ne publie ni frais ni performances,
// donc son panorama se départage sur le SRI puis sur le nom, ce qui est déjà
// mieux que l’ordre du fichier PDF.
const SRI_ABSENT = 99
const FRAIS_ABSENTS = 99
const PERF_ABSENTE = -999

const nombreOu = (valeur, defaut) =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : defaut

const comparerInteret = (a, b) =>
  nombreOu(a.sri, SRI_ABSENT) - nombreOu(b.sri, SRI_ABSENT) ||
  nombreOu(a.fraisGestionMax, FRAIS_ABSENTS) - nombreOu(b.fraisGestionMax, FRAIS_ABSENTS) ||
  nombreOu(b.perfNette5AnsAnnualisee, PERF_ABSENTE) - nombreOu(a.perfNette5AnsAnnualisee, PERF_ABSENTE) ||
  nombreOu(b.perfNetteAn, PERF_ABSENTE) - nombreOu(a.perfNetteAn, PERF_ABSENTE) ||
  (a.nom || '').localeCompare(b.nom || '')

/**
 * Les supports de l’univers qui pourraient remplacer une ligne, dans la même
 * famille d’actifs.
 *
 * Trois exclusions, toutes volontaires :
 *   les fonds d’attente, verrou 2, y compris si la famille demandée est
 *   elle même intouchable, auquel cas il n’y a simplement pas de candidat ;
 *   les supports qui sortent du contrat, listés dans univers.sorties, parce
 *   qu’ils sont encore dans la liste des supports le temps de la transition et
 *   qu’on ne remplace pas une ligne par un fonds qui ferme ;
 *   les ISIN passés en exclureIsins, en général ceux déjà présents dans
 *   l’allocation.
 */
export function candidatsRemplacement(univers, famille, { exclureIsins, limite } = {}) {
  if (!univers || !famille || estIntouchable(famille)) return []

  const exclus = new Set(exclureIsins || [])
  for (const sortie of univers.sorties || []) exclus.add(sortie.isin)

  const candidats = (univers.supports || []).filter((support) => {
    if (exclus.has(support.isin)) return false
    // Le verrou « jamais de fonds d attente » est ecrit a deux endroits : la
    // famille monetaire_attente ici, et estFondsDAttente cote univers, qui
    // regarde aussi le nom du support. Les deux ne sont pas d accord partout
    // (un fonds a capital protege, aujourd hui) et c est voulu : sur une regle
    // que la direction a posee en « jamais », on retient l union des deux
    // lectures. Un support ecarte a tort se rattrape a la main ; un fonds
    // d attente propose au client, non.
    if (estFondsDAttente(support)) return false
    const familleDuCandidat = familleDuSupport(support)
    // Verrou 2 écrit en clair, même s’il est déjà impliqué par l’égalité qui
    // suit : le jour où cette fonction sera appelée avec une famille qui a
    // dérivé, le verrou tiendra quand même.
    if (estIntouchable(familleDuCandidat)) return false
    return familleDuCandidat === famille
  })

  candidats.sort(comparerInteret)
  return limite > 0 ? candidats.slice(0, limite) : candidats
}
