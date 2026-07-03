// src/lib/contrat-enums.js
// Enums d affichage des types de contrat. AUCUN taux ici (contrairement a
// bareme-entasis.js qui contient BAREME_PRODUITS et reste cote serveur).
// Ce module est importe par les composants client (Remuneration, PilotageRH)
// pour les libelles, sans tirer le bareme dans le bundle navigateur.
// Correctif audit securite 2026-07-03 (marge cabinet reservee a la direction).

export const TYPES_CONTRAT = ['CDI', 'CDD', 'ALTERNANT', 'STAGIAIRE', 'MANDATAIRE', 'GERANT']

export const LIBELLE_TYPE_CONTRAT = {
  CDI:        'CDI',
  CDD:        'CDD',
  ALTERNANT:  'Alternant',
  STAGIAIRE:  'Stagiaire',
  MANDATAIRE: 'Mandataire',
  GERANT:     'Gérant',
}
