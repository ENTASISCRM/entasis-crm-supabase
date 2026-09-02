// tests/visuel/harnais.mjs
//
// Harnais de controle visuel : une session simulee et des donnees fictives.
//
// Le CRM se connecte a Supabase, la RLS est la seule couche d autorisation.
// Pour ouvrir les ecrans au navigateur sans base ni compte, on fait deux
// choses : on ecrit une session factice dans la cle de stockage du client
// Supabase (entasis-auth-v1), puis on intercepte chaque appel reseau vers
// Supabase et vers l API du site pour repondre avec les jeux de donnees ci
// dessous, et on coupe tout le reste. Rien ne sort du navigateur.
//
// Toutes les personnes citees ici sont inventees. Aucun nom reel, aucune
// donnee client reelle : ces jeux servent uniquement a peupler l ecran.
//
// Usage :
//   import { pageDemo } from './harnais.mjs'
//   const page = await pageDemo(browser, { role: 'conseiller' })   // 'manager', 'rh'
//   await page.goto(`${url}/#/dashboard`)

const ANNEE = new Date().getFullYear()
const MOIS_COURANT = new Date().getMonth() // 0 pour janvier
const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE']
const dateDuMois = (indice, jour) => `${ANNEE}-${String(indice + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`

// ── Personnes fictives ───────────────────────────────────────────────────────
export const NOMS = ['Camille Exemple', 'Dominique Modèle', 'Aurélie Fictive', 'Claude Témoin', 'Sacha Démo', 'Andrea Specimen', 'Noa Échantillon', 'Lou Prototype']

export const CLIENTS = NOMS.map((n, i) => ({
  id: `c${i}`, nom: n, prenom: null,
  email: i % 3 === 0 ? null : `exemple${i}@demo.fr`,
  telephone: i % 2 === 0 ? null : '06 00 00 00 0' + i,
  age: null, date_naissance: null,
  nb_enfants: i === 6 ? 2 : 0, situation_familiale: i === 6 ? 'Marié' : null,
  statut_pro: i === 5 ? 'TNS' : null, profession: null,
  revenus_annuels: null, patrimoine_estime: null, objectifs: null, notes: null,
  adresse: null, code_postal: null, ville: null,
  advisor_code: i % 2 === 0 ? 'DEMO' : 'TEMO', co_advisor_code: null,
  created_at: dateDuMois(0, 15),
}))

// Colonnes du join clients(...) que le service deals ramene avec chaque dossier
const jointureClient = (c) => ({
  id: c.id, nom: c.nom, prenom: c.prenom, email: c.email, telephone: c.telephone,
  age: c.age, situation_familiale: c.situation_familiale, nb_enfants: c.nb_enfants,
  profession: c.profession, revenus_annuels: c.revenus_annuels,
  patrimoine_estime: c.patrimoine_estime, objectifs: c.objectifs, notes: c.notes,
  advisor_code: c.advisor_code, co_advisor_code: c.co_advisor_code,
})

// Un dossier signe et un dossier en cours par mois ecoule, jusqu au mois courant
// inclus, pour que l accueil du mois et le pipeline aient quelque chose a montrer.
export const DEALS = []
for (let i = 0; i <= MOIS_COURANT; i++) {
  const signe = CLIENTS[i % 8]
  const encours = CLIENTS[(i + 3) % 8]
  DEALS.push({
    id: `s${i}`, client_id: signe.id, client: signe.nom, clients: jointureClient(signe),
    product: i % 3 === 0 ? 'Assurance Vie Française' : 'PER Individuel', notes: '',
    status: 'Signé', date_signed: dateDuMois(i, 10), date_rdv: dateDuMois(i, 3),
    advisor_code: signe.advisor_code, co_advisor_code: null,
    pp_m: 150 + i * 40, pu: i % 4 === 0 ? 5000 : 0, month: MOIS[i],
    priority: 'Normale', source: 'Téléprospection', created_at: `${dateDuMois(i, 2)}T09:00:00Z`,
  })
  DEALS.push({
    id: `p${i}`, client_id: encours.id, client: encours.nom, clients: jointureClient(encours),
    product: i % 2 === 0 ? 'Prévoyance TNS' : 'Assurance Vie Française', notes: 'Pièces en attente',
    status: i % 3 === 2 ? 'Prévu' : 'En cours', date_signed: null, date_rdv: dateDuMois(i, 20),
    advisor_code: encours.advisor_code, co_advisor_code: null,
    pp_m: 60 + i * 10, pu: 0, month: MOIS[i],
    priority: i % 4 === 1 ? 'Haute' : 'Normale', source: 'Recommandation', created_at: `${dateDuMois(i, 12)}T09:00:00Z`,
    updated_at: `${dateDuMois(i, 12)}T09:00:00Z`,
  })
}

// Un instant il y a N jours, pour les jeux qui dependent du jour ou tourne
// le controle (dossier sans mouvement, leads recents, cibles de campagne).
const ilYA = (jours) => new Date(Date.now() - jours * 86400000).toISOString()

// Un dossier en cours sans mouvement depuis 40 jours, quel que soit le mois :
// le bloc « Dossiers sans mouvement » de l accueil a toujours une ligne.
DEALS.push({
  id: 'stagnant-1', client_id: CLIENTS[0].id, client: CLIENTS[0].nom, clients: jointureClient(CLIENTS[0]),
  product: 'PER Individuel', notes: '', status: 'En cours', date_signed: null, date_rdv: null,
  advisor_code: 'DEMO', co_advisor_code: null, pp_m: 80, pu: 0, month: MOIS[MOIS_COURANT],
  priority: 'Normale', source: 'Recommandation', created_at: ilYA(60), updated_at: ilYA(40),
})

// ── Leads entrants (copie CRM de la Lead Room), tous inventes ───────────────
export const LEADS = [
  { id: 'l1', nom: 'Lead Exemple', telephone: '0611000001', email: 'lead1@demo.fr', campagne: 'PER', status: 'available', taken_by: null, taken_at: null, booked_at: null, email_confirmed: 'true', created_at: ilYA(0.2), updated_at: ilYA(0.2) },
  { id: 'l2', nom: 'Lead Pris', telephone: '0611000002', email: 'lead2@demo.fr', campagne: 'Prévoyance', status: 'taken', taken_by: 'u-demo', taken_at: ilYA(1), booked_at: null, email_confirmed: 'true', created_at: ilYA(2), updated_at: ilYA(1) },
  { id: 'l3', nom: 'Lead Collègue', telephone: '0611000003', email: null, campagne: 'SCPI', status: 'taken', taken_by: 'u-temoin', taken_at: ilYA(3), booked_at: ilYA(2), email_confirmed: 'false', created_at: ilYA(4), updated_at: ilYA(2) },
]

// ── Smart RH : une demande a valider, pour voir la file de decision ────────
// Le conge payé en attente sert au geste « En sans solde » de la direction.
export const CONGES = [
  {
    id: 'cg1', demandeur_id: 'u-conseiller', demandeur_nom: 'Conseiller Démo', advisor_code: 'DEMO',
    type: 'Congé payé', date_debut: dateDuMois(MOIS_COURANT, 21), date_fin: dateDuMois(MOIS_COURANT, 25),
    demi_journee: false, motif: 'Vacances en famille', statut: 'en_attente',
    decision_par: null, decision_le: null, decision_motif: null, created_at: ilYA(2),
    contre_date_debut: null, contre_date_fin: null, contre_demi_journee: null, contre_message: null,
  },
  {
    id: 'cg2', demandeur_id: 'u-temoin', demandeur_nom: 'Conseiller Témoin', advisor_code: 'TEMO',
    type: 'Maladie', date_debut: dateDuMois(MOIS_COURANT, 8), date_fin: dateDuMois(MOIS_COURANT, 9),
    demi_journee: false, motif: null, statut: 'valide',
    decision_par: 'Direction Démo', decision_le: ilYA(5), decision_motif: null, created_at: ilYA(6),
    contre_date_debut: null, contre_date_fin: null, contre_demi_journee: null, contre_message: null,
  },
]

// ── Campagnes ciblees : une campagne en cours, une cible pour le conseiller ─
export const CAMPAGNES = [{
  id: 'cp1', nom: 'Prévoyance TNS', criteres: { statuts: ['TNS'], famillesAbsentes: ['prevoyance'] },
  sequence_key: 'relance_devis', accroche: 'Un mot sur la protection de vos revenus.',
  created_by: 'u-demo', created_at: ilYA(3), cloturee_at: null,
}]
// Le service joint clients(...) et campagnes(...) : le harnais ne fait pas de
// jointure, les objets joints sont poses directement sur la ligne.
export const CIBLES = [{
  id: 'ct1', campagne_id: 'cp1', client_id: CLIENTS[5].id, advisor_code: 'DEMO', statut: 'a_contacter',
  note: null, updated_at: ilYA(3), updated_by: 'u-demo',
  clients: { id: CLIENTS[5].id, nom: CLIENTS[5].nom, prenom: null, telephone: CLIENTS[5].telephone, email: CLIENTS[5].email },
  campagnes: CAMPAGNES[0],
}]

export const FAMILLES = [
  { key: 'per', label: 'PER', couleur: '#C9A961', ordre: 1 },
  { key: 'av', label: 'Assurance vie', couleur: '#0A1628', ordre: 2 },
  { key: 'prevoyance', label: 'Prévoyance', couleur: '#4a7a52', ordre: 3 },
]

export const EQUIPEMENT = CLIENTS.map((c, i) => ({
  client_id: c.id, nom: c.nom, prenom: null, advisor_code: c.advisor_code, co_advisor_code: null,
  profession: null, statut_pro: c.statut_pro, revenus_annuels: null, patrimoine_estime: null,
  familles: i % 2 === 0 ? ['per'] : ['av'], nb_familles: 1, absences_confirmees: [],
  dernier_deal_signe: dateDuMois(Math.max(0, MOIS_COURANT - 1), 10), nb_enfants: c.nb_enfants,
  situation_familiale: c.situation_familiale, foyer_id: null,
  prochain_rdv: null, plan_equipement: null, profil_approche: null, ailleurs_familles: [],
  adresse: null, code_postal: null, telephone: c.telephone,
}))

export const OBJECTIFS = MOIS.map((m) => ({ id: `o-${m}`, month: m, pp_target: 1500, pu_target: 20000 }))

// Dossiers transmis aux referents immobilier (cles de src/config/partenairesImmo.js)
export const DOSSIERS_IMMO = [
  {
    id: 'di1', client_id: 'c1', client_nom: NOMS[1], client_email: 'exemple1@demo.fr', client_telephone: null,
    partenaire: 'althera', statut_pipeline: 'transmis', transmis_le: `${dateDuMois(MOIS_COURANT, 1)}T10:00:00Z`,
    objectif: 'Réduire l impôt', dispositif_retenu: 'Pinel', budget_total: 250000, apport: 30000, notes: '',
    advisor_code: 'DEMO', conseiller_nom: 'Conseiller Démo',
    created_at: `${dateDuMois(MOIS_COURANT, 1)}T10:00:00Z`, updated_at: `${dateDuMois(MOIS_COURANT, 1)}T10:00:00Z`,
  },
  {
    id: 'di2', client_id: 'c4', client_nom: NOMS[4], client_email: null, client_telephone: null,
    partenaire: 'francois1er', statut_pipeline: 'etude', transmis_le: `${dateDuMois(Math.max(0, MOIS_COURANT - 1), 18)}T10:00:00Z`,
    objectif: 'Préparer la retraite', dispositif_retenu: 'LMNP', budget_total: 180000, apport: null, notes: '',
    advisor_code: 'DEMO', conseiller_nom: 'Conseiller Démo',
    created_at: `${dateDuMois(Math.max(0, MOIS_COURANT - 1), 18)}T10:00:00Z`, updated_at: `${dateDuMois(Math.max(0, MOIS_COURANT - 1), 18)}T10:00:00Z`,
  },
]

// Dossiers de conformite (le client vit dans reponses.situation)
export const CONFORMITE = [
  {
    id: 'cf1', client_id: 'c0', advisor_code: 'DEMO', statut: 'genere',
    reponses: { situation: { prenom: 'Camille', nom: 'Exemple', email: null } },
    created_at: `${dateDuMois(MOIS_COURANT, 2)}T09:00:00Z`, updated_at: `${dateDuMois(MOIS_COURANT, 2)}T09:30:00Z`,
  },
  {
    id: 'cf2', client_id: 'c2', advisor_code: 'DEMO', statut: 'brouillon',
    reponses: { situation: { prenom: 'Aurélie', nom: 'Fictive', email: 'exemple2@demo.fr' } },
    created_at: `${dateDuMois(MOIS_COURANT, 1)}T09:00:00Z`, updated_at: `${dateDuMois(MOIS_COURANT, 1)}T11:00:00Z`,
  },
]

// ── Session et profils ───────────────────────────────────────────────────────
export const USER = { id: 'u-demo', email: 'demo@exemple.fr', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: `${ANNEE}-01-01T00:00:00Z` }

export const PROFIL_CONSEILLER = { id: 'u-demo', email: 'demo@exemple.fr', full_name: 'Conseiller Démo', role: 'conseiller', advisor_code: 'DEMO', is_active: true, rh_delegue: false }
export const PROFIL_MANAGER = { id: 'u-demo', email: 'demo@exemple.fr', full_name: 'Direction Démo', role: 'manager', advisor_code: 'DIR', is_active: true, rh_delegue: true }
// Deleguee RH : conseillere, pas manager, mais rh_delegue a vrai. Elle doit
// voir et tenir la file de validation des conges comme la direction.
export const PROFIL_RH = { id: 'u-demo', email: 'demo@exemple.fr', full_name: 'Responsable RH Démo', role: 'advisor', advisor_code: 'RHD', is_active: true, rh_delegue: true }

// L equipe telle que la renvoie la RPC team_directory
const AUTRE_CONSEILLER = { id: 'u-temoin', email: 'temoin@exemple.fr', full_name: 'Conseiller Témoin', role: 'conseiller', advisor_code: 'TEMO', is_active: true, rh_delegue: false }
export const EQUIPE = {
  conseiller: [PROFIL_CONSEILLER, AUTRE_CONSEILLER, { ...PROFIL_MANAGER, id: 'u-direction', email: 'direction@exemple.fr' }],
  manager: [PROFIL_MANAGER, { ...PROFIL_CONSEILLER, id: 'u-conseiller', email: 'conseiller@exemple.fr' }, AUTRE_CONSEILLER],
  rh: [PROFIL_RH, { ...PROFIL_CONSEILLER, id: 'u-conseiller', email: 'conseiller@exemple.fr' }, AUTRE_CONSEILLER],
}

export const CONTRAT = { id: 'k1', profile_id: 'u-demo', type_contrat: 'CDI', date_debut: `${ANNEE}-01-01`, date_fin: null, palier_pp_mensuel: 2500, palier_pu_mensuel: 5000, actif: true }

// Un second contrat, avec un solde de conges arrete a la date d un bulletin
// et NEGATIF : c est le cas que l ecran doit montrer en evidence, en rouge.
// La date d arret est la fin du mois dernier, pour que le solde affiche reste
// celui du bulletin quel que soit le jour ou le controle visuel tourne.
const finMoisDernier = (() => {
  const d = new Date()
  const f = new Date(d.getFullYear(), d.getMonth(), 0)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
})()
export const CONTRAT_NEGATIF = { id: 'k2', profile_id: 'u-autre', full_name: 'Camille Ferrand', type_contrat: 'ALTERNANT', date_debut: `${ANNEE - 1}-09-01`, date_fin: `${ANNEE + 1}-09-01`, conges_report: -1.5, conges_report_au: finMoisDernier, conges_deja_pris: 0, actif: true }

// Reponse de l API de remuneration, vue conseiller. Ce sont les chiffres du
// conseiller sur ses propres dossiers, entierement inventes. Aucun agregat
// cabinet n apparait ici, conformement aux regles du depot.
export const REMUNERATION = {
  perso: {
    contrat: CONTRAT,
    rentab: { rentabilise: true, brutCumule: 3000, valeurCumulee: 3400, ecart: 400 },
    comm: {
      variablePp: 320, variablePu: 80, variableHorsPalier: 0, total: 400,
      ppRealisee: 900, puRealisee: 5000,
      palierPpAtteint: false, palierPuAtteint: true, rentabilise: true, detail: [],
    },
    // Le meme nombre que la liste des dossiers du mois affichee plus bas :
    // deux chiffres qui se contredisent a l ecran font douter du calcul.
    dealsMoisCount: DEALS.filter((d) => d.status === 'Signé' && d.month === MOIS[MOIS_COURANT] && d.advisor_code === 'DEMO').length,
  },
  manager: { lignes: [], totals: {} },
}

// Totaux du cabinet pour le mois (RPC cabinet_totals_month)
export const TOTAUX_CABINET = [{ pp_signee: 4200, pu_signee: 15000, signed_count: 3, total_count: 7 }]

// ── Emulation minimale des filtres PostgREST ─────────────────────────────────
// Le client Supabase encode ses filtres dans la requete (id=eq.c0,
// pause_jusqu_au=gte.2026..., statut=not.in.(a,b)). Sans un minimum de
// filtrage, une fiche client recevrait la liste entiere et un filtre sur une
// colonne absente renverrait tout le monde. On gere eq, is, in et leur
// negation ; les comparaisons (gte, lt...) sur une colonne absente du jeu
// renvoient vide, les autres passent sans filtrer.
const PARAMS_HORS_FILTRE = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and'])
function filtrerPostgrest(lignes, url) {
  let resultat = lignes
  for (const [cle, valeur] of new URL(url).searchParams) {
    if (PARAMS_HORS_FILTRE.has(cle)) continue
    const m = /^(not\.)?([a-z]+)\.([\s\S]*)$/.exec(valeur)
    if (!m) continue
    const [, negation, operateur, argument] = m
    let test = null
    if (operateur === 'eq') test = (r) => String(r[cle]) === argument
    else if (operateur === 'is') test = (r) => (argument === 'null' ? r[cle] == null : String(r[cle]) === argument)
    else if (operateur === 'in') {
      const valeurs = argument.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
      test = (r) => valeurs.includes(String(r[cle]))
    } else if (['gt', 'gte', 'lt', 'lte', 'like', 'ilike'].includes(operateur)) {
      test = (r) => r[cle] != null
    }
    if (!test) continue
    resultat = resultat.filter((r) => (negation ? !test(r) : test(r)))
  }
  return resultat
}

// Nom de la table (ou de la RPC) dans une URL PostgREST
function cibleDe(url) {
  const chemin = new URL(url).pathname
  const m = /\/rest\/v1\/(rpc\/)?([^/?]+)/.exec(chemin)
  if (!m) return { rpc: false, table: '' }
  return { rpc: !!m[1], table: m[2] }
}

// Reponses du proxy Lead Room (/api/leadroom-proxy?path=...), par route admin.
// Des formes vides mais completes : un objet vide ferait planter les ecrans
// qui lisent data.leads.length. La prevision de CA recoit une erreur lisible,
// que l ecran affiche comme telle.
const LEADROOM = {
  'advisor-rdv-stats': { stats: [] },
  'rdv-heatmap': { buckets: [] },
  'funnel-by-source': { campaigns_meta: {}, leads: [] },
  'refused-recyclables': { count: 0, leads: [], by_campaign: {}, min_days: 60 },
  'ca-forecast': { error: 'Lead Room non simulée par le contrôle visuel' },
}

// ── La page simulee ──────────────────────────────────────────────────────────
export async function pageDemo(browser, { role = 'conseiller' } = {}) {
  const profil = role === 'manager' ? PROFIL_MANAGER : (role === 'rh' ? PROFIL_RH : PROFIL_CONSEILLER)
  const equipe = EQUIPE[role] || EQUIPE.conseiller
  const tables = {
    deals: DEALS,
    clients: CLIENTS,
    client_equipment: EQUIPEMENT,
    product_families: FAMILLES,
    profiles: [profil],
    conseiller_contrats: [CONTRAT, CONTRAT_NEGATIF],
    dossiers_immo: DOSSIERS_IMMO,
    conformite_dossiers: CONFORMITE,
    objectifs: OBJECTIFS,
    leads: LEADS,
    campagnes: CAMPAGNES,
    campagne_cibles: CIBLES,
    rh_conges: CONGES,
  }
  const rpcs = {
    team_directory: equipe,
    cabinet_totals_month: TOTAUX_CABINET,
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(20000)

  // Session factice ecrite avant le premier script de la page : le client
  // Supabase la lit au demarrage et considere l utilisateur connecte.
  await page.addInitScript(([user]) => {
    const session = {
      access_token: 'fake', refresh_token: 'fake', token_type: 'bearer',
      expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user,
    }
    window.localStorage.setItem('entasis-auth-v1', JSON.stringify(session))
  }, [USER])

  const json = (route, corps, statut = 200, entetes = {}) =>
    route.fulfill({ status: statut, contentType: 'application/json', headers: entetes, body: JSON.stringify(corps) })

  // Rien ne sort du navigateur : toute requete qui n est ni le serveur local
  // du CRM ni une des routes simulees ci dessous est coupee (polices, hote
  // Supabase fictif hors des chemins connus, fonctions edge). Playwright
  // consulte les routes de la derniere a la premiere : celle ci, posee en
  // premier, ne voit que ce que les autres ont laisse passer.
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
    return route.abort()
  })

  // Authentification : /user renvoie l utilisateur factice, le reste un objet vide
  await page.route('**/auth/v1/**', (route) => {
    const chemin = new URL(route.request().url()).pathname
    return json(route, /\/auth\/v1\/user/.test(chemin) ? USER : {})
  })

  // Temps reel : les requetes HTTP sont coupees, la WebSocket est branchee sur
  // un faux serveur muet pour ne pas produire d erreur de connexion.
  await page.route('**/realtime/**', (route) => route.abort())
  await page.routeWebSocket('**/realtime/**', () => {})

  // Stockage de fichiers : jamais rien
  await page.route('**/storage/v1/**', (route) => json(route, []))

  // Donnees : tables et RPC
  await page.route('**/rest/v1/**', (route) => {
    const requete = route.request()
    const url = requete.url()
    const { rpc, table } = cibleDe(url)
    let corps
    if (rpc) corps = rpcs[table] ?? []
    else corps = filtrerPostgrest(tables[table] ?? [], url)
    const accept = requete.headers()['accept'] || ''
    const objetSeul = accept.includes('vnd.pgrst.object')
    const n = corps.length
    const contentRange = n ? `0-${n - 1}/${n}` : `*/0`
    return json(route, objetSeul ? (corps[0] ?? null) : corps, 200, { 'content-range': contentRange })
  })

  // API du site (fonctions Vercel) : remuneration et calendrier equipe ont une
  // forme attendue, le reste recoit un objet vide.
  await page.route('**/api/**', (route) => {
    const chemin = new URL(route.request().url()).pathname
    if (chemin.endsWith('/api/remuneration')) {
      let mode = 'perso'
      try { mode = JSON.parse(route.request().postData() || '{}').mode || 'perso' } catch { /* corps absent */ }
      return json(route, REMUNERATION[mode] || REMUNERATION.perso)
    }
    if (chemin.endsWith('/api/team-calendar')) return json(route, { advisors: [] })
    if (chemin.endsWith('/api/leadroom-proxy')) {
      const routeAdmin = new URL(route.request().url()).searchParams.get('path') || ''
      return json(route, LEADROOM[routeAdmin] || { error: 'Lead Room non simulée par le contrôle visuel' })
    }
    return json(route, {})
  })

  return page
}
