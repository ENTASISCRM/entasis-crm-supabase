/* ─────────────────────────────────────────────────────────────────────────────
   CONNEXIONS AU CRM — suivi de sécurité (direction et déléguée RH)

   Ce que l'écran montre : qui s'est connecté, quand, depuis quelle ville et
   avec quel appareil. Une ligne par connexion.

   Ce qu'il ne montre pas, et c'est volontaire : rien pendant la session. Ni
   page consultée, ni position, ni durée. On sait d'où quelqu'un s'est
   connecté au moment où il s'est connecté, pas où il se trouve maintenant.

   « En direct » veut dire que la liste se rafraîchit toute seule à mesure que
   les connexions arrivent, pas qu'on suit quelqu'un à la trace.

   Les données sont conservées six mois, la durée recommandée par la CNIL pour
   un journal de connexion. La purge tourne chaque nuit en base.
───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useRef, useState } from 'react'
import { SkeletonCards } from './ui/Skeleton'
import { listerConnexions } from '../services/connexions'
import {
  resumerParPersonne, signaler, lieu, appareil, nomDe, quand, depuis, estRecent,
  MINUTES_EN_DIRECT,
} from '../lib/connexions'
import { correspond } from '../lib/recherche'
import { messageErreur } from '../lib/ui-shared'
import { exporterCsv, suffixeDate } from '../lib/export-csv'

// Rafraîchissement de la vue en direct. Assez court pour qu'une connexion
// apparaisse pendant qu'on regarde l'écran, assez long pour ne pas marteler
// la base toute la journée sur un onglet resté ouvert.
const RAFRAICHIR_MS = 45000

const FENETRES = [
  { jours: 1, label: "Aujourd'hui" },
  { jours: 7, label: '7 jours' },
  { jours: 30, label: '30 jours' },
  { jours: 90, label: '90 jours' },
  { jours: 180, label: '6 mois' },
]

const MOTIFS = {
  'hors-france': 'Connexion hors de France',
  'lieu-nouveau': 'Première connexion depuis cette ville',
}

export default function Connexions() {
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [jours, setJours] = useState(30)
  const [q, setQ] = useState('')
  const [seulementSignalees, setSeulementSignalees] = useState(false)
  const [maintenant, setMaintenant] = useState(() => new Date())
  const premierChargement = useRef(true)

  useEffect(() => {
    let vivant = true
    async function charger() {
      try {
        const data = await listerConnexions({ jours, limite: 1000 })
        if (!vivant) return
        setLignes(data)
        setErr(null)
      } catch (e) {
        if (!vivant) return
        // Une erreur ne doit pas vider l'écran de ce qui est déjà affiché.
        setErr(messageErreur(e))
      } finally {
        if (vivant) { setLoading(false); premierChargement.current = false; setMaintenant(new Date()) }
      }
    }
    setLoading(premierChargement.current)
    charger()
    const t = setInterval(charger, RAFRAICHIR_MS)
    return () => { vivant = false; clearInterval(t) }
  }, [jours])

  const signalees = useMemo(() => signaler(lignes), [lignes])
  const parPersonne = useMemo(() => resumerParPersonne(lignes, maintenant), [lignes, maintenant])
  const enDirect = useMemo(() => parPersonne.filter((p) => p.enDirect), [parPersonne])

  const filtrees = useMemo(() => {
    let out = lignes
    if (seulementSignalees) out = out.filter((l) => signalees.has(l.id))
    const requete = q.trim()
    if (requete) {
      out = out.filter((l) =>
        correspond(nomDe(l), requete) ||
        correspond(String(l.email || ''), requete) ||
        correspond(lieu(l), requete) ||
        String(l.ip || '').includes(requete))
    }
    return out
  }, [lignes, signalees, q, seulementSignalees])

  function exporter() {
    exporterCsv(
      `connexions-${suffixeDate()}`,
      ['Date', 'Heure', 'Collaborateur', 'Email', 'Ville', 'Pays', 'IP', 'Appareil', 'Signalée'],
      filtrees.map((l) => {
        const d = new Date(l.created_at)
        return [
          d.toLocaleDateString('fr-FR'),
          d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          nomDe(l), l.email || '', l.ville || '', l.pays || '', l.ip || '',
          appareil(l.user_agent),
          (signalees.get(l.id) || []).map((m) => MOTIFS[m] || m).join(' · '),
        ]
      }),
      'connexions',
    )
  }

  return (
    <div className="cnx">
      <style>{styles}</style>

      <div className="head">
        <div>
          <h2>Connexions au CRM</h2>
          <div className="sub">
            Une ligne par connexion : date, heure, lieu déduit de l adresse IP et appareil.
            Rien n est enregistré pendant la session.
          </div>
        </div>
        <div className="fen">
          {FENETRES.map((f) => (
            <button
              key={f.jours}
              className={`fbtn${jours === f.jours ? ' on' : ''}`}
              onClick={() => setJours(f.jours)}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      {loading ? <SkeletonCards n={3} /> : (
        <>
          {/* ── En direct : qui vient de se connecter ──────────────────── */}
          <div className="card">
            <div className="blochd">
              <div className="bk">En direct</div>
              <div className="bt">
                Connectés à l instant
                {enDirect.length > 0 && <span className="pill">{enDirect.length}</span>}
              </div>
              <div className="bs">
                Une connexion des {MINUTES_EN_DIRECT} dernières minutes. La liste se met à jour toute seule.
              </div>
            </div>
            {enDirect.length === 0
              ? <div className="vide">Personne ne s est connecté dans les {MINUTES_EN_DIRECT} dernières minutes.</div>
              : (
                <div className="direct">
                  {enDirect.map((p) => (
                    <div className="dcarte" key={p.cle}>
                      <span className="point" aria-hidden="true" />
                      <div className="dnom">{p.nom}</div>
                      <div className="dlieu">{lieu(p.derniere)}</div>
                      <div className="dmeta">{depuis(p.derniere.created_at, maintenant)} · {appareil(p.derniere.user_agent)}</div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* ── Dernière connexion de chacun ────────────────────────────── */}
          <div className="card">
            <div className="blochd">
              <div className="bk">Équipe</div>
              <div className="bt">Dernière connexion de chacun</div>
              <div className="bs">Sur la fenêtre choisie. Qui ne s est pas connecté n apparaît pas.</div>
            </div>
            {parPersonne.length === 0
              ? <div className="vide">Aucune connexion sur cette période.</div>
              : parPersonne.map((p) => (
                <div className="prow" key={p.cle}>
                  <span className={`pn${p.enDirect ? ' vif' : ''}`}>{p.nom}</span>
                  <span className="pq">{quand(p.derniere.created_at)}</span>
                  <span className="pl">{lieu(p.derniere)}</span>
                  <span className="pa">{appareil(p.derniere.user_agent)}</span>
                  <span className="pc">{p.nbConnexions} connexion{p.nbConnexions > 1 ? 's' : ''}</span>
                </div>
              ))}
          </div>

          {/* ── Le journal ──────────────────────────────────────────────── */}
          <div className="card">
            <div className="blochd">
              <div className="bk">Journal</div>
              <div className="bt">
                Toutes les connexions
                {signalees.size > 0 && <span className="pill alerte">{signalees.size} à regarder</span>}
              </div>
              <div className="bs">Conservation six mois, purge automatique au delà.</div>
            </div>

            <div className="barre">
              <input
                className="rech"
                type="search"
                placeholder="Un nom, une ville, une adresse IP…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Filtrer les connexions"
              />
              <label className="chk">
                <input
                  type="checkbox"
                  checked={seulementSignalees}
                  onChange={(e) => setSeulementSignalees(e.target.checked)}
                /> Seulement celles à regarder
              </label>
              <button className="lien" onClick={exporter} disabled={filtrees.length === 0}>Exporter en CSV</button>
            </div>

            {filtrees.length === 0
              ? <div className="vide">Aucune connexion ne correspond.</div>
              : (
                <div className="tbl" role="table">
                  <div className="thd" role="row">
                    <span role="columnheader">Quand</span>
                    <span role="columnheader">Qui</span>
                    <span role="columnheader">D où</span>
                    <span role="columnheader">Appareil</span>
                    <span role="columnheader">IP</span>
                  </div>
                  {filtrees.map((l) => {
                    const motifs = signalees.get(l.id) || []
                    return (
                      <div className={`trow${motifs.length ? ' flag' : ''}`} role="row" key={l.id}>
                        <span className="c1" role="cell">
                          {quand(l.created_at)}
                          {estRecent(l.created_at, MINUTES_EN_DIRECT, maintenant) && <span className="neuf">à l instant</span>}
                        </span>
                        <span className="c2" role="cell">{nomDe(l)}</span>
                        <span className="c3" role="cell">
                          {lieu(l)}
                          {motifs.map((m) => (
                            <span className={`tag ${m}`} key={m} title={MOTIFS[m]}>
                              {m === 'hors-france' ? 'hors de France' : 'nouveau lieu'}
                            </span>
                          ))}
                        </span>
                        <span className="c4" role="cell">{appareil(l.user_agent)}</span>
                        <span className="c5" role="cell">{l.ip || '—'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
          </div>

          <div className="note">
            Le lieu est déduit de l adresse IP : il situe le fournisseur d accès, pas la personne.
            Une connexion en 4G peut afficher une ville voisine. À lire comme un repère, pas comme une preuve.
          </div>
        </>
      )}
    </div>
  )
}

const styles = `
.cnx{ --line:#EDEAE3; --navy:#162443; --gold:#C9A961; --gold-dk:#A6843F; --ink:#1d1d1f; --t3:#8a8a8e }
.cnx .head{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:14px }
.cnx h2{ margin:0; font-size:19px; font-weight:800; color:var(--navy); letter-spacing:-.01em }
.cnx .sub{ font-size:12.5px; color:#5b6470; margin-top:3px; max-width:640px }
.cnx .fen{ display:flex; gap:6px; flex-wrap:wrap }
.cnx .fbtn{ background:#fff; border:1px solid var(--line); border-radius:8px; padding:6px 11px; font-size:12px; font-weight:650; color:#5b6470; cursor:pointer }
.cnx .fbtn:hover{ border-color:var(--gold-dk); color:var(--gold-dk) }
.cnx .fbtn.on{ background:var(--navy); border-color:var(--navy); color:#fff }
.cnx .err{ background:#FDF3F2; border:1px solid #E8CFCB; color:#B4453B; border-radius:10px; padding:10px 13px; font-size:12.5px; margin-bottom:12px }
.cnx .card{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:16px 18px; margin-bottom:14px }
.cnx .blochd{ margin-bottom:12px }
.cnx .bk{ font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--gold-dk) }
.cnx .bt{ font-size:15px; font-weight:800; color:var(--navy); margin-top:2px; display:flex; align-items:center; gap:8px }
.cnx .bs{ font-size:11.5px; color:#8a8a8e; margin-top:3px }
.cnx .pill{ background:var(--navy); color:#fff; border-radius:20px; padding:1px 8px; font-size:11px; font-weight:750 }
.cnx .pill.alerte{ background:#B4453B }
.cnx .vide{ font-size:12.5px; color:#8a8a8e; padding:8px 2px }

.cnx .direct{ display:flex; gap:10px; flex-wrap:wrap }
.cnx .dcarte{ position:relative; flex:1 1 190px; min-width:190px; border:1px solid var(--line); border-left:3px solid #34C759; border-radius:11px; padding:10px 12px 10px 14px; background:#FCFCFA }
.cnx .point{ position:absolute; top:12px; right:12px; width:7px; height:7px; border-radius:50%; background:#34C759; box-shadow:0 0 0 3px rgba(52,199,89,.18) }
.cnx .dnom{ font-size:13px; font-weight:750; color:var(--navy) }
.cnx .dlieu{ font-size:12px; font-weight:650; color:var(--gold-dk); margin-top:2px }
.cnx .dmeta{ font-size:11px; color:#8a8a8e; margin-top:3px }

.cnx .prow{ display:flex; align-items:center; gap:10px; padding:7px 2px; border-bottom:1px solid #F4F2ED; font-size:12.5px }
.cnx .prow:last-child{ border-bottom:none }
.cnx .prow .pn{ font-weight:700; color:var(--navy); min-width:150px }
.cnx .prow .pn.vif::before{ content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:#34C759; margin-right:6px; vertical-align:middle }
.cnx .prow .pq{ color:#5b6470; min-width:120px; font-variant-numeric:tabular-nums }
.cnx .prow .pl{ flex:1; color:var(--ink); font-weight:600 }
.cnx .prow .pa{ color:#8a8a8e; min-width:130px }
.cnx .prow .pc{ font-size:11px; font-weight:700; color:#0071E3; background:rgba(0,113,227,.08); border-radius:5px; padding:1px 7px; white-space:nowrap }

.cnx .barre{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:10px }
.cnx .rech{ flex:1; min-width:200px; border:1px solid var(--line); border-radius:9px; padding:8px 11px; font-size:12.5px; background:#fff }
.cnx .rech:focus{ outline:none; border-color:var(--gold-dk); box-shadow:0 0 0 3px rgba(201,169,97,.15) }
.cnx .chk{ display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#5b6470; cursor:pointer; white-space:nowrap }
.cnx .lien{ background:none; border:none; color:var(--gold-dk); font-size:12px; font-weight:700; cursor:pointer; text-decoration:underline; padding:0 }
.cnx .lien:disabled{ color:#c9c9c9; cursor:default; text-decoration:none }

.cnx .tbl{ font-size:12.5px }
.cnx .thd, .cnx .trow{ display:grid; grid-template-columns:150px 1fr 1fr 150px 130px; gap:10px; align-items:center; padding:7px 8px }
.cnx .thd{ font-size:10px; font-weight:800; letter-spacing:.07em; text-transform:uppercase; color:var(--t3); border-bottom:1px solid var(--line) }
.cnx .trow{ border-bottom:1px solid #F7F5F0; border-radius:7px }
.cnx .trow:hover{ background:#FBFAF7 }
.cnx .trow.flag{ background:#FFF9F2; border-left:3px solid #E4A23C; padding-left:5px }
.cnx .trow .c1{ color:#5b6470; font-variant-numeric:tabular-nums }
.cnx .trow .c2{ font-weight:700; color:var(--navy) }
.cnx .trow .c3{ font-weight:600 }
.cnx .trow .c4, .cnx .trow .c5{ color:#8a8a8e; font-variant-numeric:tabular-nums }
.cnx .neuf{ display:inline-block; margin-left:6px; font-size:9.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:#34C759 }
.cnx .tag{ display:inline-block; margin-left:6px; font-size:10px; font-weight:750; border-radius:5px; padding:1px 6px; white-space:nowrap }
.cnx .tag.hors-france{ color:#B4453B; background:rgba(180,69,59,.10) }
.cnx .tag.lieu-nouveau{ color:#A6843F; background:rgba(201,169,97,.16) }

.cnx .note{ font-size:11.5px; color:#8a8a8e; line-height:1.6; padding:0 2px 8px; max-width:760px }

@media (max-width:900px){
  .cnx .thd{ display:none }
  .cnx .trow{ grid-template-columns:1fr 1fr; row-gap:2px }
  .cnx .prow{ flex-wrap:wrap }
  .cnx .prow .pa{ min-width:0 }
}
`
