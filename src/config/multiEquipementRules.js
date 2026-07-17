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
