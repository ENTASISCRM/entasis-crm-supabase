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
// espacee, XP, serie, couronnes) et de
// supabase/migrations/20260922_academy_8*.sql (gamification et schemas :
// XP par reponse, combo, niveaux, succes, defis du jour, classement anonyme,
// figures SVG). Les corriges ne sont jamais servis : une session ouverte ne
// contient que les enonces (choix deja melanges), la correction n’arrive
// qu’avec academy_repondre, comme en vrai.
//
// Le SERVEUR decide de tout ce qui se compte : c’est donc ici que les XP,
// les combos, les niveaux, les succes et le classement se calculent, comme
// en base, et l’ecran ne fait que les animer.
//
// Tout est invente : decks, exercices, personnes, scores, schemas. Aucune
// donnee reelle, aucune remuneration.

// La meme normalisation que la base (academy_normaliser) pour corriger une
// saisie : le lib est en ESM, node l importe tel quel. niveauPour est le
// miroir client d academy_niveau (meme table de seuils) : il sert ici a
// rendre la forme exacte de niveau_avant et niveau_apres.
import { normaliserSaisie } from '../../src/lib/academy/exercices.js'
import { niveauPour } from '../../src/lib/academy/niveaux.js'

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

// ── Schemas des versions (academy_module_versions.schemas) ──────────────────
// Un schema est un texte SVG range en base : { cle, titre, svg, legende }.
// Il n’est jamais rendu tel quel, le client le passe par assainirSvg. Les
// dessins suivent le guide d’auteur de la spec : viewBox 0 0 640 360, fond
// blanc, palette du cabinet (navy #162443, gold #C5A55A, gold clair #F5EDD8,
// silver #8A95A8, charcoal #2C3548), police systeme, traits de 2 px, coins
// arrondis, texte assez gros pour rester lisible a 320 px de large.
const POLICE = 'system-ui, -apple-system, Segoe UI, sans-serif'

const FRISE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" font-family="${POLICE}">
  <title>Les cinq temps</title>
  <rect x="0" y="0" width="640" height="360" fill="#FFFFFF"/>
  <text x="28" y="46" font-size="26" fill="#162443">Les cinq temps, toujours dans cet ordre</text>
  <line x1="52" y1="78" x2="52" y2="324" stroke="#C5A55A" stroke-width="2"/>
  <circle cx="52" cy="100" r="16" fill="#C5A55A"/><text x="52" y="107" font-size="18" fill="#FFFFFF" text-anchor="middle">1</text>
  <rect x="84" y="78" width="528" height="44" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/>
  <text x="104" y="107" font-size="21" fill="#2C3548">Le premier appel · on écoute, on ne vend rien</text>
  <circle cx="52" cy="156" r="16" fill="#C5A55A"/><text x="52" y="163" font-size="18" fill="#FFFFFF" text-anchor="middle">2</text>
  <rect x="84" y="134" width="528" height="44" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/>
  <text x="104" y="163" font-size="21" fill="#2C3548">La découverte · situation, objectifs, horizon</text>
  <circle cx="52" cy="212" r="16" fill="#C5A55A"/><text x="52" y="219" font-size="18" fill="#FFFFFF" text-anchor="middle">3</text>
  <rect x="84" y="190" width="528" height="44" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/>
  <text x="104" y="219" font-size="21" fill="#2C3548">La proposition · une solution avec ses limites</text>
  <circle cx="52" cy="268" r="16" fill="#C5A55A"/><text x="52" y="275" font-size="18" fill="#FFFFFF" text-anchor="middle">4</text>
  <rect x="84" y="246" width="528" height="44" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/>
  <text x="104" y="275" font-size="21" fill="#2C3548">La signature · dossier complet, fiche à jour</text>
  <circle cx="52" cy="324" r="16" fill="#C5A55A"/><text x="52" y="331" font-size="18" fill="#FFFFFF" text-anchor="middle">5</text>
  <rect x="84" y="302" width="528" height="44" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/>
  <text x="104" y="331" font-size="21" fill="#2C3548">Le suivi · à trois mois, puis chaque année</text>
</svg>`

const PIECES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" font-family="${POLICE}">
  <title>Les pièces à réunir</title>
  <rect x="0" y="0" width="640" height="360" fill="#FFFFFF"/>
  <text x="28" y="46" font-size="26" fill="#162443">Les pièces à réunir avant la signature</text>
  <rect x="24" y="70" width="592" height="266" rx="8" fill="#FFFFFF" stroke="#8A95A8" stroke-width="2"/>
  <circle cx="56" cy="110" r="7" fill="#C5A55A"/><text x="80" y="117" font-size="21" fill="#2C3548">Pièce d’identité en cours de validité</text>
  <circle cx="56" cy="152" r="7" fill="#C5A55A"/><text x="80" y="159" font-size="21" fill="#2C3548">Justificatif de domicile de moins de trois mois</text>
  <circle cx="56" cy="194" r="7" fill="#C5A55A"/><text x="80" y="201" font-size="21" fill="#2C3548">Relevé d’identité bancaire</text>
  <circle cx="56" cy="236" r="7" fill="#C5A55A"/><text x="80" y="243" font-size="21" fill="#2C3548">Justificatif de revenus et origine des fonds</text>
  <circle cx="56" cy="278" r="7" fill="#C5A55A"/><text x="80" y="285" font-size="21" fill="#2C3548">Fiche client complète et à jour</text>
  <text x="28" y="352" font-size="18" fill="#8A95A8">Une pièce manquante retarde le dossier, jamais l’inverse.</text>
</svg>`

const VERSEMENT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" font-family="${POLICE}">
  <title>La vie d’un versement</title>
  <rect x="0" y="0" width="640" height="360" fill="#FFFFFF"/>
  <text x="28" y="46" font-size="26" fill="#162443">La vie d’un versement sur un PER</text>
  <rect x="24" y="110" width="176" height="150" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/>
  <text x="112" y="158" font-size="22" fill="#162443" text-anchor="middle">À l’entrée</text>
  <text x="112" y="194" font-size="19" fill="#2C3548" text-anchor="middle">déduit du revenu</text>
  <text x="112" y="220" font-size="19" fill="#2C3548" text-anchor="middle">imposable</text>
  <path d="M204 185 h20" stroke="#C5A55A" stroke-width="2"/><polygon points="222,179 234,185 222,191" fill="#C5A55A"/>
  <rect x="232" y="110" width="176" height="150" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/>
  <text x="320" y="158" font-size="22" fill="#162443" text-anchor="middle">Pendant</text>
  <text x="320" y="194" font-size="19" fill="#2C3548" text-anchor="middle">bloqué jusqu’à</text>
  <text x="320" y="220" font-size="19" fill="#2C3548" text-anchor="middle">la retraite</text>
  <path d="M412 185 h20" stroke="#C5A55A" stroke-width="2"/><polygon points="430,179 442,185 430,191" fill="#C5A55A"/>
  <rect x="440" y="110" width="176" height="150" rx="8" fill="#F5EDD8" stroke="#162443" stroke-width="2"/>
  <text x="528" y="158" font-size="22" fill="#162443" text-anchor="middle">À la sortie</text>
  <text x="528" y="194" font-size="19" fill="#2C3548" text-anchor="middle">imposé, capital</text>
  <text x="528" y="220" font-size="19" fill="#2C3548" text-anchor="middle">ou rente</text>
  <text x="28" y="318" font-size="19" fill="#8A95A8">Le blocage est la contrepartie de la déduction.</text>
</svg>`

// Deux schemas hostiles, sur le deck qui sert au scenario formation-svg-hostile.
// Le premier est refuse des la pre verification (balise script) : l ecran
// affiche « Schéma indisponible » et garde la legende. Le second passe la pre
// verification et se fait nettoyer par DOMPurify dans le navigateur (la balise
// animate sort de la liste blanche, l attribut tabindex est interdit) : il doit
// s afficher, propre, sans rien d executable.
const PIEGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" onload="window.__academy_xss = 'onload'" font-family="${POLICE}">
  <title>Schéma piégé</title>
  <script>window.__academy_xss = 'script'</script>
  <foreignObject x="0" y="0" width="640" height="360"><div xmlns="http://www.w3.org/1999/xhtml">Texte injecté</div></foreignObject>
  <rect x="0" y="0" width="640" height="360" fill="#FFFFFF"/>
  <text x="28" y="60" font-size="24" fill="#162443">Ce dessin ne doit jamais s’afficher</text>
</svg>`

const ENVELOPPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" tabindex="0" font-family="${POLICE}">
  <title>Une enveloppe, deux moteurs</title>
  <rect x="0" y="0" width="640" height="360" fill="#FFFFFF"/>
  <animate attributeName="opacity" values="1;0;1" dur="900ms" repeatCount="indefinite"/>
  <text x="28" y="46" font-size="26" fill="#162443">Une enveloppe, deux moteurs</text>
  <rect x="28" y="76" width="584" height="204" rx="8" fill="#FFFFFF" stroke="#162443" stroke-width="2"/>
  <text x="48" y="112" font-size="21" fill="#162443">L’assurance vie</text>
  <rect x="60" y="132" width="240" height="124" rx="8" fill="#F5EDD8" stroke="#8A95A8" stroke-width="2"/>
  <text x="180" y="184" font-size="21" fill="#2C3548" text-anchor="middle">Fonds en euros</text>
  <text x="180" y="216" font-size="18" fill="#8A95A8" text-anchor="middle">capital garanti</text>
  <rect x="340" y="132" width="240" height="124" rx="8" fill="#F5EDD8" stroke="#8A95A8" stroke-width="2"/>
  <text x="460" y="184" font-size="21" fill="#2C3548" text-anchor="middle">Unités de compte</text>
  <text x="460" y="216" font-size="18" fill="#8A95A8" text-anchor="middle">valeur qui varie</text>
  <text x="28" y="330" font-size="19" fill="#8A95A8">La clause bénéficiaire se relit à chaque événement de famille.</text>
</svg>`

const SCHEMAS = {
  av1: [
    { cle: 'frise', titre: 'Les cinq temps', svg: FRISE_SVG, legende: 'L’ordre ne change pas : aucun produit avant d’avoir compris la situation.' },
    { cle: 'pieces', titre: 'Les pièces à réunir', svg: PIECES_SVG, legende: 'Une signature se prépare : la fiche client se complète avant, jamais après.' },
  ],
  av2: [
    { cle: 'versement', titre: 'La vie d’un versement', svg: VERSEMENT_SVG, legende: 'Ce qui est déduit à l’entrée est imposé à la sortie.' },
  ],
  av3: [
    { cle: 'piege', titre: 'Schéma piégé', svg: PIEGE_SVG, legende: 'Ce schéma porte un script : il doit être refusé et la légende rester lisible.' },
    { cle: 'enveloppe', titre: 'Une enveloppe, deux moteurs', svg: ENVELOPPE_SVG, legende: 'Le fonds en euros garantit le capital, les unités de compte varient.' },
  ],
}

// Les items servis par la simulation sont toujours ceux de la methode
// (ITEMS_SESSION plus bas) : une version inconnue recoit donc les schemas de
// av1, pour qu’une figure appelee par « ref » se resolve toujours.
const schemasDe = (versionId) => SCHEMAS[versionId] || SCHEMAS.av1

const MEMO_MD = `## Les cinq temps

Un accompagnement Entasis se déroule en cinq temps, toujours dans le même ordre :

1. **Le premier appel** : on écoute, on ne vend rien.
2. **La découverte** : la situation, les objectifs, l’horizon.
3. **La proposition** : une solution, expliquée avec ses limites.
4. **La signature** : le dossier complet, la fiche client à jour.
5. **Le suivi** : un point à trois mois, puis chaque année.

[schema:frise]

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
    // academy_module rend les schemas de la version : le memo pose chaque
    // figure la ou son marqueur l appelle, les autres a la fin.
    schemas: schemasDe(m.version_id),
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

// ── Gamification : niveau, succes, defis du jour, classement ────────────────
// Le collaborateur simule totalise 930 XP (niveau 5, « Solide », 70 XP avant
// Expert) et 320 XP cette semaine. Il n a pas encore joue aujourd hui
// (SERIE.sessions_aujourdhui vaut zero, la serie est en danger) : les trois
// defis du jour sont donc tous a zero et le rappel « defis du jour » tombe,
// exactement comme en base.
const XP_TOTAL = 930
const XP_SEMAINE = 320

// Le catalogue seme par la migration 8, dans l ordre, avec la date d obtention
// ou null. Huit succes acquis sur vingt et un ; « Six d’affilée » et
// « Centurion » restent a gagner, c est la session du bilan qui les debloque.
// Aucun succes secret au catalogue du cabinet.
const SUCCES = [
  { code: 'premiere_session', titre: 'Premier pas', description: 'Terminer une première session.', icone: 'pas', ordre: 10, secret: false, obtenu_le: iso(-34) },
  { code: 'session_parfaite', titre: 'Sans faute', description: 'Réussir les douze exercices d’une session.', icone: 'cible', ordre: 20, secret: false, obtenu_le: iso(-1) },
  { code: 'combo_6', titre: 'Six d’affilée', description: 'Enchaîner six bonnes réponses dans une session.', icone: 'eclair', ordre: 30, secret: false, obtenu_le: null },
  { code: 'premiere_couronne', titre: 'Première couronne', description: 'Gagner une couronne sur un deck.', icone: 'couronne', ordre: 40, secret: false, obtenu_le: iso(-34) },
  { code: 'deck_valide', titre: 'Deck validé', description: 'Atteindre trois couronnes sur un deck.', icone: 'bouclier', ordre: 50, secret: false, obtenu_le: iso(-33) },
  { code: 'cinq_couronnes', titre: 'Par cœur', description: 'Atteindre cinq couronnes sur un deck.', icone: 'etoile', ordre: 60, secret: false, obtenu_le: null },
  { code: 'trois_decks', titre: 'Trilogie', description: 'Valider trois decks.', icone: 'livres', ordre: 70, secret: false, obtenu_le: null },
  { code: 'tous_decks', titre: 'Encyclopédie', description: 'Valider tous les decks publiés, au moins cinq.', icone: 'bibliotheque', ordre: 80, secret: false, obtenu_le: null },
  { code: 'serie_3', titre: 'Trois jours', description: 'Tenir une série de trois jours.', icone: 'flamme', ordre: 90, secret: false, obtenu_le: iso(-20) },
  { code: 'serie_7', titre: 'Une semaine', description: 'Tenir une série de sept jours.', icone: 'flamme', ordre: 100, secret: false, obtenu_le: iso(-16) },
  { code: 'serie_30', titre: 'Un mois', description: 'Tenir une série de trente jours.', icone: 'flamme', ordre: 110, secret: false, obtenu_le: null },
  { code: 'dix_sessions', titre: 'Dix sessions', description: 'Terminer dix sessions.', icone: 'compteur', ordre: 120, secret: false, obtenu_le: iso(-2) },
  { code: 'cinquante_sessions', titre: 'Cinquante sessions', description: 'Terminer cinquante sessions.', icone: 'compteur', ordre: 130, secret: false, obtenu_le: null },
  { code: 'cent_justes', titre: 'Centurion', description: 'Cumuler cent bonnes réponses.', icone: 'medaille', ordre: 140, secret: false, obtenu_le: null },
  { code: 'cinq_cents_justes', titre: 'Marathon', description: 'Cumuler cinq cents bonnes réponses.', icone: 'medaille', ordre: 150, secret: false, obtenu_le: null },
  { code: 'leve_tot', titre: 'Lève tôt', description: 'Terminer une session avant 8 h.', icone: 'soleil', ordre: 160, secret: false, obtenu_le: null },
  { code: 'noctambule', titre: 'Noctambule', description: 'Terminer une session après 21 h.', icone: 'lune', ordre: 170, secret: false, obtenu_le: null },
  { code: 'rattrapage', titre: 'Retour en force', description: 'Faire passer un deck de « à revoir » à « validé ».', icone: 'fleche', ordre: 180, secret: false, obtenu_le: null },
  { code: 'journee_pleine', titre: 'Journée pleine', description: 'Réussir les trois défis d’un même jour.', icone: 'calendrier', ordre: 190, secret: false, obtenu_le: null },
  { code: 'niveau_5', titre: 'Solide', description: 'Atteindre le niveau 5.', icone: 'palier', ordre: 200, secret: false, obtenu_le: iso(-1) },
  { code: 'niveau_10', titre: 'Légende', description: 'Atteindre le niveau 10.', icone: 'palier', ordre: 210, secret: false, obtenu_le: null },
]

const OBTENUS = SUCCES.filter((s) => s.obtenu_le)

// Ce que rend academy_mes_succes : tout le catalogue, dans l ordre, chacun
// avec sa date d obtention ou null.
const mesSucces = () => SUCCES.map((s) => ({ ...s }))

// Les trois defis du jour, tires de la date : les memes pour tout le cabinet.
// Progression a zero puisque aucune session n est terminee aujourd hui.
const defisDuJour = () => [
  { code: 'sessions_2', titre: 'Deux sessions aujourd’hui', description: 'Terminer deux sessions aujourd’hui.', cible: 2, xp: 30, progression: 0, fait: false },
  { code: 'justes_15', titre: 'Quinze bonnes réponses', description: 'Donner quinze bonnes réponses dans des sessions terminées.', cible: 15, xp: 30, progression: 0, fait: false },
  { code: 'combo_5', titre: 'Combo de cinq', description: 'Enchaîner cinq bonnes réponses dans une session.', cible: 5, xp: 25, progression: 0, fait: false },
]

// Le classement anonyme de la semaine : un rang, un nombre de participants et
// deux ecarts, jamais un nom ni l identifiant d un collegue. Le premier est a
// 40 XP, la place au dessus a 10 XP : la phrase d encouragement du client
// prefere la place au dessus, qui est a portee.
const classementSemaine = (xpSemaine) => ({
  semaine: lundi(0), rang: 3, participants: 9,
  xp_moi: xpSemaine, xp_premier: xpSemaine + 40, xp_devant: xpSemaine + 10, ecart_premier: 40,
})

const monParcours = () => ({
  aujourdhui: AUJOURDHUI,
  serie: SERIE,
  xp: { total: XP_TOTAL, aujourdhui: 0, semaine: XP_SEMAINE },
  niveau: niveauPour(XP_TOTAL),
  defis: defisDuJour(),
  classement: classementSemaine(XP_SEMAINE),
  succes: {
    obtenus: OBTENUS.length, total: SUCCES.length,
    recents: [...OBTENUS].sort((a, b) => String(b.obtenu_le).localeCompare(String(a.obtenu_le))).slice(0, 3)
      .map(({ code, titre, icone, obtenu_le }) => ({ code, titre, icone, obtenu_le })),
  },
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
  serie: SERIE.serie, meilleure: SERIE.meilleure, xp_total: XP_TOTAL,
  niveau: niveauPour(XP_TOTAL),
  succes: mesSucces(),
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
  // Aucune session terminee aujourd hui : les trois defis du jour restent
  // ouverts, la cloche le dit une seule fois pour les trois.
  { type: 'defis_du_jour', nombre: defisDuJour().filter((d) => !d.fait).length, echeance: AUJOURDHUI, titres: defisDuJour().map((d) => d.titre) },
  { type: 'affectations_en_retard', nombre: 1, echeance: jour(-3), titres: ['Assurance vie'] },
  { type: 'echeances_proches', nombre: 1, echeance: jour(5), titres: ['PER et retraite'] },
]

// Une figure propre a un exercice (payload.figure = { svg, alt }), par
// opposition a une figure qui renvoie a un schema de la version par sa cle.
const FICHE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" font-family="${POLICE}">
  <title>La fiche client à la signature</title>
  <rect x="0" y="0" width="640" height="360" fill="#FFFFFF"/>
  <text x="28" y="46" font-size="26" fill="#162443">Ce que la fiche porte à la signature</text>
  <rect x="28" y="80" width="584" height="240" rx="8" fill="#FFFFFF" stroke="#162443" stroke-width="2"/>
  <text x="52" y="128" font-size="21" fill="#2C3548">Identité et situation de famille</text>
  <text x="52" y="170" font-size="21" fill="#2C3548">Statut professionnel et revenus</text>
  <text x="52" y="212" font-size="21" fill="#2C3548">Objectifs et horizon</text>
  <text x="52" y="254" font-size="21" fill="#2C3548">Origine des fonds</text>
  <line x1="52" y1="278" x2="588" y2="278" stroke="#8A95A8" stroke-width="2"/>
  <text x="52" y="306" font-size="19" fill="#C5A55A">Une ligne vide retarde la signature.</text>
</svg>`

// ── Une session d’entrainement : douze items couvrant les huit types ─────────
// Les choix, elements et colonne de droite sont deja dans l’ordre presente
// (le serveur les a melanges). Le corrige local ne sort jamais dans la
// reponse de academy_demarrer_entrainement : il ne sert qu’a academy_repondre.
// Trois items portent une figure : deux renvoient a un schema de la version
// par sa cle (payload.figure = { ref }), le troisieme porte son propre SVG.
const ITEMS_SESSION = [
  { item_id: 'ai1', type: 'choix', competence: 'Les cinq temps', difficulte: 1, payload: { enonce: 'Quel est le premier temps d’un accompagnement Entasis ?', choix: ['La proposition', 'Le premier appel', 'La signature', 'Le suivi'] } },
  { item_id: 'ai2', type: 'vrai_faux', competence: 'Le premier appel', difficulte: 1, payload: { enonce: 'Le premier appel sert à prendre rendez vous, pas à vendre.' } },
  { item_id: 'ai3', type: 'choix', competence: 'Le suivi', difficulte: 2, payload: { enonce: 'Quand a lieu le premier point de suivi ?', choix: ['À un mois', 'À trois mois', 'À un an', 'Jamais'], figure: { ref: 'frise' } } },
  { item_id: 'ai4', type: 'multi', competence: 'La découverte', difficulte: 2, payload: { enonce: 'Que recueille t on pendant la découverte ? (plusieurs réponses)', choix: ['La situation', 'Le produit souhaité', 'Les objectifs', 'L’horizon'] } },
  { item_id: 'ai5', type: 'ordre', competence: 'Les cinq temps', difficulte: 2, payload: { enonce: 'Remets les cinq temps dans l’ordre.', elements: ['La signature', 'Le premier appel', 'Le suivi', 'La découverte', 'La proposition'], figure: { ref: 'frise' } } },
  { item_id: 'ai6', type: 'association', competence: 'Les cinq temps', difficulte: 3, payload: { enonce: 'Associe chaque temps à ce qu’on y fait.', gauche: ['Le premier appel', 'La proposition', 'Le suivi'], droite: ['Un point à trois mois', 'On écoute, on ne vend rien', 'Une solution avec ses limites'] } },
  { item_id: 'ai7', type: 'trou_choix', competence: 'La signature', difficulte: 1, payload: { phrase: 'À la signature, la fiche client doit être ___.', choix: ['à jour', 'archivée', 'vide'], figure: { svg: FICHE_SVG, alt: 'Les quatre blocs d’une fiche client complète.' } } },
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
  ai8: { bonne: ['année', 'an'], test: (r) => ['année', 'an'].map(normaliserSaisie).includes(normaliserSaisie(r)) },
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

// ── L etat de la session en cours ────────────────────────────────────────────
// Le serveur decide de tout ce qui se compte : c est donc ici que l XP et le
// combo se calculent, avec la regle d academy_repondre (10 par bonne reponse,
// 5 pour une carte sue, +5 des que le combo atteint trois, 0 sur une erreur
// qui remet le combo a zero). Chaque reponse retenue porte son XP et son
// combo, comme une ligne d academy_entrainement_reponses. La session vit le
// temps d un scenario ; chaque page neuve la rouvre.
//
// Trois profils, choisis par l identifiant passe dans la route, tous sur le
// deck de la methode (les douze items ci dessus en sont les exercices) :
//   av1          une session neuve, rien de joue ;
//   av1-reprise  une session ouverte reprise : deux reponses deja
//                enregistrees, 20 XP acquis et un combo de deux, le premier
//                exercice restant portant une figure ;
//   av1-bilan    une session entierement repondue : la vue va droit au bilan
//                (onze bonnes reponses sur douze, un combo maximum de huit).
// Tout autre identifiant est un deck ordinaire, session neuve.
const PROFILS_SESSION = {
  av1: { version: 'av1', deja: [] },
  'av1-reprise': { version: 'av1', deja: [['ai1', true], ['ai2', true]] },
  'av1-bilan': {
    version: 'av1',
    deja: [['ai1', true], ['ai2', true], ['ai3', true], ['ai4', false], ['ai5', true], ['ai6', true],
      ['ai7', true], ['ai8', true], ['ai9', true], ['ai10', true], ['ai11', true], ['ai12', true]],
  },
}

let session = null

const typeDe = (itemId) => ITEMS_SESSION.find((x) => x.item_id === itemId)?.type || 'choix'
const enonceDe = (itemId) => {
  const it = ITEMS_SESSION.find((x) => x.item_id === itemId)
  return (it?.payload.enonce || it?.payload.phrase || it?.payload.recto || '').slice(0, 120)
}

/** La note d une reponse : son XP et le combo apres elle, comme en base. */
function noter(itemId, correcte, comboAvant) {
  const combo = correcte ? comboAvant + 1 : 0
  const base = typeDe(itemId) === 'carte' ? 5 : 10
  return { item_id: itemId, correcte, combo, xp: correcte ? base + (combo >= 3 ? 5 : 0) : 0 }
}

function ouvrirSession(profil) {
  const reponses = []
  let combo = 0
  for (const [itemId, correcte] of profil.deja) {
    const note = noter(itemId, correcte, combo)
    combo = note.combo
    reponses.push(note)
  }
  session = { version: profil.version, reponses }
}

const reponsesSession = () => (session ? session.reponses : [])
const xpSession = () => reponsesSession().reduce((n, r) => n + r.xp, 0)
const comboCourant = () => (reponsesSession().length ? reponsesSession()[reponsesSession().length - 1].combo : 0)
const comboMax = () => reponsesSession().reduce((n, r) => Math.max(n, r.combo), 0)

const demarrerEntrainement = (corps) => {
  const demande = corps?.p_version_id || 'av1'
  const profil = PROFILS_SESSION[demande] || { version: demande, deja: [] }
  const m = MODULES.find((x) => x.version_id === profil.version) || MODULES[0]
  ouvrirSession(profil)
  return {
    entrainement_id: 'ae-ouverte', version_id: m.version_id, titre: m.titre, slug: m.slug,
    demarree_le: iso(0), terminee_le: null,
    items: ITEMS_SESSION.map((it, i) => ({ ...it, rang: i + 1 })),
    reponses_deja: reponsesSession().map(({ item_id, correcte }) => ({ item_id, correcte })),
    // Reprise : le compteur du haut repart de ce qui est deja acquis.
    xp_session: xpSession(), combo: comboCourant(),
    // Les schemas de la version, pour que le client resolve une figure { ref }.
    schemas: schemasDe(m.version_id),
  }
}

const repondre = (corps) => {
  const itemId = corps?.p_item_id
  const c = CORRIGE[itemId]
  const explication = EXPLICATIONS[itemId] || ''
  if (!c || !session) return { correcte: false, bonne_reponse: null, explication: '', force: 0, deja: false, xp_gagne: 0, xp_session: xpSession(), combo: 0, combo_max: comboMax() }
  // Idempotence : une reponse deja enregistree est rendue telle quelle, avec
  // l XP et le combo memorises ; elle ne rapporte rien de neuf.
  const deja = reponsesSession().find((r) => r.item_id === itemId)
  if (deja) {
    return {
      correcte: deja.correcte, bonne_reponse: c.bonne, explication, force: deja.correcte ? 2 : 1, deja: true,
      xp_gagne: deja.xp, xp_session: xpSession(), combo: deja.combo, combo_max: comboMax(),
    }
  }
  const correcte = !!c.test(corps?.p_reponse)
  const note = noter(itemId, correcte, comboCourant())
  session.reponses.push(note)
  return {
    correcte, bonne_reponse: c.bonne, explication, force: correcte ? 2 : 1, deja: false,
    xp_gagne: note.xp, xp_session: xpSession(), combo: note.combo, combo_max: comboMax(),
  }
}

const terminerEntrainement = () => {
  const reponses = reponsesSession()
  const total = reponses.length
  const bons = reponses.filter((r) => r.correcte).length
  const parfaite = total > 0 && bons === total
  const max = comboMax()
  const xpBase = reponses.reduce((n, r) => n + (r.correcte ? (typeDe(r.item_id) === 'carte' ? 5 : 10) : 0), 0)
  const xpCombo = reponses.reduce((n, r) => n + (r.correcte && r.combo >= 3 ? 5 : 0), 0)
  // Les trois defis du jour recalcules avec la session qui se termine : seul
  // « Combo de cinq » peut tomber ici, et il n est credite qu une fois.
  const defis = defisDuJour().map((d) => {
    if (d.code !== 'combo_5') return { ...d, fait_par_cette_session: false }
    const progression = Math.min(d.cible, max)
    return { ...d, progression, fait: progression >= d.cible, fait_par_cette_session: progression >= d.cible }
  })
  const xpDefis = defis.filter((d) => d.fait_par_cette_session).reduce((n, d) => n + d.xp, 0)
  const xp = xpBase + xpCombo + (parfaite ? 20 : 0) + 10 + xpDefis
  // Les succes que cette session debloque : le combo de six, et le centieme
  // cumul de bonnes reponses, que le collaborateur simule franchit des que la
  // session en apporte dix.
  const debloques = [max >= 6 ? 'combo_6' : null, bons >= 10 ? 'cent_justes' : null].filter(Boolean)
  return {
    entrainement_id: 'ae-ouverte', version_id: 'av1', nb_bons: bons, nb_total: total, xp,
    premiere_du_jour: true, serie: SERIE.serie + 1, meilleure_serie: Math.max(SERIE.meilleure, SERIE.serie + 1),
    couronnes_avant: 3, couronnes_apres: parfaite ? 4 : 3, valide: false,
    attestation: ATTESTATION_AV1 ? { numero: ATTESTATION_AV1.numero, delivree_le: ATTESTATION_AV1.delivree_le } : null,
    erreurs: reponses.filter((r) => !r.correcte).map((r) => ({
      item_id: r.item_id, competence: ITEMS_SESSION.find((x) => x.item_id === r.item_id)?.competence || '', enonce_court: enonceDe(r.item_id),
    })),
    statut_module: 'valide', terminee_le: iso(0), xp_total_version: 610 + xp,
    xp_detail: {
      reponses: xpBase, combo: xpCombo, parfaite: parfaite ? 20 : 0, premiere_du_jour: 10, defis: xpDefis, total: xp,
    },
    combo_max: max,
    niveau_avant: niveauPour(XP_TOTAL),
    niveau_apres: niveauPour(XP_TOTAL + xp),
    succes_debloques: debloques.map((code) => SUCCES.find((s) => s.code === code))
      .map(({ code, titre, description, icone }) => ({ code, titre, description, icone })),
    defis,
    classement: classementSemaine(XP_SEMAINE + xp),
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
    // Le brouillon rejoue les items de la methode : il en garde donc les
    // schemas, pour que la figure d un exercice se resolve par sa cle.
    schemas: schemasDe(id),
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
  academy_mes_succes: () => mesSucces(),
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
