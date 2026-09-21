// ═══════════════════════════════════════════════════════════════════════════
// LECTEUR DE LEÇON : lire, reprendre où on en était, répondre à la mini
// question, et mesurer le temps actif sans tricher
//
// Trois mécaniques vivent dans le conteneur, la vue ne fait qu afficher :
//
// * la session et les battements : un jeton client tiré une fois par
//   montage rend l ouverture rejouable ; la machine d état de battement.js
//   reçoit les événements du navigateur (visibilité, clics, touches,
//   défilement, focus) et décide, toutes les 5 s, si un battement part. La
//   base horodate elle même. Une lecture sans interaction pendant plus de
//   deux minutes n est pas comptée, et l écran le dit ;
//
// * la position de lecture : le pourcentage de défilement de .app-content
//   (le conteneur qui défile dans le CRM) et le titre de la section en vue,
//   enregistrés 1,5 s après le dernier défilement, puis à la fermeture. Un
//   indicateur dit « Enregistré à 14h05 » ou propose de réessayer ;
//
// * la mini question : la base juge la réponse (terminerLecon), pose
//   terminee_le si elle est bonne, et renvoie l explication. Une mauvaise
//   réponse ne bloque rien : on réessaie.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { lireLecon, ouvrirSession, battement, sauverPosition, terminerLecon, avecRetry } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { creerBattement } from '../../lib/academy/battement'
import { jetonClient } from '../../lib/academy/quiz'
import RenduMarkdown from '../ui/RenduMarkdown'
import { SkeletonText } from '../ui/Skeleton'

const PAS_VERIFICATION_MS = 5000
const DEBOUNCE_POSITION_MS = 1500

const heureCourte = (d) => `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
const conteneurDefilant = () => (typeof document !== 'undefined' ? document.querySelector('.app-content') : null)

// Le pourcentage de défilement du conteneur et le titre de la dernière
// section passée sous le haut de l écran.
function lirePosition() {
  const c = conteneurDefilant()
  if (!c) return { scroll: 0, section: null }
  const max = c.scrollHeight - c.clientHeight
  const scroll = max > 0 ? Math.round((100 * c.scrollTop) / max) : 0
  let section = null
  const haut = c.getBoundingClientRect().top + 120
  for (const t of c.querySelectorAll('.ac-lecture .md-rendu h1, .ac-lecture .md-rendu h2, .ac-lecture .md-rendu h3')) {
    if (t.getBoundingClientRect().top <= haut) section = t.textContent?.trim() || null
    else break
  }
  return { scroll: Math.max(0, Math.min(100, scroll)), section }
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
              {s.ce_qu_elle_etablit ? ` : ${s.ce_qu_elle_etablit}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

function EtatSauvegarde({ sauvegarde, onReessayer }) {
  return (
    <div className="ac-etat-sauvegarde" role="status" aria-live="polite">
      {sauvegarde?.etat === 'ok' && <span>Enregistré à {sauvegarde.heure}</span>}
      {sauvegarde?.etat === 'echec' && (
        <>
          <span>Non enregistré</span>
          <span aria-hidden="true">·</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onReessayer}>Réessayer</button>
        </>
      )}
    </div>
  )
}

/**
 * La vue, sans effet ni réseau.
 * mini : { choix: number|null, envoi: boolean, resultat: { correcte, explication }|null }
 * sauvegarde : { etat: 'vierge'|'ok'|'echec', heure? }
 */
export function LecteurVue({ lecon, mini, sauvegarde, onChoix, onValider, onReessayer, onReessayerSauvegarde, onNaviguer }) {
  const l = lecon || {}
  const lecons = [...(Array.isArray(l.lecons) ? l.lecons : [])].sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
  const index = lecons.findIndex((x) => x.id === l.id)
  const suivante = index >= 0 ? lecons[index + 1] : null
  const total = lecons.length || 1
  const numero = index >= 0 ? index + 1 : l.ordre || 1
  const mq = l.mini_question || null
  const choix = Array.isArray(mq?.choix) ? mq.choix : []
  const dejaTerminee = !!l.progression?.terminee_le
  const resultat = mini?.resultat || null
  const reussie = dejaTerminee || !!resultat?.correcte
  const verrouille = dejaTerminee || !!resultat || !!mini?.envoi
  const explication = resultat?.explication || mq?.explication || ''

  return (
    <div className="ac-lecteur">
      <nav className="ac-sommaire" aria-label="Sommaire du module">
        <div className="ac-sommaire-titre">{l.module?.titre || 'Module'}</div>
        <ol className="ac-sommaire-liste">
          {lecons.map((x, i) => {
            const courante = x.id === l.id
            const finie = !!x.terminee_le || (courante && reussie)
            return (
              <li key={x.id}>
                <button type="button" className="ac-sommaire-item" aria-current={courante ? 'page' : undefined}
                  onClick={() => { if (!courante) onNaviguer?.(`#/formation/lecon/${x.id}`) }}>
                  <span className="ac-sommaire-ordre">{i + 1}.</span>
                  <span className="ac-croissance">{x.titre}</span>
                  {finie && <span className="ac-coche" aria-label="terminée">✓</span>}
                </button>
              </li>
            )
          })}
        </ol>
        <div className="ac-sommaire-retour">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.(`#/formation/module/${l.module?.slug || ''}`)}>
            Retour au module
          </button>
        </div>
      </nav>

      <div className="ac-lecture">
        <div className="ac-lecture-kicker">
          Leçon {numero} sur {total}{l.duree_minutes ? ` · ${l.duree_minutes} min` : ''}
        </div>
        <h2 className="ac-lecture-titre">{l.titre}</h2>
        {l.objectif && <p className="ac-lecture-objectif">{l.objectif}</p>}
        <div className="ac-lecture-corps">
          <RenduMarkdown markdown={l.contenu_md} />
        </div>

        {mq && mq.enonce && (
          <div className="ac-mini card card-p">
            <fieldset disabled={verrouille}>
              <legend>{mq.enonce}</legend>
              <div className="ac-choix-liste">
                {choix.map((texte, i) => {
                  const coche = mini?.choix === i
                  return (
                    <label key={i} className={`ac-choix${coche ? ' on' : ''}`}>
                      <input type="radio" name={`ac-mini-${l.id}`} value={i} checked={coche}
                        onChange={() => onChoix?.(i)} style={{ accentColor: 'var(--gold)' }} />
                      <span>{texte}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            {dejaTerminee && !resultat ? (
              <div className="ac-mini-actions">
                <span className="ac-mini-fin">Leçon terminée ✓</span>
                {mq.explication && <span className="ac-muet">{mq.explication}</span>}
              </div>
            ) : resultat?.correcte ? (
              <div className="notice ac-notice-verte" style={{ marginTop: 12, marginBottom: 0 }}>
                <div className="ac-notice-titre">Bonne réponse</div>
                {explication && <div>{explication}</div>}
              </div>
            ) : resultat ? (
              <div className="notice ac-notice-rouge" style={{ marginTop: 12, marginBottom: 0 }}>
                <div className="ac-notice-titre">Ce n est pas la bonne réponse</div>
                {explication && <div>{explication}</div>}
              </div>
            ) : null}

            <div className="ac-mini-actions">
              {reussie ? (
                suivante ? (
                  <button type="button" className="btn btn-primary" onClick={() => onNaviguer?.(`#/formation/lecon/${suivante.id}`)}>Leçon suivante</button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => onNaviguer?.(`#/formation/quiz/${l.version_id}`)}>Passer le quiz</button>
                )
              ) : resultat ? (
                <button type="button" className="btn btn-outline" onClick={onReessayer}>Réessayer</button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={mini?.choix == null || !!mini?.envoi} onClick={onValider}>
                  {mini?.envoi ? 'Vérification…' : 'Valider ma réponse'}
                </button>
              )}
            </div>
          </div>
        )}

        {!mq?.enonce && (
          <div className="ac-mini-actions">
            {suivante ? (
              <button type="button" className="btn btn-primary" onClick={() => onNaviguer?.(`#/formation/lecon/${suivante.id}`)}>Leçon suivante</button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => onNaviguer?.(`#/formation/quiz/${l.version_id}`)}>Passer le quiz</button>
            )}
          </div>
        )}

        <Sources sources={l.sources} />

        <div className="ac-lecture-pied">
          <span className="ac-muet">Le temps actif est estimé ; une lecture sans interaction pendant plus de 2 minutes n est pas comptée.</span>
          <EtatSauvegarde sauvegarde={sauvegarde} onReessayer={onReessayerSauvegarde} />
        </div>
      </div>
    </div>
  )
}

export default function LecteurLecon({ leconId, onNaviguer }) {
  const [lecon, setLecon] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [mini, setMini] = useState({ choix: null, envoi: false, resultat: null })
  const [sauvegarde, setSauvegarde] = useState({ etat: 'vierge' })

  // Un jeton par montage : deux ouvertures de la même leçon sont deux sessions.
  const jetonRef = useRef(null)
  if (!jetonRef.current) jetonRef.current = jetonClient()
  const sessionRef = useRef(null)
  const positionRef = useRef({ scroll: 0, section: null })
  const derniereEnregistreeRef = useRef(null)
  const leconRef = useRef(null)
  leconRef.current = lecon

  // ── Chargement ──────────────────────────────────────────────────────────
  useEffect(() => {
    let vivant = true
    setLecon(null)
    setErreur(null)
    setMini({ choix: null, envoi: false, resultat: null })
    setSauvegarde({ etat: 'vierge' })
    lireLecon(leconId)
      .then((l) => { if (vivant) setLecon(l) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [leconId])

  // ── Position : enregistrement ───────────────────────────────────────────
  // rendreCompte à faux à la fermeture : le composant n est plus là pour
  // afficher l indicateur, on écrit sans toucher à l état.
  const enregistrerPosition = useCallback(async (position, { rendreCompte = true } = {}) => {
    const l = leconRef.current
    if (!l?.id) return
    const cle = JSON.stringify(position)
    if (cle === derniereEnregistreeRef.current) return
    try {
      await sauverPosition(l.id, l.version_id, position)
      derniereEnregistreeRef.current = cle
      if (rendreCompte) setSauvegarde({ etat: 'ok', heure: heureCourte(new Date()) })
    } catch {
      if (rendreCompte) setSauvegarde({ etat: 'echec' })
    }
  }, [])

  // ── Session, battements, défilement ─────────────────────────────────────
  // Calé sur l identifiant chargé, pas sur l objet : la mise à jour locale
  // après la mini question ne doit pas fermer la session ni rouvrir une
  // machine de battements.
  const leconChargee = lecon?.id || null
  useEffect(() => {
    const l = leconRef.current
    if (!leconChargee || !l || typeof document === 'undefined') return undefined
    let vivant = true
    const b = creerBattement({
      pasMs: (Number(l.parametres?.pas_battement_secondes) || 30) * 1000,
      inactiviteMs: (Number(l.parametres?.inactivite_secondes) || 120) * 1000,
    })
    b.evenement(document.visibilityState === 'hidden' ? 'cache' : 'visible', Date.now())

    ouvrirSession(leconChargee, jetonRef.current)
      .then((id) => {
        if (!vivant) return
        sessionRef.current = typeof id === 'string' ? id : id?.session_id || id?.id || null
        b.evenement('ouvert', Date.now())
        b.evenement('interaction', Date.now())
      })
      .catch(() => { /* la lecture continue, le temps ne sera pas compté */ })

    const interaction = () => b.evenement('interaction', Date.now())
    const visibilite = () => b.evenement(document.visibilityState === 'hidden' ? 'cache' : 'visible', Date.now())
    const focus = () => b.evenement('visible', Date.now())
    const blur = () => b.evenement('cache', Date.now())

    let minuterieDefilement = null
    const defilement = () => {
      interaction()
      positionRef.current = lirePosition()
      if (minuterieDefilement) clearTimeout(minuterieDefilement)
      minuterieDefilement = setTimeout(() => { minuterieDefilement = null; enregistrerPosition(positionRef.current) }, DEBOUNCE_POSITION_MS)
    }

    const conteneur = conteneurDefilant() || window
    document.addEventListener('visibilitychange', visibilite)
    document.addEventListener('pointerdown', interaction)
    document.addEventListener('keydown', interaction)
    window.addEventListener('focus', focus)
    window.addEventListener('blur', blur)
    conteneur.addEventListener('scroll', defilement, { passive: true })

    const verification = setInterval(() => {
      if (!b.doitEnvoyer(Date.now()) || !sessionRef.current) return
      avecRetry(() => battement(sessionRef.current)).catch(() => { /* silencieux : un battement perdu ne se rattrape pas */ })
    }, PAS_VERIFICATION_MS)

    // Reprise à la position enregistrée, une fois le contenu peint.
    const pct = Number(l.progression?.position?.scroll)
    let reprise = null
    if (pct > 0) {
      reprise = requestAnimationFrame(() => {
        const c = conteneurDefilant()
        if (!c) return
        const max = c.scrollHeight - c.clientHeight
        if (max > 0) c.scrollTop = Math.round((Math.min(100, pct) / 100) * max)
      })
    } else {
      const c = conteneurDefilant()
      if (c) c.scrollTop = 0
    }

    return () => {
      vivant = false
      b.evenement('ferme', Date.now())
      clearInterval(verification)
      if (reprise) cancelAnimationFrame(reprise)
      if (minuterieDefilement) clearTimeout(minuterieDefilement)
      // Dernière position à la fermeture, sans rendre compte à l écran.
      enregistrerPosition(positionRef.current, { rendreCompte: false })
      document.removeEventListener('visibilitychange', visibilite)
      document.removeEventListener('pointerdown', interaction)
      document.removeEventListener('keydown', interaction)
      window.removeEventListener('focus', focus)
      window.removeEventListener('blur', blur)
      conteneur.removeEventListener('scroll', defilement)
      sessionRef.current = null
    }
  }, [leconChargee, enregistrerPosition])

  // ── Mini question ───────────────────────────────────────────────────────
  async function valider() {
    if (mini.envoi || mini.choix == null || !lecon?.id) return
    setMini((m) => ({ ...m, envoi: true }))
    try {
      const r = await terminerLecon(lecon.id, mini.choix)
      const correcte = !!r?.correcte
      setMini((m) => ({ ...m, envoi: false, resultat: { correcte, explication: r?.explication || '' } }))
      if (correcte) {
        toast.success('Leçon enregistrée')
        setLecon((l) => (l ? {
          ...l,
          progression: { ...(l.progression || {}), terminee_le: r?.terminee_le || new Date().toISOString(), mini_question_reussie_le: r?.terminee_le || new Date().toISOString() },
          lecons: (l.lecons || []).map((x) => (x.id === l.id ? { ...x, terminee_le: r?.terminee_le || new Date().toISOString() } : x)),
        } : l))
      }
    } catch (e) {
      setMini((m) => ({ ...m, envoi: false }))
      toast.error(messageErreur(e))
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
  if (!lecon) return <div className="card card-p"><SkeletonText lines={8} /></div>
  return (
    <LecteurVue
      lecon={lecon} mini={mini} sauvegarde={sauvegarde}
      onChoix={(i) => setMini((m) => ({ ...m, choix: i }))}
      onValider={valider}
      onReessayer={() => setMini({ choix: null, envoi: false, resultat: null })}
      onReessayerSauvegarde={() => enregistrerPosition(positionRef.current)}
      onNaviguer={onNaviguer}
    />
  )
}
