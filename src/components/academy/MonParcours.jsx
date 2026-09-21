// ═══════════════════════════════════════════════════════════════════════════
// AUJOURD HUI : l’écran d’entrée du collaborateur dans la formation
//
// Ce que l’écran dit en un coup d’œil : la série de jours (et si elle est en
// danger), l objectif quotidien en sessions, l XP du jour et de la semaine,
// les exercices dus. Puis les decks affectés, chacun avec ses couronnes, ses
// exercices vus et dus, son échéance, et un seul geste qui compte :
// « S’entraîner ». En bas, les dernières réussites.
//
// Conteneur (charge academy_mon_parcours, enregistre l’objectif quotidien)
// et présentation séparés : la vue reçoit tout par props et se teste avec
// renderToStaticMarkup.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { monParcours, objectifQuotidien } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { classeBadge, enRetard, libelleEcheance, STATUTS } from '../../lib/academy/statuts'
import { jourParis } from '../../lib/academy/format'
import { Couronnes, Flamme } from './Couronnes'
import { SkeletonCards } from '../ui/Skeleton'

const OBJECTIFS = [1, 2, 3]
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const jour = (v) => (v ? String(v).slice(0, 10) : '')
const SANS_EXERCICE = 'Aucun exercice dans ce deck'

function Entete({ sousTitre }) {
  return (
    <div className="section-header">
      <div>
        <div className="section-kicker">Formation</div>
        <div className="section-title">Aujourd hui</div>
        {sousTitre && <div className="section-sub">{sousTitre}</div>}
      </div>
    </div>
  )
}

// La série de jours : la flamme, le nombre, et le mot qui va avec.
function Serie({ serie }) {
  const jours = Number(serie?.serie) || 0
  const meilleure = Number(serie?.meilleure) || 0
  const danger = serie?.en_danger === true
  let sous
  if (danger) sous = 'Une session aujourd’hui et la série continue.'
  else if (jours === 0) sous = 'Une session terminée aujourd’hui lance ta série.'
  else if (serie?.objectif_atteint) sous = 'Série assurée pour aujourd’hui.'
  else sous = 'Termine une session pour garder la flamme.'
  return (
    <div className={`card card-p ac-jour-carte${danger ? ' danger' : ''}`}>
      <div className="ac-kpi-kicker">Série</div>
      <div className="ac-serie">
        <Flamme eteinte={jours === 0 || danger} />
        <div>
          <div className="ac-kpi-valeur">{pluriel(jours, 'jour', 'jours')}</div>
          <div className="ac-kpi-sous">{meilleure > 0 ? `meilleure série : ${pluriel(meilleure, 'jour', 'jours')}` : 'première série à lancer'}</div>
        </div>
      </div>
      <div className="ac-serie-mot">
        {danger && <span className="badge badge-urgent">En danger</span>}
        <span>{sous}</span>
      </div>
    </div>
  )
}

// L’objectif quotidien en sessions, avec le petit sélecteur (1 à 3).
function Objectif({ serie, onObjectif }) {
  const [ouvert, setOuvert] = useState(false)
  const objectif = Math.max(1, Number(serie?.objectif_quotidien) || 1)
  const faites = Number(serie?.sessions_aujourdhui) || 0
  const pct = Math.min(100, Math.round((100 * faites) / objectif))
  const atteint = faites >= objectif
  return (
    <div className="card card-p ac-jour-carte">
      <div className="ac-ligne">
        <div className="ac-kpi-kicker ac-croissance">Objectif du jour</div>
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={ouvert} aria-controls="ac-objectif-choix" onClick={() => setOuvert((o) => !o)}>
          Objectif
        </button>
      </div>
      <div className="ac-kpi-valeur">{faites}/{objectif}</div>
      <div className="team-bar-wrap ac-objectif-barre" aria-label={`${faites} session${faites > 1 ? 's' : ''} sur ${objectif}`}>
        <div className="team-bar-track"><div className={`team-bar-fill${atteint ? ' signed' : ''}`} style={{ width: `${pct}%` }} /></div>
        <span className="team-bar-pct">{pct} %</span>
      </div>
      <div className="ac-kpi-sous">
        {atteint ? <span className="badge badge-signed">Objectif atteint</span> : `${pluriel(objectif, 'session', 'sessions')} par jour`}
      </div>
      {ouvert && (
        <div id="ac-objectif-choix" className="ac-objectif-choix">
          <label htmlFor="ac-objectif-select" className="form-label">Sessions visées par jour</label>
          <select id="ac-objectif-select" className="form-select" value={OBJECTIFS.includes(objectif) ? objectif : 3}
            onChange={(e) => { onObjectif?.(Number(e.target.value)); setOuvert(false) }}>
            {OBJECTIFS.map((n) => <option key={n} value={n}>{pluriel(n, 'session', 'sessions')}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

function Deck({ a, aujourdhui, onNaviguer }) {
  const retard = enRetard(a, aujourdhui)
  const echeance = libelleEcheance(a, aujourdhui)
  const nbItems = Number(a.nb_items) || 0
  const vus = Math.min(nbItems, Number(a.items_vus) || 0)
  const dus = Number(a.items_dus) || 0
  const valide = a.statut === 'valide'
  // Une version archivée ne se joue plus : le catalogue porte la version qui
  // la remplace. Un deck sans exercice ne se joue pas non plus.
  const remplace = a.version_statut === 'archive'
  const vide = nbItems === 0
  return (
    <article className={`card card-p ac-deck${retard ? ' retard' : ''}`}>
      <div className="ac-deck-haut">
        <div className="ac-croissance">
          <div className="ac-carte-titre">{a.titre}</div>
          <div className="ac-carte-meta">
            {[a.parcours_titre, a.obligatoire ? 'obligatoire' : 'facultatif'].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Couronnes n={a.couronnes} />
      </div>
      <div className="ac-deck-chiffres">
        <span>{vus} sur {pluriel(nbItems, 'exercice vu', 'exercices vus')}</span>
        <span className={dus > 0 ? 'ac-du' : ''}>{dus > 0 ? pluriel(dus, 'exercice à revoir', 'exercices à revoir') : 'rien à revoir'}</span>
      </div>
      <div className="ac-badges">
        <span className={classeBadge(a.statut)}>{STATUTS[a.statut] || 'Non commencé'}</span>
        {retard && <span className="badge badge-urgent">En retard</span>}
        {remplace && <span className="badge badge-normal">Version remplacée</span>}
        {echeance && <span className="ac-muet">{echeance}</span>}
      </div>
      <div className="ac-deck-pied">
        {remplace ? (
          <button type="button" className="btn btn-outline" onClick={() => onNaviguer?.('#/formation/catalogue')}>
            Deck remplacé, voir le catalogue
          </button>
        ) : (
          <button type="button" className={`btn ${valide && dus === 0 ? 'btn-outline' : 'btn-primary'}`}
            disabled={vide} title={vide ? SANS_EXERCICE : undefined}
            onClick={() => onNaviguer?.(`#/formation/entrainement/${a.version_id}`)}>
            S’entraîner
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.(`#/formation/module/${a.slug}`)}>Voir le deck</button>
        {vide && !remplace && <span className="ac-muet">{SANS_EXERCICE}</span>}
      </div>
    </article>
  )
}

export function MonParcoursVue({ parcours, aujourdhui, onNaviguer, onObjectif }) {
  const affectations = Array.isArray(parcours?.affectations) ? parcours.affectations : []
  const reussites = Array.isArray(parcours?.dernieres_reussites) ? parcours.dernieres_reussites : []
  const serie = parcours?.serie || {}
  const xp = parcours?.xp || {}
  const jourJ = aujourdhui || parcours?.aujourdhui
  const dus = Number(parcours?.items_dus) || 0
  const retards = affectations.filter((a) => enRetard(a, jourJ)).length
  const valides = affectations.filter((a) => a.statut === 'valide').length

  // Les retards d’abord, puis les decks avec des exercices dus, puis par
  // échéance, les validés à la fin.
  const ordonnes = [...affectations].sort((a, b) => {
    const ra = enRetard(a, jourJ) ? 0 : 1
    const rb = enRetard(b, jourJ) ? 0 : 1
    if (ra !== rb) return ra - rb
    const da = Number(a.items_dus) > 0 ? 0 : 1
    const db = Number(b.items_dus) > 0 ? 0 : 1
    if (da !== db) return da - db
    const va = a.statut === 'valide' ? 1 : 0
    const vb = b.statut === 'valide' ? 1 : 0
    if (va !== vb) return va - vb
    return String(jour(a.echeance) || '9999').localeCompare(String(jour(b.echeance) || '9999'))
  })

  const sousTitre = affectations.length === 0 ? null : [
    `${valides} sur ${pluriel(affectations.length, 'deck affecté', 'decks affectés')} ${valides > 1 ? 'validés' : 'validé'}`,
    retards > 0 ? `${retards} en retard` : null,
    dus > 0 ? pluriel(dus, 'exercice à revoir', 'exercices à revoir') : null,
  ].filter(Boolean).join(' · ')

  return (
    <div>
      <Entete sousTitre={sousTitre} />

      <div className="ac-jour">
        <Serie serie={serie} />
        <Objectif serie={serie} onObjectif={onObjectif} />
        <div className="card card-p ac-jour-carte">
          <div className="ac-kpi-kicker">XP</div>
          <div className="ac-kpi-valeur">{Number(xp.aujourdhui) || 0} <span className="ac-kpi-unite">aujourd’hui</span></div>
          <div className="ac-kpi-sous">{Number(xp.semaine) || 0} XP cette semaine · {Number(xp.total) || 0} au total</div>
        </div>
        <div className="card card-p ac-jour-carte">
          <div className="ac-kpi-kicker">À revoir</div>
          <div className="ac-kpi-valeur">{dus}</div>
          <div className="ac-kpi-sous">{dus > 0 ? 'exercices dont la révision est arrivée : ils passent en premier dans ta prochaine session' : 'aucun exercice en attente de révision'}</div>
        </div>
      </div>

      <section className="ac-bloc" aria-labelledby="ac-mp-decks">
        <h3 id="ac-mp-decks" className="ac-bloc-titre">Mes decks</h3>
        {ordonnes.length === 0 ? (
          <div className="card">
            <div className="table-empty-state">
              <div className="empty-title">Rien ne t est encore affecté : le catalogue est ouvert</div>
              <div className="empty-sub">Choisis un deck et lance une session de douze exercices. Ton responsable peut aussi t affecter un parcours.</div>
              <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => onNaviguer?.('#/formation/catalogue')}>
                Ouvrir le catalogue
              </button>
            </div>
          </div>
        ) : (
          <div className="ac-grille">
            {ordonnes.map((a) => <Deck key={a.id || a.version_id} a={a} aujourdhui={jourJ} onNaviguer={onNaviguer} />)}
          </div>
        )}
      </section>

      <section className="ac-bloc" aria-labelledby="ac-mp-reussites">
        <h3 id="ac-mp-reussites" className="ac-bloc-titre">Dernières réussites</h3>
        {reussites.length === 0 ? (
          <div className="ac-muet">Aucun deck validé pour l’instant. Un deck se valide à trois couronnes : tous ses exercices sus au moins deux fois.</div>
        ) : (
          <ul className="ac-liste-plate">
            {reussites.map((r) => {
              const numero = typeof r.attestation === 'string' ? r.attestation : r.attestation?.numero
              return (
                <li key={r.version_id} className="card card-p ac-ligne">
                  <span className="ac-coche" aria-hidden="true">✓</span>
                  <div className="ac-croissance">
                    <div className="priority-item-client">{r.titre}</div>
                    <div className="priority-item-detail">
                      Validé le {jourParis(r.valide_le)}{numero ? ` · attestation ${numero}` : ''}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.(`#/formation/module/${r.slug}`)}>Voir le deck</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function MonParcours({ onNaviguer }) {
  const [parcours, setParcours] = useState(null)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let vivant = true
    monParcours()
      .then((p) => { if (vivant) setParcours(p || {}) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [])

  async function changerObjectif(n) {
    try {
      await objectifQuotidien(n)
      setParcours((p) => {
        const serie = { ...(p?.serie || {}), objectif_quotidien: n }
        serie.objectif_atteint = (Number(serie.sessions_aujourdhui) || 0) >= n
        return { ...p, serie }
      })
      toast.success(`Objectif : ${pluriel(n, 'session', 'sessions')} par jour`)
    } catch (e) {
      toast.error('Objectif non enregistré : ' + messageErreur(e))
    }
  }

  if (erreur) {
    return (
      <div>
        <Entete />
        <div className="notice notice-error" role="alert">{erreur}</div>
      </div>
    )
  }
  if (!parcours) {
    return (
      <div>
        <Entete />
        <SkeletonCards n={4} />
      </div>
    )
  }
  return <MonParcoursVue parcours={parcours} aujourdhui={parcours.aujourdhui} onNaviguer={onNaviguer} onObjectif={changerObjectif} />
}
