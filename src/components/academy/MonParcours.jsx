// ═══════════════════════════════════════════════════════════════════════════
// AUJOURD HUI : l’écran d’entrée du collaborateur dans la formation
//
// Ce que l’écran dit en un coup d’œil : le niveau atteint et ce qui reste
// avant le suivant, la série de jours (et si elle est en danger), l objectif
// quotidien en sessions, l XP du jour et de la semaine, les exercices dus.
// Puis les trois défis du jour, le classement anonyme de la semaine, les
// decks affectés, chacun avec ses couronnes, ses exercices vus et dus, son
// échéance, et un seul geste qui compte : « S’entraîner ». En bas, les
// succès récents et les dernières réussites.
//
// Le serveur décide de tout ce qui se compte (spec du 22 septembre 2026) :
// academy_mon_parcours rend niveau, defis, classement et succes tout faits.
// niveauPour et phraseClassement ne servent qu’à combler un serveur qui ne
// les rend pas encore, et à écrire la phrase d’encouragement.
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
import { libellesDefi, niveauPour, phraseClassement, titrePour } from '../../lib/academy/niveaux'
import { Couronnes, Flamme } from './Couronnes'
import { Picto } from './Picto'
import { SkeletonCards } from '../ui/Skeleton'

const OBJECTIFS = [1, 2, 3]
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const jour = (v) => (v ? String(v).slice(0, 10) : '')
const SANS_EXERCICE = 'Aucun exercice dans ce deck'
const ROUTE_SUCCES = '#/formation/succes'
const entierPositif = (v) => Math.max(0, Math.floor(Number(v) || 0))
const ordinal = (n) => (n === 1 ? '1er' : `${n}e`)

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

/**
 * La carte de niveau : le titre du palier, le numéro, l XP total et la barre
 * vers le palier suivant (« 70 XP avant Initié »). `niveau` est l’objet rendu
 * par le serveur (academy_niveau) ; sans lui, on retombe sur le miroir client
 * à partir de l XP total, le temps qu’un ancien serveur soit à jour.
 *
 * Exportée : l’écran Mes résultats pose la même carte.
 */
export function CarteNiveau({ niveau, xpTotal }) {
  const n = niveau && typeof niveau === 'object' && niveau.niveau != null
    ? { ...niveauPour(niveau.xp_total ?? xpTotal), ...niveau }
    : niveauPour(xpTotal)
  const palier = Math.max(1, entierPositif(n.niveau) || 1)
  const total = entierPositif(n.xp_total)
  const pct = Math.max(0, Math.min(100, entierPositif(n.progression_pct)))
  const reste = Math.max(0, entierPositif(n.xp_suivant) - total)
  const suivant = titrePour(palier + 1)
  const avant = suivant && suivant !== n.titre ? `avant ${suivant}` : `avant le niveau ${palier + 1}`
  return (
    <div className="card card-p ac-jour-carte ac-niveau">
      <div className="ac-kpi-kicker">Niveau</div>
      <div className="ac-niveau-haut">
        <span className="ac-niveau-pastille" aria-hidden="true">{palier}</span>
        <div className="ac-croissance">
          <div className="ac-kpi-valeur ac-niveau-titre">{n.titre}</div>
          <div className="ac-kpi-sous">niveau {palier} · {total} XP au total</div>
        </div>
      </div>
      <div className="team-bar-wrap ac-niveau-barre" aria-label={`Niveau ${palier}, ${pct} % vers le palier suivant`}>
        <div className="team-bar-track"><div className="team-bar-fill" style={{ width: `${pct}%` }} /></div>
        <span className="team-bar-pct">{pct} %</span>
      </div>
      <div className="ac-kpi-sous">{reste > 0 ? `${reste} XP ${avant}` : 'Palier suivant atteint'}</div>
    </div>
  )
}

// Un défi du jour : le pictogramme, le titre, la condition en clair, la barre
// vers la cible, l XP promis, et la coche quand il est fait.
function Defi({ defi }) {
  const repli = libellesDefi[defi?.code] || {}
  const titre = defi?.titre || repli.titre || 'Défi du jour'
  const description = defi?.description || repli.description || ''
  const cible = Math.max(1, entierPositif(defi?.cible) || 1)
  const progression = Math.min(cible, entierPositif(defi?.progression))
  const fait = defi?.fait === true
  const pct = fait ? 100 : Math.round((100 * progression) / cible)
  const xp = entierPositif(defi?.xp)
  return (
    <li className={`card card-p ac-defi${fait ? ' fait' : ''}`}>
      <div className="ac-defi-haut">
        <Picto nom={defi?.icone || repli.icone} taille={22} />
        <div className="ac-croissance">
          <div className="ac-defi-titre">{titre}</div>
          {description && <div className="ac-kpi-sous">{description}</div>}
        </div>
        {fait && <span className="ac-coche" role="img" aria-label="Défi fait">✓</span>}
      </div>
      <div className="team-bar-wrap" aria-label={`${progression} sur ${cible}`}>
        <div className="team-bar-track"><div className={`team-bar-fill${fait ? ' signed' : ''}`} style={{ width: `${pct}%` }} /></div>
        <span className="team-bar-pct">{progression}/{cible}</span>
      </div>
      <div className="ac-defi-pied">
        <span className="ac-defi-xp">+{xp} XP</span>
        {fait && <span className="badge badge-signed">Fait</span>}
      </div>
    </li>
  )
}

// Les trois défis du jour, les mêmes pour tout le cabinet. Un serveur qui ne
// les rend pas encore ne doit pas laisser un trou muet à l’écran.
function Defis({ defis }) {
  const liste = Array.isArray(defis) ? defis : null
  return (
    <section className="ac-bloc" aria-labelledby="ac-mp-defis">
      <h3 id="ac-mp-defis" className="ac-bloc-titre">Défis du jour</h3>
      {liste === null ? (
        <div className="ac-muet">Les défis du jour arrivent avec la prochaine mise à jour de la formation.</div>
      ) : liste.length === 0 ? (
        <div className="ac-muet">Aucun défi aujourd’hui : une session compte quand même pour ta série.</div>
      ) : (
        <ul className="ac-liste-plate ac-defis">
          {liste.map((d, i) => <Defi key={d?.code || i} defi={d} />)}
        </ul>
      )}
    </section>
  )
}

/**
 * Le classement de la semaine, anonyme : le rang, le nombre de participants,
 * l écart avec le premier et avec la place au dessus. Jamais un nom, jamais
 * l identifiant d’un collègue : le serveur n’en rend aucun, l’écran n’en
 * invente pas.
 */
function Classement({ classement }) {
  const c = classement
  const participants = entierPositif(c.participants)
  const rang = Math.max(1, entierPositif(c.rang) || 1)
  const xpMoi = entierPositif(c.xp_moi)
  const xpPremier = entierPositif(c.xp_premier)
  const ecartPremier = c.ecart_premier == null ? Math.max(0, xpPremier - xpMoi) : entierPositif(c.ecart_premier)
  const ecartDevant = c.xp_devant == null ? null : Math.max(0, entierPositif(c.xp_devant) - xpMoi)
  const classe = xpMoi > 0 && participants > 0
  return (
    <section className="ac-bloc" aria-labelledby="ac-mp-classement">
      <h3 id="ac-mp-classement" className="ac-bloc-titre">Classement de la semaine</h3>
      <div className="card card-p ac-classement">
        <div className="ac-classement-haut">
          <div className="ac-classement-rang">
            <span className="ac-kpi-valeur">{classe ? ordinal(rang) : 'Non classé'}</span>
            {participants > 0 && <span className="ac-kpi-unite">sur {pluriel(participants, 'participant', 'participants')}</span>}
          </div>
          <div className="ac-classement-phrase">{phraseClassement(c)}</div>
        </div>
        <ul className="ac-classement-detail">
          <li>{xpMoi} XP cette semaine</li>
          {classe && rang > 1 && ecartPremier > 0 && <li>{ecartPremier} XP derrière le premier</li>}
          {classe && rang > 1 && ecartDevant != null && ecartDevant > 0 && <li>{ecartDevant} XP de la place au dessus</li>}
        </ul>
        <div className="ac-muet">Classement anonyme : ni les noms ni les scores des collègues n’apparaissent.</div>
      </div>
    </section>
  )
}

// Les trois derniers succès débloqués, et la porte vers la galerie complète.
function SuccesRecents({ succes, onNaviguer }) {
  const recents = Array.isArray(succes?.recents) ? succes.recents.slice(0, 3) : []
  const obtenus = entierPositif(succes?.obtenus)
  const total = entierPositif(succes?.total)
  return (
    <section className="ac-bloc" aria-labelledby="ac-mp-succes">
      <h3 id="ac-mp-succes" className="ac-bloc-titre">Succès récents</h3>
      <div className="card card-p ac-succes-recents">
        {recents.length === 0 ? (
          <div className="ac-muet">Aucun succès pour l’instant : la première session terminée en débloque un.</div>
        ) : (
          <ul className="ac-succes-pictos">
            {recents.map((s) => (
              <li key={s.code} className="ac-succes-puce">
                <Picto nom={s.icone} taille={26} />
                <div className="ac-croissance">
                  <div className="ac-succes-titre">{s.titre}</div>
                  {s.obtenu_le && <div className="ac-kpi-sous">Obtenu le {jourParis(s.obtenu_le)}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="ac-succes-pied">
          {total > 0 && <span className="ac-muet">{obtenus} sur {total}</span>}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onNaviguer?.(ROUTE_SUCCES)}>Tous mes succès</button>
        </div>
      </div>
    </section>
  )
}

// La série de jours : la flamme, le nombre, et le mot qui va avec.
function Serie({ serie }) {
  const jours = Number(serie?.serie) || 0
  const meilleure = Number(serie?.meilleure) || 0
  const danger = serie?.en_danger === true
  // La série du jour est acquise dès qu’une session est terminée aujourd’hui :
  // la flamme vit alors doucement (animation CSS, coupée sous
  // prefers-reduced-motion), sinon elle reste fixe ou éteinte.
  const acquise = (Number(serie?.sessions_aujourdhui) || 0) > 0
  const eteinte = jours === 0 || danger
  let sous
  if (danger) sous = 'Une session aujourd’hui et la série continue.'
  else if (jours === 0) sous = 'Une session terminée aujourd’hui lance ta série.'
  else if (serie?.objectif_atteint) sous = 'Série assurée pour aujourd’hui.'
  else sous = 'Termine une session pour garder la flamme.'
  return (
    <div className={`card card-p ac-jour-carte${danger ? ' danger' : ''}`}>
      <div className="ac-kpi-kicker">Série</div>
      <div className="ac-serie">
        <span className={acquise && !eteinte ? 'ac-flamme-vive' : undefined}>
          <Flamme eteinte={eteinte} />
        </span>
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
        <CarteNiveau niveau={parcours?.niveau} xpTotal={xp.total} />
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

      <Defis defis={parcours?.defis} />

      {parcours?.classement && <Classement classement={parcours.classement} />}

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

      {parcours?.succes && <SuccesRecents succes={parcours.succes} onNaviguer={onNaviguer} />}

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
