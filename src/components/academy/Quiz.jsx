// ═══════════════════════════════════════════════════════════════════════════
// QUIZ : une question par écran, la correction seulement après soumission
//
// La base tire les questions et mélange les choix (academy_ouvrir_tentative)
// sans jamais envoyer la bonne réponse ; l état du navigateur ne contient
// donc que des énoncés, des choix et les index cochés. La soumission envoie
// { question_id: index présenté } et reçoit le score, le seuil, la validation
// éventuelle et la correction question par question.
//
// Le même écran sert aux révisions J+7 et J+30 (type revision_j7 ou
// revision_j30) : titre différent, pas de retentative.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ouvrirTentative, soumettreTentative, listerCatalogue } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { formatScore, seuilTexte, reponsesCompletes, notionsARevoir, jetonClient } from '../../lib/academy/quiz'
import { SkeletonText } from '../ui/Skeleton'

const TITRES = { quiz: 'Quiz du module', revision_j7: 'Révision J+7', revision_j30: 'Révision J+30' }
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const idDe = (q) => q?.question_id ?? q?.id

function Resultat({ resultat, questions, type, slugModule, onRetenter, onNaviguer }) {
  const r = resultat || {}
  const corrections = Array.isArray(r.corrections) ? r.corrections : []
  const parId = Object.fromEntries((questions || []).map((q) => [idDe(q), q]))
  const notions = notionsARevoir(corrections)
  const revision = type !== 'quiz'
  return (
    <div>
      <div className="ac-resultat">
        <div className="ac-resultat-score">{formatScore(r.score, r.total)}</div>
        <div className="ac-resultat-seuil">{seuilTexte(Number(r.seuil) || 0.8, Number(r.total) || 0)}</div>
        <span className={`badge ${r.reussie ? 'badge-signed' : 'badge-high'}`}>{r.reussie ? 'Réussi' : 'À revoir'}</span>
      </div>

      {r.module_valide && (
        <div className="card card-p ac-valide">
          <div className="ac-kpi-kicker">Module validé</div>
          <div className="priority-item-client">
            {r.attestation?.numero ? `Attestation interne ${r.attestation.numero}` : 'Attestation interne de réalisation délivrée'}
          </div>
          <div className="priority-item-detail">Deux révisions t attendent : à J+7 et à J+30. Elles apparaîtront dans Mon parcours.</div>
        </div>
      )}

      {notions.length > 0 && (
        <div className="ac-bloc">
          <div className="ac-bloc-titre">Notions à revoir</div>
          <ul className="ac-notions">{notions.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}

      <div className="ac-bloc">
        <div className="ac-bloc-titre">Correction</div>
        {corrections.map((c, i) => {
          const q = parId[c.question_id] || {}
          const choix = Array.isArray(q.choix) ? q.choix : []
          const taReponse = Number.isInteger(c.reponse) ? choix[c.reponse] : null
          const bonne = Number.isInteger(c.bonne_reponse) ? choix[c.bonne_reponse] : null
          return (
            <div key={c.question_id || i} className="ac-correction">
              <div className="ac-correction-enonce">
                {i + 1}. {q.enonce || 'Question'}
                {' '}<span className={`badge ${c.correcte ? 'badge-signed' : 'badge-cancelled'}`}>{c.correcte ? 'Juste' : 'Faux'}</span>
              </div>
              <div className="ac-choix-liste">
                {choix.map((texte, j) => {
                  const estBonne = j === c.bonne_reponse
                  const estTienne = j === c.reponse
                  const classe = estBonne ? ' ac-choix-juste' : estTienne ? ' ac-choix-faux' : ''
                  return (
                    <div key={j} className={`ac-choix${classe}`} style={{ cursor: 'default' }}>
                      <span>{texte}</span>
                      {(estBonne || estTienne) && (
                        <span className="ac-choix-marque">
                          {estBonne && estTienne ? 'ta réponse, la bonne' : estBonne ? 'la bonne réponse' : 'ta réponse'}
                        </span>
                      )}
                    </div>
                  )
                })}
                {taReponse == null && <div className="ac-muet">Sans réponse{bonne ? ` · la bonne réponse : ${bonne}` : ''}</div>}
              </div>
              {c.explication && <div className="ac-correction-explication">{c.explication}</div>}
              {c.lecon_id && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => onNaviguer?.(`#/formation/lecon/${c.lecon_id}`)}>
                  Revoir la leçon
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="ac-quiz-actions">
        {!revision && <button type="button" className="btn btn-primary" onClick={onRetenter}>Retenter le quiz</button>}
        <button type="button" className="btn btn-outline" onClick={() => onNaviguer?.(slugModule ? `#/formation/module/${slugModule}` : '#/formation/parcours')}>
          Retour au module
        </button>
      </div>
    </div>
  )
}

/**
 * La vue, sans réseau.
 * tentative : l objet rendu par ouvrirTentative ; reponses : { question_id: index }
 * resultat : l objet rendu par soumettreTentative, ou null avant soumission
 */
export function QuizVue({ tentative, type = 'quiz', index = 0, reponses, resultat, envoi, slugModule, onChoix, onIndex, onSoumettre, onRetenter, onNaviguer }) {
  const t = tentative || {}
  const questions = Array.isArray(t.questions) ? t.questions : []
  const total = questions.length
  const titre = TITRES[type] || TITRES.quiz

  if (resultat) {
    return (
      <div className="ac-quiz">
        <div className="section-header">
          <div>
            <div className="section-kicker">Formation</div>
            <div className="section-title">{titre} · résultat</div>
          </div>
        </div>
        <div className="card card-p">
          <Resultat resultat={resultat} questions={questions} type={type} slugModule={slugModule} onRetenter={onRetenter} onNaviguer={onNaviguer} />
        </div>
      </div>
    )
  }

  const i = Math.max(0, Math.min(index, Math.max(0, total - 1)))
  const q = questions[i] || null
  const qid = idDe(q)
  const choix = Array.isArray(q?.choix) ? q.choix : []
  const rep = reponses || {}
  const derniere = i >= total - 1
  const completes = reponsesCompletes(questions, rep)
  const manquantes = questions.filter((x) => !Number.isInteger(rep[idDe(x)])).length
  const pct = total > 0 ? Math.round((100 * (i + 1)) / total) : 0

  const surTouche = (e) => {
    if (e.key !== 'Enter' || e.target?.tagName === 'BUTTON') return
    e.preventDefault()
    if (derniere) { if (completes && !envoi) onSoumettre?.() } else onIndex?.(i + 1)
  }

  return (
    <div className="ac-quiz">
      <div className="section-header">
        <div>
          <div className="section-kicker">Formation</div>
          <div className="section-title">{titre}</div>
          <div className="section-sub">{seuilTexte(Number(t.seuil) || 0.8, total)}. Les réponses ne sont corrigées qu à la fin.</div>
        </div>
      </div>

      {total === 0 ? (
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucune question disponible</div>
            <div className="empty-sub">La banque de questions de ce module est vide. Signale le à la direction.</div>
          </div>
        </div>
      ) : (
        <div className="card card-p" onKeyDown={surTouche}>
          <div className="ac-quiz-entete">
            <span className="ac-quiz-compteur" aria-hidden="true">Question {i + 1} sur {total}</span>
            <span className="ac-quiz-compteur">{manquantes > 0 ? `${pluriel(manquantes, 'question sans réponse', 'questions sans réponse')}` : 'Toutes répondues'}</span>
          </div>
          <div className="ac-progress" aria-hidden="true"><div className="ac-progress-fill" style={{ width: `${pct}%` }} /></div>
          <span className="ac-sr">Question {i + 1} sur {total}</span>

          <fieldset key={qid}>
            <legend>{q?.enonce}</legend>
            <div className="ac-choix-liste">
              {choix.map((texte, j) => {
                const coche = rep[qid] === j
                return (
                  <label key={j} className={`ac-choix${coche ? ' on' : ''}`}>
                    <input type="radio" name={`ac-q-${qid}`} value={j} checked={coche} onChange={() => onChoix?.(qid, j)}
                      style={{ accentColor: 'var(--gold)' }} autoFocus={j === 0 && !Number.isInteger(rep[qid])} />
                    <span>{texte}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="ac-quiz-actions">
            <button type="button" className="btn btn-outline" disabled={i === 0} onClick={() => onIndex?.(i - 1)}>Précédente</button>
            {!derniere && (
              <button type="button" className="btn btn-outline" onClick={() => onIndex?.(i + 1)}>Suivante</button>
            )}
            {derniere && (
              <>
                <button type="button" className="btn btn-primary" disabled={!completes || !!envoi} onClick={onSoumettre}>
                  {envoi ? 'Correction…' : 'Valider le quiz'}
                </button>
                {!completes && <span className="ac-quiz-manque">{pluriel(manquantes, 'question sans réponse', 'questions sans réponse')}</span>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Quiz({ versionId, type = 'quiz', onNaviguer }) {
  const [jeton, setJeton] = useState(() => jetonClient())
  const [tentative, setTentative] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [reponses, setReponses] = useState({})
  const [index, setIndex] = useState(0)
  const [resultat, setResultat] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [slugModule, setSlugModule] = useState(null)

  // La route ne porte que la version : le slug du module, pour « Retour au
  // module », se retrouve dans le catalogue. Silencieux en cas d échec, le
  // bouton renvoie alors vers Mon parcours.
  useEffect(() => {
    let vivant = true
    listerCatalogue()
      .then((liste) => { if (vivant) setSlugModule((liste || []).find((m) => m.version_id === versionId)?.slug || null) })
      .catch(() => {})
    return () => { vivant = false }
  }, [versionId])

  useEffect(() => {
    let vivant = true
    setTentative(null)
    setErreur(null)
    setReponses({})
    setIndex(0)
    setResultat(null)
    ouvrirTentative(versionId, type, jeton)
      .then((t) => { if (vivant) setTentative(t) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [versionId, type, jeton])

  async function soumettre() {
    if (envoi || !tentative?.tentative_id) return
    if (!reponsesCompletes(tentative.questions, reponses)) return
    setEnvoi(true)
    try {
      const r = await soumettreTentative(tentative.tentative_id, reponses)
      setResultat(r)
      if (r?.module_valide && type === 'quiz') toast.success('Module validé')
      else toast.success(r?.reussie ? 'Quiz réussi' : 'Quiz enregistré')
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  if (erreur) {
    return (
      <div className="ac-quiz">
        <div className="ac-retour">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/parcours')}>Retour à mon parcours</button>
        </div>
        <div className="notice notice-error" role="alert">{erreur}</div>
      </div>
    )
  }
  if (!tentative) return <div className="ac-quiz"><div className="card card-p"><SkeletonText lines={6} /></div></div>
  return (
    <QuizVue
      tentative={tentative} type={type} index={index} reponses={reponses} resultat={resultat} envoi={envoi} slugModule={slugModule}
      onChoix={(qid, j) => setReponses((r) => ({ ...r, [qid]: j }))}
      onIndex={setIndex}
      onSoumettre={soumettre}
      onRetenter={() => setJeton(jetonClient())}
      onNaviguer={onNaviguer}
    />
  )
}
