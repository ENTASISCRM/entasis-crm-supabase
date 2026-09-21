// tests/visuel/harnais-academy.mjs
//
// Jeux de donnees fictifs d’Entasis Academy pour le controle visuel.
//
// Les ecrans de formation ne lisent presque rien en direct dans les tables :
// ils appellent des fonctions SQL (academy_catalogue, academy_module,
// academy_mon_parcours, academy_demarrer_entrainement, academy_pilotage...)
// qui rendent un objet JSON deja assemble. Ce fichier reproduit ces reponses,
// dans la forme exacte des fonctions de
// supabase/migrations/20260921_academy_6_entrainement.sql (mode
// entrainement : decks d’items, sessions de douze exercices, repetition
// espacee, XP, serie, couronnes). Les corriges ne sont jamais servis : une
// session ouverte ne contient que les enonces (choix deja melanges), la
// correction n’arrive qu’avec academy_repondre, comme en vrai.
//
// Tout est invente : decks, exercices, personnes, scores. Aucune donnee
// reelle, aucune remuneration.

const JOUR = 86400000
const iso = (decalageJours, heure = '09:00:00') => {
  const d = new Date(Date.now() + decalageJours * JOUR)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${heure}Z`
}
const jour = (decalageJours) => iso(decalageJours).slice(0, 10)
const AUJOURDHUI = jour(0)
// Le lundi de la semaine d’un decalage en jours (pour les series par semaine).
const lundi = (decalageJours) => {
  const d = new Date(Date.now() + decalageJours * JOUR)
  const j = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - j)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Decks publies (trois) et un brouillon ────────────────────────────────────
export const MODULES = [
  {
    module_id: 'am1', slug: 'methode-entasis', titre: 'La méthode Entasis', theme: 'methode', niveau: 'decouverte', ordre: 1,
    version_id: 'av1', numero: 2, objectif: 'Savoir dérouler les cinq temps d’un accompagnement, du premier appel au suivi.',
    competence: 'Dérouler la méthode du cabinet', duree_minutes: 8, prerequis: [], nb_items: 12, publie_le: iso(-40),
  },
  {
    module_id: 'am2', slug: 'per-et-retraite', titre: 'PER et retraite', theme: 'per-retraite', niveau: 'fondamentaux', ordre: 3,
    version_id: 'av2', numero: 1, objectif: 'Expliquer le PER à un client, ses cas de sortie et sa fiscalité à l’entrée.',
    competence: 'Expliquer le PER', duree_minutes: 10, prerequis: ['methode-entasis'], nb_items: 40, publie_le: iso(-30),
  },
  {
    module_id: 'am3', slug: 'assurance-vie', titre: 'Assurance vie', theme: 'assurance-vie', niveau: 'fondamentaux', ordre: 4,
    version_id: 'av3', numero: 1, objectif: 'Situer l’assurance vie dans une stratégie patrimoniale.',
    competence: 'Situer l’assurance vie', duree_minutes: 10, prerequis: ['methode-entasis'], nb_items: 36, publie_le: iso(-20),
  },
]

const MEMO_MD = `## Les cinq temps

Un accompagnement Entasis se déroule en cinq temps, toujours dans le même ordre :

1. **Le premier appel** : on écoute, on ne vend rien.
2. **La découverte** : la situation, les objectifs, l horizon.
3. **La proposition** : une solution, expliquée avec ses limites.
4. **La signature** : le dossier complet, la fiche client à jour.
5. **Le suivi** : un point à trois mois, puis chaque année.

> Cas fictif : Camille Exemple appelle après une publicité. Le conseiller prend rendez vous sans parler produit. C’est le premier temps.

### Ce qu’il faut retenir

Le client ne doit jamais découvrir un produit avant que le cabinet ait compris sa situation.
`

// Maitrise du collaborateur simule : le deck 1 est valide (trois couronnes),
// le deck 2 en cours (une couronne, des exercices dus), le deck 3 pas ouvert.
const MAITRISE = {
  av1: { couronnes: 3, items_vus: 12, items_dus: 2, xp: 610, sessions: 9, derniere_session: iso(-1), valide_le: iso(-33) },
  av2: { couronnes: 1, items_vus: 24, items_dus: 5, xp: 320, sessions: 4, derniere_session: iso(-2), valide_le: null },
  av3: { couronnes: 0, items_vus: 0, items_dus: 0, xp: 0, sessions: 0, derniere_session: null, valide_le: null },
}

const AFFECTATIONS = {
  av1: { id: 'aa1', statut: 'valide', echeance: jour(-20), obligatoire: true, parcours_id: 'ap1' },
  av2: { id: 'aa2', statut: 'en_cours', echeance: jour(5), obligatoire: true, parcours_id: 'ap1' },
  av3: { id: 'aa3', statut: 'non_commence', echeance: jour(-3), obligatoire: true, parcours_id: 'ap2' },
}

const SESSIONS = [
  { id: 'ae5', version_id: 'av1', slug: 'methode-entasis', titre: 'La méthode Entasis', demarree_le: iso(-1, '08:00:00'), terminee_le: iso(-1, '08:06:00'), nb_bons: 12, nb_total: 12, xp: 150 },
  { id: 'ae4', version_id: 'av2', slug: 'per-et-retraite', titre: 'PER et retraite', demarree_le: iso(-2, '08:00:00'), terminee_le: iso(-2, '08:07:00'), nb_bons: 8, nb_total: 12, xp: 90 },
  { id: 'ae3', version_id: 'av2', slug: 'per-et-retraite', titre: 'PER et retraite', demarree_le: iso(-3, '18:00:00'), terminee_le: iso(-3, '18:08:00'), nb_bons: 7, nb_total: 12, xp: 80 },
  { id: 'ae2', version_id: 'av1', slug: 'methode-entasis', titre: 'La méthode Entasis', demarree_le: iso(-9, '08:00:00'), terminee_le: iso(-9, '08:05:00'), nb_bons: 11, nb_total: 12, xp: 120 },
  { id: 'ae1', version_id: 'av1', slug: 'methode-entasis', titre: 'La méthode Entasis', demarree_le: iso(-34, '10:00:00'), terminee_le: iso(-34, '10:09:00'), nb_bons: 6, nb_total: 12, xp: 70 },
]

const ITEMS_FAIBLES = [
  { item_id: 'ai7', version_id: 'av2', titre_module: 'PER et retraite', slug: 'per-et-retraite', competence: 'Plafonds de déduction', enonce_court: 'Le plafond de déduction du PER se calcule sur le revenu…', force: 1, prochaine_le: iso(-1) },
  { item_id: 'ai8', version_id: 'av2', titre_module: 'PER et retraite', slug: 'per-et-retraite', competence: 'Sortie du PER', enonce_court: 'La sortie en capital d’un PER est possible…', force: 2, prochaine_le: iso(2) },
  { item_id: 'ai3', version_id: 'av1', titre_module: 'La méthode Entasis', slug: 'methode-entasis', competence: 'Le suivi', enonce_court: 'Quand a lieu le premier point de suivi ?', force: 2, prochaine_le: iso(-3) },
]

const ATTESTATION_AV1 = { numero: 'EA-2026-0007', delivree_le: iso(-33), score: 3, total: 5 }

const catalogue = () => MODULES.map((m) => ({
  ...m,
  affectation: AFFECTATIONS[m.version_id] || null,
  couronnes: MAITRISE[m.version_id].couronnes,
  items_vus: MAITRISE[m.version_id].items_vus,
  items_dus: MAITRISE[m.version_id].items_dus,
  xp: MAITRISE[m.version_id].xp,
  valide_le: MAITRISE[m.version_id].valide_le,
}))

function module(slug) {
  const m = MODULES.find((x) => x.slug === slug)
  if (!m) return null
  const k = MAITRISE[m.version_id]
  const valide = !!k.valide_le
  return {
    module_id: m.module_id, slug: m.slug, titre: m.titre, theme: m.theme, niveau: m.niveau, version_id: m.version_id, numero: m.numero,
    objectif: m.objectif, competence: m.competence, duree_minutes: m.duree_minutes, prerequis: m.prerequis,
    memo_md: m.version_id === 'av3' ? '' : MEMO_MD,
    sources: [{ titre: 'Charte de la méthode Entasis', url: null, emetteur: 'Entasis Conseil', date_consultation: '2026-09-01', date_validite: null, ce_qu_elle_etablit: 'Les cinq temps' }],
    relu_par: 'Direction Démo', relu_le: iso(-41), publie_le: m.publie_le,
    nb_items: m.nb_items, couronnes: k.couronnes, items_vus: k.items_vus, items_dus: k.items_dus, xp: k.xp,
    competences: m.version_id === 'av1'
      ? [{ competence: 'Le suivi', nb: 3, force_moyenne: 2.3 }, { competence: 'Le premier appel', nb: 4, force_moyenne: 3.5 }, { competence: 'Les cinq temps', nb: 5, force_moyenne: 4.4 }]
      : m.version_id === 'av2'
        ? [{ competence: 'Plafonds de déduction', nb: 12, force_moyenne: 1.2 }, { competence: 'Sortie du PER', nb: 14, force_moyenne: 1.9 }, { competence: 'À qui le proposer', nb: 14, force_moyenne: 0.4 }]
        : [{ competence: 'Le cadre général', nb: 12, force_moyenne: 0 }, { competence: 'Fiscalité des retraits', nb: 12, force_moyenne: 0 }, { competence: 'Clause bénéficiaire', nb: 12, force_moyenne: 0 }],
    sessions: SESSIONS.filter((s) => s.version_id === m.version_id).map(({ id, demarree_le, terminee_le, nb_bons, nb_total, xp }) => ({ id, demarree_le, terminee_le, nb_bons, nb_total, xp })),
    affectation: AFFECTATIONS[m.version_id] ? (({ id, statut, echeance, obligatoire }) => ({ id, statut, echeance, obligatoire }))(AFFECTATIONS[m.version_id]) : null,
    validation: valide ? { valide_le: k.valide_le } : null,
    attestation: valide ? ATTESTATION_AV1 : null,
    entrainement_ouvert: null,
    duree_active_s: valide ? 1980 : (m.version_id === 'av2' ? 640 : 0),
  }
}

const SERIE = { serie: 4, meilleure: 9, dernier_jour: jour(-1), objectif_quotidien: 2, sessions_aujourdhui: 0, objectif_atteint: false, en_danger: true }

const monParcours = () => ({
  aujourdhui: AUJOURDHUI,
  serie: SERIE,
  xp: { total: 930, aujourdhui: 0, semaine: 320 },
  items_dus: 7,
  affectations: MODULES.map((m) => {
    const a = AFFECTATIONS[m.version_id]
    const k = MAITRISE[m.version_id]
    return {
      id: a.id, module_id: m.module_id, version_id: m.version_id, parcours_id: a.parcours_id,
      parcours_titre: a.parcours_id === 'ap1' ? 'Intégration, 30 jours' : 'Fondamentaux du conseiller',
      obligatoire: a.obligatoire, echeance: a.echeance, statut: a.statut, en_retard: a.statut !== 'valide' && a.echeance < AUJOURDHUI,
      slug: m.slug, titre: m.titre, theme: m.theme, niveau: m.niveau, duree_minutes: m.duree_minutes,
      nb_items: m.nb_items, couronnes: k.couronnes, items_vus: k.items_vus, items_dus: k.items_dus,
      xp: k.xp, sessions: k.sessions, derniere_session: k.derniere_session,
      valide_le: k.valide_le, version_statut: 'publie', created_at: iso(-45),
    }
  }),
  dernieres_reussites: [{ version_id: 'av1', titre: 'La méthode Entasis', slug: 'methode-entasis', valide_le: iso(-33), attestation: ATTESTATION_AV1.numero }],
  temps_actif_s: 2620, temps_actif_7j_s: 640,
  notice_donnees: 'Le CRM enregistre le temps réellement actif pendant une session (chaque réponse vaut un battement) par intervalles ; les détails sont conservés douze mois puis résumés par jour. La direction voit vos couronnes, vos sessions et votre temps par deck. Aucune donnée n’est transmise hors du cabinet.',
  retention_intervalles_mois: 12,
})

const mesResultats = () => ({
  serie: SERIE.serie, meilleure: SERIE.meilleure, xp_total: 930,
  sessions: SESSIONS,
  semaines: [
    { semaine: lundi(-28), xp: 70, sessions: 1 },
    { semaine: lundi(-21), xp: 0, sessions: 0 },
    { semaine: lundi(-14), xp: 120, sessions: 1 },
    { semaine: lundi(-7), xp: 80, sessions: 1 },
    { semaine: lundi(0), xp: 240, sessions: 2 },
  ],
  items_faibles: ITEMS_FAIBLES,
})

const mesRappels = () => [
  { type: 'items_dus', nombre: 7, echeance: AUJOURDHUI, titres: ['La méthode Entasis', 'PER et retraite'] },
  { type: 'serie_en_danger', nombre: 4, echeance: AUJOURDHUI, titres: [] },
  { type: 'affectations_en_retard', nombre: 1, echeance: jour(-3), titres: ['Assurance vie'] },
  { type: 'echeances_proches', nombre: 1, echeance: jour(5), titres: ['PER et retraite'] },
]

// ── Une session d’entrainement : douze items couvrant les huit types ─────────
// Les choix, elements et colonne de droite sont deja dans l’ordre presente
// (le serveur les a melanges). Le corrige local ne sort jamais dans la
// reponse de academy_demarrer_entrainement : il ne sert qu’a academy_repondre.
const ITEMS_SESSION = [
  { item_id: 'ai1', type: 'choix', competence: 'Les cinq temps', difficulte: 1, payload: { enonce: 'Quel est le premier temps d’un accompagnement Entasis ?', choix: ['La proposition', 'Le premier appel', 'La signature', 'Le suivi'] } },
  { item_id: 'ai2', type: 'vrai_faux', competence: 'Le premier appel', difficulte: 1, payload: { enonce: 'Le premier appel sert à prendre rendez vous, pas à vendre.' } },
  { item_id: 'ai3', type: 'choix', competence: 'Le suivi', difficulte: 2, payload: { enonce: 'Quand a lieu le premier point de suivi ?', choix: ['À un mois', 'À trois mois', 'À un an', 'Jamais'] } },
  { item_id: 'ai4', type: 'multi', competence: 'La découverte', difficulte: 2, payload: { enonce: 'Que recueille t on pendant la découverte ? (plusieurs réponses)', choix: ['La situation', 'Le produit souhaité', 'Les objectifs', 'L’horizon'] } },
  { item_id: 'ai5', type: 'ordre', competence: 'Les cinq temps', difficulte: 2, payload: { enonce: 'Remets les cinq temps dans l’ordre.', elements: ['La signature', 'Le premier appel', 'Le suivi', 'La découverte', 'La proposition'] } },
  { item_id: 'ai6', type: 'association', competence: 'Les cinq temps', difficulte: 3, payload: { enonce: 'Associe chaque temps à ce qu’on y fait.', gauche: ['Le premier appel', 'La proposition', 'Le suivi'], droite: ['Un point à trois mois', 'On écoute, on ne vend rien', 'Une solution avec ses limites'] } },
  { item_id: 'ai7', type: 'trou_choix', competence: 'La signature', difficulte: 1, payload: { phrase: 'À la signature, la fiche client doit être ___.', choix: ['à jour', 'archivée', 'vide'] } },
  { item_id: 'ai8', type: 'trou_saisie', competence: 'Le suivi', difficulte: 3, payload: { phrase: 'Après le point à trois mois, le suivi a lieu chaque ___.', aide: 'Une période' } },
  { item_id: 'ai9', type: 'carte', competence: 'Le premier appel', difficulte: 1, payload: { recto: 'Que dit on d’un produit au premier appel ?', verso: 'Rien. On écoute et on prend rendez vous.' } },
  { item_id: 'ai10', type: 'vrai_faux', competence: 'La proposition', difficulte: 1, payload: { enonce: 'Une proposition s’explique avec ses limites.' } },
  { item_id: 'ai11', type: 'choix', competence: 'La découverte', difficulte: 1, payload: { enonce: 'À quel moment parle t on produit pour la première fois ?', choix: ['À la proposition', 'Au premier appel', 'À la découverte', 'À la signature'] } },
  { item_id: 'ai12', type: 'carte', competence: 'Le suivi', difficulte: 2, payload: { recto: 'Quel est le rythme du suivi après la première année ?', verso: 'Un point chaque année.' } },
]

// Le corrige local, en indices presentes (l ordre ci dessus).
const CORRIGE = {
  ai1: { bonne: 1, test: (r) => Number(r) === 1 },
  ai2: { bonne: true, test: (r) => r === true },
  ai3: { bonne: 1, test: (r) => Number(r) === 1 },
  ai4: { bonne: [0, 2, 3], test: (r) => Array.isArray(r) && [...r].map(Number).sort().join(',') === '0,2,3' },
  ai5: { bonne: [1, 3, 4, 0, 2], test: (r) => Array.isArray(r) && r.map(Number).join(',') === '1,3,4,0,2' },
  ai6: { bonne: [[0, 1], [1, 2], [2, 0]], test: (r) => Array.isArray(r) && [...r].map((p) => `${p[0]}-${p[1]}`).sort().join(',') === '0-1,1-2,2-0' },
  ai7: { bonne: 0, test: (r) => Number(r) === 0 },
  ai8: { bonne: ['année', 'an'], test: (r) => ['annee', 'an'].includes(String(r || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()) },
  ai9: { bonne: {}, test: (r) => r && r.su === true },
  ai10: { bonne: true, test: (r) => r === true },
  ai11: { bonne: 0, test: (r) => Number(r) === 0 },
  ai12: { bonne: {}, test: (r) => r && r.su === true },
}
const EXPLICATIONS = {
  ai1: 'On écoute avant de proposer : le premier appel ouvre l’accompagnement.',
  ai2: 'Le premier appel n’est jamais un appel de vente.',
  ai3: 'Le premier point de suivi a lieu à trois mois, puis chaque année.',
  ai4: 'La découverte recueille la situation, les objectifs et l’horizon ; le produit vient après.',
  ai5: 'Premier appel, découverte, proposition, signature, suivi.',
  ai6: 'Chaque temps a son geste : écouter, proposer avec ses limites, suivre.',
  ai7: 'On ne signe pas sur une fiche incomplète.',
  ai8: 'Après le point à trois mois, un point chaque année.',
  ai9: '',
  ai10: 'Une solution se présente toujours avec ses limites.',
  ai11: 'Le produit n’apparaît qu’à la proposition.',
  ai12: '',
}

// Les reponses de la session en cours (la simulation les garde en memoire
// le temps d’un scenario ; chaque page neuve repart d’une session vide).
let reponsesSession = new Map()

const demarrerEntrainement = (corps) => {
  const versionId = corps?.p_version_id || 'av1'
  const m = MODULES.find((x) => x.version_id === versionId) || MODULES[0]
  reponsesSession = new Map()
  return {
    entrainement_id: 'ae-ouverte', version_id: m.version_id, titre: m.titre, slug: m.slug,
    demarree_le: iso(0), terminee_le: null,
    items: ITEMS_SESSION.map((it, i) => ({ ...it, rang: i + 1 })),
    reponses_deja: [],
  }
}

const repondre = (corps) => {
  const itemId = corps?.p_item_id
  const c = CORRIGE[itemId]
  if (!c) return { correcte: false, bonne_reponse: null, explication: '', force: 0, deja: false }
  const deja = reponsesSession.has(itemId)
  const correcte = deja ? reponsesSession.get(itemId) : !!c.test(corps?.p_reponse)
  if (!deja) reponsesSession.set(itemId, correcte)
  return { correcte, bonne_reponse: c.bonne, explication: EXPLICATIONS[itemId] || '', force: correcte ? 2 : 1, deja }
}

const terminerEntrainement = () => {
  const total = reponsesSession.size
  const bons = [...reponsesSession.values()].filter(Boolean).length
  const erreurs = [...reponsesSession.entries()].filter(([, ok]) => !ok).map(([id]) => {
    const it = ITEMS_SESSION.find((x) => x.item_id === id)
    return { item_id: id, competence: it?.competence || '', enonce_court: (it?.payload.enonce || it?.payload.phrase || it?.payload.recto || '').slice(0, 120) }
  })
  const cartes = [...reponsesSession.entries()].filter(([id, ok]) => ok && ITEMS_SESSION.find((x) => x.item_id === id)?.type === 'carte').length
  const xp = (bons - cartes) * 10 + cartes * 5 + (bons === ITEMS_SESSION.length ? 20 : 0) + 10
  return {
    entrainement_id: 'ae-ouverte', version_id: 'av1', nb_bons: bons, nb_total: total, xp,
    premiere_du_jour: true, serie: SERIE.serie + 1, meilleure_serie: Math.max(SERIE.meilleure, SERIE.serie + 1),
    couronnes_avant: 3, couronnes_apres: bons === total && total > 0 ? 4 : 3, valide: false,
    attestation: ATTESTATION_AV1 ? { numero: ATTESTATION_AV1.numero, delivree_le: ATTESTATION_AV1.delivree_le } : null,
    erreurs, statut_module: 'valide', terminee_le: iso(0), xp_total_version: 610 + xp,
  }
}

// ── Direction : pilotage, fiche, matrice ─────────────────────────────────────
const DECKS_LIGNE = (couronnes) => MODULES.map((m, i) => ({ version_id: m.version_id, titre: m.titre, couronnes: couronnes[i], statut: couronnes[i] >= 3 ? 'valide' : couronnes[i] > 0 ? 'en_cours' : 'non_commence' }))

const LIGNES = [
  { profile_id: 'u-conseiller', nom: 'Conseiller Démo', advisor_code: 'DEMO', is_active: true, parcours: ['Intégration, 30 jours'], decks: DECKS_LIGNE([3, 1, 0]), modules_affectes: 3, modules_valides: 1, modules_en_cours: 1, modules_a_revoir: 0, modules_non_commences: 1, retards: 1, serie: 4, xp_7j: 320, xp_periode: 440, sessions_periode: 4, derniere_session: iso(-1), derniere_activite: iso(-1), temps_actif_s: 2620, items_dus: 7, premier_score: { score: 7, total: 12, titre: 'PER et retraite', le: iso(-3) }, dernier_score: { score: 12, total: 12, titre: 'La méthode Entasis', le: iso(-1), type: 'session' }, a_examiner: ['3 sessions sous 50 % sur PER et retraite'] },
  { profile_id: 'u-temoin', nom: 'Conseiller Témoin', advisor_code: 'TEMO', is_active: true, parcours: ['Fondamentaux du conseiller'], decks: DECKS_LIGNE([0, 4, 3]), modules_affectes: 2, modules_valides: 2, modules_en_cours: 0, modules_a_revoir: 0, modules_non_commences: 0, retards: 0, serie: 0, xp_7j: 0, xp_periode: 720, sessions_periode: 6, derniere_session: iso(-8), derniere_activite: iso(-8), temps_actif_s: 4110, items_dus: 12, premier_score: { score: 9, total: 12, titre: 'PER et retraite', le: iso(-20) }, dernier_score: { score: 11, total: 12, titre: 'Assurance vie', le: iso(-8), type: 'session' }, a_examiner: [] },
  { profile_id: 'u-nouveau', nom: 'Sacha Démo', advisor_code: 'SADE', is_active: true, parcours: ['Intégration, 30 jours'], decks: DECKS_LIGNE([1, 0, 0]), modules_affectes: 3, modules_valides: 0, modules_en_cours: 0, modules_a_revoir: 1, modules_non_commences: 2, retards: 0, serie: 0, xp_7j: 0, xp_periode: 40, sessions_periode: 1, derniere_session: iso(-12), derniere_activite: iso(-12), temps_actif_s: 300, items_dus: 9, premier_score: { score: 4, total: 12, titre: 'La méthode Entasis', le: iso(-12) }, dernier_score: { score: 4, total: 12, titre: 'La méthode Entasis', le: iso(-12), type: 'session' }, a_examiner: ['Session de 12 exercices terminee en 31 s (La méthode Entasis)'] },
]

const pilotage = () => ({
  fuseau: 'Europe/Paris', aujourdhui: AUJOURDHUI, depuis: jour(-30), jusqua: AUJOURDHUI,
  indicateurs: { actifs_periode: 2, affectes: 3, obligatoires_validees: 3, obligatoires_total: 8, echues_non_validees: 1, echues_total: 4, sessions_periode: 11, serie_moyenne: 1.3, items_dus: 28, temps_actif_s: 7030 },
  lignes: LIGNES,
  notions: [
    { competence: 'Plafonds de déduction', reponses: 30, correctes: 12, effectif: 3, derniere_le: iso(-2) },
    { competence: 'Le suivi', reponses: 24, correctes: 15, effectif: 3, derniere_le: iso(-1) },
    { competence: 'Les cinq temps', reponses: 40, correctes: 34, effectif: 3, derniere_le: iso(-1) },
    { competence: 'Clause bénéficiaire', reponses: 12, correctes: 11, effectif: 1, derniere_le: iso(-8) },
  ],
  semaines: [0, 1, 2, 3].map((i) => ({ semaine: lundi(-7 * (3 - i)), sessions: 1 + i * 2, xp: 90 + 110 * i, valides: i, affectations: 2, temps_actif_s: 900 + 600 * i })),
  scores_competences: [
    { competence: 'Dérouler la méthode du cabinet', type: 'initial', moyenne_pct: 67, effectif: 3, derniere_le: iso(-1) },
    { competence: 'Expliquer le PER', type: 'initial', moyenne_pct: 71, effectif: 2, derniere_le: iso(-2) },
    { competence: 'Situer l’assurance vie', type: 'initial', moyenne_pct: 92, effectif: 1, derniere_le: iso(-8) },
  ],
  definitions: {
    actifs_periode: 'Collaborateurs affectes ayant termine au moins une session sur la periode, rapportes aux collaborateurs affectes.',
    obligatoires: 'Affectations obligatoires validees (trois couronnes) rapportees aux affectations obligatoires.',
    echues: 'Affectations dont l’echeance est passee et qui ne sont pas validees ; les affectations sans echeance ne comptent pas.',
    serie: 'Jours consecutifs avec au moins une session terminee, en Europe/Paris ; une journee sans session remet a zero.',
    items_dus: 'Exercices dont la revision espacee est arrivee a echeance et qui ne sont pas encore su par coeur (force 5).',
    temps_actif: 'Somme des intervalles d’activite acceptes, fusionnes par personne ; chaque reponse vaut un battement, une session laissee ouverte ne compte pas.',
    a_examiner: 'Faits bruts (session tres rapide, echecs repetes). Aucune qualification automatique.',
  },
})

const fiche = (corps) => {
  const id = corps?.p_profile_id
  const ligne = LIGNES.find((l) => l.profile_id === id) || LIGNES[0]
  return {
    profil: { id: ligne.profile_id, full_name: ligne.nom, advisor_code: ligne.advisor_code, role: 'advisor', is_active: true },
    serie: { serie: ligne.serie, meilleure: 9, dernier_jour: ligne.serie > 0 ? jour(-1) : jour(-8), objectif_quotidien: 2 },
    xp_total: 930,
    items_dus: ligne.items_dus,
    affectations: MODULES.map((m) => {
      const a = AFFECTATIONS[m.version_id]
      const k = MAITRISE[m.version_id]
      return {
        id: a.id, version_id: m.version_id, slug: m.slug, titre: m.titre, competence: m.competence, theme: m.theme,
        obligatoire: a.obligatoire, echeance: a.echeance, statut: a.statut, en_retard: a.statut !== 'valide' && a.echeance < AUJOURDHUI,
        couronnes: k.couronnes, nb_items: m.nb_items, items_vus: k.items_vus, items_dus: k.items_dus,
        xp: k.xp, sessions: k.sessions, derniere_session: k.derniere_session, valide_le: k.valide_le,
        temps_actif_s: m.version_id === 'av1' ? 1980 : (m.version_id === 'av2' ? 640 : 0),
      }
    }),
    sessions: SESSIONS.map(({ id, version_id, titre, demarree_le, terminee_le, nb_bons, nb_total, xp }) => ({ id, version_id, titre, demarree_le, terminee_le, nb_bons, nb_total, xp })),
    items_faibles: ITEMS_FAIBLES.map(({ item_id, titre_module, competence, enonce_court, force, prochaine_le }) => ({ item_id, titre_module, competence, enonce_court, force, prochaine_le })),
    evenements: [
      { id: 'aev1', survenu_le: iso(-1), type: 'session_terminee', version_id: 'av1', titre: 'La méthode Entasis', detail: { entrainement_id: 'ae5', bons: 12, total: 12, xp: 150, couronnes: 3 } },
      { id: 'aev2', survenu_le: iso(-2), type: 'session_terminee', version_id: 'av2', titre: 'PER et retraite', detail: { entrainement_id: 'ae4', bons: 8, total: 12, xp: 90, couronnes: 1 } },
      { id: 'aev3', survenu_le: iso(-33), type: 'module_valide', version_id: 'av1', titre: 'La méthode Entasis', detail: { entrainement_id: 'ae2', couronnes: 3 } },
      { id: 'aev4', survenu_le: iso(-40), type: 'version_publiee', version_id: 'av1', titre: 'La méthode Entasis', detail: { numero: 2 } },
      { id: 'aev5', survenu_le: iso(-45), type: 'affectation_creee', version_id: 'av1', titre: 'La méthode Entasis', detail: { parcours: 'Intégration, 30 jours' } },
    ],
    semaines: [0, 1, 2, 3, 4].map((i) => ({ semaine: lundi(-7 * (4 - i)), temps_actif_s: [1200, 780, 0, 400, 240][i], xp: [70, 0, 120, 80, 240][i], sessions: [1, 0, 1, 1, 2][i] })),
    commentaires: [{ id: 'ac1', texte: 'Bonne progression, revoir le suivi après signature.', created_at: iso(-25), auteur: 'Direction Démo' }],
    temps_actif_s: ligne.temps_actif_s,
  }
}

const matrice = () => ({
  seuils: { acquis: 'trois couronnes ou plus : tous les exercices sus au moins deux fois', a_renforcer: 'une ou deux couronnes, ou revisions en retard', non_evalue: 'aucune session terminee' },
  competences: MODULES.map((m) => ({ version_id: m.version_id, competence: m.competence, titre: m.titre, slug: m.slug })),
  lignes: [
    { profile_id: 'u-conseiller', nom: 'Conseiller Démo', cellules: [
      { version_id: 'av1', couronnes: 3, statut: 'acquis', items_dus: 2, derniere_le: iso(-1), dernier_pct: 100 },
      { version_id: 'av2', couronnes: 1, statut: 'a_renforcer', items_dus: 5, derniere_le: iso(-2), dernier_pct: 67 },
      { version_id: 'av3', couronnes: 0, statut: 'non_evalue', items_dus: 0, derniere_le: null, dernier_pct: null },
    ] },
    { profile_id: 'u-temoin', nom: 'Conseiller Témoin', cellules: [
      { version_id: 'av1', couronnes: 0, statut: 'non_evalue', items_dus: 0, derniere_le: null, dernier_pct: null },
      { version_id: 'av2', couronnes: 4, statut: 'acquis', items_dus: 3, derniere_le: iso(-20), dernier_pct: 75 },
      { version_id: 'av3', couronnes: 3, statut: 'acquis', items_dus: 9, derniere_le: iso(-8), dernier_pct: 92 },
    ] },
    { profile_id: 'u-nouveau', nom: 'Sacha Démo', cellules: [
      { version_id: 'av1', couronnes: 1, statut: 'a_renforcer', items_dus: 9, derniere_le: iso(-12), dernier_pct: 33 },
      { version_id: 'av2', couronnes: 0, statut: 'non_evalue', items_dus: 0, derniere_le: null, dernier_pct: null },
      { version_id: 'av3', couronnes: 0, statut: 'non_evalue', items_dus: 0, derniere_le: null, dernier_pct: null },
    ] },
  ],
})

// ── Administration ───────────────────────────────────────────────────────────
const PARAMETRES = { seuil_reussite_defaut: 0.8, delai_j7: 7, delai_j30: 30, questions_par_quiz: 12, questions_par_revision: 5, retention_intervalles_mois: 12, inactivite_secondes: 120, pas_battement_secondes: 30 }

const adminVue = () => ({
  modules: [
    ...MODULES.map((m) => ({
      id: m.module_id, slug: m.slug, titre: m.titre, theme: m.theme, niveau: m.niveau, ordre: m.ordre, archive_le: null,
      versions: [{ id: m.version_id, numero: m.numero, statut: 'publie', titre: m.titre, publie_le: m.publie_le, relu_par: 'Direction Démo', updated_at: m.publie_le, nb_items: m.nb_items, memo: m.version_id !== 'av3', affectations: 3, validations: 1 }],
    })),
    { id: 'am4', slug: 'fiscalite-raisonner', titre: 'Fiscalité : raisonner', theme: 'strategie-fiscale', niveau: 'fondamentaux', ordre: 7, archive_le: null,
      versions: [{ id: 'av4', numero: 1, statut: 'brouillon', titre: 'Fiscalité : raisonner', publie_le: null, relu_par: null, updated_at: iso(-1), nb_items: 12, memo: true, affectations: 0, validations: 0 }] },
  ],
  parcours: [
    { id: 'ap1', slug: 'integration-30-jours', titre: 'Intégration, 30 jours', description: 'Les premiers pas au cabinet.', ordre: 1, archive_le: null, modules: [{ module_id: 'am1', ordre: 1, obligatoire: true, delai_jours: 7, titre: 'La méthode Entasis', slug: 'methode-entasis' }, { module_id: 'am2', ordre: 2, obligatoire: true, delai_jours: 21, titre: 'PER et retraite', slug: 'per-et-retraite' }] },
    { id: 'ap2', slug: 'fondamentaux-du-conseiller', titre: 'Fondamentaux du conseiller', description: 'Les six métiers du cabinet.', ordre: 2, archive_le: null, modules: [{ module_id: 'am2', ordre: 1, obligatoire: true, delai_jours: null, titre: 'PER et retraite', slug: 'per-et-retraite' }, { module_id: 'am3', ordre: 2, obligatoire: true, delai_jours: null, titre: 'Assurance vie', slug: 'assurance-vie' }] },
  ],
  collaborateurs: LIGNES.map((l) => ({ id: l.profile_id, full_name: l.nom, advisor_code: l.advisor_code, role: 'advisor' })),
  affectations: LIGNES.flatMap((l) => MODULES.map((m, i) => ({
    id: `aff-${l.advisor_code}-${i}`, profile_id: l.profile_id, nom: l.nom, module_id: m.module_id, version_id: m.version_id, titre: m.titre, slug: m.slug,
    parcours_id: i < 2 ? 'ap1' : 'ap2', obligatoire: true, echeance: jour(i * 7 - 10), statut: i === 0 ? 'valide' : (i === 1 ? 'en_cours' : 'non_commence'), created_at: iso(-45),
    couronnes: l.decks[i].couronnes,
  }))),
  journal: [
    { id: 'aj1', survenu_le: iso(-1), nom: 'Direction Démo', action: 'version_modifiee', cible: 'Fiscalité : raisonner v1', detail: 'Mémo réécrit, deux exercices ajoutés' },
    { id: 'aj2', survenu_le: iso(-20), nom: 'Direction Démo', action: 'version_publiee', cible: 'Assurance vie v1', detail: 'Relu par Direction Démo' },
    { id: 'aj3', survenu_le: iso(-45), nom: 'Direction Démo', action: 'affectation', cible: 'Intégration, 30 jours', detail: '3 collaborateurs' },
  ],
  parametres: PARAMETRES,
})

// Les items cote administration, avec le corrige en indices ORIGINAUX
// (payload non melange) et les statistiques de reussite.
const ITEMS_ADMIN = ITEMS_SESSION.map((it, i) => {
  const corrige = {
    choix: { index: CORRIGE[it.item_id].bonne },
    trou_choix: { index: CORRIGE[it.item_id].bonne },
    vrai_faux: { vrai: CORRIGE[it.item_id].bonne },
    multi: { indices: CORRIGE[it.item_id].bonne },
    ordre: { ordre: CORRIGE[it.item_id].bonne },
    association: { paires: CORRIGE[it.item_id].bonne },
    trou_saisie: { reponses: CORRIGE[it.item_id].bonne },
    carte: {},
  }[it.type]
  return {
    id: it.item_id, ordre: i + 1, type: it.type, competence: it.competence, difficulte: it.difficulte,
    payload: it.payload, corrige, explication: EXPLICATIONS[it.item_id] || '', archive_le: null,
    statistiques: { reponses: 12 + i, correctes: 8 + (i % 4) },
  }
})

const versionAdmin = (corps) => {
  const id = corps?.p_version_id || 'av4'
  const m = MODULES.find((x) => x.version_id === id)
  const publie = !!m
  return {
    id, module_id: m ? m.module_id : 'am4', slug: m ? m.slug : 'fiscalite-raisonner', theme: m ? m.theme : 'strategie-fiscale', niveau: m ? m.niveau : 'fondamentaux', ordre: m ? m.ordre : 7,
    numero: m ? m.numero : 1, statut: publie ? 'publie' : 'brouillon', titre: m ? m.titre : 'Fiscalité : raisonner',
    objectif: m ? m.objectif : 'Raisonner sur la fiscalité d’un client avant toute proposition.', competence: m ? m.competence : 'Raisonner sur la fiscalité',
    duree_minutes: 10, prerequis: ['methode-entasis'], seuil_reussite: 0.8,
    memo_md: MEMO_MD,
    sources: [{ titre: 'Barème de l’impôt sur le revenu', url: 'https://www.impots.gouv.fr', emetteur: 'DGFiP', date_consultation: '2026-09-01', date_validite: '2026-12-31', ce_qu_elle_etablit: 'Les tranches' }],
    a_completer: ['La grille de lecture interne des tranches'], fictif: false,
    publie_le: publie ? m.publie_le : null, relu_par: publie ? 'Direction Démo' : null, relu_le: publie ? iso(-21) : null, commentaire_relecture: null, archive_le: null,
    items: ITEMS_ADMIN,
    affectations: publie ? 3 : 0, validations: publie ? 1 : 0,
  }
}

// ── Tables lues en direct (rien de sensible) ─────────────────────────────────
export const ACADEMY_TABLES = {
  // Lue en direct par App.jsx (formationOuverte) : l’onglet Formation
  // n’existe pour un conseiller que s’il y a au moins une version publiee.
  academy_module_versions: MODULES.map((m) => ({ id: m.version_id, module_id: m.module_id, numero: m.numero, statut: 'publie', titre: m.titre, publie_le: m.publie_le })),
  academy_parametres: [{ id: true, ...PARAMETRES }],
  academy_modules: MODULES.map((m) => ({ id: m.module_id, slug: m.slug, titre: m.titre, theme: m.theme, niveau: m.niveau, ordre: m.ordre, archive_le: null })),
}

// ── Fonctions SQL simulees : une fonction par RPC, le corps POST en argument ─
export const ACADEMY_RPCS = {
  academy_catalogue: () => catalogue(),
  academy_module: (corps) => module(corps?.p_slug),
  academy_mon_parcours: () => monParcours(),
  academy_mes_resultats: () => mesResultats(),
  academy_mes_rappels: () => mesRappels(),
  academy_demarrer_entrainement: (corps) => demarrerEntrainement(corps),
  academy_repondre: (corps) => repondre(corps),
  academy_terminer_entrainement: () => terminerEntrainement(),
  academy_objectif_quotidien: () => null,
  academy_pilotage: () => pilotage(),
  academy_fiche: (corps) => fiche(corps),
  academy_matrice_competences: () => matrice(),
  academy_admin_vue: () => adminVue(),
  academy_version_admin: (corps) => versionAdmin(corps),
  academy_affecter: () => 3,
  academy_modifier_echeance: () => null,
  academy_retirer_affectation: () => null,
  academy_creer_module: () => ({ module_id: 'am-nouveau', version_id: 'av-nouvelle' }),
  academy_nouvelle_version: () => 'av-nouvelle',
  academy_enregistrer_version: () => null,
  academy_enregistrer_item: () => 'ai-nouvel',
  academy_publier_version: () => null,
  academy_archiver_version: () => null,
  academy_enregistrer_parcours: () => 'ap-nouveau',
}
