// ═══════════════════════════════════════════════════════════════════════════
// SMART RH : congés en libre-service
//
// Les alternants et l équipe posent une demande de congé (type, dates, motif),
// la direction valide ou refuse. Chacun voit ses demandes et leur statut ; la
// direction voit tout, décide, et dispose d un planning des absences à venir.
// Périmètre géré par la RLS de rh_conges. Aucun envoi de mail ici (v1).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { listConges, createConge, decideConge, cancelConge, contreProposer, repondreContreProposition } from '../services/conges'
import { getOwn as getOwnContrat, list as listContrats } from '../services/conseillerContrats'
import { soldeConges, joursDemande, fmtJours } from '../lib/conges-solde'

const TYPES = ['Congé payé', 'RTT', 'Sans solde', 'Maladie', 'Autre']
const STATUT_LIB = {
  en_attente: 'En attente', valide: 'Validé', refuse: 'Refusé',
  annule: 'Annulé', contre_proposee: 'Contre-proposition',
}

function fmt(iso) {
  if (!iso) return ''
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
const todayIso = () => new Date().toISOString().slice(0, 10)

export default function SmartRH({ profile }) {
  const isManager = profile?.role === 'manager'
  const [conges, setConges] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [saving, setSaving] = useState(false)

  // Formulaire de demande
  const [type, setType] = useState('Congé payé')
  const [du, setDu] = useState('')
  const [au, setAu] = useState('')
  const [demi, setDemi] = useState(false)
  const [motif, setMotif] = useState('')

  // Contre-proposition (direction) : formulaire ouvert sur une demande donnée
  const [cpPour, setCpPour] = useState(null)
  const [cpDu, setCpDu] = useState('')
  const [cpAu, setCpAu] = useState('')
  const [cpDemi, setCpDemi] = useState(false)
  const [cpMsg, setCpMsg] = useState('')

  // Contrat(s) : le mien pour afficher mon solde, tous pour la direction
  // (le solde du demandeur s affiche au moment de valider).
  const [monContrat, setMonContrat] = useState(null)
  const [contrats, setContrats] = useState([])

  async function reload() {
    try {
      const [cg, contratData] = await Promise.all([
        listConges(),
        isManager ? listContrats().catch(() => []) : getOwnContrat().catch(() => null),
      ])
      setConges(cg)
      if (isManager) setContrats(contratData || [])
      else setMonContrat(contratData)
    } catch (e) { setErr(e.message || 'Erreur de chargement') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const mesDemandes = useMemo(
    () => (isManager ? conges.filter((c) => c.demandeur_id === profile?.id) : conges),
    [conges, isManager, profile?.id],
  )

  // Mon solde de congés payés (non manager) : acquis depuis le 1er septembre
  // moins les congés validés. null si le type de contrat n acquiert pas de CP.
  const monSolde = useMemo(
    () => (!isManager && monContrat ? soldeConges(monContrat, mesDemandes) : null),
    [isManager, monContrat, mesDemandes],
  )

  // Direction : congés groupés par demandeur + contrat actif par demandeur
  const congesParPersonne = useMemo(() => {
    const m = new Map()
    for (const c of conges) {
      if (!c.demandeur_id) continue
      const l = m.get(c.demandeur_id) || []
      l.push(c)
      m.set(c.demandeur_id, l)
    }
    return m
  }, [conges])
  const contratDe = (demandeurId) => contrats.find((k) => k.profile_id === demandeurId && k.actif)

  // Solde du demandeur pour une demande donnée (affiché à la validation)
  const soldeDemandeur = (c) => {
    if (c.type !== 'Congé payé' || !c.demandeur_id) return null
    const k = contratDe(c.demandeur_id)
    if (!k) return null
    return soldeConges(k, congesParPersonne.get(c.demandeur_id) || [])
  }
  const aValider = useMemo(() => conges.filter((c) => c.statut === 'en_attente'), [conges])
  const enAttenteReponse = useMemo(() => conges.filter((c) => c.statut === 'contre_proposee'), [conges])
  const planning = useMemo(
    () => conges.filter((c) => c.statut === 'valide' && c.date_fin >= todayIso())
      .sort((a, b) => a.date_debut.localeCompare(b.date_debut)),
    [conges],
  )

  async function envoyer() {
    if (!du || !au) { toast.error('Renseigne les dates de début et de fin'); return }
    if (au < du) { toast.error('La date de fin doit être après le début'); return }
    setSaving(true)
    try {
      await createConge({
        demandeur_nom: profile?.full_name || profile?.email || null,
        advisor_code: profile?.advisor_code || null,
        type, date_debut: du, date_fin: demi ? du : au, demi_journee: demi, motif,
      })
      toast.success('Demande envoyée, en attente de validation')
      setDu(''); setAu(''); setMotif(''); setDemi(false); setType('Congé payé')
      await reload()
    } catch (e) { toast.error(e.message || 'Échec de l envoi') } finally { setSaving(false) }
  }
  async function decider(c, statut) {
    let dmotif = null
    if (statut === 'refuse') {
      dmotif = window.prompt(`Refuser la demande de ${c.demandeur_nom || 'ce collaborateur'}. Motif (facultatif) :`, '')
      if (dmotif === null) return
    }
    setSaving(true)
    try { await decideConge(c.id, statut, profile?.full_name || 'Direction', dmotif); toast.success(statut === 'valide' ? 'Congé validé' : 'Demande refusée'); await reload() }
    catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  function ouvrirContre(c) {
    setCpPour(c.id)
    setCpDu(c.date_debut); setCpAu(c.date_fin); setCpDemi(!!c.demi_journee); setCpMsg('')
  }
  async function envoyerContre(c) {
    if (!cpDu || (!cpDemi && !cpAu)) { toast.error('Renseigne les dates proposées'); return }
    if (!cpDemi && cpAu < cpDu) { toast.error('La date de fin doit être après le début'); return }
    setSaving(true)
    try {
      await contreProposer(c.id, { date_debut: cpDu, date_fin: cpAu, demi_journee: cpDemi, message: cpMsg }, profile?.full_name || 'Direction')
      toast.success('Contre-proposition envoyée')
      setCpPour(null)
      await reload()
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  async function repondreContre(c, accepte) {
    if (!accepte && !window.confirm('Refuser ces nouvelles dates ? La demande sera annulée.')) return
    setSaving(true)
    try {
      await repondreContreProposition(c.id, accepte)
      toast.success(accepte ? 'Nouvelles dates acceptées, congé validé' : 'Contre-proposition refusée')
      await reload()
    } catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }
  async function annuler(c) {
    if (!window.confirm('Annuler cette demande ?')) return
    setSaving(true)
    try { await cancelConge(c.id); toast.success('Demande annulée'); await reload() }
    catch (e) { toast.error(e.message || 'Échec') } finally { setSaving(false) }
  }

  const badge = (s) => <span className={`stag ${s}`}>{STATUT_LIB[s] || s}</span>

  return (
    <div className="srh">
      <style>{styles}</style>

      <div className="hd">
        <div>
          <h1>Smart RH</h1>
          <div className="sub">{isManager ? 'Validez les demandes de congés de l équipe' : 'Posez vos congés, la direction valide'}</div>
        </div>
        {aValider.length > 0 && isManager && <span className="kpi">{aValider.length} à valider</span>}
      </div>

      {loading && <div className="empty">Chargement…</div>}
      {err && <div className="empty err">Erreur : {err}</div>}

      {!loading && !err && (
        <div className="cols">
          {/* Colonne gauche : demander + mes demandes (pas pour la direction) */}
          {!isManager && (
          <div className="col">
            {monSolde && (
              <div className="solde">
                <div className="sv" style={monSolde.restant < 0 ? { color: '#FF3B30' } : undefined}>
                  {fmtJours(monSolde.restant)}
                </div>
                <div className="sl">de congés payés disponibles</div>
                <div className="sd">
                  {fmtJours(monSolde.acquis)} acquis (2,5 j par mois complet depuis le début du contrat) · {fmtJours(monSolde.pris)} pris
                  {monSolde.dejaPris > 0 ? ` (dont ${fmtJours(monSolde.dejaPris)} avant Smart RH)` : ''}
                </div>
              </div>
            )}
            <div className="card">
              <div className="ctit">Poser un congé</div>
              <div className="frm">
                <label>Type
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="chk">
                  <input type="checkbox" checked={demi} onChange={(e) => setDemi(e.target.checked)} /> Demi-journée
                </label>
                <div className="dates">
                  <label>Du
                    <input type="date" value={du} onChange={(e) => setDu(e.target.value)} />
                  </label>
                  {!demi && (
                    <label>Au
                      <input type="date" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} />
                    </label>
                  )}
                </div>
                <label>Motif (facultatif)
                  <input type="text" placeholder="Ex. vacances, rendez-vous…" value={motif} onChange={(e) => setMotif(e.target.value)} />
                </label>
                {type === 'Congé payé' && du && (demi || au) && monSolde && (() => {
                  const n = joursDemande({ date_debut: du, date_fin: demi ? du : au, demi_journee: demi })
                  const depasse = n > monSolde.restant
                  return (
                    <div className={`frmnote${depasse ? ' warn' : ''}`}>
                      Cette demande : {fmtJours(n)} ouvrés
                      {depasse ? ` · dépasse ton solde (${fmtJours(monSolde.restant)} disponibles), la direction tranchera` : ''}
                    </div>
                  )
                })()}
                <button className="pri" disabled={saving} onClick={envoyer}>Envoyer la demande</button>
              </div>
            </div>

            <div className="ctit2">Mes demandes</div>
            {mesDemandes.length === 0 && <div className="vide">Aucune demande pour le moment.</div>}
            {mesDemandes.map((c) => (
              <div className={`row ${c.statut}`} key={c.id}>
                <div className="rmain">
                  <div className="rl1">{c.type} {badge(c.statut)}</div>
                  <div className="rl2">{c.demi_journee ? `${fmt(c.date_debut)} (demi-journée)` : `${fmt(c.date_debut)} au ${fmt(c.date_fin)}`} · {fmtJours(joursDemande(c))} ouvrés</div>
                  {c.statut === 'refuse' && c.decision_motif && <div className="rmotif">Motif : {c.decision_motif}</div>}
                  {c.statut === 'contre_proposee' && (
                    <div className="cpprop">
                      La direction propose plutôt : <b>{c.contre_demi_journee
                        ? `${fmt(c.contre_date_debut)} (demi-journée)`
                        : `${fmt(c.contre_date_debut)} au ${fmt(c.contre_date_fin)}`}</b>
                      {c.contre_message ? ` · « ${c.contre_message} »` : ''}
                    </div>
                  )}
                </div>
                {c.statut === 'en_attente' && <button className="lien" onClick={() => annuler(c)}>Annuler</button>}
                {c.statut === 'contre_proposee' && (
                  <div className="ract">
                    <button className="ok" disabled={saving} onClick={() => repondreContre(c, true)}>Accepter</button>
                    <button className="ko" disabled={saving} onClick={() => repondreContre(c, false)}>Refuser</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          )}

          {/* Colonne droite : validation + planning (direction) */}
          {isManager && (
            <div className="col mgr">
              <div className="ctit2">À valider {aValider.length > 0 && <span className="pill">{aValider.length}</span>}</div>
              {aValider.length === 0 && <div className="vide ok">Aucune demande en attente.</div>}
              {aValider.map((c) => (
                <div key={c.id}>
                  <div className="row en_attente">
                    <div className="rmain">
                      <div className="rl1">{c.demandeur_nom || c.advisor_code || 'Collaborateur'} · {c.type}</div>
                      <div className="rl2">{c.demi_journee ? `${fmt(c.date_debut)} (demi-journée)` : `${fmt(c.date_debut)} au ${fmt(c.date_fin)}`} · {fmtJours(joursDemande(c))} ouvrés{c.motif ? ` · ${c.motif}` : ''}</div>
                      {(() => {
                        const s = soldeDemandeur(c)
                        if (!s) return null
                        const apres = s.restant - joursDemande(c)
                        return (
                          <div className={`rsolde${apres < 0 ? ' neg' : ''}`}>
                            Solde : {fmtJours(s.restant)} disponibles · après validation : {fmtJours(apres)}
                            {apres < 0 ? ' (congés par anticipation)' : ''}
                          </div>
                        )
                      })()}
                    </div>
                    <div className="ract">
                      <button className="ok" disabled={saving} onClick={() => decider(c, 'valide')}>Valider</button>
                      <button className="cp" disabled={saving} onClick={() => (cpPour === c.id ? setCpPour(null) : ouvrirContre(c))}>Autres dates</button>
                      <button className="ko" disabled={saving} onClick={() => decider(c, 'refuse')}>Refuser</button>
                    </div>
                  </div>
                  {cpPour === c.id && (
                    <div className="cpform">
                      <div className="cptit">Proposer d autres dates à {c.demandeur_nom || 'ce collaborateur'}</div>
                      <label className="chk">
                        <input type="checkbox" checked={cpDemi} onChange={(e) => setCpDemi(e.target.checked)} /> Demi-journée
                      </label>
                      <div className="dates">
                        <label>Du<input type="date" value={cpDu} onChange={(e) => setCpDu(e.target.value)} /></label>
                        {!cpDemi && <label>Au<input type="date" value={cpAu} min={cpDu || undefined} onChange={(e) => setCpAu(e.target.value)} /></label>}
                      </div>
                      <input className="cpmsg" type="text" placeholder="Message (ex. période chargée, peux-tu décaler ?)" value={cpMsg} onChange={(e) => setCpMsg(e.target.value)} />
                      <div className="cpbtns">
                        <button className="pri" disabled={saving} onClick={() => envoyerContre(c)}>Envoyer la contre-proposition</button>
                        <button className="lien" onClick={() => setCpPour(null)}>Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {enAttenteReponse.length > 0 && (
                <>
                  <div className="ctit2">Contre-propositions envoyées</div>
                  {enAttenteReponse.map((c) => (
                    <div className="row contre_proposee" key={c.id}>
                      <div className="rmain">
                        <div className="rl1">{c.demandeur_nom || c.advisor_code} · {c.type} {badge(c.statut)}</div>
                        <div className="rl2">
                          demandé : {c.demi_journee ? fmt(c.date_debut) : `${fmt(c.date_debut)} au ${fmt(c.date_fin)}`}
                          {' · '}proposé : <b>{c.contre_demi_journee ? fmt(c.contre_date_debut) : `${fmt(c.contre_date_debut)} au ${fmt(c.contre_date_fin)}`}</b>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="ctit2">Absences à venir</div>
              {planning.length === 0 && <div className="vide">Personne d absent pour l instant.</div>}
              {planning.map((c) => (
                <div className="prow" key={c.id}>
                  <span className="pn">{c.demandeur_nom || c.advisor_code}</span>
                  <span className="pd">{c.demi_journee ? `${fmt(c.date_debut)} (½)` : `${fmt(c.date_debut)} → ${fmt(c.date_fin)}`}</span>
                  <span className="pt">{c.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const styles = `
.srh{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; --navy:#0A1628; --gold:#C9A961; --gold-dk:#A6843F; --vert:#2C6B4E; color:var(--ink); font-size:13px }
.srh *{ box-sizing:border-box }
.srh .hd{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px }
.srh h1{ font-size:22px; font-weight:700; color:var(--navy); margin:0; letter-spacing:-.02em }
.srh .sub{ color:var(--silver); font-size:12px; margin-top:2px }
.srh .kpi{ background:#FBF4E4; border:1px solid rgba(201,169,97,.5); color:var(--gold-dk); border-radius:999px; padding:5px 12px; font-size:12px; font-weight:750 }
.srh .empty{ padding:22px; text-align:center; color:var(--silver) }
.srh .err{ color:#B4453B }
.srh .cols{ display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap }
.srh .col{ flex:1; min-width:300px }
.srh .col.mgr{ max-width:760px }
.srh .card{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px 16px; box-shadow:0 1px 2px rgba(10,22,40,.04); margin-bottom:16px }
.srh .ctit{ font-size:14px; font-weight:750; color:var(--navy); margin-bottom:10px }
.srh .ctit2{ font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--silver); font-weight:750; margin:14px 0 8px; display:flex; align-items:center; gap:8px }
.srh .pill{ background:#E4A23C; color:#fff; border-radius:999px; padding:1px 8px; font-size:11px; font-weight:800; letter-spacing:0 }
.srh .frm{ display:flex; flex-direction:column; gap:10px }
.srh .frm label{ display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--silver) }
.srh .frm label.chk{ flex-direction:row; align-items:center; gap:7px; text-transform:none; letter-spacing:0; font-size:12.5px; color:var(--ink); font-weight:600 }
.srh .frm input[type=text],.srh .frm input[type=date],.srh .frm select{ border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:13px; background:#fff; color:var(--ink); font-weight:600 }
.srh .dates{ display:flex; gap:10px }
.srh .dates label{ flex:1 }
.srh .pri{ background:var(--navy); color:#fff; border:none; border-radius:10px; padding:10px; font-size:13px; font-weight:750; cursor:pointer; margin-top:2px }
.srh .pri:disabled{ opacity:.5; cursor:default }
.srh .row{ display:flex; align-items:center; gap:10px; background:#fff; border:1px solid var(--line); border-left:3px solid var(--line); border-radius:10px; padding:9px 13px; margin-bottom:7px }
.srh .row.en_attente{ border-left-color:#E4A23C }
.srh .row.valide{ border-left-color:var(--vert) }
.srh .row.refuse{ border-left-color:#B4453B }
.srh .row.annule{ opacity:.6 }
.srh .rmain{ flex:1; min-width:0 }
.srh .rl1{ font-weight:750; color:var(--navy); font-size:13px; display:flex; align-items:center; gap:8px; flex-wrap:wrap }
.srh .rl2{ font-size:11.5px; color:#5b6470; margin-top:2px }
.srh .rmotif{ font-size:11px; color:#B4453B; margin-top:2px }
.srh .stag{ font-size:9.5px; font-weight:800; letter-spacing:.04em; border-radius:999px; padding:2px 8px; text-transform:uppercase }
.srh .stag.en_attente{ background:#FBEED8; color:#9A6A1B }
.srh .stag.valide{ background:#E7F3EC; color:var(--vert) }
.srh .stag.refuse{ background:#FBECEC; color:#B4453B }
.srh .stag.annule{ background:#F1F1EE; color:var(--silver) }
.srh .ract{ display:flex; gap:6px; flex-shrink:0 }
.srh .ract .ok{ background:var(--vert); color:#fff; border:none; border-radius:8px; padding:7px 13px; font-size:12px; font-weight:750; cursor:pointer }
.srh .ract .ko{ background:#fff; color:#B4453B; border:1px solid #E8CFCB; border-radius:8px; padding:7px 13px; font-size:12px; font-weight:700; cursor:pointer }
.srh .lien{ background:none; border:none; color:var(--silver); text-decoration:underline; font-size:11.5px; cursor:pointer; flex-shrink:0 }
.srh .row.contre_proposee{ border-left-color:#5B4B8A }
.srh .stag.contre_proposee{ background:#EDE7F8; color:#5B4B8A }
.srh .ract .cp{ background:#fff; color:#5B4B8A; border:1px solid #C9BEEB; border-radius:8px; padding:7px 12px; font-size:12px; font-weight:700; cursor:pointer }
.srh .ract .cp:hover{ background:#5B4B8A; color:#fff }
.srh .cpform{ background:#F6F4FC; border:1px solid #DCD4EE; border-radius:11px; padding:12px 14px; margin:0 0 8px }
.srh .cptit{ font-size:12px; font-weight:750; color:#5B4B8A; margin-bottom:8px }
.srh .cpform .chk{ display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; color:var(--ink); margin-bottom:8px }
.srh .cpform .dates{ display:flex; gap:10px; margin-bottom:8px }
.srh .cpform .dates label{ flex:1; display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--silver) }
.srh .cpform input[type=date]{ border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:13px; background:#fff; font-weight:600 }
.srh .cpmsg{ width:100%; border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:12.5px; background:#fff }
.srh .cpbtns{ display:flex; align-items:center; gap:10px; margin-top:9px }
.srh .cpbtns .pri{ margin-top:0; padding:8px 14px; font-size:12.5px }
.srh .cpprop{ font-size:11.5px; color:#5B4B8A; background:#F3F0FA; border:1px solid #DCD4EE; border-radius:8px; padding:6px 9px; margin-top:5px; line-height:1.4 }
.srh .vide{ font-size:12px; color:var(--silver); padding:8px 2px }
.srh .vide.ok{ color:#4a7a52 }
.srh .solde{ background:linear-gradient(135deg,#FBF4E4,#fff); border:1px solid rgba(201,169,97,.5); border-radius:14px; padding:16px 18px; margin-bottom:14px }
.srh .solde .sv{ font-size:30px; font-weight:800; letter-spacing:-0.02em; color:var(--gold-dk,#A6843F); line-height:1 }
.srh .solde .sl{ font-size:13px; font-weight:650; color:var(--t1,#1c1c1e); margin-top:4px }
.srh .solde .sd{ font-size:11.5px; color:var(--t3,#8a8a8e); margin-top:4px }
.srh .frmnote{ font-size:12px; color:var(--t2,#555); background:rgba(0,0,0,.03); border-radius:8px; padding:7px 10px }
.srh .frmnote.warn{ color:#8a5a00; background:rgba(255,149,0,.10) }
.srh .rsolde{ font-size:11.5px; color:var(--gold-dk,#A6843F); margin-top:3px; font-weight:600 }
.srh .rsolde.neg{ color:#FF3B30 }
.srh .prow{ display:flex; align-items:center; gap:10px; padding:6px 2px; border-bottom:1px solid #F4F2ED; font-size:12.5px }
.srh .prow .pn{ font-weight:700; color:var(--navy); min-width:120px }
.srh .prow .pd{ color:#5b6470; flex:1; font-variant-numeric:tabular-nums }
.srh .prow .pt{ font-size:10.5px; font-weight:700; color:var(--gold-dk); background:#FBF4E4; border-radius:5px; padding:1px 7px }
@media(max-width:760px){ .srh .cols{ flex-direction:column } }
`
