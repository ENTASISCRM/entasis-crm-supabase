// src/components/CockpitRatios.jsx
// Cockpit conseillers (idee 85) : un tableau de bord de ratios par conseiller.
// Le manager voit tout le cabinet (une carte par conseiller), le conseiller
// ne voit que la sienne. Chaque carte compare le conseiller a SA propre
// moyenne des mois precedents, jamais aux autres : pas de palmares humiliant,
// on respecte la confidentialite de la Remuneration.
//
// Par conseiller, sur le mois courant et les 3 mois precedents :
//   collecte (pu plus pp_m fois douze des dossiers signes), avec sparkline
//   nombre de deals signes du mois
//   nombre de clients du portefeuille
//   taux de multi equipement du portefeuille (via client_equipment)
//   missions cross sell gagnees ce mois (me_missions statut gagnee)
//   missions reportees en cours
//
// Donnees : services/ratios.js (RLS = perimetre) plus profiles.listTeam pour
// les noms. Charte navy et or.

import { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { loadCockpit, computeCockpit } from '../services/ratios'
import { listTeam } from '../services/profiles'
import { euro } from '../lib/ui-shared'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

// YYYY-MM vers un libelle court de mois (juin, juil, aout...).
function moisCourt(ym) {
  const [y, m] = String(ym).split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
}

// Petit graphe de collecte sur la fenetre de mois. Or sur fond transparent,
// dernier point marque en navy, aucun axe (c est un sparkline).
function Sparkline({ serie, labels }) {
  const data = {
    labels,
    datasets: [{
      data: serie,
      borderColor: '#C9A961',
      backgroundColor: 'rgba(201,169,97,0.16)',
      borderWidth: 2,
      fill: true,
      tension: 0.35,
      pointRadius: serie.map((_, i) => (i === serie.length - 1 ? 3.5 : 0)),
      pointBackgroundColor: '#0A1628',
      pointBorderColor: '#0A1628',
    }],
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        callbacks: {
          title: (items) => items[0]?.label || '',
          label: (c) => euro(c.parsed.y),
        },
      },
    },
    scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
  }
  return <div className="spark"><Line data={data} options={options} /></div>
}

// Badge de comparaison a la moyenne personnelle. Vert au dessus, argent dans
// la moyenne, or fonce en dessous. Formulation encourageante, jamais un rang.
function DeltaBadge({ deltaPct }) {
  if (deltaPct == null) return <span className="delta neu">Premier mois de reference</span>
  if (deltaPct >= 5) return <span className="delta up">▲ {deltaPct} % vs ta moyenne</span>
  if (deltaPct <= -5) return <span className="delta down">▼ {Math.abs(deltaPct)} % sous ta moyenne</span>
  return <span className="delta neu">≈ dans ta moyenne</span>
}

function Carte({ ligne, labels, isManager }) {
  return (
    <div className="ck-carte">
      <div className="ck-hd">
        <div className="ck-qui">
          <span className="ck-nom">{ligne.nom}</span>
          {isManager && <span className="ck-code">{ligne.code}</span>}
        </div>
        <DeltaBadge deltaPct={ligne.deltaPct} />
      </div>

      <div className="ck-collecte">
        <div className="ck-big">{euro(ligne.collecteMois)}</div>
        <div className="ck-cap">collecte du mois · {ligne.nbDealsMois} dossier{ligne.nbDealsMois > 1 ? 's' : ''} signe{ligne.nbDealsMois > 1 ? 's' : ''}</div>
      </div>

      <div className="ck-spark">
        <Sparkline serie={ligne.serie} labels={labels} />
        <div className="ck-axes">
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      </div>

      <div className="ck-kpis">
        <div className="ck-kpi">
          <div className="kv">{ligne.nbClients}</div>
          <div className="kl">clients</div>
        </div>
        <div className="ck-kpi">
          <div className="kv">{ligne.tauxMulti} %</div>
          <div className="kl">multi equipement</div>
        </div>
        <div className="ck-kpi">
          <div className="kv vert">{ligne.gagneesMois}</div>
          <div className="kl">cross sell gagne</div>
        </div>
        <div className="ck-kpi">
          <div className={`kv ${ligne.reportees > 0 ? 'amb' : ''}`}>{ligne.reportees}</div>
          <div className="kl">missions reportees</div>
        </div>
      </div>
    </div>
  )
}

export default function CockpitRatios({ profile }) {
  const isManager = profile?.role === 'manager'
  const [state, setState] = useState({ loading: true, err: null, mois: [], lignes: [] })

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const [raw, team] = await Promise.all([
          loadCockpit(4),
          listTeam().catch(() => []),
        ])
        const { mois, moisCourant, lignes } = computeCockpit({
          ...raw, team, isManager, advisorCode: profile?.advisor_code,
        })
        if (vivant) setState({ loading: false, err: null, mois, moisCourant, lignes })
      } catch (e) {
        if (vivant) setState({ loading: false, err: e.message || 'Erreur de chargement', mois: [], lignes: [] })
      }
    })()
    return () => { vivant = false }
  }, [isManager, profile?.advisor_code])

  const labels = useMemo(() => state.mois.map(moisCourt), [state.mois])
  const cabinet = useMemo(() => ({
    collecte: state.lignes.reduce((s, l) => s + l.collecteMois, 0),
    conseillers: state.lignes.length,
    deals: state.lignes.reduce((s, l) => s + l.nbDealsMois, 0),
  }), [state.lignes])

  return (
    <div className="ckr">
      <style>{styles}</style>

      <div className="ck-top">
        <div>
          <h1>Cockpit conseillers</h1>
          <div className="ck-sub">
            {isManager ? 'les ratios du cabinet, conseiller par conseiller' : 'tes ratios du mois, face a ta propre moyenne'}
          </div>
        </div>
        {isManager && !state.loading && !state.err && state.lignes.length > 0 && (
          <div className="ck-cabinet">
            <div className="cbx">
              <div className="cbv">{euro(cabinet.collecte)}</div>
              <div className="cbl">collecte cabinet ce mois</div>
            </div>
            <div className="cbx">
              <div className="cbv">{cabinet.deals}</div>
              <div className="cbl">dossiers signes · {cabinet.conseillers} conseiller{cabinet.conseillers > 1 ? 's' : ''}</div>
            </div>
          </div>
        )}
      </div>

      <div className="ck-note">
        Chaque conseiller est compare a sa propre moyenne des mois precedents, jamais a ses pairs.
        La collecte additionne les versements uniques et les versements programmes annualises des dossiers signes.
      </div>

      {state.loading && <div className="ck-empty">Chargement…</div>}
      {state.err && <div className="ck-empty err">Erreur : {state.err}</div>}
      {!state.loading && !state.err && state.lignes.length === 0 && (
        <div className="ck-empty">Aucune donnee sur la periode.</div>
      )}

      {!state.loading && !state.err && state.lignes.length > 0 && (
        <div className={`ck-grid${state.lignes.length === 1 ? ' solo' : ''}`}>
          {state.lignes.map((l) => (
            <Carte key={l.code} ligne={l} labels={labels} isManager={isManager} />
          ))}
        </div>
      )}
    </div>
  )
}

const styles = `
.ckr{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; --navy:#0A1628; --gold:#C9A961; --gold-dk:#A6843F; --vert:#2C6B4E; color:var(--ink); font-size:13px }
.ckr *{ box-sizing:border-box }
.ckr .ck-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:10px }
.ckr h1{ font-size:22px; font-weight:700; color:var(--navy); margin:0; letter-spacing:-.02em }
.ckr .ck-sub{ color:var(--silver); font-size:12px; margin-top:2px }
.ckr .ck-cabinet{ display:flex; gap:8px }
.ckr .cbx{ background:var(--navy); border-radius:12px; padding:10px 16px; color:#fff; text-align:right }
.ckr .cbv{ font-size:19px; font-weight:800; color:var(--gold); letter-spacing:-.02em; font-variant-numeric:tabular-nums; line-height:1.1 }
.ckr .cbl{ font-size:10.5px; font-weight:600; opacity:.8; margin-top:2px }
.ckr .ck-note{ background:#FBF6EC; border:1px solid rgba(201,169,97,.4); border-radius:10px; padding:8px 12px; font-size:11.5px; color:#6b5620; margin-bottom:12px; line-height:1.45 }
.ckr .ck-empty{ padding:26px; text-align:center; color:var(--silver) }
.ckr .ck-empty.err{ color:#B4453B }

.ckr .ck-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px }
.ckr .ck-grid.solo{ grid-template-columns:minmax(0,460px) }
.ckr .ck-carte{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px 15px; box-shadow:0 1px 2px rgba(10,22,40,.04); display:flex; flex-direction:column }
.ckr .ck-hd{ display:flex; align-items:flex-start; justify-content:space-between; gap:8px }
.ckr .ck-qui{ display:flex; align-items:center; gap:7px; flex-wrap:wrap; min-width:0 }
.ckr .ck-nom{ font-weight:750; font-size:14.5px; color:var(--navy) }
.ckr .ck-code{ font-size:10px; font-weight:700; color:var(--silver); background:#F4F2ED; border-radius:5px; padding:1px 6px }
.ckr .delta{ font-size:10.5px; font-weight:750; border-radius:999px; padding:2px 9px; white-space:nowrap }
.ckr .delta.up{ background:#E9F4EE; color:var(--vert) }
.ckr .delta.down{ background:#FBF4E4; color:var(--gold-dk) }
.ckr .delta.neu{ background:#F4F2ED; color:#5b6470 }

.ckr .ck-collecte{ margin-top:10px }
.ckr .ck-big{ font-size:26px; font-weight:800; color:var(--navy); letter-spacing:-.02em; font-variant-numeric:tabular-nums; line-height:1.05 }
.ckr .ck-cap{ font-size:11px; color:var(--silver); margin-top:2px }

.ckr .ck-spark{ margin:12px 0 4px }
.ckr .spark{ height:56px }
.ckr .ck-axes{ display:flex; justify-content:space-between; margin-top:2px }
.ckr .ck-axes span{ font-size:9.5px; font-weight:600; color:var(--silver); text-transform:uppercase; letter-spacing:.03em }
.ckr .ck-axes span:last-child{ color:var(--gold-dk) }

.ckr .ck-kpis{ display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:12px; border-top:1px solid #F4F2ED; padding-top:11px }
.ckr .ck-kpi{ text-align:center }
.ckr .kv{ font-size:17px; font-weight:800; color:var(--navy); font-variant-numeric:tabular-nums; line-height:1.05 }
.ckr .kv.vert{ color:var(--vert) }
.ckr .kv.amb{ color:var(--gold-dk) }
.ckr .kl{ font-size:9px; font-weight:600; color:var(--silver); text-transform:uppercase; letter-spacing:.02em; margin-top:3px; line-height:1.2 }

@media(max-width:520px){
  .ckr .ck-kpis{ grid-template-columns:repeat(2,1fr); gap:10px }
  .ckr .ck-cabinet{ width:100% }
  .ckr .cbx{ flex:1 }
}
`
