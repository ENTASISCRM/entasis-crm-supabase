// ═══════════════════════════════════════════════════════════════════════════
// MULTI-ÉQUIPEMENT V2 : la matrice de cross-sell du cabinet
//
// Refonte demandée par Louis (« c'est fouilli, on voit mal ») : la V1 empilait
// badges et blocs, la V2 organise tout autour d'une MATRICE clients × familles
// à pastilles, de segments, et d'un panneau latéral d'action.
//
// Les 20 innovations de la V2 :
//   1  matrice à pastilles (détenu ● / manquant ◌ / absence confirmée ✕)
//   2  segments intelligents (Tous / Opportunités / Mono / Multi / Sans info)
//   3  regroupement par conseiller repliable, taux multi par portefeuille
//   4  jauge de complétude par ligne
//   5  tri par potentiel (défaut) et par colonnes
//   6  recherche instantanée
//   7  panneau latéral d'action au clic
//   8  déclarer un produit détenu ou une absence en 2 clics
//   9  créer un deal prérempli (via App.jsx)
//  10  argumentaire d'appel prêt à copier
//  11  estimation € par opportunité + KPI gisement total
//  12  campagne du mois (famille cible cabinet, éditable manager, en base)
//  13  radar de couverture par famille
//  14  heatmap conseiller × famille (manager)
//  15  timeline d'équipement du client (deals signés + déclarations)
//  16  badge « à revoir » (dernier deal signé il y a plus de 12 mois)
//  17  export CSV de la vue filtrée
//  18  densité compact / confort
//  19  filtres mémorisés (localStorage) + réinitialisation
//  20  objectif de taux multi avec projection (combien de clients à convertir)
//
// Périmètre de données : vue SQL `client_equipment` en security_invoker, la
// RLS applique le périmètre (manager = tous, conseiller = ses clients).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend,
} from 'chart.js'
import { Radar } from 'react-chartjs-2'
import {
  listEquipment, listFamilies, upsertDeclare, removeDeclare,
  listDeclaresForClient, listSignedDealsForClient, getSettings, saveSettings,
} from '../services/equipment'
import {
  suggestionPour, estFortPotentiel, ARGUMENTAIRES, estimationCollecte, scorePotentiel,
} from '../config/multiEquipementRules'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const fmtEur = (v) =>
  Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtK = (v) => (v >= 1000 ? `${Math.round(v / 1000)} k€` : `${Math.round(v)} €`)

function nomClient(c) {
  const n = `${c.prenom || ''} ${c.nom || ''}`.trim()
  return n || '(sans nom)'
}

// Filtres par défaut (innovation 19 : mémorisés en localStorage)
const FILTRES_DEFAUT = { seg: 'opportunites', cons: 'all', q: '', groupe: true, dense: false }
const LS_KEY = 'meq2_filtres'

export default function MultiEquipement({ profile, onCreateDeal }) {
  const isManager = profile?.role === 'manager'
  const [rows, setRows] = useState([])
  const [families, setFamilies] = useState([])
  const [settings, setSettings] = useState({ campagne_du_mois: 'prevoyance', objectif_taux_multi: 40 })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [selId, setSelId] = useState(null)          // client ouvert dans le panneau
  const [detail, setDetail] = useState(null)        // { declares, deals } du client ouvert
  const [showAnalyse, setShowAnalyse] = useState(false)
  const [collapsed, setCollapsed] = useState({})    // groupes conseiller repliés
  const [saving, setSaving] = useState(false)

  // Filtres persistés
  const [flt, setFlt] = useState(() => {
    try { return { ...FILTRES_DEFAUT, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') } }
    catch { return FILTRES_DEFAUT }
  })
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(flt)) } catch { /* stockage plein : tant pis */ } }, [flt])
  const setF = (k, v) => setFlt((p) => ({ ...p, [k]: v }))

  async function reload() {
    const [eq, fam, st] = await Promise.all([listEquipment(), listFamilies(), getSettings()])
    setFamilies(fam)
    setSettings(st)
    setRows(eq.map((c) => ({
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
      dernier: c.dernier_deal_signe || null,
    })))
  }

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try { await reload() } catch (e) { if (vivant) setErr(e.message || 'Erreur de chargement') }
      finally { if (vivant) setLoading(false) }
    })()
    return () => { vivant = false }
  }, [])

  // Colonnes de la matrice : toutes les familles sauf « autre » (innovation 1)
  const matCols = useMemo(() => families.filter((f) => f.key !== 'autre'), [families])
  const famMap = useMemo(() => Object.fromEntries(families.map((f) => [f.key, f])), [families])
  const labelFam = (k) => famMap[k]?.label || k
  const couleurFam = (k) => famMap[k]?.couleur || '#8A95A8'

  // Enrichissement par ligne : suggestion, potentiel, ancienneté (16), campagne
  const enriched = useMemo(() => rows.map((r) => {
    const sug = suggestionPour(r)
    const pot = scorePotentiel(r, sug)
    const collecte = sug ? estimationCollecte(r, sug.famille_suggeree) : 0
    const moisDepuisDernier = r.dernier
      ? Math.floor((Date.now() - new Date(r.dernier).getTime()) / (30.44 * 86400000))
      : null
    return {
      ...r, sug, pot, collecte,
      aRevoir: moisDepuisDernier != null && moisDepuisDernier >= 12,
      campagneCible: settings.campagne_du_mois
        && !r.familles.includes(settings.campagne_du_mois)
        && (r.absences.includes(settings.campagne_du_mois) || (sug && sug.famille_suggeree === settings.campagne_du_mois)),
    }
  }), [rows, settings.campagne_du_mois])

  // KPIs globaux + gisement (11) + objectif (20)
  const kpis = useMemo(() => {
    const total = enriched.length
    const multi = enriched.filter((r) => r.nb >= 2).length
    const mono = enriched.filter((r) => r.nb === 1).length
    const zero = enriched.filter((r) => r.nb === 0).length
    const opps = enriched.filter((r) => r.sug)
    const gisement = opps.reduce((s, r) => s + r.collecte, 0)
    const taux = total ? Math.round((100 * multi) / total) : 0
    const objectif = Number(settings.objectif_taux_multi || 40)
    // Projection : combien de clients doivent passer multi pour l'objectif
    const cible = Math.ceil((objectif / 100) * total)
    return { total, multi, mono, zero, taux, opps: opps.length, gisement, objectif, manquants: Math.max(0, cible - multi) }
  }, [enriched, settings.objectif_taux_multi])

  const conseillers = useMemo(
    () => Array.from(new Set(enriched.map((r) => r.advisor_code).filter((x) => x && x !== '—'))).sort(),
    [enriched],
  )

  // Segments (2) + recherche (6) + filtre conseiller
  const visibles = useMemo(() => {
    const q = flt.q.trim().toLowerCase()
    return enriched.filter((r) => {
      if (flt.cons !== 'all' && r.advisor_code !== flt.cons) return false
      if (flt.seg === 'opportunites' && !r.sug) return false
      if (flt.seg === 'mono' && r.nb !== 1) return false
      if (flt.seg === 'multi' && r.nb < 2) return false
      if (flt.seg === 'sans' && r.nb !== 0) return false
      if (flt.seg === 'campagne' && !r.campagneCible) return false
      if (q && !(`${r.nom} ${r.profession} ${r.advisor_code}`.toLowerCase().includes(q))) return false
      return true
    }).sort((a, b) => b.pot - a.pot || b.revenus - a.revenus) // tri par potentiel (5)
  }, [enriched, flt])

  // Regroupement par conseiller (3)
  const groupes = useMemo(() => {
    if (!flt.groupe) return [{ code: null, rows: visibles }]
    const m = new Map()
    visibles.forEach((r) => {
      if (!m.has(r.advisor_code)) m.set(r.advisor_code, [])
      m.get(r.advisor_code).push(r)
    })
    return Array.from(m.entries()).map(([code, rws]) => {
      const all = enriched.filter((r) => r.advisor_code === code)
      const multi = all.filter((r) => r.nb >= 2).length
      return { code, rows: rws, taux: all.length ? Math.round((100 * multi) / all.length) : 0, total: all.length }
    }).sort((a, b) => b.rows.length - a.rows.length)
  }, [visibles, flt.groupe, enriched])

  // Panneau latéral (7) : charge le détail du client sélectionné (15)
  const sel = useMemo(() => enriched.find((r) => r.client_id === selId) || null, [enriched, selId])
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

  // Déclarations depuis le panneau (8)
  async function declarer(famille, detenu) {
    if (!sel) return
    setSaving(true)
    try {
      let compagnie = null
      if (detenu) {
        compagnie = window.prompt('Compagnie (facultatif) :', '') || null
      }
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

  // Argumentaire copiable (10)
  function copierArgumentaire(famille) {
    const txt = ARGUMENTAIRES[famille]
    if (!txt) return
    navigator.clipboard?.writeText(txt)
      .then(() => toast.success('Argumentaire copié, colle le dans tes notes d appel'))
      .catch(() => toast.error('Copie impossible sur ce navigateur'))
  }

  // Export CSV de la vue filtrée (17)
  function exportCsv() {
    const cols = ['client', 'conseiller', 'statut', 'profession', 'revenus', 'familles_detenues', 'suggestion', 'collecte_estimee']
    const lignes = visibles.map((r) => [
      r.nom, r.advisor_code, r.statut, r.profession, r.revenus,
      r.familles.map(labelFam).join(' + '),
      r.sug ? labelFam(r.sug.famille_suggeree) : '',
      r.collecte || '',
    ])
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cols, ...lignes].map((l) => l.map(esc).join(';')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `multi-equipement-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success(`${visibles.length} lignes exportées`)
  }

  // Réglages manager (12, 20)
  async function changerCampagne(k) {
    const v = { ...settings, campagne_du_mois: k }
    setSettings(v)
    try { await saveSettings(v); toast.success(`Campagne du mois : ${labelFam(k)}`) }
    catch (e) { toast.error(e.message || 'Échec (réservé aux managers)') }
  }
  async function changerObjectif() {
    const saisi = window.prompt('Objectif de taux de multi-équipement (%) :', String(settings.objectif_taux_multi))
    const n = Number(saisi)
    if (!saisi || Number.isNaN(n) || n <= 0 || n > 100) return
    const v = { ...settings, objectif_taux_multi: n }
    setSettings(v)
    try { await saveSettings(v); toast.success(`Objectif : ${n} %`) }
    catch (e) { toast.error(e.message || 'Échec (réservé aux managers)') }
  }

  // Radar de couverture (13) : % de clients équipés par famille
  const radarData = useMemo(() => {
    const total = Math.max(1, enriched.length)
    const labels = matCols.map((f) => f.label)
    const data = matCols.map((f) =>
      Math.round((100 * enriched.filter((r) => r.familles.includes(f.key)).length) / total))
    return {
      labels,
      datasets: [{
        label: '% de clients équipés',
        data,
        backgroundColor: 'rgba(201,169,97,0.18)',
        borderColor: '#C9A961',
        pointBackgroundColor: '#0A1628',
      }],
    }
  }, [enriched, matCols])

  // Heatmap conseiller × famille (14, manager)
  const heatmap = useMemo(() => {
    if (!isManager) return []
    return conseillers.map((code) => {
      const cli = enriched.filter((r) => r.advisor_code === code)
      return {
        code,
        total: cli.length,
        cells: matCols.map((f) => cli.filter((r) => r.familles.includes(f.key)).length),
      }
    })
  }, [isManager, conseillers, enriched, matCols])
  const heatMax = useMemo(() => Math.max(1, ...heatmap.flatMap((h) => h.cells)), [heatmap])

  // Pastille de la matrice (1)
  function Pastille({ r, f }) {
    const detenu = r.familles.includes(f.key)
    const absent = r.absences.includes(f.key)
    const suggere = r.sug && r.sug.famille_suggeree === f.key
    if (detenu) return <span className="p2 on" title={`${labelFam(f.key)} : détenu`} style={{ background: couleurFam(f.key) }} />
    if (absent) return <span className={`p2 no${suggere ? ' hot' : ''}`} title={`${labelFam(f.key)} : absence confirmée`}>✕</span>
    return <span className={`p2 off${suggere ? ' hot' : ''}`} title={`${labelFam(f.key)} : ${suggere ? 'SUGGÉRÉ' : 'non renseigné'}`} />
  }

  const segs = [
    { k: 'tous', l: 'Tous', n: enriched.length },
    { k: 'opportunites', l: '🔥 Opportunités', n: kpis.opps },
    { k: 'campagne', l: `🎯 ${labelFam(settings.campagne_du_mois)}`, n: enriched.filter((r) => r.campagneCible).length },
    { k: 'mono', l: 'Mono', n: kpis.mono },
    { k: 'multi', l: 'Multi 2+', n: kpis.multi },
    { k: 'sans', l: 'Sans info', n: kpis.zero },
  ]

  return (
    <div className={`meq2${flt.dense ? ' dense' : ''}`}>
      <style>{styles}</style>

      {/* En-tête : titre + KPIs + objectif (20) + gisement (11) */}
      <div className="hd">
        <div>
          <h1>Multi-équipement</h1>
          <div className="sub">{kpis.total} clients · matrice de cross-sell du cabinet</div>
        </div>
        <div className="kpis">
          <button className="kpi obj" onClick={isManager ? changerObjectif : undefined} title={isManager ? 'Modifier l objectif' : ''}>
            <span className="v">{kpis.taux} %<span className="cible">/ {kpis.objectif} %</span></span>
            <span className="l">taux multi · encore {kpis.manquants} clients à convertir</span>
            <span className="jauge"><i style={{ width: `${Math.min(100, (kpis.taux / kpis.objectif) * 100)}%` }} /></span>
          </button>
          <div className="kpi">
            <span className="v gold">~{fmtK(kpis.gisement)}</span>
            <span className="l">gisement estimé · {kpis.opps} opportunités</span>
          </div>
        </div>
      </div>

      {/* Campagne du mois (12) */}
      <div className="camp">
        <span className="ic">🎯</span>
        <span>Campagne du mois : <b>{labelFam(settings.campagne_du_mois)}</b> · {enriched.filter((r) => r.campagneCible).length} clients à travailler</span>
        {isManager && (
          <select value={settings.campagne_du_mois} onChange={(e) => changerCampagne(e.target.value)}>
            {matCols.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        )}
        <button className="lnk" onClick={() => setF('seg', 'campagne')}>voir la liste</button>
      </div>

      {loading && <div className="empty">Chargement…</div>}
      {err && <div className="empty err">Erreur : {err}</div>}

      {!loading && !err && (
        <>
          {/* Segments (2) + outils */}
          <div className="segs">
            {segs.map((s) => (
              <button key={s.k} className={`seg${flt.seg === s.k ? ' on' : ''}`} onClick={() => setF('seg', s.k)}>
                {s.l} <span className="n">{s.n}</span>
              </button>
            ))}
            <span className="sp" />
            <input className="search" placeholder="Rechercher…" value={flt.q} onChange={(e) => setF('q', e.target.value)} />
            {isManager && (
              <select className="mini" value={flt.cons} onChange={(e) => setF('cons', e.target.value)}>
                <option value="all">Tous conseillers</option>
                {conseillers.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <button className={`tgl${flt.groupe ? ' on' : ''}`} onClick={() => setF('groupe', !flt.groupe)} title="Regrouper par conseiller">👥</button>
            <button className={`tgl${flt.dense ? ' on' : ''}`} onClick={() => setF('dense', !flt.dense)} title="Densité compacte">≡</button>
            <button className="tgl" onClick={() => setShowAnalyse((v) => !v)} title="Radar et heatmap">📊</button>
            <button className="tgl" onClick={exportCsv} title="Exporter la vue en CSV">⬇</button>
            <button className="tgl" onClick={() => setFlt(FILTRES_DEFAUT)} title="Réinitialiser les filtres">↺</button>
          </div>

          {/* Analyse : radar (13) + heatmap (14) */}
          {showAnalyse && (
            <div className="analyse">
              <div className="pane">
                <div className="ptit">Couverture du portefeuille par famille</div>
                <div className="radar"><Radar data={radarData} options={{
                  responsive: true, maintainAspectRatio: false,
                  scales: { r: { beginAtZero: true, max: 100, ticks: { display: false } } },
                  plugins: { legend: { display: false } },
                }} /></div>
              </div>
              {isManager && (
                <div className="pane">
                  <div className="ptit">Qui vend quoi (nb de clients équipés)</div>
                  <div className="heat">
                    <table>
                      <thead><tr><th></th>{matCols.map((f) => <th key={f.key}>{f.label.split(' ')[0]}</th>)}</tr></thead>
                      <tbody>
                        {heatmap.map((h) => (
                          <tr key={h.code}>
                            <td className="hc">{h.code} <span>({h.total})</span></td>
                            {h.cells.map((n, i) => (
                              <td key={i}>
                                <span className="cell" style={{ background: n ? `rgba(201,169,97,${0.15 + 0.85 * (n / heatMax)})` : '#F4F2ED', color: n / heatMax > 0.55 ? '#fff' : '#5b6470' }}>{n || ''}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="layout">
            {/* Matrice (1) */}
            <div className="tblwrap">
              <div className="scroll">
                <table className="mx">
                  <thead>
                    <tr>
                      <th className="l">Client</th>
                      {matCols.map((f) => <th key={f.key} title={f.label}>{f.label.length > 8 ? `${f.label.slice(0, 7)}.` : f.label}</th>)}
                      <th>Complétude</th>
                      <th className="r">Potentiel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupes.map((g) => (
                      <GroupeRows key={g.code || 'flat'} g={g} matCols={matCols} collapsed={collapsed}
                        toggle={(c) => setCollapsed((p) => ({ ...p, [c]: !p[c] }))}
                        selId={selId} onSel={setSelId} Pastille={Pastille} labelFam={labelFam} />
                    ))}
                    {visibles.length === 0 && (
                      <tr><td colSpan={matCols.length + 3} className="empty">Aucun client pour ces filtres.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="legend">● détenu · ◌ non renseigné · ✕ absence confirmée · contour or = suggéré · 🕰 = dernier deal il y a plus d un an</div>
            </div>

            {/* Panneau latéral (7, 8, 9, 10, 15) */}
            {sel && (
              <div className="drawer">
                <div className="dhd">
                  <div>
                    <h4>{sel.nom}</h4>
                    <div className="dsub">{sel.statut || sel.profession || '—'}{sel.revenus ? ` · ${fmtEur(sel.revenus)}` : ''} · {sel.advisor_code}</div>
                  </div>
                  <button className="x" onClick={() => setSelId(null)}>✕</button>
                </div>

                {sel.aRevoir && <div className="warn">🕰 Dernier deal signé il y a plus d un an : client à revoir</div>}

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

                {sel.sug && (
                  <div className="sugg">
                    💡 <b>{sel.sug.label}</b> (~{fmtK(sel.collecte)} de collecte estimée)
                    <div className="sraison">{sel.sug.raison}</div>
                    <button className="scopy" onClick={() => copierArgumentaire(sel.sug.famille_suggeree)}>📋 Copier l argumentaire d appel</button>
                  </div>
                )}

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
        </>
      )}
    </div>
  )
}

// Lignes d'un groupe conseiller (repliable, innovation 3)
function GroupeRows({ g, matCols, collapsed, toggle, selId, onSel, Pastille, labelFam }) {
  const plie = g.code && collapsed[g.code]
  return (
    <>
      {g.code && (
        <tr className="grp" onClick={() => toggle(g.code)}>
          <td colSpan={matCols.length + 3}>
            <span className="chev">{plie ? '▸' : '▾'}</span> {g.code} · {g.rows.length} affiché{g.rows.length > 1 ? 's' : ''} sur {g.total} · taux multi <span className="tx">{g.taux} %</span>
          </td>
        </tr>
      )}
      {!plie && g.rows.map((r) => (
        <tr key={r.client_id} className={selId === r.client_id ? 'sel' : ''} onClick={() => onSel(r.client_id)}>
          <td className="l cli">
            {r.nom}{r.aRevoir && <span className="rev" title="Dernier deal il y a plus d un an"> 🕰</span>}
            <small>{r.statut || r.profession || '—'}{r.revenus ? ` · ${Math.round(r.revenus / 1000)} k€` : ''}</small>
          </td>
          {matCols.map((f) => <td key={f.key}><Pastille r={r} f={f} /></td>)}
          <td>
            <span className="comp">{r.nb}/{matCols.length}
              <span className="bar"><i style={{ width: `${Math.min(100, (100 * r.nb) / matCols.length)}%` }} /></span>
            </span>
          </td>
          <td className="r">
            {r.sug
              ? <span className="pot" title={r.sug.raison}>{labelFam(r.sug.famille_suggeree)} · ~{r.collecte >= 1000 ? `${Math.round(r.collecte / 1000)}k` : r.collecte}</span>
              : <span className="potv">—</span>}
          </td>
        </tr>
      ))}
    </>
  )
}

const styles = `
.meq2{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; color:var(--ink); font-size:13px; }
.meq2 *{ box-sizing:border-box }
.meq2 .hd{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:10px }
.meq2 h1{ font-size:22px; font-weight:700; color:var(--navy,#0A1628); margin:0; letter-spacing:-.02em }
.meq2 .sub{ color:var(--silver); font-size:12px; margin-top:2px }
.meq2 .kpis{ display:flex; gap:10px }
.meq2 .kpi{ background:#fff; border:1px solid var(--line); border-radius:12px; padding:10px 14px; display:flex; flex-direction:column; gap:3px; min-width:190px; text-align:left }
.meq2 .kpi .v{ font-size:20px; font-weight:750; color:var(--navy,#0A1628); line-height:1 }
.meq2 .kpi .v .cible{ font-size:12px; color:var(--silver); font-weight:600; margin-left:4px }
.meq2 .kpi .v.gold{ color:var(--gold-dk,#A6843F) }
.meq2 .kpi .l{ font-size:10.5px; color:var(--silver); font-weight:600 }
.meq2 .kpi.obj{ cursor:pointer; border:1px solid rgba(201,169,97,.45) }
.meq2 .jauge{ height:5px; border-radius:3px; background:#EEECE6; overflow:hidden; margin-top:2px }
.meq2 .jauge i{ display:block; height:100%; background:var(--gold,#C9A961) }
.meq2 .camp{ display:flex; align-items:center; gap:8px; background:#FBF4E4; border:1px solid rgba(201,169,97,.5); border-radius:11px; padding:8px 12px; margin-bottom:10px; font-size:12.5px; flex-wrap:wrap }
.meq2 .camp b{ color:var(--gold-dk,#A6843F) }
.meq2 .camp select{ border:1px solid rgba(201,169,97,.5); border-radius:7px; padding:3px 6px; font-size:12px; background:#fff; color:var(--gold-dk,#A6843F); font-weight:600 }
.meq2 .camp .lnk{ background:none; border:none; color:var(--gold-dk,#A6843F); font-weight:700; font-size:12px; cursor:pointer; text-decoration:underline }
.meq2 .segs{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:10px }
.meq2 .seg{ padding:6px 12px; border-radius:999px; border:1px solid var(--line); background:#fff; font-size:12px; font-weight:650; color:#5b6470; cursor:pointer }
.meq2 .seg.on{ background:var(--navy,#0A1628); color:#fff; border-color:var(--navy,#0A1628) }
.meq2 .seg .n{ opacity:.65; font-weight:600; margin-left:3px }
.meq2 .sp{ flex:1 }
.meq2 .search{ border:1px solid var(--line); border-radius:9px; padding:6px 10px; font-size:12.5px; width:150px; background:#fff }
.meq2 .mini{ border:1px solid var(--line); border-radius:9px; padding:6px 8px; font-size:12px; background:#fff; color:#5b6470; font-weight:600 }
.meq2 .tgl{ border:1px solid var(--line); background:#fff; border-radius:9px; padding:6px 9px; cursor:pointer; font-size:12.5px; color:#5b6470 }
.meq2 .tgl.on{ background:#EEF0F3; border-color:#C7CDD6; color:var(--navy,#0A1628) }
.meq2 .analyse{ display:flex; gap:10px; margin-bottom:10px; flex-wrap:wrap }
.meq2 .pane{ flex:1; min-width:280px; background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px }
.meq2 .ptit{ font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--silver); font-weight:700; margin-bottom:8px }
.meq2 .radar{ height:210px }
.meq2 .heat table{ border-collapse:collapse; width:100% }
.meq2 .heat th{ font-size:9.5px; color:var(--silver); font-weight:700; padding:3px; text-transform:uppercase }
.meq2 .heat td{ padding:2px; text-align:center }
.meq2 .heat .hc{ text-align:left; font-size:11px; font-weight:700; color:var(--navy,#0A1628); white-space:nowrap; padding-right:6px }
.meq2 .heat .hc span{ color:var(--silver); font-weight:500 }
.meq2 .cell{ display:inline-flex; align-items:center; justify-content:center; min-width:26px; height:20px; border-radius:5px; font-size:10.5px; font-weight:700 }
.meq2 .layout{ display:flex; gap:10px; align-items:flex-start }
.meq2 .tblwrap{ flex:1; background:#fff; border:1px solid var(--line); border-radius:13px; overflow:hidden; box-shadow:0 1px 2px rgba(10,22,40,.04); min-width:0 }
.meq2 .scroll{ overflow-x:auto }
.meq2 .mx{ width:100%; border-collapse:collapse; min-width:660px }
.meq2 .mx thead th{ font-size:9px; text-transform:uppercase; letter-spacing:.03em; color:var(--silver); font-weight:700; padding:8px 4px; border-bottom:1px solid var(--line); background:#FCFBF9; text-align:center; white-space:nowrap }
.meq2 .mx thead th.l{ text-align:left; padding-left:12px }
.meq2 .mx thead th.r{ text-align:right; padding-right:12px }
.meq2 .mx tbody td{ padding:7px 4px; border-bottom:1px solid #F4F2ED; text-align:center; vertical-align:middle }
.meq2.dense .mx tbody td{ padding:4px 4px }
.meq2 .mx tbody td.l{ text-align:left; padding-left:12px }
.meq2 .mx tbody td.r{ text-align:right; padding-right:10px }
.meq2 .mx tbody tr{ cursor:pointer }
.meq2 .mx tbody tr:hover td{ background:#FCFBF6 }
.meq2 .mx tbody tr.sel td{ background:#FBF6EC }
.meq2 .mx tr.grp td{ background:#F3F1EC; font-weight:700; color:var(--navy,#0A1628); font-size:11px; text-align:left; padding:5px 12px; cursor:pointer }
.meq2 .mx tr.grp .tx{ color:var(--gold-dk,#A6843F) }
.meq2 .mx tr.grp .chev{ color:var(--silver); margin-right:2px }
.meq2 .cli{ font-weight:650; white-space:nowrap; max-width:190px; overflow:hidden; text-overflow:ellipsis }
.meq2 .cli small{ display:block; font-weight:500; color:var(--silver); font-size:10px }
.meq2.dense .cli small{ display:none }
.meq2 .cli .rev{ font-size:11px }
.meq2 .p2{ display:inline-block; width:13px; height:13px; border-radius:50%; line-height:12px; font-size:9px; font-weight:800 }
.meq2 .p2.off{ border:1.5px dashed #CFCCC4; background:#fff }
.meq2 .p2.no{ background:#fff; border:1.5px solid #D89B94; color:#B4453B }
.meq2 .p2.hot{ box-shadow:0 0 0 2px var(--gold,#C9A961) }
.meq2 .comp{ display:inline-flex; align-items:center; gap:5px; font-variant-numeric:tabular-nums; font-weight:700; font-size:11px; color:#5b6470 }
.meq2 .bar{ width:30px; height:4px; border-radius:2px; background:#EEECE6; overflow:hidden; display:inline-block }
.meq2 .bar i{ display:block; height:100%; background:var(--gold,#C9A961) }
.meq2 .pot{ font-size:10px; font-weight:800; color:#8f5636; background:#F6EBE2; border-radius:5px; padding:2px 6px; white-space:nowrap }
.meq2 .potv{ color:#D6D3CC }
.meq2 .legend{ font-size:10px; color:var(--silver); padding:7px 12px; border-top:1px solid #F4F2ED }
.meq2 .empty{ padding:20px; text-align:center; color:var(--silver) }
.meq2 .err{ color:#B4453B }
.meq2 .drawer{ width:265px; flex-shrink:0; background:#fff; border:1px solid rgba(201,169,97,.45); border-radius:13px; padding:13px; box-shadow:0 6px 22px rgba(201,169,97,.14); position:sticky; top:10px }
.meq2 .dhd{ display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px }
.meq2 .dhd h4{ margin:0; font-size:14px; color:var(--navy,#0A1628) }
.meq2 .dsub{ font-size:10.5px; color:var(--silver) }
.meq2 .x{ border:none; background:#F4F2ED; border-radius:7px; width:22px; height:22px; cursor:pointer; color:#5b6470 }
.meq2 .warn{ background:#FBECEC; color:#B4453B; border-radius:8px; padding:6px 8px; font-size:11px; font-weight:600; margin-bottom:8px }
.meq2 .dsec{ font-size:9.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--silver); font-weight:750; margin:10px 0 4px }
.meq2 .drow{ display:flex; align-items:center; gap:6px; padding:3.5px 0; border-bottom:1px solid #F7F5F1; font-size:12px }
.meq2 .drow:last-of-type{ border-bottom:none }
.meq2 .dfam{ flex:1; font-weight:600 }
.meq2 .st{ font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:999px; white-space:nowrap }
.meq2 .st.ok{ background:#E7F3EC; color:#2C6B4E }
.meq2 .st.no{ background:#FBECEC; color:#B4453B }
.meq2 .st.miss{ background:#F4F3EF; color:var(--silver) }
.meq2 .dactions{ display:flex; gap:3px }
.meq2 .dactions button{ border:1px solid var(--line); background:#fff; border-radius:6px; width:21px; height:21px; font-size:10.5px; cursor:pointer; color:#5b6470; line-height:1 }
.meq2 .dactions button:hover{ border-color:var(--gold,#C9A961); color:var(--gold-dk,#A6843F) }
.meq2 .sugg{ margin-top:10px; background:#FBF4E4; border:1px solid rgba(201,169,97,.5); border-radius:10px; padding:9px; font-size:11.5px; color:#6b5620 }
.meq2 .sugg b{ color:var(--gold-dk,#A6843F) }
.meq2 .sraison{ margin-top:4px; font-size:10.5px; color:#8a7a4e }
.meq2 .scopy{ margin-top:7px; width:100%; border:1px solid rgba(201,169,97,.6); background:#fff; border-radius:8px; padding:6px; font-size:11px; font-weight:700; color:var(--gold-dk,#A6843F); cursor:pointer }
.meq2 .tl{ max-height:130px; overflow-y:auto }
.meq2 .tli{ display:flex; gap:6px; align-items:baseline; font-size:11px; padding:2.5px 0; border-bottom:1px solid #F7F5F1 }
.meq2 .tli .td{ color:var(--silver); font-variant-numeric:tabular-nums; white-space:nowrap }
.meq2 .tli .tp{ flex:1; font-weight:600 }
.meq2 .tli .tm{ color:#5b6470; white-space:nowrap }
.meq2 .dbtns{ margin-top:11px }
.meq2 .dbtns .pri{ width:100%; background:var(--navy,#0A1628); color:#fff; border:none; border-radius:9px; padding:9px; font-size:12.5px; font-weight:700; cursor:pointer }
@media(max-width:900px){ .meq2 .layout{ flex-direction:column } .meq2 .drawer{ width:100%; position:static } }
`
