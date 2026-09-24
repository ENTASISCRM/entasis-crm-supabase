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
// Gamification (migration 8, spec du 22 septembre 2026) : le SERVEUR décide
// de tout ce qui se compte. academy_repondre rend xp_gagne, xp_session,
// combo et combo_max ; academy_demarrer_entrainement rend xp_session et
// combo d’une session reprise ; academy_terminer_entrainement rend
// xp_detail, niveau_avant, niveau_apres, succes_debloques, defis et le
// classement anonyme. Le navigateur ne fait qu’animer ces valeurs : compteur
// d’XP qui monte, pastille de combo qui pulse, barre segmentée, confettis,
// barre de niveau qui glisse. Les helpers de lib/academy (xpReponse,
// niveauPour) ne servent que de repli si une clé manque, jamais de source.
//
// Figures : un item peut porter payload.figure, soit { ref } résolu dans
// entrainement.schemas, soit { svg, alt }. Tout SVG passe par assainirSvg
// (composant Schema) avant d’être rendu.
//
// Animations en CSS seulement, aucun son, toutes annulées sous
// prefers-reduced-motion ; le HTML initial porte déjà les valeurs finales,
// la vue reste donc testable avec renderToStaticMarkup.
//
// Conteneur (réseau, état) et vue (props seulement) séparés : la vue et
// chaque exercice se testent avec renderToStaticMarkup.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { demarrerEntrainement, repondre, terminerEntrainement, estErreurReseau } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { confirmDialog } from '../ui/confirm'
import { SkeletonText } from '../ui/Skeleton'
import {
  reponseVide, reponseComplete, reponseAEnvoyer, rendreBonneReponse, estBonneReponse, itemsAJouer, jetonSession,
  erreurSessionClose, xpReponse, COMBO_BONUS,
} from '../../lib/academy/exercices'
import { niveauPour, phraseClassement, libellesDefi } from '../../lib/academy/niveaux'
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
import Picto from './Picto'
import Schema from './Schema'
import './academy-entrainement.css'

const COMPOSANTS = {
  choix: Choix, vrai_faux: VraiFaux, multi: Multi, ordre: Ordre,
  association: Association, trou_choix: TrouChoix, trou_saisie: TrouSaisie, carte: Carte,
}

/** Le combo s’affiche en pastille dès deux bonnes réponses d’affilée. */
const COMBO_AFFICHE = 2
/** Les particules des confettis du bilan (spec : une centaine, 1,5 s). */
const NB_CONFETTIS = 100

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const retourDeck = (slug) => (slug ? `#/formation/module/${slug}` : '#/formation/parcours')
const entier = (v) => Math.max(0, Math.round(Number(v) || 0))
const texteDe = (v) => (v == null ? '' : String(v).trim())

// ─── Animations : rien sans DOM, rien sous prefers-reduced-motion ─────────

/**
 * Vrai quand on peut animer : un DOM avec requestAnimationFrame et une
 * personne qui n’a pas demandé moins de mouvement. Faux sous Node (tests,
 * renderToStaticMarkup) : le rendu porte alors directement la valeur finale.
 */
function animable() {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return false
  try {
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  } catch {
    return true
  }
}

/**
 * Un compteur qui monte vers `cible`. Le premier rendu porte déjà la valeur
 * finale (le HTML initial reste juste, hors navigateur rien ne bouge) ; c’est
 * un CHANGEMENT de cible qui déclenche la montée. `depuis` force le départ de
 * la toute première animation, pour le total du bilan qui part de zéro.
 */
function useCompteurAnime(cible, { depuis = null, duree = 700 } = {}) {
  const vise = entier(cible)
  const [affiche, setAffiche] = useState(vise)
  const precedent = useRef(depuis == null ? vise : entier(depuis))
  useEffect(() => {
    const depart = precedent.current
    precedent.current = vise
    if (depart === vise) return undefined
    if (!animable()) { setAffiche(vise); return undefined }
    const debut = Date.now()
    let image = 0
    const pas = () => {
      const avance = Math.min(1, (Date.now() - debut) / duree)
      // Sortie cubique : vif au début, posé à l’arrivée.
      setAffiche(Math.round(depart + (vise - depart) * (1 - (1 - avance) ** 3)))
      if (avance < 1) image = window.requestAnimationFrame(pas)
    }
    setAffiche(depart)
    image = window.requestAnimationFrame(pas)
    return () => window.cancelAnimationFrame(image)
  }, [vise, duree])
  return affiche
}

/**
 * Une largeur en pour cent qui glisse de `depart` vers `arrivee` (la
 * transition CSS fait le mouvement). Le HTML initial porte le départ.
 */
function useLargeurQuiGlisse(depart, arrivee) {
  const [largeur, setLargeur] = useState(depart)
  useEffect(() => {
    if (typeof window === 'undefined') { setLargeur(arrivee); return undefined }
    const t = window.setTimeout(() => setLargeur(arrivee), 120)
    return () => window.clearTimeout(t)
  }, [arrivee])
  return largeur
}

// ─── Lectures de ce que le serveur rend ───────────────────────────────────

/**
 * La figure d’un item : soit { svg, alt } porté par l’item, soit { ref }
 * résolu dans les schémas de la version (academy_presenter_entrainement les
 * rend). Null quand il n’y a rien à montrer.
 */
function figurePour(item, schemas) {
  const f = item?.payload?.figure
  if (!f || typeof f !== 'object') return null
  const propre = texteDe(f.svg)
  if (propre) return { svg: propre, alt: texteDe(f.alt), titre: texteDe(f.titre), legende: texteDe(f.legende) }
  const cle = texteDe(f.ref)
  if (!cle) return null
  const trouve = (Array.isArray(schemas) ? schemas : []).find((s) => s && texteDe(s.cle) === cle)
  if (!trouve || !texteDe(trouve.svg)) return null
  return { svg: texteDe(trouve.svg), alt: texteDe(trouve.titre), titre: texteDe(trouve.titre), legende: texteDe(trouve.legende) }
}

/** Un niveau rendu par la base, ou son repli calculé depuis l’XP total. */
function niveauSur(niveau, xpRepli) {
  if (niveau && typeof niveau === 'object' && Number.isFinite(Number(niveau.niveau))) {
    return {
      niveau: entier(niveau.niveau) || 1,
      titre: texteDe(niveau.titre) || niveauPour(niveau.xp_total).titre,
      xp_min: entier(niveau.xp_min), xp_suivant: entier(niveau.xp_suivant),
      xp_total: entier(niveau.xp_total), progression_pct: Math.min(100, entier(niveau.progression_pct)),
    }
  }
  return niveauPour(xpRepli)
}

/** Le titre et le pictogramme d’un défi : ce que le serveur rend d’abord. */
function libelleDefi(defi) {
  const repli = libellesDefi[texteDe(defi?.code)] || null
  return {
    titre: texteDe(defi?.titre) || repli?.titre || 'Défi du jour',
    icone: texteDe(defi?.icone) || repli?.icone || 'session',
  }
}

/**
 * Les lignes du détail d’XP du bilan, dans l’ordre d’apparition :
 * réponses, combos, session parfaite, première du jour, puis chaque défi
 * crédité par cette session. Sans xp_detail (base d’avant la migration 8),
 * une seule ligne porte le total : on n’invente pas une ventilation.
 */
function lignesXp(fin) {
  const detail = fin?.xp_detail && typeof fin.xp_detail === 'object' ? fin.xp_detail : null
  const defis = (Array.isArray(fin?.defis) ? fin.defis : []).filter((d) => d && d.fait_par_cette_session)
  const lignes = []
  if (detail) {
    const comboMax = entier(fin?.combo_max)
    if (entier(detail.reponses) > 0) lignes.push({ cle: 'reponses', libelle: 'Bonnes réponses', xp: entier(detail.reponses), icone: 'justes' })
    if (entier(detail.combo) > 0) {
      lignes.push({ cle: 'combo', libelle: comboMax > 1 ? `Combos, jusqu’à ${comboMax} d’affilée` : 'Combos', xp: entier(detail.combo), icone: 'combo' })
    }
    if (entier(detail.parfaite) > 0) lignes.push({ cle: 'parfaite', libelle: 'Session parfaite', xp: entier(detail.parfaite), icone: 'parfaite' })
    if (entier(detail.premiere_du_jour) > 0) lignes.push({ cle: 'premiere', libelle: 'Première session du jour', xp: entier(detail.premiere_du_jour), icone: 'session' })
  } else if (entier(fin?.xp) > 0) {
    lignes.push({ cle: 'total', libelle: 'Réponses et bonus', xp: entier(fin.xp), icone: 'justes' })
  }
  for (const defi of defis) {
    const { titre, icone } = libelleDefi(defi)
    lignes.push({ cle: `defi-${texteDe(defi.code) || lignes.length}`, libelle: titre, xp: entier(defi.xp), icone })
  }
  // Des défis crédités que le serveur n’a pas détaillés : une ligne groupée.
  const creditees = lignes.filter((l) => l.cle.startsWith('defi-')).reduce((t, l) => t + l.xp, 0)
  if (detail && entier(detail.defis) > creditees) {
    lignes.push({ cle: 'defis', libelle: 'Défis du jour', xp: entier(detail.defis) - creditees, icone: 'calendrier' })
  }
  return lignes
}

// ─── Vue ──────────────────────────────────────────────────────────────────

/** Les segments du haut : un par exercice, vert, rouge, doré ou gris. */
function Segments({ total, rang, marques }) {
  const etats = Array.from({ length: Math.max(0, total) }, (_, i) => {
    if (marques[i] === 'bon' || marques[i] === 'faux') return marques[i]
    return i === rang - 1 ? 'encours' : 'avenir'
  })
  return (
    <ol className="ae-segments" aria-hidden="true">
      {etats.map((etat, i) => <li key={i} className={`ae-segment is-${etat}`} />)}
    </ol>
  )
}

/** Le compteur d’XP de la session et la pastille de combo. */
function Jauges({ xpSession, combo }) {
  const xp = useCompteurAnime(xpSession, { duree: 500 })
  return (
    <div className="ae-jauges">
      <span className="ae-jauge">
        <span className="ae-jauge-kicker">Session</span>
        <span className="ae-jauge-valeur">{xp} XP</span>
      </span>
      {combo >= COMBO_AFFICHE && (
        // La clé change avec le combo : la pastille se remonte, donc pulse.
        <span key={combo} className="ae-combo">Combo ×{combo}</span>
      )}
    </div>
  )
}

function Bandeau({ item, resultat, rejeu, gain, combo, boutonRef }) {
  const ok = resultat.correcte === true
  const bonne = ok ? '' : rendreBonneReponse(item.type, item.payload, resultat.bonne_reponse)
  // Un rejeu ou une réponse déjà enregistrée ne rapporte rien : on n’annonce
  // aucun XP (le conteneur met alors gain à zéro).
  const montre = ok && gain > 0
  const libelleGain = montre ? ` ! +${gain} XP${combo >= COMBO_BONUS ? `, combo ×${combo}` : ''}` : ''
  return (
    <div className={`ae-bandeau ${ok ? 'is-vert' : 'is-rouge'}${montre ? ' is-gain' : ''}`} role="status" aria-live="polite">
      <div className="ae-bandeau-titre">
        {ok ? (rejeu ? 'Cette fois c’est bon' : 'Bonne réponse') : (item.type === 'carte' ? 'À revoir' : 'Pas tout à fait')}
        {libelleGain && <span className="ae-bandeau-gain">{libelleGain}</span>}
      </div>
      {montre && <span className="ae-flottant" aria-hidden="true">+{gain}</span>}
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

function Deroule({
  titre, item, figure, rang, total, rejeu, valeur, resultat, envoi, erreurReponse, erreurDefinitive, marques, xpSession, combo, xpGagne,
  onChange, onVerifier, onContinuer, onReessayer, onQuitter, onRetourDeck,
}) {
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
  const compteur = `${rejeu ? 'On y revient · ' : ''}Exercice ${rang} sur ${total}`
  // Une erreur secoue la carte 200 ms (classe posée à la correction).
  const secousse = !!resultat && resultat.correcte !== true

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
      <Jauges xpSession={xpSession} combo={combo} />
      <Segments total={total} rang={rang} marques={marques} />
      <span className="ae-sr" aria-live="polite">{compteur}</span>
      {rejeu && <div className="ae-revient-kicker">On y revient</div>}
      {item && <div className="ae-type">{libelleType(item.type)}</div>}

      {figure && (
        <div className="ae-figure">
          <Schema svg={figure.svg} titre={figure.titre} legende={figure.legende} alt={figure.alt} />
        </div>
      )}

      {Exercice ? (
        <div key={`${item.item_id}-${rejeu ? 'r' : 'p'}`} ref={corpsRef} className={`ae-corps${secousse ? ' is-secousse' : ''}`} tabIndex={-1}>
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

      {resultat && <Bandeau item={item} resultat={resultat} rejeu={rejeu} gain={xpGagne} combo={combo} boutonRef={boutonRef} />}

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

// ─── Bilan : confettis, détail d’XP, niveau, succès, classement ───────────

/**
 * Une centaine de particules posées en JSX, jetées par une suite
 * déterministe (le même bilan rendu deux fois donne le même HTML, les tests
 * restent stables). Tout le mouvement est en CSS, 1,5 s au plus, sans son.
 */
function Confettis() {
  const particules = useMemo(() => {
    let graine = 20260922
    const suivant = () => {
      graine = (graine * 1103515245 + 12345) % 2147483648
      return graine / 2147483648
    }
    return Array.from({ length: NB_CONFETTIS }, (_, i) => {
      const a = suivant()
      const b = suivant()
      return {
        gauche: Math.round(a * 1000) / 10,
        retard: Math.round(b * 300),
        duree: 900 + Math.round(a * 300),
        derive: Math.round((b - 0.5) * 90),
        teinte: i % 4,
      }
    })
  }, [])
  return (
    <div className="ae-confettis" aria-hidden="true">
      {particules.map((p, i) => (
        <span
          key={i}
          className={`ae-confetti t${p.teinte}`}
          style={{ left: `${p.gauche}%`, animationDelay: `${p.retard}ms`, animationDuration: `${p.duree}ms`, '--ae-derive': `${p.derive}px` }}
        />
      ))}
    </div>
  )
}

/** Le détail d’XP, une ligne après l’autre, puis le total qui monte. */
function DetailXp({ fin }) {
  const lignes = lignesXp(fin)
  const total = entier(fin?.xp)
  const compte = useCompteurAnime(total, { depuis: 0, duree: 900 })
  return (
    <div className="card card-p ae-detail">
      <div className="ae-kpi-kicker">Ce que rapporte cette session</div>
      <ul className="ae-detail-lignes">
        {lignes.map((l, i) => (
          <li key={l.cle} className="ae-detail-ligne" style={{ animationDelay: `${160 + i * 140}ms` }}>
            <span className="ae-detail-picto"><Picto nom={l.icone} taille={18} /></span>
            <span className="ae-detail-libelle">{l.libelle}</span>
            <span className="ae-detail-xp">+{l.xp} XP</span>
          </li>
        ))}
      </ul>
      <div className="ae-detail-total">
        <span className="ae-detail-libelle">Total</span>
        <span className="ae-detail-somme" role="status" aria-live="polite">+{compte} XP</span>
      </div>
    </div>
  )
}

/** La barre de niveau qui glisse de niveau_avant à niveau_apres. */
function CarteNiveau({ fin }) {
  const apres = niveauSur(fin?.niveau_apres, null)
  const avant = niveauSur(fin?.niveau_avant, apres.xp_total - entier(fin?.xp))
  const passage = apres.niveau > avant.niveau
  const largeur = useLargeurQuiGlisse(passage ? 0 : avant.progression_pct, apres.progression_pct)
  const reste = Math.max(0, apres.xp_suivant - apres.xp_total)
  const suivant = niveauPour(apres.xp_suivant).titre
  return (
    <div className="card card-p ae-niveau">
      <div className="ae-kpi-kicker">Niveau</div>
      <div className="ae-niveau-tete">
        <span className={`ae-niveau-pastille${passage ? ' is-passage' : ''}`}>{apres.niveau}</span>
        <span className="ae-niveau-titre">{apres.titre}</span>
        <span className="ae-niveau-xp">{apres.xp_total} XP au total</span>
      </div>
      {passage && <div className="ae-passage" role="status" aria-live="polite">Niveau {apres.niveau} atteint : {apres.titre}.</div>}
      <div className="ae-niveau-barre" aria-hidden="true"><div className="ae-niveau-fill" style={{ width: `${largeur}%` }} /></div>
      <div className="ae-kpi-sous">{reste > 0 ? `${reste} XP avant ${suivant}` : 'Dernier palier atteint'}</div>
    </div>
  )
}

/** Les succès débloqués par cette session, en cartes. */
function Succes({ succes }) {
  return (
    <div className="card card-p ae-fin-carte">
      <div className="ae-kpi-kicker">{succes.length > 1 ? 'Succès débloqués' : 'Succès débloqué'}</div>
      <ul className="ae-succes">
        {succes.map((s, i) => (
          <li key={s.code || i} className="ae-succes-carte" style={{ animationDelay: `${200 + i * 160}ms` }}>
            <span className="ae-succes-picto"><Picto nom={s.icone} taille={22} /></span>
            <span className="ae-succes-texte">
              <strong className="ae-succes-titre">{texteDe(s.titre) || 'Succès'}</strong>
              {texteDe(s.description) && <span className="ae-succes-desc">{s.description}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EcranFin({ titre, fin, onEncore, onRevoirErreurs, onRetourDeck }) {
  const f = fin || {}
  const erreurs = Array.isArray(f.erreurs) ? f.erreurs : []
  const avant = Number(f.couronnes_avant) || 0
  const apres = Number(f.couronnes_apres) || 0
  const serie = Number(f.serie) || 0
  const succes = (Array.isArray(f.succes_debloques) ? f.succes_debloques : []).filter(Boolean)
  const classement = f.classement && typeof f.classement === 'object' ? f.classement : null
  // Le focus se pose en haut du bilan, pas sur le dernier bouton : le bilan
  // est long, un focus en bas ferait sauter par dessus tout ce qui se fête.
  const teteRef = useRef(null)
  useEffect(() => { teteRef.current?.focus() }, [])
  return (
    <div className="ae-ecran ae-fin" ref={teteRef} tabIndex={-1}>
      <Confettis />
      <div className="ae-centre">
        <div className="ae-kicker">Session terminée</div>
        <div className="ae-haut-titre">{titre}</div>
        <div className="ae-xp" role="status" aria-live="polite">+{entier(f.xp)} XP</div>
        <div className="ae-score">{pluriel(Number(f.nb_bons) || 0, 'bonne réponse', 'bonnes réponses')} sur {Number(f.nb_total) || 0}</div>
      </div>

      <DetailXp fin={f} />
      <CarteNiveau fin={f} />

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

      {succes.length > 0 && <Succes succes={succes} />}

      {classement && (
        <div className="card card-p ae-classement">
          <div className="ae-kpi-kicker">Classement de la semaine</div>
          <div className="ae-classement-phrase">{phraseClassement(classement)}</div>
          <div className="ae-kpi-sous">Le classement est anonyme : ni nom ni score de personne.</div>
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
        <button type="button" className="btn btn-primary ae-btn-large" onClick={onEncore}>Encore une session</button>
        {erreurs.length > 0 && (
          <>
            <button type="button" className="btn btn-outline ae-btn-large" onClick={onRevoirErreurs}>Revoir mes erreurs</button>
            <div className="ae-kpi-sous ae-mention">Une nouvelle session sur ce deck : les exercices à revoir passent en premier.</div>
          </>
        )}
        <button type="button" className="btn btn-ghost ae-btn-large" onClick={onRetourDeck}>Retour au deck</button>
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
 * xpSession, combo, xpGagne et marques viennent du serveur (repli local) :
 * le compteur d’XP, la pastille de combo et la barre segmentée les animent.
 * schemas : les schémas de la version, pour résoudre une figure par ref.
 */
export function EntrainementVue({
  titre, phase, item, rang, total, rejeu, valeur, resultat, envoi, erreurReponse, erreurDefinitive, fin, erreurFin, nbARejouer,
  xpSession = 0, combo = 0, xpGagne = 0, marques = [], schemas = [],
  onChange, onVerifier, onContinuer, onRejouer, onReessayer, onReessayerFin, onQuitter, onEncore, onRevoirErreurs, onRetourDeck,
}) {
  if (phase === 'fin') {
    return (
      <div className="ae">
        <EcranFin titre={titre} fin={fin} onEncore={onEncore} onRevoirErreurs={onRevoirErreurs || onEncore} onRetourDeck={onRetourDeck} />
      </div>
    )
  }
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
        titre={titre} item={item} figure={figurePour(item, schemas)} rang={rang} total={total} rejeu={rejeu} valeur={valeur} resultat={resultat} envoi={envoi}
        erreurReponse={erreurReponse} erreurDefinitive={erreurDefinitive} marques={marques} xpSession={xpSession} combo={combo} xpGagne={xpGagne}
        onChange={onChange} onVerifier={onVerifier} onContinuer={onContinuer}
        onReessayer={onReessayer} onQuitter={onQuitter} onRetourDeck={onRetourDeck}
      />
    </div>
  )
}

// ─── État de la session ───────────────────────────────────────────────────

const INITIAL = {
  entrainement: null, erreur: null, phase: 'chargement', file: [], position: 0, rejeu: false,
  valeur: null, resultat: null, envoi: false, erreurReponse: null, erreurDefinitive: false, rates: [], fin: null, erreurFin: null, essaiFin: 0,
  xpSession: 0, combo: 0, comboMax: 0, xpGagne: 0, marques: [],
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
        // Reprise d’une session ouverte : le serveur rend l’XP déjà gagné et
        // le combo courant, le compteur du haut repart de là.
        xpSession: entier(a.entrainement?.xp_session),
        combo: entier(a.entrainement?.combo),
        comboMax: Math.max(entier(a.entrainement?.combo_max), entier(a.entrainement?.combo)),
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
      const r = a.resultat
      const correcte = r.correcte === true
      const rates = !correcte && !s.rejeu && item ? [...s.rates, { ...item, corrige: r }] : s.rates
      const marques = [...s.marques]
      marques[s.position] = correcte ? 'bon' : 'faux'
      const base = { ...s, envoi: false, erreurReponse: null, erreurDefinitive: false, resultat: r, rates, marques }
      // Un rejeu se corrige en local et ne compte rien : ni XP ni combo.
      if (s.rejeu) return { ...base, xpGagne: 0 }
      const combo = Number.isInteger(r.combo) ? Math.max(0, r.combo) : (correcte ? s.combo + 1 : 0)
      const gain = Number.isFinite(Number(r.xp_gagne)) && r.xp_gagne != null ? entier(r.xp_gagne) : xpReponse(item?.type, correcte, combo)
      return {
        ...base,
        combo,
        comboMax: Number.isInteger(r.combo_max) ? Math.max(0, r.combo_max) : Math.max(s.comboMax, combo),
        xpSession: Number.isInteger(r.xp_session) ? Math.max(0, r.xp_session) : s.xpSession + gain,
        // Une réponse déjà enregistrée ne rapporte rien de neuf : on n’annonce pas son XP.
        xpGagne: r.deja === true ? 0 : gain,
      }
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
      return {
        ...s, phase: 'jeu', rejeu: true, file: s.rates, position: 0, valeur: reponseVide(s.rates[0]?.type),
        resultat: null, erreurReponse: null, erreurDefinitive: false, marques: [], xpGagne: 0,
      }
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
      xpSession={s.xpSession} combo={s.combo} xpGagne={s.xpGagne} marques={s.marques} schemas={s.entrainement?.schemas}
      onChange={changer}
      onVerifier={() => verifier()}
      onContinuer={() => dispatch({ type: 'continuer' })}
      onRejouer={() => dispatch({ type: 'rejouer' })}
      onReessayer={() => verifier()}
      onReessayerFin={() => dispatch({ type: 'reessayer_fin' })}
      onQuitter={quitter}
      onEncore={() => setJeton(jetonSession())}
      onRevoirErreurs={() => setJeton(jetonSession())}
      onRetourDeck={() => onNaviguer?.(retourDeck(slug))}
    />
  )
}
