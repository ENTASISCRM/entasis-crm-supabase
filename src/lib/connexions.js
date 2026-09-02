// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL DES CONNEXIONS : la lecture
//
// Ce module ne lit rien et n ecrit rien. On lui passe les lignes rendues par
// la fonction journal_connexions() et il rend de quoi remplir l ecran : le
// resume par personne, un lieu lisible, un appareil lisible, et les
// connexions qui meritent un coup d oeil.
//
// La logique de dates et de comparaison vit ici, pas dans le composant, pour
// etre testee sans navigateur ni base.
// ═══════════════════════════════════════════════════════════════════════════

// Au dela, la connexion n est plus « a l instant » dans la vue en direct.
export const MINUTES_EN_DIRECT = 20

// Le cabinet travaille depuis la France. Une connexion d ailleurs n est pas
// une faute en soi (un conseiller en deplacement), c est ce qui merite d etre
// regarde plutot que devine.
export const PAYS_ATTENDU = 'FR'

const ms = (iso) => {
  const t = Date.parse(String(iso || ''))
  return Number.isNaN(t) ? null : t
}

// Vrai si la connexion date de moins de N minutes.
export function estRecent(iso, minutes = MINUTES_EN_DIRECT, maintenant = new Date()) {
  const t = ms(iso)
  if (t == null) return false
  return maintenant.getTime() - t <= minutes * 60 * 1000
}

// « Paris, France » quand on sait, « — » quand l IP n a rien donne. Le pays
// arrive en deux lettres, on ecrit en toutes lettres ceux qu on croise.
const PAYS = {
  FR: 'France', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg', MC: 'Monaco',
  ES: 'Espagne', IT: 'Italie', PT: 'Portugal', DE: 'Allemagne', GB: 'Royaume Uni',
  NL: 'Pays Bas', IE: 'Irlande', US: 'Etats Unis', CA: 'Canada', MA: 'Maroc',
  TN: 'Tunisie', DZ: 'Algerie', SN: 'Senegal', AE: 'Emirats arabes unis',
}

export function nomPays(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!c) return null
  return PAYS[c] || c
}

export function lieu(ligne) {
  const ville = String(ligne?.ville || '').trim()
  const pays = nomPays(ligne?.pays)
  if (ville && pays) return `${ville}, ${pays}`
  if (ville) return ville
  if (pays) return pays
  return '—'
}

// Un user agent lisible en trois mots. On ne cherche pas l exhaustivite, on
// cherche a reconnaitre un appareil inhabituel d un coup d oeil.
export function appareil(userAgent) {
  const ua = String(userAgent || '')
  if (!ua.trim()) return '—'

  let systeme = null
  if (/iPhone/i.test(ua)) systeme = 'iPhone'
  else if (/iPad/i.test(ua)) systeme = 'iPad'
  else if (/Android/i.test(ua)) systeme = 'Android'
  else if (/Mac OS X|Macintosh/i.test(ua)) systeme = 'Mac'
  else if (/Windows/i.test(ua)) systeme = 'Windows'
  else if (/Linux/i.test(ua)) systeme = 'Linux'

  let navigateur = null
  // L ordre compte : Edge et Opera se declarent aussi Chrome, Chrome se
  // declare aussi Safari.
  if (/Edg\//i.test(ua)) navigateur = 'Edge'
  else if (/OPR\/|Opera/i.test(ua)) navigateur = 'Opera'
  else if (/Firefox\//i.test(ua)) navigateur = 'Firefox'
  else if (/Chrome\//i.test(ua)) navigateur = 'Chrome'
  else if (/Safari\//i.test(ua)) navigateur = 'Safari'

  if (navigateur && systeme) return `${navigateur} sur ${systeme}`
  return navigateur || systeme || 'Navigateur inconnu'
}

// Cle d une personne : l identifiant du profil quand il existe, l email sinon
// (une connexion peut precéder la creation du profil).
const cle = (l) => l?.user_id || String(l?.email || '').toLowerCase()

// Le nom a afficher, avec l email en repli.
export function nomDe(ligne) {
  return String(ligne?.full_name || '').trim() || String(ligne?.email || '').trim() || 'Compte inconnu'
}

/**
 * Une ligne par personne, sa derniere connexion en tete.
 * Les personnes vues le plus recemment d abord.
 */
export function resumerParPersonne(lignes, maintenant = new Date()) {
  const par = new Map()
  for (const l of lignes || []) {
    const k = cle(l)
    if (!k) continue
    const t = ms(l.created_at)
    if (t == null) continue
    const vu = par.get(k)
    if (!vu || t > vu.horodatage) {
      par.set(k, { cle: k, nom: nomDe(l), derniere: l, horodatage: t, nbConnexions: (vu?.nbConnexions || 0) + 1 })
    } else {
      vu.nbConnexions += 1
    }
  }
  return Array.from(par.values())
    .map((p) => ({ ...p, enDirect: estRecent(p.derniere.created_at, MINUTES_EN_DIRECT, maintenant) }))
    .sort((a, b) => b.horodatage - a.horodatage)
}

/**
 * Ce qui merite un coup d oeil, sur la fenetre chargee :
 *   • hors-france  : connexion depuis un pays autre que celui attendu
 *   • lieu-nouveau : ville jamais vue pour cette personne dans la fenetre
 *
 * Le premier lieu connu d une personne n est jamais « nouveau » : sinon toute
 * la liste serait signalee le premier jour.
 */
export function signaler(lignes) {
  const parPersonne = new Map()
  // Du plus ancien au plus recent : « deja vu » n a de sens que dans ce sens la.
  const ordonnees = [...(lignes || [])]
    .filter((l) => ms(l.created_at) != null)
    .sort((a, b) => ms(a.created_at) - ms(b.created_at))

  const out = new Map()
  for (const l of ordonnees) {
    const k = cle(l)
    if (!k) continue
    const vus = parPersonne.get(k) || new Set()
    const ville = String(l.ville || '').trim().toLowerCase()
    const motifs = []

    const pays = String(l.pays || '').trim().toUpperCase()
    if (pays && pays !== PAYS_ATTENDU) motifs.push('hors-france')
    if (ville && vus.size > 0 && !vus.has(ville)) motifs.push('lieu-nouveau')

    if (ville) vus.add(ville)
    parPersonne.set(k, vus)
    if (motifs.length > 0) out.set(l.id, motifs)
  }
  return out
}

// Horodatage court pour l ecran : « 2 sept. à 14:32 ».
export function quand(iso) {
  const t = ms(iso)
  if (t == null) return '—'
  const d = new Date(t)
  const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${jour} à ${heure}`
}

// « il y a 3 min », « il y a 2 h », « il y a 4 j ». Sert a la vue en direct.
export function depuis(iso, maintenant = new Date()) {
  const t = ms(iso)
  if (t == null) return '—'
  const min = Math.floor((maintenant.getTime() - t) / 60000)
  if (min < 1) return 'à l instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  return `il y a ${j} j`
}
