// ═══════════════════════════════════════════════════════════════════════════
// ÉDITEUR DE VERSION : un deck d’exercices et son mémo, côté administration
//
// Une version est la seule chose qui s’écrit dans l’Academy. Un brouillon se
// modifie pièce par pièce : la fiche du deck, le mémo d’une page (markdown),
// chaque exercice (huit types, un formulaire par type qui édite l’énoncé ET
// le corrigé ensemble, en indices originaux). Une version publiée ne se
// modifie plus : l’écran la montre en lecture seule et renvoie vers
// « Nouveau brouillon ». La publication est un geste séparé qui enregistre le
// nom du relecteur ; c’est la base qui refuse (au moins douze exercices avec
// corrigé) et son message s’affiche tel quel.
//
// Les corrigés arrivent ici parce que academy_version_admin les rend à
// l’administrateur seul ; ils ne sortent jamais vers un collaborateur. La
// prévisualisation joue UN exercice avec les composants de la session
// (exercices/), les choix présentés tels quels, sans mélange, et la
// correction est calculée en local depuis le corrigé, pour l’aperçu
// seulement : une vraie session passe par academy_repondre.
//
// Conteneur (chargement) et vue (tout par props) sont séparés : la vue se
// teste en renderToStaticMarkup. La logique (état d’un formulaire,
// validation, patch, bonne réponse de l’aperçu) vit dans
// src/lib/academy/editeur-items.js.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { messageErreur } from '../../lib/ui-shared'
import { dateHeureParis, pourcentage, THEMES, NIVEAUX, libelleTheme, libelleNiveau } from '../../lib/academy/format'
import { LIBELLE_TYPES } from '../../lib/academy/statuts'
import {
  TYPES_ITEM, NB_CHOIX, MULTI_MIN, MULTI_MAX, MEMO_MOTS, compterMots, etatItem, enonceCourt, validerItem, bonneReponseApercu,
} from '../../lib/academy/editeur-items'
import { reponseVide, reponseComplete, estBonneReponse, rendreBonneReponse } from '../../lib/academy/exercices'
import { versionAdmin, enregistrerVersion, enregistrerItem, publierVersion } from '../../services/academy'
import { confirmDialog } from '../ui/confirm'
import RenduMarkdown from '../ui/RenduMarkdown'
import { SkeletonTable } from '../ui/Skeleton'
import Choix from './exercices/Choix'
import VraiFaux from './exercices/VraiFaux'
import Multi from './exercices/Multi'
import Ordre from './exercices/Ordre'
import Association from './exercices/Association'
import TrouChoix from './exercices/TrouChoix'
import TrouSaisie from './exercices/TrouSaisie'
import Carte from './exercices/Carte'
import './academy-admin.css'
// Les composants d’exercice portent leurs styles dans la feuille de la
// session : l’aperçu les rejoue tels quels, même si la session n’a jamais
// été ouverte dans cet onglet.
import './academy-entrainement.css'

// ─── Référentiels ──────────────────────────────────────────────────────────
// Un fichier de composant n’exporte que des composants (Fast Refresh) : ces
// listes sont rendues par les petits composants exportés plus bas.

const STATUTS_VERSION = {
  brouillon: { libelle: 'Brouillon', classe: 'badge badge-normal' },
  publie: { libelle: 'Publié', classe: 'badge badge-signed' },
  archive: { libelle: 'Archivé', classe: 'badge badge-cancelled' },
}
const DIFFICULTES = [
  { cle: 1, libelle: '1 · facile' },
  { cle: 2, libelle: '2 · moyenne' },
  { cle: 3, libelle: '3 · difficile' },
]
const COMPOSANTS_EXERCICE = {
  choix: Choix, vrai_faux: VraiFaux, multi: Multi, ordre: Ordre,
  association: Association, trou_choix: TrouChoix, trou_saisie: TrouSaisie, carte: Carte,
}

// Sous ce nombre de réponses, un taux ne dit rien de la formulation.
const REPONSES_MINIMUM = 8
const TAUX_A_REVOIR = 40
// La publication exige ce nombre d’exercices actifs avec corrigé.
const EXERCICES_MINIMUM = 12

const libelleType = (type) => LIBELLE_TYPES[type] || type || ''
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const lignes = (texte) => String(texte || '').split('\n').map((l) => l.trim()).filter(Boolean)
const texteLignes = (liste) => (Array.isArray(liste) ? liste : []).map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')
const nombreEntier = (v, defaut) => {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : defaut
}
const estActif = (it) => !it.archive_le

// Les sources se saisissent une par ligne : « titre | url | émetteur | date ».
// Les champs que la ligne ne porte pas sont repris de la source d’origine
// qui a la même adresse, pour ne pas les perdre en retouchant un titre.
const sourcesEnTexte = (sources) => (Array.isArray(sources) ? sources : [])
  .map((s) => [s?.titre, s?.url, s?.emetteur, s?.date_consultation].map((v) => (v == null ? '' : String(v))).join(' | '))
  .join('\n')

function sourcesDepuisTexte(texte, originales) {
  const avant = Array.isArray(originales) ? originales : []
  return lignes(texte).map((ligne) => {
    const [titre = '', url = '', emetteur = '', date_consultation = ''] = ligne.split('|').map((v) => v.trim())
    const origine = avant.find((s) => s && s.url && s.url === url) || {}
    return { ...origine, titre, url, emetteur, date_consultation }
  })
}

// ─── Petits composants partagés avec l’écran Administration ────────────────

export function BadgeStatutVersion({ statut }) {
  const s = STATUTS_VERSION[statut] || STATUTS_VERSION.brouillon
  return <span className={s.classe}>{s.libelle}</span>
}

export function LibelleTheme({ theme }) {
  return <>{libelleTheme(theme)}</>
}

export function LibelleNiveau({ niveau }) {
  return <>{libelleNiveau(niveau)}</>
}

export function SelectTheme({ id, value, onChange, disabled }) {
  return (
    <select id={id} className="form-select" value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {THEMES.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
    </select>
  )
}

export function SelectNiveau({ id, value, onChange, disabled }) {
  return (
    <select id={id} className="form-select" value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {NIVEAUX.map((n) => <option key={n.cle} value={n.cle}>{n.libelle}</option>)}
    </select>
  )
}

// La ligne « Enregistré à 10h42 » sous un bouton, annoncée aux lecteurs d’écran.
const HEURE_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false })
function StatutEnregistrement({ quand }) {
  return (
    <span className="aca-statut" role="status" aria-live="polite">
      {quand ? `Enregistré à ${HEURE_PARIS.format(quand).replace(':', 'h')}` : ''}
    </span>
  )
}

// Le compteur de mots du mémo : la fourchette visée, et la couleur qui dit si
// on y est. Un mémo vide ne se colore pas, il se signale.
function CompteurMots({ texte }) {
  const n = compterMots(texte)
  let classe = 'aca-mots'
  let mention = `viser ${MEMO_MOTS.min} à ${MEMO_MOTS.max}`
  if (n === 0) mention = 'aucun mémo pour l’instant'
  else if (n < MEMO_MOTS.min) { classe += ' aca-mots-court'; mention = `un peu court, viser ${MEMO_MOTS.min} à ${MEMO_MOTS.max}` }
  else if (n > MEMO_MOTS.max) { classe += ' aca-mots-long'; mention = `un peu long, viser ${MEMO_MOTS.min} à ${MEMO_MOTS.max}` }
  else classe += ' aca-mots-bon'
  return <span className={classe} role="status" aria-live="polite">{pluriel(n, 'mot', 'mots')} · {mention}</span>
}

// ─── La fiche du deck et le mémo ───────────────────────────────────────────

const etatVersion = (v) => ({
  titre: v.titre || '',
  objectif: v.objectif || '',
  competence: v.competence || '',
  duree_minutes: String(v.duree_minutes ?? 10),
  seuil_reussite: String(v.seuil_reussite ?? 0.8),
  prerequis: (Array.isArray(v.prerequis) ? v.prerequis : []).join(', '),
  theme: v.theme || 'methode',
  niveau: v.niveau || 'fondamentaux',
  memo_md: v.memo_md || '',
  a_completer: texteLignes(v.a_completer),
  sources: sourcesEnTexte(v.sources),
  fictif: !!v.fictif,
})

function FormulaireVersion({ version, lectureSeule, onRecharger }) {
  const [f, setF] = useState(() => etatVersion(version))
  const [enCours, setEnCours] = useState(false)
  const [enregistreLe, setEnregistreLe] = useState(null)
  const poser = (patch) => setF((prev) => ({ ...prev, ...patch }))
  const id = (c) => `aca-version-${c}`

  async function enregistrer() {
    if (enCours) return
    const seuil = Number(String(f.seuil_reussite).replace(',', '.'))
    if (!f.titre.trim()) { toast.error('Le titre est obligatoire'); return }
    if (!(seuil >= 0.5 && seuil <= 1)) { toast.error('Le seuil de réussite va de 0,5 à 1'); return }
    setEnCours(true)
    try {
      await enregistrerVersion(version.id, {
        titre: f.titre.trim(),
        objectif: f.objectif,
        competence: f.competence,
        duree_minutes: Math.max(1, nombreEntier(f.duree_minutes, 10)),
        seuil_reussite: seuil,
        prerequis: String(f.prerequis).split(',').map((s) => s.trim()).filter(Boolean),
        theme: f.theme,
        niveau: f.niveau,
        memo_md: f.memo_md,
        a_completer: lignes(f.a_completer),
        sources: sourcesDepuisTexte(f.sources, version.sources),
        fictif: !!f.fictif,
      })
      toast.success('Deck enregistré')
      setEnregistreLe(new Date())
      onRecharger?.()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="form-section">
      <div className="form-section-title">La fiche du deck</div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('titre')}>Titre</label>
        <input id={id('titre')} className="form-input" value={f.titre} disabled={lectureSeule} onChange={(e) => poser({ titre: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('objectif')}>Objectif</label>
        <textarea id={id('objectif')} className="form-textarea" rows={3} value={f.objectif} disabled={lectureSeule}
          onChange={(e) => poser({ objectif: e.target.value })} placeholder="À l’issue du deck, le conseiller sait…" />
      </div>
      <div className="aca-grille-2">
        <div className="form-group">
          <label className="form-label" htmlFor={id('competence')}>Compétence</label>
          <input id={id('competence')} className="form-input" value={f.competence} disabled={lectureSeule} onChange={(e) => poser({ competence: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('prerequis')}>Prérequis</label>
          <input id={id('prerequis')} className="form-input" value={f.prerequis} disabled={lectureSeule}
            onChange={(e) => poser({ prerequis: e.target.value })} placeholder="methode-entasis, assurance-vie" />
          <div className="form-hint">Les identifiants des modules, séparés par des virgules.</div>
        </div>
      </div>
      <div className="aca-grille-3">
        <div className="form-group">
          <label className="form-label" htmlFor={id('duree')}>Durée (minutes)</label>
          <input id={id('duree')} className="form-input" type="number" min={1} value={f.duree_minutes} disabled={lectureSeule} onChange={(e) => poser({ duree_minutes: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('seuil')}>Seuil de réussite</label>
          <input id={id('seuil')} className="form-input" type="number" min={0.5} max={1} step={0.05} value={f.seuil_reussite} disabled={lectureSeule} onChange={(e) => poser({ seuil_reussite: e.target.value })} />
          <div className="form-hint">De 0,5 à 1 : 0,8 veut dire 80 % de bonnes réponses.</div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('theme')}>Thème</label>
          <SelectTheme id={id('theme')} value={f.theme} disabled={lectureSeule} onChange={(theme) => poser({ theme })} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('niveau')}>Niveau</label>
          <SelectNiveau id={id('niveau')} value={f.niveau} disabled={lectureSeule} onChange={(niveau) => poser({ niveau })} />
        </div>
      </div>

      <div className="form-section-title" style={{ marginTop: 22 }}>Le mémo</div>
      <p className="aca-mention" style={{ marginTop: 0 }}>
        Une page à savoir par cœur, en markdown : le collaborateur la lit avant de s’entraîner et y revient après une erreur.
      </p>
      <div className="form-group">
        <label className="form-label" htmlFor={id('memo')}>Mémo (markdown)</label>
        <div className="aca-editeur">
          <textarea id={id('memo')} className="form-textarea" rows={16} value={f.memo_md} disabled={lectureSeule}
            onChange={(e) => poser({ memo_md: e.target.value })} placeholder="## Les sept étapes&#10;&#10;1. …" />
          <div className="aca-apercu">
            <div className="aca-apercu-titre">Aperçu</div>
            {String(f.memo_md || '').trim()
              ? <RenduMarkdown markdown={f.memo_md} />
              : <div className="aca-apercu-vide">Rien à afficher pour l’instant.</div>}
          </div>
        </div>
        <CompteurMots texte={f.memo_md} />
      </div>

      <div className="form-section-title" style={{ marginTop: 22 }}>Ce que le cabinet complète</div>
      <div className="aca-grille-2">
        <div className="form-group">
          <label className="form-label" htmlFor={id('a-completer')}>À compléter par le cabinet</label>
          <textarea id={id('a-completer')} className="form-textarea" rows={3} value={f.a_completer} disabled={lectureSeule}
            onChange={(e) => poser({ a_completer: e.target.value })} />
          <div className="form-hint">Un élément par ligne : les procédures internes que le contenu ne peut pas connaître.</div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('sources')}>Sources</label>
          <textarea id={id('sources')} className="form-textarea" rows={3} value={f.sources} disabled={lectureSeule}
            onChange={(e) => poser({ sources: e.target.value })} placeholder="Titre | https://… | Émetteur | 2026-09-21" />
          <div className="form-hint">Une source par ligne : titre | url | émetteur | date de consultation.</div>
        </div>
      </div>
      <label className="aca-case" htmlFor={id('fictif')}>
        <input id={id('fictif')} type="checkbox" checked={f.fictif} disabled={lectureSeule} onChange={(e) => poser({ fictif: e.target.checked })} />
        Contenu fictif de démonstration
      </label>

      <div className="aca-pied">
        <button type="button" className="btn btn-primary" onClick={enregistrer} disabled={lectureSeule || enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <StatutEnregistrement quand={enregistreLe} />
      </div>
    </div>
  )
}

// ─── Le formulaire d’un exercice, un par type ──────────────────────────────

// Une liste de textes éditables (éléments d’un ordre, lignes d’une
// association) avec les gestes monter, descendre, retirer, en boutons
// natifs : rien ne se glisse à la souris.
function ListeTextes({ idBase, libelle, valeurs, onChange, disabled, min = 2, max = 12, placeholder, ordonnable = true }) {
  const poser = (i, v) => onChange(valeurs.map((x, j) => (j === i ? v : x)))
  const deplacer = (i, sens) => {
    const j = i + sens
    if (j < 0 || j >= valeurs.length) return
    const liste = [...valeurs]
    const [element] = liste.splice(i, 1)
    liste.splice(j, 0, element)
    onChange(liste)
  }
  const retirer = (i) => onChange(valeurs.filter((_, j) => j !== i))
  return (
    <div className="aca-liste-textes">
      {valeurs.map((v, i) => (
        <div className="aca-ligne-texte" key={i}>
          <span className="aca-ligne-numero">{i + 1}.</span>
          <input id={`${idBase}-${i}`} className="form-input" value={v} disabled={disabled} placeholder={placeholder}
            aria-label={`${libelle} ${i + 1}`} onChange={(e) => poser(i, e.target.value)} />
          <span className="aca-actions">
            {ordonnable && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Monter ${libelle.toLowerCase()} ${i + 1}`} onClick={() => deplacer(i, -1)} disabled={disabled || i === 0}>Monter</button>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Descendre ${libelle.toLowerCase()} ${i + 1}`} onClick={() => deplacer(i, 1)} disabled={disabled || i === valeurs.length - 1}>Descendre</button>
              </>
            )}
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Retirer ${libelle.toLowerCase()} ${i + 1}`} onClick={() => retirer(i)} disabled={disabled || valeurs.length <= min}>Retirer</button>
          </span>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([...valeurs, ''])} disabled={disabled || valeurs.length >= max}>
          Ajouter
        </button>
      </div>
    </div>
  )
}

// Quatre choix et la radio de la bonne réponse, pour un choix unique ou un
// texte à trou.
function ChampsChoixUnique({ id, f, poser, disabled }) {
  return (
    <fieldset className="aca-fieldset">
      <legend className="form-label">Les {NB_CHOIX} choix, et la bonne réponse</legend>
      {f.choix.map((c, i) => (
        <div className="aca-ligne-choix" key={i}>
          <input type="radio" id={id(`bonne-${i}`)} name={id('bonne')} checked={f.bonne === i} disabled={disabled}
            onChange={() => poser({ bonne: i })} aria-label={`Le choix ${i + 1} est la bonne réponse`} />
          <input id={id(`choix-${i}`)} className="form-input" value={c} disabled={disabled} aria-label={`Choix ${i + 1}`}
            placeholder={`Choix ${i + 1}`} onChange={(e) => poser({ choix: f.choix.map((x, j) => (j === i ? e.target.value : x)) })} />
        </div>
      ))}
      <div className="form-hint">Cochez la bonne réponse. Les choix seront mélangés à chaque session.</div>
    </fieldset>
  )
}

function ChampsParType({ id, f, poser, disabled }) {
  const champEnonce = (
    <div className="form-group">
      <label className="form-label" htmlFor={id('enonce')}>Énoncé</label>
      <textarea id={id('enonce')} className="form-textarea" rows={2} value={f.enonce} disabled={disabled} onChange={(e) => poser({ enonce: e.target.value })} />
    </div>
  )
  const champPhrase = (
    <div className="form-group">
      <label className="form-label" htmlFor={id('phrase')}>Phrase avec un trou</label>
      <textarea id={id('phrase')} className="form-textarea" rows={2} value={f.phrase} disabled={disabled} onChange={(e) => poser({ phrase: e.target.value })}
        placeholder="Le plafond non utilisé se reporte sur les ___ années suivantes." />
      <div className="form-hint">Un seul trou, écrit ___ (trois tirets bas).</div>
    </div>
  )

  switch (f.type) {
    case 'choix':
      return <>{champEnonce}<ChampsChoixUnique id={id} f={f} poser={poser} disabled={disabled} /></>
    case 'trou_choix':
      return <>{champPhrase}<ChampsChoixUnique id={id} f={f} poser={poser} disabled={disabled} /></>
    case 'vrai_faux':
      return (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor={id('enonce')}>Affirmation</label>
            <textarea id={id('enonce')} className="form-textarea" rows={2} value={f.enonce} disabled={disabled} onChange={(e) => poser({ enonce: e.target.value })} />
          </div>
          <fieldset className="aca-fieldset">
            <legend className="form-label">L’affirmation est</legend>
            <div className="aca-radios">
              <label className="aca-case" htmlFor={id('vrai')}>
                <input type="radio" id={id('vrai')} name={id('vf')} checked={f.vrai === true} disabled={disabled} onChange={() => poser({ vrai: true })} />
                Vraie
              </label>
              <label className="aca-case" htmlFor={id('faux')}>
                <input type="radio" id={id('faux')} name={id('vf')} checked={f.vrai === false} disabled={disabled} onChange={() => poser({ vrai: false })} />
                Fausse
              </label>
            </div>
          </fieldset>
        </>
      )
    case 'multi':
      return (
        <>
          {champEnonce}
          <fieldset className="aca-fieldset">
            <legend className="form-label">De {MULTI_MIN} à {MULTI_MAX} choix, cochez les bonnes réponses</legend>
            {f.choix.map((c, i) => (
              <div className="aca-ligne-choix" key={i}>
                <input type="checkbox" id={id(`coche-${i}`)} checked={f.coches.includes(i)} disabled={disabled}
                  aria-label={`Le choix ${i + 1} est une bonne réponse`}
                  onChange={(e) => poser({ coches: e.target.checked ? [...f.coches, i] : f.coches.filter((x) => x !== i) })} />
                <input id={id(`choix-${i}`)} className="form-input" value={c} disabled={disabled} aria-label={`Choix ${i + 1}`}
                  placeholder={`Choix ${i + 1}`} onChange={(e) => poser({ choix: f.choix.map((x, j) => (j === i ? e.target.value : x)) })} />
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Retirer le choix ${i + 1}`} disabled={disabled || f.choix.length <= MULTI_MIN}
                  onClick={() => poser({ choix: f.choix.filter((_, j) => j !== i), coches: f.coches.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)) })}>
                  Retirer
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn btn-outline btn-sm" disabled={disabled || f.choix.length >= MULTI_MAX} onClick={() => poser({ choix: [...f.choix, ''] })}>
                Ajouter un choix
              </button>
            </div>
          </fieldset>
        </>
      )
    case 'ordre':
      return (
        <>
          {champEnonce}
          <div className="form-group">
            <span className="form-label">Les éléments, dans le bon ordre</span>
            <ListeTextes idBase={id('element')} libelle="Élément" valeurs={f.elements} disabled={disabled} onChange={(elements) => poser({ elements })} />
            <div className="form-hint">Saisissez les dans le bon ordre : la session les mélange et le collaborateur les remet en place.</div>
          </div>
        </>
      )
    case 'association':
      return (
        <>
          {champEnonce}
          <div className="form-group">
            <span className="form-label">Les paires, chaque ligne de gauche en face de la sienne</span>
            <div className="aca-paires">
              {f.gauche.map((g, i) => (
                <div className="aca-paire" key={i}>
                  <span className="aca-ligne-numero">{i + 1}.</span>
                  <input id={id(`gauche-${i}`)} className="form-input" value={g} disabled={disabled} aria-label={`Gauche ${i + 1}`} placeholder="Gauche"
                    onChange={(e) => poser({ gauche: f.gauche.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <span className="aca-paire-fleche" aria-hidden="true">↔</span>
                  <input id={id(`droite-${i}`)} className="form-input" value={f.droite[i] ?? ''} disabled={disabled} aria-label={`Droite ${i + 1}`} placeholder="Droite"
                    onChange={(e) => poser({ droite: f.droite.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Retirer la paire ${i + 1}`} disabled={disabled || f.gauche.length <= 2}
                    onClick={() => poser({ gauche: f.gauche.filter((_, j) => j !== i), droite: f.droite.filter((_, j) => j !== i) })}>
                    Retirer
                  </button>
                </div>
              ))}
            </div>
            <div>
              <button type="button" className="btn btn-outline btn-sm" disabled={disabled || f.gauche.length >= 8}
                onClick={() => poser({ gauche: [...f.gauche, ''], droite: [...f.droite, ''] })}>
                Ajouter une paire
              </button>
            </div>
            <div className="form-hint">La colonne de droite sera mélangée à chaque session.</div>
          </div>
        </>
      )
    case 'trou_saisie':
      return (
        <>
          {champPhrase}
          <div className="aca-grille-2">
            <div className="form-group">
              <label className="form-label" htmlFor={id('aide')}>Aide (facultative)</label>
              <input id={id('aide')} className="form-input" value={f.aide} disabled={disabled} onChange={(e) => poser({ aide: e.target.value })} placeholder="Un chiffre." />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={id('reponses')}>Réponses acceptées</label>
              <textarea id={id('reponses')} className="form-textarea" rows={3} value={f.reponses} disabled={disabled} onChange={(e) => poser({ reponses: e.target.value })}
                placeholder={'3\ntrois'} />
              <div className="form-hint">Une par ligne. La comparaison ignore la casse, les accents et les espaces en trop.</div>
            </div>
          </div>
        </>
      )
    case 'carte':
      return (
        <div className="aca-grille-2">
          <div className="form-group">
            <label className="form-label" htmlFor={id('recto')}>Recto (la question)</label>
            <textarea id={id('recto')} className="form-textarea" rows={3} value={f.recto} disabled={disabled} onChange={(e) => poser({ recto: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={id('verso')}>Verso (la réponse)</label>
            <textarea id={id('verso')} className="form-textarea" rows={3} value={f.verso} disabled={disabled} onChange={(e) => poser({ verso: e.target.value })} />
          </div>
        </div>
      )
    default:
      return null
  }
}

/**
 * Le formulaire d’un exercice : l’énoncé et le corrigé ensemble, en indices
 * originaux. `item` est un exercice de academy_version_admin, ou { type }
 * seul pour un nouvel exercice. Exporté pour se tester à sec, type par type.
 */
export function FormulaireExercice({ version, item, lectureSeule, onRecharger, onFermer }) {
  const [f, setF] = useState(() => etatItem(item))
  const [enCours, setEnCours] = useState(false)
  const [enregistreLe, setEnregistreLe] = useState(null)
  const nouveau = !item?.id
  const verrou = lectureSeule || !!item?.archive_le
  const poser = (patch) => setF((prev) => ({ ...prev, ...patch }))
  const id = (c) => `aca-exo-${item?.id || 'nouveau'}-${c}`

  async function enregistrer() {
    if (enCours) return
    const { erreur, patch } = validerItem(f)
    if (erreur) { toast.error(erreur); return }
    setEnCours(true)
    try {
      await enregistrerItem(version.id, item?.id || null, patch)
      toast.success(nouveau ? 'Exercice ajouté' : 'Exercice enregistré')
      setEnregistreLe(new Date())
      onRecharger?.()
      if (nouveau) onFermer?.()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="aca-exo-formulaire" aria-label={`Formulaire ${libelleType(f.type).toLowerCase()}`}>
      <div className="aca-grille-3">
        <div className="form-group">
          <label className="form-label" htmlFor={id('competence')}>Compétence</label>
          <input id={id('competence')} className="form-input" value={f.competence} disabled={verrou} onChange={(e) => poser({ competence: e.target.value })}
            placeholder="Blocage et déblocage anticipé" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('difficulte')}>Difficulté</label>
          <select id={id('difficulte')} className="form-select" value={f.difficulte} disabled={verrou} onChange={(e) => poser({ difficulte: e.target.value })}>
            {DIFFICULTES.map((d) => <option key={d.cle} value={String(d.cle)}>{d.libelle}</option>)}
          </select>
        </div>
      </div>
      <ChampsParType id={id} f={f} poser={poser} disabled={verrou} />
      <div className="form-group">
        <label className="form-label" htmlFor={id('explication')}>Explication{f.type === 'carte' ? ' (facultative)' : ''}</label>
        <textarea id={id('explication')} className="form-textarea" rows={2} value={f.explication} disabled={verrou} onChange={(e) => poser({ explication: e.target.value })}
          placeholder="La ligne lue après la réponse, juste ou fausse" />
      </div>
      <div className="aca-pied">
        <button type="button" className="btn btn-primary btn-sm" onClick={enregistrer} disabled={verrou || enCours}>
          {enCours ? 'Enregistrement…' : (nouveau ? 'Ajouter l’exercice' : 'Enregistrer l’exercice')}
        </button>
        {onFermer && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onFermer} disabled={enCours}>{nouveau ? 'Abandonner' : 'Fermer'}</button>
        )}
        <StatutEnregistrement quand={enregistreLe} />
      </div>
    </div>
  )
}

// ─── La liste des exercices ────────────────────────────────────────────────

function LigneExercice({ version, item, numero, lectureSeule, ouvert, onOuvrir, onApercu, onRecharger }) {
  const [enCours, setEnCours] = useState(false)
  const archive = !!item.archive_le
  const stats = item.statistiques || {}
  const reponses = Number(stats.reponses) || 0
  const taux = pourcentage(stats.correctes, reponses)
  const aRevoir = reponses >= REPONSES_MINIMUM && taux < TAUX_A_REVOIR

  async function archiver(valeur) {
    if (enCours) return
    if (valeur) {
      const ok = await confirmDialog({
        title: `Archiver l’exercice ${numero} ?`,
        message: 'Il ne sera plus tiré dans les sessions ni compté dans la maîtrise. Les réponses déjà données restent dans l’historique.',
        confirmLabel: 'Archiver',
        danger: true,
      })
      if (!ok) return
    }
    setEnCours(true)
    try {
      await enregistrerItem(version.id, item.id, { archive: valeur })
      toast.success(valeur ? 'Exercice archivé' : 'Exercice restauré')
      onRecharger?.()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <li className={`aca-exo${archive ? ' aca-exo-archive' : ''}${ouvert ? ' aca-exo-ouvert' : ''}`}>
      <div className="aca-exo-tete">
        <span className="aca-exo-numero">{numero}</span>
        <span className="badge badge-normal">{libelleType(item.type)}</span>
        <span className="aca-exo-meta">{item.competence || 'Sans compétence'} · difficulté {item.difficulte ?? 2}</span>
        {archive && <span className="badge badge-cancelled">Archivé</span>}
        {reponses > 0 && (
          <span className="aca-exo-stats">{pluriel(reponses, 'réponse', 'réponses')}, {taux} % de réussite</span>
        )}
        {aRevoir && <span className="badge badge-high" title={`Moins de ${TAUX_A_REVOIR} % de réussite sur au moins ${REPONSES_MINIMUM} réponses`}>Formulation à revoir</span>}
        <span className="aca-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onApercu(item)}>Prévisualiser</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onOuvrir(ouvert ? null : item.id)} aria-expanded={ouvert}>
            {ouvert ? 'Fermer' : (lectureSeule || archive ? 'Voir' : 'Modifier')}
          </button>
          {!lectureSeule && (archive
            ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => archiver(false)} disabled={enCours}>Restaurer</button>
            : <button type="button" className="btn btn-ghost btn-sm" onClick={() => archiver(true)} disabled={enCours}>Archiver</button>)}
        </span>
      </div>
      <div className="aca-exo-enonce">{enonceCourt(item) || <em>Sans énoncé</em>}</div>
      {ouvert && (
        <FormulaireExercice key={item.id} version={version} item={item} lectureSeule={lectureSeule} onRecharger={onRecharger} onFermer={() => onOuvrir(null)} />
      )}
    </li>
  )
}

function ListeExercices({ version, lectureSeule, onRecharger, onApercu }) {
  const [ouvert, setOuvert] = useState(null)
  const [nouveau, setNouveau] = useState(null) // le type du nouvel exercice en cours de saisie
  const [typeChoisi, setTypeChoisi] = useState('choix')
  const items = [...(version.items || [])].sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0))
  const actifs = items.filter(estActif)
  const archives = items.length - actifs.length
  const titre = `Exercices · ${actifs.length} en jeu${archives > 0 ? ` · ${pluriel(archives, 'archivé', 'archivés')}` : ''}`

  return (
    <div className="form-section">
      <div className="form-section-title">{titre}</div>
      <p className="aca-mention" style={{ marginTop: 0 }}>
        Une session tire douze exercices, mélange les choix et corrige tout de suite. Une bonne réponse monte la force de l’exercice, une erreur la ramène au début.
      </p>
      {items.length === 0 && !nouveau && (
        <div className="form-hint">Aucun exercice. Un deck publié en compte au moins {EXERCICES_MINIMUM}.</div>
      )}
      <ol className="aca-exos">
        {items.map((it, i) => (
          <LigneExercice key={it.id} version={version} item={it} numero={i + 1} lectureSeule={lectureSeule}
            ouvert={ouvert === it.id} onOuvrir={setOuvert} onApercu={onApercu} onRecharger={onRecharger} />
        ))}
      </ol>
      {nouveau && (
        <div className="aca-exo aca-exo-ouvert aca-exo-nouveau">
          <div className="aca-exo-tete">
            <span className="aca-exo-numero">{items.length + 1}</span>
            <span className="badge badge-normal">{libelleType(nouveau)}</span>
            <span className="aca-exo-meta">Nouvel exercice</span>
          </div>
          <FormulaireExercice key={`nouveau-${nouveau}`} version={version} item={{ type: nouveau }} lectureSeule={lectureSeule}
            onRecharger={onRecharger} onFermer={() => setNouveau(null)} />
        </div>
      )}
      {!lectureSeule && (
        <div className="aca-pied aca-nouvel-exo">
          <label className="form-label" htmlFor="aca-nouvel-exo-type">Type</label>
          <select id="aca-nouvel-exo-type" className="form-select" value={typeChoisi} onChange={(e) => setTypeChoisi(e.target.value)} disabled={!!nouveau}>
            {TYPES_ITEM.map((t) => <option key={t} value={t}>{libelleType(t)}</option>)}
          </select>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setNouveau(typeChoisi)} disabled={!!nouveau}>
            Nouvel exercice
          </button>
        </div>
      )}
    </div>
  )
}

// ─── La publication ────────────────────────────────────────────────────────

function FormulairePublication({ version, onRecharger }) {
  const [reluPar, setReluPar] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [imposer, setImposer] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)
  const pret = reluPar.trim().length > 0 && !enCours
  const actifs = (version.items || []).filter(estActif)
  const sansCorrige = actifs.filter((it) => it.type !== 'carte' && (!it.corrige || Object.keys(it.corrige).length === 0)).length
  const memo = String(version.memo_md || '').trim().length > 0

  async function publier() {
    if (!pret) return
    const ok = await confirmDialog({
      title: `Publier la version ${version.numero} de « ${version.titre} » ?`,
      message: 'Une version publiée ne se modifie plus. Si une version est déjà en ligne, elle passe en archive et les collaborateurs voient celle ci.',
      confirmLabel: 'Publier',
    })
    if (!ok) return
    setEnCours(true)
    setErreur(null)
    try {
      const resultat = await publierVersion(version.id, { reluPar, commentaire, imposer })
      const nouvelles = Number(resultat?.nouvelles_affectations) || 0
      toast.success(nouvelles > 0 ? `Version publiée, ${pluriel(nouvelles, 'affectation renouvelée', 'affectations renouvelées')}` : 'Version publiée')
      onRecharger?.()
    } catch (e) {
      // Le message de la base dit ce qui manque (« Il faut au moins 12
      // exercices… ») : il s’affiche tel quel, sans reformulation.
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="form-section">
      <div className="form-section-title">Publier</div>
      <p className="aca-mention" style={{ marginTop: 0 }}>
        La publication enregistre qui a relu et quand. Elle demande au moins {EXERCICES_MINIMUM} exercices avec corrigé, un mémo conseillé.
      </p>
      <ul className="aca-preparation">
        <li className={actifs.length >= EXERCICES_MINIMUM && sansCorrige === 0 ? 'aca-ok' : 'aca-manque'}>
          {pluriel(actifs.length, 'exercice en jeu', 'exercices en jeu')}{sansCorrige > 0 ? `, ${pluriel(sansCorrige, 'sans corrigé', 'sans corrigé')}` : ''}
        </li>
        <li className={memo ? 'aca-ok' : 'aca-conseil'}>{memo ? 'Mémo présent' : 'Pas de mémo : conseillé avant de publier'}</li>
      </ul>
      {erreur && <div className="notice notice-error" role="alert">{erreur}</div>}
      <div className="aca-grille-2">
        <div className="form-group">
          <label className="form-label" htmlFor="aca-publier-relu">Relu par (obligatoire)</label>
          <input id="aca-publier-relu" className="form-input" value={reluPar} onChange={(e) => setReluPar(e.target.value)}
            placeholder="Le nom de la personne qui a relu le contenu" disabled={enCours} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="aca-publier-commentaire">Commentaire</label>
          <input id="aca-publier-commentaire" className="form-input" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} disabled={enCours} />
        </div>
      </div>
      <label className="aca-case" htmlFor="aca-publier-imposer">
        <input id="aca-publier-imposer" type="checkbox" checked={imposer} onChange={(e) => setImposer(e.target.checked)} disabled={enCours} />
        Imposer une nouvelle formation aux collaborateurs déjà affectés (la validation antérieure est conservée)
      </label>
      <div className="aca-pied">
        <button type="button" className="btn btn-primary" onClick={publier} disabled={!pret}>
          {enCours ? 'Publication…' : 'Publier cette version'}
        </button>
      </div>
    </div>
  )
}

// ─── L’aperçu : un exercice joué comme en session ──────────────────────────

// Le titre du bandeau : une carte se juge, elle n’a pas de bonne réponse.
const titreBandeau = (type, correcte) => {
  if (type === 'carte') return correcte ? '✓ Carte sue' : '✕ Carte à revoir'
  return correcte ? '✓ Bonne réponse' : '✕ Mauvaise réponse'
}

/**
 * Joue un exercice avec le composant de la session. Les choix sont présentés
 * tels quels (aucun mélange) : la bonne réponse de l’aperçu se lit donc
 * directement dans le corrigé. Rien ne part au serveur. Exporté pour se
 * tester à sec avec les huit composants.
 */
export function JoueurApercu({ item }) {
  const [valeur, setValeur] = useState(() => reponseVide(item.type))
  const [resultat, setResultat] = useState(null)
  const Composant = COMPOSANTS_EXERCICE[item.type]
  const payload = item.payload || {}
  const complete = reponseComplete(item.type, valeur, payload)

  function verifier() {
    const bonne = bonneReponseApercu(item.type, item.corrige)
    setResultat({ correcte: estBonneReponse(item.type, valeur, bonne), bonne_reponse: bonne, explication: item.explication || '' })
  }
  function recommencer() {
    setValeur(reponseVide(item.type))
    setResultat(null)
  }

  if (!Composant) return <div className="notice notice-error" role="alert">Type d’exercice inconnu : {item.type}</div>
  const enClair = resultat ? rendreBonneReponse(item.type, payload, resultat.bonne_reponse) : ''

  return (
    <div className="aca-joueur">
      <Composant payload={payload} valeur={valeur} onChange={setValeur} verrouille={!!resultat} resultat={resultat} />
      {resultat && (
        <div className={`aca-bandeau ${resultat.correcte ? 'aca-bandeau-ok' : 'aca-bandeau-ko'}`} role="status" aria-live="polite">
          <div className="aca-bandeau-titre">{titreBandeau(item.type, resultat.correcte)}</div>
          {!resultat.correcte && enClair && <div className="aca-bandeau-bonne">Bonne réponse : {enClair.split('\n').map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>)}</div>}
          {resultat.explication && <div className="aca-bandeau-explication">{resultat.explication}</div>}
        </div>
      )}
      <div className="aca-pied">
        {resultat
          ? <button type="button" className="btn btn-outline btn-sm" onClick={recommencer}>Recommencer</button>
          : <button type="button" className="btn btn-primary btn-sm" onClick={verifier} disabled={!complete}>Vérifier</button>}
      </div>
    </div>
  )
}

function ApercuExercice({ version, itemInitial, onFermer }) {
  // Les exercices en jeu d’abord, puis les archivés (on peut les rejouer
  // avant de les restaurer) ; sans choix initial, le premier en jeu.
  const items = [...(version.items || [])].sort((a, b) => Number(estActif(b)) - Number(estActif(a)) || (Number(a.ordre) || 0) - (Number(b.ordre) || 0))
  const [itemId, setItemId] = useState(itemInitial?.id || items[0]?.id || null)
  const item = items.find((it) => it.id === itemId) || null

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="modal-box aca-modale-large" role="dialog" aria-modal="true" aria-labelledby="aca-apercu-titre">
        <div className="modal-head">
          <div>
            <div className="modal-title" id="aca-apercu-titre">Prévisualiser comme un collaborateur</div>
            <div className="modal-subtitle">Un exercice joué comme en session, choix dans l’ordre saisi (la session les mélange). Rien n’est enregistré.</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Fermer" onClick={onFermer}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="aca-apercu-exo">Exercice</label>
            <select id="aca-apercu-exo" className="form-select" value={itemId || ''} onChange={(e) => setItemId(e.target.value)}>
              {items.map((it, i) => (
                <option key={it.id} value={it.id}>{i + 1}. {libelleType(it.type)} · {enonceCourt(it, 70)}{estActif(it) ? '' : ' (archivé)'}</option>
              ))}
            </select>
          </div>
          {item
            ? <JoueurApercu key={item.id} item={item} />
            : <div className="aca-apercu-vide">Aucun exercice en jeu à prévisualiser.</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-outline" onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

// ─── La vue ────────────────────────────────────────────────────────────────

export function EditeurVersionVue({ version, onNaviguer, onRecharger }) {
  const [apercu, setApercu] = useState(null) // null : fermé ; { item } : ouvert (item null = le premier)
  const lectureSeule = version.statut !== 'brouillon'
  const statut = STATUTS_VERSION[version.statut] || STATUTS_VERSION.brouillon
  const actifs = (version.items || []).filter(estActif)

  const sousTitre = [
    `Version ${version.numero} · ${statut.libelle.toLowerCase()}`,
    pluriel(actifs.length, 'exercice', 'exercices'),
    String(version.memo_md || '').trim() ? 'mémo présent' : 'sans mémo',
    version.relu_par ? `relu par ${version.relu_par}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="aca">
      <div className="aca-entete-retour">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/administration')}>
          Retour à l’administration
        </button>
      </div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Formation · administration</div>
          <div className="section-title">{version.titre}</div>
          <div className="section-sub aca-entete-etat">
            <BadgeStatutVersion statut={version.statut} />
            <span>{sousTitre}</span>
          </div>
        </div>
        <div className="aca-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setApercu({ item: null })} disabled={actifs.length === 0}>
            Prévisualiser comme un collaborateur
          </button>
        </div>
      </div>

      {lectureSeule && (
        <div className="notice notice-info" style={{ marginBottom: 18 }}>
          Version publiée : lecture seule. Créez un nouveau brouillon pour modifier.
        </div>
      )}

      <FormulaireVersion key={version.id} version={version} lectureSeule={lectureSeule} onRecharger={onRecharger} />

      <ListeExercices version={version} lectureSeule={lectureSeule} onRecharger={onRecharger} onApercu={(item) => setApercu({ item })} />

      {lectureSeule ? (
        <div className="form-section">
          <div className="form-section-title">Publication</div>
          <div className="aca-mention" style={{ marginTop: 0 }}>
            {version.statut === 'publie' ? 'Publiée' : 'Archivée'}
            {version.publie_le ? ` · en ligne depuis le ${dateHeureParis(version.publie_le)}` : ''}
            {version.relu_par ? ` · relue par ${version.relu_par}` : ''}
            {version.relu_le ? ` le ${dateHeureParis(version.relu_le)}` : ''}
            {version.commentaire_relecture ? ` · « ${version.commentaire_relecture} »` : ''}
          </div>
        </div>
      ) : (
        <FormulairePublication key={version.id} version={version} onRecharger={onRecharger} />
      )}

      {apercu && <ApercuExercice version={version} itemInitial={apercu.item} onFermer={() => setApercu(null)} />}
    </div>
  )
}

// ─── Le conteneur ──────────────────────────────────────────────────────────

export default function EditeurVersion({ versionId, onNaviguer }) {
  const [version, setVersion] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let vivant = true
    versionAdmin(versionId)
      .then((v) => { if (vivant) { setVersion(v); setErreur(null) } })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [versionId, generation])

  if (erreur) {
    return (
      <div className="aca">
        <div className="aca-entete-retour">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/administration')}>Retour à l’administration</button>
        </div>
        <div className="notice notice-error" role="alert">{erreur}</div>
      </div>
    )
  }
  if (!version) return <SkeletonTable rows={8} cols={2} />
  return <EditeurVersionVue version={version} onNaviguer={onNaviguer} onRecharger={() => setGeneration((g) => g + 1)} />
}
