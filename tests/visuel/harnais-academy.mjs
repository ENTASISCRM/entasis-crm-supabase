// tests/visuel/harnais-academy.mjs
//
// Jeux de donnees fictifs d Entasis Academy pour le controle visuel.
//
// Les ecrans de formation ne lisent presque rien en direct dans les tables :
// ils appellent des fonctions SQL (academy_catalogue, academy_module,
// academy_lecon, academy_pilotage...) qui rendent un objet JSON deja assemble.
// Ce fichier reproduit ces reponses, dans la forme exacte des fonctions de
// supabase/migrations/20260921_academy_2_fonctions.sql. Les corriges ne sont
// jamais servis : une tentative ouverte ne contient que les enonces, la
// correction n arrive qu avec la soumission, comme en vrai.
//
// Tout est invente : modules, questions, personnes, scores. Aucune donnee
// reelle, aucune remuneration.

const JOUR = 86400000
const iso = (decalageJours, heure = '09:00:00') => {
  const d = new Date(Date.now() + decalageJours * JOUR)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${heure}Z`
}
const jour = (decalageJours) => iso(decalageJours).slice(0, 10)
const AUJOURDHUI = jour(0)

// ── Modules publies (deux) et un brouillon ───────────────────────────────────
export const MODULES = [
  {
    module_id: 'am1', slug: 'methode-entasis', titre: 'La méthode Entasis', theme: 'methode', niveau: 'decouverte', ordre: 1,
    version_id: 'av1', numero: 1, objectif: 'Savoir dérouler les cinq temps d un accompagnement, du premier appel au suivi.',
    competence: 'Dérouler la méthode du cabinet', duree_minutes: 15, prerequis: [], seuil_reussite: 0.8,
    nb_lecons: 3, nb_questions: 10, publie_le: iso(-40),
  },
  {
    module_id: 'am2', slug: 'per-et-retraite', titre: 'PER et retraite', theme: 'per-retraite', niveau: 'fondamentaux', ordre: 3,
    version_id: 'av2', numero: 1, objectif: 'Expliquer le PER à un client, ses cas de sortie et sa fiscalité à l entrée.',
    competence: 'Expliquer le PER', duree_minutes: 18, prerequis: ['methode-entasis'], seuil_reussite: 0.8,
    nb_lecons: 3, nb_questions: 10, publie_le: iso(-30),
  },
  {
    module_id: 'am3', slug: 'assurance-vie', titre: 'Assurance vie', theme: 'assurance-vie', niveau: 'fondamentaux', ordre: 4,
    version_id: 'av3', numero: 1, objectif: 'Situer l assurance vie dans une stratégie patrimoniale.',
    competence: 'Situer l assurance vie', duree_minutes: 16, prerequis: ['methode-entasis'], seuil_reussite: 0.8,
    nb_lecons: 3, nb_questions: 10, publie_le: iso(-20),
  },
]

const LECONS = {
  av1: [
    { id: 'al1', ordre: 1, slug: 'les-cinq-temps', titre: 'Les cinq temps d un accompagnement', objectif: 'Citer les cinq temps dans l ordre', duree_minutes: 5 },
    { id: 'al2', ordre: 2, slug: 'le-premier-appel', titre: 'Le premier appel', objectif: 'Ouvrir un appel en moins d une minute', duree_minutes: 5 },
    { id: 'al3', ordre: 3, slug: 'le-suivi', titre: 'Le suivi après signature', objectif: 'Planifier le premier point de suivi', duree_minutes: 5 },
  ],
  av2: [
    { id: 'al4', ordre: 1, slug: 'le-per-en-bref', titre: 'Le PER en bref', objectif: 'Présenter le PER en trois phrases', duree_minutes: 6 },
    { id: 'al5', ordre: 2, slug: 'sortie-et-fiscalite', titre: 'Sortie et fiscalité', objectif: 'Distinguer sortie en rente et en capital', duree_minutes: 6 },
    { id: 'al6', ordre: 3, slug: 'le-bon-client', titre: 'À qui le proposer', objectif: 'Repérer trois profils pertinents', duree_minutes: 6 },
  ],
  av3: [
    { id: 'al7', ordre: 1, slug: 'cadre-general', titre: 'Le cadre général', objectif: 'Expliquer l enveloppe', duree_minutes: 5 },
    { id: 'al8', ordre: 2, slug: 'fiscalite-des-retraits', titre: 'La fiscalité des retraits', objectif: 'Situer les huit ans', duree_minutes: 6 },
    { id: 'al9', ordre: 3, slug: 'clause-beneficiaire', titre: 'La clause bénéficiaire', objectif: 'Lire une clause type', duree_minutes: 5 },
  ],
}

const CONTENU_MD = `## Les cinq temps

Un accompagnement Entasis se déroule en cinq temps, toujours dans le même ordre :

1. **Le premier appel** : on écoute, on ne vend rien.
2. **La découverte** : la situation, les objectifs, l horizon.
3. **La proposition** : une solution, expliquée avec ses limites.
4. **La signature** : le dossier complet, la fiche client à jour.
5. **Le suivi** : un point à trois mois, puis chaque année.

> Cas fictif : Camille Exemple appelle après une publicité. Le conseiller prend rendez vous sans parler produit. C est le premier temps.

### Ce qu il faut retenir

Le client ne doit jamais découvrir un produit avant que le cabinet ait compris sa situation.
`

// Progression du collaborateur simule : le module 1 est valide, le module 2
// en cours (une lecon terminee), le module 3 pas commence.
const PROGRESSION = {
  al1: { position: 1, terminee_le: iso(-35), mini_question_reussie_le: iso(-35) },
  al2: { position: 1, terminee_le: iso(-35), mini_question_reussie_le: iso(-35) },
  al3: { position: 1, terminee_le: iso(-34), mini_question_reussie_le: iso(-34) },
  al4: { position: 1, terminee_le: iso(-2), mini_question_reussie_le: iso(-2) },
  al5: { position: 0.4, terminee_le: null, mini_question_reussie_le: null },
}

const AFFECTATIONS = {
  av1: { id: 'aa1', statut: 'valide', echeance: jour(-20), obligatoire: true, parcours_id: 'ap1' },
  av2: { id: 'aa2', statut: 'en_cours', echeance: jour(5), obligatoire: true, parcours_id: 'ap1' },
  av3: { id: 'aa3', statut: 'non_commence', echeance: jour(-3), obligatoire: true, parcours_id: 'ap2' },
}

const TENTATIVES = [
  { id: 'at1', version_id: 'av1', slug: 'methode-entasis', titre: 'La méthode Entasis', competence: 'Dérouler la méthode du cabinet', type: 'initial', numero: 1, demarree_le: iso(-34, '10:00:00'), soumise_le: iso(-34, '10:09:00'), score: 7, total: 10, seuil: 0.8, reussie: false, duree_s: 540, notions_a_revoir: ['Le suivi après signature'] },
  { id: 'at2', version_id: 'av1', slug: 'methode-entasis', titre: 'La méthode Entasis', competence: 'Dérouler la méthode du cabinet', type: 'initial', numero: 2, demarree_le: iso(-33, '10:00:00'), soumise_le: iso(-33, '10:08:00'), score: 9, total: 10, seuil: 0.8, reussie: true, duree_s: 480, notions_a_revoir: [] },
  { id: 'at3', version_id: 'av1', slug: 'methode-entasis', titre: 'La méthode Entasis', competence: 'Dérouler la méthode du cabinet', type: 'revision_j7', numero: 3, demarree_le: iso(-26, '11:00:00'), soumise_le: iso(-26, '11:04:00'), score: 5, total: 5, seuil: 0.8, reussie: true, duree_s: 240, notions_a_revoir: [] },
]

const REVISIONS = [
  { id: 'ar1', version_id: 'av1', type: 'J7', echeance: jour(-26), resultat: 'reussie', faite_le: iso(-26), due: false, slug: 'methode-entasis', titre: 'La méthode Entasis' },
  { id: 'ar2', version_id: 'av1', type: 'J30', echeance: jour(-3), resultat: null, faite_le: null, due: true, slug: 'methode-entasis', titre: 'La méthode Entasis' },
]

const ATTESTATION_AV1 = { numero: 'EA-2026-0007', delivree_le: iso(-33), score: 9, total: 10 }

const catalogue = () => MODULES.map((m) => ({
  ...m,
  affectation: AFFECTATIONS[m.version_id] || null,
  lecons_terminees: LECONS[m.version_id].filter((l) => PROGRESSION[l.id]?.terminee_le).length,
  valide_le: m.version_id === 'av1' ? iso(-33) : null,
}))

function module(slug) {
  const m = MODULES.find((x) => x.slug === slug)
  if (!m) return null
  const lecons = LECONS[m.version_id].map((l) => ({
    ...l, terminee_le: PROGRESSION[l.id]?.terminee_le ?? null,
    mini_question_reussie_le: PROGRESSION[l.id]?.mini_question_reussie_le ?? null,
    position: PROGRESSION[l.id]?.position ?? null,
  }))
  const valide = m.version_id === 'av1'
  return {
    module_id: m.module_id, slug: m.slug, titre: m.titre, theme: m.theme, niveau: m.niveau, version_id: m.version_id,
    objectif: m.objectif, competence: m.competence, duree_minutes: m.duree_minutes, prerequis: m.prerequis, seuil_reussite: m.seuil_reussite,
    cas_pratique: {
      titre: 'Un premier appel qui dérape',
      situation_markdown: 'Cas fictif. Dominique Modèle appelle et demande d emblée « le meilleur placement ». Que faites vous ?',
      questions: ['Quel est le premier temps à respecter ?', 'Que répondre sans parler produit ?'],
      corrige_markdown: 'On reste sur le premier temps : écouter, prendre rendez vous, ne rien vendre.',
    },
    a_completer: ['Le script d ouverture d appel du cabinet'],
    sources: [{ titre: 'Charte de la méthode Entasis', url: null, emetteur: 'Entasis Conseil', date_consultation: '2026-09-01', date_validite: null, ce_qu_elle_etablit: 'Les cinq temps' }],
    relu_par: 'Direction Démo', relu_le: iso(-41), publie_le: m.publie_le,
    lecons,
    affectation: AFFECTATIONS[m.version_id] || null,
    validation: valide ? { valide_le: iso(-33) } : null,
    attestation: valide ? ATTESTATION_AV1 : null,
    revisions: REVISIONS.filter((r) => r.version_id === m.version_id).map(({ type, echeance, resultat, faite_le, due }) => ({ type, echeance, resultat, faite_le, due })),
    tentatives: TENTATIVES.filter((t) => t.version_id === m.version_id).map(({ id, type, numero, soumise_le, score, total, reussie, duree_s }) => ({ id, type, numero, soumise_le, score, total, reussie, duree_s })),
    tentative_ouverte: null,
    duree_active_s: valide ? 1980 : (m.version_id === 'av2' ? 640 : 0),
  }
}

function lecon(id) {
  for (const versionId of Object.keys(LECONS)) {
    const l = LECONS[versionId].find((x) => x.id === id)
    if (!l) continue
    const m = MODULES.find((x) => x.version_id === versionId)
    return {
      id: l.id, version_id: versionId, ordre: l.ordre, slug: l.slug, titre: l.titre, objectif: l.objectif, duree_minutes: l.duree_minutes,
      contenu_md: CONTENU_MD,
      mini_question: { enonce: 'Quel est le premier temps d un accompagnement ?', choix: ['La proposition', 'Le premier appel', 'La signature', 'Le suivi'], explication: 'On écoute avant de proposer.' },
      sources: [{ titre: 'Charte de la méthode Entasis', url: null, emetteur: 'Entasis Conseil', date_consultation: '2026-09-01', date_validite: null, ce_qu_elle_etablit: 'Les cinq temps' }],
      module: { slug: m.slug, titre: m.titre, version_id: versionId },
      lecons: LECONS[versionId].map((x) => ({ id: x.id, ordre: x.ordre, titre: x.titre, terminee_le: PROGRESSION[x.id]?.terminee_le ?? null })),
      progression: PROGRESSION[l.id] || null,
      parametres: { inactivite_secondes: 120, pas_battement_secondes: 30 },
    }
  }
  return null
}

const monParcours = () => ({
  aujourdhui: AUJOURDHUI,
  affectations: MODULES.map((m) => {
    const a = AFFECTATIONS[m.version_id]
    const terminees = LECONS[m.version_id].filter((l) => PROGRESSION[l.id]?.terminee_le)
    const prochaine = LECONS[m.version_id].find((l) => !PROGRESSION[l.id]?.terminee_le) || null
    return {
      id: a.id, module_id: m.module_id, version_id: m.version_id, parcours_id: a.parcours_id,
      parcours_titre: a.parcours_id === 'ap1' ? 'Intégration, 30 jours' : 'Fondamentaux du conseiller',
      obligatoire: a.obligatoire, echeance: a.echeance, statut: a.statut, en_retard: a.statut !== 'valide' && a.echeance < AUJOURDHUI,
      slug: m.slug, titre: m.titre, theme: m.theme, niveau: m.niveau, duree_minutes: m.duree_minutes,
      nb_lecons: 3, lecons_terminees: terminees.length,
      prochaine_lecon: prochaine ? { id: prochaine.id, titre: prochaine.titre, ordre: prochaine.ordre } : null,
      derniere_activite: a.statut === 'valide' ? iso(-26) : (a.statut === 'en_cours' ? iso(-1) : null),
      valide_le: a.statut === 'valide' ? iso(-33) : null, version_statut: 'publie', created_at: iso(-45),
    }
  }),
  revisions: REVISIONS,
  dernieres_reussites: [{ version_id: 'av1', titre: 'La méthode Entasis', slug: 'methode-entasis', valide_le: iso(-33), attestation: ATTESTATION_AV1 }],
  temps_actif_s: 2620, temps_actif_7j_s: 640,
  notice_donnees: 'Le CRM enregistre le temps réellement actif sur une leçon (onglet visible, activité détectée) par intervalles ; les détails sont conservés douze mois puis résumés par jour. La direction voit vos statuts, scores et temps par module. Aucune donnée n est transmise hors du cabinet.',
  retention_intervalles_mois: 12,
})

const mesRappels = () => [
  { type: 'revisions_dues', nombre: 1, echeance: jour(-3), titres: ['La méthode Entasis'] },
  { type: 'affectations_en_retard', nombre: 1, echeance: jour(-3), titres: ['Assurance vie'] },
]

// Une tentative ouverte : cinq questions (la simulation ne fait pas de
// tirage), les choix dans l ordre presente, sans corrige.
const QUESTIONS_QUIZ = [
  { question_id: 'aq1', type: 'qcm', enonce: 'Quel est le premier temps d un accompagnement Entasis ?', lecon_id: 'al1', competence: 'Dérouler la méthode du cabinet', choix: ['La proposition', 'Le premier appel', 'La signature', 'Le suivi'] },
  { question_id: 'aq2', type: 'qcm', enonce: 'À quel moment parle t on produit pour la première fois ?', lecon_id: 'al1', competence: 'Dérouler la méthode du cabinet', choix: ['Au premier appel', 'À la découverte', 'À la proposition', 'À la signature'] },
  { question_id: 'aq3', type: 'vrai_faux', enonce: 'Le premier appel sert à prendre rendez vous, pas à vendre.', lecon_id: 'al2', competence: 'Dérouler la méthode du cabinet', choix: ['Vrai', 'Faux'] },
  { question_id: 'aq4', type: 'qcm', enonce: 'Quand a lieu le premier point de suivi ?', lecon_id: 'al3', competence: 'Dérouler la méthode du cabinet', choix: ['À un mois', 'À trois mois', 'À un an', 'Jamais'] },
  { question_id: 'aq5', type: 'vrai_faux', enonce: 'La fiche client doit être à jour avant la signature.', lecon_id: 'al3', competence: 'Dérouler la méthode du cabinet', choix: ['Vrai', 'Faux'] },
]

const ouvrirTentative = (corps) => ({
  tentative_id: 'at-ouverte', type: corps?.p_type || 'initial', numero: 1, total: QUESTIONS_QUIZ.length,
  demarree_le: iso(0), version_id: corps?.p_version_id || 'av1', seuil: 0.8, questions: QUESTIONS_QUIZ,
})

const soumettreTentative = (corps) => {
  const reponses = corps?.p_reponses || {}
  const bonnes = { aq1: 1, aq2: 2, aq3: 0, aq4: 1, aq5: 0 }
  const corrections = QUESTIONS_QUIZ.map((q) => ({
    question_id: q.question_id, reponse: reponses[q.question_id] ?? null, bonne_reponse: bonnes[q.question_id],
    correcte: reponses[q.question_id] === bonnes[q.question_id], explication: 'On écoute avant de proposer, et on suit après.',
    lecon_id: q.lecon_id, competence: q.competence,
  }))
  const score = corrections.filter((c) => c.correcte).length
  return {
    tentative_id: 'at-ouverte', score, total: QUESTIONS_QUIZ.length, pourcentage: Math.round(100 * score / QUESTIONS_QUIZ.length), seuil: 0.8,
    reussie: score / QUESTIONS_QUIZ.length >= 0.8, module_valide: score / QUESTIONS_QUIZ.length >= 0.8,
    attestation: score / QUESTIONS_QUIZ.length >= 0.8 ? { numero: 'EA-2026-0008', delivree_le: iso(0), score, total: QUESTIONS_QUIZ.length } : null,
    corrections, soumise_le: iso(0), statut_module: score / QUESTIONS_QUIZ.length >= 0.8 ? 'valide' : 'a_revoir',
  }
}

// ── Direction : pilotage, fiche, matrice ─────────────────────────────────────
const LIGNES = [
  { profile_id: 'u-conseiller', nom: 'Conseiller Démo', advisor_code: 'DEMO', parcours: ['Intégration, 30 jours'], modules_affectes: 3, modules_valides: 1, modules_en_cours: 1, modules_a_revoir: 0, modules_non_commences: 1, retards: 1, derniere_activite: iso(-1), temps_actif_s: 2620, premier_score: { score: 7, total: 10, titre: 'La méthode Entasis', le: iso(-34) }, dernier_score: { score: 5, total: 5, titre: 'La méthode Entasis', le: iso(-26), type: 'revision_j7' }, prochaine_revision: jour(-3), revisions_dues: 1, a_examiner: ['Une révision J30 en attente depuis 3 jours', 'Assurance vie non commencé, échéance dépassée'] },
  { profile_id: 'u-temoin', nom: 'Conseiller Témoin', advisor_code: 'TEMO', parcours: ['Fondamentaux du conseiller'], modules_affectes: 2, modules_valides: 2, modules_en_cours: 0, modules_a_revoir: 0, modules_non_commences: 0, retards: 0, derniere_activite: iso(-8), temps_actif_s: 4110, premier_score: { score: 9, total: 10, titre: 'PER et retraite', le: iso(-20) }, dernier_score: { score: 8, total: 10, titre: 'Assurance vie', le: iso(-8), type: 'initial' }, prochaine_revision: jour(2), revisions_dues: 0, a_examiner: [] },
  { profile_id: 'u-nouveau', nom: 'Sacha Démo', advisor_code: 'SADE', parcours: ['Intégration, 30 jours'], modules_affectes: 3, modules_valides: 0, modules_en_cours: 0, modules_a_revoir: 1, modules_non_commences: 2, retards: 0, derniere_activite: iso(-12), temps_actif_s: 300, premier_score: { score: 4, total: 10, titre: 'La méthode Entasis', le: iso(-12) }, dernier_score: { score: 4, total: 10, titre: 'La méthode Entasis', le: iso(-12), type: 'initial' }, prochaine_revision: null, revisions_dues: 0, a_examiner: ['Aucune activité depuis 12 jours', 'Un quiz initial sous le seuil'] },
]

const pilotage = () => ({
  fuseau: 'Europe/Paris', aujourdhui: AUJOURDHUI, depuis: jour(-30), jusqua: AUJOURDHUI,
  indicateurs: { actifs_periode: 2, affectes: 3, obligatoires_validees: 3, obligatoires_total: 8, echues_non_validees: 1, echues_total: 4, premiere_reussite_num: 2, premiere_reussite_den: 3, revisions_en_attente: 1, temps_actif_s: 7030 },
  lignes: LIGNES,
  notions: [
    { competence: 'Dérouler la méthode du cabinet', reponses: 30, correctes: 21, effectif: 3, derniere_le: iso(-12) },
    { competence: 'Expliquer le PER', reponses: 10, correctes: 9, effectif: 1, derniere_le: iso(-20) },
    { competence: 'Situer l assurance vie', reponses: 10, correctes: 8, effectif: 1, derniere_le: iso(-8) },
  ],
  semaines: [0, 1, 2, 3].map((i) => ({ semaine: jour(-7 * (3 - i)), valides: i, affectations: 2, temps_actif_s: 900 + 600 * i })),
  scores_competences: [
    { competence: 'Dérouler la méthode du cabinet', type: 'initial', moyenne_pct: 67, effectif: 3, derniere_le: iso(-12) },
    { competence: 'Dérouler la méthode du cabinet', type: 'revision', moyenne_pct: 100, effectif: 1, derniere_le: iso(-26) },
    { competence: 'Expliquer le PER', type: 'initial', moyenne_pct: 90, effectif: 1, derniere_le: iso(-20) },
  ],
  definitions: {
    actifs_periode: 'Collaborateurs ayant au moins un intervalle actif sur la période, sur les collaborateurs affectés.',
    obligatoires: 'Affectations obligatoires validées sur affectations obligatoires.',
    premiere_reussite: 'Modules validés dès la première tentative sur modules validés.',
  },
})

const fiche = (corps) => {
  const id = corps?.p_profile_id
  const ligne = LIGNES.find((l) => l.profile_id === id) || LIGNES[0]
  return {
    profil: { id: ligne.profile_id, full_name: ligne.nom, advisor_code: ligne.advisor_code, role: 'advisor', is_active: true },
    affectations: monParcours().affectations,
    tentatives: TENTATIVES,
    revisions: REVISIONS,
    evenements: [
      { id: 'ae1', survenu_le: iso(-33), type: 'module_valide', version_id: 'av1', titre: 'La méthode Entasis', detail: 'Score 9 sur 10' },
      { id: 'ae2', survenu_le: iso(-34), type: 'quiz_echoue', version_id: 'av1', titre: 'La méthode Entasis', detail: 'Score 7 sur 10' },
      { id: 'ae3', survenu_le: iso(-45), type: 'affectation', version_id: 'av1', titre: 'La méthode Entasis', detail: 'Parcours Intégration, 30 jours' },
    ],
    semaines: [0, 1, 2, 3, 4].map((i) => ({ semaine: jour(-7 * (4 - i)), temps_actif_s: [1200, 780, 0, 400, 240][i] })),
    commentaires: [{ id: 'ac1', texte: 'Bonne progression, revoir le suivi après signature.', created_at: iso(-25), auteur: 'Direction Démo' }],
    temps_actif_s: ligne.temps_actif_s,
  }
}

const matrice = () => ({
  seuils: { acquis: 0.8, a_renforcer: 0.5, non_evalue: null },
  competences: MODULES.map((m) => ({ version_id: m.version_id, competence: m.competence, titre: m.titre, slug: m.slug })),
  lignes: [
    { profile_id: 'u-conseiller', nom: 'Conseiller Démo', cellules: [{ version_id: 'av1', statut: 'acquis', derniere_le: iso(-26), dernier_pct: 100 }, { version_id: 'av2', statut: 'non_evalue', derniere_le: null, dernier_pct: null }, { version_id: 'av3', statut: 'non_evalue', derniere_le: null, dernier_pct: null }] },
    { profile_id: 'u-temoin', nom: 'Conseiller Témoin', cellules: [{ version_id: 'av1', statut: 'non_evalue', derniere_le: null, dernier_pct: null }, { version_id: 'av2', statut: 'acquis', derniere_le: iso(-20), dernier_pct: 90 }, { version_id: 'av3', statut: 'acquis', derniere_le: iso(-8), dernier_pct: 80 }] },
    { profile_id: 'u-nouveau', nom: 'Sacha Démo', cellules: [{ version_id: 'av1', statut: 'a_renforcer', derniere_le: iso(-12), dernier_pct: 40 }, { version_id: 'av2', statut: 'non_evalue', derniere_le: null, dernier_pct: null }, { version_id: 'av3', statut: 'non_evalue', derniere_le: null, dernier_pct: null }] },
  ],
})

// ── Administration ───────────────────────────────────────────────────────────
const adminVue = () => ({
  modules: [
    ...MODULES.map((m) => ({
      id: m.module_id, slug: m.slug, titre: m.titre, theme: m.theme, niveau: m.niveau, ordre: m.ordre, archive_le: null,
      versions: [{ id: m.version_id, numero: 1, statut: 'publie', titre: m.titre, publie_le: m.publie_le, relu_par: 'Direction Démo', updated_at: m.publie_le, nb_lecons: 3, nb_questions: 10, affectations: 3, validations: 1 }],
    })),
    { id: 'am4', slug: 'fiscalite-raisonner', titre: 'Fiscalité : raisonner', theme: 'strategie-fiscale', niveau: 'fondamentaux', ordre: 7, archive_le: null,
      versions: [{ id: 'av4', numero: 1, statut: 'brouillon', titre: 'Fiscalité : raisonner', publie_le: null, relu_par: null, updated_at: iso(-1), nb_lecons: 3, nb_questions: 8, affectations: 0, validations: 0 }] },
  ],
  parcours: [
    { id: 'ap1', slug: 'integration-30-jours', titre: 'Intégration, 30 jours', description: 'Les premiers pas au cabinet.', ordre: 1, archive_le: null, modules: [{ module_id: 'am1', ordre: 1, obligatoire: true, delai_jours: 7, titre: 'La méthode Entasis', slug: 'methode-entasis' }, { module_id: 'am2', ordre: 2, obligatoire: true, delai_jours: 21, titre: 'PER et retraite', slug: 'per-et-retraite' }] },
    { id: 'ap2', slug: 'fondamentaux-du-conseiller', titre: 'Fondamentaux du conseiller', description: 'Les six métiers du cabinet.', ordre: 2, archive_le: null, modules: [{ module_id: 'am2', ordre: 1, obligatoire: true, delai_jours: null, titre: 'PER et retraite', slug: 'per-et-retraite' }, { module_id: 'am3', ordre: 2, obligatoire: true, delai_jours: null, titre: 'Assurance vie', slug: 'assurance-vie' }] },
  ],
  collaborateurs: LIGNES.map((l) => ({ id: l.profile_id, full_name: l.nom, advisor_code: l.advisor_code, role: 'advisor' })),
  affectations: LIGNES.flatMap((l) => MODULES.map((m, i) => ({
    id: `aff-${l.advisor_code}-${i}`, profile_id: l.profile_id, nom: l.nom, module_id: m.module_id, version_id: m.version_id, titre: m.titre, slug: m.slug,
    parcours_id: i < 2 ? 'ap1' : 'ap2', obligatoire: true, echeance: jour(i * 7 - 10), statut: i === 0 ? 'valide' : (i === 1 ? 'en_cours' : 'non_commence'), created_at: iso(-45),
  }))),
  journal: [
    { id: 'aj1', survenu_le: iso(-1), nom: 'Direction Démo', action: 'version_modifiee', cible: 'Fiscalité : raisonner v1', detail: 'Leçon 2 réécrite' },
    { id: 'aj2', survenu_le: iso(-20), nom: 'Direction Démo', action: 'version_publiee', cible: 'Assurance vie v1', detail: 'Relu par Direction Démo' },
    { id: 'aj3', survenu_le: iso(-45), nom: 'Direction Démo', action: 'affectation', cible: 'Intégration, 30 jours', detail: '3 collaborateurs' },
  ],
  parametres: { seuil_reussite_defaut: 0.8, delai_j7: 7, delai_j30: 30, questions_par_quiz: 10, questions_par_revision: 5, retention_intervalles_mois: 12, inactivite_secondes: 120, pas_battement_secondes: 30 },
})

const versionAdmin = (corps) => {
  const id = corps?.p_version_id || 'av4'
  const m = MODULES.find((x) => x.version_id === id)
  const publie = !!m
  const lecons = (LECONS[id] || [
    { id: 'al10', ordre: 1, slug: 'impot-sur-le-revenu', titre: 'L impôt sur le revenu en trois idées', objectif: 'Expliquer le barème progressif', duree_minutes: 6 },
    { id: 'al11', ordre: 2, slug: 'tmi-et-taux-moyen', titre: 'TMI et taux moyen', objectif: 'Ne plus les confondre', duree_minutes: 5 },
    { id: 'al12', ordre: 3, slug: 'raisonner-avant-de-defiscaliser', titre: 'Raisonner avant de défiscaliser', objectif: 'Poser les trois questions préalables', duree_minutes: 6 },
  ]).map((l) => ({ ...l, contenu_md: CONTENU_MD, mini_question: { enonce: 'Le TMI est le taux moyen d imposition.', choix: ['Vrai', 'Faux'], explication: 'Non, c est le taux de la dernière tranche.', bonne_reponse: 1 }, sources: [] }))
  return {
    id, module_id: m ? m.module_id : 'am4', slug: m ? m.slug : 'fiscalite-raisonner', theme: m ? m.theme : 'strategie-fiscale', niveau: m ? m.niveau : 'fondamentaux',
    numero: 1, statut: publie ? 'publie' : 'brouillon', titre: m ? m.titre : 'Fiscalité : raisonner',
    objectif: m ? m.objectif : 'Raisonner sur la fiscalité d un client avant toute proposition.', competence: m ? m.competence : 'Raisonner sur la fiscalité',
    duree_minutes: 17, prerequis: ['methode-entasis'], seuil_reussite: 0.8,
    cas_pratique: { titre: 'Un client pressé de défiscaliser', situation_markdown: 'Cas fictif. Aurélie Fictive veut « payer moins d impôts » avant tout.', questions: ['Quelles sont les trois questions préalables ?'], corrige_markdown: 'Situation, objectif, horizon.' },
    a_completer: ['La grille de lecture interne des tranches'], sources: [{ titre: 'Barème de l impôt sur le revenu', url: 'https://www.impots.gouv.fr', emetteur: 'DGFiP', date_consultation: '2026-09-01', date_validite: '2026-12-31', ce_qu_elle_etablit: 'Les tranches' }],
    fictif: false, publie_le: publie ? m.publie_le : null, relu_par: publie ? 'Direction Démo' : null, relu_le: publie ? iso(-21) : null, commentaire_relecture: null,
    lecons,
    questions: QUESTIONS_QUIZ.map((q, i) => ({ id: q.question_id, cle: `q${i + 1}`, type: q.type, lecon_id: lecons[i % 3].id, competence: q.competence, enonce: q.enonce, choix: q.choix, difficulte: 1 + (i % 3), archive_le: null, bonne_reponse: [1, 2, 0, 1, 0][i], explication: 'On écoute avant de proposer.', statistiques: { reponses: 12, correctes: 9 } })),
    affectations: publie ? 3 : 0, validations: publie ? 1 : 0,
  }
}

// ── Tables lues en direct (rien de sensible) ─────────────────────────────────
export const ACADEMY_TABLES = {
  academy_parametres: [{ id: true, seuil_reussite_defaut: 0.8, delai_j7: 7, delai_j30: 30, questions_par_quiz: 10, questions_par_revision: 5, retention_intervalles_mois: 12, inactivite_secondes: 120, pas_battement_secondes: 30 }],
  academy_modules: MODULES.map((m) => ({ id: m.module_id, slug: m.slug, titre: m.titre, theme: m.theme, niveau: m.niveau, ordre: m.ordre, archive_le: null })),
  academy_progression_lecons: [],
}

// ── Fonctions SQL simulees : une fonction par RPC, le corps POST en argument ─
export const ACADEMY_RPCS = {
  academy_catalogue: () => catalogue(),
  academy_module: (corps) => module(corps?.p_slug),
  academy_mon_parcours: () => monParcours(),
  academy_mes_tentatives: () => TENTATIVES,
  academy_mes_rappels: () => mesRappels(),
  academy_lecon: (corps) => lecon(corps?.p_lecon_id),
  academy_ouvrir_session: () => 'as-session-1',
  academy_battement: () => ({ session_id: 'as-session-1', intervalle_id: 'ai-1', duree_active_s: 30 }),
  academy_terminer_lecon: (corps) => ({ correcte: corps?.p_reponse === 1, explication: 'On écoute avant de proposer.', terminee_le: iso(0), statut_module: 'en_cours' }),
  academy_ouvrir_tentative: (corps) => ouvrirTentative(corps),
  academy_soumettre_tentative: (corps) => soumettreTentative(corps),
  academy_corrige: () => soumettreTentative({ p_reponses: { aq1: 1, aq2: 2, aq3: 0, aq4: 1, aq5: 0 } }),
  academy_pilotage: () => pilotage(),
  academy_fiche: (corps) => fiche(corps),
  academy_matrice_competences: () => matrice(),
  academy_admin_vue: () => adminVue(),
  academy_version_admin: (corps) => versionAdmin(corps),
  academy_affecter: () => 3,
  academy_modifier_echeance: () => null,
  academy_retirer_affectation: () => null,
  academy_creer_module: () => 'am-nouveau',
  academy_nouvelle_version: () => 'av-nouvelle',
  academy_enregistrer_version: () => null,
  academy_enregistrer_lecon: () => 'al-nouvelle',
  academy_enregistrer_question: () => 'aq-nouvelle',
  academy_publier_version: () => null,
  academy_archiver_version: () => null,
  academy_enregistrer_parcours: () => null,
}
