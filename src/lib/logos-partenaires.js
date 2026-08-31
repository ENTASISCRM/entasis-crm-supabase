// src/lib/logos-partenaires.js
// ═══════════════════════════════════════════════════════════════════════════
// LOGOS DES PARTENAIRES
//
// Les fichiers vivent dans src/assets/logos/ et sont recenses a la
// compilation : le CRM connait donc la liste exacte des logos disponibles et
// ne demande jamais un fichier absent (pas de rafale de 404 au chargement).
//
// Deliberement local : aucun service de logos exterieur n est appele, le CRM
// n a pas a signaler a un tiers avec qui le cabinet travaille.
// ═══════════════════════════════════════════════════════════════════════════

import { cleLogo } from '../config/annuairePartenaires'

const FICHIERS = import.meta.glob('../assets/logos/*.{svg,png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

const PAR_CLE = {}
for (const [chemin, url] of Object.entries(FICHIERS)) {
  const base = chemin.split('/').pop().replace(/\.[^.]+$/, '')
  PAR_CLE[base] = url
}

// URL du logo d une societe, ou null si le cabinet ne l a pas encore fourni.
export function logoDe(societe) {
  return PAR_CLE[cleLogo(societe)] || null
}

// Utile pour un ecran d administration ou un test.
export const logosDisponibles = () => Object.keys(PAR_CLE).sort()
