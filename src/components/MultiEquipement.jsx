// ═══════════════════════════════════════════════════════════════════════════
// MULTI-ÉQUIPEMENT
//
// Vue de pilotage cross-sell : par client, les familles de produits détenues
// (deals signés + équipements déclarés), les KPIs d'équipement, et les
// opportunités priorisées (clients mono ou sous-équipés à fort potentiel).
//
// Périmètre : la vue SQL `client_equipment` est en security_invoker, donc la
// RLS applique le périmètre (manager = tous, conseiller = ses clients).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { listEquipment, listFamilies } from '../services/equipment'
import { suggestionPour, estFortPotentiel, estTnsOuLiberal } from '../config/multiEquipementRules'

const fmtEur = (v) =>
  Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

// Depuis un hex #RRGGBB, fabrique un fond très clair et une bordure douce.
const tint = (hex) => (hex ? `${hex}14` : '#EEE')
const border = (hex) => (hex ? `${hex}33` : '#DDD')

function nomClient(c) {
  const n = `${c.prenom || ''} ${c.nom || ''}`.trim()
  return n || '(sans nom)'
}

export default function MultiEquipement({ profile }) {
  const isManager = profile?.role === 'manager'
  const [rows, setRows] = useState([])
  const [families, setFamilies] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  // Filtres
  const [fCons, setFCons] = useState('all')
  const [fNb, setFNb] = useState('all')
  const [fDetenu, setFDetenu] = useState('all')
  const [fManquant, setFManquant] = useState('all')

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const [eq, fam] = await Promise.all([listEquipment(), listFamilies()])
        if (!vivant) return
        setFamilies(fam)
        // Normalise chaque ligne pour l'affichage et les règles.
        setRows(
          eq.map((c) => ({
            client_id: c.client_id,
            nom: nomClient(c),
            profession: c.profession || '',
            statut: c.statut_pro || '',
            advisor_code: c.advisor_code || '—',
            revenus: Number(c.revenus_annuels || 0),
            patrimoine: Number(c.patrimoine_estime || 0),
            familles: Array.isArray(c.familles) ? c.familles : [],
            absences: Array.isArray(c.absences_confirmees) ? c.absences_confirmees : [],
            nb: Number(c.nb_familles || 0),
            dernier: c.dernier_deal_signe || null,
          })),
        )
      } catch (e) {
        if (vivant) setErr(e.message || 'Erreur de chargement')
      } finally {
        if (vivant) setLoading(false)
      }
    })()
    return () => { vivant = false }
  }, [])

  // Dictionnaire famille -> { label, couleur }
  const famMap = useMemo(() => {
    const m = {}
    families.forEach((f) => { m[f.key] = f })
    return m
  }, [families])

  const labelFam = (k) => famMap[k]?.label || k
  const couleurFam = (k) => famMap[k]?.couleur || '#8A95A8'

  // Liste des conseillers présents (pour le filtre manager)
  const conseillers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.advisor_code).filter((x) => x && x !== '—'))).sort(),
    [rows],
  )

  // KPIs (sur le périmètre visible, avant filtres de tableau)
  const kpis = useMemo(() => {
    const total = rows.length
    const dist = { z: 0, un: 0, deux: 0, trois: 0 }
    let somme = 0
    rows.forEach((r) => {
      somme += r.nb
      if (r.nb === 0) dist.z++
      else if (r.nb === 1) dist.un++
      else if (r.nb === 2) dist.deux++
      else dist.trois++
    })
    const multi = dist.deux + dist.trois
    return {
      total,
      multi,
      tauxMulti: total ? Math.round((100 * multi) / total) : 0,
      moy: total ? (somme / total) : 0,
      mono: dist.un,
      dist,
    }
  }, [rows])

  // Application des filtres au tableau
  const rowsFiltrees = useMemo(() => {
    return rows.filter((r) => {
      if (fCons !== 'all' && r.advisor_code !== fCons) return false
      if (fNb !== 'all') {
        if (fNb === '3' && r.nb < 3) return false
        if (fNb !== '3' && r.nb !== Number(fNb)) return false
      }
      if (fDetenu !== 'all' && !r.familles.includes(fDetenu)) return false
      if (fManquant !== 'all' && r.familles.includes(fManquant)) return false
      return true
    }).sort((a, b) => b.nb - a.nb || b.revenus - a.revenus)
  }, [rows, fCons, fNb, fDetenu, fManquant])

  // Opportunités : clients avec une suggestion, fort potentiel d'abord
  const opportunites = useMemo(() => {
    return rows
      .map((r) => ({ r, sug: suggestionPour(r), fort: estFortPotentiel(r) }))
      .filter((o) => o.sug)
      .sort((a, b) => (b.fort - a.fort) || (b.r.revenus - a.r.revenus))
      .slice(0, 12)
  }, [rows])

  const maxBar = Math.max(kpis.dist.z, kpis.dist.un, kpis.dist.deux, kpis.dist.trois, 1)

  return (
    <div className="meq">
      <style>{styles}</style>

      <div className="meq-head">
        <div>
          <h1 className="meq-title">Multi-équipement</h1>
          <div className="meq-sub">Équipement produit par client et opportunités de cross-sell · {kpis.total} clients</div>
        </div>
        <div className="meq-scope"><span className="dot" /> {isManager ? 'Vue cabinet (tous conseillers)' : 'Mes clients'}</div>
      </div>

      {loading && <div className="meq-empty">Chargement…</div>}
      {err && <div className="meq-empty meq-err">Erreur : {err}</div>}

      {!loading && !err && (
        <>
          {/* Bandeau KPIs */}
          <div className="meq-kpis">
            <div className="kpi primary">
              <div className="lab">Taux multi-équipement</div>
              <div className="val">{kpis.tauxMulti} %</div>
              <div className="hint">{kpis.multi} clients avec ≥ 2 familles</div>
            </div>
            <div className="kpi">
              <div className="lab">Produits moyens / client</div>
              <div className="val">{kpis.moy.toFixed(2).replace('.', ',')}</div>
              <div className="hint">objectif interne : 2,0</div>
            </div>
            <div className="kpi">
              <div className="lab">Clients mono-équipés</div>
              <div className="val">{kpis.mono}</div>
              <div className="hint">cibles cross-sell prioritaires</div>
            </div>
            <div className="kpi">
              <div className="lab">Répartition</div>
              <div className="bars">
                {[['0', kpis.dist.z], ['1', kpis.dist.un], ['2', kpis.dist.deux], ['3+', kpis.dist.trois]].map(([cap, n], i) => (
                  <div key={cap} className={`barcol${i === 2 || i === 3 ? ' g' : ''}`}>
                    <span className="bval">{n}</span>
                    <div className="bar" style={{ height: `${Math.max(6, (100 * n) / maxBar)}%` }} />
                    <span className="bcap">{cap}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filtres */}
          <div className="meq-filters">
            {isManager && (
              <label className="flt">Conseiller
                <select value={fCons} onChange={(e) => setFCons(e.target.value)}>
                  <option value="all">Tous</option>
                  {conseillers.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
            <label className="flt">Nb produits
              <select value={fNb} onChange={(e) => setFNb(e.target.value)}>
                <option value="all">Tous</option>
                <option value="0">0 (aucun)</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3 et +</option>
              </select>
            </label>
            <label className="flt">Produit détenu
              <select value={fDetenu} onChange={(e) => setFDetenu(e.target.value)}>
                <option value="all">Tous</option>
                {families.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <label className="flt key">Produit manquant
              <select value={fManquant} onChange={(e) => setFManquant(e.target.value)}>
                <option value="all">Tous</option>
                {families.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <span className="flt-star">★ le filtre le plus utile : « tous les clients sans prévoyance »</span>
          </div>

          {/* Tableau */}
          <div className="meq-tablewrap">
            <div className="meq-tablescroll">
              <table className="meq-table">
                <thead>
                  <tr>
                    <th>Client</th><th>Conseiller</th><th>Profession</th>
                    <th className="r">Revenus</th><th>Équipement (familles)</th>
                    <th className="r">Nb</th><th className="r">Dernier deal</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFiltrees.map((r) => {
                    const sug = suggestionPour(r)
                    return (
                      <tr key={r.client_id}>
                        <td className="cli">{r.nom}{estTnsOuLiberal(r) && <small>{r.statut || 'TNS / libéral'}</small>}</td>
                        <td><span className="cadre">{r.advisor_code}</span></td>
                        <td className="prof">{r.profession || '—'}</td>
                        <td className="rev">{r.revenus ? fmtEur(r.revenus) : '—'}</td>
                        <td>
                          <div className="badges">
                            {r.familles.length === 0 && <span className="bdg none">Aucun recensé</span>}
                            {r.familles.map((k) => (
                              <span key={k} className="bdg" style={{ color: couleurFam(k), background: tint(couleurFam(k)), borderColor: border(couleurFam(k)) }}>{labelFam(k)}</span>
                            ))}
                            {sug && !r.familles.includes(sug.famille_suggeree) && (
                              <span className="bdg miss">+ {labelFam(sug.famille_suggeree)} ?</span>
                            )}
                          </div>
                        </td>
                        <td className="r"><span className={`nb n${r.nb >= 3 ? 3 : r.nb}`}>{r.nb}</span></td>
                        <td className="r"><span className="dt">{r.dernier || '—'}</span></td>
                      </tr>
                    )
                  })}
                  {rowsFiltrees.length === 0 && (
                    <tr><td colSpan={7} className="meq-empty">Aucun client pour ces filtres.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Opportunités */}
          <div className="meq-opps">
            <h3>💡 Opportunités prioritaires</h3>
            <p className="osub">Clients mono ou sous-équipés à fort potentiel, avec le produit suivant logique (règles configurables dans multiEquipementRules.js).</p>
            {opportunites.length === 0 && <div className="meq-empty">Aucune opportunité détectée sur ce périmètre.</div>}
            <div className="opp-grid">
              {opportunites.map(({ r, sug, fort }) => (
                <div key={r.client_id} className="opp">
                  {fort && <span className="prio">POTENTIEL ÉLEVÉ</span>}
                  <div className="oname">{r.nom}</div>
                  <div className="ometa">{r.profession || '—'}{r.revenus ? ` · ${fmtEur(r.revenus)}` : ''} · {r.advisor_code}</div>
                  <div className="oflow">
                    {r.familles.length === 0
                      ? <span className="bdg none">Aucun produit</span>
                      : r.familles.map((k) => <span key={k} className="bdg" style={{ color: couleurFam(k), background: tint(couleurFam(k)), borderColor: border(couleurFam(k)) }}>{labelFam(k)}</span>)}
                    <span className="arrow">→</span>
                    <span className="propose">{sug.label}</span>
                  </div>
                  <div className="reason">{sug.raison}</div>
                  {/* Bouton « Créer le deal » : le préremplissage sera branché avec l'encart fiche client (étape suivante). */}
                  <button className="cta" type="button" disabled title="Bientôt : ouvre un deal prérempli">Créer le deal</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Styles scoependants sur la charte (variables CSS globales --navy / --gold).
const styles = `
.meq{ --line:#ECEAE4; --surface:#fff; --silver:#8A95A8; --ink:#1D1D1F;
  color:var(--ink); font-size:13px; line-height:1.45; }
.meq *{ box-sizing:border-box; }
.meq-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:18px; }
.meq-title{ font-size:24px; font-weight:700; letter-spacing:-.02em; color:var(--navy,#0A1628); margin:0; }
.meq-sub{ color:var(--silver); font-size:12.5px; margin-top:3px; }
.meq-scope{ display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:7px 12px; font-size:12.5px; font-weight:600; color:var(--navy,#0A1628); }
.meq-scope .dot{ width:7px; height:7px; border-radius:50%; background:var(--gold,#C9A961); }
.meq-empty{ padding:22px; text-align:center; color:var(--silver); font-size:13px; }
.meq-err{ color:#B4453B; }
.meq-kpis{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
.meq .kpi{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:15px 16px; box-shadow:0 1px 2px rgba(10,22,40,.04); }
.meq .kpi.primary{ border-color:rgba(201,169,97,.4); box-shadow:0 4px 18px rgba(201,169,97,.14); }
.meq .kpi .lab{ font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--silver); font-weight:600; }
.meq .kpi .val{ font-size:28px; font-weight:750; letter-spacing:-.02em; color:var(--navy,#0A1628); margin-top:6px; line-height:1; }
.meq .kpi.primary .val{ color:var(--gold-dk,#A6843F); }
.meq .kpi .hint{ font-size:11.5px; color:var(--silver); margin-top:5px; }
.meq .kpi .bars{ display:flex; align-items:flex-end; gap:8px; height:46px; margin-top:8px; }
.meq .barcol{ flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; justify-content:flex-end; }
.meq .bar{ width:100%; border-radius:5px 5px 0 0; background:var(--navy,#0A1628); opacity:.85; }
.meq .barcol.g .bar{ background:var(--gold,#C9A961); opacity:1; }
.meq .bcap{ font-size:10px; color:var(--silver); font-weight:600; }
.meq .bval{ font-size:11px; color:var(--ink); font-weight:700; }
.meq-filters{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:10px 12px; margin-bottom:14px; }
.meq .flt{ display:inline-flex; align-items:center; gap:6px; border:1px solid var(--line); border-radius:9px; padding:5px 8px 5px 10px; font-size:12px; font-weight:600; color:var(--navy,#0A1628); background:#fff; }
.meq .flt select{ border:none; background:transparent; font-size:12px; font-weight:600; color:var(--navy,#0A1628); cursor:pointer; outline:none; }
.meq .flt.key{ border-color:var(--gold,#C9A961); background:#FBF4E4; color:var(--gold-dk,#A6843F); }
.meq .flt.key select{ color:var(--gold-dk,#A6843F); }
.meq .flt-star{ margin-left:auto; font-size:11.5px; color:var(--silver); }
.meq-tablewrap{ background:var(--surface); border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:0 1px 2px rgba(10,22,40,.04); }
.meq-tablescroll{ overflow-x:auto; }
.meq-table{ width:100%; border-collapse:collapse; min-width:720px; }
.meq-table thead th{ font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--silver); font-weight:700; text-align:left; padding:11px 14px; border-bottom:1px solid var(--line); background:#FCFBF9; white-space:nowrap; }
.meq-table thead th.r{ text-align:right; }
.meq-table tbody td{ padding:11px 14px; border-bottom:1px solid #F4F2ED; vertical-align:middle; }
.meq-table tbody tr:last-child td{ border-bottom:none; }
.meq-table tbody tr:hover{ background:#FCFBF6; }
.meq .cli{ font-weight:650; color:var(--ink); }
.meq .cli small{ display:block; color:var(--silver); font-weight:500; font-size:11px; margin-top:1px; }
.meq .prof{ color:#5b6470; }
.meq .cadre{ display:inline-block; font-size:11px; font-weight:700; color:var(--navy,#0A1628); background:#EEF0F3; border-radius:6px; padding:2px 7px; }
.meq .rev{ font-variant-numeric:tabular-nums; font-weight:650; text-align:right; }
.meq .r{ text-align:right; }
.meq .badges{ display:flex; gap:5px; flex-wrap:wrap; }
.meq .bdg{ font-size:10.5px; font-weight:700; padding:3px 8px; border-radius:999px; white-space:nowrap; border:1px solid transparent; }
.meq .bdg.none{ background:#F4F3EF; color:var(--silver); border-color:#E7E5DF; font-weight:600; }
.meq .bdg.miss{ background:#fff; color:var(--silver); border:1px dashed #D6D3CC; font-weight:600; }
.meq .nb{ display:inline-flex; align-items:center; justify-content:center; min-width:24px; height:24px; border-radius:7px; font-weight:750; font-size:12.5px; font-variant-numeric:tabular-nums; }
.meq .nb.n0{ background:#F1F0EC; color:#8A95A8; }
.meq .nb.n1{ background:#FBECEC; color:#B4453B; }
.meq .nb.n2{ background:#FBF4E4; color:#8A6A2F; }
.meq .nb.n3{ background:#E7F3EC; color:#2C6B4E; }
.meq .dt{ color:var(--silver); font-size:11.5px; font-variant-numeric:tabular-nums; white-space:nowrap; }
.meq-opps{ margin-top:20px; }
.meq-opps h3{ font-size:15px; font-weight:700; color:var(--navy,#0A1628); margin:0 0 3px; }
.meq-opps .osub{ color:var(--silver); font-size:12px; margin:0 0 12px; }
.meq .opp-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.meq .opp{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:9px; box-shadow:0 1px 2px rgba(10,22,40,.04); position:relative; }
.meq .opp .prio{ position:absolute; top:12px; right:12px; font-size:10px; font-weight:800; letter-spacing:.04em; color:#8f5636; background:#F6EBE2; border-radius:6px; padding:2px 7px; }
.meq .opp .oname{ font-weight:700; color:var(--ink); font-size:13.5px; padding-right:80px; }
.meq .opp .ometa{ color:var(--silver); font-size:11.5px; margin-top:-4px; }
.meq .opp .oflow{ display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
.meq .opp .arrow{ color:var(--silver); font-weight:800; }
.meq .opp .propose{ font-size:11px; font-weight:800; padding:3px 9px; border-radius:999px; border:1.5px solid var(--gold,#C9A961); color:var(--gold-dk,#A6843F); background:#FBF4E4; }
.meq .opp .reason{ font-size:11.5px; color:#5b6470; background:#F6F5F1; border-radius:8px; padding:7px 9px; }
.meq .opp .cta{ margin-top:2px; align-self:flex-start; font-size:11.5px; font-weight:700; color:#fff; background:var(--navy,#0A1628); border:none; border-radius:8px; padding:6px 12px; cursor:not-allowed; opacity:.85; }
@media(max-width:820px){ .meq-kpis{ grid-template-columns:repeat(2,1fr); } .meq .opp-grid{ grid-template-columns:1fr; } }
`
