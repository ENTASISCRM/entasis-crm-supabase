// ═══════════════════════════════════════════════════════════════════════════
// ANNUAIRE DES PARTENAIRES
//
// Le carnet d adresses du cabinet : tout contact utile a un dossier client,
// classe par metier, visible par toute l equipe. Source : annuaire Asselio
// fourni par Louis (31/08/2026) + les partenaires deja presents dans le CRM.
//
// Regles de saisie :
//  * telephones : chaine affichee telle quelle, l appel retire les espaces
//  * emails : liste, vide si inconnu
//  * astuce : consigne pratique affichee sous le contact (serveur vocal...)
//  * referentImmo : le contact recoit les dossiers immobiliers depuis
//    l onglet Immobilier (bouton de renvoi affiche sur sa carte)
// ═══════════════════════════════════════════════════════════════════════════

export const CATEGORIES_ANNUAIRE = [
  {
    cle: 'immobilier',
    label: 'Immobilier',
    accroche: 'Les référents qui reçoivent vos dossiers et font le rendez-vous avec vous.',
  },
  {
    cle: 'juridique',
    label: 'Notaire & juridique',
    accroche: 'Pour verrouiller le volet juridique avant de lancer le dossier.',
  },
  {
    cle: 'assurance',
    label: 'Assureurs & santé',
    accroche: 'Souscriptions, modifications de garanties, suivi des contrats.',
  },
  {
    cle: 'investissement',
    label: 'Solutions d’investissement',
    accroche: 'SCPI, UCS, clubs deals, Girardin : le bon interlocuteur par maison.',
  },
  {
    cle: 'expertise',
    label: 'Conseil & expertise',
    accroche: 'Fiscalité et comptabilité, pour les dossiers qui sortent du cadre.',
  },
]

export const CONTACTS_ANNUAIRE = [
  // ── Immobilier ──────────────────────────────────────────────────────────
  {
    categorie: 'immobilier',
    societe: 'Althera Patrimoine',
    nom: 'Tanguy Barbosa',
    role: 'Référent immobilier neuf · VEFA, LMNP, LLI, PTZ, nue-propriété',
    telephones: ['+33 6 25 29 84 94'],
    emails: ['tbarbosa@althera-patrimoine.com'],
    referentImmo: true,
  },
  {
    categorie: 'immobilier',
    societe: 'François 1er',
    nom: 'Sébastien Hallard',
    role: 'Référent défiscalisation · Malraux, Monuments Historiques, déficit foncier, Denormandie',
    telephones: ['+33 6 29 39 43 70'],
    emails: ['shallard@francois1er.com'],
    referentImmo: true,
  },

  // ── Notaire & juridique ─────────────────────────────────────────────────
  {
    categorie: 'juridique',
    societe: 'Notaire partenaire',
    nom: 'Cédric Deplano',
    role: 'Actes, donations, successions, démembrement, SCI',
    telephones: ['+33 7 89 48 19 69'],
    emails: ['cedric.deplano@06001.notaires.fr'],
  },

  // ── Assureurs & santé ───────────────────────────────────────────────────
  {
    categorie: 'assurance',
    societe: 'SwissLife',
    nom: 'Service de Gestion Santé',
    role: 'Assurance santé · souscription santé collective et modification des garanties',
    telephones: ['03 28 52 11 55'],
    emails: ['souscription.prevsante@intermediaires-sl.fr'],
  },
  {
    categorie: 'assurance',
    societe: 'SwissLife',
    nom: 'Paul Tissot',
    role: 'Inspecteur vie · assurance vie',
    telephones: ['06 62 50 22 00'],
    emails: ['paul.tissot@swisslife.fr'],
  },
  {
    categorie: 'assurance',
    societe: 'SwissLife',
    nom: 'Courtiers Groupements',
    role: 'Épargne retraite individuelle',
    telephones: ['01 84 95 13 80'],
    emails: ['scv.courtiersgrouppements@swisslife.fr'],
    astuce: 'Serveur vocal : tapez 1 puis 4',
  },
  {
    categorie: 'assurance',
    societe: 'April',
    nom: 'Pôle Gestion Partenaires',
    role: 'Gestion des partenaires',
    telephones: ['04 87 94 04 06'],
    emails: ['partenaires.asp@aprill.com'],
  },
  {
    categorie: 'assurance',
    societe: 'Generali',
    nom: 'Ludovic Dasnoy',
    role: null,
    telephones: ['06 70 72 62 61'],
    emails: [],
  },

  // ── Solutions d investissement ──────────────────────────────────────────
  {
    categorie: 'investissement',
    societe: 'Asselio',
    nom: 'Sébastien Pesce',
    role: 'Contact général Asselio',
    telephones: ['06 09 45 64 50'],
    emails: ['sebastien.pesce@asseliopartenaires.com', 'contact@asseliopartenaires.com'],
  },
  {
    categorie: 'investissement',
    societe: 'Asselio',
    nom: 'Julien Renversé',
    role: 'Loi Girardin industriel',
    telephones: ['06 46 00 67 75'],
    emails: [],
  },
  {
    categorie: 'investissement',
    societe: 'Irbis',
    nom: 'Louis Sicouri',
    role: 'UCS',
    telephones: ['06 25 37 68 75'],
    emails: [],
  },
  {
    categorie: 'investissement',
    societe: 'I Kapital',
    nom: 'Eugénie Mussche',
    role: null,
    telephones: ['06 04 91 93 92'],
    emails: [],
  },
  {
    categorie: 'investissement',
    societe: 'Wemo Reim',
    nom: 'François Degouy',
    role: null,
    telephones: ['06 78 04 29 17'],
    emails: [],
  },
  {
    categorie: 'investissement',
    societe: 'SCPI Log In',
    nom: 'Clémentine Yahia-Gourdon',
    role: null,
    telephones: ['07 88 04 05 93'],
    emails: [],
  },
  {
    categorie: 'investissement',
    societe: 'SCPI Reason MNK',
    nom: 'Lucie Hostache',
    role: null,
    telephones: ['06 02 00 38 22', '01 40 67 01 20'],
    emails: [],
  },

  // ── Conseil & expertise ─────────────────────────────────────────────────
  {
    categorie: 'expertise',
    societe: 'Harlay Avocat',
    nom: 'Anouchka Belgrand',
    role: 'Avocate fiscalité',
    telephones: ['06 11 49 17 64'],
    emails: [],
  },
  {
    categorie: 'expertise',
    societe: 'Adezio',
    nom: 'Hugo Busuttil',
    role: 'Expert comptable',
    telephones: ['06 08 83 82 97'],
    emails: [],
  },
]

// Initiales pour l avatar : deux lettres du nom de la personne ou du service.
export const initialesContact = (nom) => {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase()
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase()
}
