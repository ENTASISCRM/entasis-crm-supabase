// ═══════════════════════════════════════════════════════════════════════════
// MES RÉSULTATS : ce que le collaborateur a fait, et ce qui reste fragile
//
// La série et la meilleure série, l XP total, l XP par semaine (barres CSS
// doublées d’un tableau lisible), toutes les sessions terminées, puis les
// « Exercices à consolider » : les items dont la force est basse, avec leur
// prochaine date de révision et le bouton qui ouvre une session sur le deck
// concerné. C’est la progression qui compte, pas la note isolée.
//
// Conteneur (academy_mes_resultats) et présentation séparés.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { mesResultats } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { dateHeureParis, jourParis, semaineLibelle } from '../../lib/academy/format'
import { Flamme } from './Couronnes'
import { SkeletonTable } from '../ui/Skeleton'

const FORCE_MAX = 5
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

function Entete({ sousTitre }) {
  return (
    <div className="section-header">
      <div>
        <div className="section-kicker">Formation</div>
        <div className="section-title">Mes résultats</div>
        {sousTitre && <div className="section-sub">{sousTitre}</div>}
      </div>
    </div>
  )
}

function Kpi({ kicker, valeur, sous, avant }) {
  return (
    <div className="card card-p">
      <div className="ac-kpi-kicker">{kicker}</div>
      <div className="ac-serie">
        {avant}
        <div className="ac-kpi-valeur">{valeur}</div>
      </div>
      {sous && <div className="ac-kpi-sous">{sous}</div>}
    </div>
  )
}

// L XP par semaine : une barre par semaine (hauteur relative au maximum),
// puis le tableau qui porte les chiffres exacts.
function Semaines({ semaines }) {
  const liste = Array.isArray(semaines) ? semaines : []
  if (liste.length === 0) return <div className="ac-muet">Aucune session terminée ces douze dernières semaines.</div>
  const max = Math.max(1, ...liste.map((s) => Number(s.xp) || 0))
  return (
    <div className="card card-p">
      <div className="ac-barres" aria-hidden="true">
        {liste.map((s) => {
          const xp = Number(s.xp) || 0
          return (
            <div key={s.semaine} className="ac-barre">
              <div className="ac-barre-colonne">
                <div className="ac-barre-plein" style={{ height: `${Math.round((100 * xp) / max)}%` }} />
              </div>
              <div className="ac-barre-libelle">{jourParis(s.semaine).slice(0, 5)}</div>
            </div>
          )
        })}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Semaine</th><th>XP</th><th>Sessions</th></tr>
          </thead>
          <tbody>
            {liste.map((s) => (
              <tr key={s.semaine}>
                <td className="cell-primary">{semaineLibelle(s.semaine)}</td>
                <td className="cell-mono">{Number(s.xp) || 0}</td>
                <td className="cell-mono">{Number(s.sessions) || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Un exercice faible : force sur cinq, prochaine révision, session sur le deck.
function ItemFaible({ item, aujourdhui, onNaviguer }) {
  const force = Math.max(0, Math.min(FORCE_MAX, Number(item.force) || 0))
  const prochaine = item.prochaine_le ? String(item.prochaine_le) : ''
  const due = prochaine && aujourdhui ? new Date(prochaine).getTime() <= new Date(aujourdhui).getTime() : false
  return (
    <li className="card card-p ac-ligne ac-faible">
      <div className="ac-croissance">
        <div className="priority-item-client">{item.enonce_court || 'Exercice'}</div>
        <div className="priority-item-detail">{[item.titre_module, item.competence].filter(Boolean).join(' · ')}</div>
        <div className="ac-force" aria-label={`Force ${force} sur ${FORCE_MAX}`}>
          {Array.from({ length: FORCE_MAX }).map((_, i) => <span key={i} className={`ac-force-point${i < force ? ' on' : ''}`} />)}
          <span className="ac-muet">force {force}/{FORCE_MAX}{prochaine ? ` · ${due ? 'à revoir depuis le' : 'prochaine révision le'} ${jourParis(prochaine)}` : ''}</span>
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => onNaviguer?.(`#/formation/entrainement/${item.version_id}`)}>S’entraîner</button>
    </li>
  )
}

export function MesResultatsVue({ resultats, aujourdhui, onNaviguer }) {
  const r = resultats || {}
  const sessions = Array.isArray(r.sessions) ? r.sessions : []
  const faibles = Array.isArray(r.items_faibles) ? r.items_faibles : []
  const serie = Number(r.serie) || 0
  const meilleure = Number(r.meilleure) || 0
  const xpTotal = Number(r.xp_total) || 0
  const jourJ = aujourdhui || null

  if (sessions.length === 0 && faibles.length === 0) {
    return (
      <div>
        <Entete />
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucune session pour l instant</div>
            <div className="empty-sub">Lance une session de douze exercices sur un deck : chaque session s inscrit ici avec sa date, ses bonnes réponses et son XP.</div>
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => onNaviguer?.('#/formation/parcours')}>
              Voir Aujourd hui
            </button>
          </div>
        </div>
      </div>
    )
  }

  const bons = sessions.reduce((n, s) => n + (Number(s.nb_bons) || 0), 0)
  const total = sessions.reduce((n, s) => n + (Number(s.nb_total) || 0), 0)

  return (
    <div>
      <Entete sousTitre={`${pluriel(sessions.length, 'session terminée', 'sessions terminées')} · ${bons} bonnes réponses sur ${total} · ${xpTotal} XP`} />

      <div className="kpi-grid">
        <Kpi kicker="Série en cours" valeur={pluriel(serie, 'jour', 'jours')} avant={<Flamme eteinte={serie === 0} />} sous={serie === 0 ? 'une session aujourd hui la relance' : 'jours consécutifs avec une session'} />
        <Kpi kicker="Meilleure série" valeur={pluriel(meilleure, 'jour', 'jours')} sous="ton record" />
        <Kpi kicker="XP total" valeur={xpTotal} sous="10 XP par bonne réponse, 5 par carte sue, bonus session parfaite et première du jour" />
        <Kpi kicker="À consolider" valeur={faibles.length} sous={faibles.length ? 'exercices à force basse' : 'aucun exercice fragile'} />
      </div>

      <section className="ac-bloc" aria-labelledby="ac-mr-semaines">
        <h3 id="ac-mr-semaines" className="ac-bloc-titre">XP par semaine</h3>
        <Semaines semaines={r.semaines} />
      </section>

      <section className="ac-bloc" aria-labelledby="ac-mr-sessions">
        <h3 id="ac-mr-sessions" className="ac-bloc-titre">Sessions</h3>
        {sessions.length === 0 ? (
          <div className="ac-muet">Aucune session terminée.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Deck</th><th>Date</th><th>Bonnes réponses</th><th>XP</th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-primary">
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto', fontWeight: 600 }}
                        onClick={() => onNaviguer?.(`#/formation/module/${s.slug}`)}>
                        {s.titre}
                      </button>
                    </td>
                    <td className="cell-mono">{dateHeureParis(s.terminee_le || s.demarree_le)}</td>
                    <td className="cell-mono">{Number(s.nb_bons) || 0}/{Number(s.nb_total) || 0}</td>
                    <td className="cell-mono">{Number(s.xp) || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ac-bloc" aria-labelledby="ac-mr-faibles">
        <h3 id="ac-mr-faibles" className="ac-bloc-titre">Exercices à consolider</h3>
        {faibles.length === 0 ? (
          <div className="ac-muet">Aucun exercice fragile : tout ce que tu as vu tient au moins à force 3.</div>
        ) : (
          <ul className="ac-liste-plate">
            {faibles.map((item) => <ItemFaible key={item.item_id} item={item} aujourdhui={jourJ} onNaviguer={onNaviguer} />)}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function MesResultats({ onNaviguer }) {
  const [resultats, setResultats] = useState(null)
  const [erreur, setErreur] = useState(null)
  // L instant de l’ouverture : sert à dire si une révision est déjà due.
  const [aujourdhui] = useState(() => new Date().toISOString())

  useEffect(() => {
    let vivant = true
    mesResultats()
      .then((r) => { if (vivant) setResultats(r || {}) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [])

  if (erreur) return <div><Entete /><div className="notice notice-error" role="alert">{erreur}</div></div>
  if (!resultats) return <div><Entete /><SkeletonTable rows={5} cols={4} /></div>
  return <MesResultatsVue resultats={resultats} aujourdhui={aujourdhui} onNaviguer={onNaviguer} />
}
