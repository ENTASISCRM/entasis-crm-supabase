// src/lib/ui-shared.js
// Constantes et helpers UI partagés entre App.jsx et les composants extraits
// (DealsTable, PipelineBoard, etc.). Tout ce qui était redéclaré in-line
// auparavant.

export const MONTHS = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
export const STATUS_OPTIONS = ['Signé','En cours','Prévu','Annulé'];
export const PRIORITY_OPTIONS = ['Normale','Haute','Urgente'];
export const PRODUCTS = ['PER Individuel','PERO','Assurance Vie Française','Contrat de Capitalisation','SCPI','Produits Structurés','Private Equity','Prévoyance TNS','Mutuelle Santé','Assurance de Prêt','Bilan Patrimonial','Autre'];

// Produits rémunérés sur un montant libre, et non sur un pourcentage d'une
// prime : le montant se saisit dans le champ PU, il constitue à lui seul
// l'assiette, et il est partagé à parts égales avec le cabinet.
//   • Assurance de Prêt   → frais de dossier fixés par le cabinet (Louis 24/08)
//   • Bilan Patrimonial   → honoraires fixés par le conseiller  (Louis 24/08)
// Le barème correspondant vit côté serveur (api/_lib/bareme-entasis.js) ;
// un test vérifie que les deux listes ne divergent pas.
export const PRODUITS_HONORAIRES = ['Assurance de Prêt', 'Bilan Patrimonial'];

// Qui fixe le montant, pour le dire dans le formulaire sans se tromper.
export const LIBELLE_MONTANT_HONORAIRES = {
  'Assurance de Prêt': {
    champ: 'Frais de dossier (€)',
    aide: 'Montant fixé par le cabinet et facturé au client.',
  },
  'Bilan Patrimonial': {
    champ: 'Honoraires (€)',
    aide: 'Montant fixé librement par le conseiller qui vend le bilan.',
  },
};

export const estProduitHonoraires = (produit) => PRODUITS_HONORAIRES.includes(produit);
// Statut professionnel du client (structuré, obligatoire a la signature).
// Pilote les regles de cross-sell du module Multi-equipement (ex. TNS ou
// profession liberale sans prevoyance = opportunite).
export const STATUTS_PRO = ['Salarié','TNS','Chef d\'entreprise','Retraité','Profession libérale','Autre'];
export const COMPANIES = ['SwissLife','Abeille Assurances','Generali','Cardif (BNP Paribas)','Spirica','Autre'];
// La compagnie depend du produit : une SCPI ne se souscrit pas chez un
// assureur vie. Les partenaires SCPI du cabinet sont Wemo One et MNK, et eux
// seuls doivent apparaitre quand le conseiller choisit SCPI.
export const COMPANIES_PAR_PRODUIT = {
  'SCPI': ['Wemo One', 'MNK', 'Autre'],
};
// Options du select « Compagnie » pour un produit donne. La valeur deja
// enregistree est toujours proposee, meme hors liste : sinon un dossier
// existant afficherait un select vide et la premiere sauvegarde effacerait sa
// compagnie (meme piege que « lead_room » cote sources).
export const compagniesPour = (produit, valeurActuelle) => {
  const base = COMPANIES_PAR_PRODUIT[produit] || COMPANIES;
  return (valeurActuelle && !base.includes(valeurActuelle)) ? [valeurActuelle, ...base] : base;
};
// « lead_room » est la valeur ecrite par la Lead Room elle meme sur les
// brouillons de RDV. Elle ne figurait pas dans cette liste : le select
// s affichait vide sur 210 dossiers, et la moindre sauvegarde la remplacait
// par « Teleprospection ». On la garde telle quelle en base (la Lead Room
// ecrit dedans) et on lui donne un libelle lisible, comme pour STATUS_LABEL.
export const SOURCES = ['Téléprospection','Leads Facebook','Parrainage Client','Réseau Personnel','Site Web Entasis','LinkedIn','Autre'];
export const SOURCE_LABEL = { lead_room: 'Lead Room' };
export const sourceLabel = (s) => SOURCE_LABEL[s] || s;

// Options du select de source pour un dossier donné. « Lead Room » n'est pas
// un choix : c'est le pont qui l'écrit quand un lead prend rendez-vous. On
// l'ajoute donc seulement pour un dossier qui la porte déjà, pour qu'il
// s'affiche au lieu d'un champ vide, sans permettre de la choisir ailleurs
// (un dossier réseau personnel rangé en Lead Room fausserait le coût par
// signature et par campagne).
export const sourcesPour = (source) =>
  (source && !SOURCES.includes(source)) ? [source, ...SOURCES] : SOURCES;

export const STATUS_CLASS = {
  'Signé': 'badge badge-signed',
  'En cours': 'badge badge-progress',
  'Prévu': 'badge badge-forecast',
  'Annulé': 'badge badge-cancelled',
};

// Libelle d'affichage des statuts (la valeur en base reste inchangee). "Prévu"
// est en realite le brouillon cree automatiquement quand un RDV est cale en Lead
// Room, d'ou le libelle plus clair "RDV calé" cote interface.
export const STATUS_LABEL = {
  'Prévu': 'RDV calé',
};
export const statusLabel = (s) => STATUS_LABEL[s] || s;
export const PRIORITY_CLASS = {
  'Urgente': 'badge badge-urgent',
  'Haute': 'badge badge-high',
  'Normale': 'badge badge-normal',
};

// ─── Helpers de formatage ───
export const euro = (v) =>
  Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const pct = (v, t) =>
  t > 0 ? Math.min(999, Math.round((v / t) * 100)) : 0;

export const initials = (name) =>
  (name || '').split(' ').slice(0, 2).map(n => n[0] || '').join('').toUpperCase() || '?';

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `deal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const currentMonth = () => MONTHS[new Date().getMonth()] || 'MARS';

export function getClientName(deal) {
  return deal?.clients?.nom || deal?.client || 'Client';
}

// Nom affichable d'une ligne `clients`. La saisie est hétérogène : 330 fiches
// sur 379 ont `prenom` vide et tout le nom dans `nom` (« Aurélie buiret »),
// 49 seulement ont les deux champs séparés. Un `{prenom} {nom}` littéral
// produisait donc une espace en tête sur 330 lignes de l'annuaire.
export const nomClient = (c) =>
  [c?.prenom, c?.nom].map(v => String(v || '').trim()).filter(Boolean).join(' ') || '—';

// Tout ce par quoi on peut chercher un client, en une chaîne. Le téléphone y
// figure deux fois : tel que saisi (« 06 12 34 56 78 ») et en chiffres collés,
// pour qu'un numéro tapé d'une traite trouve une fiche saisie avec des espaces.
export const texteRechercheClient = (c) => [
  c?.prenom, c?.nom, c?.email, c?.telephone,
  String(c?.telephone || '').replace(/\D/g, ''),
  c?.advisor_code, c?.co_advisor_code,
].filter(Boolean).join(' ');

export function emptyDeal(code = '') {
  return {
    id: uid(),
    month: currentMonth(),
    client: '',
    product: 'PER Individuel',
    pp_m: 0,
    pu: 0,
    frais_entree_pp_pct: 1.0,  // % frais d'entrée saisi pour la PP (1-4 %)
    frais_entree_pu_pct: 1.0,  // % frais d'entrée saisi pour la PU (1-4 %)
    is_ordre_placement: false, // true = transfert / replacement → pas de commission
    advisor_code: code || '',
    co_advisor_code: '',
    source: 'Téléprospection',
    status: 'En cours',
    company: '',
    notes: '',
    priority: 'Normale',
    tags: [],
    date_expected: '',
    date_signed: '',
    client_phone: '',
    client_email: '',
    client_age: '',
  };
}

export function normalizeDeal(d) {
  // Les champs « prochaine action » ne sont normalisés QUE s'ils sont présents
  // dans l'objet source : les injecter à null systématiquement effacerait la
  // valeur enregistrée lors d'une sauvegarde partielle (reprise de brouillon).
  const prochaineAction = {};
  if ('next_action' in d) {
    prochaineAction.next_action = d.next_action ? String(d.next_action).trim() || null : null;
  }
  if ('next_action_date' in d) {
    prochaineAction.next_action_date = d.next_action_date || null;
  }
  // B2 : la séquence de relance suit la même règle. sequence_etape est un
  // integer en base, une chaîne vide y ferait échouer l'écriture.
  if ('sequence_key' in d) {
    prochaineAction.sequence_key = d.sequence_key ? String(d.sequence_key).trim() || null : null;
  }
  if ('sequence_etape' in d) {
    prochaineAction.sequence_etape = d.sequence_etape === '' || d.sequence_etape == null ? null : Number(d.sequence_etape);
  }
  return {
    ...d,
    pp_m: Number(d.pp_m || 0),
    pu: Number(d.pu || 0),
    // Normalise les 2 frais. Fallback sur l'ancienne colonne frais_entree_pct
    // pour les deals créés avant la séparation PP/PU.
    frais_entree_pp_pct: d.frais_entree_pp_pct != null
      ? Number(d.frais_entree_pp_pct)
      : (d.frais_entree_pct != null ? Number(d.frais_entree_pct) : 1.0),
    frais_entree_pu_pct: d.frais_entree_pu_pct != null
      ? Number(d.frais_entree_pu_pct)
      : (d.frais_entree_pct != null ? Number(d.frais_entree_pct) : 1.0),
    is_ordre_placement: !!d.is_ordre_placement,
    client_age: d.client_age === '' || d.client_age == null ? null : Number(d.client_age),
    // D3 : colonnes `text` et `date` en base — une chaîne vide ferait
    // échouer l'insert sur la colonne date, on renvoie null (voir plus haut).
    ...prochaineAction,
  };
}

// Message d'erreur lisible pour l'UI (Série D / finition) : les erreurs
// réseau brutes du navigateur («TypeError: Failed to fetch»,
// «NetworkError…») deviennent une phrase française ; tout autre message
// passe tel quel. Toujours passer par ici avant d'afficher un e.message.
export function messageErreur(e) {
  const brut = typeof e === 'string' ? e : (e?.message || '')
  if (/failed to fetch|networkerror|load failed|fetch failed|network request failed|err_network|err_internet/i.test(brut)) {
    return 'Connexion impossible — vérifiez votre réseau et réessayez.'
  }
  return brut || 'Une erreur est survenue.'
}

// ─── Dates de rendez-vous venues de la Lead Room ──────────────────────────
// La Lead Room écrit une date complète dans `date_expected`
// (2026-09-16T10:30:00+00:00) : c'est une heure de rendez-vous, pas un jour de
// signature. Un `<input type="date">` n'accepte que YYYY-MM-DD et affiche un
// champ VIDE si on lui passe autre chose — 167 dossiers apparaissaient donc
// sans date, surlignés « obligatoire », alors que la date existait.
//
// Piège : cet instant est en UTC. Le RDV de 12h30 à Paris est stocké
// 10:30:00+00:00, et c'est bien 12h30 que le client a reçu dans son mail de
// confirmation. Découper la chaîne afficherait donc 10h30 au conseiller, deux
// heures avant l'heure dite. Tout passe par Europe/Paris, jamais par un
// slice.

const PARIS = 'Europe/Paris';
const aInstant = (v) => /T\d{2}:\d{2}/.test(String(v || ''));

// Le jour tel qu'on le vit à Paris, au format attendu par un input date.
export const jourDe = (valeur) => {
  const brut = String(valeur || '');
  if (!brut) return '';
  if (!aInstant(brut)) return brut.slice(0, 10);
  const d = new Date(brut);
  if (Number.isNaN(d.getTime())) return brut.slice(0, 10);
  // 'fr-CA' rend YYYY-MM-DD, le seul format qu'accepte un input date.
  return d.toLocaleDateString('fr-CA', { timeZone: PARIS });
};

// L'heure de rendez-vous à Paris (HH'h'MM), ou null si la valeur n'en porte pas.
export const heureDe = (valeur) => {
  const brut = String(valeur || '');
  if (!aInstant(brut)) return null;
  const d = new Date(brut);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', timeZone: PARIS,
  }).replace(':', 'h');
};

// Décalage de Paris à cette date, en minutes (60 en hiver, 120 en été).
// Recomposer un instant sans lui casse l'heure au passage été/hiver : un RDV
// de septembre déplacé en décembre glisserait d'une heure.
function decalageParis(instant) {
  const local = new Date(instant.toLocaleString('en-US', { timeZone: PARIS }));
  const utc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}

// Nouveau jour choisi par le conseiller, en gardant l'HEURE DE PARIS d'origine.
// Déplacer un rendez-vous ne doit ni l'effacer ni le décaler.
export const avecHeureConservee = (nouveauJour, valeurOrigine) => {
  if (!nouveauJour) return '';
  if (!aInstant(valeurOrigine)) return nouveauJour;
  const origine = new Date(String(valeurOrigine));
  if (Number.isNaN(origine.getTime())) return nouveauJour;

  const [hh, mm] = (heureDe(valeurOrigine) || '00h00').split('h').map(Number);
  const [a, mo, j] = nouveauJour.split('-').map(Number);
  // On vise l'heure de Paris : on part de l'instant UTC naïf, puis on retire
  // le décalage réellement en vigueur ce jour-là.
  const naif = Date.UTC(a, mo - 1, j, hh, mm, 0);
  const decalage = decalageParis(new Date(naif));
  return new Date(naif - decalage * 60000).toISOString();
};
