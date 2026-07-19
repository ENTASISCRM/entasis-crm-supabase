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
import { loadCockpit, computeCockpit, listClientsCompletude, completudeParConseiller, completudeGlobale } from '../services/ratios'
import { listTeam } from '../services/profiles'
import { euro } from '../lib/ui-shared'
import toast from 'react-hot-toast'

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

// ─── Completude des fiches (constructeur 3) ──────────────────────────────────
// Bloc de visibilite manager : forcer la saisie des fiches (data capitale) par
// la transparence et la relance en amont du verrou de signature. Le manager voit
// un mini classement par conseiller trie du pire taux au meilleur ; le conseiller
// voit sa propre carte avec un lien vers l ecran Opportunites (fiches a completer).

// Couleur de la barre selon le taux : vert des 80 %, orange au dessus de 50 %,
// rouge en dessous. Rouge = semantique « manque » de la charte.
function couleurCompletude(pct) {
  if (pct >= 80) return '#2C6B4E'
  if (pct >= 50) return '#A6843F'
  return '#B4453B'
}

// Barre de progression coloree, largeur = part de fiches completes.
function BarreCompletude({ pct }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className="cmpl-bar" title={`${pct} % de fiches completes`}>
      <span style={{ width: `${p}%`, background: couleurCompletude(pct) }} />
    </div>
  )
}

// Amene le conseiller sur l onglet Opportunites (bloc fiches a completer) sans
// dependre d un routeur : on reutilise le bouton de navigation deja rendu par la
// sidebar. Si le bouton n est pas trouve, on guide au lieu de rester muet.
function allerAuxOpportunites() {
  const cible = Array.from(document.querySelectorAll('.nav-item'))
    .find((b) => (b.textContent || '').trim().startsWith('Opportunités'))
  if (cible) { cible.click(); return }
  toast('Ouvre l onglet Opportunites du menu pour completer tes fiches.')
}

// Manager : mini classement par conseiller, pire taux en tete (a relancer).
function ClassementCompletude({ rows, nomParCode, global }) {
  return (
    <>
      <div className="cmpl-cab">
        <BarreCompletude pct={global.pct} />
        <div className="cmpl-cab-txt">
          <b>{global.pct} %</b> des {global.total} fiches du cabinet completes
          {global.incompletes > 0 && <> · <span className="rouge">{global.incompletes} à compléter</span></>}
        </div>
      </div>
      <div className="cmpl-note-sec">Classement du taux le plus faible d abord : les conseillers a relancer sont en tete.</div>
      <div className="cmpl-table" role="table">
        <div className="cmpl-tr cmpl-th" role="row">
          <span role="columnheader">Conseiller</span>
          <span role="columnheader">Complétude</span>
          <span role="columnheader" className="num">À compléter</span>
        </div>
        {rows.map((r) => (
          <div className="cmpl-tr" role="row" key={r.code}>
            <span className="cmpl-nom" role="cell">
              <span className="cmpl-nom-txt">{nomParCode.get(r.code) || r.code}</span>
              {r.sansNaissance > 0 && (
                <em className="cmpl-bonus" title="Date de naissance recommandee pour les anniversaires">
                  {r.sansNaissance} sans date de naiss.
                </em>
              )}
            </span>
            <span className="cmpl-cell-bar" role="cell">
              <BarreCompletude pct={r.pct} />
              <b style={{ color: couleurCompletude(r.pct) }}>{r.pct} %</b>
            </span>
            <span className={`num ${r.incompletes > 0 ? 'rouge' : 'ok'}`} role="cell">{r.incompletes}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// Conseiller : sa propre carte, avec lien vers Opportunites.
function CarteMesFiches({ global }) {
  const pct = global.pct
  if (global.total === 0) {
    return <div className="ck-empty">Aucune fiche a ton portefeuille pour l instant.</div>
  }
  return (
    <div className="cmpl-moi">
      <div className="cmpl-moi-hd">
        <div className="cmpl-moi-pct" style={{ color: couleurCompletude(pct) }}>{pct} %</div>
        <div className="cmpl-moi-txt">
          <div className="cmpl-moi-l1">Tes fiches : {pct}% complètes</div>
          <div className="cmpl-moi-l2">
            {global.incompletes > 0
              ? <><b className="rouge">{global.incompletes}</b> à compléter sur {global.total}</>
              : <>Tes {global.total} fiche{global.total > 1 ? 's' : ''} sont complètes, bravo.</>}
          </div>
        </div>
      </div>
      <BarreCompletude pct={pct} />
      {global.incompletes > 0 && (
        <button type="button" className="cmpl-cta" onClick={allerAuxOpportunites}>
          Compléter mes fiches dans Opportunités →
        </button>
      )}
      {global.sansNaissance > 0 && (
        <div className="cmpl-bonus-note">
          {global.sansNaissance} fiche{global.sansNaissance > 1 ? 's' : ''} sans date de naissance (recommandé pour les anniversaires).
        </div>
      )}
    </div>
  )
}

// Le bloc complet. Charge ses propres donnees (fiches plus noms d equipe), en
// parallele et independamment du reste du cockpit. RLS = perimetre.
function SectionCompletude({ isManager }) {
  const [st, setSt] = useState({ loading: true, err: null, clients: [], team: [] })

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const [clients, team] = await Promise.all([
          listClientsCompletude(),
          listTeam().catch(() => []),
        ])
        if (vivant) setSt({ loading: false, err: null, clients, team })
      } catch (e) {
        if (vivant) setSt({ loading: false, err: e.message || 'Erreur de chargement', clients: [], team: [] })
      }
    })()
    return () => { vivant = false }
  }, [])

  const nomParCode = useMemo(() => new Map((st.team || []).map((p) => [p.advisor_code, p.full_name])), [st.team])
  const rows = useMemo(() => completudeParConseiller(st.clients), [st.clients])
  const global = useMemo(() => completudeGlobale(st.clients), [st.clients])

  return (
    <div className="cmpl">
      <style>{stylesCompletude}</style>
      <div className="cmpl-hd">
        <h2>Complétude des fiches</h2>
        <div className="cmpl-why">Une fiche complète = un dossier signable et des opportunités de vente chiffrées.</div>
      </div>

      {st.loading && <div className="ck-empty">Chargement…</div>}
      {st.err && <div className="ck-empty err">Erreur : {st.err}</div>}

      {!st.loading && !st.err && (
        isManager
          ? (rows.length === 0
              ? <div className="ck-empty">Aucune fiche sur le perimetre.</div>
              : <ClassementCompletude rows={rows} nomParCode={nomParCode} global={global} />)
          : <CarteMesFiches global={global} />
      )}
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

      <SectionCompletude isManager={isManager} />
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

// Styles du bloc Completude des fiches. Scopes sous .cmpl, charte navy et or,
// rouge #B4453B pour la semantique « manque ».
const stylesCompletude = `
.ckr .cmpl{ margin-top:22px; border-top:1px solid #ECEAE4; padding-top:16px }
.ckr .cmpl h2{ font-size:16px; font-weight:750; color:#0A1628; margin:0; letter-spacing:-.01em }
.ckr .cmpl-hd{ margin-bottom:12px }
.ckr .cmpl-why{ font-size:11.5px; color:#8A95A8; margin-top:3px }
.ckr .cmpl .rouge{ color:#B4453B; font-weight:750 }
.ckr .cmpl-bar{ position:relative; height:8px; background:#F0EEE8; border-radius:999px; overflow:hidden; min-width:60px }
.ckr .cmpl-bar>span{ position:absolute; left:0; top:0; bottom:0; border-radius:999px; transition:width .3s ease }

.ckr .cmpl-cab{ display:flex; align-items:center; gap:14px; background:#fff; border:1px solid #ECEAE4; border-radius:12px; padding:12px 14px; margin-bottom:8px }
.ckr .cmpl-cab .cmpl-bar{ flex:1 }
.ckr .cmpl-cab-txt{ font-size:12px; color:#1D1D1F; white-space:nowrap }
.ckr .cmpl-cab-txt b{ color:#0A1628; font-variant-numeric:tabular-nums }
.ckr .cmpl-note-sec{ font-size:11px; color:#8A95A8; margin:0 2px 8px }

.ckr .cmpl-table{ border:1px solid #ECEAE4; border-radius:12px; overflow:hidden; background:#fff }
.ckr .cmpl-tr{ display:grid; grid-template-columns:1.4fr 1.7fr auto; align-items:center; gap:12px; padding:10px 14px; border-top:1px solid #F4F2ED }
.ckr .cmpl-tr:first-child{ border-top:0 }
.ckr .cmpl-th{ background:#FAF8F3; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:#8A95A8 }
.ckr .cmpl-th .num{ text-align:right }
.ckr .cmpl-nom{ display:flex; flex-direction:column; gap:1px; min-width:0 }
.ckr .cmpl-nom-txt{ font-size:13px; font-weight:650; color:#0A1628; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.ckr .cmpl-bonus{ font-style:normal; font-size:9.5px; font-weight:600; color:#A6843F }
.ckr .cmpl-cell-bar{ display:flex; align-items:center; gap:9px }
.ckr .cmpl-cell-bar .cmpl-bar{ flex:1 }
.ckr .cmpl-cell-bar b{ font-size:12px; font-variant-numeric:tabular-nums; min-width:36px; text-align:right }
.ckr .cmpl .num{ font-size:14px; font-weight:800; text-align:right; font-variant-numeric:tabular-nums }
.ckr .cmpl .num.ok{ color:#2C6B4E }

.ckr .cmpl-moi{ background:#fff; border:1px solid #ECEAE4; border-radius:14px; padding:16px; max-width:460px; box-shadow:0 1px 2px rgba(10,22,40,.04) }
.ckr .cmpl-moi-hd{ display:flex; align-items:center; gap:14px; margin-bottom:12px }
.ckr .cmpl-moi-pct{ font-size:34px; font-weight:800; letter-spacing:-.02em; font-variant-numeric:tabular-nums; line-height:1 }
.ckr .cmpl-moi-l1{ font-size:15px; font-weight:750; color:#0A1628 }
.ckr .cmpl-moi-l2{ font-size:12px; color:#5b6470; margin-top:3px }
.ckr .cmpl-moi-l2 b{ font-variant-numeric:tabular-nums }
.ckr .cmpl-cta{ margin-top:12px; width:100%; border:0; border-radius:10px; background:#0A1628; color:#fff; font-weight:700; font-size:12.5px; padding:11px 12px; cursor:pointer }
.ckr .cmpl-cta:hover{ background:#142438 }
.ckr .cmpl-bonus-note{ margin-top:9px; font-size:11px; color:#A6843F }

@media(max-width:520px){
  .ckr .cmpl-tr{ grid-template-columns:1.2fr 1.5fr auto; gap:8px; padding:10px }
  .ckr .cmpl-cab-txt{ white-space:normal }
}
`
