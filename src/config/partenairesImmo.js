// ═══════════════════════════════════════════════════════════════════════════
// PARTENAIRES IMMOBILIER
//
// Entasis ne commercialise pas de lots. Le conseiller qualifie le besoin de
// son client, transmet le dossier au referent du partenaire concerne, et
// c est le referent qui prend la main : choix des lots sur son extranet,
// reservation, suivi jusqu a l acte.
//
// Deux partenaires officiels, un par metier.
// ═══════════════════════════════════════════════════════════════════════════

export const PARTENAIRES_IMMO = [
  {
    cle: 'althera',
    metier: 'Immobilier neuf',
    societe: 'Althera Patrimoine',
    referent: 'Tanguy Barbosa',
    email: 'tbarbosa@althera-patrimoine.com',
    telephone: '+33 6 25 29 84 94',
    accroche: 'VEFA, résidences principales et investissement locatif dans le neuf.',
    dispositifs: ['VEFA', 'LMNP', 'LLI', 'PTZ', 'Nue-propriété'],
    // Renseigner l URL de l extranet quand elle est connue : le bouton
    // « Ouvrir l extranet » n apparait que si elle est presente.
    extranet: null,
    site: null,
  },
  {
    cle: 'francois1er',
    metier: 'Immobilier de défiscalisation',
    societe: 'François 1er',
    referent: 'Sébastien Hallard',
    email: 'shallard@francois1er.com',
    telephone: '+33 6 29 39 43 70',
    accroche: 'Ancien à rénover et dispositifs patrimoniaux de défiscalisation.',
    dispositifs: ['Malraux', 'Monuments Historiques', 'Déficit foncier', 'Denormandie'],
    extranet: null,
    // Le partenaire publie ses programmes et leurs disponibilites sur son site.
    site: 'https://www.francois1er.com',
  },
]

export const partenaireDe = (cle) => PARTENAIRES_IMMO.find((p) => p.cle === cle) || null

// Le notaire du cabinet. Ce n est pas un partenaire commercial : pas de
// dispositifs, pas de dossiers transmis, pas de pipeline. On l appelle pour
// verrouiller le volet juridique d un dossier (acte, donation, succession,
// demembrement, SCI). L email n apparait que s il est renseigne.
export const NOTAIRE_PARTENAIRE = {
  role: 'Notaire partenaire',
  nom: 'Cédric Deplano',
  telephone: '+33 7 89 48 19 69',
  email: null,
  accroche: 'Actes, donations, successions, démembrement, SCI. Un point juridique avant de lancer le dossier évite de le refaire après.',
}

// Etapes du dossier une fois transmis. Volontairement courtes : c est le
// partenaire qui travaille, nous suivons seulement l avancement.
export const ETAPES_IMMO = [
  { cle: 'transmis', label: 'Transmis', aide: 'Envoyé au référent, en attente de prise en charge' },
  { cle: 'etude', label: 'À l étude', aide: 'Le référent travaille le dossier avec le client' },
  { cle: 'reserve', label: 'Réservé', aide: 'Un lot est réservé' },
  { cle: 'acte', label: 'Acté', aide: 'Acte signé, honoraires dus' },
  { cle: 'sans_suite', label: 'Sans suite', aide: 'Le client ne donne pas suite' },
]

export const etapeDe = (cle) => ETAPES_IMMO.find((e) => e.cle === cle) || ETAPES_IMMO[0]
