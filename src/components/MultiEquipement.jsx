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

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  listEquipment, listFamilies, upsertDeclare, removeDeclare,
  listDeclaresForClient, listSignedDealsForClient, getSettings, saveSettings,
} from '../services/equipment'
import { listMissions, upsertMission, reconcileGagnees } from '../services/missions'
import {
  suggestionPour, ARGUMENTAIRES, estimationCollecte, baseMontant, REGLES,
  RAISONS_REPORT, ECHEANCES_REPORT,
} from '../config/multiEquipementRules'

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
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [vue, setVue] = useState('missions')       // missions | reports | matrice
  const [chip, setChip] = useState('a_attaquer')   // filtre d etat de la liste
  const [campSeul, setCampSeul] = useState(false)  // ne montrer que la campagne
  const [reportPour, setReportPour] = useState(null) // mission ouverte dans la modale
  const [editCamp, setEditCamp] = useState(false)

  async function reload() {
    const [eq, fam, st, mis] = await Promise.all([
      listEquipment(), listFamilies(), getSettings(), listMissions(),
    ])
    const mapped = eq.map((c) => ({
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
      nb: Number(c.nb_familles || 0),
    }))
    setFamilies(fam)
    setSettings(st)
    setRows(mapped)
    // Reconciliation : coche les gagnees a la signature, reveille les reports echus
    try { setMissions(await reconcileGagnees(mapped, mis)) } catch { setMissions(mis) }
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
  const matCols = useMemo(() => families.filter((f) => f.key !== 'autre'), [families])
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
        montant_reel: db?.montant_reel != null ? Number(db.montant_reel) : null,
        raison_report: db?.raison_report || null,
        retour_le: db?.retour_le || null,
        advisor_code: db?.advisor_code || r.advisor_code,
        created_at: db?.created_at || null,
        updated_at: db?.updated_at || null,
        enBase: !!db,
      })
    }
    for (const r of rows) {
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
        montant_reel: m.montant_reel != null ? Number(m.montant_reel) : null,
        raison_report: m.raison_report || null,
        retour_le: m.retour_le || null,
        advisor_code: m.advisor_code || r.advisor_code,
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

  // ── Liste affichée : chip d état + filtre campagne, triée argent d abord ─
  const liste = useMemo(() => {
    let l = missionsAff.filter((m) => m.statut === chip)
    if (campSeul && camp) l = l.filter((m) => m.famille === camp)
    if (chip === 'gagnee') return l.sort((a, b) => (b.montant_reel || 0) - (a.montant_reel || 0))
    return l.sort((a, b) => (b.montant || 0) - (a.montant || 0))
  }, [missionsAff, chip, campSeul, camp])

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
    { k: 'a_attaquer', l: 'À proposer', n: nb('a_attaquer') },
    { k: 'en_cours', l: 'En cours', n: nb('en_cours') },
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
              <button key={c.k} className={`chip${chip === c.k ? ' on' : ''}${c.k === 'gagnee' ? ' win' : ''}`} onClick={() => setChip(c.k)}>
                {c.l} <span className="n">{c.n}</span>
                {c.extra && <span className="extra">{c.extra}</span>}
              </button>
            ))}
          </div>

          {/* Liste de missions : le coeur du module */}
          {chip === 'a_attaquer' && liste.length > 0 && (
            <div className="aide">
              Chaque ligne = <b>un client</b> et le produit à lui proposer. Les <b>ronds</b> montrent son équipement (plein = détenu, ✕ = absence confirmée, rond doré = la famille à proposer).
              « Proposer » ouvre un dossier prérempli ; « ≈ défaut » sous le montant = fiche à compléter pour un chiffre réel.
            </div>
          )}
          <div className="cartes">
            {liste.length === 0 && (
              <div className="empty">
                {chip === 'a_attaquer'
                  ? 'Rien à proposer pour ces filtres. La vue matrice permet de déclarer l équipement et de faire émerger des missions.'
                  : 'Aucune mission dans cet état.'}
              </div>
            )}
            {chip !== 'gagnee' && chip !== 'exclue' && liste.map((mi) => {
              const age = chip === 'a_attaquer' ? ageJours(mi) : null
              const niveau = age != null && age > 14 ? 'rouge' : age != null && age > 7 ? 'orange' : ''
              return (
                <div key={mi.key} className={`row ${niveau}`}>
                  <div className="rgauche">
                    <div className="qui">
                      <span className="nomcli">{mi.client.nom}</span>
                      {isManager && <span className="cons">{mi.advisor_code}</span>}
                      {age != null && age > 7 && <span className={`age ${niveau}`}>{age} j sans action</span>}
                      {mi.statut === 'reportee' && (
                        <span className="rep">🕰 revient le {fmtDate(mi.retour_le)}</span>
                      )}
                    </div>
                    <EquipementDots client={mi.client} suggest={mi.famille} matCols={matCols}
                      couleurFam={couleurFam} labelFam={labelFam} />
                    <div className="raison">{mi.raison}</div>
                  </div>
                  <span className="fam" style={{ borderColor: couleurFam(mi.famille) }}>{labelFam(mi.famille)}</span>
                  <div className="rmont">
                    <span className={`mont ${mi.parDefaut ? 'flou' : ''}`}>~{fmtK(mi.montant)}</span>
                    <span className="base" title={mi.parDefaut ? 'Estimation par defaut, complete la fiche client pour un vrai chiffre' : 'Base de l estimation'}>
                      {mi.parDefaut ? '≈ défaut' : mi.base}
                    </span>
                  </div>
                  <div className="ract">
                    <button className="pri" onClick={() => attaquer(mi)} title="Ouvre un dossier prérempli">Proposer</button>
                    <button className="sec" onClick={() => setReportPour(mi)}>{mi.statut === 'reportee' ? 'Re-reporter' : 'Plus tard'}</button>
                    {ARGUMENTAIRES[mi.famille] && (
                      <button className="ter" title="Copier l argumentaire d appel" onClick={() => copierArgumentaire(mi.famille)}>📋</button>
                    )}
                  </div>
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
          profile={profile} onCreateDeal={onCreateDeal} reload={reload} />
      )}

      {/* Modale anti zap */}
      {reportPour && (
        <ModaleReport mission={reportPour} labelFam={labelFam}
          onClose={() => setReportPour(null)}
          onConfirm={(res) => confirmerReport(reportPour, res)} />
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

// ── Matrice V2 allégée ──────────────────────────────────────────────────────
// Conservée pour corriger les données : matrice à pastilles + drawer de
// déclarations (détenu, absence, historique signé). Radar, heatmap, export et
// bloc opportunités de la V2 ont été retirés, les missions les remplacent.
function MatriceV2({ rows, matCols, famMap, isManager, profile, onCreateDeal, reload }) {
  const [seg, setSeg] = useState('tous')
  const [cons, setCons] = useState('all')
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)
  const labelFam = (k) => famMap[k]?.label || k
  const couleurFam = (k) => famMap[k]?.couleur || '#8A95A8'

  const conseillers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.advisor_code).filter((x) => x && x !== '—'))).sort(),
    [rows],
  )
  const visibles = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (cons !== 'all' && r.advisor_code !== cons) return false
      if (seg === 'mono' && r.nb !== 1) return false
      if (seg === 'multi' && r.nb < 2) return false
      if (seg === 'sans' && r.nb !== 0) return false
      if (ql && !(`${r.nom} ${r.profession} ${r.advisor_code}`.toLowerCase().includes(ql))) return false
      return true
    }).sort((a, b) => b.revenus - a.revenus)
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

  const segs = [
    { k: 'tous', l: 'Tous' }, { k: 'mono', l: 'Mono' }, { k: 'multi', l: 'Multi 2+' }, { k: 'sans', l: 'Sans info' },
  ]
  return (
    <div className="mx2">
      <div className="segs">
        {segs.map((s) => (
          <button key={s.k} className={`seg${seg === s.k ? ' on' : ''}`} onClick={() => setSeg(s.k)}>{s.l}</button>
        ))}
        <span className="sp" />
        <input className="search" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        {isManager && (
          <select className="mini" value={cons} onChange={(e) => setCons(e.target.value)}>
            <option value="all">Tous conseillers</option>
            {conseillers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div className="layout">
        <div className="tblwrap">
          <div className="scrollx">
            <table className="mx">
              <thead>
                <tr>
                  <th className="l">Client</th>
                  {matCols.map((f) => <th key={f.key} title={f.label}>{f.label.length > 8 ? `${f.label.slice(0, 7)}.` : f.label}</th>)}
                  <th>Complétude</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <tr key={r.client_id} className={selId === r.client_id ? 'sel' : ''} onClick={() => setSelId(r.client_id)}>
                    <td className="l cli">
                      {r.nom}
                      <small>{r.statut || r.profession || '—'}{r.revenus ? ` · ${Math.round(r.revenus / 1000)} k€` : ''} · {r.advisor_code}</small>
                    </td>
                    {matCols.map((f) => {
                      const detenu = r.familles.includes(f.key)
                      const absent = r.absences.includes(f.key)
                      return (
                        <td key={f.key}>
                          {detenu && <span className="p2 on" title={`${labelFam(f.key)} : détenu`} style={{ background: couleurFam(f.key) }} />}
                          {!detenu && absent && <span className="p2 no" title={`${labelFam(f.key)} : absence confirmée`}>✕</span>}
                          {!detenu && !absent && <span className="p2 off" title={`${labelFam(f.key)} : non renseigné`} />}
                        </td>
                      )
                    })}
                    <td>
                      <span className="comp">{r.nb}/{matCols.length}
                        <span className="bar"><i style={{ width: `${Math.min(100, (100 * r.nb) / matCols.length)}%` }} /></span>
                      </span>
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr><td colSpan={matCols.length + 2} className="empty">Aucun client pour ces filtres.</td></tr>
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
              <button className="x" onClick={() => setSelId(null)}>✕</button>
            </div>
            <div className="dsec">Équipement</div>
            {matCols.map((f) => {
              const detenu = sel.familles.includes(f.key)
              const absent = sel.absences.includes(f.key)
              const decl = detail?.declares?.find((d) => d.famille === f.key)
              return (
                <div className="drow" key={f.key}>
                  <span className="dfam" style={{ color: detenu ? couleurFam(f.key) : undefined }}>{f.label}</span>
                  {detenu && <span className="st ok">détenu{decl?.compagnie ? ` · ${decl.compagnie}` : ''}</span>}
                  {!detenu && absent && <span className="st no">absent confirmé</span>}
                  {!detenu && !absent && <span className="st miss">?</span>}
                  <span className="dactions">
                    {!detenu && <button disabled={saving} title="Déclarer détenu (souscrit ailleurs ou avant le CRM)" onClick={() => declarer(f.key, true)}>✓</button>}
                    {!detenu && !absent && <button disabled={saving} title="Confirmer l absence" onClick={() => declarer(f.key, false)}>✕</button>}
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
              <button className="pri" onClick={() => onCreateDeal && onCreateDeal(sel)}>+ Créer le deal</button>
            </div>
          </div>
        )}
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
function EquipementDots({ client, suggest, matCols, couleurFam, labelFam }) {
  return (
    <div className="dots">
      {matCols.map((f) => {
        const detenu = client.familles.includes(f.key)
        const absent = !detenu && client.absences.includes(f.key)
        const cible = !detenu && f.key === suggest
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
