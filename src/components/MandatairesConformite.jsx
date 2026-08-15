// ═══════════════════════════════════════════════════════════════════════════
// CONFORMITE DES MANDATAIRES (onglet Pilotage RH, direction RH uniquement)
//
// Trois obligations suivies pour chaque mandataire independant :
//   1. Immatriculation au registre national des entreprises (INPI), verifiee
//      automatiquement par SIREN via Pappers.
//   2. Habilitation ORIAS, controlee au registre public, avec date de
//      controle et echeance de renouvellement.
//   3. Declaration URSSAF trimestrielle : justificatif reclame au mandataire,
//      montant declare confronte aux commissions que nous lui avons versees.
//      Echeances : T1 au 30 avril, T2 au 31 juillet, T3 au 31 octobre,
//      T4 au 31 janvier de l annee suivante.
//
// Lecture de l ecart : declarer PLUS que nos commissions est normal (le
// mandataire a d autres clients). C est la SOUS declaration qui alerte.
//
// Les champs sont CONTROLES (et non en defaultValue) : sans cela, changer
// d annee laissait a l ecran les montants de l annee precedente, qu un
// simple clic hors du champ recopiait sur la nouvelle annee.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import * as service from '../services/mandataires'
import { echeanceUrssaf, trimestreExigible, ECHEANCES_URSSAF } from '../services/mandataires'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')
const URL_ORIAS = 'https://www.orias.fr/search'
const TOLERANCE = 1            // euros : en deca, montants consideres identiques
const VALIDITE_CONTROLE = 365  // jours : au dela, un controle ORIAS est perime

export default function MandatairesConformite({ contrats = [], profile }) {
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [conformites, setConformites] = useState([])
  const [urssaf, setUrssaf] = useState([])
  // null = commissions non chargees (l ecart ne veut alors rien dire)
  const [commissions, setCommissions] = useState(null)
  const [commErreur, setCommErreur] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  // Saisies en cours (champs controles), reinitialisees a chaque chargement
  const [champs, setChamps] = useState({})

  // Mandataires dont le mandat recoupe l annee affichee : un mandat termine
  // garde son historique de conformite consultable.
  const mandataires = useMemo(() => {
    const debutAnnee = `${annee}-01-01`
    const finAnnee = `${annee}-12-31`
    return contrats
      .filter((c) => c.type_contrat === 'MANDATAIRE')
      .filter((c) => (!c.date_debut || c.date_debut <= finAnnee) && (!c.date_fin || c.date_fin >= debutAnnee))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }, [contrats, annee])

  // Jeton de sequence : une reponse arrivee apres un changement d annee est
  // ignoree, sinon les donnees d une annee ecrasaient celles d une autre.
  const sequence = useRef(0)

  const reload = async () => {
    const seq = ++sequence.current
    setLoading(true)
    // Les commissions de l annee precedente ne doivent JAMAIS rester a
    // l ecran pendant le chargement de la nouvelle annee.
    setCommissions(null)
    setCommErreur(null)
    try {
      const [conf, urs] = await Promise.all([service.listConformite(), service.listUrssaf(annee)])
      if (seq !== sequence.current) return
      setConformites(conf)
      setUrssaf(urs)
      // Les champs repartent des valeurs enregistrees pour l annee affichee
      const next = {}
      for (const c of conf) {
        next[`siren-${c.contrat_id}`] = c.siren || ''
        next[`orias-${c.contrat_id}`] = c.orias_numero || ''
        next[`ech-${c.contrat_id}`] = c.orias_echeance || ''
      }
      for (const u of urs) {
        next[`m-${u.contrat_id}-${u.trimestre}`] = u.montant_declare == null ? '' : String(u.montant_declare)
      }
      setChamps(next)
    } catch (e) {
      if (seq === sequence.current) toast.error('Chargement impossible : ' + (e.message || ''))
    } finally {
      if (seq === sequence.current) setLoading(false)
    }
    // Commissions : calcul serveur (bareme confidentiel). Un echec ne bloque
    // pas la page mais doit etre VISIBLE, sinon un ecart de zero passerait
    // pour une sur declaration normale.
    try {
      const { commissions: c } = await service.commissionsTrimestrielles(annee)
      if (seq !== sequence.current) return
      setCommissions(c || {})
      setCommErreur(null)
    } catch (e) {
      console.error('[mandataires] commissions', e)
      if (seq !== sequence.current) return
      setCommissions(null)
      setCommErreur(e.message || 'calcul indisponible')
    }
  }
  useEffect(() => { reload() }, [annee])   // eslint-disable-line react-hooks/exhaustive-deps

  // Trimestres reellement couverts par le mandat : calcul LOCAL a partir des
  // dates du contrat. Ne jamais dependre de la reponse serveur : si le calcul
  // des commissions echoue, les trimestres hors mandat redeviendraient
  // exigibles et relancables.
  const couvertsDe = (m) => [1, 2, 3, 4].filter((t) => {
    const debutT = `${annee}-${String((t - 1) * 3 + 1).padStart(2, '0')}-01`
    const finT = new Date(annee, t * 3, 0)
    const finTIso = `${annee}-${String(t * 3).padStart(2, '0')}-${String(finT.getDate()).padStart(2, '0')}`
    return (!m.date_debut || m.date_debut <= finTIso) && (!m.date_fin || m.date_fin >= debutT)
  })

  const confDe = (id) => conformites.find((c) => c.contrat_id === id) || {}
  const ursDe = (id, t) => urssaf.find((u) => u.contrat_id === id && u.trimestre === t) || {}
  const champ = (cle) => champs[cle] ?? ''
  const setChamp = (cle, v) => setChamps((p) => ({ ...p, [cle]: v }))

  // ── Enregistrements ─────────────────────────────────────────────────────
  const majConformite = async (contratId, patch) => {
    try {
      const ligne = await service.saveConformite(contratId, patch)
      setConformites((prev) => [...prev.filter((c) => c.contrat_id !== contratId), ligne])
      return ligne
    } catch (e) {
      toast.error('Enregistrement impossible : ' + (e.message || ''))
      return null
    }
  }

  const majUrssaf = async (contratId, trimestre, patch) => {
    try {
      const ligne = await service.saveUrssaf({ contrat_id: contratId, annee, trimestre, ...patch })
      setUrssaf((prev) => [...prev.filter((u) => !(u.contrat_id === contratId && u.trimestre === trimestre)), ligne])
      return ligne
    } catch (e) {
      toast.error('Enregistrement impossible : ' + (e.message || ''))
      return null
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  const verifierInpi = async (m) => {
    // On lit la SAISIE en cours, pas l etat enregistre : sinon le premier
    // clic apres une frappe travaillerait sur l ancienne valeur.
    const siren = String(champ(`siren-${m.id}`)).replace(/\s/g, '')
    if (!/^\d{9}$/.test(siren)) { toast.error('Saisis un SIREN à 9 chiffres'); return }
    setBusy(`inpi-${m.id}`)
    try {
      const r = await service.verifierInpi(siren)
      await majConformite(m.id, {
        siren,
        denomination: r.denomination || null,
        forme_juridique: r.forme_juridique || null,
        inpi_statut: r.statut,
        inpi_immatriculation: r.immatriculation || null,
        inpi_detail: r.detail || null,
        inpi_verifie_le: new Date().toISOString(),
      })
      if (r.statut === 'actif') toast.success(`Immatriculation active : ${r.denomination || siren}`)
      else if (r.statut === 'cessee') toast.error('Entreprise cessée au registre !')
      else toast.error('SIREN introuvable au registre')
    } catch (e) {
      toast.error('Vérification impossible : ' + (e.message || ''))
    } finally { setBusy(null) }
  }

  const controlerOrias = async (m) => {
    const numero = String(champ(`orias-${m.id}`)).trim()
    const echeance = champ(`ech-${m.id}`) || null
    if (!numero) { toast.error('Saisis le numéro ORIAS'); return }
    if (!echeance) { toast.error('Saisis l échéance de renouvellement'); return }
    const ok = await majConformite(m.id, {
      orias_numero: numero,
      orias_echeance: echeance,
      orias_statut: 'ok',
      orias_verifie_le: new Date().toISOString().slice(0, 10),
    })
    if (ok) toast.success('Contrôle ORIAS enregistré')
  }

  const relancer = async (m, t) => {
    const email = m.profile?.email
    if (!email) { toast.error('Aucune adresse mail connue pour ce mandataire'); return }
    if (!confirm(
      `Envoyer un mail à ${m.full_name} (${email}) pour réclamer sa déclaration URSSAF du T${t} ${annee} ?\n\n`
      + `Le mail partira de la boîte Entasis, avec ton adresse en réponse.`
    )) return
    setBusy(`relance-${m.id}-${t}`)
    try {
      const r = await service.relancerUrssaf(m.id, annee, t)
      if (r.avertissement) toast(`Relance envoyée à ${email}, mais ${r.avertissement.toLowerCase()}`)
      else toast.success(`Relance envoyée à ${email}`)
      await reload()
    } catch (e) {
      toast.error('Envoi impossible : ' + (e.message || ''))
    } finally { setBusy(null) }
  }

  const joindre = async (m, t, ev) => {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('Fichier trop lourd (20 Mo max)'); return }
    setBusy(`doc-${m.id}-${t}`)
    try {
      const ancien = ursDe(m.id, t).document_path
      const path = await service.uploadJustificatif(m.id, annee, t, file)
      const ok = await majUrssaf(m.id, t, { document_path: path })
      if (ok && ancien) { try { await service.supprimerJustificatif(ancien) } catch { /* best effort */ } }
      if (ok) toast.success('Justificatif archivé')
    } catch (err) {
      toast.error('Envoi impossible : ' + (err.message || ''))
    } finally { setBusy(null) }
  }

  const ouvrirDoc = async (path) => {
    try { window.open(await service.urlJustificatif(path), '_blank', 'noopener') }
    catch (e) { toast.error('Ouverture impossible : ' + (e.message || '')) }
  }

  const basculerValidation = async (m, t) => {
    const u = ursDe(m.id, t)
    if (u.valide) {
      await majUrssaf(m.id, t, { valide: false, valide_par: null, valide_le: null })
      return
    }
    // On valide la SAISIE en cours (enregistree au passage si besoin)
    const saisi = String(champ(`m-${m.id}-${t}`)).trim()
    if (saisi === '') { toast.error('Saisis d abord le montant déclaré'); return }
    const montant = Number(saisi)
    if (!Number.isFinite(montant) || montant < 0) { toast.error('Montant invalide'); return }
    if (commissions === null) { toast.error('Commissions non calculées : impossible de valider un écart'); return }
    const verse = Number(commissions?.[m.id]?.[`T${t}`] || 0)
    if (montant - verse < -TOLERANCE && !confirm(
      `${m.full_name} déclare ${fmtEur(montant)} au T${t} alors que nous lui avons versé ${fmtEur(verse)}.\n\n`
      + `Il déclare ${fmtEur(verse - montant)} de moins que nos commissions. Valider quand même ?`
    )) return
    const ok = await majUrssaf(m.id, t, {
      montant_declare: montant,
      valide: true,
      valide_par: profile?.full_name || 'Direction',
      valide_le: new Date().toISOString(),
    })
    if (ok) toast.success(`T${t} ${annee} validé`)
  }

  // ── Etat de conformite ──────────────────────────────────────────────────
  const alertes = (m) => {
    const conf = confDe(m.id)
    const out = []
    if (conf.inpi_statut === 'cessee') out.push('entreprise cessée')
    else if (conf.inpi_statut === 'introuvable') out.push('SIREN introuvable')
    else if (conf.inpi_statut !== 'actif') out.push('INPI à vérifier')

    if (conf.orias_statut !== 'ok') out.push('ORIAS à contrôler')
    else if (conf.orias_echeance && new Date(conf.orias_echeance) < new Date()) out.push('ORIAS expiré')
    else if (conf.orias_verifie_le
      && (Date.now() - new Date(conf.orias_verifie_le).getTime()) / 86400000 > VALIDITE_CONTROLE) {
      out.push('contrôle ORIAS de plus d un an')
    }

    const couverts = couvertsDe(m)
    for (const t of [1, 2, 3, 4]) {
      if (!trimestreExigible(annee, t)) continue
      if (!couverts.includes(t)) continue          // hors periode de mandat
      const u = ursDe(m.id, t)
      if (!u.valide) { out.push(`T${t} en attente`); continue }
      // Un trimestre valide mais sous declare reste un point d attention
      if (commissions) {
        const verse = Number(commissions?.[m.id]?.[`T${t}`] || 0)
        const dec = u.montant_declare == null ? null : Number(u.montant_declare)
        if (dec != null && dec - verse < -TOLERANCE) out.push(`T${t} sous-déclaré`)
      }
    }
    return out
  }

  const anneeCourante = new Date().getFullYear()
  const anneesDispo = [anneeCourante + 1, anneeCourante, anneeCourante - 1, anneeCourante - 2]

  // L en tete (et son selecteur d annee) est rendu dans TOUS les cas : sinon
  // choisir une annee sans mandataire enfermait l utilisateur dans un ecran
  // vide, sans moyen de revenir en arriere.
  const enTete = (
    <div className="section-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="section-kicker">Conformité · mandataires</div>
          <div className="section-title">Contrôle réglementaire</div>
          <div className="section-sub">
            Immatriculation INPI, habilitation ORIAS et déclarations URSSAF trimestrielles.
            Déclarer plus que nos commissions est normal (autres clients) : c est la sous-déclaration qui alerte.
          </div>
        </div>
      <select className="filter-select" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
        {anneesDispo.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  )

  if (loading) {
    return (
      <div>
        {enTete}
        <div className="card card-p" style={{ textAlign: 'center', padding: 28, color: 'var(--t3)', fontSize: 13 }}>
          Chargement…
        </div>
      </div>
    )
  }

  if (mandataires.length === 0) {
    return (
      <div>
        {enTete}
        <div className="card card-p" style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--t3)', fontSize: 13 }}>
          Aucun mandataire sur {annee}. Change d année ci-dessus, ou crée un contrat de type Mandataire.
        </div>
      </div>
    )
  }

  return (
    <div>
      {enTete}

      {commErreur && (
        <div className="card card-p mb-24" style={{
          borderLeft: '3px solid var(--danger, #c0392b)', color: 'var(--danger, #c0392b)', fontSize: 13,
        }}>
          ⚠ Commissions versées non calculées ({commErreur}). Les écarts et la validation sont désactivés
          tant que le calcul n a pas abouti : un écart affiché serait faux.
        </div>
      )}

      {mandataires.map((m) => {
        const conf = confDe(m.id)
        const pbs = alertes(m)
        const comm = commissions?.[m.id] || null
        const couverts = couvertsDe(m)
        const termine = m.date_fin && new Date(m.date_fin) < new Date()
        return (
          <div className="card mb-24" key={m.id}>
            <div className="panel-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>
                  {m.full_name}
                  {termine && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--t3)' }}>
                      mandat terminé le {fmtDate(m.date_fin)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                  {m.profile?.email || 'sans adresse mail'}
                  {conf.denomination ? ` · ${conf.denomination}` : ''}
                  {m.date_debut ? ` · mandat depuis le ${fmtDate(m.date_debut)}` : ''}
                </div>
              </div>
              <span style={{
                flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                background: pbs.length === 0 ? 'rgba(52,199,89,0.12)' : 'rgba(255,149,0,0.12)',
                color: pbs.length === 0 ? 'var(--signed, #34C759)' : '#B26B00',
              }} title={pbs.join(' · ')}>
                {pbs.length === 0 ? '✓ Conforme' : `${pbs.length} point${pbs.length > 1 ? 's' : ''} à traiter`}
              </span>
            </div>

            <div className="panel-body">
              <div className="form-row form-row-2" style={{ marginBottom: 4 }}>
                {/* Immatriculation INPI */}
                <div className="form-group">
                  <label className="form-label">Immatriculation INPI</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="form-input"
                      placeholder="SIREN (9 chiffres)"
                      inputMode="numeric"
                      value={champ(`siren-${m.id}`)}
                      onChange={(e) => setChamp(`siren-${m.id}`, e.target.value)}
                      onBlur={(e) => {
                        const v = e.target.value.replace(/\s/g, '')
                        if (v !== (conf.siren || '')) majConformite(m.id, { siren: v || null })
                      }}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ flexShrink: 0 }}
                      disabled={busy === `inpi-${m.id}`}
                      onClick={() => verifierInpi(m)}
                    >
                      {busy === `inpi-${m.id}` ? '…' : 'Vérifier'}
                    </button>
                  </div>
                  <div className="form-hint">
                    {conf.inpi_verifie_le ? (
                      <span style={{ color: conf.inpi_statut === 'actif' ? 'var(--signed, #34C759)' : 'var(--danger, #c0392b)', fontWeight: 600 }}>
                        {conf.inpi_statut === 'actif' ? '✓ Immatriculation active'
                          : conf.inpi_statut === 'cessee' ? '⚠ Entreprise cessée' : '⚠ Introuvable au registre'}
                        <span style={{ color: 'var(--t3)', fontWeight: 400 }}>
                          {conf.inpi_immatriculation ? ` · depuis le ${fmtDate(conf.inpi_immatriculation)}` : ''}
                          {conf.inpi_detail ? ` · ${conf.inpi_detail}` : ''}
                          {` · vérifié le ${fmtDate(conf.inpi_verifie_le)}`}
                        </span>
                      </span>
                    ) : 'Jamais vérifié. Saisis le SIREN puis clique Vérifier (registre national des entreprises).'}
                  </div>
                </div>

                {/* Habilitation ORIAS */}
                <div className="form-group">
                  <label className="form-label">
                    Habilitation ORIAS
                    <a href={URL_ORIAS} target="_blank" rel="noopener noreferrer"
                       style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--gold-dk, #A6843F)' }}>
                      ouvrir le registre ↗
                    </a>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="form-input"
                      placeholder="N° ORIAS"
                      value={champ(`orias-${m.id}`)}
                      onChange={(e) => setChamp(`orias-${m.id}`, e.target.value)}
                    />
                    <input
                      className="form-input"
                      type="date"
                      style={{ maxWidth: 150 }}
                      title="Échéance de renouvellement"
                      value={champ(`ech-${m.id}`)}
                      onChange={(e) => setChamp(`ech-${m.id}`, e.target.value)}
                    />
                    <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => controlerOrias(m)}>
                      Contrôlé
                    </button>
                  </div>
                  <div className="form-hint">
                    {conf.orias_verifie_le ? (() => {
                      const expire = conf.orias_echeance && new Date(conf.orias_echeance) < new Date()
                      const vieux = (Date.now() - new Date(conf.orias_verifie_le).getTime()) / 86400000 > VALIDITE_CONTROLE
                      const ko = expire || vieux
                      return (
                        <span style={{ color: ko ? 'var(--danger, #c0392b)' : 'var(--signed, #34C759)', fontWeight: 600 }}>
                          {expire ? '⚠ Habilitation expirée' : vieux ? '⚠ Contrôle de plus d un an' : '✓ Habilitation contrôlée'}
                          <span style={{ color: 'var(--t3)', fontWeight: 400 }}>
                            {` · le ${fmtDate(conf.orias_verifie_le)}`}
                            {conf.orias_echeance ? ` · échéance ${fmtDate(conf.orias_echeance)}` : ''}
                          </span>
                        </span>
                      )
                    })() : 'Jamais contrôlé. Cherche le mandataire au registre ORIAS, saisis son numéro et l échéance, puis clique Contrôlé.'}
                  </div>
                </div>
              </div>

              {/* Declarations URSSAF */}
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--gold-dk, #A6843F)', margin: '14px 0 6px', paddingBottom: 4,
                borderBottom: '1px solid rgba(201,169,97,0.25)',
              }}>
                Déclarations URSSAF {annee}
                {comm?.sansDate > 0 && (
                  <span style={{ marginLeft: 10, textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--danger, #c0392b)' }}>
                    · {comm.sansDate} dossier{comm.sansDate > 1 ? 's' : ''} signé{comm.sansDate > 1 ? 's' : ''} sans date, non rattaché{comm.sansDate > 1 ? 's' : ''} à un trimestre
                  </span>
                )}
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Trimestre</th>
                      <th>Échéance</th>
                      <th style={{ textAlign: 'right' }}>Commissions versées</th>
                      <th style={{ textAlign: 'right' }}>Montant déclaré</th>
                      <th>Écart</th>
                      <th>Justificatif</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((t) => {
                      const u = ursDe(m.id, t)
                      const horsMandat = !couverts.includes(t)
                      const verse = commissions === null ? null : Number(comm?.[`T${t}`] || 0)
                      const saisi = champ(`m-${m.id}-${t}`)
                      const declare = saisi === '' ? null : Number(saisi)
                      const ecart = (declare == null || verse == null) ? null : declare - verse
                      const ech = echeanceUrssaf(annee, t)
                      const exigible = trimestreExigible(annee, t)
                      const enRetard = exigible && !horsMandat && ech && new Date() > ech && !u.valide
                      return (
                        <tr key={`${annee}-${t}`} style={{ opacity: horsMandat ? 0.4 : exigible ? 1 : 0.6 }}>
                          <td>
                            <div className="cell-primary">T{t}</div>
                            <div className="cell-sub">{['janv-mars', 'avr-juin', 'juil-sept', 'oct-déc'][t - 1]}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: 12.5 }}>{fmtDate(ech)}</div>
                            <div className="cell-sub" style={{ color: enRetard ? 'var(--danger, #c0392b)' : undefined }}>
                              {horsMandat ? 'hors mandat'
                                : !exigible ? 'trimestre en cours'
                                  : u.valide ? 'validé'
                                    : enRetard ? 'échéance dépassée'
                                      : ECHEANCES_URSSAF[t].libelle}
                            </div>
                          </td>
                          <td className="cell-mono" style={{ textAlign: 'right' }}>
                            {horsMandat ? <span style={{ color: 'var(--t3)' }}>—</span>
                              : verse == null ? <span style={{ color: 'var(--danger, #c0392b)', fontSize: 11 }}>non calculé</span>
                                : verse > 0 ? fmtEur(verse) : <span style={{ color: 'var(--t3)' }}>0 €</span>}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              className="form-input"
                              type="number"
                              step="1"
                              min="0"
                              style={{ maxWidth: 120, textAlign: 'right', padding: '5px 8px' }}
                              placeholder="—"
                              value={saisi}
                              disabled={u.valide || horsMandat}
                              onChange={(e) => setChamp(`m-${m.id}-${t}`, e.target.value)}
                              onBlur={(e) => {
                                const v = e.target.value === '' ? null : Number(e.target.value)
                                const actuel = u.montant_declare == null ? null : Number(u.montant_declare)
                                if (v !== actuel) majUrssaf(m.id, t, { montant_declare: v })
                              }}
                            />
                          </td>
                          <td>
                            {horsMandat || ecart == null ? <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span> : (() => {
                              const sous = ecart < -TOLERANCE
                              const egal = Math.abs(ecart) <= TOLERANCE
                              return (
                                <span
                                  title={sous ? 'Déclare moins que ce que nous lui avons versé : à éclaircir'
                                    : egal ? 'Montants concordants'
                                      : 'Déclare plus que nos commissions : normal s il a d autres clients'}
                                  style={{
                                    fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                                    background: sous ? 'rgba(255,59,48,0.10)' : egal ? 'rgba(52,199,89,0.12)' : 'rgba(0,113,227,0.08)',
                                    color: sous ? '#FF3B30' : egal ? 'var(--signed, #34C759)' : '#0071E3',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {sous ? `sous-déclaré ${fmtEur(Math.abs(ecart))}` : egal ? 'concordant' : `+${fmtEur(ecart)}`}
                                </span>
                              )
                            })()}
                          </td>
                          <td>
                            {u.document_path ? (
                              <button
                                onClick={() => ouvrirDoc(u.document_path)}
                                style={{
                                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                  fontSize: 12, fontWeight: 600, color: 'var(--t1)', fontFamily: 'inherit',
                                  textDecoration: 'underline', textUnderlineOffset: 3,
                                }}
                              >📎 voir</button>
                            ) : horsMandat ? <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span> : (
                              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                                {busy === `doc-${m.id}-${t}` ? '…' : '+ Joindre'}
                                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.heic" style={{ display: 'none' }}
                                       onChange={(e) => joindre(m, t, e)} />
                              </label>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {!horsMandat && (
                              <>
                                <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                                  {exigible && !u.valide && (
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      disabled={busy === `relance-${m.id}-${t}`}
                                      title={u.relance_le ? `Dernière relance le ${fmtDate(u.relance_le)}` : 'Envoyer un mail au mandataire'}
                                      onClick={() => relancer(m, t)}
                                    >
                                      {busy === `relance-${m.id}-${t}` ? '…' : u.relance_le ? '↻ Relancer' : '✉ Relancer'}
                                    </button>
                                  )}
                                  <button
                                    className={u.valide ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                                    disabled={!u.valide && commissions === null}
                                    onClick={() => basculerValidation(m, t)}
                                    title={u.valide ? `Validé le ${fmtDate(u.valide_le)} par ${u.valide_par || 'la direction'}`
                                      : commissions === null ? 'Validation impossible : commissions non calculées'
                                        : 'Valider le montant déclaré'}
                                  >
                                    {u.valide ? '✓ Validé' : 'Valider'}
                                  </button>
                                </div>
                                {u.relance_le && !u.valide && (
                                  <div className="cell-sub" style={{ marginTop: 2 }}>relancé le {fmtDate(u.relance_le)}</div>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
