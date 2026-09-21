// ═══════════════════════════════════════════════════════════════════════════
// DÉTAIL D UN MODULE : la page de garde avant de lire, puis avant le quiz
//
// Ce que dit la page : l objectif et la compétence visée, le seuil du quiz,
// où j en suis (statut, échéance, leçons cochées), le cas pratique avec son
// corrigé replié, ce que le cabinet doit encore compléter, l historique des
// tentatives, les révisions, l attestation interne. Le quiz ne s ouvre que
// quand toutes les leçons sont terminées : le bouton le dit au lieu de
// laisser la base refuser.
//
// L attestation se génère à la demande : le module PDF (jsPDF) n est chargé
// qu au clic, pour rester hors du paquet servi à l ouverture du CRM.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { lireModule } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { jourISO } from '../../lib/ma-journee'
import { classeBadge, enRetard, libelleEcheance, STATUTS } from '../../lib/academy/statuts'
import { libelleRevision } from '../../lib/academy/revisions'
import { formatDuree, jourParis, libelleNiveau, libelleTheme } from '../../lib/academy/format'
import { formatScore, seuilTexte } from '../../lib/academy/quiz'
import RenduMarkdown from '../ui/RenduMarkdown'
import { SkeletonText } from '../ui/Skeleton'

const TYPE_TENTATIVE = { quiz: 'Quiz', revision_j7: 'Révision J+7', revision_j30: 'Révision J+30' }

// Le nombre de questions d un quiz n est pas dans l objet module : on le lit
// sur une tentative passée, sinon sur le réglage par défaut (5).
function totalQuiz(module) {
  const t = (module?.tentatives || []).find((x) => x.type === 'quiz' && Number(x.total) > 0)
  return Number(module?.questions_par_quiz) || Number(t?.total) || 5
}

function Sources({ sources }) {
  const liste = Array.isArray(sources) ? sources : []
  if (liste.length === 0) return null
  return (
    <details className="ac-details">
      <summary>Sources ({liste.length})</summary>
      <div className="ac-details-corps">
        <ul className="ac-sources">
          {liste.map((s, i) => (
            <li key={i}>
              {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.titre || s.url}</a> : <span>{s.titre}</span>}
              {s.emetteur ? ` · ${s.emetteur}` : ''}
              {s.date_consultation ? ` · consultée le ${jourParis(s.date_consultation)}` : ''}
              {s.ce_qu_elle_etablit ? ` : ${s.ce_qu_elle_etablit}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

export function ModuleDetailVue({ module, profile, aujourdhui, onNaviguer, onAttestation }) {
  const m = module || {}
  const lecons = Array.isArray(m.lecons) ? m.lecons : []
  const terminees = lecons.filter((l) => l.terminee_le).length
  const toutesTerminees = lecons.length > 0 && terminees === lecons.length
  const affectation = m.affectation ? { ...m.affectation, valide_le: m.validation?.valide_le } : null
  const statut = affectation?.statut || (m.validation?.valide_le ? 'valide' : terminees > 0 ? 'en_cours' : 'non_commence')
  const retard = affectation ? enRetard({ ...affectation, statut }, aujourdhui) : false
  const echeance = affectation ? libelleEcheance({ ...affectation, statut }, aujourdhui) : ''
  const cas = m.cas_pratique || null
  const questionsCas = Array.isArray(cas?.questions) ? cas.questions : []
  const aCompleter = Array.isArray(m.a_completer) ? m.a_completer : []
  const tentatives = Array.isArray(m.tentatives) ? m.tentatives : []
  const revisions = Array.isArray(m.revisions) ? m.revisions : []
  const nbQuestions = totalQuiz(m)

  return (
    <div>
      <div className="ac-retour">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/catalogue')}>Retour au catalogue</button>
      </div>

      <div className="section-header">
        <div>
          <div className="section-kicker">{[libelleTheme(m.theme), libelleNiveau(m.niveau)].filter(Boolean).join(' · ')}</div>
          <div className="section-title">{m.titre}</div>
          {m.objectif && <div className="section-sub">{m.objectif}</div>}
          <div className="ac-entete-meta">
            {m.competence && <span>Compétence : {m.competence}</span>}
            {m.duree_minutes ? <span>· {m.duree_minutes} min</span> : null}
            <span>· {seuilTexte(Number(m.seuil_reussite) || 0.8, nbQuestions)}</span>
          </div>
          <div className="ac-entete-meta">
            <span className={classeBadge(statut)}>{STATUTS[statut] || 'Non commencé'}</span>
            {retard && <span className="badge badge-urgent">En retard</span>}
            {affectation?.obligatoire && <span className="badge badge-normal">Obligatoire</span>}
            {echeance && <span>{echeance}</span>}
            {!affectation && <span>Consultation libre, module non affecté</span>}
            {m.duree_active_s > 0 && <span>· temps actif {formatDuree(m.duree_active_s)}</span>}
          </div>
        </div>
      </div>

      {aCompleter.length > 0 && (
        <div className="notice notice-warn">
          <div className="ac-notice-titre">À compléter par le cabinet</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {aCompleter.map((x, i) => <li key={i}>{typeof x === 'string' ? x : x?.texte || JSON.stringify(x)}</li>)}
          </ul>
        </div>
      )}

      <section className="ac-bloc" aria-labelledby="ac-md-lecons">
        <h3 id="ac-md-lecons" className="ac-bloc-titre">Leçons · {terminees} sur {lecons.length} {terminees > 1 ? 'terminées' : 'terminée'}</h3>
        <div className="card">
          <ol className="ac-lecons">
            {lecons.map((l) => {
              const finie = !!l.terminee_le
              const enCours = !finie && l.position && typeof l.position === 'object' && Object.keys(l.position).length > 0
              return (
                <li key={l.id} className="ac-lecon-item">
                  <span className="ac-lecon-numero">{l.ordre}.</span>
                  <span className={finie ? 'ac-coche' : 'ac-coche-vide'} aria-label={finie ? 'Terminée' : 'À faire'} style={{ minWidth: 14, textAlign: 'center' }}>{finie ? '✓' : ''}</span>
                  <div className="ac-croissance">
                    <div className="ac-lecon-titre">{l.titre}</div>
                    <div className="ac-lecon-sous">
                      {[l.duree_minutes ? `${l.duree_minutes} min` : null, finie ? `terminée le ${jourParis(l.terminee_le)}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button type="button" className={`btn btn-sm ${enCours ? 'btn-primary' : 'btn-outline'}`} onClick={() => onNaviguer?.(`#/formation/lecon/${l.id}`)}>
                    {enCours ? 'Reprendre' : 'Lire'}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      {cas && (cas.situation_markdown || cas.titre) && (
        <section className="ac-bloc" aria-labelledby="ac-md-cas">
          <h3 id="ac-md-cas" className="ac-bloc-titre">Cas pratique{cas.titre ? ` · ${cas.titre}` : ''}</h3>
          <div className="card card-p">
            <div className="ac-notice" style={{ marginBottom: 10 }}>Cas fictif, à travailler avant le quiz.</div>
            <RenduMarkdown markdown={cas.situation_markdown} />
            {questionsCas.length > 0 && (
              <ol className="ac-questions">
                {questionsCas.map((q, i) => <li key={i}>{typeof q === 'string' ? q : q?.enonce || q?.texte || ''}</li>)}
              </ol>
            )}
            {cas.corrige_markdown && (
              <details className="ac-details">
                <summary>Voir le corrigé</summary>
                <div className="ac-details-corps"><RenduMarkdown markdown={cas.corrige_markdown} /></div>
              </details>
            )}
          </div>
        </section>
      )}

      <section className="ac-bloc" aria-labelledby="ac-md-quiz">
        <h3 id="ac-md-quiz" className="ac-bloc-titre">Quiz</h3>
        <div className="card card-p ac-ligne">
          <div className="ac-croissance">
            <div className="priority-item-client">{nbQuestions} questions tirées de la banque du module</div>
            <div className="priority-item-detail">{seuilTexte(Number(m.seuil_reussite) || 0.8, nbQuestions)}. Un échec ne bloque rien : tu peux retenter.</div>
          </div>
          {m.tentative_ouverte ? (
            <button type="button" className="btn btn-primary" onClick={() => onNaviguer?.(`#/formation/quiz/${m.version_id}`)}>Reprendre le quiz en cours</button>
          ) : (
            <div className="ac-ligne-droite">
              {!toutesTerminees && <span className="ac-muet">Terminez les leçons pour ouvrir le quiz</span>}
              <button type="button" className="btn btn-primary" disabled={!toutesTerminees} onClick={() => onNaviguer?.(`#/formation/quiz/${m.version_id}`)}>
                Passer le quiz
              </button>
            </div>
          )}
        </div>
      </section>

      {tentatives.length > 0 && (
        <section className="ac-bloc" aria-labelledby="ac-md-tentatives">
          <h3 id="ac-md-tentatives" className="ac-bloc-titre">Historique des tentatives</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Type</th><th>Date</th><th>Score</th><th>Résultat</th><th>Durée</th></tr>
              </thead>
              <tbody>
                {tentatives.map((t) => (
                  <tr key={t.id}>
                    <td className="cell-primary">{TYPE_TENTATIVE[t.type] || t.type}{t.numero ? ` n° ${t.numero}` : ''}</td>
                    <td className="cell-mono">{jourParis(t.soumise_le)}</td>
                    <td className="cell-mono">{formatScore(t.score, t.total)}</td>
                    <td><span className={`badge ${t.reussie ? 'badge-signed' : 'badge-high'}`}>{t.reussie ? 'Réussi' : 'À revoir'}</span></td>
                    <td className="cell-mono">{formatDuree(t.duree_s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {revisions.length > 0 && (
        <section className="ac-bloc" aria-labelledby="ac-md-revisions">
          <h3 id="ac-md-revisions" className="ac-bloc-titre">Révisions</h3>
          <ul className="ac-liste-plate">
            {revisions.map((r) => {
              const faite = !!r.faite_le || !!r.resultat
              return (
                <li key={r.type} className="card card-p ac-ligne">
                  <div className="ac-croissance">
                    <div className="priority-item-client">{libelleRevision(r.type)}</div>
                    <div className="priority-item-detail">
                      {faite
                        ? `${r.resultat === 'reussie' ? 'Réussie' : 'Échouée'} le ${jourParis(r.faite_le)}`
                        : r.due ? `Due depuis le ${jourParis(r.echeance)}` : `Prévue le ${jourParis(r.echeance)}`}
                    </div>
                  </div>
                  {faite ? (
                    <span className={`badge ${r.resultat === 'reussie' ? 'badge-signed' : 'badge-high'}`}>{r.resultat === 'reussie' ? 'Réussie' : 'À revoir'}</span>
                  ) : r.due ? (
                    <button type="button" className="btn btn-primary btn-sm"
                      onClick={() => onNaviguer?.(`#/formation/quiz/${m.version_id}/revision_${String(r.type).toLowerCase()}`)}>
                      Réviser
                    </button>
                  ) : (
                    <span className="badge badge-normal">À venir</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {m.attestation && (
        <section className="ac-bloc" aria-labelledby="ac-md-attestation">
          <h3 id="ac-md-attestation" className="ac-bloc-titre">Attestation interne de réalisation</h3>
          <div className="card card-p ac-attestation">
            <div className="ac-croissance">
              <div className="priority-item-client">
                <span className="ac-attestation-numero">{m.attestation.numero}</span>
              </div>
              <div className="priority-item-detail">
                Délivrée le {jourParis(m.attestation.delivree_le)} · {formatScore(m.attestation.score, m.attestation.total)}
                {m.relu_par ? ` · contenu relu par ${m.relu_par}` : ''}
              </div>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onAttestation?.({
              numero: m.attestation.numero,
              delivreeLe: m.attestation.delivree_le,
              nomCollaborateur: profile?.full_name || '',
              titreModule: m.titre,
              competence: m.competence,
              score: m.attestation.score,
              total: m.attestation.total,
              reluPar: m.relu_par,
            })}>
              Télécharger l attestation interne
            </button>
          </div>
        </section>
      )}

      <Sources sources={m.sources} />
    </div>
  )
}

export default function ModuleDetail({ profile, slug, onNaviguer }) {
  const [module, setModule] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [aujourdhui] = useState(() => jourISO())

  useEffect(() => {
    let vivant = true
    setModule(null)
    setErreur(null)
    lireModule(slug)
      .then((m) => { if (vivant) setModule(m) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [slug])

  async function telecharger(donnees) {
    try {
      const { genererAttestation } = await import('../../lib/academy/attestation-pdf')
      await genererAttestation(donnees)
      toast.success('Attestation générée')
    } catch (e) {
      toast.error('Attestation impossible : ' + messageErreur(e))
    }
  }

  if (erreur) {
    return (
      <div>
        <div className="ac-retour">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/catalogue')}>Retour au catalogue</button>
        </div>
        <div className="notice notice-error" role="alert">{erreur}</div>
      </div>
    )
  }
  if (!module) return <div className="card card-p"><SkeletonText lines={6} /></div>
  return <ModuleDetailVue module={module} profile={profile} aujourdhui={aujourdhui} onNaviguer={onNaviguer} onAttestation={telecharger} />
}
