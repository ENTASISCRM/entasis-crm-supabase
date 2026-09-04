// src/services/clients.js
// Couche d'accès Supabase pour la table `clients` (CRM patrimonial).
//
// Pourquoi : la création d'un client est subtile (auto-créé depuis un
// deal, recherche fuzzy par nom+email+phone). Cette couche évite le
// drift entre les 3 composants qui touchent cette table.

import { supabase } from '../lib/supabase'
import { nettoyerCompletion } from '../lib/completude'
import { verifierEcriture, MOTIF_DROITS } from '../lib/ecriture-verifiee'

/**
 * Recherche fuzzy (autocomplete) par nom OU email OU téléphone.
 * Limite à 5 résultats. Renvoie [] sur erreur (silent failure côté UI).
 */
export async function searchByQuery(query) {
  if (!query || query.length < 2) return []
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom, prenom, email, telephone, profession, statut_pro, revenus_annuels, patrimoine_estime, advisor_code')
    .or(
      `nom.ilike.%${query}%,email.ilike.%${query}%,telephone.ilike.%${query}%`
    )
    .limit(5)
  if (error) return []
  return data || []
}

/**
 * Met à jour la data structurée d'un client (email, téléphone, statut,
 * profession, revenus, patrimoine) UNIQUEMENT pour les champs fournis (non
 * vides). Sert à compléter une fiche au passage d'un deal en « Signé » sans
 * écraser l'existant.
 *
 * email et telephone sont saisis dans la modale dossier (client_email /
 * client_phone) : ils n'étaient recopiés sur la fiche qu'à la CRÉATION d'un
 * client. Pour un client existant, la fiche restait sans téléphone et le verrou
 * de signature en base bloquait alors que le conseiller avait bien rempli le
 * champ. On les propage donc ici aussi.
 *
 * Rend true si la fiche est ecrite (ou s il n y avait rien a ecrire), false si
 * la RLS a refuse ou si la requete a echoue.
 */
export async function updateInfoIfProvided(clientId, fields) {
  if (!clientId || !fields) return
  const patch = {}
  if (fields.email != null && String(fields.email).trim() !== '') patch.email = String(fields.email).trim()
  if (fields.telephone != null && String(fields.telephone).trim() !== '') patch.telephone = String(fields.telephone).trim()
  if (fields.statut_pro != null && String(fields.statut_pro).trim() !== '') patch.statut_pro = fields.statut_pro
  if (fields.profession != null && String(fields.profession).trim() !== '') patch.profession = fields.profession
  if (fields.revenus_annuels != null && String(fields.revenus_annuels).trim() !== '') patch.revenus_annuels = Number(fields.revenus_annuels)
  if (fields.patrimoine_estime != null && String(fields.patrimoine_estime).trim() !== '') patch.patrimoine_estime = Number(fields.patrimoine_estime)
  if (Object.keys(patch).length === 0) return true
  patch.updated_at = new Date().toISOString()
  // .select('id') : sans lui, une fiche refusee par la RLS (fiche d un autre
  // conseiller, cas frequent en co conseil) repond sans erreur et sans ligne,
  // et l appelant croit la fiche completee alors que rien n a bouge.
  const { data, error } = await supabase.from('clients').update(patch).eq('id', clientId).select('id')
  if (error) { console.error('[clients.updateInfoIfProvided] failed:', error.message); return false }
  return Array.isArray(data) && data.length > 0
}

/**
 * Ouvre la fiche client au co conseiller du dossier.
 *
 * Pourquoi : la RLS `clients` ne rend la fiche qu au porteur de `advisor_code`
 * ou de `co_advisor_code`, que l enregistrement d un dossier ne renseignait
 * jamais. Le co conseiller voyait donc le dossier (la RLS `deals`, elle,
 * l accepte) mais pas le client, alors que c est aussi son client. Constate
 * sur 72 des 98 dossiers portant un co conseiller, arbitre par la direction le
 * 04/09/2026.
 *
 * On ne pose le code que sur une fiche qui n en porte pas deja un autre :
 * ecraser reviendrait a retirer l acces a quelqu un. Le `.is(null)` de la
 * mise a jour tient la meme regle cote serveur, entre la lecture et l ecriture.
 *
 * Renvoie 'pose', 'deja' (rien a faire), 'conflit' (un autre co en place) ou
 * 'refus' (la RLS n a pas laisse ecrire).
 */
export async function assurerCoConseiller(clientId, code) {
  if (!clientId || !code) return 'deja'
  const { data: fiche, error } = await supabase
    .from('clients').select('advisor_code, co_advisor_code').eq('id', clientId).maybeSingle()
  if (error || !fiche) return 'refus'
  if (fiche.advisor_code === code || fiche.co_advisor_code === code) return 'deja'
  if (fiche.co_advisor_code) return 'conflit'
  const { data, error: e2 } = await supabase
    .from('clients')
    .update({ co_advisor_code: code, updated_at: new Date().toISOString() })
    .eq('id', clientId).is('co_advisor_code', null).select('id')
  if (e2) { console.error('[clients.assurerCoConseiller] failed:', e2.message); return 'refus' }
  return (Array.isArray(data) && data.length > 0) ? 'pose' : 'refus'
}

/**
 * Rend l acces a la fiche quand plus aucun dossier du client ne le justifie.
 *
 * Pourquoi : poser le co conseiller n avait pas de geste inverse. Retirer le
 * co d un dossier laissait `clients.co_advisor_code` en place, et l ancien co
 * gardait la fiche pour toujours. Releve du 04/09/2026 : trois fiches portent
 * un co qu aucun dossier ne justifie.
 *
 * Retirer un acces est une decision de securite, donc deux verrous.
 *
 * 1. On ne retire que sur une lecture COMPLETE des dossiers du client. La RLS
 *    `deals` ne montre a un conseiller que les dossiers dont il est titulaire
 *    ou co : un dossier d un autre titulaire portant le meme co lui est
 *    invisible. Ce n est pas theorique, treize fiches a co ont des dossiers
 *    de plusieurs titulaires, et deux tiennent leur co d un dossier qui n est
 *    pas celui du titulaire de la fiche : sur une lecture partielle on
 *    couperait un co legitime. Seule la direction voit tous les dossiers,
 *    pour les autres on s abstient et la fiche garde son co.
 * 2. L ecriture reporte la condition cote serveur (`eq co_advisor_code`) et
 *    se verifie par `.select('id')` : la RLS `clients` refuse d ailleurs
 *    cette ecriture au co lui meme, puisque la fiche cesserait d etre la
 *    sienne. Seuls le conseiller principal de la fiche et la direction
 *    peuvent rendre l acces, ce qui est bien la regle voulue.
 *
 * Renvoie 'rendu', 'garde' (un dossier porte encore ce co), 'inutile' (la
 * fiche ne porte pas ce co), 'incertain' (lecture partielle, on s abstient)
 * ou 'refus' (la RLS n a pas laisse ecrire).
 */
export async function libererCoConseiller(clientId, code, { lectureComplete = false } = {}) {
  if (!clientId || !code) return 'inutile'
  if (!lectureComplete) return 'incertain'
  try {
    const { data: fiche, error } = await supabase
      .from('clients').select('co_advisor_code').eq('id', clientId).maybeSingle()
    if (error || !fiche) return 'refus'
    if (fiche.co_advisor_code !== code) return 'inutile'
    // Un dossier annule ou en cours justifie l acces autant qu un dossier
    // signe : c est le dossier qui donne l acces, pas son issue.
    const { data: restants, error: e2 } = await supabase
      .from('deals').select('id').eq('client_id', clientId).eq('co_advisor_code', code).limit(1)
    // Une lecture en erreur n est pas une absence de dossier : dans le doute
    // on garde l acces.
    if (e2) { console.error('[clients.libererCoConseiller] lecture dossiers:', e2.message); return 'garde' }
    if ((restants || []).length > 0) return 'garde'
    const { data, error: e3 } = await supabase
      .from('clients')
      .update({ co_advisor_code: null, updated_at: new Date().toISOString() })
      .eq('id', clientId).eq('co_advisor_code', code).select('id')
    if (e3) { console.error('[clients.libererCoConseiller] failed:', e3.message); return 'refus' }
    return (Array.isArray(data) && data.length > 0) ? 'rendu' : 'refus'
  } catch (e) {
    // Jamais d exception vers l appelant : cet appel vit dans le try de
    // saveDeal, dont le catch deconnecte la session.
    console.error('[clients.libererCoConseiller] failed:', e?.message || e)
    return 'refus'
  }
}

/**
 * Recherche un client existant par nom + advisor_code (unicité métier).
 * @returns le client { id } ou null si non trouvé.
 */
export async function findByNameAndAdvisor(nom, advisorCode) {
  const { data } = await supabase
    .from('clients')
    .select('id')
    .eq('nom', nom)
    .eq('advisor_code', advisorCode || '')
    .maybeSingle()
  return data || null
}

/**
 * Recherche un client existant par email (case-insensitive).
 * Plus fiable que le nom car l'email est unique par personne.
 */
export async function findByEmail(email) {
  const e = (email || '').trim().toLowerCase()
  if (!e) return null
  const { data } = await supabase
    .from('clients')
    .select('id, nom, prenom, email')
    .ilike('email', e)
    .limit(1)
    .maybeSingle()
  return data || null
}

/**
 * Recherche un client existant par téléphone (tolérant aux formatages).
 * Compare les 9 derniers chiffres (= numéro local sans préfixe pays).
 */
export async function findByPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 9) return null
  const tail = digits.slice(-9)
  // On charge un échantillon de clients avec téléphone et on filtre côté JS
  // (PostgREST ne fait pas de regex sur les colonnes en ilike facilement).
  const { data } = await supabase
    .from('clients')
    .select('id, nom, prenom, telephone')
    .not('telephone', 'is', null)
    .limit(2000)
  if (!data) return null
  return data.find(c => {
    const t = (c.telephone || '').replace(/\D/g, '')
    return t.length >= 9 && t.slice(-9) === tail
  }) || null
}

/**
 * Cherche un client existant en cascade : email > téléphone > nom+advisor.
 * Retourne le 1er match trouvé ou null.
 */
export async function findExisting({ email, telephone, nom, advisor_code }) {
  // 1. Email (le plus fiable)
  if (email) {
    const byEmail = await findByEmail(email)
    if (byEmail) return { ...byEmail, matchedBy: 'email' }
  }
  // 2. Téléphone (tolérant aux formats)
  if (telephone) {
    const byPhone = await findByPhone(telephone)
    if (byPhone) return { ...byPhone, matchedBy: 'phone' }
  }
  // 3. Nom + advisor_code (dernier recours, exact)
  if (nom && advisor_code) {
    const byName = await findByNameAndAdvisor(nom, advisor_code)
    if (byName) return { ...byName, matchedBy: 'name' }
  }
  // 4. Anti-doublon par fuzzy match nom (Levenshtein normalisé) — seuil
  //    0.85 = quasi-certain qu'il s'agit du même client malgré une faute
  //    de frappe (ex Vox Protega vs Vox Protego, score ≈ 0.91).
  //    Plus prudent que le fuzzy d'autocomplete car ici on FUSIONNE.
  if (nom) {
    const dups = await findPotentialDuplicates({ nom })
    if (dups.length > 0 && dups[0].score >= 0.85) {
      return { ...dups[0], matchedBy: 'fuzzy_name' }
    }
  }
  return null
}

// ─── Anti-doublons fuzzy ────────────────────────────────────────────────
// Levenshtein simple, O(n*m). Suffit pour les noms courts (<40 char).
function levenshtein(a, b) {
  if (a === b) return 0
  if (!a || !b) return Math.max((a || '').length, (b || '').length)
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,         // deletion
        dp[i][j - 1] + 1,         // insertion
        dp[i - 1][j - 1] + cost,  // substitution
      )
    }
  }
  return dp[m][n]
}

// Normalise un nom : lowercase, trim, sans accents, espaces simples.
function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Score de similarité 0..1 entre 2 noms.
function nameSimilarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const maxLen = Math.max(na.length, nb.length)
  const dist = levenshtein(na, nb)
  return Math.max(0, 1 - dist / maxLen)
}

/**
 * Cherche les doublons POTENTIELS d'un client par fuzzy match nom + email
 * partial. Utilisé pour alerter au save deal "ce nom ressemble à un client
 * déjà existant — fusionner ?".
 *
 * @returns Array<{ id, nom, prenom, email, telephone, score, matchedBy }>
 *          triés par score décroissant. Score ∈ [0, 1].
 */
export async function findPotentialDuplicates({ nom, email, telephone }) {
  const candidates = new Map() // id → { client, scores, matchedBy[] }

  // 1. Match email exact (case-insensitive) → score 1.0
  if (email) {
    const e = String(email).trim().toLowerCase()
    if (e) {
      const { data } = await supabase
        .from('clients')
        .select('id, nom, prenom, email, telephone')
        .ilike('email', e)
        .limit(5)
      for (const c of (data || [])) {
        candidates.set(c.id, { client: c, score: 1.0, matchedBy: ['email'] })
      }
    }
  }
  // 2. Match téléphone 9 derniers digits → score 0.95
  if (telephone) {
    const tail = String(telephone).replace(/\D/g, '').slice(-9)
    if (tail.length === 9) {
      const { data } = await supabase
        .from('clients')
        .select('id, nom, prenom, email, telephone')
        .not('telephone', 'is', null)
        .limit(2000)
      for (const c of (data || [])) {
        const t = String(c.telephone || '').replace(/\D/g, '').slice(-9)
        if (t === tail) {
          const existing = candidates.get(c.id)
          if (!existing || existing.score < 0.95) {
            candidates.set(c.id, { client: c, score: Math.max(0.95, existing?.score || 0), matchedBy: [...(existing?.matchedBy || []), 'phone'] })
          }
        }
      }
    }
  }
  // 3. Match fuzzy nom (Levenshtein normalisé). Seuil 0.75 minimum.
  if (nom) {
    const normalized = normalizeName(nom)
    if (normalized.length >= 3) {
      // On charge un échantillon par début de nom (tri par nom asc serait mieux mais Supabase ne supporte pas la pagination fine)
      const firstWord = normalized.split(' ')[0]
      const { data } = await supabase
        .from('clients')
        .select('id, nom, prenom, email, telephone')
        .ilike('nom', `%${firstWord}%`)
        .limit(50)
      for (const c of (data || [])) {
        const sim = nameSimilarity(nom, c.nom)
        if (sim >= 0.75) {
          const existing = candidates.get(c.id)
          if (!existing || existing.score < sim) {
            candidates.set(c.id, {
              client: c,
              score: Math.max(sim, existing?.score || 0),
              matchedBy: [...(existing?.matchedBy || []), `nom_fuzzy_${Math.round(sim * 100)}%`],
            })
          }
        }
      }
    }
  }

  // Sort by score desc
  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .map(({ client, score, matchedBy }) => ({ ...client, score, matchedBy: matchedBy.join('+') }))
}

/**
 * Crée un nouveau client. Retourne l'id du nouveau client.
 */
export async function create(clientData, userId) {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      nom: clientData.nom,
      email: clientData.email ?? null,
      telephone: clientData.telephone ?? null,
      age: clientData.age ?? null,
      advisor_code: clientData.advisor_code ?? null,
      // Le co conseiller du dossier est porte des la creation de la fiche :
      // sans lui la RLS clients lui refuse le client de son propre dossier.
      co_advisor_code: clientData.co_advisor_code ?? null,
      created_by: userId ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data?.id || null
}

/**
 * Helper haut niveau : trouve ou crée. Centralise la logique
 * "auto-création depuis un deal" qui était dans App.jsx.
 *
 * Renvoie null si le caller n'a pas fourni de nom (skip silencieux).
 */
export async function findOrCreate(clientData, userId) {
  if (clientData.client_id) return clientData.client_id

  const nom = (clientData.nom || clientData.client || '').trim()
  if (!nom) return null

  const email = clientData.email || clientData.client_email || null
  const telephone = clientData.telephone || clientData.client_phone || null

  // Recherche multi-critères (email > phone > nom+advisor) pour éviter les
  // doublons de clients. Si on trouve un match, on le réutilise.
  const existing = await findExisting({
    email,
    telephone,
    nom,
    advisor_code: clientData.advisor_code,
  })
  if (existing) return existing.id

  try {
    return await create(
      {
        nom,
        email,
        telephone,
        age: clientData.age || clientData.client_age,
        advisor_code: clientData.advisor_code,
        co_advisor_code: clientData.co_advisor_code,
      },
      userId
    )
  } catch (e) {
    console.error('[clients.findOrCreate] create failed:', e)
    return null
  }
}

// ─── Rattrapage des fiches sans prenom (item D6 du plan d amelioration) ────
// 331 fiches sur 381 portent « Prénom Nom » dans le seul champ nom. Ces deux
// fonctions servent l ecran de rattrapage reserve a la direction : lister
// les fiches concernees, puis ecrire les separations qu une personne a
// cochees et confirmees. Rien n est calcule ici : la proposition vient de
// lib/noms, la decision vient de l ecran.

/**
 * Fiches dont le prenom est vide et dont le nom contient au moins un espace
 * interieur, donc probablement « Prénom Nom » dans un seul champ.
 * Triees par nom, 500 au plus. La RLS decide de ce que chacun voit.
 */
export async function listerFichesSansPrenom() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom, prenom, advisor_code, telephone, email')
    .or('prenom.is.null,prenom.eq.')
    .like('nom', '% %')
    .order('nom', { ascending: true })
    .limit(500)
  if (error) throw error
  // Le filtre SQL laisse passer un nom dont le seul espace est en bordure
  // (« Dupont ») : on resserre ici, c est bon marche. Un prenom fait
  // d espaces n est pas vu par le filtre et reste hors de la liste.
  return (data || []).filter((c) =>
    String(c.prenom ?? '').trim() === '' && /\s/.test(String(c.nom ?? '').trim()),
  )
}

/**
 * Ecrit les separations validees, une fiche apres l autre pour qu un refus
 * n emporte pas les autres. Chaque ecriture passe par verifierEcriture :
 * une ligne que la RLS filtre en silence est comptee en echec avec un
 * message clair, jamais en reussite.
 *
 * @param {Array<{ id: string, prenom: string, nom: string }>} lignes
 * @returns {Promise<{ faites: string[], echecs: Array<{ id: string, message: string }> }>}
 */
export async function appliquerSeparations(lignes) {
  const faites = []
  const echecs = []
  for (const ligne of (lignes || [])) {
    const id = ligne?.id
    try {
      const prenom = String(ligne?.prenom ?? '').trim()
      const nom = String(ligne?.nom ?? '').trim()
      if (!id) throw new Error('Fiche sans identifiant, rien à écrire.')
      if (!nom) throw new Error('Le nom proposé est vide, la fiche garderait un nom vide.')
      const reponse = await supabase
        .from('clients')
        .update({ prenom: prenom || null, nom, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
      verifierEcriture(reponse, `Fiche « ${[prenom, nom].filter(Boolean).join(' ')} »`, MOTIF_DROITS)
      faites.push(id)
    } catch (e) {
      echecs.push({ id, message: e?.message || 'Erreur inconnue' })
    }
  }
  return { faites, echecs }
}

// ─── Completude des fiches (campagnes ciblees) ────────────────────────────────
// Le bloc « Fiches a completer » de l accueil et le tableau de completude de
// la direction lisent les memes colonnes : celles qui comptent pour une
// campagne (lib/completude), plus l identite et le rattachement. La RLS fait
// le tri : un conseiller recoit ses fiches (principal ou co conseiller), le
// manager toutes. On pagine par 1000 parce que PostgREST plafonne la a
// chaque appel et que le cabinet depasse deja les 381 fiches.

const PAGE_COMPLETUDE = 1000

export async function listerPourCompletude() {
  const lignes = []
  for (let depart = 0; ; depart += PAGE_COMPLETUDE) {
    // Tri sur nom PUIS id : entre deux pages, deux homonymes gardaient un
    // ordre indetermine et une fiche pouvait manquer ou apparaitre deux fois.
    const { data, error } = await supabase
      .from('clients')
      .select('id, nom, prenom, email, telephone, date_naissance, age, situation_familiale, statut_pro, profession, revenus_annuels, patrimoine_estime, advisor_code, co_advisor_code, created_at, updated_at, maj_par')
      .order('nom', { ascending: true })
      .order('id', { ascending: true })
      .range(depart, depart + PAGE_COMPLETUDE - 1)
    if (error) throw error
    lignes.push(...(data || []))
    if (!data || data.length < PAGE_COMPLETUDE) break
  }
  return lignes
}

/**
 * Complete une fiche depuis l accueil : n ecrit QUE les champs fournis et non
 * vides, jamais un effacement. Une valeur numerique illisible est refusee
 * avant tout appel a la base. L ecriture passe par verifierEcriture : une
 * fiche que la RLS filtre en silence remonte une erreur lisible, jamais un
 * faux « enregistre ».
 *
 * @param {string} clientId
 * @param {Object} patch  { date_naissance, situation_familiale, statut_pro, profession, revenus_annuels, patrimoine_estime, telephone, email }
 * @returns {Promise<Object>} les champs effectivement ecrits (vide si rien a ecrire)
 */
export async function completerFiche(clientId, patch = {}) {
  if (!clientId) throw new Error('Fiche sans identifiant, rien à écrire.')
  // Liste blanche, conversion et refus d un nombre illisible : lib/completude,
  // testee sans reseau.
  const clean = nettoyerCompletion(patch)
  if (Object.keys(clean).length === 0) return {}
  const reponse = await supabase
    .from('clients')
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select('id')
  verifierEcriture(reponse, 'Enregistrement de la fiche client', MOTIF_DROITS)
  return clean
}

// ─── Ciblage des campagnes ─────────────────────────────────────────────────
// L ecran Campagnes evalue ses criteres sur les fiches en memoire : il lui
// faut les colonnes de ciblage (statut, age, revenus, patrimoine, situation,
// enfants) et les coordonnees pour l export. Pagine par 1000 comme la
// completude : un plafond fixe aurait coupe la liste en silence le jour ou
// le cabinet le depasse. La RLS decide de ce que chacun voit.

export const COLONNES_CIBLAGE = [
  'id', 'nom', 'prenom', 'email', 'telephone', 'date_naissance', 'age',
  'situation_familiale', 'nb_enfants', 'statut_pro', 'profession',
  'revenus_annuels', 'patrimoine_estime', 'code_postal', 'advisor_code', 'co_advisor_code',
].join(', ')

export async function listerPourCiblage() {
  const lignes = []
  for (let depart = 0; ; depart += PAGE_COMPLETUDE) {
    const { data, error } = await supabase
      .from('clients')
      .select(COLONNES_CIBLAGE)
      .order('nom', { ascending: true })
      .order('id', { ascending: true })
      .range(depart, depart + PAGE_COMPLETUDE - 1)
    if (error) throw error
    lignes.push(...(data || []))
    if (!data || data.length < PAGE_COMPLETUDE) break
  }
  return lignes
}

// ─────────────────────────────────────────────────────────────────────────
// Doublons et fusion (demande Thomas 26/08)
//
// Supprimer une fiche en doublon serait destructeur : la cle etrangere vers
// clients est en CASCADE pour les contrats, documents, echanges et
// equipements. Sur les 21 groupes detectes, la majorite porte des donnees des
// DEUX cotes. On fusionne donc, on ne supprime pas.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Groupes de fiches en doublon, deja regroupes et comptes par la base.
 * La RLS s'applique : un conseiller ne voit que son perimetre.
 * @returns [{ cle, critere, fiches: [...] }] tries du plus fiable au moins sur
 */
export async function listerDoublons() {
  const { data, error } = await supabase.rpc('doublons_clients')
  if (error) throw error

  const parGroupe = new Map()
  for (const l of data || []) {
    if (!parGroupe.has(l.cle)) parGroupe.set(l.cle, { cle: l.cle, critere: l.critere, fiches: [] })
    parGroupe.get(l.cle).fiches.push(l)
  }
  // Un groupe dont la RLS ne laisse voir qu'une fiche n'est pas actionnable.
  return [...parGroupe.values()].filter((g) => g.fiches.length > 1)
}

/**
 * Fusionne deux fiches. Tout est rapatrie sur `gardeId`, `absorbeId` disparait.
 * Les regles de droit vivent dans la fonction SQL, pas ici.
 * @returns { ok, deplace: { dossiers, contrats, documents, ... } }
 */
export async function fusionner(gardeId, absorbeId) {
  const { data, error } = await supabase.rpc('fusionner_clients', {
    p_garde: gardeId,
    p_absorbe: absorbeId,
  })
  if (error) throw error
  return data
}

/**
 * La fiche telle que la modale dossier en a besoin, lue a l instant : les six
 * champs que le verrou de signature controle. Null si la fiche n est pas
 * lisible (RLS) ou n existe pas ; la modale se comporte alors comme avant.
 */
export async function ficheDossier(clientId) {
  if (!clientId) return null
  const { data, error } = await supabase
    .from('clients')
    .select('id, email, telephone, statut_pro, profession, revenus_annuels, patrimoine_estime')
    .eq('id', clientId)
    .maybeSingle()
  if (error) return null
  return data || null
}
