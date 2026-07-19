// ═══════════════════════════════════════════════════════════════════════════
// RÈGLES D'OPPORTUNITÉS — Module Multi-équipement
//
// Volontairement HORS composant (fichier de config simple), pour que la
// direction puisse ajuster seuils et suggestions sans toucher au code UI.
// ═══════════════════════════════════════════════════════════════════════════

// Seuils monétaires (en euros).
export const SEUILS = {
  revenusFortPotentiel: 80000,     // « fort potentiel » si revenus >= ceci
  patrimoineFortPotentiel: 300000, //   OU patrimoine >= ceci
  revenusScpi: 100000,             // cible SCPI au dessus de ce revenu
}

// Détection TNS / profession libérale à partir du champ `profession` (texte libre).
export const MOTS_TNS = [
  'tns', 'independant', 'indépendant', 'liberal', 'libéral', 'liberale', 'libérale',
  'artisan', 'commercant', 'commerçant', 'avocat', 'medecin', 'médecin', 'notaire',
  'gerant', 'gérant', 'dirigeant', 'chef d', 'profession libe', 'auto-entrepreneur', 'micro',
]

export function estTns(profession) {
  const p = (profession || '').toLowerCase()
  return MOTS_TNS.some((mot) => p.includes(mot))
}

// Vrai si le client est TNS ou en profession libérale. On se fie d'abord au
// STATUT structuré (fiable, obligatoire à la signature), et on retombe sur le
// texte profession pour la data historique sans statut.
export function estTnsOuLiberal(c) {
  const s = (c?.statut || '').toLowerCase()
  if (s === 'tns' || s.includes('libéral') || s.includes('liberal')) return true
  return estTns(c?.profession)
}

// Un client est « fort potentiel » si revenus ou patrimoine élevés.
export function estFortPotentiel(c) {
  return Number(c.revenus || 0) >= SEUILS.revenusFortPotentiel
    || Number(c.patrimoine || 0) >= SEUILS.patrimoineFortPotentiel
}

// Règles ordonnées. La 1re qui s'applique donne la suggestion principale.
// `c` = { familles:[clés détenues], absences:[absences confirmées],
//         profession, revenus, patrimoine }
export const REGLES = [
  {
    id: 'tns_sans_prevoyance',
    famille_suggeree: 'prevoyance',
    label: 'Proposer Prévoyance',
    raison: 'Profession TNS ou libérale sans prévoyance : protection des revenus prioritaire.',
    applicable: (c) => estTnsOuLiberal(c) && !c.familles.includes('prevoyance'),
  },
  {
    id: 'per_sans_av',
    famille_suggeree: 'av',
    label: 'Proposer Assurance Vie',
    raison: 'Détient un PER mais pas d’assurance vie : compléter l’épargne disponible.',
    applicable: (c) => c.familles.includes('per') && !c.familles.includes('av'),
  },
  {
    id: 'hauts_revenus_sans_scpi',
    famille_suggeree: 'scpi',
    label: 'Proposer SCPI',
    raison: 'Revenus élevés sans SCPI : diversifier en pierre papier et générer du foncier.',
    applicable: (c) => Number(c.revenus || 0) > SEUILS.revenusScpi && !c.familles.includes('scpi'),
  },
]

// Renvoie la 1re règle applicable à un client, ou null.
export function suggestionPour(c) {
  return REGLES.find((r) => r.applicable(c)) || null
}

// ─── V2 : argumentaires et estimation de collecte ───────────────────────────

// Argumentaire pret a copier par famille suggeree (bouton copier du panneau).
// Volontairement court : c'est une accroche d'appel, pas un devoir de conseil.
export const ARGUMENTAIRES = {
  prevoyance: 'En tant qu independant, un arret de travail = zero revenu. Une prevoyance Madelin protege vos revenus ET se deduit de votre benefice imposable. On regarde ensemble ce que ca donnerait dans votre situation ?',
  av: 'Vous avez deja un PER pour la retraite, mais rien pour les projets a moyen terme. Une assurance vie complete parfaitement : disponible a tout moment, fiscalite douce apres 8 ans. On en parle 10 minutes ?',
  scpi: 'Avec vos revenus, vous payez beaucoup d impots sur des liquidites qui dorment. La SCPI genere des loyers reguliers sans aucune gestion locative. Je peux vous montrer une simulation rapide ?',
  per: 'A votre TMI, chaque versement PER vous fait economiser de l impot des cette annee tout en preparant la retraite. Voulez vous que je chiffre votre economie exacte ?',
  mutuelle: 'Votre mutuelle actuelle est elle adaptee a votre statut ? Souvent on paie pour des garanties inutiles et on rate la deductibilite Madelin. Un comparatif prend 5 minutes.',
  emprunteur: 'Si vous avez un credit immobilier, l assurance emprunteur de la banque est souvent 2 fois trop chere. La deleguer = meme protection, grosse economie. Vous avez un pret en cours ?',
  immobilier: 'Le LMNP permet de generer des revenus locatifs quasi non imposes grace a l amortissement. Avec votre profil ca vaut une simulation.',
  structures: 'Les produits structures offrent un rendement cible avec une protection partielle du capital, un bon complement entre fonds euro et actions. Je vous montre le produit du moment ?',
}

// Estimation grossiere de collecte par opportunite (pour le KPI gisement et
// le tri par potentiel). Ordres de grandeur cabinet, PAS un engagement :
// affiches avec le prefixe « ~ » dans l interface.
export function estimationCollecte(c, familleSuggeree) {
  const rev = Number(c.revenus || 0)
  const pat = Number(c.patrimoine || 0)
  switch (familleSuggeree) {
    case 'prevoyance': return 1800                        // PP ~150/mois annualisee
    case 'mutuelle': return 1200
    case 'per': return Math.max(2400, Math.round(rev * 0.06))   // ~6% du revenu en versements
    case 'av': return Math.max(10000, Math.round(pat * 0.08))   // ~8% du patrimoine place
    case 'scpi': return Math.max(20000, Math.round(pat * 0.10))
    case 'immobilier': return 120000                      // ticket LMNP moyen
    case 'structures': return 25000
    default: return 5000
  }
}

// Score de potentiel d'une ligne (tri par defaut de la V2) : combine la
// valeur estimee de la suggestion et la richesse du client. Echelle libre,
// seul l'ordre compte.
export function scorePotentiel(c, sug) {
  if (!sug) return 0
  const collecte = estimationCollecte(c, sug.famille_suggeree)
  const richesse = Math.min(2, (Number(c.revenus || 0) / 100000) + (Number(c.patrimoine || 0) / 500000))
  return Math.round(collecte * (1 + richesse))
}
