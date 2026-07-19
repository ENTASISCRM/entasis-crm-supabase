// ═══════════════════════════════════════════════════════════════════════════
// OPPORTUNITÉS DU JOUR : les occasions de contact du matin
//
// Un seul écran qui agrège 7 générateurs d'occasions d'appeler un client,
// chacun rendu comme une carte section repliable avec compteur :
//   1  anniversaires des 7 prochains jours (mis en avant, âge fêté)
//   2  revue d'anniversaire de contrat (12 mois, 24 mois... sous 30 jours)
//   3  sprint plafond fiscal PER (de septembre à décembre)
//   4  recalage Madelin (de mai à août, TNS et professions libérales)
//   5  épargne des enfants (clients parents sans épargne enfant repérée)
//   6  compte à rebours des 70 ans (badge urgent, régime successoral)
//   7  clients orphelins (manager uniquement, portefeuille à réattribuer)
//
// Périmètre de données : la RLS applique le périmètre (manager voit tout et
// dispose d'un filtre conseiller, conseiller voit ses clients). Aucune
// écriture : l'écran lit, calcule côté client et copie dans le presse papier.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { chargerDonnees, construireSections } from '../services/opportunites'

export default function OpportunitesDuJour({ profile }) {
  const isManager = profile?.role === 'manager'
  const [donnees, setDonnees] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [cons, setCons] = useState('all')     // filtre conseiller du manager
  const [replies, setReplies] = useState({})  // sections repliées par clé

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const d = await chargerDonnees({ manager: isManager })
        if (vivant) setDonnees(d)
      } catch (e) { if (vivant) setErr(e.message || 'Erreur de chargement') }
      finally { if (vivant) setLoading(false) }
    })()
    return () => { vivant = false }
  }, [isManager])

  // Codes conseillers présents dans le portefeuille visible (filtre manager)
  const conseillers = useMemo(() => {
    if (!donnees) return []
    return Array.from(new Set(donnees.clients.map((c) => c.advisor_code).filter(Boolean))).sort()
  }, [donnees])
  const nomConseiller = useMemo(() => {
    const m = {}
    ;(donnees?.profils || []).forEach((p) => { if (p.advisor_code) m[p.advisor_code] = p.full_name })
    return m
  }, [donnees])

  // Le filtre conseiller s'applique en amont des générateurs : les clients
  // et les deals sont réduits au portefeuille choisi, les sections se
  // recalculent (les orphelins disparaissent d'eux mêmes, leur code ne
  // correspondant à aucun conseiller actif sélectionnable).
  const sections = useMemo(() => {
    if (!donnees) return []
    const filtrees = cons === 'all' ? donnees : {
      ...donnees,
      clients: donnees.clients.filter((c) => c.advisor_code === cons),
      deals: donnees.deals.filter((d) => d.advisor_code === cons),
    }
    return construireSections(filtrees, { isManager, today: new Date() })
  }, [donnees, cons, isManager])

  const total = useMemo(() => sections.reduce((s, x) => s + x.items.length, 0), [sections])
  const toggle = (k) => setReplies((p) => ({ ...p, [k]: !p[k] }))

  // Clic sur un client : copie du téléphone dans le presse papier
  function copierTelephone(it) {
    if (!it.telephone) { toast(`Pas de téléphone renseigné pour ${it.nom}`); return }
    navigator.clipboard?.writeText(it.telephone)
      .then(() => toast.success(`Téléphone de ${it.nom} copié`))
      .catch(() => toast.error('Copie impossible sur ce navigateur'))
  }

  // Copie de la liste complète d'une section, prête à coller dans des notes
  function copierListe(sec) {
    const lignes = sec.items.map((it) =>
      `${it.nom} · ${it.raison}${it.detail ? ` · ${it.detail}` : ''}${it.telephone ? ` · ${it.telephone}` : ''}`)
    const txt = `${sec.titre} (${sec.items.length})\n${lignes.join('\n')}`
    navigator.clipboard?.writeText(txt)
      .then(() => toast.success(`${sec.items.length} client${sec.items.length > 1 ? 's' : ''} copiés`))
      .catch(() => toast.error('Copie impossible sur ce navigateur'))
  }

  const dateDuJour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="opj">
      <style>{styles}</style>

      <div className="hd">
        <div>
          <h1>Opportunités du jour</h1>
          <div className="sub">{dateDuJour}</div>
        </div>
        <div className="kpi">
          <span className="v">{total}</span>
          <span className="l">occasion{total > 1 ? 's' : ''} de contact aujourd'hui</span>
        </div>
      </div>

      {isManager && conseillers.length > 0 && (
        <div className="filtre">
          <span>Conseiller</span>
          <select value={cons} onChange={(e) => setCons(e.target.value)}>
            <option value="all">Tout le cabinet</option>
            {conseillers.map((c) => (
              <option key={c} value={c}>{nomConseiller[c] ? `${c} · ${nomConseiller[c]}` : c}</option>
            ))}
          </select>
        </div>
      )}

      {loading && <div className="empty">Chargement…</div>}
      {err && <div className="empty err">Erreur : {err}</div>}

      {!loading && !err && sections.map((sec) => {
        const replie = !!replies[sec.key]
        return (
          <section key={sec.key} className={`sec${sec.highlight ? ' hi' : ''}${sec.urgent ? ' urg' : ''}`}>
            <header className="sechd" onClick={() => toggle(sec.key)}>
              <span className="chev">{replie ? '▸' : '▾'}</span>
              <h2>{sec.titre}</h2>
              {sec.urgent && <span className="stag">URGENT</span>}
              {sec.managerOnly && <span className="stag mgr">MANAGER</span>}
              <span className="count">{sec.items.length}</span>
              <span className="sp" />
              <button
                className="copy"
                disabled={sec.items.length === 0}
                onClick={(e) => { e.stopPropagation(); copierListe(sec) }}
              >
                Copier la liste
              </button>
            </header>
            {!replie && (
              <>
                <div className="regle">{sec.regle}</div>
                {sec.items.length === 0 && sec.encartDates && (
                  <div className="edu">
                    Aucune date de naissance renseignée dans le portefeuille.
                    {' '}<b>Renseigne les dates de naissance sur les fiches clients</b>{' '}
                    pour activer les rappels d'anniversaire et le compte à rebours des 70 ans.
                  </div>
                )}
                {sec.items.length === 0 && !sec.encartDates && (
                  <div className="vide">Aucun client concerné aujourd'hui</div>
                )}
                {sec.items.length > 0 && (
                  <ul>
                    {sec.items.map((it) => (
                      <li
                        key={it.id}
                        className={it.telephone ? 'click' : ''}
                        title={it.telephone ? 'Cliquer pour copier le téléphone' : undefined}
                        onClick={() => copierTelephone(it)}
                      >
                        <span className="nm">{it.nom}</span>
                        {isManager && it.advisorCode && <span className="adv">{it.advisorCode}</span>}
                        <span className="why">
                          {it.raison}
                          {it.detail && <span className="det"> · {it.detail}</span>}
                        </span>
                        {it.telephone && <span className="tel">{it.telephone}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

const styles = `
.opj{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; color:var(--ink); font-size:13px; max-width:980px }
.opj *{ box-sizing:border-box }
.opj .hd{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:12px }
.opj h1{ font-size:22px; font-weight:700; color:var(--navy,#0A1628); margin:0; letter-spacing:-.02em }
.opj .sub{ color:var(--silver); font-size:12px; margin-top:2px; text-transform:capitalize }
.opj .kpi{ background:#fff; border:1px solid rgba(201,169,97,.45); border-radius:12px; padding:10px 16px; display:flex; flex-direction:column; gap:3px; text-align:left; min-width:190px }
.opj .kpi .v{ font-size:22px; font-weight:750; color:var(--gold-dk,#A6843F); line-height:1 }
.opj .kpi .l{ font-size:10.5px; color:var(--silver); font-weight:600 }
.opj .filtre{ display:flex; align-items:center; gap:8px; margin-bottom:12px; font-size:12px; color:var(--silver); font-weight:600 }
.opj .filtre select{ border:1px solid var(--line); border-radius:8px; padding:5px 8px; font-size:12px; background:#fff; color:var(--navy,#0A1628); font-weight:600 }
.opj .sec{ background:#fff; border:1px solid var(--line); border-radius:13px; margin-bottom:10px; overflow:hidden; box-shadow:0 1px 2px rgba(10,22,40,.04) }
.opj .sec.hi{ border-color:rgba(201,169,97,.55); box-shadow:0 4px 16px rgba(201,169,97,.12) }
.opj .sec.urg{ border-color:rgba(201,169,97,.55) }
.opj .sechd{ display:flex; align-items:center; gap:8px; padding:10px 14px; cursor:pointer; user-select:none }
.opj .sec.hi .sechd{ background:#FBF4E4 }
.opj .chev{ color:var(--silver); font-size:11px; width:12px }
.opj .sechd h2{ margin:0; font-size:14px; font-weight:700; color:var(--navy,#0A1628) }
.opj .stag{ font-size:9px; font-weight:800; letter-spacing:.06em; background:var(--gold,#C9A961); color:#fff; border-radius:999px; padding:2.5px 8px }
.opj .stag.mgr{ background:var(--navy,#0A1628) }
.opj .count{ font-size:11px; font-weight:750; background:#F3F1EC; color:var(--navy,#0A1628); border-radius:999px; padding:2px 8px; min-width:26px; text-align:center }
.opj .sec.hi .count{ background:#fff }
.opj .sp{ flex:1 }
.opj .copy{ border:1px solid var(--line); background:#fff; border-radius:8px; padding:5px 10px; font-size:11px; font-weight:700; color:#5b6470; cursor:pointer; white-space:nowrap }
.opj .copy:hover{ border-color:var(--gold,#C9A961); color:var(--gold-dk,#A6843F) }
.opj .copy:disabled{ opacity:.45; cursor:default }
.opj .regle{ font-size:10.5px; color:var(--silver); padding:0 14px 8px 34px }
.opj ul{ list-style:none; margin:0; padding:0 }
.opj li{ display:flex; align-items:baseline; gap:10px; padding:8px 14px; border-top:1px solid #F4F2ED; flex-wrap:wrap }
.opj li.click{ cursor:pointer }
.opj li.click:hover{ background:#FCFBF6 }
.opj .nm{ font-weight:650; color:var(--navy,#0A1628); white-space:nowrap }
.opj .adv{ font-size:9.5px; font-weight:700; color:var(--silver); background:#F3F1EC; border-radius:5px; padding:1.5px 6px }
.opj .why{ flex:1; min-width:220px; font-size:12px; color:#5b6470 }
.opj .why .det{ color:var(--silver) }
.opj .tel{ font-size:12px; font-weight:650; color:var(--gold-dk,#A6843F); font-variant-numeric:tabular-nums; white-space:nowrap }
.opj .vide{ padding:10px 14px; border-top:1px solid #F4F2ED; font-size:12px; color:var(--silver) }
.opj .edu{ margin:8px 14px 14px; background:#FBF4E4; border:1px solid rgba(201,169,97,.5); border-radius:10px; padding:10px 12px; font-size:12px; color:#6b5620 }
.opj .edu b{ color:var(--gold-dk,#A6843F) }
.opj .empty{ padding:20px; text-align:center; color:var(--silver) }
.opj .err{ color:#B4453B }
`
