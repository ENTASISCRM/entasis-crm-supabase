// src/components/MesStructures.jsx
// Sous vue « Mes structurés » de l onglet UCS : ou en sont les produits
// structures que le cabinet a reellement places, avec l encours pose sur
// chacun et sa derniere valorisation connue.
//
// Demande de la direction du 16/09/2026. Ce que l ecran doit rendre evident :
//   - la valeur affichee vient du reporting du structureur, saisie a la main,
//     avec sa date. Aucune cotation publique n existe pour ces EMTN. La date
//     est donc toujours a cote de la valeur, coloree quand elle vieillit ;
//   - la saisie est rapide : l encours se corrige dans la ligne, une
//     valorisation se pose en trois champs sous la ligne ;
//   - pas de graphique : dix supports, une liste datee se lit mieux et ne
//     fait pas croire a une courbe continue la ou il y a des points mensuels.
//
// La base reserve ces donnees a la direction (est_direction_pnl, drapeau
// acces_pnl) : un manager sans le drapeau verrait une liste vide et ses
// saisies seraient refusees. On le lui dit plutot que de le laisser chercher.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { logger } from '../lib/logger'
import { messageErreur } from '../lib/ui-shared'
import { SkeletonCards } from './ui/Skeleton'
import * as positions from '../services/ucsPositions'

const {
  dateLocaleIso, joursDepuis, fraicheurValo, performanceDepuisPair, valeurEstimee,
  prochaineConstatation, couponAnnualise, trierPositions, totauxPositions,
  fmtEuro, fmtValo, fmtPoints, fmtDateFr, SOURCE_PAR_DEFAUT,
} = positions

const LIBELLE_ETAT = { EN_COURS: 'En cours', CLOTURE: 'Clôturé', ANNULATION: 'Annulé' }
const CLASSE_ETAT = { EN_COURS: 'badge-signed', CLOTURE: 'badge-progress', ANNULATION: 'badge-cancelled' }

const COULEUR_FRAICHEUR = {
  recente: 'var(--t2)',
  ancienne: '#B36B00',
  perimee: 'var(--cancelled)',
}

const CELLULE_NOMBRE = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
const EN_TETE_NOMBRE = { textAlign: 'right', whiteSpace: 'normal', lineHeight: 1.25, maxWidth: 120 }

// « il y a 3 jours », « aujourd hui » : la phrase que la direction lit avant
// la date elle meme.
function ageEnMots(jours) {
  if (jours == null) return ''
  if (jours <= 0) return 'aujourd hui'
  if (jours === 1) return 'hier'
  if (jours < 60) return `il y a ${jours} jours`
  return `il y a ${Math.round(jours / 30)} mois`
}

export default function MesStructures({ profile }) {
  const aujourdhui = dateLocaleIso()
  const [ucs, setUcs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Une seule ligne depliee a la fois, en saisie ou en historique : l ecran
  // reste court et on ne se trompe pas de ligne au moment d enregistrer.
  const [depliee, setDepliee] = useState(null)   // { id, mode: 'saisie' | 'historique' }
  const [historiques, setHistoriques] = useState({})

  const accesDirection = profile?.acces_pnl === true

  const recharger = useCallback(async () => {
    setLoading(true)
    try {
      const data = await positions.listPositions()
      setUcs(data)
      setError('')
    } catch (e) {
      logger.warn('[MesStructures] lecture', e)
      setError(messageErreur(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!accesDirection) { setLoading(false); return }
    recharger()
  }, [accesDirection, recharger])

  const lignes = useMemo(() => trierPositions(ucs), [ucs])
  const totaux = useMemo(() => totauxPositions(ucs), [ucs])

  const chargerHistorique = useCallback(async (id) => {
    try {
      const h = await positions.listHistorique(id)
      setHistoriques((prev) => ({ ...prev, [id]: h }))
    } catch (e) {
      toast.error(`Historique : ${messageErreur(e)}`)
    }
  }, [])

  const basculer = (id, mode) => {
    if (depliee?.id === id && depliee.mode === mode) { setDepliee(null); return }
    setDepliee({ id, mode })
    if (mode === 'historique' && !historiques[id]) chargerHistorique(id)
  }

  const enregistrerEncours = async (u, saisie) => {
    try {
      const montant = await positions.updateEncours(u.id, saisie)
      setUcs((prev) => prev.map((x) => (x.id === u.id ? { ...x, encours_place: montant } : x)))
      toast.success(`Encours enregistré sur ${u.nom_ucs}`)
    } catch (e) {
      toast.error(messageErreur(e))
      throw e
    }
  }

  const enregistrerValorisation = async (u, saisie) => {
    await positions.saisirValorisation(u.id, saisie, { saisi_par: profile?.id || null })
    toast.success(`Valorisation du ${fmtDateFr(saisie.date_valo)} enregistrée sur ${u.nom_ucs}`)
    // La base recalcule derniere_valo par declencheur : on relit plutot que
    // de deviner si la date saisie est bien la plus recente.
    setHistoriques((prev) => { const n = { ...prev }; delete n[u.id]; return n })
    setDepliee(null)
    await recharger()
  }

  if (!accesDirection) {
    return (
      <div className="notice notice-warn">
        Cet écran lit les encours et les valorisations des produits structurés, réservés par la base au
        porteur de l accès direction. Votre profil ne le porte pas : la liste serait vide et toute saisie refusée.
      </div>
    )
  }

  return (
    <div>
      <div className="section-header" style={{ flexWrap: 'wrap' }}>
        <div>
          <div className="section-kicker">Direction · suivi des encours</div>
          <div className="section-title">Mes structurés</div>
          <div className="section-sub" style={{ marginTop: 6, maxWidth: 720 }}>
            Valorisations saisies depuis le reporting du structureur, aucune cotation publique n existe pour ces
            supports. La date à côté de chaque valeur dit de quand elle date.
          </div>
        </div>
        <button className="btn btn-outline btn-sm" type="button" onClick={recharger} disabled={loading}>
          Recharger
        </button>
      </div>

      {loading && <SkeletonCards n={3} />}
      {error && !loading && <div className="notice notice-error">{error}</div>}

      {!loading && !error && (
        <>
          <Totaux totaux={totaux} aujourdhui={aujourdhui} />

          {lignes.length === 0 ? (
            <div className="table-empty-state">
              <div className="empty-title">Aucune UCS en cours</div>
              <div className="empty-sub">Le catalogue ne porte aucun produit en cours ni aucun encours placé.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: 12.5, tableLayout: 'auto' }}>
                  <thead>
                    <tr>
                      {/* En tetes sur deux lignes : la table doit tenir sans
                          defilement lateral sur un ecran de direction. */}
                      <th>UCS</th>
                      <th style={EN_TETE_NOMBRE}>Encours placé</th>
                      <th style={EN_TETE_NOMBRE}>Dernière valorisation</th>
                      <th style={EN_TETE_NOMBRE}>Valeur estimée</th>
                      <th style={EN_TETE_NOMBRE}>Écart au pair</th>
                      <th style={EN_TETE_NOMBRE}>Coupon par an</th>
                      <th style={EN_TETE_NOMBRE} title="Estimée depuis la fin de commercialisation et la fréquence de constatation, à vérifier sur la brochure">
                        Prochaine constatation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((u) => (
                      <Fragment key={u.id}>
                        <Ligne
                          u={u}
                          aujourdhui={aujourdhui}
                          depliee={depliee?.id === u.id ? depliee.mode : null}
                          onBasculer={(mode) => basculer(u.id, mode)}
                          onEncours={(saisie) => enregistrerEncours(u, saisie)}
                        />
                        {depliee?.id === u.id && depliee.mode === 'saisie' && (
                          <tr>
                            <td colSpan={7} style={{ background: 'var(--bg)', padding: '12px 16px' }}>
                              <FormValorisation
                                u={u}
                                aujourdhui={aujourdhui}
                                onEnregistrer={(saisie) => enregistrerValorisation(u, saisie)}
                                onAnnuler={() => setDepliee(null)}
                              />
                            </td>
                          </tr>
                        )}
                        {depliee?.id === u.id && depliee.mode === 'historique' && (
                          <tr>
                            <td colSpan={7} style={{ background: 'var(--bg)', padding: '12px 16px' }}>
                              <Historique lignes={historiques[u.id]} aujourdhui={aujourdhui} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Chiffres de tete ───────────────────────────────────────────────────────
function Totaux({ totaux, aujourdhui }) {
  const { encoursTotal, valeurEstimeeTotal, nbValorisees, nbSansValo, plusAncienne } = totaux
  const jours = plusAncienne ? joursDepuis(plusAncienne.date, aujourdhui) : null
  const fraicheur = plusAncienne ? fraicheurValo(plusAncienne.date, aujourdhui) : null
  return (
    <>
      <div className="kpi-grid mb-24">
        <div className="kpi-card kpi-card-gold">
          <div className="kpi-label">Encours placé</div>
          <div className="kpi-value">{fmtEuro(encoursTotal) || '0 €'}</div>
          <div className="kpi-hint">Montants saisis par la direction, hors dossiers</div>
        </div>
        <div className="kpi-card kpi-card-blue">
          <div className="kpi-label">Valeur estimée</div>
          <div className="kpi-value">{nbValorisees ? fmtEuro(valeurEstimeeTotal) : 'aucune valorisation'}</div>
          <div className="kpi-hint">
            {nbValorisees
              ? `Sur ${nbValorisees} UCS valorisée${nbValorisees > 1 ? 's' : ''}${nbSansValo ? `, ${nbSansValo} sans valorisation non comptée${nbSansValo > 1 ? 's' : ''}` : ''}`
              : 'Encours multiplié par la dernière valorisation connue'}
          </div>
        </div>
        <div className="kpi-card" style={fraicheur && fraicheur !== 'recente' ? { borderTop: `2px solid ${COULEUR_FRAICHEUR[fraicheur]}` } : undefined}>
          <div className="kpi-label">Valorisation la plus ancienne</div>
          <div className="kpi-value" style={fraicheur ? { color: COULEUR_FRAICHEUR[fraicheur] } : undefined}>
            {plusAncienne ? fmtDateFr(plusAncienne.date) : 'aucune'}
          </div>
          <div className="kpi-hint">
            {plusAncienne ? `${ageEnMots(jours)} · ${plusAncienne.nom}` : 'Parmi les UCS qui portent un encours'}
          </div>
        </div>
      </div>
      {nbSansValo > 0 && (
        <div className="notice notice-warn">
          {nbSansValo === 1
            ? 'Une UCS porte un encours sans aucune valorisation : sa valeur estimée est inconnue et n entre pas dans le total.'
            : `${nbSansValo} UCS portent un encours sans aucune valorisation : leur valeur estimée est inconnue et n entre pas dans le total.`}
        </div>
      )}
    </>
  )
}

// ─── Une ligne du tableau ───────────────────────────────────────────────────
function Ligne({ u, aujourdhui, depliee, onBasculer, onEncours }) {
  const encours = Number(u.encours_place) || 0
  const valo = u.derniere_valo == null ? null : Number(u.derniere_valo)
  const perf = performanceDepuisPair(valo)
  const valeur = valeurEstimee(encours, valo)
  const fraicheur = fraicheurValo(u.derniere_valo_le, aujourdhui)
  const jours = joursDepuis(u.derniere_valo_le, aujourdhui)
  const coupon = couponAnnualise(u)
  const prochaine = prochaineConstatation(u, aujourdhui)
  const joursAvant = prochaine ? -joursDepuis(prochaine, aujourdhui) : null

  return (
    <tr>
      <td style={{ minWidth: 280, maxWidth: 380, whiteSpace: 'normal' }}>
        <div className="cell-primary">
          {u.nom_ucs}
          {u.etat !== 'EN_COURS' && (
            <span className={`badge ${CLASSE_ETAT[u.etat] || 'badge-normal'}`} style={{ marginLeft: 8, verticalAlign: 'middle' }}>
              {LIBELLE_ETAT[u.etat] || u.etat}
            </span>
          )}
        </div>
        <div className="cell-sub">
          <span style={{ fontFamily: 'monospace' }}>{u.code_isin}</span>
          {' · '}{u.compagnie}
          {' · '}
          {u.structureur?.nom
            ? u.structureur.nom
            : <span style={{ fontStyle: 'italic' }}>structureur à compléter</span>}
        </div>
        {/* Les gestes vivent sous le nom : une colonne de plus ne tenait pas
            dans la largeur d un ecran de direction sans defilement lateral. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            type="button"
            className={`btn btn-sm ${depliee === 'saisie' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onBasculer('saisie')}
          >
            Saisir une valorisation
          </button>
          <button
            type="button"
            className={`btn btn-sm ${depliee === 'historique' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onBasculer('historique')}
          >
            Historique
          </button>
        </div>
      </td>
      <td style={CELLULE_NOMBRE}>
        <ChampEncours valeur={encours} onEnregistrer={onEncours} />
      </td>
      <td style={CELLULE_NOMBRE}>
        {valo == null ? (
          <span style={{ color: 'var(--t3)' }}>aucune</span>
        ) : (
          <>
            <div style={{ fontWeight: 600 }}>{fmtValo(valo)}</div>
            <div className="cell-sub" style={{ color: COULEUR_FRAICHEUR[fraicheur] || 'var(--t3)', fontWeight: fraicheur === 'perimee' ? 600 : 400 }}
              title={`Valorisation du ${fmtDateFr(u.derniere_valo_le)}`}>
              {fmtDateFr(u.derniere_valo_le)} · {ageEnMots(jours)}
            </div>
          </>
        )}
      </td>
      <td style={{ ...CELLULE_NOMBRE, fontWeight: 600 }}>
        {valeur == null ? <span style={{ color: 'var(--t3)', fontWeight: 400 }}>{encours > 0 ? 'inconnue' : ''}</span> : fmtEuro(valeur)}
      </td>
      <td style={{ ...CELLULE_NOMBRE, fontWeight: 600, color: perf == null ? 'var(--t3)' : perf > 0 ? 'var(--signed)' : perf < 0 ? 'var(--cancelled)' : 'var(--t2)' }}>
        {perf == null ? '' : fmtPoints(perf)}
      </td>
      <td style={CELLULE_NOMBRE}>
        {coupon == null ? <span style={{ color: 'var(--t3)' }}>à compléter</span> : fmtValo(coupon)}
      </td>
      <td style={CELLULE_NOMBRE}>
        {prochaine ? (
          <>
            <div>{fmtDateFr(prochaine)}</div>
            <div className="cell-sub">dans {joursAvant} jour{joursAvant > 1 ? 's' : ''}</div>
          </>
        ) : (
          <span style={{ color: 'var(--t3)' }}>
            {(u.constatation || u.frequence_coupon) === 'QUOTIDIENNE' ? 'quotidienne' : 'inconnue'}
          </span>
        )}
      </td>
    </tr>
  )
}

// ─── Encours editable en place ──────────────────────────────────────────────
// Un champ texte qui affiche le montant formate au repos et le brut en
// edition. Enregistre a la sortie du champ ou sur Entrée, seulement si la
// valeur a change ; Échap rend la valeur d origine.
function ChampEncours({ valeur, onEnregistrer }) {
  const [edition, setEdition] = useState(false)
  const [brut, setBrut] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const ouvrir = () => { setBrut(valeur ? String(valeur) : ''); setEdition(true) }

  const valider = async () => {
    setEdition(false)
    const nouveau = positions.lireMontant(brut)
    if (nouveau == null && brut.trim() !== '') { toast.error('Montant illisible.'); return }
    if ((nouveau ?? 0) === (Number(valeur) || 0)) return
    setEnvoi(true)
    try {
      await onEnregistrer(brut.trim() === '' ? '0' : brut)
    } catch {
      // Le message est deja affiche par le parent ; on garde la valeur
      // d origine a l ecran.
    } finally {
      setEnvoi(false)
    }
  }

  if (!edition) {
    return (
      <button
        type="button"
        onClick={ouvrir}
        disabled={envoi}
        title="Modifier l encours placé"
        style={{
          background: 'transparent', border: '0.5px dashed var(--bd-strong)', borderRadius: 'var(--rad-sm)',
          padding: '4px 8px', fontFamily: 'inherit', fontSize: 13, fontWeight: valeur ? 600 : 400,
          color: valeur ? 'var(--t1)' : 'var(--t3)', cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {envoi ? 'enregistrement' : (valeur ? fmtEuro(valeur) : 'à saisir')}
      </button>
    )
  }
  return (
    <input
      className="form-input"
      autoFocus
      inputMode="decimal"
      value={brut}
      onChange={(e) => setBrut(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
        if (e.key === 'Escape') { setBrut(valeur ? String(valeur) : ''); setEdition(false) }
      }}
      placeholder="0"
      aria-label="Encours placé en euros"
      style={{ width: 130, textAlign: 'right', height: 30, padding: '0 8px', fontSize: 13 }}
    />
  )
}

// ─── Saisie d une valorisation sous la ligne ────────────────────────────────
function FormValorisation({ u, aujourdhui, onEnregistrer, onAnnuler }) {
  const [f, setF] = useState({ date_valo: aujourdhui, valeur: '', source: SOURCE_PAR_DEFAUT })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const maj = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }))

  const soumettre = async (e) => {
    e.preventDefault()
    setErreur('')
    let propre
    try {
      propre = positions.preparerValorisation(f, aujourdhui)
    } catch (err) {
      setErreur(err.message)
      return
    }
    setEnvoi(true)
    try {
      await onEnregistrer(propre)
    } catch (err) {
      setErreur(messageErreur(err))
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={soumettre} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
      <div style={{ flex: '1 1 100%', fontSize: 12.5, color: 'var(--t2)' }}>
        Nouvelle valorisation de <strong>{u.nom_ucs}</strong>, en pour cent du nominal (100 = pair).
        {u.derniere_valo != null && ` Dernière connue : ${fmtValo(u.derniere_valo)} au ${fmtDateFr(u.derniere_valo_le)}.`}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="form-label">Date de la valorisation</span>
        <input className="form-input" type="date" required max={aujourdhui} value={f.date_valo} onChange={maj('date_valo')} style={{ width: 170 }} />
        <span className="form-hint">Celle du reporting, pas celle de la saisie</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="form-label">Valeur en %</span>
        <input className="form-input" autoFocus inputMode="decimal" required placeholder="98,5" value={f.valeur} onChange={maj('valeur')} style={{ width: 120 }} />
        <span className="form-hint">Jusqu à trois décimales</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px' }}>
        <span className="form-label">Source</span>
        <input className="form-input" value={f.source} onChange={maj('source')} placeholder={SOURCE_PAR_DEFAUT} />
        <span className="form-hint">Une valorisation par jour et par UCS, resaisir le même jour corrige</span>
      </label>
      <div style={{ display: 'flex', gap: 8, paddingBottom: 22 }}>
        <button className="btn btn-primary btn-sm" type="submit" disabled={envoi}>
          {envoi ? 'Enregistrement' : 'Enregistrer'}
        </button>
        <button className="btn btn-outline btn-sm" type="button" onClick={onAnnuler} disabled={envoi}>Annuler</button>
      </div>
      {erreur && <div className="notice notice-error" style={{ flex: '1 1 100%', marginBottom: 0 }}>{erreur}</div>}
    </form>
  )
}

// ─── Historique d une UCS ───────────────────────────────────────────────────
function Historique({ lignes, aujourdhui }) {
  if (!lignes) return <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>Chargement de l historique</div>
  if (lignes.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>Aucune valorisation saisie sur cette UCS.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 640 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 4 }}>
        {lignes.length} valorisation{lignes.length > 1 ? 's' : ''}, de la plus récente à la plus ancienne
      </div>
      {lignes.map((v, i) => {
        const precedente = lignes[i + 1]
        const ecart = precedente ? Number(v.valeur) - Number(precedente.valeur) : null
        return (
          <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '110px 90px 90px 1fr', gap: 12, fontSize: 12.5, alignItems: 'baseline' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--t2)' }} title={ageEnMots(joursDepuis(v.date_valo, aujourdhui))}>
              {fmtDateFr(v.date_valo)}
            </span>
            <span style={{ fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtValo(v.valeur)}</span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ecart == null ? 'var(--t3)' : ecart > 0 ? 'var(--signed)' : ecart < 0 ? 'var(--cancelled)' : 'var(--t3)' }}>
              {ecart == null ? '' : fmtPoints(ecart)}
            </span>
            <span style={{ color: 'var(--t3)' }}>{v.source || ''}</span>
          </div>
        )
      })}
    </div>
  )
}
