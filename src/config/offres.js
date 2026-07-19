// ═══════════════════════════════════════════════════════════════════════════
// CATALOGUE D OFFRES COMMERCIALES  vague C, coeur des Playbooks
//
// Chaque offre est une campagne commerciale qui sait :
//   1  se decrire        titre, pitch client, argumentaire conseiller
//   2  reconnaitre sa cible dans la vraie base via un predicat cible(client)
//   3  estimer son potentiel   ticket_estime multiplie par le nombre de cibles
//
// Le predicat cible recoit un client ENRICHI (voir services/offres.enrichir) :
//   { statut, profession, revenus, patrimoine, familles[], nb_familles,
//     nb_enfants, age }
// famille_cible est une cle de product_families : c est la famille de la
// mission generee dans le moteur V3 Multi equipement au lancement de la
// campagne (statut a_attaquer, montant_estime = ticket_estime).
//
// Volontairement hors composant (config pure, sans React) pour que la
// direction ajuste seuils, tickets et argumentaires sans toucher a l UI.
// ═══════════════════════════════════════════════════════════════════════════

// Normalise un champ texte : minuscules, sans accents, trim. Sert aux tests
// tolerants sur le statut professionnel et la profession en texte libre.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Vrai si le client est un independant : TNS, chef d entreprise ou profession
// liberale. On se fie d abord au statut structure (fiable, obligatoire a la
// signature) puis on retombe sur la profession en texte libre pour la data
// historique sans statut.
function estIndependant(c) {
  const s = norm(c.statut)
  if (
    s === 'tns' ||
    s.includes('chef d') ||
    s.includes('entreprise') ||
    s.includes('liberal') ||
    s.includes('dirigeant')
  ) return true
  const p = norm(c.profession)
  return ['tns', 'independant', 'liberal', 'gerant', 'dirigeant', 'artisan', 'commercant', 'chef d', 'profession libe']
    .some((mot) => p.includes(mot))
}

// Statut inconnu = aucune donnee structuree exploitable (utilise par la nue
// propriete pour cibler les hauts patrimoines dont on ignore la TMI).
function statutInconnu(c) {
  const s = norm(c.statut)
  return s === '' || s === 'autre'
}

// Formatage compact d un montant pour les motifs affiches dans la liste des
// cibles (k€ au dela de mille).
function kEur(v) {
  const n = Number(v || 0)
  return n >= 1000 ? `${Math.round(n / 1000)} k€` : `${Math.round(n)} €`
}

// Vrai de septembre a decembre : la course au plafond fiscal PER bat son plein.
// Sert a poser un badge saison sur l offre de defiscalisation, sans jamais
// bloquer son calcul le reste de l annee.
function saisonFiscale() {
  return new Date().getMonth() >= 8
}

// ─── Les 8 offres de la vague C ─────────────────────────────────────────────
// Triees ici par idee ; le composant les reordonne par potentiel a l affichage.
export const OFFRES = [
  {
    id: 'pack_dirigeant_tns',
    idee: 54,
    titre: 'Pack Dirigeant TNS',
    famille_cible: 'prevoyance',
    pitch: 'Un arret de travail = zero revenu pour un independant : la prevoyance Madelin protege et se deduit du benefice imposable.',
    argumentaire: 'Cible les TNS, gerants et professions liberales sans prevoyance. Angle : protection du revenu plus deductibilite Madelin. Chiffrer la perte de revenu sur trois mois d arret marque les esprits.',
    ticket_estime: 1800,
    cible: (c) => estIndependant(c) && !c.familles.includes('prevoyance'),
    motif: (c) => `${c.statut || 'Independant'} sans prevoyance`,
  },
  {
    id: 'fonds_euro_structures',
    idee: 55,
    titre: 'Fonds euro plus Produits structures',
    famille_cible: 'structures',
    pitch: 'Vos liquidites d assurance vie meritent mieux que le fonds euro seul : un produit structure vise un rendement cible avec protection partielle du capital.',
    argumentaire: 'Cible les detenteurs d assurance vie avec du patrimoine (plus de 50 k€). Angle : diversifier une poche du contrat vers le structure du moment sans sortir de l enveloppe AV.',
    ticket_estime: 25000,
    cible: (c) => c.familles.includes('av') && c.patrimoine > 50000,
    motif: (c) => `Detient une AV, patrimoine ${kEur(c.patrimoine)}`,
  },
  {
    id: 'scpi_credit',
    idee: 56,
    titre: 'SCPI a credit',
    famille_cible: 'scpi',
    pitch: 'Avec vos revenus, la SCPI a credit genere du foncier finance par la banque et deduit les interets de vos revenus fonciers.',
    argumentaire: 'Cible les revenus superieurs a 80 k€ sans SCPI. Angle : effet de levier du credit plus revenus complementaires sans gestion locative. Preparer une simulation mensualite contre loyer net.',
    ticket_estime: 50000,
    cible: (c) => c.revenus > 80000 && !c.familles.includes('scpi'),
    motif: (c) => `Revenus ${kEur(c.revenus)}, sans SCPI`,
  },
  {
    id: 'parcours_vip',
    idee: 57,
    titre: 'Parcours VIP Gestion privee',
    famille_cible: 'av',
    pitch: 'Un accompagnement gestion privee dedie : allocation sur mesure, gestion pilotee et acces aux supports haut de gamme.',
    argumentaire: 'Cible premium : revenus superieurs a 150 k€ ou patrimoine superieur a 500 k€. Angle : montee en gamme de la relation, contrat AV luxembourgeois ou gestion sous mandat. A traiter en priorite.',
    ticket_estime: 100000,
    cible: (c) => c.revenus > 150000 || c.patrimoine > 500000,
    motif: (c) => (c.patrimoine > 500000 ? `Patrimoine ${kEur(c.patrimoine)}` : `Revenus ${kEur(c.revenus)}`),
    premium: true,
  },
  {
    id: 'defisc_fin_annee',
    idee: 58,
    titre: 'Defiscalisation fin d annee (PER)',
    famille_cible: 'per',
    pitch: 'Chaque versement PER avant le 31 decembre reduit votre impot des cette annee, a votre tranche marginale.',
    argumentaire: 'Cible les revenus superieurs a 60 k€ sans PER. Pertinent surtout de septembre a decembre pour la course au plafond, mais l economie d impot se chiffre toute l annee. Angle : versement deductible plus preparation retraite.',
    ticket_estime: 5000,
    cible: (c) => c.revenus > 60000 && !c.familles.includes('per'),
    motif: (c) => `Revenus ${kEur(c.revenus)}, sans PER`,
    enSaison: saisonFiscale,
  },
  {
    id: 'bilan_360',
    idee: 60,
    titre: 'Bilan patrimonial 360',
    famille_cible: 'autre',
    pitch: 'Un patrimoine consequent concentre sur un seul produit merite un audit complet : fiscalite, transmission, diversification.',
    argumentaire: 'Cible les mono equipes (zero ou une famille) avec patrimoine superieur a 200 k€. Angle : audit 360 offert qui revele les angles morts et ouvre naturellement le multi equipement.',
    ticket_estime: 5000,
    cible: (c) => c.nb_familles <= 1 && c.patrimoine > 200000,
    motif: (c) => `${c.nb_familles} famille${c.nb_familles > 1 ? 's' : ''} detenue${c.nb_familles > 1 ? 's' : ''}, patrimoine ${kEur(c.patrimoine)}`,
  },
  {
    id: 'nue_propriete',
    idee: 65,
    titre: 'Nue propriete SCPI',
    famille_cible: 'scpi',
    pitch: 'Acheter la nue propriete de SCPI avec une decote : aucun revenu imposable pendant le demembrement, pleine propriete a terme.',
    argumentaire: 'Cible les hauts patrimoines (plus de 300 k€) a forte TMI, statut inconnu ou revenus superieurs a 100 k€. Angle : zero fiscalite pendant le demembrement, ideal pour les tranches hautes sans besoin de revenus immediats.',
    ticket_estime: 60000,
    cible: (c) => c.patrimoine > 300000 && (statutInconnu(c) || c.revenus > 100000),
    motif: (c) => `Patrimoine ${kEur(c.patrimoine)}${c.revenus > 100000 ? `, revenus ${kEur(c.revenus)}` : ''}`,
    premium: true,
  },
  {
    id: 'delegation_emprunteur',
    idee: 66,
    titre: 'Delegation d assurance emprunteur',
    famille_cible: 'emprunteur',
    pitch: 'L assurance emprunteur de la banque est souvent deux fois trop chere : la deleguer, c est la meme protection pour bien moins cher.',
    argumentaire: 'Cible large : tout client peut avoir un credit immobilier. Ticket faible mais volume eleve et excellent produit d appel pour reprendre contact. Question d ouverture : avez vous un pret en cours ?',
    ticket_estime: 800,
    cible: () => true,
    motif: () => 'Credit immobilier possible',
  },
]

// Acces direct a une offre par son id.
export function offreParId(id) {
  return OFFRES.find((o) => o.id === id) || null
}
