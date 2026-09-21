// ═══════════════════════════════════════════════════════════════════════════
// CATALOGUE : tous les decks publiés, en cartes, avec recherche et filtres
//
// Chaque carte dit le thème et le niveau, le nombre d’exercices, la durée,
// les couronnes déjà gagnées et ce qu’il reste à revoir ; un seul bouton
// compte, « S’entraîner », qui ouvre une session sans passer par la page du
// deck. La recherche passe par correspond() (accents ignorés, ordre des mots
// libre, tolérance à une lettre) sur le titre, l objectif, la compétence et
// le thème. Les puces filtrent par thème, niveau, durée, statut et
// obligation ; une seule valeur par famille, un second clic la retire. Les
// prérequis arrivent en slugs : on affiche le titre du deck correspondant
// quand il est dans la liste, le slug sinon.
//
// Conteneur (listerCatalogue) et présentation séparés ; la vue est contrôlée
// (recherche et filtres lui arrivent par props).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { listerCatalogue } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { correspond } from '../../lib/recherche'
import { jourISO } from '../../lib/ma-journee'
import { classeBadge, enRetard, STATUTS } from '../../lib/academy/statuts'
import { NIVEAUX, libelleNiveau, libelleTheme } from '../../lib/academy/format'
import { Couronnes } from './Couronnes'
import { SkeletonCards } from '../ui/Skeleton'

const DUREES = [
  { cle: 'courte', libelle: '≤ 10 min', test: (m) => Number(m) <= 10 },
  { cle: 'moyenne', libelle: '10 à 20 min', test: (m) => Number(m) > 10 && Number(m) <= 20 },
  { cle: 'longue', libelle: '> 20 min', test: (m) => Number(m) > 20 },
]
const OBLIGATOIRE = [{ cle: 'oui', libelle: 'Oui' }, { cle: 'non', libelle: 'Non' }]
const FILTRES_VIDES = { theme: null, niveau: null, duree: null, statut: null, obligatoire: null }

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

// Le statut d’un deck pour le collaborateur : celui de son affectation,
// sinon déduit de ce qu’il a fait en consultation libre.
function statutModule(m) {
  if (m?.affectation?.statut) return m.affectation.statut
  if (m?.valide_le) return 'valide'
  if (Number(m?.items_vus) > 0) return 'en_cours'
  return 'non_commence'
}

function Puce({ actif, onClick, children }) {
  return (
    <button type="button" className={`ac-puce${actif ? ' on' : ''}`} aria-pressed={!!actif} onClick={onClick}>
      {children}
    </button>
  )
}

function Filtre({ nom, valeurs, actif, onChoisir }) {
  return (
    <div className="ac-filtre" role="group" aria-label={nom}>
      <span className="ac-filtre-nom">{nom}</span>
      <div className="ac-puces">
        {valeurs.map((v) => (
          <Puce key={v.cle} actif={actif === v.cle} onClick={() => onChoisir(actif === v.cle ? null : v.cle)}>{v.libelle}</Puce>
        ))}
      </div>
    </div>
  )
}

function Carte({ m, titresParSlug, aujourdhui, onNaviguer }) {
  const statut = statutModule(m)
  const retard = m.affectation ? enRetard({ ...m.affectation, statut }, aujourdhui) : false
  const prerequis = (Array.isArray(m.prerequis) ? m.prerequis : []).map((s) => titresParSlug[s] || s)
  const nbItems = Number(m.nb_items) || 0
  const vus = Math.min(nbItems, Number(m.items_vus) || 0)
  const dus = Number(m.items_dus) || 0
  const vide = nbItems === 0
  const meta = [
    pluriel(nbItems, 'exercice', 'exercices'),
    m.duree_minutes ? `${m.duree_minutes} min` : null,
    prerequis.length ? `prérequis : ${prerequis.join(', ')}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <article className="card card-p ac-carte">
      <div className="ac-carte-kicker">{[libelleTheme(m.theme), libelleNiveau(m.niveau)].filter(Boolean).join(' · ')}</div>
      <div className="ac-deck-haut">
        <div className="ac-carte-titre ac-croissance">{m.titre}</div>
        <Couronnes n={m.couronnes} />
      </div>
      {m.objectif && <div className="section-sub">{m.objectif}</div>}
      <div className="ac-carte-meta">{meta}</div>
      <div className="ac-deck-chiffres">
        <span>{vus} sur {nbItems} {nbItems > 1 ? 'vus' : 'vu'}</span>
        <span className={dus > 0 ? 'ac-du' : ''}>{dus > 0 ? `${dus} à revoir` : 'rien à revoir'}</span>
        {Number(m.xp) > 0 && <span>{m.xp} XP</span>}
      </div>
      <div className="ac-carte-pied">
        <span className="ac-badges">
          <span className={classeBadge(statut)}>{STATUTS[statut] || 'Non commencé'}</span>
          {retard && <span className="badge badge-urgent">En retard</span>}
          {m.affectation?.obligatoire && <span className="badge badge-normal">Obligatoire</span>}
        </span>
        <span className="ac-badges">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.(`#/formation/module/${m.slug}`)}>Voir le deck</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={vide} title={vide ? 'Aucun exercice dans ce deck' : undefined}
            onClick={() => onNaviguer?.(`#/formation/entrainement/${m.version_id}`)}>S’entraîner</button>
        </span>
      </div>
    </article>
  )
}

export function CatalogueVue({ modules, recherche, filtres, aujourdhui, onRecherche, onFiltres, onNaviguer }) {
  const liste = Array.isArray(modules) ? modules : []
  const f = { ...FILTRES_VIDES, ...(filtres || {}) }
  const titresParSlug = Object.fromEntries(liste.map((m) => [m.slug, m.titre]))
  const themes = [...new Set(liste.map((m) => m.theme).filter(Boolean))].sort((a, b) => libelleTheme(a).localeCompare(libelleTheme(b), 'fr'))
  const requete = String(recherche || '').trim()

  const visibles = liste.filter((m) => {
    if (requete && !correspond([m.titre, m.objectif, m.competence, libelleTheme(m.theme)].filter(Boolean).join(' '), requete)) return false
    if (f.theme && m.theme !== f.theme) return false
    if (f.niveau && m.niveau !== f.niveau) return false
    if (f.duree && !DUREES.find((d) => d.cle === f.duree)?.test(m.duree_minutes)) return false
    if (f.statut && statutModule(m) !== f.statut) return false
    if (f.obligatoire === 'oui' && !m.affectation?.obligatoire) return false
    if (f.obligatoire === 'non' && m.affectation?.obligatoire) return false
    return true
  })
  const filtresActifs = requete || Object.values(f).some(Boolean)
  const poser = (cle) => (valeur) => onFiltres?.({ ...f, [cle]: valeur })

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Formation</div>
          <div className="section-title">Catalogue</div>
          <div className="section-sub">Tous les decks publiés. Une session, c’est douze exercices corrigés au fur et à mesure ; trois couronnes valident le deck.</div>
        </div>
      </div>

      <div className="table-toolbar ac-outils">
        <input className="search-input" type="search" value={recherche || ''} onChange={(e) => onRecherche?.(e.target.value)}
          placeholder="Chercher un deck : titre, objectif, compétence, thème" aria-label="Chercher un deck" />
        {filtresActifs && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onRecherche?.(''); onFiltres?.({ ...FILTRES_VIDES }) }}>
            Effacer les filtres
          </button>
        )}
      </div>

      <div className="ac-filtres">
        {themes.length > 0 && <Filtre nom="Thème" valeurs={themes.map((t) => ({ cle: t, libelle: libelleTheme(t) }))} actif={f.theme} onChoisir={poser('theme')} />}
        <Filtre nom="Niveau" valeurs={NIVEAUX.map((n) => n)} actif={f.niveau} onChoisir={poser('niveau')} />
        <Filtre nom="Durée" valeurs={DUREES} actif={f.duree} onChoisir={poser('duree')} />
        <Filtre nom="Statut" valeurs={Object.entries(STATUTS).map(([cle, libelle]) => ({ cle, libelle }))} actif={f.statut} onChoisir={poser('statut')} />
        <Filtre nom="Obligatoire" valeurs={OBLIGATOIRE} actif={f.obligatoire} onChoisir={poser('obligatoire')} />
      </div>

      <div className="ac-compteur" role="status" aria-live="polite">
        {pluriel(liste.length, 'deck', 'decks')}, {visibles.length} {visibles.length > 1 ? 'affichés' : 'affiché'}
      </div>

      {liste.length === 0 ? (
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucun deck publié</div>
            <div className="empty-sub">La direction publie les decks depuis l’administration de la formation.</div>
          </div>
        </div>
      ) : visibles.length === 0 ? (
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucun deck ne correspond</div>
            <div className="empty-sub">Essaie un autre mot, ou retire un filtre.</div>
          </div>
        </div>
      ) : (
        <div className="ac-grille">
          {visibles.map((m) => <Carte key={m.version_id || m.slug} m={m} titresParSlug={titresParSlug} aujourdhui={aujourdhui} onNaviguer={onNaviguer} />)}
        </div>
      )}
    </div>
  )
}

export default function Catalogue({ onNaviguer }) {
  const [modules, setModules] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState(() => ({ ...FILTRES_VIDES }))
  const [aujourdhui] = useState(() => jourISO())

  useEffect(() => {
    let vivant = true
    listerCatalogue()
      .then((liste) => { if (vivant) setModules(Array.isArray(liste) ? liste : []) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [])

  if (erreur) return <div className="notice notice-error" role="alert">{erreur}</div>
  if (!modules) return <SkeletonCards n={6} height={160} />
  return (
    <CatalogueVue modules={modules} recherche={recherche} filtres={filtres} aujourdhui={aujourdhui}
      onRecherche={setRecherche} onFiltres={setFiltres} onNaviguer={onNaviguer} />
  )
}
