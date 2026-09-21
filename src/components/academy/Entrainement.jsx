// ═══════════════════════════════════════════════════════════════════════════
// ENTRAÎNEMENT : une session d’exercices, plein écran, correction immédiate
//
// La base tire douze items et mélange leurs choix (academy_demarrer_
// entrainement) sans jamais envoyer le corrigé ; le navigateur joue les
// items dans l’ordre des rangs, envoie chaque réponse à academy_repondre et
// reçoit vert ou rouge, la bonne réponse et une ligne d’explication. Les
// items ratés sont rejoués une fois en fin de session, en local (la bonne
// réponse est déjà connue) : ils restent comptés faux. Puis
// academy_terminer_entrainement rend XP, série, couronnes et validation.
//
// Reprise : le jeton uuid rend l’ouverture rejouable, et une session
// ouverte depuis moins de deux heures revient avec ses reponses_deja, qu on
// saute. Un échec réseau sur une réponse verrouille la saisie (la base a pu
// enregistrer la première réponse) et propose de réessayer ; academy_repondre
// est idempotent par item. Un refus « Session terminee » ou « ne fait pas
// partie de la session » envoie au bilan (terminer rend le résumé déjà
// calculé) ; tout autre refus renvoie au deck.
//
// Conteneur (réseau, état) et vue (props seulement) séparés : la vue et
// chaque exercice se testent avec renderToStaticMarkup.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useReducer, useRef, useState } from 'react'
import { demarrerEntrainement, repondre, terminerEntrainement, estErreurReseau } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { confirmDialog } from '../ui/confirm'
import { SkeletonText } from '../ui/Skeleton'
import {
  reponseVide, reponseComplete, reponseAEnvoyer, rendreBonneReponse, estBonneReponse, itemsAJouer, jetonSession, erreurSessionClose,
} from '../../lib/academy/exercices'
import { libelleCouronnes, libelleType } from '../../lib/academy/statuts'
import Choix from './exercices/Choix'
import VraiFaux from './exercices/VraiFaux'
import Multi from './exercices/Multi'
import Ordre from './exercices/Ordre'
import Association from './exercices/Association'
import TrouChoix from './exercices/TrouChoix'
import TrouSaisie from './exercices/TrouSaisie'
import Carte from './exercices/Carte'
import { Couronnes } from './Couronnes'
import './academy-entrainement.css'

const COMPOSANTS = {
  choix: Choix, vrai_faux: VraiFaux, multi: Multi, ordre: Ordre,
  association: Association, trou_choix: TrouChoix, trou_saisie: TrouSaisie, carte: Carte,
}

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const retourDeck = (slug) => (slug ? `#/formation/module/${slug}` : '#/formation/parcours')

// ─── Vue ──────────────────────────────────────────────────────────────────

function Bandeau({ item, resultat, rejeu, boutonRef }) {
  const ok = resultat.correcte === true
  const bonne = ok ? '' : rendreBonneReponse(item.type, item.payload, resultat.bonne_reponse)
  return (
    <div className={`ae-bandeau ${ok ? 'is-vert' : 'is-rouge'}`} role="status" aria-live="polite">
      <div className="ae-bandeau-titre">
        {ok ? (rejeu ? 'Cette fois c’est bon' : 'Bonne réponse') : (item.type === 'carte' ? 'À revoir' : 'Pas tout à fait')}
      </div>
      {ok && rejeu && <div className="ae-bandeau-sous">L’exercice reste compté faux pour cette session, mais tu l’as.</div>}
      {bonne && (
        <div className="ae-bandeau-bonne">
          <span className="ae-bandeau-etiquette">Bonne réponse</span>
          <div className="ae-bandeau-lignes">{bonne}</div>
        </div>
      )}
      {resultat.explication && <div className="ae-bandeau-explication">{resultat.explication}</div>}
      <button ref={boutonRef} type="submit" className="btn btn-primary ae-btn-large ae-continuer">Continuer</button>
    </div>
  )
}

function Deroule({ titre, item, rang, total, rejeu, valeur, resultat, envoi, erreurReponse, erreurDefinitive, onChange, onVerifier, onContinuer, onReessayer, onQuitter, onRetourDeck }) {
  const boutonRef = useRef(null)
  const corpsRef = useRef(null)
  useEffect(() => { if (resultat) boutonRef.current?.focus() }, [resultat])

  // À chaque nouvel exercice, le focus part sur son premier contrôle (ou sur
  // le corps, tabIndex -1) : au clavier comme au lecteur d’écran, on ne reste
  // pas sur le bouton Continuer qui vient de disparaître.
  const itemId = item?.item_id
  useEffect(() => {
    const corps = corpsRef.current
    if (!corps) return
    const premier = corps.querySelector('input:not([disabled]), button:not([disabled]), textarea:not([disabled])')
    ;(premier || corps).focus()
  }, [itemId, rejeu])

  const Exercice = COMPOSANTS[item?.type]
  const complete = !!item && reponseComplete(item.type, valeur, item.payload)
  // Tant qu’une erreur de réponse est affichée, la saisie reste figée : la
  // base a peut être enregistré la première réponse, « conservée » doit être vrai.
  const verrouille = !!resultat || !!envoi || !!erreurReponse
  const pct = total > 0 ? Math.round((100 * rang) / total) : 0
  const compteur = `${rejeu ? 'On y revient · ' : ''}Exercice ${rang} sur ${total}`

  const soumettre = (e) => {
    e.preventDefault()
    if (resultat) onContinuer?.()
    else if (erreurReponse) { if (!erreurDefinitive) onReessayer?.() }
    else if (complete && !envoi) onVerifier?.()
  }
  const surTouche = (e) => {
    if (e.key !== 'Enter') return
    const tag = e.target?.tagName
    if (tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'A') return
    e.preventDefault()
    soumettre(e)
  }

  return (
    <form className="ae-deroule" onSubmit={soumettre} onKeyDown={surTouche}>
      <div className="ae-haut">
        <button type="button" className="btn btn-ghost btn-sm ae-quitter" onClick={onQuitter}>Quitter</button>
        <div className="ae-haut-titre">{titre}</div>
        <span className="ae-compteur" aria-hidden="true">{rang}/{total}</span>
      </div>
      <div className="ae-progress" aria-hidden="true"><div className="ae-progress-fill" style={{ width: `${pct}%` }} /></div>
      <span className="ae-sr" aria-live="polite">{compteur}</span>
      {rejeu && <div className="ae-revient-kicker">On y revient</div>}
      {item && <div className="ae-type">{libelleType(item.type)}</div>}

      {Exercice ? (
        <div key={`${item.item_id}-${rejeu ? 'r' : 'p'}`} ref={corpsRef} className="ae-corps" tabIndex={-1}>
          <Exercice payload={item.payload} valeur={valeur} onChange={onChange} verrouille={verrouille} resultat={resultat} />
        </div>
      ) : (
        <div className="notice notice-error" role="alert">Type d’exercice inconnu : {String(item?.type || '')}. Signale le à la direction.</div>
      )}

      {erreurReponse && !resultat && (
        <div className="ae-bandeau is-erreur notice notice-error" role="alert">
          <div>{erreurReponse}</div>
          {erreurDefinitive ? (
            <>
              <div className="ae-bandeau-sous">Les réponses déjà corrigées sont enregistrées. Reviens sur le deck pour relancer une session.</div>
              <button type="button" className="btn btn-outline ae-btn-large" onClick={onRetourDeck}>Retour au deck</button>
            </>
          ) : (
            <>
              <div className="ae-bandeau-sous">Ta réponse est conservée.</div>
              <button type="submit" className="btn btn-outline ae-btn-large">Réessayer</button>
            </>
          )}
        </div>
      )}

      {resultat && <Bandeau item={item} resultat={resultat} rejeu={rejeu} boutonRef={boutonRef} />}

      {!resultat && !erreurReponse && item?.type !== 'carte' && (
        <div className="ae-actions">
          <button type="submit" className="btn btn-primary ae-btn-large" disabled={!complete || !!envoi}>
            {envoi ? 'Correction…' : 'Vérifier'}
          </button>
        </div>
      )}
    </form>
  )
}

function EcranRevient({ titre, nb, onRejouer, onQuitter }) {
  return (
    <div className="ae-ecran">
      <div className="ae-haut">
        <button type="button" className="btn btn-ghost btn-sm ae-quitter" onClick={onQuitter}>Quitter</button>
        <div className="ae-haut-titre">{titre}</div>
      </div>
      <div className="ae-centre">
        <div className="ae-kicker">On y revient</div>
        <div className="ae-grand">{pluriel(nb, 'exercice raté', 'exercices ratés')}</div>
        <p className="ae-texte">On les rejoue tout de suite, une fois. Ils restent comptés faux pour cette session : c’est la prochaine qui dira si c’est acquis.</p>
        <button type="button" className="btn btn-primary ae-btn-large" autoFocus onClick={onRejouer}>Continuer</button>
      </div>
    </div>
  )
}

function EcranFin({ titre, fin, onEncore, onRetourDeck }) {
  const f = fin || {}
  const erreurs = Array.isArray(f.erreurs) ? f.erreurs : []
  const avant = Number(f.couronnes_avant) || 0
  const apres = Number(f.couronnes_apres) || 0
  const serie = Number(f.serie) || 0
  return (
    <div className="ae-ecran ae-fin">
      <div className="ae-centre">
        <div className="ae-kicker">Session terminée</div>
        <div className="ae-haut-titre">{titre}</div>
        <div className="ae-xp" role="status" aria-live="polite">+{Number(f.xp) || 0} XP</div>
        <div className="ae-score">{pluriel(Number(f.nb_bons) || 0, 'bonne réponse', 'bonnes réponses')} sur {Number(f.nb_total) || 0}</div>
      </div>

      <div className="ae-fin-grille">
        <div className="card card-p ae-fin-carte">
          <div className="ae-kpi-kicker">Série</div>
          <div className="ae-kpi-valeur">{pluriel(serie, 'jour', 'jours')}</div>
          {f.premiere_du_jour && <span className="badge badge-signed">première session du jour</span>}
          {Number(f.meilleure_serie) > 0 && <div className="ae-kpi-sous">Meilleure série : {pluriel(Number(f.meilleure_serie), 'jour', 'jours')}</div>}
        </div>
        <div className="card card-p ae-fin-carte">
          <div className="ae-kpi-kicker">Couronnes</div>
          <div className="ae-couronnes-ligne">
            <Couronnes n={avant} />
            <span className="ae-couronnes-fleche" aria-hidden="true">puis</span>
            <Couronnes n={apres} taille="grande" />
          </div>
          <div className="ae-kpi-sous">
            {apres > avant ? `${libelleCouronnes(apres)} : une de plus.` : apres < avant ? `${libelleCouronnes(apres)}.` : `${libelleCouronnes(apres)}, comme avant.`}
          </div>
        </div>
      </div>

      {f.valide && (
        <div className="notice notice-gold ae-valide" role="status" aria-live="polite">
          <div className="ae-valide-titre">Deck validé</div>
          {f.attestation?.numero ? `Attestation interne ${f.attestation.numero}.` : 'Attestation interne de réalisation délivrée.'}
        </div>
      )}

      {erreurs.length > 0 && (
        <div className="card card-p ae-fin-carte">
          <div className="ae-kpi-kicker">À retravailler</div>
          <ul className="ae-erreurs">
            {erreurs.map((e, i) => (
              <li key={e.item_id || i}>
                <span className="ae-erreur-competence">{e.competence}</span>
                <span className="ae-erreur-enonce">{e.enonce_court}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {erreurs.length === 0 && <div className="ae-parfait">Sans faute.</div>}

      <div className="ae-actions ae-actions-fin">
        <button type="button" className="btn btn-primary ae-btn-large" autoFocus onClick={onEncore}>Encore une session</button>
        <button type="button" className="btn btn-outline ae-btn-large" onClick={onRetourDeck}>Retour au deck</button>
      </div>
    </div>
  )
}

/**
 * La vue, sans réseau. phase : 'jeu' | 'revient' | 'terminaison' | 'fin'.
 * item : l’item en cours (type, payload) ; rang et total : la progression
 * affichée ; rejeu : vrai pendant « On y revient » ; resultat : l’objet
 * rendu par repondre, ou null ; fin : l’objet rendu par terminerEntrainement.
 * erreurReponse : le message d’un échec de repondre ; erreurDefinitive : vrai
 * quand réessayer ne servirait à rien (refus de la base, pas une coupure).
 */
export function EntrainementVue({
  titre, phase, item, rang, total, rejeu, valeur, resultat, envoi, erreurReponse, erreurDefinitive, fin, erreurFin, nbARejouer,
  onChange, onVerifier, onContinuer, onRejouer, onReessayer, onReessayerFin, onQuitter, onEncore, onRetourDeck,
}) {
  if (phase === 'fin') return <div className="ae"><EcranFin titre={titre} fin={fin} onEncore={onEncore} onRetourDeck={onRetourDeck} /></div>
  if (phase === 'terminaison') {
    return (
      <div className="ae">
        <div className="ae-ecran ae-centre">
          {erreurFin ? (
            <div className="notice notice-error" role="alert">
              <div>{erreurFin}</div>
              <div className="ae-bandeau-sous">Tes réponses sont enregistrées : il ne manque que le bilan.</div>
              <button type="button" className="btn btn-outline ae-btn-large" onClick={onReessayerFin}>Réessayer</button>
              <button type="button" className="btn btn-ghost ae-btn-large" onClick={onRetourDeck}>Retour au deck</button>
            </div>
          ) : (
            <><div className="ae-kicker">Bilan en cours</div><SkeletonText lines={4} /></>
          )}
        </div>
      </div>
    )
  }
  if (phase === 'revient') return <div className="ae"><EcranRevient titre={titre} nb={nbARejouer} onRejouer={onRejouer} onQuitter={onQuitter} /></div>
  return (
    <div className="ae">
      <Deroule
        titre={titre} item={item} rang={rang} total={total} rejeu={rejeu} valeur={valeur} resultat={resultat} envoi={envoi}
        erreurReponse={erreurReponse} erreurDefinitive={erreurDefinitive} onChange={onChange} onVerifier={onVerifier} onContinuer={onContinuer}
        onReessayer={onReessayer} onQuitter={onQuitter} onRetourDeck={onRetourDeck}
      />
    </div>
  )
}

// ─── État de la session ───────────────────────────────────────────────────

const INITIAL = {
  entrainement: null, erreur: null, phase: 'chargement', file: [], position: 0, rejeu: false,
  valeur: null, resultat: null, envoi: false, erreurReponse: null, erreurDefinitive: false, rates: [], fin: null, erreurFin: null, essaiFin: 0,
}

function reduire(s, a) {
  switch (a.type) {
    case 'reinitialiser':
      return { ...INITIAL }
    case 'chargee': {
      const file = itemsAJouer(a.entrainement)
      return {
        ...INITIAL, entrainement: a.entrainement, file,
        phase: file.length > 0 ? 'jeu' : 'terminaison',
        valeur: file.length > 0 ? reponseVide(file[0].type) : null,
      }
    }
    case 'echec_chargement':
      return { ...s, phase: 'erreur', erreur: a.erreur }
    case 'saisie':
      // Une erreur affichée fige la saisie : la base a peut être déjà la réponse.
      return s.resultat || s.envoi || s.erreurReponse ? s : { ...s, valeur: a.valeur }
    case 'envoi':
      return { ...s, envoi: true, erreurReponse: null, erreurDefinitive: false }
    case 'corrigee': {
      const item = s.file[s.position]
      const rates = !a.resultat.correcte && !s.rejeu && item ? [...s.rates, { ...item, corrige: a.resultat }] : s.rates
      return { ...s, envoi: false, erreurReponse: null, erreurDefinitive: false, resultat: a.resultat, rates }
    }
    case 'echec_reponse':
      return { ...s, envoi: false, erreurReponse: a.erreur, erreurDefinitive: !!a.definitive }
    case 'session_close':
      // La base dit la session finie : plus rien à réessayer, on demande le bilan.
      return { ...s, envoi: false, erreurReponse: null, erreurDefinitive: false, resultat: null, phase: 'terminaison' }
    case 'continuer': {
      if (!s.resultat) return s
      const suivant = s.position + 1
      if (suivant < s.file.length) {
        return { ...s, position: suivant, valeur: reponseVide(s.file[suivant].type), resultat: null, erreurReponse: null, erreurDefinitive: false }
      }
      if (!s.rejeu && s.rates.length > 0) return { ...s, phase: 'revient', resultat: null }
      return { ...s, phase: 'terminaison', resultat: null }
    }
    case 'rejouer':
      return { ...s, phase: 'jeu', rejeu: true, file: s.rates, position: 0, valeur: reponseVide(s.rates[0]?.type), resultat: null, erreurReponse: null, erreurDefinitive: false }
    case 'terminee':
      return { ...s, phase: 'fin', fin: a.fin, erreurFin: null }
    case 'echec_fin':
      return { ...s, erreurFin: a.erreur }
    case 'reessayer_fin':
      return { ...s, erreurFin: null, essaiFin: s.essaiFin + 1 }
    default:
      return s
  }
}

// ─── Conteneur ────────────────────────────────────────────────────────────

export default function Entrainement({ versionId, onNaviguer }) {
  const [jeton, setJeton] = useState(() => jetonSession())
  const [s, dispatch] = useReducer(reduire, INITIAL)
  const vivantRef = useRef(true)
  useEffect(() => { vivantRef.current = true; return () => { vivantRef.current = false } }, [])

  useEffect(() => {
    let vivant = true
    dispatch({ type: 'reinitialiser' })
    demarrerEntrainement(versionId, jeton)
      .then((e) => { if (vivant) dispatch({ type: 'chargee', entrainement: e }) })
      .catch((e) => { if (vivant) dispatch({ type: 'echec_chargement', erreur: messageErreur(e) }) })
    return () => { vivant = false }
  }, [versionId, jeton])

  const entrainementId = s.entrainement?.entrainement_id
  useEffect(() => {
    if (s.phase !== 'terminaison' || !entrainementId) return
    let vivant = true
    terminerEntrainement(entrainementId)
      .then((fin) => { if (vivant) dispatch({ type: 'terminee', fin }) })
      .catch((e) => { if (vivant) dispatch({ type: 'echec_fin', erreur: messageErreur(e) }) })
    return () => { vivant = false }
  }, [s.phase, entrainementId, s.essaiFin])

  const item = s.file[s.position] || null
  const slug = s.entrainement?.slug
  const titre = s.entrainement?.titre || 'Entraînement'

  async function verifier(valeur = s.valeur) {
    if (!item || s.resultat || s.envoi) return
    if (!reponseComplete(item.type, valeur, item.payload)) return
    if (s.rejeu) {
      const bonne = item.corrige?.bonne_reponse
      dispatch({ type: 'corrigee', resultat: { correcte: estBonneReponse(item.type, valeur, bonne), bonne_reponse: bonne, explication: item.corrige?.explication || '', locale: true } })
      return
    }
    dispatch({ type: 'envoi' })
    try {
      const r = await repondre(entrainementId, item.item_id, reponseAEnvoyer(item.type, valeur))
      if (vivantRef.current) dispatch({ type: 'corrigee', resultat: r || { correcte: false, bonne_reponse: null, explication: '' } })
    } catch (e) {
      if (!vivantRef.current) return
      if (estErreurReseau(e)) dispatch({ type: 'echec_reponse', erreur: messageErreur(e), definitive: false })
      else if (erreurSessionClose(e)) dispatch({ type: 'session_close' })
      else dispatch({ type: 'echec_reponse', erreur: messageErreur(e), definitive: true })
    }
  }

  function changer(valeur) {
    if (s.erreurReponse) return
    dispatch({ type: 'saisie', valeur })
    // Une carte se corrige dès qu’elle est jugée : pas de bouton Vérifier.
    if (item?.type === 'carte' && reponseComplete('carte', valeur, item.payload)) verifier(valeur)
  }

  async function quitter() {
    // La reprise n’est promise que s’il reste des exercices à jouer sur une
    // session que la base n’a pas refusée ; en rejeu, tout est déjà répondu.
    const reprisePossible = s.phase === 'jeu' && !s.rejeu && !s.erreurDefinitive
    const ok = await confirmDialog({
      title: 'Quitter la session ?',
      message: reprisePossible
        ? 'Elle reste reprenable pendant deux heures : tu retrouveras les exercices restants en revenant sur le deck.'
        : 'Les réponses déjà corrigées sont enregistrées.',
      confirmLabel: 'Quitter',
      cancelLabel: 'Continuer la session',
    })
    if (ok) onNaviguer?.(retourDeck(slug))
  }

  if (s.phase === 'erreur') {
    return (
      <div className="ae">
        <div className="ae-ecran">
          <div className="ae-haut">
            <button type="button" className="btn btn-ghost btn-sm ae-quitter" onClick={() => onNaviguer?.('#/formation/parcours')}>Retour</button>
          </div>
          <div className="notice notice-error" role="alert">{s.erreur}</div>
        </div>
      </div>
    )
  }
  if (s.phase === 'chargement') {
    return <div className="ae"><div className="ae-ecran"><div className="ae-kicker">Préparation de la session</div><SkeletonText lines={6} /></div></div>
  }

  return (
    <EntrainementVue
      titre={titre} phase={s.phase} item={item} rang={s.position + 1} total={s.file.length} rejeu={s.rejeu}
      valeur={s.valeur} resultat={s.resultat} envoi={s.envoi} erreurReponse={s.erreurReponse} erreurDefinitive={s.erreurDefinitive}
      fin={s.fin} erreurFin={s.erreurFin} nbARejouer={s.rates.length}
      onChange={changer}
      onVerifier={() => verifier()}
      onContinuer={() => dispatch({ type: 'continuer' })}
      onRejouer={() => dispatch({ type: 'rejouer' })}
      onReessayer={() => verifier()}
      onReessayerFin={() => dispatch({ type: 'reessayer_fin' })}
      onQuitter={quitter}
      onEncore={() => setJeton(jetonSession())}
      onRetourDeck={() => onNaviguer?.(retourDeck(slug))}
    />
  )
}
