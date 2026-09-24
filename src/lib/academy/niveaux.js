// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY, niveaux, titres, classement et défis côté écran
//
// Le serveur décide de tout ce qui se compte (spec du 22 septembre 2026 :
// academy_niveau, academy_classement_semaine, academy_catalogue_defis). Ce
// fichier en est le MIROIR client : il ne sert qu’à animer (compteur qui
// monte, barre de niveau qui glisse de niveau_avant à niveau_apres, phrase
// d’encouragement) et à afficher un libellé quand le serveur n’en rend pas.
// Aucune valeur calculée ici ne fait foi : ce qui s’affiche en dur vient de
// la base.
//
// Seuil du niveau n : xp_min(n) = 25 × (n − 1) × (n + 2), soit 0, 100, 250,
// 450, 700, 1 000, 1 350, 1 750, 2 200, 2 700, puis la formule continue ;
// le titre plafonne à « Légende » à partir du niveau 10.
// ═══════════════════════════════════════════════════════════════════════════

/** Les titres des niveaux 1 à 10 ; au delà, le dernier reste. */
export const TITRES = Object.freeze([
  'Débutant', 'Apprenti', 'Initié', 'Confirmé', 'Solide', 'Expert', 'Maître', 'Mentor', 'Virtuose', 'Légende',
])

const entierPositif = (v) => Math.max(0, Math.floor(Number(v) || 0))

/** L’XP minimal du niveau n (n ≥ 1) : 25 × (n − 1) × (n + 2). */
export function xpMin(n) {
  const niveau = Math.max(1, Math.floor(Number(n) || 1))
  return 25 * (niveau - 1) * (niveau + 2)
}

/** Le titre d’un niveau : « Débutant » à 1, « Légende » à 10 et au delà. */
export function titrePour(niveau) {
  const n = Math.max(1, Math.floor(Number(niveau) || 1))
  return TITRES[Math.min(n, TITRES.length) - 1]
}

/**
 * Le niveau d’un total d’XP, dans la forme exacte d’academy_niveau :
 * { niveau, titre, xp_min, xp_suivant, xp_total, progression_pct }.
 * progression_pct est la position entre xp_min et xp_suivant, arrondie à
 * l’entier le plus proche comme round() en base (0 à 100). Un XP illisible
 * ou négatif vaut zéro.
 */
export function niveauPour(xp) {
  const total = entierPositif(xp)
  // Inverse de la formule : (n − 1)(n + 2) ≤ total / 25, soit
  // n ≤ (−1 + √(9 + 4 × total / 25)) / 2 ; puis ajustement entier par
  // prudence sur l’arrondi flottant.
  let niveau = Math.max(1, Math.floor((-1 + Math.sqrt(9 + (4 * total) / 25)) / 2))
  while (xpMin(niveau + 1) <= total) niveau += 1
  while (niveau > 1 && xpMin(niveau) > total) niveau -= 1
  const min = xpMin(niveau)
  const suivant = xpMin(niveau + 1)
  const pct = Math.max(0, Math.min(100, Math.round((100 * (total - min)) / Math.max(1, suivant - min))))
  return { niveau, titre: titrePour(niveau), xp_min: min, xp_suivant: suivant, xp_total: total, progression_pct: pct }
}

/** « 1er », « 2e », « 3e »… */
const ordinal = (n) => (n === 1 ? '1er' : `${n}e`)

/**
 * Une phrase d’encouragement à partir du classement anonyme de la semaine
 * ({ rang, participants, xp_moi, xp_premier, xp_devant, ecart_premier }),
 * jamais un nom :
 *   « Personne n’a encore joué cette semaine » quand aucun XP n’est tombé ;
 *   « Pas encore d’XP cette semaine, une session et tu entres au classement »
 *   quand les autres ont joué et pas moi ;
 *   « Premier de la semaine ! » au rang 1 ;
 *   « 3e sur 9 cette semaine, 40 XP derrière le premier » sinon, ou, quand
 *   la place au dessus est à portée (20 XP au plus, moins que le premier),
 *   « 3e sur 9 cette semaine, 10 XP de la place au dessus ».
 */
export function phraseClassement(classement) {
  const c = classement && typeof classement === 'object' ? classement : {}
  const participants = entierPositif(c.participants)
  const xpMoi = entierPositif(c.xp_moi)
  const xpPremier = entierPositif(c.xp_premier)
  if (participants === 0 || xpPremier === 0) return 'Personne n’a encore joué cette semaine'
  if (xpMoi === 0) return 'Pas encore d’XP cette semaine, une session et tu entres au classement'
  const rang = Math.max(1, entierPositif(c.rang))
  if (rang === 1) return 'Premier de la semaine !'
  const debut = `${ordinal(rang)} sur ${Math.max(rang, participants)} cette semaine`
  const ecartPremier = c.ecart_premier == null ? xpPremier - xpMoi : entierPositif(c.ecart_premier)
  const ecartDevant = c.xp_devant == null ? null : entierPositif(c.xp_devant) - xpMoi
  if (ecartDevant != null && ecartDevant > 0 && ecartDevant <= 20 && ecartDevant < ecartPremier) {
    return `${debut}, ${ecartDevant} XP de la place au dessus`
  }
  if (ecartPremier > 0) return `${debut}, ${ecartPremier} XP derrière le premier`
  return debut
}

/**
 * Les libellés du catalogue des huit défis du jour, par code, avec le mot
 * clé du pictogramme (composant Picto). Repli quand le serveur rend un défi
 * sans titre ni description ; le serveur reste la référence pour la cible,
 * la progression et l’XP.
 */
export const libellesDefi = Object.freeze({
  sessions_2: Object.freeze({ titre: 'Deux sessions aujourd’hui', description: 'Terminer deux sessions aujourd’hui.', icone: 'session' }),
  parfaite_1: Object.freeze({ titre: 'Une session parfaite', description: 'Réussir les douze exercices d’une session.', icone: 'parfaite' }),
  justes_15: Object.freeze({ titre: 'Quinze bonnes réponses', description: 'Donner quinze bonnes réponses dans des sessions terminées.', icone: 'justes' }),
  dus_10: Object.freeze({ titre: 'Dix révisions', description: 'Réussir dix exercices qui étaient à revoir.', icone: 'revision' }),
  deck_neuf: Object.freeze({ titre: 'Un deck de plus', description: 'Terminer une session sur un deck jamais joué avant aujourd’hui.', icone: 'deck' }),
  combo_5: Object.freeze({ titre: 'Combo de cinq', description: 'Enchaîner cinq bonnes réponses dans une session.', icone: 'combo' }),
  matin_10h: Object.freeze({ titre: 'Avant dix heures', description: 'Terminer une session avant 10 h.', icone: 'matin' }),
  deux_decks: Object.freeze({ titre: 'Deux decks différents', description: 'Terminer des sessions sur deux decks différents.', icone: 'decks' }),
})
