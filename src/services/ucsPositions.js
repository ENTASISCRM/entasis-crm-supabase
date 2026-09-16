// src/services/ucsPositions.js
// Suivi des produits structures reellement places par le cabinet : l encours
// pose sur chaque UCS, sa derniere valorisation et l historique de ces
// valorisations. Sous vue « Mes structurés » de l onglet UCS.
//
// Demande de la direction du 16/09/2026 : « voir ou en sont mes produits
// structures en direct, avec les en cours que j ai dessus ».
//
// Ce que « en direct » veut dire ici. Ces EMTN n ont aucune cotation publique
// (verifie le 16/09/2026 sur Yahoo, Boerse Frankfurt et Euronext : aucun des
// dix ISIN n y est connu). La seule valeur qui existe est celle du reporting
// du structureur, que la direction recoit et saisit avec sa date. L ecran
// montre donc toujours la date a cote de la valeur, pour que personne ne
// prenne une valeur de juin pour une valeur du jour.
//
// Deux regles de base a respecter (migration 20260916_ucs_encours_et_valorisations) :
//   - derniere_valo et derniere_valo_le ne s ecrivent JAMAIS a la main : un
//     declencheur les tient a jour a chaque valorisation inseree ;
//   - la table et l historique sont reserves a la direction (est_direction_pnl),
//     un manager sans ce drapeau lit zero ligne et ses ecritures sont refusees.
//
// Lecture sur la table ucs_structures et non sur la vue ucs_catalogue : la vue
// a ete creee en base avant ces colonnes et rien dans le depot ne dit qu elle
// les expose. La table, elle, les porte a coup sur, et l ecran est de toute
// facon reserve a ceux qui ont le droit de la lire.

import { supabase } from '../lib/supabase'
import { verifierEcriture, MOTIF_DROITS } from '../lib/ecriture-verifiee'
import { fetchTout } from './pagination'

export const SOURCE_PAR_DEFAUT = 'reporting structureur'

// Au dela de ces ages, une valorisation est signalee comme vieillissante puis
// perimee. Les reportings des structureurs sont mensuels : a 45 jours il en
// manque un, a 90 jours il en manque deux.
export const JOURS_VALO_ANCIENNE = 45
export const JOURS_VALO_PERIMEE = 90

const MOIS_PAR_FREQUENCE = { MENSUELLE: 1, TRIMESTRIELLE: 3, SEMESTRIELLE: 6, ANNUELLE: 12 }

// ─────────────────────────────────────────────────────────────────────────────
// Dates. Tout se fait sur des chaines ISO (annee, mois, jour), jamais sur des objets Date
// locaux : une date de constatation est un jour du calendrier, pas un instant,
// et un new Date('2026-03-31') minuit UTC glisse au 30 mars a Paris l hiver.
// ─────────────────────────────────────────────────────────────────────────────

export const dateLocaleIso = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const estDateIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

// Minuit UTC du jour ISO, pour compter des jours sans heure d ete.
const utcDe = (iso) => {
  const [a, m, j] = iso.split('-').map(Number)
  return Date.UTC(a, m - 1, j)
}

// Ajoute n mois a une date ISO en gardant le jour, borne au dernier jour du
// mois d arrivee (31 janvier + 1 mois = 28 ou 29 fevrier).
export function ajouterMois(iso, n) {
  if (!estDateIso(iso)) return null
  const [a, m, j] = iso.split('-').map(Number)
  const total = (m - 1) + n
  const annee = a + Math.floor(total / 12)
  const mois = ((total % 12) + 12) % 12
  const dernierJour = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate()
  const p = (x) => String(x).padStart(2, '0')
  return `${annee}-${p(mois + 1)}-${p(Math.min(j, dernierJour))}`
}

// Nombre de jours entre deux dates ISO (positif si `aujourdhui` est apres).
export function joursDepuis(iso, aujourdhui = dateLocaleIso()) {
  if (!estDateIso(iso) || !estDateIso(aujourdhui)) return null
  return Math.round((utcDe(aujourdhui) - utcDe(iso)) / 86400000)
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculs purs, testes dans ucsPositions.test.js
// ─────────────────────────────────────────────────────────────────────────────

const nombreOuNull = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Ecart au pair, en points : 100 est le nominal, 98,5 vaut moins 1,5 point.
export function performanceDepuisPair(valo) {
  const v = nombreOuNull(valo)
  return v == null ? null : v - 100
}

// Ce que vaut l encours a la derniere valorisation connue. Sans valorisation,
// on ne sait pas : null, pas l encours nominal, sinon le total ment.
export function valeurEstimee(encours, valo) {
  const e = nombreOuNull(encours)
  const v = nombreOuNull(valo)
  if (e == null || v == null) return null
  return (e * v) / 100
}

// Age de la derniere valorisation, lu par l ecran pour colorer la date.
export function fraicheurValo(dateValo, aujourdhui = dateLocaleIso()) {
  const jours = joursDepuis(dateValo, aujourdhui)
  if (jours == null) return null
  if (jours > JOURS_VALO_PERIMEE) return 'perimee'
  if (jours > JOURS_VALO_ANCIENNE) return 'ancienne'
  return 'recente'
}

// Prochaine date de constatation, ESTIMEE.
//
// Ce que portent les colonnes : `constatation` est la frequence d observation
// du sous jacent (MENSUELLE, TRIMESTRIELLE...), `frequence_coupon` celle du
// coupon, `coupon_periode` est un montant de coupon par periode (0,834 pour un
// mensuel), pas une duree. `date_debut` et `fin_commerc` bornent la periode de
// commercialisation. Aucune colonne ne porte la date de constatation initiale
// (le strike), qui tombe en pratique juste apres la fin de commercialisation.
//
// On part donc de fin_commerc, jamais de date_debut : ancrer sur le debut de
// campagne decalerait toutes les dates d un mois ou deux. Sans fin_commerc, ou
// sans frequence exploitable, on rend null plutot qu une date inventee. Une
// constatation quotidienne n a pas de « prochaine » date utile : null aussi,
// l ecran ecrit « quotidienne ». Les dates sont bornees par la maturite.
export function prochaineConstatation(ucs, aujourdhui = dateLocaleIso()) {
  const frequence = ucs?.constatation || ucs?.frequence_coupon
  const pas = MOIS_PAR_FREQUENCE[frequence]
  const ancre = ucs?.fin_commerc
  if (!pas || !estDateIso(ancre) || !estDateIso(aujourdhui)) return null
  const maturite = ucs.maturite_annees ? ajouterMois(ancre, Number(ucs.maturite_annees) * 12) : null
  // Cinquante ans de constatations mensuelles au plus : une boucle bornee
  // parce qu une date de fin de commercialisation absurde ne doit pas figer
  // l ecran.
  for (let k = 1; k <= 600; k++) {
    const d = ajouterMois(ancre, k * pas)
    if (maturite && d > maturite) return null
    if (d > aujourdhui) return d
  }
  return null
}

// Coupon annuel affiche : coupon_annualise s il est renseigne, sinon le coupon
// par periode multiplie par le nombre de periodes dans l annee. Null si rien
// ne permet de le dire.
export function couponAnnualise(ucs) {
  const direct = nombreOuNull(ucs?.coupon_annualise)
  if (direct != null) return direct
  const periode = nombreOuNull(ucs?.coupon_periode)
  const pas = MOIS_PAR_FREQUENCE[ucs?.frequence_coupon]
  if (periode == null || !pas) return null
  return periode * (12 / pas)
}

// Ordre d affichage : les UCS qui portent un encours d abord, du plus gros au
// plus petit, puis les autres encore en cours par nom. Une UCS cloturee sans
// encours n a rien a faire ici : le cabinet n a rien dessus.
export function trierPositions(ucs = []) {
  const avecEncours = ucs.filter((u) => nombreOuNull(u.encours_place) > 0)
  const sansEncours = ucs.filter((u) => !(nombreOuNull(u.encours_place) > 0) && u.etat === 'EN_COURS')
  avecEncours.sort((a, b) => Number(b.encours_place) - Number(a.encours_place) || String(a.nom_ucs).localeCompare(String(b.nom_ucs), 'fr'))
  sansEncours.sort((a, b) => String(a.nom_ucs).localeCompare(String(b.nom_ucs), 'fr'))
  return [...avecEncours, ...sansEncours]
}

// Chiffres de tete. La valeur estimee totale ne compte que les UCS valorisees,
// et le nombre d UCS a encours sans valorisation est rendu a part pour que
// l ecran le dise. La valorisation la plus ancienne ne regarde que les UCS a
// encours : une UCS vide n a pas besoin d etre a jour.
export function totauxPositions(ucs = []) {
  let encoursTotal = 0
  let valeurEstimeeTotal = 0
  let nbValorisees = 0
  let nbSansValo = 0
  let plusAncienne = null
  for (const u of ucs) {
    const encours = nombreOuNull(u.encours_place) || 0
    if (encours <= 0) continue
    encoursTotal += encours
    const valeur = valeurEstimee(encours, u.derniere_valo)
    if (valeur == null || !estDateIso(u.derniere_valo_le)) { nbSansValo++; continue }
    valeurEstimeeTotal += valeur
    nbValorisees++
    if (!plusAncienne || u.derniere_valo_le < plusAncienne.date) {
      plusAncienne = { date: u.derniere_valo_le, nom: u.nom_ucs }
    }
  }
  return { encoursTotal, valeurEstimeeTotal, nbValorisees, nbSansValo, plusAncienne }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preparation des saisies (pur, teste) : on accepte ce qu un humain tape
// (« 12 000 », « 98,5 »), on refuse ce que la base refuserait ou ce qui n a
// pas de sens (une valorisation dans le futur, un encours negatif).
// ─────────────────────────────────────────────────────────────────────────────

export function lireMontant(saisie) {
  if (saisie == null) return null
  const brut = String(saisie).replace(/\s|\u202f|\u00a0|€/g, '').replace(',', '.')
  if (brut === '') return null
  const n = Number(brut)
  return Number.isFinite(n) ? n : null
}

export function preparerEncours(saisie) {
  const montant = lireMontant(saisie)
  if (montant == null) throw new Error('Montant illisible.')
  if (montant < 0) throw new Error('Un encours ne peut pas être négatif.')
  return Math.round(montant * 100) / 100
}

export function preparerValorisation({ date_valo, valeur, source } = {}, aujourdhui = dateLocaleIso()) {
  if (!estDateIso(date_valo)) throw new Error('La date de valorisation est obligatoire.')
  if (date_valo > aujourdhui) throw new Error('Une valorisation ne peut pas être datée dans le futur.')
  const v = lireMontant(valeur)
  if (v == null) throw new Error('La valeur est illisible.')
  if (v <= 0) throw new Error('La valeur doit être positive, en pour cent du nominal (100 = pair).')
  if (v > 1000) throw new Error('La valeur se saisit en pour cent du nominal (100 = pair), pas en euros.')
  const s = String(source || '').trim()
  return {
    date_valo,
    valeur: Math.round(v * 1000) / 1000,
    source: s || SOURCE_PAR_DEFAUT,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formats
// ─────────────────────────────────────────────────────────────────────────────

export const fmtEuro = (n) => {
  const v = nombreOuNull(n)
  if (v == null) return ''
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

// « 98,25 % » : jusqu a trois decimales, comme la colonne en base.
export const fmtValo = (n) => {
  const v = nombreOuNull(n)
  if (v == null) return ''
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} %`
}

// « +1,25 pt » ou « −1,25 pt » : le signe est toujours ecrit, c est lui que
// la direction lit en premier.
export const fmtPoints = (n) => {
  const v = nombreOuNull(n)
  if (v == null) return ''
  const abs = Math.abs(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
  const signe = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${signe}${abs} pt`
}

export const fmtDateFr = (iso) => {
  if (!estDateIso(iso)) return ''
  const [a, m, j] = iso.split('-')
  return `${j}/${m}/${a}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Acces Supabase
// ─────────────────────────────────────────────────────────────────────────────

const COLONNES = [
  'id', 'etat', 'compagnie', 'nom_ucs', 'code_isin', 'sous_jacent',
  'coupon_annualise', 'coupon_periode', 'frequence_coupon', 'constatation',
  'maturite_annees', 'date_debut', 'fin_commerc',
  'encours_place', 'derniere_valo', 'derniere_valo_le',
  'structureur:structureurs(id, nom)',
].join(', ')

// Toutes les UCS avec leurs colonnes d encours et de valorisation. Le tri
// metier se fait dans trierPositions, la base rend simplement par nom.
export async function listPositions() {
  return fetchTout(() => supabase
    .from('ucs_structures')
    .select(COLONNES)
    .order('nom_ucs', { ascending: true }))
}

// Encours place par le cabinet sur une UCS. Seule cette colonne part : les
// colonnes de valorisation appartiennent au declencheur.
export async function updateEncours(ucsId, saisie) {
  const encours_place = preparerEncours(saisie)
  const reponse = await supabase
    .from('ucs_structures')
    .update({ encours_place })
    .eq('id', ucsId)
    .select('id')
  verifierEcriture(reponse, 'Enregistrement de l encours', MOTIF_DROITS)
  return encours_place
}

// Une valorisation a une date. La base n en garde qu une par UCS et par jour :
// resaisir le meme jour corrige la valeur au lieu d echouer, et le declencheur
// (after insert or update) remet derniere_valo a jour dans les deux cas.
export async function saisirValorisation(ucsId, saisie, { saisi_par = null } = {}) {
  const propre = preparerValorisation(saisie)
  const { data, error } = await supabase
    .from('ucs_valorisations')
    .upsert(
      { ucs_id: ucsId, ...propre, saisi_par },
      { onConflict: 'ucs_id,date_valo' },
    )
    .select()
    .single()
  if (error) throw error
  if (!data) throw new Error(`Enregistrement de la valorisation : la base a refusé la modification. ${MOTIF_DROITS}`)
  return data
}

// Historique d une UCS, du plus recent au plus ancien.
export async function listHistorique(ucsId) {
  return fetchTout(() => supabase
    .from('ucs_valorisations')
    .select('id, ucs_id, date_valo, valeur, source, saisi_par, created_at')
    .eq('ucs_id', ucsId)
    .order('date_valo', { ascending: false }))
}
