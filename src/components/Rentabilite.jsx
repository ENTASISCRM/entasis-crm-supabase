// ═══════════════════════════════════════════════════════════════════════════
// ESPACE RENTABILITE. Reserve, verrouille par un code, quatre vues.
//
// SECURITE, ce qui vaut d etre repete ici parce que le composant est la partie
// la plus visible et la moins protegee de la chaine :
//   - cet ecran n est meme pas rendu si le profil ne porte pas acces_pnl,
//     l entree de navigation n existe pas (src/lib/navigation.js)
//   - le jeton de deverrouillage vit en memoire dans src/lib/pnl-api.js,
//     jamais dans localStorage ni sessionStorage
//   - au rechargement de la page, l espace se reverrouille tout seul
//   - AUCUN taux, AUCUN parametre de cout n arrive jusqu ici : le serveur
//     envoie des montants deja calcules, le navigateur les met en forme
//   - a la fermeture du verrou, les donnees sont effacees de l etat React
//
// La vraie protection n est pas ici. Elle est dans api/pnl.js (deux jetons
// exiges) et dans la RLS (est_direction_pnl). Cet ecran est la couche de
// confort, pas la couche de securite.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { messageErreur } from '../lib/ui-shared'
import { SkeletonCards } from './ui/Skeleton'
import {
  deverrouiller, chargerRentabilite, verrouiller, estDeverrouille, tempsRestantMs,
} from '../lib/pnl-api'
import {
  MOIS_COURTS, salaries, mandataires, totaux, pointDeBascule, cumulerParMois,
  fmtEur, fmtRatio,
} from '../lib/pnl-calculs'

const VUES = [
  { cle: 'cabinet', label: 'Synthèse cabinet' },
  { cle: 'salaries', label: 'Salariés' },
  { cle: 'mandataires', label: 'Mandataires' },
  { cle: 'mensuel', label: 'CA mensuel' },
]

const anneesDispo = () => {
  const a = new Date().getFullYear()
  return [a, a - 1, a - 2]
}

// ─── Le verrou ────────────────────────────────────────────────────────────
function Verrou({ onOuvert }) {
  const [code, setCode] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)

  const soumettre = async (e) => {
    e.preventDefault()
    if (!code || enCours) return
    setEnCours(true); setErreur(null)
    try {
      await deverrouiller(code)
      setCode('')
      onOuvert()
    } catch (err) {
      // Le serveur ne dit jamais laquelle des barrieres a bloque : on ne
      // l invente pas non plus a l ecran.
      setErreur(err.bloqueJusqua
        ? 'Trop de tentatives. L accès est bloqué quinze minutes.'
        : messageErreur(err))
      setCode('')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, margin: '0 auto 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gold-subtle)', border: '1px solid var(--gold-line)',
        color: 'var(--gold-dk)',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 style={{ fontSize: 21, fontWeight: 700, color: 'var(--t1)', margin: '0 0 8px' }}>
        Chiffres &amp; Rentabilité
      </h2>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--t3)', margin: '0 0 24px' }}>
        Cet espace est réservé. Il se reverrouille à chaque rechargement de la page
        et au bout de quinze minutes.
      </p>
      <form onSubmit={soumettre}>
        <input
          className="form-input"
          type="password"
          autoFocus
          autoComplete="off"
          value={code}
          onChange={(e) => { setCode(e.target.value); setErreur(null) }}
          placeholder="Code d accès"
          style={{ textAlign: 'center', letterSpacing: '0.15em', marginBottom: 12 }}
        />
        <button className="btn btn-primary" type="submit" disabled={!code || enCours} style={{ width: '100%' }}>
          {enCours ? 'Vérification…' : 'Déverrouiller'}
        </button>
      </form>
      {erreur && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--cancelled)' }}>{erreur}</div>
      )}
    </div>
  )
}

// ─── Une carte de chiffre ─────────────────────────────────────────────────
const Carte = ({ label, valeur, aide, accent }) => (
  <div className="kpi-card" style={accent ? { borderTop: `2px solid ${accent}` } : undefined}>
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{valeur}</div>
    {aide && <div className="kpi-hint">{aide}</div>}
  </div>
)

const PastilleMarge = ({ marge }) => {
  const perte = Number(marge || 0) < 0
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
      color: perte ? '#B4453B' : '#1B7A3E',
      background: perte ? 'rgba(180,69,59,0.10)' : 'rgba(52,199,89,0.12)',
      whiteSpace: 'nowrap',
    }}>
      {perte ? 'en perte' : 'rentable'}
    </span>
  )
}

// ─── Tableau commun aux vues 2 et 3 ───────────────────────────────────────
function TableauPersonnes({ lignes, avecCouts }) {
  if (!lignes.length) {
    return (
      <div className="table-empty-state">
        <div className="empty-title">Aucune ligne</div>
        <div className="empty-sub">Rien à afficher pour cette année.</div>
      </div>
    )
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Personne</th>
            <th>Contrat</th>
            {avecCouts && <th style={{ textAlign: 'right' }}>Mois</th>}
            {avecCouts && <th style={{ textAlign: 'right' }}>Coût complet</th>}
            <th style={{ textAlign: 'right' }}>Contrats</th>
            <th style={{ textAlign: 'right' }}>Clients</th>
            <th style={{ textAlign: 'right' }}>PP annualisée</th>
            <th style={{ textAlign: 'right' }}>PU collectée</th>
            <th style={{ textAlign: 'right' }}>Commission</th>
            <th style={{ textAlign: 'right' }}>Marge</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.profile_id || l.nom}>
              <td>
                <div className="cell-primary">{l.nom || '—'}</div>
                <div className="cell-sub">{l.advisor_code || '—'}</div>
              </td>
              <td><span className="badge badge-normal">{l.type_contrat}</span></td>
              {avecCouts && <td style={{ textAlign: 'right' }}>{l.mois_actifs}</td>}
              {avecCouts && (
                <td style={{ textAlign: 'right' }}
                  title={`Salaire chargé ${fmtEur(l.cout_fixe)} · école ${fmtEur(l.cout_ecole)} · outils ${fmtEur(l.cout_outils)}${Number(l.cout_frais_fixes) ? ` · frais fixes ${fmtEur(l.cout_frais_fixes)}` : ''}`}>
                  {fmtEur(l.cout_total)}
                </td>
              )}
              <td style={{ textAlign: 'right' }}>{l.contrats_signes}</td>
              <td style={{ textAlign: 'right' }}>{l.clients_uniques}</td>
              <td style={{ textAlign: 'right' }}>{fmtEur(l.pp_annualisee)}</td>
              <td style={{ textAlign: 'right' }}>{fmtEur(l.pu_collectee)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(l.commission_encaissee)}</td>
              <td style={{
                textAlign: 'right', fontWeight: 700,
                color: Number(l.marge) < 0 ? 'var(--cancelled)' : 'var(--signed)',
              }}>
                {fmtEur(l.marge)}
              </td>
              <td><PastilleMarge marge={l.marge} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── L espace ─────────────────────────────────────────────────────────────
export default function Rentabilite({ profile }) {
  const [ouvert, setOuvert] = useState(estDeverrouille())
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [vue, setVue] = useState('cabinet')
  const [donnees, setDonnees] = useState(null)
  const [chargement, setChargement] = useState(false)
  const [restant, setRestant] = useState(tempsRestantMs())
  const minuteur = useRef(null)

  // Fermer efface AUSSI les donnees affichees : aucune marge ne doit rester
  // a l ecran ni en memoire apres verrouillage.
  const fermer = useCallback((message) => {
    verrouiller()
    setDonnees(null)
    setOuvert(false)
    if (message) toast(message, { icon: '🔒' })
  }, [])

  const charger = useCallback(async (a) => {
    setChargement(true)
    try {
      setDonnees(await chargerRentabilite(a))
    } catch (e) {
      if (String(e.message).includes('verrouille')) fermer('Session expirée, espace reverrouillé')
      else toast.error(messageErreur(e))
    } finally {
      setChargement(false)
    }
  }, [fermer])

  useEffect(() => { if (ouvert) charger(annee) }, [ouvert, annee, charger])

  // Compte a rebours : l espace se ferme tout seul au bout de quinze minutes.
  useEffect(() => {
    if (!ouvert) return undefined
    minuteur.current = setInterval(() => {
      const r = tempsRestantMs()
      setRestant(r)
      if (r <= 0) fermer('Quinze minutes écoulées, espace reverrouillé')
    }, 1000)
    return () => clearInterval(minuteur.current)
  }, [ouvert, fermer])

  const lignes = useMemo(() => donnees?.lignes || [], [donnees])
  const lSalaries = useMemo(() => salaries(lignes), [lignes])
  const lMandataires = useMemo(() => mandataires(lignes), [lignes])
  const tCabinet = useMemo(() => totaux(lignes), [lignes])
  const tSalaries = useMemo(() => totaux(lSalaries), [lSalaries])
  const tMandataires = useMemo(() => totaux(lMandataires), [lMandataires])
  const mensuel = useMemo(
    () => cumulerParMois(donnees?.parMois || [], tCabinet.cout),
    [donnees, tCabinet.cout],
  )
  const bascule = useMemo(
    () => pointDeBascule(donnees?.parMois || [], tCabinet.cout),
    [donnees, tCabinet.cout],
  )

  if (!ouvert) return <Verrou onOuvert={() => setOuvert(true)} />

  const minutes = Math.floor(restant / 60000)
  const secondes = Math.floor((restant % 60000) / 1000)

  return (
    <div>
      <div className="section-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="section-kicker">Réservé · {profile?.full_name || ''}</div>
          <div className="section-title">Chiffres &amp; Rentabilité {annee}</div>
          <div className="section-sub">
            Ce que chacun rapporte, ce qu il coûte, et ce que le cabinet garde.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}
            title="L espace se reverrouille automatiquement">
            {minutes}:{String(secondes).padStart(2, '0')}
          </span>
          <select className="form-select" style={{ width: 'auto' }}
            value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
            {anneesDispo().map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={() => fermer('Espace verrouillé')}>
            Verrouiller
          </button>
        </div>
      </div>

      <div className="immo2-seg" style={{ marginBottom: 20 }}>
        {VUES.map((v) => (
          <button key={v.cle} className={vue === v.cle ? 'on' : ''} onClick={() => setVue(v.cle)}>
            {v.label}
          </button>
        ))}
      </div>

      {chargement && <SkeletonCards />}

      {!chargement && vue === 'cabinet' && (
        <>
          <div className="kpi-grid mb-24">
            <Carte label="Commissions encaissées" valeur={fmtEur(tCabinet.commission)}
              aide={`${tCabinet.contrats} contrats · ${tCabinet.clients} clients`} accent="var(--gold)" />
            <Carte label="Coût des équipes" valeur={fmtEur(tCabinet.cout)}
              aide={`${tSalaries.personnes} personnes sous contrat`} accent="var(--progress)" />
            <Carte label="Marge" valeur={fmtEur(tCabinet.marge)}
              aide={tCabinet.marge >= 0 ? 'Le cabinet gagne de l argent' : 'Le cabinet perd de l argent'}
              accent={tCabinet.marge >= 0 ? 'var(--signed)' : 'var(--cancelled)'} />
            <Carte label="Ratio de couverture" valeur={fmtRatio(tCabinet.ratio)}
              aide="Euros encaissés pour un euro dépensé" accent="var(--forecast)" />
            <Carte label="Point de bascule"
              valeur={bascule ? MOIS_COURTS[bascule - 1] : '—'}
              aide={bascule ? 'Mois où le cumul dépasse les coûts' : 'Pas atteint sur l année'} />
          </div>
          <div className="card card-p" style={{ borderLeft: '3px solid var(--gold)' }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>
              <strong style={{ color: 'var(--t1)' }}>Les coûts sont des hypothèses.</strong>{' '}
              Charges patronales, mutuelle et outils viennent des paramètres, pas de la
              comptabilité. Le coût mensuel est le coût annuel divisé par douze, faute
              d un relevé mois par mois. À lire comme un ordre de grandeur, pas comme un bilan.
            </div>
          </div>
        </>
      )}

      {!chargement && vue === 'salaries' && (
        <>
          <div className="kpi-grid mb-24">
            <Carte label="Coût total" valeur={fmtEur(tSalaries.cout)} aide={`${tSalaries.personnes} personnes`} />
            <Carte label="Commissions" valeur={fmtEur(tSalaries.commission)} />
            <Carte label="Marge" valeur={fmtEur(tSalaries.marge)}
              accent={tSalaries.marge >= 0 ? 'var(--signed)' : 'var(--cancelled)'} />
            <Carte label="En perte" valeur={tSalaries.enPerte}
              aide={tSalaries.enPerte ? 'À regarder en premier' : 'Personne'} />
          </div>
          <TableauPersonnes lignes={lSalaries} avecCouts />
        </>
      )}

      {!chargement && vue === 'mandataires' && (
        <>
          <div className="kpi-grid mb-24">
            <Carte label="Production apportée" valeur={fmtEur(tMandataires.commission)}
              aide={`${tMandataires.contrats} contrats · ${tMandataires.personnes} mandataires`} />
            <Carte label="Ce qui reste au cabinet" valeur={fmtEur(tMandataires.marge)} accent="var(--signed)" />
          </div>
          <div className="card card-p mb-16" style={{ borderLeft: '3px solid var(--gold)' }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>
              Un mandataire sans coût fixe n est pas gratuit. La commission qui lui est
              reversée est calculée par le barème, côté serveur, et déduite ici.
            </div>
          </div>
          <TableauPersonnes lignes={lMandataires} avecCouts={false} />
        </>
      )}

      {!chargement && vue === 'mensuel' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mois</th>
                <th style={{ textAlign: 'right' }}>Contrats</th>
                <th style={{ textAlign: 'right' }}>PP</th>
                <th style={{ textAlign: 'right' }}>PU</th>
                <th style={{ textAlign: 'right' }}>Commission</th>
                <th style={{ textAlign: 'right' }}>Coût estimé</th>
                <th style={{ textAlign: 'right' }}>Marge du mois</th>
                <th style={{ textAlign: 'right' }}>Cumul</th>
              </tr>
            </thead>
            <tbody>
              {mensuel.map((m) => (
                <tr key={m.mois}>
                  <td className="cell-primary">{MOIS_COURTS[m.mois - 1]}</td>
                  <td style={{ textAlign: 'right' }}>{m.contrats}</td>
                  <td style={{ textAlign: 'right' }}>{fmtEur(m.pp)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtEur(m.pu)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(m.commission)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--t3)' }}>{fmtEur(m.coutMois)}</td>
                  <td style={{
                    textAlign: 'right', fontWeight: 600,
                    color: m.margeMois < 0 ? 'var(--cancelled)' : 'var(--signed)',
                  }}>{fmtEur(m.margeMois)}</td>
                  <td style={{
                    textAlign: 'right', fontWeight: 700,
                    color: m.cumulMarge < 0 ? 'var(--cancelled)' : 'var(--signed)',
                  }}>{fmtEur(m.cumulMarge)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
