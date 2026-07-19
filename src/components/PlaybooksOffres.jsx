// ═══════════════════════════════════════════════════════════════════════════
// PLAYBOOKS OFFRES  vague C
//
// Un catalogue d offres commerciales branche sur la vraie base. Chaque offre
// compte sa cible EN DIRECT sur le portefeuille visible (RLS : manager voit
// tout, conseiller voit ses clients) et sait generer les missions
// correspondantes dans le moteur V3 Multi equipement.
//
// Le coeur de chaque carte : « {n} clients cibles · ~{n x ticket} € de
// potentiel ». Le bouton Lancer la campagne cree une mission a_attaquer par
// client cible sans mission existante sur la famille ; Voir les clients deplie
// la liste des cibles avec le motif de ciblage.
//
// Donnees : config/offres.js (les 8 offres) + services/offres.js (calcul et
// generation) + product_families (libelle et couleur du badge famille).
// Aucun envoi mail, aucune ecriture hors me_missions.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { listFamilies } from '../services/equipment'
import { chargerClientsEnrichis, ciblesDe, genererMissions } from '../services/offres'
import { OFFRES } from '../config/offres'

const fmtEur = (v) =>
  Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtK = (v) => (v >= 1000 ? `${Math.round(v / 1000)} k€` : `${Math.round(v)} €`)

// Motif de ciblage d un client pour une offre, tolerant a une data incomplete.
function motifDe(offre, c) {
  if (typeof offre.motif !== 'function') return ''
  try { return offre.motif(c) || '' } catch { return '' }
}

export default function PlaybooksOffres({ profile }) {
  const isManager = profile?.role === 'manager'
  const [clients, setClients] = useState([])
  const [families, setFamilies] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [cons, setCons] = useState('all')          // filtre conseiller (manager)
  const [ouvert, setOuvert] = useState(null)       // id de l offre dont la liste est depliee
  const [lancement, setLancement] = useState(null) // id de l offre en cours de generation

  async function reload() {
    const [cl, fam] = await Promise.all([chargerClientsEnrichis(), listFamilies()])
    setClients(cl)
    setFamilies(fam)
  }
  useEffect(() => {
    let vivant = true
    ;(async () => {
      try { await reload() } catch (e) { if (vivant) setErr(e.message || 'Erreur de chargement') }
      finally { if (vivant) setLoading(false) }
    })()
    return () => { vivant = false }
  }, [])

  const famMap = useMemo(() => Object.fromEntries(families.map((f) => [f.key, f])), [families])
  const labelFam = (k) => famMap[k]?.label || k
  const couleurFam = (k) => famMap[k]?.couleur || '#8A95A8'

  const conseillers = useMemo(
    () => Array.from(new Set(clients.map((c) => c.advisor_code).filter(Boolean))).sort(),
    [clients],
  )
  const visibles = useMemo(
    () => (cons === 'all' ? clients : clients.filter((c) => c.advisor_code === cons)),
    [clients, cons],
  )

  // Calcul en direct : cibles et potentiel par offre sur le portefeuille
  // visible, tri fort potentiel d abord (les offres a fort potentiel en avant).
  const cartes = useMemo(() => {
    return OFFRES
      .map((offre) => {
        const cibles = ciblesDe(offre, visibles)
        const n = cibles.length
        const potentiel = n * (offre.ticket_estime || 0)
        return { offre, cibles, n, potentiel }
      })
      .sort((a, b) => b.potentiel - a.potentiel)
  }, [visibles])

  const maxPotentiel = useMemo(() => cartes.reduce((m, c) => Math.max(m, c.potentiel), 0), [cartes])
  const totalPotentiel = useMemo(() => cartes.reduce((s, c) => s + c.potentiel, 0), [cartes])
  const nbClients = visibles.length

  async function lancer(carte) {
    const { offre, cibles, n, potentiel } = carte
    if (n === 0) { toast('Aucun client cible pour cette offre sur ce portefeuille'); return }
    const ok = window.confirm(
      `Lancer la campagne « ${offre.titre} » ?\n\n`
      + `${n} client${n > 1 ? 's' : ''} cible${n > 1 ? 's' : ''} · ~${fmtEur(potentiel)} de potentiel.\n`
      + `Une mission ${labelFam(offre.famille_cible)} sera creee pour chaque client sans mission existante sur cette famille.`,
    )
    if (!ok) return
    setLancement(offre.id)
    try {
      const crees = await genererMissions(offre, cibles)
      if (crees > 0) {
        toast.success(`${crees} mission${crees > 1 ? 's' : ''} creee${crees > 1 ? 's' : ''}, retrouve les dans Multi equipement`)
      } else {
        toast('Aucune nouvelle mission : ces clients ont deja une mission sur cette famille')
      }
    } catch (e) {
      toast.error(e.message || 'Echec du lancement de la campagne')
    } finally {
      setLancement(null)
    }
  }

  return (
    <div className="pbo">
      <style>{styles}</style>

      <div className="hd">
        <div>
          <h1>Offres et Playbooks</h1>
          <div className="sub">le catalogue commercial, branche sur votre portefeuille</div>
        </div>
        <div className="kpi">
          <span className="v">~{fmtEur(totalPotentiel)}</span>
          <span className="l">de potentiel sur {nbClients} client{nbClients > 1 ? 's' : ''} · {OFFRES.length} campagnes</span>
        </div>
      </div>

      {isManager && conseillers.length > 0 && (
        <div className="filtre">
          <span>Conseiller</span>
          <select value={cons} onChange={(e) => { setCons(e.target.value); setOuvert(null) }}>
            <option value="all">Tout le cabinet</option>
            {conseillers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {loading && <div className="empty">Chargement…</div>}
      {err && <div className="empty errtxt">Erreur : {err}</div>}

      {!loading && !err && (
        <div className="grid">
          {cartes.map(({ offre, cibles, n, potentiel }) => {
            const hot = offre.premium || (potentiel > 0 && potentiel === maxPotentiel)
            const saison = typeof offre.enSaison === 'function' && offre.enSaison()
            const deplie = ouvert === offre.id
            return (
              <div key={offre.id} className={`card${hot ? ' hot' : ''}`}>
                <div className="chd">
                  <div className="ct">
                    <h2>{offre.titre}</h2>
                    <div className="tags">
                      <span className="fam" style={{ borderColor: couleurFam(offre.famille_cible), color: couleurFam(offre.famille_cible) }}>
                        {labelFam(offre.famille_cible)}
                      </span>
                      {offre.premium && <span className="prem">Premium</span>}
                      {saison && <span className="saison">🔥 En saison</span>}
                    </div>
                  </div>
                  <div className="ticket">
                    <span className="tv">~{fmtK(offre.ticket_estime)}</span>
                    <span className="tl">par client</span>
                  </div>
                </div>

                <div className="pitch">{offre.pitch}</div>
                <div className="argu">{offre.argumentaire}</div>

                <div className="pot">
                  <span className="pn">{n}</span>
                  <span className="px">client{n > 1 ? 's' : ''} cible{n > 1 ? 's' : ''}</span>
                  <span className="dot">·</span>
                  <span className="pe">~{fmtEur(potentiel)}</span>
                  <span className="px">de potentiel</span>
                </div>

                <div className="cbtns">
                  <button className="pri" disabled={n === 0 || lancement === offre.id} onClick={() => lancer({ offre, cibles, n, potentiel })}>
                    {lancement === offre.id ? 'Generation…' : '🚀 Lancer la campagne'}
                  </button>
                  <button className="sec" disabled={n === 0} onClick={() => setOuvert(deplie ? null : offre.id)}>
                    {deplie ? 'Masquer' : `Voir les clients (${n})`}
                  </button>
                </div>

                {deplie && (
                  <div className="liste">
                    {cibles.length === 0 && <div className="vide">Aucun client cible.</div>}
                    {cibles.map((c) => (
                      <div key={c.client_id} className="lrow">
                        <span className="nm">{c.nomComplet}</span>
                        {isManager && c.advisor_code && <span className="adv">{c.advisor_code}</span>}
                        <span className="mo">{motifDe(offre, c)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = `
.pbo{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; --navy:#0A1628; --gold:#C9A961; --gold-dk:#A6843F; --vert:#2C6B4E; color:var(--ink); font-size:13px }
.pbo *{ box-sizing:border-box }
.pbo .hd{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:12px }
.pbo h1{ font-size:22px; font-weight:700; color:var(--navy); margin:0; letter-spacing:-.02em }
.pbo .sub{ color:var(--silver); font-size:12px; margin-top:2px }
.pbo .kpi{ background:var(--navy); color:#fff; border-radius:12px; padding:11px 18px; display:flex; flex-direction:column; gap:3px; text-align:right; min-width:210px }
.pbo .kpi .v{ font-size:22px; font-weight:800; color:var(--gold); line-height:1; letter-spacing:-.02em; font-variant-numeric:tabular-nums }
.pbo .kpi .l{ font-size:10.5px; opacity:.8; font-weight:600 }

.pbo .filtre{ display:flex; align-items:center; gap:8px; margin-bottom:12px; font-size:12px; color:var(--silver); font-weight:600 }
.pbo .filtre select{ border:1px solid var(--line); border-radius:8px; padding:5px 8px; font-size:12px; background:#fff; color:var(--navy); font-weight:600 }

.pbo .empty{ padding:22px; text-align:center; color:var(--silver) }
.pbo .errtxt{ color:#B4453B }

.pbo .grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:12px }
.pbo .card{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:15px 16px; display:flex; flex-direction:column; box-shadow:0 1px 2px rgba(10,22,40,.04) }
.pbo .card.hot{ border-color:rgba(201,169,97,.6); box-shadow:0 6px 22px rgba(201,169,97,.14) }

.pbo .chd{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px }
.pbo .ct{ min-width:0 }
.pbo .chd h2{ margin:0; font-size:16px; font-weight:750; color:var(--navy); letter-spacing:-.01em }
.pbo .tags{ display:flex; gap:6px; flex-wrap:wrap; margin-top:6px }
.pbo .fam{ font-size:10px; font-weight:800; border:1.5px solid var(--gold); border-radius:999px; padding:2px 9px; white-space:nowrap }
.pbo .prem{ font-size:10px; font-weight:800; color:#fff; background:var(--gold-dk); border-radius:999px; padding:2px 9px; letter-spacing:.02em }
.pbo .saison{ font-size:10px; font-weight:800; color:#9A6A1B; background:#FBF4E4; border:1px solid rgba(201,169,97,.5); border-radius:999px; padding:2px 8px; white-space:nowrap }
.pbo .ticket{ display:flex; flex-direction:column; align-items:flex-end; flex-shrink:0 }
.pbo .ticket .tv{ font-size:18px; font-weight:800; color:var(--navy); letter-spacing:-.02em; font-variant-numeric:tabular-nums; white-space:nowrap }
.pbo .ticket .tl{ font-size:9.5px; color:var(--silver); font-weight:600; text-transform:uppercase; letter-spacing:.04em }

.pbo .pitch{ font-size:12.5px; color:#3a4250; margin-top:10px; line-height:1.45 }
.pbo .argu{ font-size:11.5px; color:var(--silver); margin-top:6px; line-height:1.45; border-left:2px solid var(--line); padding-left:8px }

.pbo .pot{ display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; margin-top:12px; padding:9px 11px; background:#FBFAF7; border:1px solid var(--line); border-radius:10px }
.pbo .card.hot .pot{ background:#FBF4E4; border-color:rgba(201,169,97,.5) }
.pbo .pot .pn{ font-size:20px; font-weight:800; color:var(--navy); line-height:1; font-variant-numeric:tabular-nums }
.pbo .pot .pe{ font-size:15px; font-weight:800; color:var(--gold-dk); font-variant-numeric:tabular-nums }
.pbo .pot .px{ font-size:11px; color:#5b6470; font-weight:600 }
.pbo .pot .dot{ color:var(--silver) }

.pbo .cbtns{ display:flex; gap:7px; margin-top:12px }
.pbo .pri{ flex:1; background:var(--navy); color:#fff; border:none; border-radius:9px; padding:9px 14px; font-size:12.5px; font-weight:750; cursor:pointer }
.pbo .pri:disabled{ opacity:.45; cursor:default }
.pbo .sec{ background:#fff; color:#5b6470; border:1px solid var(--line); border-radius:9px; padding:9px 12px; font-size:12px; font-weight:650; cursor:pointer; white-space:nowrap }
.pbo .sec:disabled{ opacity:.5; cursor:default }
.pbo .sec:not(:disabled):hover{ border-color:var(--gold); color:var(--gold-dk) }

.pbo .liste{ margin-top:10px; border-top:1px solid #F4F2ED; max-height:260px; overflow-y:auto }
.pbo .vide{ padding:10px 2px; font-size:12px; color:var(--silver) }
.pbo .lrow{ display:flex; align-items:baseline; gap:9px; padding:6px 2px; border-bottom:1px solid #F7F5F1; flex-wrap:wrap }
.pbo .lrow:last-child{ border-bottom:none }
.pbo .lrow .nm{ font-weight:650; color:var(--navy); white-space:nowrap }
.pbo .lrow .adv{ font-size:9.5px; font-weight:700; color:var(--silver); background:#F3F1EC; border-radius:5px; padding:1.5px 6px }
.pbo .lrow .mo{ flex:1; min-width:140px; font-size:11.5px; color:#5b6470 }

@media(max-width:640px){
  .pbo .grid{ grid-template-columns:1fr }
  .pbo .kpi{ min-width:100%; text-align:left; align-items:flex-start }
  .pbo .cbtns{ flex-wrap:wrap }
  .pbo .sec{ flex:1 }
}
`
