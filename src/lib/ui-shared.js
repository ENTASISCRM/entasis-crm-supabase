// src/lib/ui-shared.js
// Constantes et helpers UI partagés entre App.jsx et les composants extraits
// (DealsTable, PipelineBoard, etc.). Tout ce qui était redéclaré in-line
// auparavant.

export const MONTHS = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
export const STATUS_OPTIONS = ['Signé','En cours','Prévu','Annulé'];
export const PRIORITY_OPTIONS = ['Normale','Haute','Urgente'];
export const PRODUCTS = ['PER Individuel','PERO','Assurance Vie Française','Contrat de Capitalisation','SCPI','Produits Structurés','Private Equity','Prévoyance TNS','Mutuelle Santé','Assurance de Prêt','Autre'];
// Statut professionnel du client (structuré, obligatoire a la signature).
// Pilote les regles de cross-sell du module Multi-equipement (ex. TNS ou
// profession liberale sans prevoyance = opportunite).
export const STATUTS_PRO = ['Salarié','TNS','Chef d\'entreprise','Retraité','Profession libérale','Autre'];
export const COMPANIES = ['SwissLife','Abeille Assurances','Generali','Cardif (BNP Paribas)','Spirica','Autre'];
export const SOURCES = ['Téléprospection','Leads Facebook','Parrainage Client','Réseau Personnel','Site Web Entasis','LinkedIn','Autre'];

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
    // échouer l'insert sur la colonne date, on renvoie null.
    next_action: d.next_action ? String(d.next_action).trim() || null : null,
    next_action_date: d.next_action_date || null,
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
