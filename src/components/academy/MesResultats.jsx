// ═══════════════════════════════════════════════════════════════════════════
// MES RÉSULTATS : l historique daté des tentatives du collaborateur
//
// Un tableau de toutes les tentatives soumises (quiz et révisions), et en
// tête, par module, le premier score, le dernier, le meilleur et le nombre
// de tentatives : c est la progression qui compte, pas la note isolée. Les
// révisions se lisent à part des quiz dans ces agrégats. Un module sans
// tentative dit « Non évalué », jamais 0. Une frise chronologique reprend
// le tout dans l ordre.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { mesTentatives } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { formatScore } from '../../lib/academy/quiz'
import { formatDuree, jourParis, pourcentage } from '../../lib/academy/format'
import { SkeletonTable } from '../ui/Skeleton'

const TYPE_LIBELLE = { quiz: 'Quiz', revision_j7: 'Révision J+7', revision_j30: 'Révision J+30' }
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const score = (t) => (t && Number(t.total) > 0 ? formatScore(t.score, t.total) : null)
const NonEvalue = () => <span className="ac-italique">Non évalué</span>

// Par module (version) : les quiz d un côté, les révisions de l autre, dans
// l ordre chronologique, avec premier, dernier, meilleur et compte.
function agregerParModule(tentatives) {
  const parVersion = new Map()
  for (const t of tentatives) {
    if (!parVersion.has(t.version_id)) parVersion.set(t.version_id, { version_id: t.version_id, titre: t.titre, slug: t.slug, quiz: [], revisions: [] })
    const g = parVersion.get(t.version_id)
    ;(t.type === 'quiz' ? g.quiz : g.revisions).push(t)
  }
  const tri = (a, b) => String(a.soumise_le || '').localeCompare(String(b.soumise_le || ''))
  const resume = (liste) => {
    const l = [...liste].sort(tri)
    if (l.length === 0) return { premier: null, dernier: null, meilleur: null, nombre: 0 }
    const meilleur = l.reduce((m, t) => (pourcentage(t.score, t.total) > pourcentage(m.score, m.total) ? t : m), l[0])
    return { premier: l[0], dernier: l[l.length - 1], meilleur, nombre: l.length }
  }
  return [...parVersion.values()].map((g) => ({ ...g, quiz: resume(g.quiz), revisions: resume(g.revisions) }))
}

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

export function MesResultatsVue({ tentatives, onNaviguer }) {
  const liste = Array.isArray(tentatives) ? tentatives : []
  const modules = agregerParModule(liste)
  const chrono = [...liste].sort((a, b) => String(b.soumise_le || '').localeCompare(String(a.soumise_le || '')))

  if (liste.length === 0) {
    return (
      <div>
        <Entete />
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucune tentative pour l instant</div>
            <div className="empty-sub">Termine les leçons d un module, puis passe son quiz : chaque tentative s inscrit ici, avec sa date et son score.</div>
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => onNaviguer?.('#/formation/parcours')}>
              Voir mon parcours
            </button>
          </div>
        </div>
      </div>
    )
  }

  const reussies = liste.filter((t) => t.reussie).length
  return (
    <div>
      <Entete sousTitre={`${pluriel(liste.length, 'tentative', 'tentatives')} · ${reussies} ${reussies > 1 ? 'réussies' : 'réussie'} · ${pluriel(modules.length, 'module', 'modules')}`} />

      <div className="kpi-grid">
        {modules.map((m) => (
          <div key={m.version_id} className="card card-p">
            <div className="ac-kpi-kicker">{m.titre}</div>
            <div className="ac-kpi-valeur">{score(m.quiz.dernier) || <NonEvalue />}</div>
            <div className="ac-kpi-sous">
              {m.quiz.nombre === 0 ? (
                <span>Aucun quiz passé</span>
              ) : (
                <span>
                  premier {score(m.quiz.premier)} · meilleur {score(m.quiz.meilleur)} · {pluriel(m.quiz.nombre, 'tentative', 'tentatives')}
                </span>
              )}
            </div>
            <div className="ac-kpi-sous">
              {m.revisions.nombre === 0 ? 'Révisions : ' : `Révisions : dernière ${score(m.revisions.dernier)} · ${pluriel(m.revisions.nombre, 'faite', 'faites')}`}
              {m.revisions.nombre === 0 && <NonEvalue />}
            </div>
          </div>
        ))}
      </div>

      <section className="ac-bloc" aria-labelledby="ac-mr-table">
        <h3 id="ac-mr-table" className="ac-bloc-titre">Toutes les tentatives</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Module</th><th>Type</th><th>Date</th><th>Score</th><th>Résultat</th><th>Durée</th><th>Notions à revoir</th>
              </tr>
            </thead>
            <tbody>
              {chrono.map((t) => {
                const notions = Array.isArray(t.notions_a_revoir) ? t.notions_a_revoir : []
                return (
                  <tr key={t.id}>
                    <td className="cell-primary">
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto', fontWeight: 600 }}
                        onClick={() => onNaviguer?.(`#/formation/module/${t.slug}`)}>
                        {t.titre}
                      </button>
                    </td>
                    <td>{TYPE_LIBELLE[t.type] || t.type}{t.numero ? ` n° ${t.numero}` : ''}</td>
                    <td className="cell-mono">{jourParis(t.soumise_le)}</td>
                    <td className="cell-mono">{score(t) || <NonEvalue />}</td>
                    <td><span className={`badge ${t.reussie ? 'badge-signed' : 'badge-high'}`}>{t.reussie ? 'Réussi' : 'À revoir'}</span></td>
                    <td className="cell-mono">{formatDuree(t.duree_s)}</td>
                    <td>{notions.length ? notions.join(', ') : <span className="ac-muet">aucune</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ac-bloc" aria-labelledby="ac-mr-frise">
        <h3 id="ac-mr-frise" className="ac-bloc-titre">Chronologie</h3>
        <ol className="ac-frise">
          {chrono.map((t) => {
            const revision = t.type !== 'quiz'
            const pastille = revision ? 'revision' : t.reussie ? 'reussie' : 'echouee'
            return (
              <li key={t.id} className="ac-frise-item">
                <span className={`ac-frise-pastille ${pastille}`} aria-hidden="true" />
                <span className="cell-mono">{jourParis(t.soumise_le)}</span>{' · '}
                <span className="ac-frise-titre">{t.titre}</span>{' · '}
                {TYPE_LIBELLE[t.type] || t.type} {score(t) || ''} {revision ? (t.reussie ? '(réussie)' : '(à revoir)') : (t.reussie ? '(réussi)' : '(à revoir)')}
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

export default function MesResultats({ onNaviguer }) {
  const [tentatives, setTentatives] = useState(null)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let vivant = true
    mesTentatives()
      .then((l) => { if (vivant) setTentatives(Array.isArray(l) ? l : []) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [])

  if (erreur) return <div><Entete /><div className="notice notice-error" role="alert">{erreur}</div></div>
  if (!tentatives) return <div><Entete /><SkeletonTable rows={5} cols={7} /></div>
  return <MesResultatsVue tentatives={tentatives} onNaviguer={onNaviguer} />
}
