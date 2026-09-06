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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { messageErreur } from '../lib/ui-shared'
import { SkeletonCards } from './ui/Skeleton'
import {
  deverrouiller, chargerRentabilite, verrouiller, estDeverrouille, tempsRestantMs,
} from '../lib/pnl-api'
import {
  MOIS_COURTS, equipe, associes, totaux, compteDeResultat, compteDeResultatMensuel,
  fmtEur, fmtMois,
  chargesParCategorie, aArbitrer, nonEngage, pilotage as calculerPilotage,
} from '../lib/pnl-calculs'

const VUES = [
  { cle: 'pilotage', label: 'Pilotage' },
  { cle: 'personnes', label: 'Par personne' },
  { cle: 'charges', label: 'Les charges' },
]

const LIBELLE_CATEGORIE = {
  LOCAUX: 'Locaux', OUTILS: 'Outils et abonnements', STRUCTURE: 'Structure',
  ACQUISITION: 'Acquisition', VEHICULE: 'Véhicule', SOCIAL: 'Protection sociale',
  AUTRE: 'Autre',
}

const LIBELLE_PERIODICITE = {
  MENSUEL: 'par mois', TRIMESTRIEL: 'par trimestre', ANNUEL: 'par an', PONCTUEL: 'ponctuel',
}

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

// Quelqu un arrive depuis cinq jours n est pas « en perte », il vient
// d arriver. Confondre les deux, c est faire lire un jugement la ou il n y a
// qu une arithmetique de calendrier.
const PastilleMarge = ({ marge, mois }) => {
  const nouveau = Number(mois || 0) < 1
  const perte = Number(marge || 0) < 0
  const [texte, couleur, fond] = nouveau
    ? ['vient d arriver', '#7A6320', 'rgba(197,165,90,0.16)']
    : perte
      ? ['en perte', '#B4453B', 'rgba(180,69,59,0.10)']
      : ['rentable', '#1B7A3E', 'rgba(52,199,89,0.12)']
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
      color: couleur, background: fond, whiteSpace: 'nowrap',
    }}>
      {texte}
    </span>
  )
}

// ─── Le compte de resultat ────────────────────────────────────────────────
// Six lignes, chacune retrouvable dans le grand livre ou dans la paie. C est
// la reponse a la seule question qui compte : est ce que le cabinet gagne de
// l argent, et sur quoi.
function CompteDeResultat({ cdr, sourceRetro }) {
  if (!cdr || !cdr.mois) return null
  const lignes = [
    { label: 'Commission acquise', valeur: cdr.recette, signe: 1,
      aide: 'Ce que les affaires signées rapportent au cabinet, mois par mois' },
    { label: 'Rétrocessions aux signataires', valeur: cdr.retrocessions, signe: -1,
      aide: sourceRetro === 'bareme'
        ? 'Calculées avec le barème configuré dans le CRM'
        : 'Part reversée au signataire, montants du grand livre' },
    { label: 'Salaires et charges de l équipe', valeur: cdr.equipe, signe: -1,
      aide: 'Salariés, alternants et stagiaires, charges patronales comprises' },
    { label: 'Structure', valeur: cdr.structure, signe: -1,
      aide: 'Locaux, outils, comptabilité, assurances, banque, publicité' },
    { label: 'Rémunération des associés', valeur: cdr.associes, signe: -1,
      aide: 'Prise sur le résultat, pas un coût de production' },
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
            <td>
              <div className="cell-primary" style={{ fontWeight: 700 }}>Résultat d exploitation</div>
              <div className="cell-sub">
                Les {cdr.mois} mois terminés. C est le chiffre de la carte du haut, poste par poste.
              </div>
            </td>
            <td style={{
              textAlign: 'right', fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap',
              color: cdr.resultat < 0 ? 'var(--cancelled)' : 'var(--signed)',
            }}>
              {fmtEur(cdr.resultat)}
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
              <th style={{ textAlign: 'right' }}>Contribution</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.profile_id || l.nom}>
                <td>
                  <div className="cell-primary">{l.nom || 'Sans nom'}</div>
                  {/* Le nombre de contrats vient du grand livre, qui est agrege
                      par mois tant que le detail des bordereaux n est pas importe :
                      l afficher ferait croire a un compte de dossiers. */}
                  <div className="cell-sub">{l.advisor_code || 'code absent'}</div>
                </td>
                <td><span className="badge badge-normal">{l.type_contrat}</span></td>
                <td style={{ textAlign: 'right' }}>{fmtMois(l.mois_actifs)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(l.commission_encaissee)}</td>
                <td style={{ textAlign: 'right', color: 'var(--t3)' }}>
                  {Number(l.commission_attendue) ? fmtEur(l.commission_attendue) : ''}
                </td>
                <td style={{ textAlign: 'right' }}
                  title={[
                    `Salaire chargé et école ${fmtEur(l.cout_fixe)}`,
                    `autres coûts ${fmtEur(l.cout_annexe)}`,
                    `rétrocession ${fmtEur(l.cout_retrocession)}`,
                    `part de structure ${fmtEur(l.cout_frais_fixes)}`,
                    Number(l.aide_percue) ? `moins ${fmtEur(l.aide_percue)} d aides` : null,
                    l.retrocession_source === 'bareme' ? 'rétrocession estimée au barème' : null,
                  ].filter(Boolean).join(' · ')}>
                  {fmtEur(l.cout_total)}
                </td>
                <td style={{
                  textAlign: 'right', fontWeight: 700,
                  color: Number(l.marge) < 0 ? 'var(--cancelled)' : 'var(--signed)',
                }}>
                  {fmtEur(l.marge)}
                  {Number(l.remuneration_associe) > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t3)' }}>
                      rémunération {fmtEur(l.remuneration_associe)}
                    </div>
                  )}
                </td>
                <td><PastilleMarge marge={l.marge} mois={l.mois_actifs} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Pilotage ─────────────────────────────────────────────────────────────
// La seule question du matin : ou j en suis de mon objectif, et ce qu il faut
// encaisser d ici la fin de l annee pour y arriver.
//
// Un mois ne compte que lorsqu il est FINI. Le mois en cours porte une
// commission de quelques jours en face d un mois entier de charges : le
// cumuler avec les autres ferait lire une chute qui n a pas eu lieu. Les mois
// a venir ne portent que leur cout previsionnel, on n invente aucune recette.
function VuePilotage({ mois, objectif, annee, cdr, sourceRetro, courant }) {
  const p = calculerPilotage(mois, objectif)
  const tous = mois || []
  const finis = tous.filter((m) => m.est_passe)
  const enCours = tous.find((m) => !m.est_passe && m.est_reel) || null
  const aVenir = tous.filter((m) => !m.est_passe && !m.est_reel)

  const Bloc = ({ label, valeur, aide, couleur }) => (
    <div className="kpi-card" style={couleur ? { borderTop: `2px solid ${couleur}` } : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={couleur ? { color: couleur } : undefined}>{valeur}</div>
      {aide && <div className="kpi-hint">{aide}</div>}
    </div>
  )

  const vert = 'var(--signed)'
  const rouge = 'var(--cancelled)'
  const avancement = Math.max(0, Math.min(1, p.avancement ?? 0))

  return (
    <>
      <div className="kpi-grid mb-24">
        <Bloc label={`Résultat d exploitation ${annee}`} valeur={fmtEur(p.realise)}
          aide={`${p.moisPasses} mois terminés : commission acquise moins charges du mois`}
          couleur={p.realise >= 0 ? vert : rouge} />
        <Bloc label="Objectif de l année" valeur={fmtEur(p.objectif)}
          aide={p.atteint ? "Déjà atteint" : `Il reste ${fmtEur(p.resteAFaire)} à faire`} couleur="var(--gold)" />
        <Bloc label="À faire chaque mois"
          valeur={p.parMoisNecessaire != null ? fmtEur(p.parMoisNecessaire) : 'n. c.'}
          aide={`de commission sur les ${p.moisRestants} mois restants, charges comprises`}
          couleur={p.enAvance ? vert : rouge} />
        <Bloc label="Ton rythme actuel" valeur={fmtEur(p.moyenneRecette)}
          aide={p.enAvance ? 'Suffisant pour tenir l objectif' : `Il manque ${fmtEur(Math.max(0, (p.parMoisNecessaire || 0) - p.moyenneRecette))} par mois`} />
        <Bloc label="Projection fin d année" valeur={fmtEur(p.projection)}
          aide="Si le rythme actuel se maintient"
          couleur={p.projection >= p.objectif ? vert : rouge} />
      </div>

      {/* La jauge : une seule image pour savoir ou on en est. */}
      <div className="card card-p mb-24">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 8 }}>
          <span style={{ color: 'var(--t2)' }}>
            <strong style={{ color: 'var(--t1)' }}>{fmtEur(p.realise)}</strong> sur {fmtEur(p.objectif)}
          </span>
          <span style={{ color: 'var(--t3)' }}>{Math.round(avancement * 100)} %</span>
        </div>
        <div style={{ height: 14, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
          <div style={{
            width: `${avancement * 100}%`, height: '100%', borderRadius: 999,
            background: p.projection >= p.objectif ? vert : 'var(--gold)',
            transition: 'width .4s ease',
          }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 10, lineHeight: 1.6 }}>
          {p.projection >= p.objectif
            ? `Au rythme actuel tu finis à ${fmtEur(p.projection)}, soit ${fmtEur(p.projection - p.objectif)} au dessus de l objectif.`
            : `Au rythme actuel tu finis à ${fmtEur(p.projection)}, soit ${fmtEur(p.objectif - p.projection)} en dessous. Il faudrait encaisser ${fmtEur(p.parMoisNecessaire || 0)} par mois au lieu de ${fmtEur(p.moyenneRecette)}.`}
        </div>
      </div>

      {/* Ce qui sort tous les mois quoi qu il arrive. Le poste que le
          dirigeant veut connaitre de tete. */}
      {courant && (
        <div className="card card-p mb-24">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>
            Ce que coûte le cabinet chaque mois, aujourd hui
          </div>
          {[
            ['Salaires et charges de l équipe', courant.cout_equipe,
              `${courant.nb_personnes} personnes`],
            ['Structure', courant.frais_fixes,
              'locaux, outils, comptabilité, assurances, banque, publicité'],
          ].map(([label, valeur, aide]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', gap: 12,
              padding: '7px 0', borderTop: '1px solid var(--line)',
            }}>
              <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
                <strong style={{ color: 'var(--t1)' }}>{label}</strong>
                <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>{aide}</div>
              </div>
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(valeur)}</div>
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 12,
            padding: '9px 0', borderTop: '2px solid var(--line)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
              Charges fixes hors rémunération des dirigeants
            </div>
            <div style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
              {fmtEur(Number(courant.cout_equipe || 0) + Number(courant.frais_fixes || 0))}
            </div>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 12,
            padding: '7px 0', borderTop: '1px solid var(--line)', color: 'var(--t3)',
          }}>
            <div style={{ fontSize: 12.5 }}>Rémunération des dirigeants</div>
            <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(courant.cout_associes)}</div>
          </div>
          {Number(courant.non_engage) > 0 && (
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 10, lineHeight: 1.6 }}>
              {fmtEur(courant.non_engage)} par mois ne sont pas encore engagés (véhicule,
              mutuelle, médecine du travail, contrat incendie). Le coût complet cible est
              donc de {fmtEur(Number(courant.cout_complet) + Number(courant.non_engage))}.
            </div>
          )}
        </div>
      )}

      <CompteDeResultat cdr={cdr} sourceRetro={sourceRetro} />

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mois</th>
              <th style={{ textAlign: 'right' }}>Personnes</th>
              <th style={{ textAlign: 'right' }}>Commission</th>
              <th style={{ textAlign: 'right' }}>Charges</th>
              <th style={{ textAlign: 'right' }}>Résultat</th>
              <th style={{ textAlign: 'right' }}>Cumul</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tous.map((m) => {
              // Seul un mois termine porte un resultat et un cumul lisibles.
              const fini = Boolean(m.est_passe)
              const courantCe = !fini && m.est_reel
              return (
                <tr key={m.mois} style={fini ? undefined : { opacity: 0.62 }}>
                  <td className="cell-primary">{MOIS_COURTS[m.mois - 1]}</td>
                  <td style={{ textAlign: 'right' }}>{m.nb_personnes}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {m.est_reel ? fmtEur(m.recette) : ''}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--t2)' }}>{fmtEur(m.cout_total)}</td>
                  <td style={{
                    textAlign: 'right', fontWeight: 700,
                    color: fini ? (Number(m.resultat) < 0 ? rouge : vert) : 'var(--t3)',
                  }}>{fini ? fmtEur(m.resultat) : ''}</td>
                  <td style={{
                    textAlign: 'right', fontWeight: 700,
                    color: Number(m.cumul_resultat) < 0 ? rouge : vert,
                  }}>{fini ? fmtEur(m.cumul_resultat) : ''}</td>
                  <td style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {fini ? 'terminé' : courantCe ? 'mois en cours' : 'prévisionnel'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card card-p" style={{ marginTop: 16, borderLeft: '3px solid var(--gold)' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>
          <strong style={{ color: 'var(--t1)' }}>Ce que ce tableau dit, et ce qu il ne dit pas.</strong>{' '}
          Les {finis.length} mois terminés opposent la commission acquise sur le mois aux
          charges du mois : c est un résultat d exploitation, pas un mouvement de compte.
          {enCours && ` ${MOIS_COURTS[enCours.mois - 1]} est en cours : la commission n y court que depuis quelques jours en face d un mois entier de charges, il n est donc ni cumulé ni jugé.`}
          {' '}Les {aVenir.length} mois suivants ne portent que leur coût prévisionnel, avec
          l équipe telle qu elle est aujourd hui. Ce n est pas un résultat comptable :
          l impôt sur les sociétés, les remboursements de dette et les achats immobilisés
          ne sont pas ici.
        </div>
      </div>
    </>
  )
}

// ─── Les charges fixes, poste par poste ───────────────────────────────────
// Un total agrege que personne ne peut ouvrir redevient une hypothese au bout
// de trois mois. Chaque euro porte donc son fournisseur, sa periodicite, sa
// fiabilite et sa source.
function VueCharges({ charges, courant }) {
  const parCat = chargesParCategorie(charges)
  const arbitrages = aArbitrer(charges)
  const attente = nonEngage(charges)
  const total = parCat.reduce((s, c) => s + c.montant, 0)

  const Fiabilite = ({ v }) => {
    const couleur = { FACTURE: 'var(--signed)', MOYENNE: 'var(--forecast)' }[v] || 'var(--t3)'
    return <span style={{ fontSize: 10.5, fontWeight: 700, color: couleur, letterSpacing: '0.04em' }}>{v || ''}</span>
  }

  return (
    <>
      <div className="kpi-grid mb-24">
        <Carte label="Charges fixes mensuelles" valeur={fmtEur(total)}
          aide={`${charges.filter((c) => c.actif !== false).length} postes engagés`} accent="var(--gold)" />
        <Carte label="En attente d arbitrage" valeur={fmtEur(courant?.frais_fixes_a_arbitrer)}
          aide={`${arbitrages.length} postes à trancher, déjà comptés ci-contre`}
          accent="var(--cancelled)" />
        <Carte label="Pas encore engagé" valeur={fmtEur(courant?.non_engage)}
          aide={`${attente.length} postes à venir`} accent="var(--forecast)" />
      </div>

      {arbitrages.length > 0 && (
        <div className="card card-p mb-24" style={{ borderLeft: '3px solid var(--cancelled)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>
            À trancher, du plus cher au moins cher
          </div>
          {arbitrages.map((c) => (
            <div key={c.libelle + c.fournisseur} style={{
              display: 'flex', justifyContent: 'space-between', gap: 12,
              padding: '6px 0', borderTop: '1px solid var(--line)',
            }}>
              <div style={{ fontSize: 12.5, color: 'var(--t2)', flex: 1 }}>
                <strong style={{ color: 'var(--t1)' }}>{c.libelle}</strong>
                {c.fournisseur ? ` · ${c.fournisseur}` : ''}
                {c.notes && <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>{c.notes}</div>}
              </div>
              <div style={{ fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {Number(c.montant_mensuel || 0) > 0 ? fmtEur(c.montant_mensuel) : fmtEur(c.montant)}
                <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 500 }}>
                  {Number(c.montant_mensuel || 0) > 0
                    ? `${fmtEur(Number(c.montant_mensuel) * 12)} par an`
                    : `${LIBELLE_PERIODICITE[c.periodicite] || c.periodicite || ''}, hors charges mensuelles`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Poste</th>
              <th>Fournisseur</th>
              <th style={{ textAlign: 'right' }}>Montant</th>
              <th>Périodicité</th>
              <th style={{ textAlign: 'right' }}>Par mois</th>
              <th>Fiabilité</th>
            </tr>
          </thead>
          <tbody>
            {parCat.map((cat) => (
              <Fragment key={cat.categorie}>
                <tr>
                  <td colSpan={6} style={{
                    background: 'var(--gold-subtle)', fontWeight: 700, fontSize: 12,
                    color: 'var(--t1)',
                  }}>
                    {LIBELLE_CATEGORIE[cat.categorie] || cat.categorie}
                    <span style={{ fontWeight: 500, color: 'var(--t3)' }}>
                      {' '}· {fmtEur(cat.montant)} par mois · {cat.postes} postes
                    </span>
                  </td>
                </tr>
                {charges
                  .filter((c) => c.actif !== false && c.categorie === cat.categorie)
                  .map((c) => (
                    <tr key={c.libelle + c.fournisseur}>
                      <td>
                        <div className="cell-primary">
                          {c.libelle}
                          {c.a_arbitrer && <span style={{ color: 'var(--cancelled)' }}> ●</span>}
                        </div>
                        {c.source && <div className="cell-sub">{c.source}</div>}
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--t2)' }}>{c.fournisseur || ''}</td>
                      <td style={{ textAlign: 'right' }}>{fmtEur(c.montant)}</td>
                      <td style={{ fontSize: 12, color: 'var(--t3)' }}>
                        {LIBELLE_PERIODICITE[c.periodicite] || c.periodicite}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(c.montant_mensuel)}</td>
                      <td><Fiabilite v={c.fiabilite} /></td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {attente.length > 0 && (
        <>
          <div style={{ margin: '20px 0 8px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Pas encore engagé</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>
              Enregistré pour mémoire, non compté dans le coût tant que ce n est pas signé
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <tbody>
                {attente.map((c) => (
                  <tr key={c.libelle + c.fournisseur}>
                    <td>
                      <div className="cell-primary">{c.libelle}</div>
                      {c.notes && <div className="cell-sub">{c.notes}</div>}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                      {fmtEur(c.montant_mensuel)} par mois
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="card card-p" style={{ marginTop: 16, borderLeft: '3px solid var(--gold)' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>
          Tous les montants sont en TTC. Entasis n est pas assujettie à la TVA et ne la
          récupère pas : raisonner en HT ferait disparaître vingt pour cent du coût réel.
        </div>
      </div>
    </>
  )
}

// ─── L espace ─────────────────────────────────────────────────────────────
export default function Rentabilite({ profile }) {
  const [ouvert, setOuvert] = useState(estDeverrouille())
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [vue, setVue] = useState('pilotage')
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
    () => compteDeResultat(
      lignes,
      donnees?.cabinet?.structure_ecoulee ?? donnees?.cabinet?.structure_annuelle ?? 0,
      // Pas la recette bancaire : elle mesure l ENCAISSEMENT, decale d un a
      // trois mois de la production, et l opposer a des charges de la periode
      // fabriquait une recette orpheline de soixante mille euros.
      null,
    ),
    [lignes, donnees],
  )
  // Le resultat du cabinet, une seule fois, depuis le moteur mensuel.
  const cdr = useMemo(
    () => compteDeResultatMensuel(donnees?.cabinet?.pilotage || []),
    [donnees],
  )
  const tEquipe = useMemo(() => totaux(lEquipe), [lEquipe])
  const courant = donnees?.cabinet?.courant || null
  const charges = useMemo(() => donnees?.cabinet?.charges || [], [donnees])
  // Un montant du grand livre prime toujours sur le bareme : du constate
  // contre un calcul. L ecran doit dire lequel il montre.
  const sourceRetro = useMemo(() => {
    const l = donnees?.lignes || []
    if (l.some((x) => x.retrocession_source === 'bordereau')) return 'bordereau'
    return l.some((x) => x.retrocession_source === 'bareme') ? 'bareme' : 'aucune'
  }, [donnees])
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

      {!chargement && vue === 'pilotage' && (
        <VuePilotage mois={donnees?.cabinet?.pilotage || []}
          objectif={donnees?.cabinet?.objectif || 0} annee={annee}
          cdr={cdr} sourceRetro={sourceRetro} courant={courant} />
      )}

      {!chargement && vue === 'charges' && (
        <VueCharges charges={charges} courant={courant} />
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
              aide={tEquipe.nouveaux
                ? `${tEquipe.nouveaux} viennent d arriver, non comptés`
                : (tEquipe.enPerte ? 'À regarder en premier' : 'Personne')} />
            <Carte label="Contribution totale" valeur={fmtEur(cr.reconciliation.sommeDesMarges)}
              aide="Équipe et associés, avant leur rémunération" />
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
              <strong style={{ color: 'var(--t1)' }}>
                Pourquoi la somme des contributions ne fait pas le résultat du cabinet.
              </strong>
              <div style={{ marginTop: 8 }}>
                {[
                  ['Somme des contributions, arrêtée à aujourd hui',
                    cr.reconciliation.sommeDesMarges, 1],
                  ['Commission encaissée que personne ne porte encore',
                    cr.reconciliation.recetteNonAttribuee, 1],
                  ['Rémunération des associés, prise sur le résultat',
                    cr.reconciliation.remunerationAssocies, -1],
                  ['Structure que personne ne porte',
                    cr.reconciliation.structureNonImputee, -1],
                ].filter(([, v]) => Math.abs(Number(v || 0)) >= 1).map(([label, valeur, signe]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0',
                  }}>
                    <span>{label}</span>
                    <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {signe < 0 ? `moins ${fmtEur(valeur)}` : fmtEur(valeur)}
                    </span>
                  </div>
                ))}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  padding: '6px 0 0', marginTop: 4, borderTop: '1px solid var(--line)',
                  fontWeight: 700, color: 'var(--t1)',
                }}>
                  <span>Résultat à ce jour, mois en cours compris</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{fmtEur(cr.resultat)}</span>
                </div>
              </div>
              {cdr.mois > 0 && (
                <div style={{ marginTop: 10 }}>
                  Le Pilotage affiche <strong style={{ color: 'var(--t1)' }}>{fmtEur(cdr.resultat)}</strong>{' '}
                  parce qu il ne retient que les {cdr.mois} mois terminés. Ici le mois en
                  cours est compté, avec son mois entier de charges et ses quelques jours
                  de commission : {fmtEur(Math.abs(cdr.resultat - cr.resultat))} d écart, qui
                  se refermeront à la fin du mois.
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                                Cocher ou décocher la case déplace des coûts entre les personnes, cela ne
                change jamais le résultat du cabinet.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
