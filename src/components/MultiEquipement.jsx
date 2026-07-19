// ═══════════════════════════════════════════════════════════════════════════
// MULTI ÉQUIPEMENT V3 : les missions, l argent d abord
//
// Cap fixé par Louis : la V2 (matrice, radar, heatmap) était un bel outil
// d analyse mais un mauvais outil de vente. La V3 renverse la logique :
//   L ARGENT D ABORD  une liste de missions triées par montant, un hero
//                     qui dit combien d euros restent à aller chercher.
//   ANTI ZAP          « Plus tard » sans friction faisait tout zapper. Ici
//                     reporter exige une raison ET une échéance, la mission
//                     revient toute seule à la date dite, et les cartes qui
//                     dorment vieillissent visuellement (7 j orange, 14 j
//                     rouge). Le manager voit qui reporte quoi et pourquoi.
//   AUTO VALIDATION   à la signature du deal, la réconciliation passe la
//                     mission en gagnée avec le montant réel : personne ne
//                     coche rien à la main.
// La matrice V2 reste accessible via un toggle discret (sous composant
// allégé : matrice + drawer de déclarations, sans radar ni heatmap).
//
// Données : vue client_equipment (RLS security invoker) + table me_missions
// (RLS alignée sur clients) + app_settings clé multiequipement (campagne).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  listEquipment, listFamilies, upsertDeclare, removeDeclare,
  listDeclaresForClient, listSignedDealsForClient, getSettings, saveSettings,
  getClientContact, updateClientInfo, setClientPause, listActivePauses, patchClient,
} from '../services/equipment'
import { listMissions, upsertMission, reconcileGagnees, listCollaboration } from '../services/missions'
import { listSignaux, addSignal, deleteSignal } from '../services/signaux'
import {
  suggestionPour, ARGUMENTAIRES, estimationCollecte, baseMontant, REGLES,
  RAISONS_REPORT, ECHEANCES_REPORT, simulationIndicative,
} from '../config/multiEquipementRules'
import { genererMail, genererRecommandation, genererRelance, CABINET } from '../config/mailsProduits'

// Statuts pro (miroir de la fiche client) pour la capture inline.
const STATUTS_PRO = ['Salarié', 'TNS', 'Chef d entreprise', 'Retraité', 'Profession libérale', 'Autre']
// Jalons de relance (jours depuis la mise en cours) : cadence de suivi douce.
function infoRelance(mi) {
  if (mi.statut !== 'en_cours' || !mi.updated_at) return { due: false, jours: 0, etape: 0 }
  const jours = Math.floor((Date.now() - new Date(mi.updated_at).getTime()) / 86400000)
  const etape = jours >= 45 ? 3 : jours >= 21 ? 2 : jours >= 7 ? 1 : 0
  return { due: etape > 0, jours, etape }
}
const LIB_RELANCE = { 1: 'à relancer', 2: 'relance ferme', 3: 'point de décision' }

const fmtEur = (v) =>
  Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtK = (v) => (v >= 1000 ? `${Math.round(v / 1000)} k€` : `${Math.round(v)} €`)

function nomClient(c) {
  const n = `${c.prenom || ''} ${c.nom || ''}`.trim()
  return n || '(sans nom)'
}
function dansNJours(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function memeMois(iso) {
  if (!iso) return false
  const d = new Date(iso); const n = new Date()
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
}
// Age en jours d une mission depuis sa creation en base (null si pas en base).
function ageJours(mi) {
  if (!mi.enBase || !mi.created_at) return null
  return Math.floor((Date.now() - new Date(mi.created_at).getTime()) / 86400000)
}
const ACTIFS = ['a_attaquer', 'en_cours', 'reportee']

export default function MultiEquipement({ profile, onCreateDeal }) {
  const isManager = profile?.role === 'manager'
  const [rows, setRows] = useState([])
  const [families, setFamilies] = useState([])
  const [settings, setSettings] = useState({ campagne_du_mois: 'prevoyance', objectif_taux_multi: 40 })
  const [missions, setMissions] = useState([])
  const [collab, setCollab] = useState([])       // missions de collaboration adressées à ce conseiller
  const [signaux, setSignaux] = useState([])     // signaux terrain (#8)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [vue, setVue] = useState('missions')       // missions (Ma journée, defaut) | matrice | reports
  const [chip, setChip] = useState('journee')      // journee | a_attaquer | en_cours | ...
  const [campSeul, setCampSeul] = useState(false)  // ne montrer que la campagne
  const [reportPour, setReportPour] = useState(null) // mission ouverte dans la modale
  const [proposerPour, setProposerPour] = useState(null) // { client, preset, relance } de la modale Proposer
  const [editCamp, setEditCamp] = useState(false)
  const [capId, setCapId] = useState(null)         // ligne dont la capture inline est ouverte
  const [tri, setTri] = useState('montant')        // montant | conseil
  const [revue, setRevue] = useState(null)         // missions ouvertes en pile de revue par lot

  async function reload() {
    const [eq, fam, st, mis, pauses, sigs] = await Promise.all([
      listEquipment(), listFamilies(), getSettings(), listMissions(), listActivePauses(), listSignaux(),
    ])
    const pauseMap = new Map((pauses || []).map((p) => [p.id, p]))
    const sigByClient = new Map()
    for (const s of (sigs || [])) { const a = sigByClient.get(s.client_id) || []; a.push(s); sigByClient.set(s.client_id, a) }
    setSignaux(sigs || [])
    const mapped = eq.map((c) => {
      const p = pauseMap.get(c.client_id)
      return {
        client_id: c.client_id,
        nom: nomClient(c),
        prenom: c.prenom || '', nomSeul: c.nom || '',
        profession: c.profession || '',
        statut: c.statut_pro || '',
        advisor_code: c.advisor_code || '—',
        revenus: Number(c.revenus_annuels || 0),
        patrimoine: Number(c.patrimoine_estime || 0),
        familles: Array.isArray(c.familles) ? c.familles : [],
        absences: Array.isArray(c.absences_confirmees) ? c.absences_confirmees : [],
        ailleurs: Array.isArray(c.ailleurs_familles) ? c.ailleurs_familles : [],
        nb: Number(c.nb_familles || 0),
        nbEnfants: Number(c.nb_enfants || 0),
        situationFam: c.situation_familiale || '',
        codePostal: c.code_postal || '',
        foyerId: c.foyer_id || null,
        prochainRdv: c.prochain_rdv || null,
        plan: Array.isArray(c.plan_equipement) ? c.plan_equipement : [],
        profil: Array.isArray(c.profil_approche) ? c.profil_approche : [],
        pauseJusqu: p?.pause_jusqu_au || null,
        pauseMotif: p?.pause_motif || '',
        pauseActive: !!p,
        signaux: sigByClient.get(c.client_id) || [],
      }
    })
    setFamilies(fam)
    setSettings(st)
    setRows(mapped)
    // Reconciliation : coche les gagnees a la signature, reveille les reports echus
    try { setMissions(await reconcileGagnees(mapped, mis)) } catch { setMissions(mis) }
    try { setCollab(await listCollaboration(profile?.advisor_code)) } catch { setCollab([]) }
  }
  useEffect(() => {
    let vivant = true
    ;(async () => {
      try { await reload() } catch (e) { if (vivant) setErr(e.message || 'Erreur de chargement') }
      finally { if (vivant) setLoading(false) }
    })()
    return () => { vivant = false }
  }, [])
  async function refreshMissions() {
    try { setMissions(await listMissions()) } catch { /* la prochaine navigation rechargera */ }
  }

  const famMap = useMemo(() => Object.fromEntries(families.map((f) => [f.key, f])), [families])
  const labelFam = (k) => famMap[k]?.label || k
  const couleurFam = (k) => famMap[k]?.couleur || '#8A95A8'
  // Private Equity retiré du module (décision Louis : « on ne fait pas »).
  const matCols = useMemo(() => families.filter((f) => f.key !== 'autre' && f.key !== 'private_equity'), [families])
  const camp = settings.campagne_du_mois || null

  // ── Génération des missions à l affichage ────────────────────────────────
  // Les opportunités (règles + campagne du mois) fabriquent les candidates,
  // fusionnées avec l état persisté me_missions. Une mission en base reste
  // affichée même si sa règle s est éteinte : la base fait foi une fois lancée.
  const missionsAff = useMemo(() => {
    const dbByKey = new Map(missions.map((m) => [`${m.client_id}|${m.famille}`, m]))
    const rowById = new Map(rows.map((r) => [r.client_id, r]))
    const lf = (k) => famMap[k]?.label || k
    const raisonFallback = (famille) =>
      REGLES.find((rg) => rg.famille_suggeree === famille)?.raison
      || (famille === camp ? `Campagne du mois : proposer ${lf(famille)}.` : 'Mission de suivi enregistrée.')
    const vus = new Set()
    const out = []
    const fusion = (r, famille, raison) => {
      const key = `${r.client_id}|${famille}`
      if (vus.has(key)) return
      vus.add(key)
      const db = dbByKey.get(key)
      const bm = baseMontant(r, famille)
      out.push({
        key, client: r, famille, raison,
        statut: db?.statut || 'a_attaquer',
        montant: db?.montant_estime != null ? Number(db.montant_estime) : bm.montant,
        base: bm.base, parDefaut: bm.parDefaut && db?.montant_estime == null,
        confiance: bm.confiance, bas: bm.bas, haut: bm.haut,
        montant_reel: db?.montant_reel != null ? Number(db.montant_reel) : null,
        raison_report: db?.raison_report || null,
        retour_le: db?.retour_le || null,
        advisor_code: db?.advisor_code || r.advisor_code,
        renfort_code: db?.renfort_code || null,
        regard_avis: db?.regard_avis || null,
        regard_avis_by: db?.regard_avis_by || null,
        created_at: db?.created_at || null,
        updated_at: db?.updated_at || null,
        enBase: !!db,
      })
    }
    for (const r of rows) {
      if (r.pauseActive) continue // client en veille : aucune mission à proposer
      const sug = suggestionPour(r)
      if (sug) fusion(r, sug.famille_suggeree, sug.raison)
      // Règle Louis : la campagne cible tout client qui ne détient pas la famille
      if (camp && !r.familles.includes(camp)) {
        fusion(r, camp, `Campagne du mois : proposer ${lf(camp)}.`)
      }
    }
    // Missions en base sans candidate (gagnées, exclues, règle éteinte, campagne passée)
    for (const m of missions) {
      const key = `${m.client_id}|${m.famille}`
      if (vus.has(key)) continue
      const r = rowById.get(m.client_id)
      if (!r) continue // client hors périmètre RLS ou sans ligne équipement
      // Une mission active sur famille désormais détenue est gérée par la réconciliation
      if (ACTIFS.includes(m.statut) && r.familles.includes(m.famille)) continue
      vus.add(key)
      const bm2 = baseMontant(r, m.famille)
      out.push({
        key, client: r, famille: m.famille, raison: raisonFallback(m.famille),
        statut: m.statut,
        montant: m.montant_estime != null ? Number(m.montant_estime) : bm2.montant,
        base: bm2.base, parDefaut: bm2.parDefaut && m.montant_estime == null,
        confiance: bm2.confiance, bas: bm2.bas, haut: bm2.haut,
        montant_reel: m.montant_reel != null ? Number(m.montant_reel) : null,
        raison_report: m.raison_report || null,
        retour_le: m.retour_le || null,
        advisor_code: m.advisor_code || r.advisor_code,
        renfort_code: m.renfort_code || null,
        regard_avis: m.regard_avis || null,
        regard_avis_by: m.regard_avis_by || null,
        created_at: m.created_at || null,
        updated_at: m.updated_at || null,
        enBase: true,
      })
    }
    return out
  }, [rows, missions, camp, famMap])

  // ── Agrégats argent ──────────────────────────────────────────────────────
  const actives = useMemo(() => missionsAff.filter((m) => ACTIFS.includes(m.statut)), [missionsAff])
  const totalActives = useMemo(() => actives.reduce((s, m) => s + (m.montant || 0), 0), [actives])
  const gagnees = useMemo(() => missionsAff.filter((m) => m.statut === 'gagnee'), [missionsAff])
  const gagneesMois = useMemo(() => gagnees.filter((m) => memeMois(m.updated_at)), [gagnees])
  const gagneesMoisEur = useMemo(() => gagneesMois.reduce((s, m) => s + (m.montant_reel || 0), 0), [gagneesMois])
  const reportees = useMemo(() => missionsAff.filter((m) => m.statut === 'reportee'), [missionsAff])
  const reporteesEur = useMemo(() => reportees.reduce((s, m) => s + (m.montant || 0), 0), [reportees])
  const nb = (st) => missionsAff.filter((m) => m.statut === st).length

  // ── Campagne du mois : jauge et euros en jeu ─────────────────────────────
  const campagne = useMemo(() => {
    if (!camp) return null
    const misCamp = missionsAff.filter((m) => m.famille === camp)
    const gagneesCamp = misCamp.filter((m) => m.statut === 'gagnee' && memeMois(m.updated_at)).length
    const cibles = rows.filter((r) => !r.familles.includes(camp)).length + gagneesCamp
    const traitees = misCamp.filter((m) => m.enBase && m.statut !== 'a_attaquer').length
    const enJeu = misCamp.filter((m) => ACTIFS.includes(m.statut)).reduce((s, m) => s + (m.montant || 0), 0)
    const objectif = Number(settings.objectif_campagne || 0) || cibles
    return { cibles, traitees, enJeu, objectif }
  }, [missionsAff, rows, camp, settings.objectif_campagne])

  // Missions en cours dues pour une relance (cadence de suivi), hors clients en veille
  const relanceDue = useMemo(
    () => missionsAff.filter((m) => m.statut === 'en_cours' && !m.client.pauseActive && infoRelance(m).due),
    [missionsAff],
  )
  // Budget d attention (#4) : sollicitations récentes par client (proxy sur les
  // missions touchées ces 6 mois), pour un garde-fou de sur-sollicitation.
  const budgetMap = useMemo(() => {
    const seuil = Date.now() - 183 * 86400000
    const m = new Map()
    for (const mi of missionsAff) {
      if (!['en_cours', 'reportee', 'gagnee'].includes(mi.statut)) continue
      const t = mi.updated_at ? new Date(mi.updated_at).getTime() : 0
      if (!t || t < seuil) continue
      const g = m.get(mi.client.client_id) || { count: 0, last: 0 }
      g.count += 1
      if (t > g.last) g.last = t
      m.set(mi.client.client_id, g)
    }
    return m
  }, [missionsAff])
  // Score « ordre conseillé » : euros, pondérés par la confiance, relance en tête
  const scoreConseil = (m) => {
    let s = m.montant || 0
    if (m.confiance === 'fort') s *= 1.4
    else if (m.confiance === 'faible') s *= 0.6
    if (m.famille === camp) s *= 1.3            // campagne du mois en avant
    if ((m.client.nb || 0) <= 1) s *= 1.2       // primo-équipés prioritaires
    if (!m.client.pauseActive && infoRelance(m).due) s += 1000000 // relance due en tête
    return s
  }
  // « Ma journée » : une seule file priorisée (relances dues, campagne, primo
  // et fort potentiel), le conseiller n a pas à choisir un filtre, il déroule.
  const journee = useMemo(() => {
    const l = missionsAff.filter((m) => (m.statut === 'a_attaquer' || m.statut === 'en_cours') && !m.client.pauseActive)
    return [...l].sort((a, b) => scoreConseil(b) - scoreConseil(a)).slice(0, 20)
  }, [missionsAff, camp])
  // ── Liste affichée : Ma journée, ou chip d état + filtre campagne + tri ────
  const liste = useMemo(() => {
    if (chip === 'journee') return journee
    let l = chip === 'relance'
      ? missionsAff.filter((m) => m.statut === 'en_cours' && !m.client.pauseActive && infoRelance(m).due)
      : missionsAff.filter((m) => m.statut === chip)
    if (campSeul && camp) l = l.filter((m) => m.famille === camp)
    if (chip === 'gagnee') return [...l].sort((a, b) => (b.montant_reel || 0) - (a.montant_reel || 0))
    if (chip === 'relance') return [...l].sort((a, b) => infoRelance(b).jours - infoRelance(a).jours)
    if (tri === 'conseil') return [...l].sort((a, b) => scoreConseil(b) - scoreConseil(a))
    return [...l].sort((a, b) => (b.montant || 0) - (a.montant || 0))
  }, [missionsAff, chip, campSeul, camp, tri, journee])
  // Une seule ligne par CLIENT (retour Louis : un client avec plusieurs produits
  // ne doit pas apparaître deux fois). La 1re mission fait office de représentante
  // (la liste est déjà triée), les autres familles s ajoutent en badges.
  const listeGroupee = useMemo(() => {
    const m = new Map()
    for (const mi of liste) {
      const g = m.get(mi.client.client_id) || { client: mi.client, missions: [] }
      g.missions.push(mi)
      m.set(mi.client.client_id, g)
    }
    return Array.from(m.values())
  }, [liste])

  // ── Vue manager Reports : redevabilité par conseiller ────────────────────
  const reportsParConseiller = useMemo(() => {
    if (!isManager) return []
    const m = new Map()
    for (const mi of missionsAff) {
      if (mi.statut !== 'reportee' && mi.statut !== 'exclue') continue
      const code = mi.advisor_code || '—'
      if (!m.has(code)) m.set(code, { code, reports: [], exclusions: [], total: 0 })
      const g = m.get(code)
      if (mi.statut === 'reportee') { g.reports.push(mi); g.total += mi.montant || 0 }
      else g.exclusions.push(mi)
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total)
  }, [isManager, missionsAff])

  // ── Actions ──────────────────────────────────────────────────────────────
  async function attaquer(mi) {
    try {
      await upsertMission({
        client_id: mi.client.client_id,
        famille: mi.famille,
        patch: {
          statut: 'en_cours',
          advisor_code: profile?.advisor_code || mi.client.advisor_code || null,
          montant_estime: mi.montant,
          raison_report: null,
          retour_le: null,
        },
      })
      toast.success(`Proposition ${labelFam(mi.famille)} initiée, le dossier s ouvre`)
      await refreshMissions()
      if (onCreateDeal) onCreateDeal(mi.client)
    } catch (e) { toast.error(e.message || 'Échec du lancement de la mission') }
  }
  // Depuis la modale Proposer : marque la mission en cours (sans ouvrir le
  // dossier), pour que le suivi reflete l envoi du mail. Silencieux : le mail
  // prime, le suivi est un bonus.
  async function marquerPropose(client, famille) {
    try {
      await upsertMission({
        client_id: client.client_id,
        famille,
        patch: {
          statut: 'en_cours',
          advisor_code: profile?.advisor_code || client.advisor_code || null,
          montant_estime: baseMontant(client, famille).montant,
          raison_report: null,
          retour_le: null,
        },
      })
      await refreshMissions()
    } catch { /* la prochaine navigation rechargera l etat */ }
  }
  async function reloadCollab() {
    try { setCollab(await listCollaboration(profile?.advisor_code)) } catch { /* rechargé plus tard */ }
    await refreshMissions()
  }
  // #3 : l expert sollicité note son renfort (visible du conseiller titulaire)
  async function repondreRenfort(m) {
    const note = window.prompt('Votre note de renfort (visible du conseiller titulaire) :', m.renfort_note || '')
    if (note === null) return
    try { await upsertMission({ client_id: m.client_id, famille: m.famille, patch: { renfort_note: note } }); toast.success('Note de renfort enregistrée'); await reloadCollab() }
    catch (e) { toast.error(e.message || 'Échec') }
  }
  // #9 : le pair donne son second regard sur la ligne
  async function donnerAvis(m) {
    const avis = window.prompt('Votre second regard (adéquation, angle, point de vigilance) :', '')
    if (avis === null || !avis.trim()) return
    try { await upsertMission({ client_id: m.client_id, famille: m.famille, patch: { regard_avis: avis.trim(), regard_avis_by: profile?.advisor_code || null } }); toast.success('Avis transmis'); await reloadCollab() }
    catch (e) { toast.error(e.message || 'Échec') }
  }
  // Ouvre Proposer pour un client hors portefeuille (expert en renfort)
  function proposerRenfort(m) {
    setProposerPour({
      client: {
        client_id: m.client_id,
        nom: `${m.clients?.prenom || ''} ${m.clients?.nom || ''}`.trim() || '(client)',
        prenom: m.clients?.prenom || '', familles: [], absences: [],
        patrimoine: 0, revenus: 0, statut: '', advisor_code: '',
      },
      preset: m.famille,
    })
  }
  // Confirmation de la modale anti zap : report daté ou exclusion motivée
  async function confirmerReport(mi, { mode, raison, jours }) {
    const retour = mode === 'report' ? dansNJours(jours) : null
    try {
      await upsertMission({
        client_id: mi.client.client_id,
        famille: mi.famille,
        patch: {
          statut: mode === 'report' ? 'reportee' : 'exclue',
          raison_report: raison,
          retour_le: retour,
          advisor_code: profile?.advisor_code || mi.client.advisor_code || null,
          montant_estime: mi.montant,
        },
      })
      toast.success(mode === 'report'
        ? `Mission reportée, elle reviendra le ${fmtDate(retour)}`
        : 'Client marqué non éligible sur cette mission')
      setReportPour(null)
      await refreshMissions()
    } catch (e) { toast.error(e.message || 'Échec de l enregistrement') }
  }
  function copierArgumentaire(famille) {
    const txt = ARGUMENTAIRES[famille]
    if (!txt) return
    navigator.clipboard?.writeText(txt)
      .then(() => toast.success('Argumentaire copié'))
      .catch(() => toast.error('Copie impossible sur ce navigateur'))
  }
  async function sauverCampagne(famille, objectif) {
    const v = { ...settings, campagne_du_mois: famille, objectif_campagne: Number(objectif) > 0 ? Number(objectif) : null }
    setSettings(v)
    setEditCamp(false)
    try { await saveSettings(v); toast.success(`Campagne du mois : ${labelFam(famille)}`) }
    catch (e) { toast.error(e.message || 'Échec (réservé aux managers)') }
  }

  const chips = [
    { k: 'journee', l: '★ Ma journée', n: journee.length },
    { k: 'a_attaquer', l: 'À proposer', n: nb('a_attaquer') },
    { k: 'en_cours', l: 'En cours', n: nb('en_cours') },
    ...(relanceDue.length > 0 ? [{ k: 'relance', l: 'À relancer', n: relanceDue.length, hot: true }] : []),
    { k: 'reportee', l: 'Reportées', n: nb('reportee'), extra: reporteesEur > 0 ? `~${fmtK(reporteesEur)} en attente` : null },
    { k: 'gagnee', l: 'Gagnées ✓', n: nb('gagnee') },
    ...(isManager ? [{ k: 'exclue', l: 'Exclues', n: nb('exclue') }] : []),
  ]

  return (
    <div className="meq3">
      <style>{styles}</style>

      <div className="hd">
        <div>
          <h1>Multi-équipement</h1>
          <div className="sub">l équipement patrimonial de vos clients, famille par famille</div>
        </div>
        <div className="vues">
          <button className={vue === 'missions' ? 'on' : ''} onClick={() => setVue('missions')}>Missions</button>
          {isManager && <button className={vue === 'reports' ? 'on' : ''} onClick={() => setVue('reports')}>Reports</button>}
          <button className={vue === 'matrice' ? 'on' : ''} onClick={() => setVue('matrice')}>Vue matrice</button>
        </div>
      </div>

      {loading && <div className="empty">Chargement…</div>}
      {err && <div className="empty errtxt">Erreur : {err}</div>}

      {!loading && !err && vue === 'missions' && (
        <>
          <CollabPanel items={collab} myCode={profile?.advisor_code} famMap={famMap}
            onRepondreRenfort={repondreRenfort} onDonnerAvis={donnerAvis} onProposer={proposerRenfort} />

          {/* Hero : combien d euros restent sur la table, combien sont rentrés */}
          <div className="hero">
            <div className="hbox navy">
              <div className="hv">~{fmtEur(totalActives)}</div>
              <div className="hl">de collecte identifiée · {actives.length} mission{actives.length > 1 ? 's' : ''}</div>
            </div>
            <div className="hbox vert">
              <div className="hv">+{fmtEur(gagneesMoisEur)}</div>
              <div className="hl">signé ce mois en équipement complémentaire · {gagneesMois.length} gagnée{gagneesMois.length > 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Bandeau campagne du mois */}
          {campagne && (
            <div className="camp">
              <span className="ic">🎯</span>
              {!editCamp && (
                <>
                  <span>Campagne du mois : <b>{labelFam(camp)}</b></span>
                  <span className="cjauge" title={`${campagne.traitees} clients traités sur ${campagne.objectif}`}>
                    {campagne.traitees}/{campagne.objectif} clients
                    <span className="bar"><i style={{ width: `${Math.min(100, (100 * campagne.traitees) / Math.max(1, campagne.objectif))}%` }} /></span>
                  </span>
                  <span className="enjeu">~{fmtK(campagne.enJeu)} en jeu</span>
                  <button className={`lnk${campSeul ? ' on' : ''}`} onClick={() => setCampSeul((v) => !v)}>
                    {campSeul ? 'toutes les missions' : 'voir la campagne'}
                  </button>
                  {isManager && <button className="lnk" onClick={() => setEditCamp(true)}>modifier</button>}
                </>
              )}
              {editCamp && isManager && (
                <FormCampagne matCols={matCols} camp={camp} objectif={settings.objectif_campagne}
                  onCancel={() => setEditCamp(false)} onSave={sauverCampagne} />
              )}
            </div>
          )}

          {/* Chips d états */}
          <div className="chips">
            {chips.map((c) => (
              <button key={c.k} className={`chip${chip === c.k ? ' on' : ''}${c.k === 'gagnee' ? ' win' : ''}${c.hot ? ' hot' : ''}`} onClick={() => setChip(c.k)}>
                {c.l} <span className="n">{c.n}</span>
                {c.extra && <span className="extra">{c.extra}</span>}
              </button>
            ))}
            {(chip === 'a_attaquer' || chip === 'en_cours') && liste.length > 1 && (
              <button className="tribtn" onClick={() => setTri((t) => (t === 'montant' ? 'conseil' : 'montant'))}
                title="Bascule entre tri par montant et ordre conseillé">
                {tri === 'montant' ? '↕ par montant' : '↕ ordre conseillé'}
              </button>
            )}
          </div>

          {/* Liste de missions : le coeur du module */}
          {chip === 'journee' && liste.length > 0 && (
            <div className="aide">
              <b>Votre journée, déjà priorisée</b> : relances dues, campagne du mois et clients à fort potentiel, dans l ordre. Déroulez et proposez, pas besoin de choisir un filtre.
            </div>
          )}
          {chip === 'a_attaquer' && liste.length > 0 && (
            <div className="aide">
              Chaque ligne = <b>un client</b> et le produit à lui proposer. Les <b>ronds</b> montrent son équipement (plein = détenu, ✕ = absence confirmée, rond doré = la famille à proposer).
              « Proposer » rédige le mail ou ouvre le dossier ; un montant affiché <b>en fourchette</b> (« à préciser ») = complétez la fiche en un clic pour un chiffre net.
            </div>
          )}
          {(chip === 'a_attaquer' || chip === 'journee') && listeGroupee.length > 1 && (
            <button className="revuebtn" onClick={() => setRevue(listeGroupee.map((g) => ({ client: g.client, famille: g.missions[0].famille })))}>▸ Revue par lot ({listeGroupee.length}) : enchaîner les propositions au clavier</button>
          )}
          <div className="cartes">
            {liste.length === 0 && (
              <div className="empty">
                {chip === 'journee'
                  ? 'Rien à traiter aujourd hui, tout est à jour. Beau travail.'
                  : chip === 'a_attaquer'
                    ? 'Rien à proposer pour ces filtres. La vue matrice permet de déclarer l équipement et de faire émerger des missions.'
                    : 'Aucune mission dans cet état.'}
              </div>
            )}
            {chip !== 'gagnee' && chip !== 'exclue' && listeGroupee.map((g) => {
              const repr = g.missions[0]
              const familles = g.missions.map((m) => m.famille)
              const multi = g.missions.length > 1
              const montantTotal = g.missions.reduce((s, m) => s + (m.montant || 0), 0)
              const age = chip === 'a_attaquer' ? ageJours(repr) : null
              const niveau = age != null && age > 14 ? 'rouge' : age != null && age > 7 ? 'orange' : ''
              const rel = g.client.pauseActive ? { due: false, jours: 0, etape: 0 } : infoRelance(repr)
              return (
                <div key={g.client.client_id}>
                  <div className={`row ${niveau}${rel.due ? ' relance' : ''}`}>
                    <div className="rgauche">
                      <div className="qui">
                        <span className="nomcli">{g.client.nom}</span>
                        {isManager && <span className="cons">{repr.advisor_code}</span>}
                        {age != null && age > 7 && <span className={`age ${niveau}`}>{age} j sans action</span>}
                        {rel.due && <span className={`age relb e${rel.etape}`}>{LIB_RELANCE[rel.etape]} · {rel.jours} j</span>}
                        {g.client.pauseActive && <span className="veille">en veille jusqu au {fmtDate(g.client.pauseJusqu)}</span>}
                        {repr.renfort_code && <span className="renfb">🤝 renfort {repr.renfort_code}</span>}
                        {repr.statut === 'reportee' && (
                          <span className="rep">🕰 revient le {fmtDate(repr.retour_le)}</span>
                        )}
                      </div>
                      <EquipementDots client={g.client} suggests={familles} matCols={matCols}
                        couleurFam={couleurFam} labelFam={labelFam} />
                      <div className="raison">{multi ? `${g.missions.length} produits à proposer` : repr.raison}</div>
                      {repr.regard_avis && <div className="avisp">👁 {repr.regard_avis_by || 'Pair'} : {repr.regard_avis}</div>}
                    </div>
                    <div className="fams">
                      {familles.map((f) => <span key={f} className="fam" style={{ borderColor: couleurFam(f) }}>{labelFam(f)}</span>)}
                    </div>
                    <div className="rmont">
                      {!multi && repr.confiance === 'faible' ? (
                        <>
                          <span className="mont flou" title="Fourchette large faute de données, précisez la fiche">~{fmtK(repr.bas)} à {fmtK(repr.haut)}</span>
                          <button className="baselink" onClick={() => setCapId(capId === g.client.client_id ? null : g.client.client_id)}>à préciser ✎</button>
                        </>
                      ) : (
                        <>
                          <span className="mont">~{fmtK(montantTotal)}</span>
                          <span className="base">{multi ? `${g.missions.length} produits` : repr.base}</span>
                        </>
                      )}
                    </div>
                    <div className="ract">
                      {repr.statut === 'en_cours' ? (
                        <button className="pri" onClick={() => setProposerPour({ client: g.client, preset: repr.famille, relance: true })} title="Rédige un mail de relance douce">Relancer</button>
                      ) : (
                        <button className="pri" onClick={() => setProposerPour({ client: g.client, preset: repr.famille })} title={multi ? 'Choisissez le produit à proposer' : 'Rédige le mail ou ouvre le dossier'}>Proposer</button>
                      )}
                      <button className="sec" onClick={() => setReportPour(repr)}>{repr.statut === 'reportee' ? 'Re-reporter' : 'Plus tard'}</button>
                      {ARGUMENTAIRES[repr.famille] && (
                        <button className="ter" title="Copier l argumentaire d appel" onClick={() => copierArgumentaire(repr.famille)}>📋</button>
                      )}
                    </div>
                  </div>
                  {capId === g.client.client_id && (
                    <CaptureInline client={g.client}
                      onSaved={async () => { setCapId(null); await reload() }}
                      onClose={() => setCapId(null)} />
                  )}
                </div>
              )
            })}
            {(chip === 'gagnee' || chip === 'exclue') && liste.map((mi) => (
              <div key={mi.key} className={`carte mini ${chip === 'gagnee' ? 'ok' : 'ko'}`}>
                <span className="nomcli">{mi.client.nom}</span>
                <span className="fam" style={{ borderColor: couleurFam(mi.famille) }}>{labelFam(mi.famille)}</span>
                {chip === 'gagnee' && <span className="montwin">{mi.montant_reel != null ? `+${fmtK(mi.montant_reel)}` : '✓'}</span>}
                {chip === 'exclue' && <span className="excraison">{mi.raison_report || 'sans raison'}</span>}
                {isManager && <span className="cons">{mi.advisor_code}</span>}
              </div>
            ))}
          </div>

          {/* Gagnées ce mois : la preuve que ça paie */}
          {chip !== 'gagnee' && gagneesMois.length > 0 && (
            <div className="winsec">
              <div className="wtit">Gagnées ce mois</div>
              <div className="wins">
                {gagneesMois.map((mi) => (
                  <div key={mi.key} className="win">
                    <span className="nomcli">{mi.client.nom}</span>
                    <span className="wfam">{labelFam(mi.famille)}</span>
                    {mi.montant_reel != null && <span className="montwin">+{fmtK(mi.montant_reel)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Vue manager Reports : qui reporte quoi, pourquoi, pour combien */}
      {!loading && !err && vue === 'reports' && isManager && (
        <div className="reports">
          {reportsParConseiller.length === 0 && <div className="empty">Aucun report ni exclusion : tout le monde est à jour.</div>}
          {reportsParConseiller.map((g) => (
            <div key={g.code} className="rgrp">
              <div className="rhd">
                <b>{g.code}</b>
                <span className="rtot">{fmtEur(g.total)} reportés · {g.reports.length} mission{g.reports.length > 1 ? 's' : ''}{g.exclusions.length ? ` · ${g.exclusions.length} exclusion${g.exclusions.length > 1 ? 's' : ''}` : ''}</span>
              </div>
              {g.reports.length > 0 && (
                <div className="scrollx">
                  <table className="rtab">
                    <thead><tr><th>Client</th><th>Famille</th><th>Montant</th><th>Raison</th><th>Retour le</th></tr></thead>
                    <tbody>
                      {g.reports.map((mi) => (
                        <tr key={mi.key}>
                          <td>{mi.client.nom}</td>
                          <td>{labelFam(mi.famille)}</td>
                          <td className="num">~{fmtK(mi.montant)}</td>
                          <td className="rs">{mi.raison_report || '—'}</td>
                          <td>{fmtDate(mi.retour_le) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {g.exclusions.length > 0 && (
                <div className="rexc">
                  {g.exclusions.map((mi) => (
                    <div key={mi.key}>✕ {mi.client.nom} · {labelFam(mi.famille)} · {mi.raison_report || 'sans raison'}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Vue matrice V2 allégée : correction des données d équipement */}
      {!loading && !err && vue === 'matrice' && (
        <MatriceV2 rows={rows} matCols={matCols} famMap={famMap} isManager={isManager}
          profile={profile} onCreateDeal={onCreateDeal} reload={reload} budgetMap={budgetMap}
          onProposer={(client, preset) => setProposerPour({ client, preset })}
          onRevue={(items) => setRevue(items)} />
      )}

      {/* Pile de revue par lot */}
      {revue && (
        <RevueParLot items={revue} conseiller={profile?.full_name || ''} famMap={famMap}
          onMark={marquerPropose} onClose={() => setRevue(null)} />
      )}

      {/* Modale anti zap */}
      {reportPour && (
        <ModaleReport mission={reportPour} labelFam={labelFam}
          onClose={() => setReportPour(null)}
          onConfirm={(res) => confirmerReport(reportPour, res)} />
      )}

      {/* Modale Proposer : choix du produit, mail type genere, ou recommandation */}
      {proposerPour && (
        <ProposerModal
          client={proposerPour.client}
          preset={proposerPour.preset}
          relance={proposerPour.relance}
          matCols={matCols}
          famMap={famMap}
          conseiller={profile?.full_name || ''}
          advisorCode={profile?.advisor_code || ''}
          budget={budgetMap.get(proposerPour.client.client_id)}
          onClose={() => setProposerPour(null)}
          onCreateDeal={onCreateDeal}
          onMarkPropose={marquerPropose}
          onRefresh={refreshMissions} />
      )}
    </div>
  )
}

// ── Formulaire campagne (manager) : famille cible + objectif de clients ─────
function FormCampagne({ matCols, camp, objectif, onCancel, onSave }) {
  const [fam, setFam] = useState(camp)
  const [obj, setObj] = useState(objectif || '')
  return (
    <span className="fcamp">
      <select value={fam} onChange={(e) => setFam(e.target.value)}>
        {matCols.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <input type="number" min="1" placeholder="objectif clients" value={obj} onChange={(e) => setObj(e.target.value)} />
      <button className="lnk" onClick={() => onSave(fam, obj)}>enregistrer</button>
      <button className="lnk" onClick={onCancel}>annuler</button>
    </span>
  )
}

// ── Modale de report anti zap ───────────────────────────────────────────────
// « Plus tard » a un prix : une raison obligatoire ET une échéance obligatoire.
// La mission reviendra toute seule à la date choisie (réconciliation).
// Option séparée discrète : exclure un client non éligible, raison obligatoire,
// visible par le manager dans la vue Reports.
function ModaleReport({ mission, labelFam, onClose, onConfirm }) {
  const [mode, setMode] = useState('report')  // report | exclusion
  const [raison, setRaison] = useState(null)
  const [autre, setAutre] = useState('')
  const [jours, setJours] = useState(null)
  const [raisonExcl, setRaisonExcl] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const raisonFinale = mode === 'exclusion'
    ? raisonExcl.trim()
    : (raison === 'Autre' ? autre.trim() : raison)
  const valide = mode === 'exclusion' ? !!raisonFinale : (!!raisonFinale && !!jours)

  async function go() {
    if (!valide || envoi) return
    setEnvoi(true)
    try { await onConfirm({ mode, raison: raisonFinale, jours }) }
    finally { setEnvoi(false) }
  }

  return (
    <div className="mrOverlay" onClick={onClose}>
      <div className="mr" onClick={(e) => e.stopPropagation()}>
        <div className="mrhd">
          <h3>{mode === 'report' ? 'Reporter la mission' : 'Client non éligible'}</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="mrsub">
          {mission.client.nom} · {labelFam(mission.famille)} · ~{fmtK(mission.montant)}
        </div>

        {mode === 'report' && (
          <>
            <div className="mrlab">Pourquoi ? <span className="ob">obligatoire</span></div>
            <div className="mrchips">
              {RAISONS_REPORT.map((r) => (
                <button key={r} className={`mrc${raison === r ? ' on' : ''}`} onClick={() => setRaison(r)}>{r}</button>
              ))}
              <button className={`mrc${raison === 'Autre' ? ' on' : ''}`} onClick={() => setRaison('Autre')}>Autre</button>
            </div>
            {raison === 'Autre' && (
              <input className="mrtxt" autoFocus placeholder="Précise la raison…" value={autre} onChange={(e) => setAutre(e.target.value)} />
            )}
            <div className="mrlab">Quand revient-elle ? <span className="ob">obligatoire</span></div>
            <div className="mrchips">
              {ECHEANCES_REPORT.map((j) => (
                <button key={j} className={`mrc${jours === j ? ' on' : ''}`} onClick={() => setJours(j)}>{j} jours</button>
              ))}
            </div>
            {jours && <div className="mrinfo">La mission reviendra le <b>{fmtDate(dansNJours(jours))}</b>, automatiquement.</div>}
          </>
        )}

        {mode === 'exclusion' && (
          <>
            <div className="mrlab">Pourquoi ce client n est pas éligible ? <span className="ob">obligatoire, visible par la direction</span></div>
            <input className="mrtxt" autoFocus placeholder="Ex. déjà couvert par son conjoint, refus définitif…" value={raisonExcl} onChange={(e) => setRaisonExcl(e.target.value)} />
          </>
        )}

        <div className="mrbtns">
          <button className="pri" disabled={!valide || envoi} onClick={go}>
            {mode === 'report' ? 'Reporter' : 'Exclure la mission'}
          </button>
          <button className="sec" onClick={onClose}>Annuler</button>
        </div>
        {mode === 'report' && (
          <button className="mrexcl" onClick={() => setMode('exclusion')}>Client non éligible ?</button>
        )}
        {mode === 'exclusion' && (
          <button className="mrexcl" onClick={() => setMode('report')}>← Revenir au report</button>
        )}
      </div>
    </div>
  )
}

// ── Modale Proposer ─────────────────────────────────────────────────────────
// Le coeur de l innovation demandee par Louis : depuis un client, le conseiller
// choisit le produit a proposer (parmi les familles manquantes) OU une demande
// de recommandation, le mail type se genere aussitot, il le relit, l ajuste et
// l ouvre dans sa messagerie (ou le copie). Marque la mission en cours au
// passage a l action, pour que le suivi reflete l envoi.
function ProposerModal({ client, preset, relance, matCols, famMap, conseiller, advisorCode, budget, onClose, onCreateDeal, onMarkPropose, onRefresh }) {
  const labelFam = (k) => famMap[k]?.label || k
  const couleurFam = (k) => famMap[k]?.couleur || '#8A95A8'
  const gaps = matCols.filter((f) => !client.familles.includes(f.key))
  const choix = gaps.length ? gaps : matCols

  const [mode, setMode] = useState(relance ? 'relance' : 'produit') // produit | reco | relance
  const [famille, setFamille] = useState(
    preset && choix.some((f) => f.key === preset) ? preset : (choix[0]?.key || null),
  )
  const [contact, setContact] = useState(null)
  const [objet, setObjet] = useState('')
  const [corps, setCorps] = useState('')
  const [propose, setPropose] = useState(false)
  const [capDone, setCapDone] = useState(false)
  const ficheManque = [!client.patrimoine, !client.revenus, !client.statut].filter(Boolean).length

  // Contact client (prenom pour la personnalisation, email pour le mailto)
  useEffect(() => {
    let vivant = true
    ;(async () => {
      try { const c = await getClientContact(client.client_id); if (vivant) setContact(c) }
      catch { if (vivant) setContact(null) }
    })()
    return () => { vivant = false }
  }, [client.client_id])

  const prenom = (contact?.prenom || client.prenom || '').trim()
  const email = (contact?.email || '').trim()

  // (Re)genere le mail des que le mode, la famille ou le prenom changent
  useEffect(() => {
    const ctx = { prenom, conseiller, cabinet: CABINET }
    let mail
    if (mode === 'reco') mail = genererRecommandation(ctx)
    else if (mode === 'relance') mail = genererRelance({ ...ctx, sujet: labelFam(famille) })
    else mail = genererMail(famille, ctx)
    if (mail) { setObjet(mail.objet); setCorps(mail.corps) }
  }, [mode, famille, prenom, conseiller])

  const mailtoHref = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`
  const sim = mode === 'reco' ? null : simulationIndicative(client, famille)

  function copier() {
    navigator.clipboard?.writeText(`Objet : ${objet}\n\n${corps}`)
      .then(() => toast.success('Mail copié, collez le dans votre messagerie'))
      .catch(() => toast.error('Copie impossible sur ce navigateur'))
  }
  function marquer() {
    if ((mode === 'produit' || mode === 'relance') && famille && !propose) {
      onMarkPropose && onMarkPropose(client, famille)
      setPropose(true)
    }
  }
  function creerDossier() {
    marquer()
    if (onCreateDeal) onCreateDeal(client)
    onClose()
  }
  async function demanderSecondRegard() {
    const code = window.prompt('Second regard : code du pair que vous sollicitez :', '')
    if (!code || !code.trim()) return
    try {
      await upsertMission({ client_id: client.client_id, famille, patch: { regard_demande_a: code.trim(), advisor_code: advisorCode || client.advisor_code || null } })
      toast.success(`Second regard demandé à ${code.trim()}`)
      onRefresh && onRefresh()
    } catch (e) { toast.error(e.message || 'Échec') }
  }

  return (
    <div className="mrOverlay" onClick={onClose}>
      <div className="mr pmail" onClick={(e) => e.stopPropagation()}>
        <div className="mrhd">
          <h3>{relance ? 'Relancer' : 'Proposer'} à {client.nom}</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>

        {!relance && (
          <div className="pmtabs">
            <button className={mode === 'produit' ? 'on' : ''} onClick={() => setMode('produit')}>Proposer un produit</button>
            <button className={mode === 'reco' ? 'on' : ''} onClick={() => setMode('reco')}>Demander une recommandation</button>
          </div>
        )}
        {relance && (
          <div className="pmnote">Relance douce sur <b>{labelFam(famille)}</b>. On prend soin de la relation, sans insistance.</div>
        )}

        {mode === 'produit' && (
          <>
            <div className="mrlab">Quel produit proposer ?</div>
            <div className="pmchoix">
              {choix.map((f) => (
                <button key={f.key} className={`pmc${famille === f.key ? ' on' : ''}`} onClick={() => setFamille(f.key)}>
                  <span className="pmdot" style={{ background: couleurFam(f.key) }} />
                  {labelFam(f.key)}
                </button>
              ))}
            </div>
            {gaps.length === 0 && (
              <div className="pmnote">Ce client détient déjà toutes les familles suivies. Vous pouvez tout de même proposer un renforcement.</div>
            )}
          </>
        )}
        {mode === 'reco' && (
          <div className="pmnote reco">Un mot pour demander avec tact si {prenom || 'ce client'} connaît un proche à qui une mise en relation serait utile. La recommandation, moteur du cabinet.</div>
        )}

        {!capDone && ficheManque > 0 && (
          <div className="pmcap">
            <div className="pmcaptit">Compléter la fiche (facultatif, affine les montants et le suivi)</div>
            <CaptureInline client={client} compact onSaved={() => setCapDone(true)} onClose={() => setCapDone(true)} />
          </div>
        )}

        {sim && (
          <div className="pmsim">
            <div className="pmsimt">Chiffrage indicatif à montrer au client</div>
            <div className="pmsimv">{sim.libelle}</div>
            <div className="pmsimm">{sim.mention}</div>
          </div>
        )}
        {budget && budget.count >= 3 && (
          <div className="pmbudget">Ce client a déjà été sollicité {budget.count} fois ces six mois, la dernière le {fmtDate(new Date(budget.last).toISOString().slice(0, 10))}. Peut être vaut il mieux espacer.</div>
        )}
        <div className="mrlab">Objet</div>
        <input className="pmobj" value={objet} onChange={(e) => setObjet(e.target.value)} />
        <div className="mrlab">Message <span className="pmhint">relisez et ajustez avant envoi</span></div>
        <textarea className="pmcorps" rows={12} value={corps} onChange={(e) => setCorps(e.target.value)} />

        <div className="pmdest">
          {email
            ? <>Destinataire : <b>{email}</b></>
            : <span className="pmwarn">Aucun email sur la fiche : copiez le mail, ou complétez la fiche pour l envoi direct.</span>}
        </div>

        <div className="mrbtns pmbtns">
          <a className="pri" href={mailtoHref} onClick={() => marquer()}>Ouvrir dans ma messagerie</a>
          <button className="sec" onClick={copier}>Copier le mail</button>
        </div>
        {mode === 'produit' && (
          <button className="pmdeal" onClick={creerDossier}>Créer le dossier pour ce client</button>
        )}
        {mode !== 'reco' && (
          <button className="pmsecond" onClick={demanderSecondRegard}>Demander un second regard à un pair</button>
        )}
      </div>
    </div>
  )
}

// ── Matrice V2 allégée ──────────────────────────────────────────────────────
// Conservée pour corriger les données : matrice à pastilles + drawer de
// déclarations (détenu, absence, historique signé). Radar, heatmap, export et
// bloc opportunités de la V2 ont été retirés, les missions les remplacent.
function MatriceV2({ rows, matCols, famMap, isManager, profile, onCreateDeal, reload, onProposer, budgetMap, onRevue }) {
  const [seg, setSeg] = useState('tous')
  const [cons, setCons] = useState('all')
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pauseForm, setPauseForm] = useState(false)
  const [pauseDur, setPauseDur] = useState('90')
  const [pauseMotif, setPauseMotif] = useState('')
  const [views, setViews] = useState([])          // #1 vues sauvegardées (localStorage)
  const [foyerMode, setFoyerMode] = useState(false) // #4 vue par foyer
  const [multiSel, setMultiSel] = useState(() => new Set()) // #3 sélection multiple
  const [lastIdx, setLastIdx] = useState(null)    // #3 ancre du shift-clic
  const [debrief, setDebrief] = useState(false)   // #2 panneau débrief RDV
  const [outils, setOutils] = useState(false)     // outils avancés repliés par défaut
  const [sigTxt, setSigTxt] = useState('')        // #8 signal terrain
  const [sigFam, setSigFam] = useState('')
  const [sigEch, setSigEch] = useState('30')
  const vkey = `meq_views_${profile?.advisor_code || 'x'}`
  useEffect(() => {
    try { setViews(JSON.parse(localStorage.getItem(vkey) || '[]')) } catch { setViews([]) }
  }, [vkey])
  const labelFam = (k) => famMap[k]?.label || k
  const couleurFam = (k) => famMap[k]?.couleur || '#8A95A8'
  // Familles jamais explorées (ni détenues, ni absence confirmée) = angles morts (#7)
  const offCount = (r) => matCols.reduce((n, f) => n + ((!r.familles.includes(f.key) && !r.absences.includes(f.key)) ? 1 : 0), 0)
  const todayIso = new Date().toISOString().slice(0, 10)
  // Exposition défensive (#9 couverture) : statut à risque, enfants, crédit sans emprunteur
  const DEF = ['prevoyance', 'mutuelle', 'emprunteur']
  const exposure = (r) => {
    let e = 0
    const s = (r.statut || '').toLowerCase()
    if (s === 'tns' || s.includes('libéral') || s.includes('liberal') || s.includes('chef')) e += 2
    e += Math.min(3, r.nbEnfants || 0)
    if (r.familles.includes('immobilier') && !r.familles.includes('emprunteur')) e += 2
    return e
  }
  const expoGap = (r) => DEF.some((f) => !r.familles.includes(f)) && exposure(r) > 0
  const rdvProche = (r) => !!r.prochainRdv && r.prochainRdv >= todayIso && r.prochainRdv <= dansNJours(7)
  const signalDue = (r) => (r.signaux || []).some((s) => !s.echeance || s.echeance <= todayIso)

  const conseillers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.advisor_code).filter((x) => x && x !== '—'))).sort(),
    [rows],
  )
  const visibles = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const l = rows.filter((r) => {
      if (cons !== 'all' && r.advisor_code !== cons) return false
      if (seg === 'primo' && r.nb !== 1) return false
      if (seg === 'multi' && r.nb < 2) return false
      if (seg === 'sans' && r.nb !== 0) return false
      if (seg === 'explorer' && offCount(r) < 4) return false
      if (seg === 'couverture' && !expoGap(r)) return false
      if (seg === 'rapatrier' && (r.ailleurs?.length || 0) === 0) return false
      if (seg === 'rdv' && !rdvProche(r)) return false
      if (seg === 'signaux' && !signalDue(r)) return false
      if (ql && !(`${r.nom} ${r.profession} ${r.advisor_code}`.toLowerCase().includes(ql))) return false
      return true
    })
    if (seg === 'explorer') return l.sort((a, b) => offCount(b) - offCount(a))
    if (seg === 'couverture') return l.sort((a, b) => exposure(b) - exposure(a))
    if (seg === 'rdv') return l.sort((a, b) => (a.prochainRdv || '').localeCompare(b.prochainRdv || ''))
    return l.sort((a, b) => b.revenus - a.revenus)
  }, [rows, seg, cons, q])

  const sel = useMemo(() => rows.find((r) => r.client_id === selId) || null, [rows, selId])
  useEffect(() => {
    if (!selId) { setDetail(null); return }
    let vivant = true
    ;(async () => {
      try {
        const [declares, deals] = await Promise.all([
          listDeclaresForClient(selId), listSignedDealsForClient(selId),
        ])
        if (vivant) setDetail({ declares, deals })
      } catch { if (vivant) setDetail({ declares: [], deals: [] }) }
    })()
    return () => { vivant = false }
  }, [selId])
  // Navigation clavier : flèches pour changer de client, Entrée pour proposer
  useEffect(() => {
    const h = (e) => {
      if (!selId) return
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return
      if (e.key === 'ArrowDown') { e.preventDefault(); navSel(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); navSel(-1) }
      else if (e.key === 'Enter') { const r = rows.find((x) => x.client_id === selId); if (r && onProposer) onProposer(r, null) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  async function declarer(famille, detenu) {
    if (!sel) return
    setSaving(true)
    try {
      let compagnie = null
      if (detenu) compagnie = window.prompt('Compagnie (facultatif) :', '') || null
      await upsertDeclare({
        client_id: sel.client_id, famille, detenu, compagnie,
        note: detenu ? 'déclaré depuis le Multi-équipement' : 'absence confirmée depuis le Multi-équipement',
        saisi_par: profile?.id || null,
      })
      toast.success(detenu ? `${labelFam(famille)} déclaré détenu` : `Absence de ${labelFam(famille)} confirmée`)
      await reload()
      const declares = await listDeclaresForClient(sel.client_id)
      setDetail((d) => ({ ...(d || { deals: [] }), declares }))
    } catch (e) { toast.error(e.message || 'Échec de la déclaration') }
    finally { setSaving(false) }
  }
  async function effacerDeclaration(famille) {
    if (!sel) return
    setSaving(true)
    try {
      await removeDeclare({ client_id: sel.client_id, famille })
      toast.success('Déclaration retirée')
      await reload()
      const declares = await listDeclaresForClient(sel.client_id)
      setDetail((d) => ({ ...(d || { deals: [] }), declares }))
    } catch (e) { toast.error(e.message || 'Échec') }
    finally { setSaving(false) }
  }
  // #8 : mise en veille relationnelle datée du client
  async function poserPause() {
    if (!sel) return
    const jours = Number(pauseDur) || 90
    const d = new Date(); d.setDate(d.getDate() + jours)
    setSaving(true)
    try {
      await setClientPause(sel.client_id, { pause_jusqu_au: d.toISOString().slice(0, 10), pause_motif: pauseMotif.trim() || null })
      toast.success('Client mis en veille')
      setPauseForm(false); setPauseMotif('')
      await reload()
    } catch (e) { toast.error(e.message || 'Échec (réservé au conseiller du client)') }
    finally { setSaving(false) }
  }
  async function leverPause() {
    if (!sel) return
    setSaving(true)
    try {
      await setClientPause(sel.client_id, { pause_jusqu_au: null, pause_motif: null })
      toast.success('Veille levée')
      await reload()
    } catch (e) { toast.error(e.message || 'Échec') }
    finally { setSaving(false) }
  }
  // #10 : marque en une fois toutes les familles non renseignées comme absentes
  async function marquerAbsencesEnLot() {
    if (!sel) return
    const cibles = matCols.filter((f) => !sel.familles.includes(f.key) && !sel.absences.includes(f.key))
    if (cibles.length === 0) return
    const raison = window.prompt(`Marquer ${cibles.length} famille(s) non renseignée(s) comme absentes. Raison :`, 'Hors cible pour ce client')
    if (raison === null) return
    setSaving(true)
    try {
      for (const f of cibles) {
        await upsertDeclare({ client_id: sel.client_id, famille: f.key, detenu: false, note: raison || 'absence confirmée en lot', saisi_par: profile?.id || null })
      }
      toast.success(`${cibles.length} absence(s) confirmée(s)`)
      await reload()
      const declares = await listDeclaresForClient(sel.client_id)
      setDetail((d) => ({ ...(d || { deals: [] }), declares }))
    } catch (e) { toast.error(e.message || 'Échec') }
    finally { setSaving(false) }
  }
  // #3 : demande de renfort à un référent sur une famille pointue
  async function demanderRenfort(famille) {
    if (!sel) return
    const code = window.prompt(`Renfort sur ${labelFam(famille)} pour ${sel.nom}.\nCode du référent (ex. ${conseillers.slice(0, 3).join(', ') || 'DB'}) :`, '')
    if (!code || !code.trim()) return
    setSaving(true)
    try {
      await upsertMission({ client_id: sel.client_id, famille, patch: { renfort_code: code.trim(), advisor_code: sel.advisor_code } })
      toast.success(`Renfort demandé à ${code.trim()}`)
    } catch (e) { toast.error(e.message || 'Échec') }
    finally { setSaving(false) }
  }
  // #1 vues sauvegardées (localStorage)
  function persistViews(v) { setViews(v); try { localStorage.setItem(vkey, JSON.stringify(v)) } catch { /* quota */ } }
  function saveView() {
    const name = window.prompt('Nom de la vue (ex. Mes TNS sans prévoyance) :', '')
    if (!name || !name.trim()) return
    persistViews([...views.filter((x) => x.name !== name.trim()), { name: name.trim(), config: { seg, cons, q } }])
    toast.success('Vue enregistrée')
  }
  function applyView(v) { setSeg(v.config.seg); setCons(v.config.cons ?? 'all'); setQ(v.config.q ?? '') }
  function deleteView(name) { persistViews(views.filter((x) => x.name !== name)) }
  // #8 signal terrain
  async function ajouterSignal() {
    if (!sel || !sigTxt.trim()) return
    setSaving(true)
    try {
      await addSignal({ client_id: sel.client_id, famille: sigFam || null, texte: sigTxt.trim(), echeance: sigEch ? dansNJours(Number(sigEch)) : null, advisor_code: profile?.advisor_code || null })
      toast.success('Signal enregistré')
      setSigTxt(''); setSigFam(''); setSigEch('30')
      await reload()
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  async function supprimerSignal(id) {
    setSaving(true)
    try { await deleteSignal(id); await reload() } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  // #5 déclare une famille comme détenue ailleurs (chez un confrère)
  async function declarerAilleurs(famille) {
    if (!sel) return
    const ou = window.prompt(`${labelFam(famille)} détenu ailleurs. Où est-ce logé ? (facultatif)`, '')
    if (ou === null) return
    setSaving(true)
    try {
      await upsertDeclare({ client_id: sel.client_id, famille, detenu: false, ailleurs: true, ou_loge: ou || null, note: 'détenu ailleurs', saisi_par: profile?.id || null })
      toast.success(`${labelFam(famille)} noté détenu ailleurs`)
      await reload()
      const declares = await listDeclaresForClient(sel.client_id)
      setDetail((d) => ({ ...(d || { deals: [] }), declares }))
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  // #2 débrief RDV : un clic ferme la boucle vers les missions
  async function debriefAction(famille, action) {
    if (!sel) return
    setSaving(true)
    try {
      if (action === 'interesse') {
        await upsertMission({ client_id: sel.client_id, famille, patch: { statut: 'en_cours', advisor_code: sel.advisor_code, montant_estime: baseMontant(sel, famille).montant } })
      } else if (action === 'plus_tard') {
        await upsertMission({ client_id: sel.client_id, famille, patch: { statut: 'reportee', raison_report: 'Pas le moment (débrief RDV)', retour_le: dansNJours(90), advisor_code: sel.advisor_code, montant_estime: baseMontant(sel, famille).montant } })
      } else if (action === 'ailleurs') {
        await upsertDeclare({ client_id: sel.client_id, famille, detenu: false, ailleurs: true, note: 'détenu ailleurs (débrief RDV)', saisi_par: profile?.id || null })
      } else if (action === 'hors_cible') {
        await upsertDeclare({ client_id: sel.client_id, famille, detenu: false, ailleurs: false, note: 'hors cible (débrief RDV)', saisi_par: profile?.id || null })
      }
      await reload()
      const declares = await listDeclaresForClient(sel.client_id)
      setDetail((d) => ({ ...(d || { deals: [] }), declares }))
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  // #4 rattache le client au foyer d un autre client (ou en crée un)
  async function rattacherFoyer() {
    if (!sel) return
    const q2 = window.prompt('Rattacher au même foyer que quel client ? (nom ou prénom)', '')
    if (!q2 || !q2.trim()) return
    const target = rows.find((r) => r.client_id !== sel.client_id && r.nom.toLowerCase().includes(q2.trim().toLowerCase()))
    if (!target) { toast.error('Client introuvable dans votre portefeuille'); return }
    const fid = target.foyerId || sel.foyerId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null)
    if (!fid) { toast.error('Impossible de générer le foyer'); return }
    setSaving(true)
    try {
      await patchClient(sel.client_id, { foyer_id: fid })
      if (!target.foyerId) await patchClient(target.client_id, { foyer_id: fid })
      toast.success(`Foyer commun avec ${target.nom}`)
      await reload()
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  async function detacherFoyer() {
    if (!sel) return
    setSaving(true)
    try { await patchClient(sel.client_id, { foyer_id: null }); toast.success('Détaché du foyer'); await reload() }
    catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  // Auto-enrichissement : porte le patrimoine au plancher déduit des contrats signés
  async function appliquerPlancher(v) {
    if (!sel) return
    setSaving(true)
    try { await updateClientInfo(sel.client_id, { patrimoine_estime: v }); toast.success('Patrimoine mis à jour depuis les contrats'); await reload() }
    catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  // #3 navigation client précédent / suivant dans la vue filtrée
  function navSel(dir) {
    const idx = visibles.findIndex((r) => r.client_id === selId)
    if (idx < 0) return
    const next = visibles[idx + dir]
    if (next) setSelId(next.client_id)
  }
  // #3 sélection multiple (case à cocher + shift-clic)
  function toggleSel(id, idx, shift) {
    setMultiSel((prev) => {
      const n = new Set(prev)
      if (shift && lastIdx != null) {
        const [a, b] = [Math.min(lastIdx, idx), Math.max(lastIdx, idx)]
        for (let i = a; i <= b; i++) if (visibles[i]) n.add(visibles[i].client_id)
      } else if (n.has(id)) { n.delete(id) } else { n.add(id) }
      return n
    })
    setLastIdx(idx)
  }
  function toggleAll() {
    setMultiSel((prev) => (prev.size >= visibles.length && visibles.length > 0 ? new Set() : new Set(visibles.map((r) => r.client_id))))
  }
  async function batchVeille() {
    setSaving(true)
    try {
      for (const id of multiSel) await setClientPause(id, { pause_jusqu_au: dansNJours(90), pause_motif: 'mise en veille groupée' })
      toast.success(`${multiSel.size} client(s) en veille`); setMultiSel(new Set()); await reload()
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  async function batchReport() {
    setSaving(true)
    try {
      for (const id of multiSel) {
        const r = rows.find((x) => x.client_id === id); const sug = r && suggestionPour(r)
        if (r && sug) await upsertMission({ client_id: id, famille: sug.famille_suggeree, patch: { statut: 'reportee', raison_report: 'Report groupé', retour_le: dansNJours(90), advisor_code: r.advisor_code, montant_estime: baseMontant(r, sug.famille_suggeree).montant } })
      }
      toast.success('Missions reportées'); setMultiSel(new Set()); await reload()
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  function batchRevue() {
    const items = []
    for (const id of multiSel) {
      const r = rows.find((x) => x.client_id === id); const sug = r && suggestionPour(r)
      if (r && sug) items.push({ client: r, famille: sug.famille_suggeree })
    }
    if (items.length && onRevue) { onRevue(items); setMultiSel(new Set()) }
    else if (!items.length) toast('Aucune proposition évidente sur la sélection')
  }
  // Rendu d une ligne client (partage matrice classique et vue foyer)
  const renderRow = (r, idx) => (
    <tr key={r.client_id} className={selId === r.client_id ? 'sel' : ''} onClick={() => setSelId(r.client_id)}>
      <td className="ck" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={multiSel.has(r.client_id)} onChange={(e) => toggleSel(r.client_id, idx, e.nativeEvent.shiftKey)} />
      </td>
      <td className="l cli">
        {r.nom}
        {signalDue(r) && <span className="sigdot" title="Signal terrain à traiter">◆</span>}
        {r.pauseActive && <span className="sigdot veille2" title="En veille">🌙</span>}
        <small>{r.statut || r.profession || '—'}{r.revenus ? ` · ${Math.round(r.revenus / 1000)} k€` : ''} · {r.advisor_code}</small>
      </td>
      {matCols.map((f) => {
        const detenu = r.familles.includes(f.key)
        const ailleurs = !detenu && (r.ailleurs || []).includes(f.key)
        const absent = !detenu && !ailleurs && r.absences.includes(f.key)
        return (
          <td key={f.key}>
            {detenu && <span className="p2 on" title={`${labelFam(f.key)} : détenu`} style={{ background: couleurFam(f.key) }} />}
            {ailleurs && <span className="p2 ailleurs" title={`${labelFam(f.key)} : détenu ailleurs`}>A</span>}
            {absent && <span className="p2 no" title={`${labelFam(f.key)} : absence confirmée`}>✕</span>}
            {!detenu && !ailleurs && !absent && <span className="p2 off" title={`${labelFam(f.key)} : non renseigné`} />}
          </td>
        )
      })}
      <td>
        <span className="comp">{r.nb}/{matCols.length}
          <span className="bar"><i style={{ width: `${Math.min(100, (100 * r.nb) / matCols.length)}%` }} /></span>
        </span>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {(() => {
          const sug = suggestionPour(r)
          if (!sug) return <span className="nbamute">à jour</span>
          return <button className="nba" title={sug.raison} onClick={() => onProposer && onProposer(r, sug.famille_suggeree)}>{labelFam(sug.famille_suggeree)} ▸</button>
        })()}
      </td>
    </tr>
  )
  // #4 regroupement par foyer
  const groupes = useMemo(() => {
    if (!foyerMode) return null
    // Clé de foyer : lien manuel prioritaire, sinon auto (même nom + code postal)
    const key = (r) => (r.foyerId
      ? `id:${r.foyerId}`
      : (r.nomSeul && r.codePostal ? `auto:${r.nomSeul.toLowerCase().trim()}|${String(r.codePostal).trim()}` : null))
    const byKey = new Map(); const solo = []
    for (const r of visibles) {
      const k = key(r)
      if (k) { const a = byKey.get(k) || []; a.push(r); byKey.set(k, a) } else solo.push(r)
    }
    const out = []
    for (const [k, members] of byKey) {
      if (members.length < 2) { solo.push(members[0]); continue } // un seul membre = pas un foyer
      const cov = new Set(); members.forEach((m) => m.familles.forEach((f) => cov.add(f)))
      out.push({ header: true, nom: members.map((m) => m.nomSeul).filter(Boolean).join(' / ') || 'Foyer', cov: cov.size, auto: k.startsWith('auto') })
      members.forEach((m) => out.push({ row: m }))
    }
    if (solo.length) { out.push({ header: true, nom: 'Hors foyer', cov: null }); solo.forEach((m) => out.push({ row: m })) }
    return out
  }, [foyerMode, visibles])

  // Segments simples et lisibles, pas de filtres de niche qui surchargent
  const segsBase = [
    { k: 'tous', l: 'Tous' }, { k: 'primo', l: 'Primo-équipés' }, { k: 'multi', l: 'Multi 2+' }, { k: 'sans', l: 'Sans info' },
  ]
  return (
    <div className="mx2">
      <div className="segs">
        {segsBase.map((s) => (
          <button key={s.k} className={`seg${seg === s.k ? ' on' : ''}`} onClick={() => setSeg(s.k)}>{s.l}</button>
        ))}
        <span className="sp" />
        <button className={`seg${foyerMode ? ' on' : ''}`} onClick={() => setFoyerMode((v) => !v)} title="Regrouper les clients par foyer">Par foyer</button>
        <input className="search" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        {isManager && (
          <select className="mini" value={cons} onChange={(e) => setCons(e.target.value)}>
            <option value="all">Tous conseillers</option>
            {conseillers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div className="vuesbar">
        {views.map((v) => (
          <span key={v.name} className="vchip">
            <button onClick={() => applyView(v)}>{v.name}</button>
            <button className="vx" title="Supprimer la vue" onClick={() => deleteView(v.name)}>✕</button>
          </span>
        ))}
        <button className="vsave" onClick={saveView}>+ enregistrer la vue actuelle</button>
      </div>
      {multiSel.size > 0 && (
        <div className="batchbar">
          <b>{multiSel.size} sélectionné{multiSel.size > 1 ? 's' : ''}</b>
          <button onClick={batchRevue}>Générer les brouillons</button>
          <button onClick={batchReport} disabled={saving}>Reporter 3 mois</button>
          <button onClick={batchVeille} disabled={saving}>Mettre en veille</button>
          <button className="bclear" onClick={() => setMultiSel(new Set())}>Vider</button>
        </div>
      )}
      <div className="layout">
        <div className="tblwrap">
          <div className="scrollx">
            <table className="mx">
              <thead>
                <tr>
                  <th className="ck"><input type="checkbox" checked={multiSel.size >= visibles.length && visibles.length > 0} onChange={toggleAll} /></th>
                  <th className="l">Client</th>
                  {matCols.map((f) => <th key={f.key} title={f.label}>{f.label.length > 8 ? `${f.label.slice(0, 7)}.` : f.label}</th>)}
                  <th>Complétude</th>
                  <th>Prochaine action</th>
                </tr>
              </thead>
              <tbody>
                {!foyerMode && visibles.map((r, idx) => renderRow(r, idx))}
                {foyerMode && (groupes || []).map((g, i) => (g.header
                  ? <tr key={`h${i}`} className="foyerh"><td colSpan={matCols.length + 4}>👪 {g.nom}{g.cov != null ? ` · ${g.cov}/${matCols.length} familles couvertes` : ''}</td></tr>
                  : renderRow(g.row, visibles.indexOf(g.row))))}
                {visibles.length === 0 && (
                  <tr><td colSpan={matCols.length + 4} className="empty">Aucun client pour ces filtres.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="legend">● détenu · ◌ non renseigné · ✕ absence confirmée · clique une ligne pour corriger</div>
        </div>

        {sel && (
          <div className="drawer">
            <div className="dhd">
              <div>
                <h4>{sel.nom}</h4>
                <div className="dsub">{sel.statut || sel.profession || '—'}{sel.revenus ? ` · ${fmtEur(sel.revenus)}` : ''} · {sel.advisor_code}</div>
              </div>
              <span className="dnav">
                <button title="Client précédent" onClick={() => navSel(-1)}>‹</button>
                <button title="Client suivant" onClick={() => navSel(1)}>›</button>
                <button className="x" onClick={() => setSelId(null)}>✕</button>
              </span>
            </div>
            {(() => {
              const sug = suggestionPour(sel)
              const sim = sug ? simulationIndicative(sel, sug.famille_suggeree) : null
              const b = budgetMap && budgetMap.get(sel.client_id)
              const conflits = matCols.filter((f) => sel.familles.includes(f.key) && sel.absences.includes(f.key))
              return (
                <>
                  <div className="dbrief">
                    {sel.statut || 'statut à préciser'} · {sel.nb}/{matCols.length} familles · {sel.patrimoine ? `patrimoine ${fmtEur(sel.patrimoine)}` : 'patrimoine à compléter'}
                    {sug ? <> · prochaine étape <b>{labelFam(sug.famille_suggeree)}</b></> : null}
                    {b ? <> · {b.count} sollicitation{b.count > 1 ? 's' : ''} ces 6 mois</> : null}
                  </div>

                  <div className="dpause">
                    {sel.pauseActive ? (
                      <>🌙 En veille jusqu au {fmtDate(sel.pauseJusqu)}{sel.pauseMotif ? ` (${sel.pauseMotif})` : ''}
                        <button className="lnk" disabled={saving} onClick={leverPause}>lever</button></>
                    ) : (
                      <>Relation active
                        <button className="lnk" onClick={() => setPauseForm((v) => !v)}>{pauseForm ? 'annuler' : 'mettre en veille'}</button></>
                    )}
                  </div>
                  {pauseForm && !sel.pauseActive && (
                    <div className="dpause">
                      <select value={pauseDur} onChange={(e) => setPauseDur(e.target.value)}>
                        <option value="30">30 jours</option>
                        <option value="90">3 mois</option>
                        <option value="180">6 mois</option>
                        <option value="365">1 an</option>
                      </select>
                      <input placeholder="motif privé (deuil, cession…)" value={pauseMotif} onChange={(e) => setPauseMotif(e.target.value)} />
                      <button className="lnk" disabled={saving} onClick={poserPause}>confirmer</button>
                    </div>
                  )}

                  {conflits.map((f) => (
                    <div className="conflit" key={`c-${f.key}`}>
                      ⚠ {labelFam(f.key)} : présent dans les contrats mais déclaré absent.
                      <button disabled={saving} onClick={() => effacerDeclaration(f.key)}>Trancher : détenu</button>
                    </div>
                  ))}

                  {sim && (
                    <div className="pmsim">
                      <div className="pmsimt">Chiffrage indicatif ({labelFam(sug.famille_suggeree)})</div>
                      <div className="pmsimv">{sim.libelle}</div>
                      <div className="pmsimm">{sim.mention}</div>
                    </div>
                  )}
                </>
              )
            })()}

            <div className="dsec">Outils
              <button className="dseclnk" onClick={() => setOutils((v) => !v)}>{outils ? 'masquer' : 'afficher'}</button>
            </div>
            {outils && (
              <>
            <div className="dsec">Débrief RDV
              <button className="dseclnk" onClick={() => setDebrief((v) => !v)}>{debrief ? 'fermer' : '30 s ?'}</button>
            </div>
            {debrief && (
              <div className="debrief">
                {matCols.filter((f) => !sel.familles.includes(f.key)).map((f) => (
                  <div className="debrow" key={`db-${f.key}`}>
                    <span className="dbfam">{labelFam(f.key)}</span>
                    <button disabled={saving} onClick={() => debriefAction(f.key, 'interesse')}>Intéressé</button>
                    <button disabled={saving} onClick={() => debriefAction(f.key, 'plus_tard')}>Pas le moment</button>
                    <button disabled={saving} onClick={() => debriefAction(f.key, 'ailleurs')}>Ailleurs</button>
                    <button disabled={saving} onClick={() => debriefAction(f.key, 'hors_cible')}>Hors cible</button>
                  </div>
                ))}
                {matCols.filter((f) => !sel.familles.includes(f.key)).length === 0 && <div className="pmnote">Client pleinement équipé.</div>}
              </div>
            )}

            <div className="dsec">Signaux terrain</div>
            {(sel.signaux || []).map((s) => (
              <div className="sigrow" key={s.id}>
                <span>◆ {s.texte}{s.famille ? ` · ${labelFam(s.famille)}` : ''}{s.echeance ? ` · ${fmtDate(s.echeance)}` : ''}</span>
                <button className="lnk" disabled={saving} onClick={() => supprimerSignal(s.id)}>✕</button>
              </div>
            ))}
            <div className="sigadd">
              <input placeholder="+ signal (ex. vend un bien au T4)" value={sigTxt} onChange={(e) => setSigTxt(e.target.value)} />
              <select value={sigFam} onChange={(e) => setSigFam(e.target.value)}><option value="">famille…</option>{matCols.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
              <select value={sigEch} onChange={(e) => setSigEch(e.target.value)}><option value="7">7 j</option><option value="30">30 j</option><option value="90">90 j</option><option value="">sans</option></select>
              <button className="lnk" disabled={saving || !sigTxt.trim()} onClick={ajouterSignal}>ajouter</button>
            </div>

            <div className="dsec">Foyer</div>
            <div className="dpause">
              {sel.foyerId
                ? <>👪 Rattaché à un foyer <button className="lnk" disabled={saving} onClick={detacherFoyer}>détacher</button></>
                : <>Aucun foyer <button className="lnk" disabled={saving} onClick={rattacherFoyer}>rattacher</button></>}
            </div>
              </>
            )}

            {(() => {
              const plancher = (detail?.deals || []).reduce((s, d) => s + (Number(d.pu) > 0 ? Number(d.pu) : 0), 0)
              if (plancher <= (sel.patrimoine || 0)) return null
              return (
                <div className="plancher">
                  <span>D après les contrats signés, patrimoine ≥ <b>{fmtEur(plancher)}</b></span>
                  <button disabled={saving} onClick={() => appliquerPlancher(plancher)}>Appliquer</button>
                </div>
              )
            })()}

            {[!sel.patrimoine, !sel.revenus, !sel.statut].filter(Boolean).length > 0 && (
              <>
                <div className="dsec">Compléter la fiche</div>
                <CaptureInline client={sel} compact onSaved={async () => { await reload() }} />
              </>
            )}
            <div className="dsec">Équipement
              {offCount(sel) > 0 && (
                <button className="dseclnk" disabled={saving} onClick={marquerAbsencesEnLot} title="Marque toutes les familles non renseignées comme absentes, une seule raison">nettoyer ({offCount(sel)})</button>
              )}
            </div>
            {matCols.map((f) => {
              const detenu = sel.familles.includes(f.key)
              const ailleurs = !detenu && (sel.ailleurs || []).includes(f.key)
              const absent = !detenu && !ailleurs && sel.absences.includes(f.key)
              const decl = detail?.declares?.find((d) => d.famille === f.key)
              return (
                <div className="drow" key={f.key}>
                  <span className="dfam" style={{ color: detenu ? couleurFam(f.key) : undefined }}>{f.label}</span>
                  {detenu && <span className="st ok">détenu{decl?.compagnie ? ` · ${decl.compagnie}` : ''}</span>}
                  {ailleurs && <span className="st ailleurs">ailleurs{decl?.ou_loge ? ` · ${decl.ou_loge}` : ''}</span>}
                  {absent && <span className="st no">absent confirmé</span>}
                  {!detenu && !ailleurs && !absent && <span className="st miss">?</span>}
                  <span className="dactions">
                    {!detenu && <button disabled={saving} title="Déclarer détenu (souscrit ailleurs ou avant le CRM)" onClick={() => declarer(f.key, true)}>✓</button>}
                    {!detenu && !absent && !ailleurs && <button disabled={saving} title="Confirmer l absence" onClick={() => declarer(f.key, false)}>✕</button>}
                    {!detenu && !ailleurs && <button disabled={saving} title="Détenu ailleurs (chez un confrère)" onClick={() => declarerAilleurs(f.key)}>↗</button>}
                    {!detenu && <button disabled={saving} title="Demander un renfort expert sur cette famille" onClick={() => demanderRenfort(f.key)}>🤝</button>}
                    {decl && <button disabled={saving} title="Effacer la déclaration" onClick={() => effacerDeclaration(f.key)}>↺</button>}
                  </span>
                </div>
              )
            })}
            {detail?.deals?.length > 0 && (
              <>
                <div className="dsec">Historique signé</div>
                <div className="tl">
                  {detail.deals.map((d) => (
                    <div className="tli" key={d.id}>
                      <span className="td">{d.date_signed || '—'}</span>
                      <span className="tp">{d.product}{d.company ? ` · ${d.company}` : ''}</span>
                      <span className="tm">{Number(d.pu) > 0 ? fmtEur(d.pu) : (Number(d.pp_m) > 0 ? `${fmtEur(d.pp_m)}/mois` : '')}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="dbtns">
              <button className="pri" onClick={() => onProposer && onProposer(sel, null)}>Proposer</button>
              <button className="lien" onClick={() => onCreateDeal && onCreateDeal(sel)}>ou créer le dossier directement</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Capture inline ───────────────────────────────────────────────────────────
// Complete les 2 ou 3 champs financiers manquants (patrimoine, revenus, statut)
// AU POINT DE FRICTION, sans ouvrir la fiche complete. La saisie recalcule les
// montants (au reload) et leve le point rouge du verrou de signature. On ne
// demande QUE ce qui manque, la ou le conseiller a une raison de completer.
function CaptureInline({ client, onSaved, onClose, compact }) {
  const [pat, setPat] = useState(client.patrimoine ? String(client.patrimoine) : '')
  const [rev, setRev] = useState(client.revenus ? String(client.revenus) : '')
  const [statut, setStatut] = useState(client.statut || '')
  const [saving, setSaving] = useState(false)
  const manque = { pat: !client.patrimoine, rev: !client.revenus, statut: !client.statut }
  const rempli = [statut, rev, pat].filter((v) => `${v}`.trim() !== '').length

  async function save() {
    setSaving(true)
    try {
      await updateClientInfo(client.client_id, {
        patrimoine_estime: pat, revenus_annuels: rev, statut_pro: statut || undefined,
      })
      toast.success('Fiche complétée, montants recalculés')
      onSaved && onSaved()
    } catch (e) { toast.error(e.message || 'Échec de l enregistrement') }
    finally { setSaving(false) }
  }

  return (
    <div className={`cap${compact ? ' compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="capf">
        <label>Patrimoine estimé
          <input type="number" min="0" step="1000" placeholder="€" value={pat}
            onChange={(e) => setPat(e.target.value)} className={manque.pat ? 'miss' : ''} />
        </label>
        <label>Revenus annuels
          <input type="number" min="0" step="1000" placeholder="€" value={rev}
            onChange={(e) => setRev(e.target.value)} className={manque.rev ? 'miss' : ''} />
        </label>
        <label>Statut
          <select value={statut} onChange={(e) => setStatut(e.target.value)} className={manque.statut ? 'miss' : ''}>
            <option value="">…</option>
            {STATUTS_PRO.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="capb">
        <span className="capprog">{rempli}/3 renseignés</span>
        <button className="pri" disabled={saving} onClick={save}>Enregistrer</button>
        {onClose && <button className="sec" onClick={onClose}>Fermer</button>}
      </div>
    </div>
  )
}

// ── Collaboration : renforts et seconds regards adressés à ce conseiller ─────
// #3 renfort expert, #9 second regard entre pairs. Panneau en tête de la vue
// Missions, alimenté par listCollaboration (missions hors portefeuille).
function CollabPanel({ items, myCode, famMap, onRepondreRenfort, onDonnerAvis, onProposer }) {
  const labelFam = (k) => famMap[k]?.label || k
  const nom = (m) => `${m.clients?.prenom || ''} ${m.clients?.nom || ''}`.trim() || '(client)'
  const renforts = (items || []).filter((m) => m.renfort_code === myCode)
  const regards = (items || []).filter((m) => m.regard_demande_a === myCode && !m.regard_avis)
  if (renforts.length === 0 && regards.length === 0) return null
  return (
    <div className="collab">
      {renforts.length > 0 && (
        <div className="collabsec">
          <div className="collabt">🤝 Renforts à traiter ({renforts.length})</div>
          {renforts.map((m) => (
            <div className="collabrow" key={`rf-${m.id}`}>
              <span className="collabc">{nom(m)} · <b>{labelFam(m.famille)}</b>{m.renfort_note ? ` · « ${m.renfort_note} »` : ''}</span>
              <span className="collabact">
                <button onClick={() => onProposer(m)}>Proposer</button>
                <button onClick={() => onRepondreRenfort(m)}>Noter</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {regards.length > 0 && (
        <div className="collabsec">
          <div className="collabt">👁 Seconds regards à donner ({regards.length})</div>
          {regards.map((m) => (
            <div className="collabrow" key={`rg-${m.id}`}>
              <span className="collabc">{nom(m)} · <b>{labelFam(m.famille)}</b></span>
              <span className="collabact"><button onClick={() => onDonnerAvis(m)}>Donner mon avis</button></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Pile de revue par lot (#2) ──────────────────────────────────────────────
// Enchaine les propositions d une meme selection sans rouvrir la modale a chaque
// fois. Le mail type se genere, le conseiller ouvre sa messagerie ou copie, la
// mission passe en cours, on avance. Clavier : Entree ouvre le mail, C copie,
// S passe, Echap ferme. Aucun envoi automatique, chaque piece reste validee.
function RevueParLot({ items, conseiller, famMap, onMark, onClose }) {
  const labelFam = (k) => famMap[k]?.label || k
  const [i, setI] = useState(0)
  const [contact, setContact] = useState(null)
  const lienRef = useRef(null)
  const cur = items[i]

  useEffect(() => {
    setContact(null)
    if (!cur) return
    let vivant = true
    getClientContact(cur.client.client_id).then((c) => { if (vivant) setContact(c) }).catch(() => {})
    return () => { vivant = false }
  }, [i])

  const prenom = (contact?.prenom || cur?.client.prenom || '').trim()
  const email = (contact?.email || '').trim()
  const mail = cur ? genererMail(cur.famille, { prenom, conseiller, cabinet: CABINET }) : null
  const mailtoHref = mail ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(mail.objet)}&body=${encodeURIComponent(mail.corps)}` : '#'

  function next() {
    if (i + 1 >= items.length) onClose()
    else setI(i + 1)
  }
  function copierEtSuivant() {
    if (mail) navigator.clipboard?.writeText(`Objet : ${mail.objet}\n\n${mail.corps}`)
    if (cur) onMark(cur.client, cur.famille)
    toast.success('Copié, au suivant')
    next()
  }

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return
      if (e.key === 'Enter') { e.preventDefault(); if (lienRef.current) lienRef.current.click() }
      else if (e.key.toLowerCase() === 'c') copierEtSuivant()
      else if (e.key.toLowerCase() === 's') next()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (!cur) return null
  return (
    <div className="mrOverlay" onClick={onClose}>
      <div className="mr pmail rvl" onClick={(e) => e.stopPropagation()}>
        <div className="mrhd">
          <h3>Revue par lot</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="rvlprog"><span>{i + 1} / {items.length}</span><span className="bar"><i style={{ width: `${(100 * (i + 1)) / items.length}%` }} /></span></div>
        <div className="rvlcli">{cur.client.nom} · <b>{labelFam(cur.famille)}</b>{email ? ` · ${email}` : ' · email manquant sur la fiche'}</div>
        {mail && (
          <>
            <div className="rvlobj">{mail.objet}</div>
            <textarea className="pmcorps" rows={9} readOnly value={mail.corps} />
          </>
        )}
        <div className="mrbtns pmbtns">
          <a ref={lienRef} className="pri" href={mailtoHref}
            onClick={() => { if (cur) onMark(cur.client, cur.famille); setTimeout(next, 60) }}>Ouvrir le mail</a>
          <button className="sec" onClick={copierEtSuivant}>Copier</button>
          <button className="sec" onClick={next}>Passer</button>
        </div>
        <div className="rvlhint">Entrée ouvre le mail · C copie · S passe · Échap ferme</div>
      </div>
    </div>
  )
}

// ── Ronds d équipement ───────────────────────────────────────────────────────
// Un rond par famille de produit, l état d équipement du client d un coup d oeil
// (retour Louis : « c était mieux avec les ronds, tous les types de produits »).
//   plein coloré = famille détenue
//   rond doré cible = la famille à proposer (la mission)
//   anneau rouge = absence confirmée (déclarée non détenue)
//   pointillé = non renseigné
function EquipementDots({ client, suggest, suggests, matCols, couleurFam, labelFam }) {
  return (
    <div className="dots">
      {matCols.map((f) => {
        const detenu = client.familles.includes(f.key)
        const absent = !detenu && client.absences.includes(f.key)
        const cible = !detenu && (f.key === suggest || (Array.isArray(suggests) && suggests.includes(f.key)))
        const cls = detenu ? 'on' : cible ? 'target' : absent ? 'no' : 'off'
        const etat = detenu ? 'détenu' : cible ? 'à proposer' : absent ? 'absence confirmée' : 'non renseigné'
        return (
          <span key={f.key} className={`d ${cls}`} title={`${labelFam(f.key)} : ${etat}`}
            style={detenu ? { background: couleurFam(f.key) } : undefined}>
            {absent ? '✕' : ''}
          </span>
        )
      })}
    </div>
  )
}

const styles = `
.meq3{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; --navy:#0A1628; --gold:#C9A961; --gold-dk:#A6843F; --vert:#2C6B4E; color:var(--ink); font-size:13px }
.meq3 *{ box-sizing:border-box }
.meq3 .hd{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px }
.meq3 h1{ font-size:22px; font-weight:700; color:var(--navy); margin:0; letter-spacing:-.02em }
.meq3 .sub{ color:var(--silver); font-size:12px; margin-top:2px }
.meq3 .vues{ display:flex; gap:6px }
.meq3 .vues button{ border:1px solid var(--line); background:#fff; border-radius:9px; padding:6px 12px; font-size:12px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .vues button.on{ background:var(--navy); border-color:var(--navy); color:#fff }
.meq3 .empty{ padding:22px; text-align:center; color:var(--silver) }
.meq3 .errtxt{ color:#B4453B }

.meq3 .hero{ display:flex; gap:10px; margin-bottom:10px; flex-wrap:wrap }
.meq3 .hbox{ flex:1; min-width:230px; border-radius:14px; padding:16px 18px }
.meq3 .hbox.navy{ background:var(--navy); color:#fff }
.meq3 .hbox.navy .hv{ color:var(--gold) }
.meq3 .hbox.vert{ background:#E9F4EE; border:1px solid #CBE5D6; color:var(--vert) }
.meq3 .hv{ font-size:27px; font-weight:800; letter-spacing:-.02em; line-height:1.1; font-variant-numeric:tabular-nums }
.meq3 .hl{ font-size:11.5px; font-weight:600; opacity:.85; margin-top:3px }

.meq3 .camp{ display:flex; align-items:center; gap:10px; background:#FBF4E4; border:1px solid rgba(201,169,97,.5); border-radius:11px; padding:8px 12px; margin-bottom:10px; font-size:12.5px; flex-wrap:wrap }
.meq3 .camp b{ color:var(--gold-dk) }
.meq3 .cjauge{ display:inline-flex; align-items:center; gap:6px; font-weight:700; color:#6b5620; font-variant-numeric:tabular-nums }
.meq3 .bar{ width:70px; height:5px; border-radius:3px; background:#EEE5CC; overflow:hidden; display:inline-block }
.meq3 .bar i{ display:block; height:100%; background:var(--gold) }
.meq3 .enjeu{ font-weight:800; color:var(--gold-dk) }
.meq3 .lnk{ background:none; border:none; color:var(--gold-dk); font-weight:700; font-size:12px; cursor:pointer; text-decoration:underline }
.meq3 .lnk.on{ color:var(--navy) }
.meq3 .fcamp{ display:inline-flex; gap:6px; align-items:center; flex-wrap:wrap }
.meq3 .fcamp select,.meq3 .fcamp input{ border:1px solid rgba(201,169,97,.5); border-radius:7px; padding:3px 6px; font-size:12px; background:#fff }
.meq3 .fcamp input{ width:110px }

.meq3 .chips{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px }
.meq3 .chip{ padding:6px 12px; border-radius:999px; border:1px solid var(--line); background:#fff; font-size:12px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .chip.on{ background:var(--navy); color:#fff; border-color:var(--navy) }
.meq3 .chip.win.on{ background:var(--vert); border-color:var(--vert) }
.meq3 .chip .n{ opacity:.65; font-weight:600; margin-left:3px }
.meq3 .chip .extra{ margin-left:6px; font-size:10.5px; font-weight:700; color:var(--gold-dk) }
.meq3 .chip.on .extra{ color:var(--gold) }

.meq3 .aide{ font-size:11.5px; color:#5b6470; background:#F6F4EF; border:1px solid var(--line); border-radius:9px; padding:8px 12px; margin-bottom:8px }
.meq3 .aide b{ color:var(--navy) }
.meq3 .cartes{ display:flex; flex-direction:column; gap:6px }
/* Ligne de mission dense : tout sur une ligne, beaucoup de missions visibles
   sans scroll (retour Louis : cartes trop hautes, on ne voit rien). */
.meq3 .row{ background:#fff; border:1px solid var(--line); border-left:3px solid var(--line); border-radius:10px; padding:9px 14px; display:flex; align-items:center; gap:14px; box-shadow:0 1px 2px rgba(10,22,40,.04) }
.meq3 .row:hover{ border-color:var(--gold) }
.meq3 .row.orange{ border-left-color:#E4A23C }
.meq3 .row.rouge{ border-left-color:#C4483C }
.meq3 .rgauche{ flex:1; min-width:0 }
.meq3 .rmont{ display:flex; flex-direction:column; align-items:flex-end; line-height:1.1; flex-shrink:0; min-width:92px }
.meq3 .rmont .mont{ font-size:19px; font-weight:800; color:var(--navy); letter-spacing:-.02em; font-variant-numeric:tabular-nums }
.meq3 .rmont .mont.flou{ color:#AEB4BE; font-weight:750 }
.meq3 .rmont .base{ font-size:9.5px; color:var(--silver); white-space:nowrap; margin-top:1px }
.meq3 .ract{ display:flex; gap:6px; flex-shrink:0 }
.meq3 .rgauche .raison{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; margin-top:1px }
.meq3 .rep{ font-size:10px; font-weight:700; color:#8A6A2F; background:#FBF4E4; border-radius:5px; padding:1px 6px }
.meq3 .dots{ display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin:4px 0 3px }
.meq3 .d{ width:12px; height:12px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; font-size:7px; font-weight:800; line-height:1 }
.meq3 .d.off{ border:1.5px dashed #D2CFC7; background:#fff }
.meq3 .d.no{ background:#fff; border:1.5px solid #D89B94; color:#B4453B }
.meq3 .d.target{ background:#fff; box-shadow:0 0 0 2px #fff,0 0 0 3.5px var(--gold) }
.meq3 .d.target::after{ content:''; width:5px; height:5px; border-radius:50%; background:var(--gold) }
@media(max-width:760px){ .meq3 .row{ flex-wrap:wrap } .meq3 .rgauche{ flex-basis:100% } .meq3 .ract{ width:100% } .meq3 .ract .pri{ flex:1 } }
.meq3 .qui{ display:flex; align-items:center; gap:8px; flex-wrap:wrap }
.meq3 .nomcli{ font-weight:750; font-size:13.5px; color:var(--navy) }
.meq3 .cons{ font-size:10px; font-weight:700; color:var(--silver); background:#F4F2ED; border-radius:5px; padding:1px 6px }
.meq3 .age{ font-size:10px; font-weight:800; border-radius:5px; padding:1px 6px; background:#F4F2ED; color:#5b6470 }
.meq3 .age.orange{ background:#FBEED8; color:#9A6A1B }
.meq3 .age.rouge{ background:#FBE4E1; color:#B4453B }
.meq3 .souscli{ font-size:11px; color:var(--silver) }
.meq3 .c2{ grid-row:1 / span 2; display:flex; flex-direction:column; align-items:flex-end; gap:3px; justify-content:center }
.meq3 .fam{ font-size:10.5px; font-weight:800; color:var(--gold-dk); border:1.5px solid var(--gold); border-radius:999px; padding:2px 9px; white-space:nowrap }
.meq3 .mont{ font-size:23px; font-weight:800; color:var(--navy); letter-spacing:-.02em; font-variant-numeric:tabular-nums; white-space:nowrap }
.meq3 .raison{ grid-column:1; font-size:11.5px; color:#5b6470; margin-top:2px }
.meq3 .dort{ grid-column:1 / -1; font-size:11px; font-weight:700; color:#B4453B; background:#FBECEC; border-radius:8px; padding:5px 8px; margin-top:4px }
.meq3 .repinfo{ grid-column:1 / -1; font-size:11px; font-weight:600; color:#9A6A1B; background:#FBF4E4; border-radius:8px; padding:5px 8px; margin-top:4px }
.meq3 .cbtns{ grid-column:1 / -1; display:flex; gap:7px; margin-top:8px }
.meq3 .pri{ background:var(--navy); color:#fff; border:none; border-radius:9px; padding:8px 16px; font-size:12.5px; font-weight:750; cursor:pointer }
.meq3 .pri:disabled{ opacity:.45; cursor:default }
.meq3 .sec{ background:#fff; color:#5b6470; border:1px solid var(--line); border-radius:9px; padding:8px 14px; font-size:12.5px; font-weight:650; cursor:pointer }
.meq3 .ter{ background:#fff; border:1px solid var(--line); border-radius:9px; padding:8px 10px; cursor:pointer; font-size:12.5px }

.meq3 .carte.mini{ display:flex; align-items:center; gap:10px; padding:9px 13px }
.meq3 .carte.mini.ok{ background:#F2F9F5; border-color:#CBE5D6 }
.meq3 .carte.mini.ko{ background:#FAF7F6; border-color:#E8DAD7 }
.meq3 .montwin{ font-weight:800; color:var(--vert); font-variant-numeric:tabular-nums; margin-left:auto }
.meq3 .excraison{ font-size:11.5px; color:#8a6a64; margin-left:auto }

.meq3 .winsec{ margin-top:16px }
.meq3 .wtit{ font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--vert); font-weight:750; margin-bottom:6px }
.meq3 .wins{ display:flex; flex-wrap:wrap; gap:7px }
.meq3 .win{ display:flex; align-items:center; gap:8px; background:#E9F4EE; border:1px solid #CBE5D6; border-radius:10px; padding:7px 11px; font-size:12px }
.meq3 .win .nomcli{ font-size:12.5px }
.meq3 .wfam{ font-size:10.5px; font-weight:700; color:var(--vert) }

.meq3 .reports{ display:flex; flex-direction:column; gap:12px }
.meq3 .rgrp{ background:#fff; border:1px solid var(--line); border-radius:13px; padding:12px 14px }
.meq3 .rhd{ display:flex; align-items:baseline; gap:10px; margin-bottom:8px; flex-wrap:wrap }
.meq3 .rhd b{ color:var(--navy); font-size:14px }
.meq3 .rtot{ font-size:12px; font-weight:700; color:var(--gold-dk) }
.meq3 .rtab{ width:100%; border-collapse:collapse; min-width:520px }
.meq3 .rtab th{ font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--silver); font-weight:700; text-align:left; padding:4px 8px; border-bottom:1px solid var(--line) }
.meq3 .rtab td{ font-size:12px; padding:6px 8px; border-bottom:1px solid #F4F2ED }
.meq3 .rtab td.num{ font-weight:750; color:var(--navy); font-variant-numeric:tabular-nums; white-space:nowrap }
.meq3 .rtab td.rs{ color:#5b6470 }
.meq3 .rexc{ margin-top:8px; font-size:11.5px; color:#8a6a64; display:flex; flex-direction:column; gap:3px }
.meq3 .scrollx{ overflow-x:auto }

.meq3 .mrOverlay{ position:fixed; inset:0; background:rgba(10,22,40,.45); display:flex; align-items:center; justify-content:center; z-index:80; padding:16px }
.meq3 .mr{ background:#fff; border-radius:15px; padding:17px; width:100%; max-width:430px; box-shadow:0 18px 50px rgba(10,22,40,.3) }
.meq3 .mrhd{ display:flex; justify-content:space-between; align-items:center }
.meq3 .mrhd h3{ margin:0; font-size:16px; color:var(--navy) }
.meq3 .x{ border:none; background:#F4F2ED; border-radius:7px; width:24px; height:24px; cursor:pointer; color:#5b6470 }
.meq3 .mrsub{ font-size:12px; color:var(--silver); margin:4px 0 12px; font-weight:600 }
.meq3 .mrlab{ font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--navy); font-weight:750; margin:12px 0 6px }
.meq3 .mrlab .ob{ text-transform:none; letter-spacing:0; color:#B4453B; font-weight:650; font-size:10.5px; margin-left:5px }
.meq3 .mrchips{ display:flex; gap:6px; flex-wrap:wrap }
.meq3 .mrc{ padding:7px 11px; border-radius:999px; border:1px solid var(--line); background:#fff; font-size:12px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .mrc.on{ background:var(--navy); color:#fff; border-color:var(--navy) }
.meq3 .mrtxt{ width:100%; border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:12.5px; margin-top:8px }
.meq3 .mrinfo{ margin-top:10px; font-size:12px; color:#6b5620; background:#FBF4E4; border-radius:9px; padding:7px 10px }
.meq3 .mrinfo b{ color:var(--gold-dk) }
.meq3 .mrbtns{ display:flex; gap:8px; margin-top:15px }
.meq3 .mrexcl{ display:block; margin:11px auto 0; background:none; border:none; font-size:11px; color:var(--silver); text-decoration:underline; cursor:pointer }

.meq3 .mr.pmail{ max-width:560px; max-height:90vh; overflow-y:auto }
.meq3 .pmtabs{ display:flex; gap:6px; margin:10px 0 6px }
.meq3 .pmtabs button{ flex:1; padding:8px 10px; border-radius:9px; border:1px solid var(--line); background:#fff; font-size:12.5px; font-weight:700; color:#5b6470; cursor:pointer }
.meq3 .pmtabs button.on{ background:var(--navy); color:#fff; border-color:var(--navy) }
.meq3 .pmchoix{ display:flex; flex-wrap:wrap; gap:6px }
.meq3 .pmc{ display:inline-flex; align-items:center; gap:6px; padding:6px 11px; border-radius:999px; border:1px solid var(--line); background:#fff; font-size:12px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .pmc.on{ border-color:var(--gold); background:#FBF6EC; color:var(--navy) }
.meq3 .pmdot{ width:9px; height:9px; border-radius:50%; flex-shrink:0 }
.meq3 .pmnote{ font-size:11.5px; color:#6b5620; background:#FBF4E4; border-radius:9px; padding:8px 10px; margin-top:8px }
.meq3 .pmnote.reco{ color:#2C6B4E; background:#E9F4EE; border:1px solid #CBE5D6 }
.meq3 .pmobj{ width:100%; border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:13px; font-weight:650; color:var(--ink) }
.meq3 .pmcorps{ width:100%; border:1px solid var(--line); border-radius:9px; padding:10px 12px; font-size:12.5px; line-height:1.5; color:var(--ink); font-family:inherit; resize:vertical }
.meq3 .pmhint{ text-transform:none; letter-spacing:0; font-weight:600; font-size:10.5px; color:var(--silver); margin-left:6px }
.meq3 .pmdest{ font-size:11.5px; color:#5b6470; margin-top:9px }
.meq3 .pmdest b{ color:var(--navy) }
.meq3 .pmwarn{ color:#9A6A1B }
.meq3 .pmbtns{ margin-top:12px }
.meq3 .pmbtns .pri{ text-decoration:none; display:inline-flex; align-items:center; justify-content:center; text-align:center }
.meq3 .pmdeal{ display:block; width:100%; margin-top:9px; background:#fff; border:1px solid var(--line); border-radius:9px; padding:9px; font-size:12.5px; font-weight:700; color:var(--navy); cursor:pointer }
.meq3 .pmdeal:hover{ border-color:var(--gold) }
.meq3 .dbtns .lien{ display:block; width:100%; margin-top:6px; background:none; border:none; font-size:11.5px; color:var(--silver); text-decoration:underline; cursor:pointer }

/* Estimation calibree, capture inline, cadence relance, prochaine action */
.meq3 .chip.hot{ border-color:#E4A23C; color:#9A6A1B; background:#FBF3E4 }
.meq3 .chip.hot.on{ background:#E4A23C; color:#fff; border-color:#E4A23C }
.meq3 .tribtn{ padding:6px 12px; border-radius:999px; border:1px dashed var(--line); background:#fff; font-size:11.5px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .rmont .mont.flou{ font-size:13.5px }
.meq3 .baselink{ background:none; border:none; color:var(--gold-dk); font-size:9.5px; font-weight:750; cursor:pointer; text-decoration:underline; margin-top:1px; padding:0 }
.meq3 .age.relb{ background:#FBEED8; color:#9A6A1B }
.meq3 .age.relb.e2{ background:#FBE4D2; color:#B4632B }
.meq3 .age.relb.e3{ background:#FBE4E1; color:#B4453B }
.meq3 .row.relance{ border-left-color:#E4A23C }

.meq3 .cap{ background:#F8FAF9; border:1px solid #DCE6E1; border-radius:10px; padding:10px 12px; margin:2px 0 6px }
.meq3 .cap.compact{ background:#FBFAF7; border-color:var(--line) }
.meq3 .capf{ display:flex; gap:10px; flex-wrap:wrap }
.meq3 .capf label{ display:flex; flex-direction:column; gap:3px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--silver); flex:1; min-width:118px }
.meq3 .capf input,.meq3 .capf select{ border:1px solid var(--line); border-radius:8px; padding:6px 8px; font-size:12.5px; background:#fff; color:var(--ink); font-weight:600 }
.meq3 .capf .miss{ border-color:#D89B94; background:#FDF6F5 }
.meq3 .capb{ display:flex; align-items:center; gap:8px; margin-top:9px }
.meq3 .capprog{ font-size:10.5px; font-weight:700; color:var(--silver); margin-right:auto }
.meq3 .cap .pri{ padding:6px 14px; font-size:12px }
.meq3 .cap .sec{ padding:6px 12px; font-size:12px }

.meq3 .pmcap{ margin-top:10px; background:#FBFAF7; border:1px solid var(--line); border-radius:10px; padding:10px 12px }
.meq3 .pmcaptit{ font-size:10.5px; font-weight:750; color:#9A6A1B; text-transform:uppercase; letter-spacing:.03em; margin-bottom:7px }
.meq3 .pmcap .cap{ background:none; border:none; padding:0; margin:0 }

.meq3 .nba{ border:1px solid var(--gold); background:#FBF6EC; color:var(--gold-dk); border-radius:999px; padding:3px 9px; font-size:11px; font-weight:750; cursor:pointer; white-space:nowrap }
.meq3 .nba:hover{ background:var(--gold); color:#fff }
.meq3 .nbamute{ font-size:10.5px; color:#B7BDC4 }
.meq3 .dbrief{ font-size:11px; color:#5b6470; background:#F6F4EF; border:1px solid var(--line); border-radius:8px; padding:6px 9px; margin-bottom:8px; line-height:1.4 }
.meq3 .dbrief b{ color:var(--gold-dk) }
.meq3 .veille{ font-size:10px; font-weight:700; color:#5b6470; background:#EEF1F4; border-radius:5px; padding:1px 6px }
.meq3 .pmsim{ margin-top:10px; background:#F3F6FB; border:1px solid #D5E0EE; border-radius:10px; padding:10px 12px }
.meq3 .pmsimt{ font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:#4A6488; font-weight:750 }
.meq3 .pmsimv{ font-size:13px; font-weight:700; color:var(--navy); margin-top:3px; line-height:1.35 }
.meq3 .pmsimm{ font-size:10px; color:var(--silver); margin-top:3px; font-style:italic }
.meq3 .pmbudget{ margin-top:9px; font-size:11.5px; color:#9A6A1B; background:#FBF4E4; border:1px solid rgba(201,169,97,.4); border-radius:9px; padding:8px 10px }
.meq3 .dpause{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:11px; color:#5b6470; background:#EEF1F4; border-radius:8px; padding:6px 9px; margin-bottom:8px }
.meq3 .dpause .lnk{ color:var(--gold-dk) }
.meq3 .conflit{ font-size:11px; color:#B4453B; background:#FBECEC; border:1px solid #E8CFCB; border-radius:8px; padding:6px 9px; margin:6px 0; display:flex; align-items:center; gap:6px; flex-wrap:wrap }
.meq3 .conflit button{ border:1px solid #D89B94; background:#fff; color:#B4453B; border-radius:6px; padding:2px 8px; font-size:11px; font-weight:700; cursor:pointer }
.meq3 .explore{ color:#8A6A2F; font-weight:700; font-size:9.5px; margin-top:2px }
.meq3 .segpin{ margin-left:auto }
.meq3 .dseclnk{ float:right; background:none; border:none; color:var(--gold-dk); font-size:10px; font-weight:750; cursor:pointer; text-decoration:underline; text-transform:none; letter-spacing:0 }
.meq3 .dpause select,.meq3 .dpause input{ border:1px solid var(--line); border-radius:7px; padding:4px 6px; font-size:11.5px; background:#fff }
.meq3 .dpause input{ flex:1; min-width:90px }
.meq3 .revuebtn{ display:block; width:100%; margin:2px 0 8px; background:var(--navy); color:#fff; border:none; border-radius:9px; padding:9px 12px; font-size:12.5px; font-weight:700; cursor:pointer; text-align:left }
.meq3 .revuebtn:hover{ background:#12233b }
.meq3 .rvl{ max-width:520px }
.meq3 .rvlprog{ display:flex; align-items:center; gap:8px; margin:8px 0; font-size:11px; font-weight:700; color:var(--silver) }
.meq3 .rvlprog .bar{ flex:1; width:auto; height:6px; background:#EEE5CC }
.meq3 .rvlcli{ font-size:13px; color:var(--navy); font-weight:650; margin-bottom:8px }
.meq3 .rvlcli b{ color:var(--gold-dk) }
.meq3 .rvlobj{ font-size:13px; font-weight:700; color:var(--navy); margin-bottom:6px }
.meq3 .rvlhint{ font-size:10.5px; color:var(--silver); margin-top:8px; text-align:center }
.meq3 .collab{ display:flex; flex-direction:column; gap:8px; margin-bottom:10px }
.meq3 .collabsec{ background:#F3F0FA; border:1px solid #DCD4EE; border-radius:11px; padding:9px 12px }
.meq3 .collabt{ font-size:11px; font-weight:800; color:#5B4B8A; margin-bottom:5px }
.meq3 .collabrow{ display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; padding:3px 0; flex-wrap:wrap }
.meq3 .collabc{ color:var(--ink) }
.meq3 .collabc b{ color:#5B4B8A }
.meq3 .collabact{ display:flex; gap:6px }
.meq3 .collabact button{ border:1px solid #C9BEEB; background:#fff; color:#5B4B8A; border-radius:7px; padding:3px 10px; font-size:11.5px; font-weight:700; cursor:pointer }
.meq3 .collabact button:hover{ background:#5B4B8A; color:#fff; border-color:#5B4B8A }
.meq3 .renfb{ font-size:10px; font-weight:700; color:#5B4B8A; background:#EDE7F8; border-radius:5px; padding:1px 6px }
.meq3 .avisp{ font-size:11px; color:#5B4B8A; background:#F3F0FA; border:1px solid #DCD4EE; border-radius:7px; padding:4px 8px; margin-top:4px; line-height:1.35 }
.meq3 .pmsecond{ display:block; width:100%; margin-top:8px; background:none; border:1px dashed var(--line); border-radius:9px; padding:8px; font-size:11.5px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .pmsecond:hover{ border-color:#5B4B8A; color:#5B4B8A }

/* Axes v2 : vues sauvegardees, lot, foyer, ailleurs, debrief, plan, profil, signaux */
.meq3 .vuesbar{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:8px }
.meq3 .vchip{ display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; background:#fff; overflow:hidden }
.meq3 .vchip button{ background:none; border:none; font-size:11.5px; font-weight:650; color:var(--navy); padding:4px 4px 4px 10px; cursor:pointer }
.meq3 .vchip .vx{ padding:4px 8px 4px 4px; color:var(--silver) }
.meq3 .vsave{ background:none; border:1px dashed var(--line); border-radius:999px; padding:4px 11px; font-size:11.5px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .batchbar{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:var(--navy); color:#fff; border-radius:11px; padding:8px 12px; margin-bottom:8px }
.meq3 .batchbar b{ margin-right:auto }
.meq3 .batchbar button{ background:rgba(255,255,255,.14); border:none; color:#fff; border-radius:8px; padding:5px 11px; font-size:12px; font-weight:700; cursor:pointer }
.meq3 .batchbar .bclear{ background:none; text-decoration:underline }
.meq3 th.ck,.meq3 td.ck{ width:26px; text-align:center; padding:0 }
.meq3 .foyerh td{ background:#F3EFE6; font-weight:750; color:var(--navy); font-size:11.5px }
.meq3 .sigdot{ color:#B4453B; font-size:9px; margin-left:5px; vertical-align:middle }
.meq3 .sigdot.veille2{ color:#5b6470; font-size:11px }
.meq3 .p2.ailleurs{ background:#fff; border:1.5px solid var(--gold); color:var(--gold-dk); line-height:11px }
.meq3 .st.ailleurs{ background:#FBF6EC; color:var(--gold-dk) }
.meq3 .dnav{ display:flex; align-items:center; gap:4px }
.meq3 .dnav button{ border:1px solid var(--line); background:#fff; border-radius:6px; width:22px; height:22px; cursor:pointer; color:#5b6470; font-size:14px; line-height:1 }
.meq3 .debrief{ display:flex; flex-direction:column; gap:4px; margin-bottom:6px }
.meq3 .debrow{ display:flex; align-items:center; gap:4px; flex-wrap:wrap }
.meq3 .dbfam{ flex:1; min-width:90px; font-size:11.5px; font-weight:600; color:var(--navy) }
.meq3 .debrow button{ border:1px solid var(--line); background:#fff; border-radius:6px; padding:3px 7px; font-size:10.5px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .debrow button:hover{ border-color:var(--gold); color:var(--gold-dk) }
.meq3 .frise{ display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px }
.meq3 .frstep{ font-size:10.5px; font-weight:700; color:var(--gold-dk); background:#FBF6EC; border:1px solid var(--gold); border-radius:999px; padding:2px 9px }
.meq3 .planed{ background:#FBFAF7; border:1px solid var(--line); border-radius:9px; padding:8px 10px; margin-bottom:6px }
.meq3 .plrow{ display:flex; align-items:center; justify-content:space-between; font-size:12px; padding:2px 0 }
.meq3 .planadd{ display:flex; gap:5px; margin:6px 0; flex-wrap:wrap }
.meq3 .planadd select{ border:1px solid var(--line); border-radius:7px; padding:4px 6px; font-size:11.5px; background:#fff }
.meq3 .planed .pri{ width:100%; padding:6px; font-size:12px }
.meq3 .profiltags{ display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px }
.meq3 .ptag{ border:1px solid var(--line); background:#fff; border-radius:999px; padding:4px 11px; font-size:11.5px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .ptag.on{ border-color:var(--navy); background:var(--navy); color:#fff }
.meq3 .sigrow{ display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:11.5px; color:#5b6470; padding:2px 0 }
.meq3 .sigadd{ display:flex; gap:5px; flex-wrap:wrap; margin-top:5px }
.meq3 .sigadd input{ flex:1; min-width:120px; border:1px solid var(--line); border-radius:7px; padding:5px 8px; font-size:11.5px }
.meq3 .sigadd select{ border:1px solid var(--line); border-radius:7px; padding:5px 6px; font-size:11.5px; background:#fff }
.meq3 .pmangle{ margin-top:9px; font-size:11.5px; color:#5B4B8A; background:#F3F0FA; border:1px solid #DCD4EE; border-radius:9px; padding:7px 10px }
.meq3 .fams{ display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0 }
.meq3 .plancher{ display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11.5px; color:#2C6B4E; background:#E9F4EE; border:1px solid #CBE5D6; border-radius:9px; padding:7px 10px; margin:6px 0 }
.meq3 .plancher button{ border:1px solid #2C6B4E; background:#fff; color:#2C6B4E; border-radius:7px; padding:3px 10px; font-size:11.5px; font-weight:700; cursor:pointer; white-space:nowrap }
.meq3 .plancher button:hover{ background:#2C6B4E; color:#fff }

.meq3 .mx2 .segs{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:10px }
.meq3 .seg{ padding:6px 12px; border-radius:999px; border:1px solid var(--line); background:#fff; font-size:12px; font-weight:650; color:#5b6470; cursor:pointer }
.meq3 .seg.on{ background:var(--navy); color:#fff; border-color:var(--navy) }
.meq3 .sp{ flex:1 }
.meq3 .search{ border:1px solid var(--line); border-radius:9px; padding:6px 10px; font-size:12.5px; width:150px; background:#fff }
.meq3 .mini{ border:1px solid var(--line); border-radius:9px; padding:6px 8px; font-size:12px; background:#fff; color:#5b6470; font-weight:600 }
.meq3 .layout{ display:flex; gap:10px; align-items:flex-start }
.meq3 .tblwrap{ flex:1; background:#fff; border:1px solid var(--line); border-radius:13px; overflow:hidden; min-width:0 }
.meq3 .mx{ width:100%; border-collapse:collapse; min-width:620px }
.meq3 .mx thead th{ font-size:9px; text-transform:uppercase; letter-spacing:.03em; color:var(--silver); font-weight:700; padding:8px 4px; border-bottom:1px solid var(--line); background:#FCFBF9; text-align:center; white-space:nowrap }
.meq3 .mx thead th.l{ text-align:left; padding-left:12px }
.meq3 .mx tbody td{ padding:7px 4px; border-bottom:1px solid #F4F2ED; text-align:center; vertical-align:middle }
.meq3 .mx tbody td.l{ text-align:left; padding-left:12px }
.meq3 .mx tbody tr{ cursor:pointer }
.meq3 .mx tbody tr:hover td{ background:#FCFBF6 }
.meq3 .mx tbody tr.sel td{ background:#FBF6EC }
.meq3 .cli{ font-weight:650; white-space:nowrap; max-width:200px; overflow:hidden; text-overflow:ellipsis }
.meq3 .cli small{ display:block; font-weight:500; color:var(--silver); font-size:10px }
.meq3 .p2{ display:inline-block; width:13px; height:13px; border-radius:50%; line-height:12px; font-size:9px; font-weight:800 }
.meq3 .p2.off{ border:1.5px dashed #CFCCC4; background:#fff }
.meq3 .p2.no{ background:#fff; border:1.5px solid #D89B94; color:#B4453B }
.meq3 .comp{ display:inline-flex; align-items:center; gap:5px; font-variant-numeric:tabular-nums; font-weight:700; font-size:11px; color:#5b6470 }
.meq3 .legend{ font-size:10px; color:var(--silver); padding:7px 12px; border-top:1px solid #F4F2ED }
.meq3 .drawer{ width:265px; flex-shrink:0; background:#fff; border:1px solid rgba(201,169,97,.45); border-radius:13px; padding:13px; box-shadow:0 6px 22px rgba(201,169,97,.14); position:sticky; top:10px }
.meq3 .dhd{ display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px }
.meq3 .dhd h4{ margin:0; font-size:14px; color:var(--navy) }
.meq3 .dsub{ font-size:10.5px; color:var(--silver) }
.meq3 .dsec{ font-size:9.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--silver); font-weight:750; margin:10px 0 4px }
.meq3 .drow{ display:flex; align-items:center; gap:6px; padding:3.5px 0; border-bottom:1px solid #F7F5F1; font-size:12px }
.meq3 .drow:last-of-type{ border-bottom:none }
.meq3 .dfam{ flex:1; font-weight:600 }
.meq3 .st{ font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:999px; white-space:nowrap }
.meq3 .st.ok{ background:#E7F3EC; color:#2C6B4E }
.meq3 .st.no{ background:#FBECEC; color:#B4453B }
.meq3 .st.miss{ background:#F4F3EF; color:var(--silver) }
.meq3 .dactions{ display:flex; gap:3px }
.meq3 .dactions button{ border:1px solid var(--line); background:#fff; border-radius:6px; width:21px; height:21px; font-size:10.5px; cursor:pointer; color:#5b6470; line-height:1 }
.meq3 .dactions button:hover{ border-color:var(--gold); color:var(--gold-dk) }
.meq3 .tl{ max-height:130px; overflow-y:auto }
.meq3 .tli{ display:flex; gap:6px; align-items:baseline; font-size:11px; padding:2.5px 0; border-bottom:1px solid #F7F5F1 }
.meq3 .tli .td{ color:var(--silver); font-variant-numeric:tabular-nums; white-space:nowrap }
.meq3 .tli .tp{ flex:1; font-weight:600 }
.meq3 .tli .tm{ color:#5b6470; white-space:nowrap }
.meq3 .dbtns{ margin-top:11px }
.meq3 .dbtns .pri{ width:100% }

@media(max-width:700px){
  .meq3 .carte{ grid-template-columns:1fr }
  .meq3 .c2{ grid-row:auto; flex-direction:row; align-items:center; justify-content:space-between; margin-top:4px }
  .meq3 .cbtns{ flex-wrap:wrap }
  .meq3 .cbtns .pri,.meq3 .cbtns .sec{ flex:1; min-width:120px }
  .meq3 .hbox{ min-width:100% }
  .meq3 .layout{ flex-direction:column }
  .meq3 .drawer{ width:100%; position:static }
}
`
