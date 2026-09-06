// ═══════════════════════════════════════════════════════════════════════════
// ESPACE RENTABILITE. Reserve, verrouille par un code, deux vues.
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
  MOIS_COURTS, equipe, associes, totaux, compteDeResultat,
  pointDeBascule, cumulerParMois, fmtEur, fmtRatio, fmtMois,
} from '../lib/pnl-calculs'

const VUES = [
  { cle: 'cabinet', label: 'Le cabinet' },
  { cle: 'personnes', label: 'Par personne' },
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

// ─── Le compte de resultat ────────────────────────────────────────────────
// Six lignes, chacune retrouvable dans le grand livre ou dans la paie. C est
// la reponse a la seule question qui compte : est ce que le cabinet gagne de
// l argent, et sur quoi.
function CompteDeResultat({ cr }) {
  const lignes = [
    { label: 'Commissions encaissées', valeur: cr.encaisse, signe: 1,
      aide: cr.attendu ? `${fmtEur(cr.attendu)} encore attendus, non comptés ici` : null },
    { label: 'Rétrocessions aux signataires', valeur: cr.retrocessions, signe: -1,
      aide: 'Part reversée à celui qui a signé' },
    { label: 'Salaires et charges', valeur: cr.salairesCharges, signe: -1,
      aide: 'Équipe salariée, alternants et stagiaires' },
    { label: 'Écoles et autres coûts', valeur: cr.autresEquipe, signe: -1 },
    { label: 'Structure', valeur: cr.structure, signe: -1,
      aide: 'Locaux, outils, comptabilité, assurances, banque, publicité' },
    { label: 'Rémunération des associés', valeur: cr.remunerationAssocies, signe: -1,
      aide: 'Geniopus et Decampius, flux bancaires' },
  ].filter((l) => Number(l.valeur || 0) !== 0)

  return (
    <div className="table-wrap mb-24">
      <table className="data-table">
        <tbody>
          {lignes.map((l) => (
            <tr key={l.label}>
              <td>
                <div className="cell-primary">{l.label}</div>
                {l.aide && <div className="cell-sub">{l.aide}</div>}
              </td>
              <td style={{
                textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap',
                color: l.signe < 0 ? 'var(--t2)' : 'var(--t1)',
              }}>
                {l.signe < 0 ? `moins ${fmtEur(l.valeur)}` : fmtEur(l.valeur)}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid var(--line)' }}>
            <td><div className="cell-primary" style={{ fontWeight: 700 }}>Résultat</div></td>
            <td style={{
              textAlign: 'right', fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap',
              color: cr.resultat < 0 ? 'var(--cancelled)' : 'var(--signed)',
            }}>
              {fmtEur(cr.resultat)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ─── Le tableau des personnes ─────────────────────────────────────────────
function TableauPersonnes({ lignes, titre, sousTitre }) {
  if (!lignes.length) return null
  return (
    <>
      <div style={{ margin: '20px 0 8px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{titre}</div>
        {sousTitre && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{sousTitre}</div>}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Personne</th>
              <th>Contrat</th>
              <th style={{ textAlign: 'right' }}>Mois</th>
              <th style={{ textAlign: 'right' }}>Encaissé</th>
              <th style={{ textAlign: 'right' }}>Attendu</th>
              <th style={{ textAlign: 'right' }}>Coût</th>
              <th style={{ textAlign: 'right' }}>Résultat</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.profile_id || l.nom}>
                <td>
                  <div className="cell-primary">{l.nom || 'Sans nom'}</div>
                  <div className="cell-sub">
                    {l.advisor_code || 'code absent'}
                    {Number(l.contrats_signes) ? ` · ${l.contrats_signes} contrats` : ''}
                  </div>
                </td>
                <td><span className="badge badge-normal">{l.type_contrat}</span></td>
                <td style={{ textAlign: 'right' }}>{fmtMois(l.mois_actifs)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(l.commission_encaissee)}</td>
                <td style={{ textAlign: 'right', color: 'var(--t3)' }}>
                  {Number(l.commission_attendue) ? fmtEur(l.commission_attendue) : ''}
                </td>
                <td style={{ textAlign: 'right' }}
                  title={[
                    `Salaire chargé ${fmtEur(l.cout_fixe)}`,
                    `écoles et autres ${fmtEur(l.cout_ecole)}`,
                    `rétrocession ${fmtEur(l.cout_retrocession)}`,
                    `part de structure ${fmtEur(l.cout_frais_fixes)}`,
                  ].join(' · ')}>
                  {fmtEur(l.cout_total)}
                </td>
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
    </>
  )
}

// ─── L espace ─────────────────────────────────────────────────────────────
export default function Rentabilite({ profile }) {
  const [ouvert, setOuvert] = useState(estDeverrouille())
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [vue, setVue] = useState('cabinet')
  const [repartir, setRepartir] = useState(true)
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

  const charger = useCallback(async (a, r) => {
    setChargement(true)
    try {
      setDonnees(await chargerRentabilite(a, r))
    } catch (e) {
      if (String(e.message).includes('verrouille')) fermer('Session expirée, espace reverrouillé')
      else toast.error(messageErreur(e))
    } finally {
      setChargement(false)
    }
  }, [fermer])

  useEffect(() => { if (ouvert) charger(annee, repartir) }, [ouvert, annee, repartir, charger])

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
  const lEquipe = useMemo(() => equipe(lignes), [lignes])
  const lAssocies = useMemo(() => associes(lignes), [lignes])
  const cr = useMemo(
    () => compteDeResultat(lignes, donnees?.cabinet?.structure_annuelle || 0),
    [lignes, donnees],
  )
  const tEquipe = useMemo(() => totaux(lEquipe), [lEquipe])

  // Le cout complet du cabinet, celui qui sert au mensuel et a la bascule :
  // tout ce qui separe l encaisse du resultat.
  const coutCabinet = cr.encaisse - cr.resultat
  const mensuel = useMemo(
    () => cumulerParMois(donnees?.parMois || [], coutCabinet),
    [donnees, coutCabinet],
  )
  const bascule = useMemo(
    () => pointDeBascule(donnees?.parMois || [], coutCabinet),
    [donnees, coutCabinet],
  )

  if (!ouvert) return <Verrou onOuvert={() => setOuvert(true)} />

  const minutes = Math.floor(restant / 60000)
  const secondes = Math.floor((restant % 60000) / 1000)
  const ratio = coutCabinet > 0 ? cr.encaisse / coutCabinet : null

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
            <Carte label="Commissions encaissées" valeur={fmtEur(cr.encaisse)}
              aide={cr.attendu ? `${fmtEur(cr.attendu)} attendus en plus` : 'Argent réellement perçu'}
              accent="var(--gold)" />
            <Carte label="Résultat" valeur={fmtEur(cr.resultat)}
              aide={cr.resultat >= 0 ? 'Après tout, associés compris' : 'Le cabinet perd de l argent'}
              accent={cr.resultat >= 0 ? 'var(--signed)' : 'var(--cancelled)'} />
            <Carte label="Ratio de couverture" valeur={fmtRatio(ratio)}
              aide="Euros encaissés pour un euro dépensé" accent="var(--forecast)" />
            <Carte label="Point de bascule"
              valeur={bascule ? MOIS_COURTS[bascule - 1] : 'non atteint'}
              aide={bascule ? 'Mois où le cumul dépasse les coûts' : 'Pas atteint sur l année'} />
          </div>

          <CompteDeResultat cr={cr} />

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mois</th>
                  <th style={{ textAlign: 'right' }}>Contrats</th>
                  <th style={{ textAlign: 'right' }}>Encaissé</th>
                  <th style={{ textAlign: 'right' }}>Attendu</th>
                  <th style={{ textAlign: 'right' }}>Coût du mois</th>
                  <th style={{ textAlign: 'right' }}>Marge du mois</th>
                  <th style={{ textAlign: 'right' }}>Cumul</th>
                </tr>
              </thead>
              <tbody>
                {mensuel.map((m) => (
                  <tr key={m.mois}>
                    <td className="cell-primary">{MOIS_COURTS[m.mois - 1]}</td>
                    <td style={{ textAlign: 'right' }}>{m.contrats || ''}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(m.commission)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--t3)' }}>
                      {Number(m.attendue) ? fmtEur(m.attendue) : ''}
                    </td>
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

          <div className="card card-p" style={{ marginTop: 16, borderLeft: '3px solid var(--gold)' }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>
              <strong style={{ color: 'var(--t1)' }}>D où viennent ces chiffres.</strong>{' '}
              Les commissions viennent du grand livre, ligne par ligne. Les salaires
              viennent des contrats du CRM, au prorata des jours de présence. La
              structure et la rémunération des associés viennent de la comptabilité.
              Les charges patronales restent un taux, pas un relevé de paie : c est la
              seule hypothèse qui reste dans ce tableau.
            </div>
          </div>
        </>
      )}

      {!chargement && vue === 'personnes' && (
        <>
          <div className="kpi-grid mb-24">
            <Carte label="Équipe" valeur={fmtEur(tEquipe.marge)}
              aide={`${tEquipe.personnes} personnes, ${fmtEur(tEquipe.encaisse)} encaissés`}
              accent={tEquipe.marge >= 0 ? 'var(--signed)' : 'var(--cancelled)'} />
            <Carte label="Coût de l équipe" valeur={fmtEur(tEquipe.cout)}
              aide={`dont ${fmtEur(tEquipe.retrocessions)} de rétrocessions`} />
            <Carte label="En perte" valeur={tEquipe.enPerte}
              aide={tEquipe.enPerte ? 'À regarder en premier' : 'Personne'} />
            <Carte label="Structure non absorbée" valeur={fmtEur(cr.structureNonAbsorbee)}
              aide="Postes payés toute l année, occupés une partie seulement" />
          </div>

          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            fontSize: 12.5, color: 'var(--t2)',
          }}>
            <input type="checkbox" checked={repartir} onChange={(e) => setRepartir(e.target.checked)} />
            Inclure la part de structure dans le coût de chacun
          </label>

          <TableauPersonnes lignes={lEquipe} titre="L équipe"
            sousTitre="Salariés, alternants, stagiaires et mandataires" />
          <TableauPersonnes lignes={lAssocies} titre="Les associés"
            sousTitre="Rémunération prise sur le résultat, pas un coût d équipe" />

          <div className="card card-p" style={{ marginTop: 16, borderLeft: '3px solid var(--gold)' }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>
              La somme des résultats individuels ne fait pas le résultat du cabinet :
              il manque {fmtEur(cr.structureNonAbsorbee)} de structure que personne ne
              porte. Cocher ou décocher la case déplace des coûts entre les personnes,
              cela ne change jamais le résultat du cabinet.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
