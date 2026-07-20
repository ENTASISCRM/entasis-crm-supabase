// src/services/opportunites.js
// Couche d'acces Supabase pour l'ecran Opportunites du jour.
// Lecture seule : aucune ecriture, la RLS applique le perimetre
// (le manager voit tout le cabinet, le conseiller voit ses clients,
// ses deals et son equipement via la vue client_equipment).
// Les 8 generateurs d'occasions de contact sont calcules cote client
// dans construireSections, a partir de listes paginees simples. Le
// 8e (fiches a completer) est un rappel prioritaire place en tete.

import { supabase } from '../lib/supabase'
import { euro } from '../lib/ui-shared'

const PAGE = 1000

// Charge toutes les lignes d'une requete par pages de 1000 pour ne pas
// buter sur la limite PostgREST. buildQuery doit renvoyer une requete neuve
// a chaque appel car une requete Supabase ne se rejoue pas.
async function fetchTout(buildQuery) {
  const lignes = []
  for (let depart = 0; ; depart += PAGE) {
    const { data, error } = await buildQuery().range(depart, depart + PAGE - 1)
    if (error) throw error
    lignes.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return lignes
}

// Portefeuille clients avec les champs utiles aux generateurs. email et
// patrimoine_estime servent au generateur fiches a completer (memes champs
// que le verrou de signature).
export function listClients() {
  return fetchTout(() => supabase
    .from('clients')
    .select('id, nom, prenom, email, telephone, age, date_naissance, nb_enfants, situation_familiale, statut_pro, profession, revenus_annuels, patrimoine_estime, advisor_code, co_advisor_code')
    .order('nom', { ascending: true }))
}

// Tous les deals visibles : les signes servent aux revues d'anniversaire de
// contrat, l'ensemble sert a reperer une epargne enfant deja en place.
export function listDeals() {
  return fetchTout(() => supabase
    .from('deals')
    .select('id, client_id, client, product, notes, status, date_signed, advisor_code, pp_m, pu')
    .order('created_at', { ascending: true }))
}

// Familles detenues par client via la vue client_equipment (security invoker,
// la RLS s'applique donc comme sur la table clients).
export function listEquipement() {
  return fetchTout(() => supabase
    .from('client_equipment')
    .select('client_id, familles'))
}

// Profils actifs du cabinet, pour reperer les portefeuilles orphelins.
// Renvoie [] sur erreur : le generateur orphelins est reserve au manager
// et doit degrader en silence si la lecture echoue.
export async function listProfilsActifs() {
  const { data, error } = await supabase
    .from('profiles')
    .select('advisor_code, full_name, is_active')
    .eq('is_active', true)
  if (error) return []
  return data || []
}

// Chargement groupe pour l'ecran. Les profils ne sont charges que pour le
// manager, seul consommateur du generateur orphelins.
export async function chargerDonnees({ manager = false } = {}) {
  const [clients, deals, equipement, profils] = await Promise.all([
    listClients(),
    listDeals(),
    listEquipement(),
    manager ? listProfilsActifs() : Promise.resolve([]),
  ])
  return { clients, deals, equipement, profils }
}

// ═══ Helpers de dates (exportes pour rester testables) ═══

// Parse prudent d'une date stockee en TEXT (date_signed) ou en DATE
// (date_naissance). Accepte AAAA MM JJ en ISO, JJ/MM/AAAA en saisie
// francaise, puis tente le constructeur natif en dernier recours.
export function parseDateTexte(txt) {
  const s = String(txt || '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return dateLocale(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return dateLocale(Number(m[3]), Number(m[2]), Number(m[1]))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

// Construit une date locale a minuit en refusant les composantes aberrantes
// (mois 13, jour 32...) que Date accepterait en silence par report.
function dateLocale(annee, mois, jour) {
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31 || annee < 1900) return null
  const d = new Date(annee, mois - 1, jour)
  return d.getMonth() === mois - 1 ? d : null
}

// Prochain anniversaire d'une date d'origine : date exacte, nombre de jours
// restants et nombre d'annees fetees ce jour la. Gere le passage de fin
// d'annee via la bascule sur l'annee suivante. Un 29 fevrier retombe sur le
// 1er mars les annees non bissextiles, approximation assumee.
export function prochainAnniversaire(origine, today) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let d = new Date(t0.getFullYear(), origine.getMonth(), origine.getDate())
  if (d < t0) d = new Date(t0.getFullYear() + 1, origine.getMonth(), origine.getDate())
  const jours = Math.round((d - t0) / 86400000)
  return { date: d, jours, annees: d.getFullYear() - origine.getFullYear() }
}

// Age revolu a la date du jour.
export function ageRevolu(naissance, today) {
  let a = today.getFullYear() - naissance.getFullYear()
  const passe = today.getMonth() > naissance.getMonth()
    || (today.getMonth() === naissance.getMonth() && today.getDate() >= naissance.getDate())
  if (!passe) a -= 1
  return a
}

const fmtJour = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
const quandTexte = (j) => (j === 0 ? "aujourd'hui" : j === 1 ? 'demain' : `dans ${j} jours`)

// Cle de rapprochement par nom : minuscules, sans accents, espaces simples.
// Meme logique d'approximation que la recherche de doublons de clients.js.
function cleNom(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const STATUTS_MADELIN = ['TNS', 'Profession libérale']

// Deals consideres comme actifs : le client va devoir signer, le verrou de
// signature le bloquera si sa fiche est incomplete. Memes libelles que la
// colonne deals.status.
const STATUTS_ACTIFS = new Set(['En cours', 'Prévu'])

// ═══ Generateur 8 : fiches clients incompletes (fonction pure) ═══
// Miroir EXACT du verrou de signature (App.jsx, passage d'un deal en « Signé ») :
// un client est COMPLET si email, telephone, statut_pro, profession,
// revenus_annuels ET patrimoine_estime sont renseignes. date_naissance ne
// compte PAS dans le complet obligatoire, elle est signalee a part comme bonus
// (elle sert aux anniversaires et au compte a rebours des 70 ans).

// Champ texte manquant : vide une fois nettoye (email, telephone, statut, profession).
const texteVide = (v) => !String(v ?? '').trim()
// Champ numerique manquant : null ou chaine vide. Un zero compte comme
// renseigne, exactement comme le verrou de signature (revenus, patrimoine).
const nombreVide = (v) => v == null || String(v).trim() === ''

// Renvoie, pour chaque client incomplet, la liste des champs obligatoires
// manquants (libelles courts destines a l'affichage rouge) et le bonus
// date de naissance s'il manque. Calcul pur, testable, sans acces reseau.
export function fichesIncompletes(clients = []) {
  const resultat = []
  clients.forEach((c) => {
    const manquants = []
    if (texteVide(c.email)) manquants.push('email')
    if (texteVide(c.telephone)) manquants.push('téléphone')
    if (texteVide(c.statut_pro)) manquants.push('statut')
    if (texteVide(c.profession)) manquants.push('profession')
    if (nombreVide(c.revenus_annuels)) manquants.push('revenus')
    if (nombreVide(c.patrimoine_estime)) manquants.push('patrimoine')
    if (manquants.length === 0) return
    resultat.push({
      client: c,
      manquants,
      bonus: parseDateTexte(c.date_naissance) ? null : 'date de naissance',
    })
  })
  return resultat
}

// ═══ Les 8 generateurs ═══
// Recoit les donnees brutes (deja filtrees par la RLS, et eventuellement par
// le filtre conseiller du composant) et renvoie les sections dans l'ordre
// d'affichage. Le generateur fiches a completer est place en tete (avant les
// anniversaires) car c'est un rappel prioritaire. Aucune ecriture, calcul pur.
export function construireSections({ clients = [], deals = [], equipement = [], profils = [] }, { isManager = false, today = new Date() } = {}) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const mois = t0.getMonth()

  const famillesParClient = new Map()
  equipement.forEach((e) => {
    famillesParClient.set(e.client_id, Array.isArray(e.familles) ? e.familles : [])
  })

  const clientParId = new Map(clients.map((c) => [c.id, c]))
  const clientParNom = new Map()
  clients.forEach((c) => {
    const k = cleNom(c.nom)
    if (k && !clientParNom.has(k)) clientParNom.set(k, c)
  })

  // Deals rattaches a chaque client : par client_id d'abord, par nom sinon
  // (le lien deal vers client est lacunaire sur les vieux deals).
  const dealsParCle = new Map()
  deals.forEach((d) => {
    const cle = d.client_id || `nom:${cleNom(d.client)}`
    if (!dealsParCle.has(cle)) dealsParCle.set(cle, [])
    dealsParCle.get(cle).push(d)
  })
  const dealsDuClient = (c) => [
    ...(dealsParCle.get(c.id) || []),
    ...(dealsParCle.get(`nom:${cleNom(c.nom)}`) || []),
  ]

  const nomComplet = (c) => `${c.prenom || ''} ${c.nom || ''}`.trim() || '(sans nom)'
  const item = (c, props) => ({
    id: `${props.section}:${c.id}`,
    clientId: c.id,
    nom: nomComplet(c),
    telephone: c.telephone || null,
    advisorCode: c.advisor_code || null,
    ...props,
  })

  const sections = []

  // 1. Anniversaires des 7 prochains jours, avec l'age fete. Section mise
  //    en avant en tete d'ecran. Le tri se fait sur le nombre de jours
  //    restants, ce qui gere naturellement le passage jour et mois.
  const anniversaires = []
  clients.forEach((c) => {
    const dn = parseDateTexte(c.date_naissance)
    if (!dn) return
    const anniv = prochainAnniversaire(dn, t0)
    if (anniv.jours > 7) return
    anniversaires.push({
      ...item(c, { section: 'anniversaires' }),
      raison: `fête ses ${anniv.annees} ans ${quandTexte(anniv.jours)}`,
      detail: `le ${fmtJour(anniv.date)}`,
      jours: anniv.jours,
    })
  })
  anniversaires.sort((a, b) => a.jours - b.jours || a.nom.localeCompare(b.nom))
  sections.push({
    key: 'anniversaires',
    titre: 'Anniversaires de la semaine',
    regle: 'anniversaires dans les 7 prochains jours',
    highlight: true,
    encartDates: clients.length > 0 && clients.every((c) => !parseDateTexte(c.date_naissance)),
    items: anniversaires,
  })

  // 2. Revue d'anniversaire de contrat : deals signes dont l'anniversaire
  //    annuel (12 mois, 24 mois...) tombe dans les 30 prochains jours,
  //    groupes par client.
  const groupesRevue = new Map()
  deals.forEach((d) => {
    if (d.status !== 'Signé') return
    const signe = parseDateTexte(d.date_signed)
    if (!signe) return
    const anniv = prochainAnniversaire(signe, t0)
    if (anniv.annees < 1 || anniv.jours > 30) return
    const cle = d.client_id || `nom:${cleNom(d.client)}`
    if (!groupesRevue.has(cle)) groupesRevue.set(cle, [])
    groupesRevue.get(cle).push({ deal: d, anniv })
  })
  const revues = Array.from(groupesRevue.entries()).map(([cle, lot]) => {
    lot.sort((a, b) => a.anniv.jours - b.anniv.jours)
    const premier = lot[0]
    const client = clientParId.get(premier.deal.client_id)
      || clientParNom.get(cleNom(premier.deal.client))
      || null
    const parts = lot.map(({ deal, anniv }) =>
      `${anniv.annees} an${anniv.annees > 1 ? 's' : ''} du contrat ${deal.product || 'souscrit'}`)
    return {
      id: `revue:${cle}`,
      clientId: client?.id || null,
      nom: client ? nomComplet(client) : (premier.deal.client || '(sans nom)'),
      telephone: client?.telephone || null,
      advisorCode: client?.advisor_code || premier.deal.advisor_code || null,
      raison: `${parts.join(' + ')}, proposer une revue`,
      detail: `${quandTexte(premier.anniv.jours)}, le ${fmtJour(premier.anniv.date)}`,
      jours: premier.anniv.jours,
    }
  })
  revues.sort((a, b) => a.jours - b.jours || a.nom.localeCompare(b.nom))
  sections.push({
    key: 'revue-contrat',
    titre: "Revue d'anniversaire de contrat",
    regle: "contrats signés dont l'anniversaire annuel tombe dans les 30 prochains jours",
    items: revues,
  })

  // 3. Sprint plafond fiscal : de septembre a decembre uniquement, clients
  //    detenteurs d'un PER avec des revenus renseignes.
  if (mois >= 8 && mois <= 11) {
    const plafond = clients
      .filter((c) => (famillesParClient.get(c.id) || []).includes('per')
        && c.revenus_annuels != null && Number(c.revenus_annuels) > 0)
      .map((c) => item(c, {
        section: 'plafond-per',
        raison: 'fenêtre fiscale, vérifier le plafond de versement PER',
        detail: `revenus ${euro(c.revenus_annuels)}`,
      }))
    plafond.sort((a, b) => a.nom.localeCompare(b.nom))
    sections.push({
      key: 'plafond-per',
      titre: 'Sprint plafond fiscal PER',
      regle: "détenteurs d'un PER avec revenus connus, de septembre à décembre",
      items: plafond,
    })
  }

  // 4. Recalage Madelin : de mai a aout uniquement, TNS et professions
  //    liberales deja equipes en prevoyance ou en mutuelle.
  if (mois >= 4 && mois <= 7) {
    const madelin = clients
      .filter((c) => {
        if (!STATUTS_MADELIN.includes(c.statut_pro)) return false
        const familles = famillesParClient.get(c.id) || []
        return familles.includes('prevoyance') || familles.includes('mutuelle')
      })
      .map((c) => {
        const familles = famillesParClient.get(c.id) || []
        const equipe = [familles.includes('prevoyance') && 'prévoyance', familles.includes('mutuelle') && 'mutuelle']
          .filter(Boolean).join(' + ')
        return item(c, {
          section: 'madelin',
          raison: 'liasse fiscale sortie, recaler les cotisations Madelin',
          detail: `${c.statut_pro}, équipé ${equipe}`,
        })
      })
    madelin.sort((a, b) => a.nom.localeCompare(b.nom))
    sections.push({
      key: 'madelin',
      titre: 'Recalage Madelin',
      regle: 'TNS et professions libérales équipés prévoyance ou mutuelle, de mai à août',
      items: madelin,
    })
  }

  // 5. Epargne des enfants : clients avec enfants sans deal evoquant une
  //    epargne enfant dans le produit ou les notes. Approximation honnete,
  //    le mot enfant peut manquer dans un deal pourtant dedie.
  const enfants = clients
    .filter((c) => Number(c.nb_enfants || 0) >= 1
      && !dealsDuClient(c).some((d) => /enfant/i.test(`${d.product || ''} ${d.notes || ''}`)))
    .map((c) => {
      const n = Number(c.nb_enfants)
      return item(c, {
        section: 'epargne-enfants',
        raison: `${n} enfant${n > 1 ? 's' : ''}, proposer une épargne enfant/transmission`,
        detail: c.situation_familiale || null,
      })
    })
  enfants.sort((a, b) => a.nom.localeCompare(b.nom))
  sections.push({
    key: 'epargne-enfants',
    titre: 'Épargne des enfants',
    regle: 'clients avec enfants sans épargne enfant repérée dans les deals',
    items: enfants,
  })

  // 6. Compte a rebours des 70 ans : 69 ans revolus d'apres la date de
  //    naissance, ou a defaut un age declare de 69 ans et plus (champ
  //    statique potentiellement perime, d'ou la mention a verifier).
  const cap70 = []
  clients.forEach((c) => {
    const dn = parseDateTexte(c.date_naissance)
    if (dn) {
      if (ageRevolu(dn, t0) !== 69) return
      cap70.push({
        ...item(c, { section: 'cap-70' }),
        raison: 'verser en assurance vie AVANT les 70 ans (régime successoral 152 500 € par bénéficiaire)',
        detail: `69 ans révolus, 70 ans le ${fmtJour(prochainAnniversaire(dn, t0).date)}`,
      })
    } else if (Number(c.age || 0) >= 69) {
      cap70.push({
        ...item(c, { section: 'cap-70' }),
        raison: 'verser en assurance vie AVANT les 70 ans (régime successoral 152 500 € par bénéficiaire)',
        detail: `âge déclaré ${Number(c.age)} ans, date de naissance à confirmer`,
      })
    }
  })
  cap70.sort((a, b) => a.nom.localeCompare(b.nom))
  sections.push({
    key: 'cap-70',
    titre: 'Compte à rebours des 70 ans',
    regle: '69 ans révolus, dernière fenêtre avant le régime des 70 ans',
    urgent: true,
    items: cap70,
  })

  // 7. Clients orphelins, manager uniquement : le code conseiller du client
  //    ne correspond a aucun profil actif (conseiller parti ou code errone).
  if (isManager) {
    const codesActifs = new Set(
      profils.map((p) => String(p.advisor_code || '').trim().toUpperCase()).filter(Boolean),
    )
    const orphelins = clients
      .filter((c) => {
        const code = String(c.advisor_code || '').trim().toUpperCase()
        return !code || !codesActifs.has(code)
      })
      .map((c) => item(c, {
        section: 'orphelins',
        raison: 'portefeuille sans conseiller actif, à réattribuer',
        detail: c.advisor_code ? `code ${c.advisor_code} inactif ou inconnu` : 'aucun code conseiller',
      }))
    orphelins.sort((a, b) => a.nom.localeCompare(b.nom))
    sections.push({
      key: 'orphelins',
      titre: 'Clients orphelins',
      regle: 'clients dont le code conseiller ne correspond à aucun profil actif',
      managerOnly: true,
      items: orphelins,
    })
  }

  // 8. Fiches a completer, placee EN TETE via unshift. Rappel prioritaire :
  //    fiche incomplete = signature impossible (verrou) et modules de vente
  //    aveugles. Les clients avec un deal actif (En cours / Prévu) passent
  //    devant car ils vont devoir signer bientot. Le libelle rouge des champs
  //    manquants est porte tel quel dans raison pour que « Copier la liste »
  //    et le rendu partagent la meme source.
  // On ne demande de completer QUE les VRAIS clients : contrat signe, ou dossier
  // reel en cours. Une fiche creee par un RDV pose porte un dossier « Prevu »
  // sans produit ni montant : c est un PROSPECT, pas un client. Sans ce filtre,
  // un conseiller se voyait reclamer 38 fiches dont zero vrai client (retour
  // Louis 20/07/2026 : « demande juste a renseigner les clients »).
  const dossierReel = (d) => {
    const p = String(d.product || '').trim()
    return (p !== '' && p !== 'Autre') || Number(d.pp_m || 0) > 0 || Number(d.pu || 0) > 0
  }
  const estClientReel = (c) => dealsDuClient(c).some(
    (d) => d.status === 'Signé' || (STATUTS_ACTIFS.has(d.status) && dossierReel(d)),
  )
  const dealActif = (c) => dealsDuClient(c).some((d) => STATUTS_ACTIFS.has(d.status) && dossierReel(d))
  const fiches = fichesIncompletes(clients.filter(estClientReel)).map(({ client, manquants, bonus }) => {
    const actif = dealActif(client)
    return {
      ...item(client, { section: 'fiches' }),
      manquants,
      bonus,
      dealActif: actif,
      raison: `manque : ${manquants.join(', ')}`,
      detail: bonus ? `${bonus} recommandée` : null,
      tri: actif ? 0 : 1,
    }
  })
  fiches.sort((a, b) => a.tri - b.tri || a.nom.localeCompare(b.nom))
  sections.unshift({
    key: 'fiches-incompletes',
    titre: 'Fiches à compléter',
    regle: 'vrais clients uniquement (contrat signé ou dossier réel en cours, les prospects issus d un RDV posé sont exclus) dont un champ obligatoire manque : email, téléphone, statut, profession, revenus, patrimoine',
    fiches: true,
    accroche: 'Sans ces infos, impossible de signer et les modules de vente sont aveugles.',
    items: fiches,
  })

  return sections
}
