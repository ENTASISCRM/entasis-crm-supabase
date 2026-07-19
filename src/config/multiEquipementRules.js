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
// Moteur d estimation calibre (remplace le « ≈ defaut » plat). Renvoie, en plus
// du montant et de sa base, un niveau de CONFIANCE et une FOURCHETTE bas/haut :
//   fort   la donnee client pilote le calcul (revenus ou patrimoine renseignes)
//   moyen  montant standard credible (prime type, ticket moyen d une classe)
//   faible forfait faute de donnee (a preciser via la capture inline)
// La fourchette s elargit quand la confiance baisse. Aucune promesse de
// rendement : ce sont des ordres de grandeur de collecte, affiches avec « ~ ».
export function baseMontant(c, famille) {
  const rev = Number(c.revenus || 0)
  const pat = Number(c.patrimoine || 0)
  const k = (n) => `${Math.round(n / 1000)} k€`
  let montant; let base; let parDefaut; let confiance
  switch (famille) {
    case 'prevoyance': montant = 1800; base = 'prime type 150 €/mois'; parDefaut = false; confiance = 'moyen'; break
    case 'mutuelle': montant = 1200; base = 'prime type 100 €/mois'; parDefaut = false; confiance = 'moyen'; break
    case 'per':
      if (rev > 0) { montant = Math.round(rev * 0.06); base = `6 % des revenus (${k(rev)})`; parDefaut = false; confiance = 'fort' }
      else { montant = 2400; base = 'forfait, revenus à préciser'; parDefaut = true; confiance = 'faible' }
      break
    case 'av':
      if (pat > 0) { montant = Math.round(pat * 0.08); base = `8 % du patrimoine (${k(pat)})`; parDefaut = false; confiance = 'fort' }
      else { montant = 10000; base = 'forfait, patrimoine à préciser'; parDefaut = true; confiance = 'faible' }
      break
    case 'scpi':
      if (pat > 0) { montant = Math.round(pat * 0.10); base = `10 % du patrimoine (${k(pat)})`; parDefaut = false; confiance = 'fort' }
      else { montant = 20000; base = 'forfait, patrimoine à préciser'; parDefaut = true; confiance = 'faible' }
      break
    case 'immobilier': montant = 120000; base = 'ticket LMNP moyen'; parDefaut = true; confiance = 'moyen'; break
    case 'structures': montant = 25000; base = 'ticket moyen structuré'; parDefaut = true; confiance = 'moyen'; break
    case 'private_equity': montant = 50000; base = 'ticket moyen non coté'; parDefaut = true; confiance = 'moyen'; break
    default: montant = 5000; base = 'forfait'; parDefaut = true; confiance = 'faible'
  }
  const amp = confiance === 'fort' ? 0.2 : confiance === 'moyen' ? 0.3 : 0.45
  const arr = (n) => Math.max(0, Math.round(n / 1000) * 1000)
  return { montant, base, parDefaut, confiance, bas: arr(montant * (1 - amp)), haut: arr(montant * (1 + amp)) }
}

export function estimationCollecte(c, familleSuggeree) {
  return baseMontant(c, familleSuggeree).montant
}

// TMI marginale indicative (barème simplifié célibataire) à partir du revenu.
function tmiApprox(revenus) {
  const r = Number(revenus || 0)
  if (r <= 11294) return 0
  if (r <= 28797) return 0.11
  if (r <= 82341) return 0.30
  if (r <= 177106) return 0.41
  return 0.45
}

// Chiffrage INDICATIF montrable au client par famille (#1). Jamais une
// performance : chaque valeur porte une mention prudente et reste distincte de
// l estimation interne de collecte. Renvoie { libelle, mention } ou null.
export function simulationIndicative(c, famille) {
  const rev = Number(c.revenus || 0)
  const pat = Number(c.patrimoine || 0)
  const eur = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`
  switch (famille) {
    case 'per': {
      if (rev <= 0) return null
      const versement = Math.round(rev * 0.10)
      const eco = Math.round(versement * tmiApprox(rev))
      return { libelle: `Versement de ${eur(versement)} : environ ${eur(eco)} d économie d impôt cette année`, mention: 'Estimation indicative, selon votre tranche marginale' }
    }
    case 'prevoyance':
      if (rev <= 0) return null
      return { libelle: `En cas d arrêt de travail, environ ${eur(rev)} de revenus annuels à protéger`, mention: 'Ordre de grandeur, hors régime obligatoire' }
    case 'av':
      return { libelle: 'Jusqu à 152 500 € transmissibles par bénéficiaire, hors droits de succession', mention: 'Cadre fiscal en vigueur, sous conditions' }
    case 'mutuelle':
      return { libelle: 'Souvent une cotisation allégée à garanties égales, après comparatif', mention: 'À chiffrer sur votre contrat actuel' }
    case 'emprunteur':
      return { libelle: 'Délégation d assurance de prêt : économie fréquente à protection équivalente', mention: 'À chiffrer sur votre tableau d amortissement' }
    case 'scpi':
      if (pat <= 0) return null
      return { libelle: 'Diversification en immobilier professionnel, sans gestion, sur une part de vos avoirs', mention: 'Aucune garantie de rendement ni de capital' }
    case 'immobilier':
      return { libelle: 'Location meublée : loyers dont l imposition reste contenue par l amortissement', mention: 'Selon votre situation' }
    case 'structures':
      return { libelle: 'Protection partielle du capital selon des conditions définies à l avance', mention: 'Aucune garantie de rendement' }
    default: return null
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
