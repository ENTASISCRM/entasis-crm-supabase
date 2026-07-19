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
// Montant estime AVEC sa base explicite (transparence demandee par Louis :
// « pourquoi 10 k€, sur quelle base ? »). Renvoie { montant, base (texte
// affiche sous le montant), parDefaut (true = valeur forfaitaire faute de
// donnee, a afficher en grise pour ne pas faire croire a un vrai chiffre) }.
// Quand revenus ou patrimoine manquent, on retombe sur un forfait honnete.
export function baseMontant(c, famille) {
  const rev = Number(c.revenus || 0)
  const pat = Number(c.patrimoine || 0)
  const k = (n) => `${Math.round(n / 1000)} k€`
  switch (famille) {
    case 'prevoyance': return { montant: 1800, base: 'prime type 150 €/mois', parDefaut: false }
    case 'mutuelle': return { montant: 1200, base: 'prime type 100 €/mois', parDefaut: false }
    case 'per': return rev > 0
      ? { montant: Math.round(rev * 0.06), base: `6 % des revenus (${k(rev)})`, parDefaut: false }
      : { montant: 2400, base: 'forfait, revenus non renseignés', parDefaut: true }
    case 'av': return pat > 0
      ? { montant: Math.round(pat * 0.08), base: `8 % du patrimoine (${k(pat)})`, parDefaut: false }
      : { montant: 10000, base: 'forfait, patrimoine non renseigné', parDefaut: true }
    case 'scpi': return pat > 0
      ? { montant: Math.round(pat * 0.10), base: `10 % du patrimoine (${k(pat)})`, parDefaut: false }
      : { montant: 20000, base: 'forfait, patrimoine non renseigné', parDefaut: true }
    case 'immobilier': return { montant: 120000, base: 'ticket LMNP moyen', parDefaut: true }
    case 'structures': return { montant: 25000, base: 'ticket moyen structuré', parDefaut: true }
    default: return { montant: 5000, base: 'forfait', parDefaut: true }
  }
}

export function estimationCollecte(c, familleSuggeree) {
  return baseMontant(c, familleSuggeree).montant
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

// V3 : correspondance produit vers famille, miroir JS fidele de la fonction
// SQL equipment_famille utilisee par la vue client_equipment. Sert cote client
// a retrouver le dernier deal Signe d une famille pour la reconciliation des
// missions gagnees. L ordre des tests compte, il reproduit celui du SQL.
export function familleDuProduit(product) {
  if (!product) return 'autre'
  const p = String(product).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (p.includes('scpi')) return 'scpi'
  if (p.includes('private equity') || p.includes('private-equity')) return 'private_equity'
  if (p.includes('structur')) return 'structures'
  if (p.includes('assurance vie') || p === 'av') return 'av'
  if (p.includes('emprunteur')) return 'emprunteur'
  if (p.includes('prevoyance')) return 'prevoyance'
  if (p.includes('mutuelle') || p.includes('sante')) return 'mutuelle'
  if (p.includes('lmnp') || p.includes('immobil') || p.includes('monument') || p.includes('girardin') || p.includes('vefa')) return 'immobilier'
  if (p.includes('per') || p.includes('retraite') || p.includes('pero')) return 'per'
  return 'autre'
}

// V3 : raisons de report proposees dans la modale anti zap. La raison est
// obligatoire, c est le prix a payer pour dire plus tard.
export const RAISONS_REPORT = [
  'Client prevenu recemment',
  'Pas le bon moment fiscal',
  'Deja tente ce mois',
]

// V3 : echeances de report autorisees en jours. Pas de report sans date.
export const ECHEANCES_REPORT = [7, 30, 90]
