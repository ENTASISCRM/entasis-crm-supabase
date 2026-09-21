// ═══════════════════════════════════════════════════════════════════════════
// ÉDITEUR DE VERSION : le contenu d un module, côté administration
//
// Une version est la seule chose qui s écrit dans l Academy. Un brouillon se
// modifie champ par champ (la fiche du module, chaque leçon, chaque
// question) ; une version publiée ne se modifie plus, l écran la montre en
// lecture seule et renvoie vers « Nouveau brouillon ». La publication est un
// geste séparé qui enregistre le nom du relecteur : c est la base qui refuse
// (au moins cinq questions, une leçon, un corrigé par question), et son
// message s affiche tel quel.
//
// Les corrigés arrivent ici parce que academy_version_admin les rend à
// l administrateur seul ; ils ne sortent jamais vers un collaborateur, et
// l aperçu collaborateur ne les marque pas.
//
// Conteneur (chargement) et vue (tout par props) sont séparés : la vue se
// teste en renderToStaticMarkup.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { messageErreur } from '../../lib/ui-shared'
import { dateHeureParis, pourcentage, THEMES, NIVEAUX, libelleTheme, libelleNiveau } from '../../lib/academy/format'
import {
  versionAdmin, enregistrerVersion, enregistrerLecon, enregistrerQuestion, publierVersion,
} from '../../services/academy'
import { confirmDialog } from '../ui/confirm'
import FormSection from '../ui/FormSection'
import RenduMarkdown from '../ui/RenduMarkdown'
import { SkeletonTable } from '../ui/Skeleton'
import './academy-admin.css'

// ─── Référentiels partagés avec l écran Administration ─────────────────────
// Un fichier de composant n exporte que des composants (Fast Refresh) : ces
// listes sont rendues par les petits composants exportés plus bas.

const STATUTS_VERSION = {
  brouillon: { libelle: 'Brouillon', classe: 'badge badge-normal' },
  publie: { libelle: 'Publié', classe: 'badge badge-signed' },
  archive: { libelle: 'Archivé', classe: 'badge badge-cancelled' },
}
const TYPES_QUESTION = [
  { cle: 'qcm', libelle: 'QCM' },
  { cle: 'vrai_faux', libelle: 'Vrai ou faux' },
  { cle: 'cas_court', libelle: 'Cas court' },
]
const DIFFICULTES = [
  { cle: 1, libelle: '1 · facile' },
  { cle: 2, libelle: '2 · moyenne' },
  { cle: 3, libelle: '3 · difficile' },
]

// Sous ce nombre de réponses, un taux ne dit rien de la formulation.
const REPONSES_MINIMUM = 8
const TAUX_A_REVOIR = 40

const libelleDe = (liste, cle) => liste.find((e) => e.cle === cle)?.libelle || cle || ''
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const lignes = (texte) => String(texte || '').split('\n').map((l) => l.trim()).filter(Boolean)
const texteLignes = (liste) => (Array.isArray(liste) ? liste : []).map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')

// Les sources se saisissent une par ligne : « titre | url | émetteur | date ».
// Les champs que la ligne ne porte pas (date de validité, ce qu elle établit)
// sont repris de la source d origine qui a la même adresse, pour ne pas les
// perdre en retouchant un titre.
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

const nombreEntier = (v, defaut) => {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : defaut
}

// Vérifie la liste des choix d une question : deux à quatre, une bonne
// réponse dans la liste. Rend le message d erreur, ou null si tout va bien.
function erreurChoix(choix, bonne) {
  if (choix.length < 2 || choix.length > 4) return 'Une question a de 2 à 4 choix, un par ligne'
  if (!(bonne >= 0 && bonne < choix.length)) return 'Choisissez la bonne réponse parmi les choix'
  return null
}

// ─── Petits composants partagés ────────────────────────────────────────────

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

// La zone de saisie markdown et son aperçu rendu, côte à côte quand l écran
// est assez large.
function EditeurMarkdown({ id, label, value, onChange, disabled, rows = 12, hint }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <div className="aca-editeur">
        <textarea id={id} className="form-textarea" rows={rows} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} />
        <div className="aca-apercu">
          <div className="aca-apercu-titre">Aperçu</div>
          {String(value || '').trim()
            ? <RenduMarkdown markdown={value} />
            : <div className="aca-apercu-vide">Rien à afficher pour l instant.</div>}
        </div>
      </div>
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  )
}

// La ligne « Enregistré à 10h42 » sous un bouton, annoncée aux lecteurs d écran.
const HEURE_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false })
function StatutEnregistrement({ quand }) {
  return (
    <span className="aca-statut" role="status" aria-live="polite">
      {quand ? `Enregistré à ${HEURE_PARIS.format(quand).replace(':', 'h')}` : ''}
    </span>
  )
}

// ─── La fiche de la version ────────────────────────────────────────────────

const etatVersion = (v) => ({
  titre: v.titre || '',
  objectif: v.objectif || '',
  competence: v.competence || '',
  duree_minutes: String(v.duree_minutes ?? 15),
  seuil_reussite: String(v.seuil_reussite ?? 0.8),
  prerequis: (Array.isArray(v.prerequis) ? v.prerequis : []).join(', '),
  theme: v.theme || 'methode',
  niveau: v.niveau || 'fondamentaux',
  cas_titre: v.cas_pratique?.titre || '',
  cas_situation: v.cas_pratique?.situation_markdown || '',
  cas_questions: texteLignes(v.cas_pratique?.questions),
  cas_corrige: v.cas_pratique?.corrige_markdown || '',
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
        duree_minutes: Math.max(1, nombreEntier(f.duree_minutes, 15)),
        seuil_reussite: seuil,
        prerequis: String(f.prerequis).split(',').map((s) => s.trim()).filter(Boolean),
        theme: f.theme,
        niveau: f.niveau,
        cas_pratique: {
          ...(version.cas_pratique && typeof version.cas_pratique === 'object' ? version.cas_pratique : {}),
          titre: f.cas_titre, situation_markdown: f.cas_situation,
          questions: lignes(f.cas_questions), corrige_markdown: f.cas_corrige,
        },
        a_completer: lignes(f.a_completer),
        sources: sourcesDepuisTexte(f.sources, version.sources),
        fictif: !!f.fictif,
      })
      toast.success('Version enregistrée')
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
      <div className="form-section-title">La fiche du module</div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('titre')}>Titre</label>
        <input id={id('titre')} className="form-input" value={f.titre} disabled={lectureSeule} onChange={(e) => poser({ titre: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('objectif')}>Objectif</label>
        <textarea id={id('objectif')} className="form-textarea" rows={3} value={f.objectif} disabled={lectureSeule}
          onChange={(e) => poser({ objectif: e.target.value })} placeholder="À l issue du module, le conseiller…" />
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

      <div className="form-section-title" style={{ marginTop: 22 }}>Le cas pratique</div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('cas-titre')}>Titre du cas</label>
        <input id={id('cas-titre')} className="form-input" value={f.cas_titre} disabled={lectureSeule} onChange={(e) => poser({ cas_titre: e.target.value })} />
      </div>
      <EditeurMarkdown id={id('cas-situation')} label="Situation (markdown)" value={f.cas_situation} disabled={lectureSeule} rows={10}
        onChange={(v) => poser({ cas_situation: v })} hint="Un cas fictif se dit fictif dès la première ligne." />
      <div className="form-group">
        <label className="form-label" htmlFor={id('cas-questions')}>Questions de réflexion</label>
        <textarea id={id('cas-questions')} className="form-textarea" rows={4} value={f.cas_questions} disabled={lectureSeule}
          onChange={(e) => poser({ cas_questions: e.target.value })} />
        <div className="form-hint">Une question par ligne.</div>
      </div>
      <EditeurMarkdown id={id('cas-corrige')} label="Corrigé (markdown)" value={f.cas_corrige} disabled={lectureSeule} rows={10}
        onChange={(v) => poser({ cas_corrige: v })} />

      <div className="form-section-title" style={{ marginTop: 22 }}>Ce que le cabinet complète</div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('a-completer')}>À compléter par le cabinet</label>
        <textarea id={id('a-completer')} className="form-textarea" rows={4} value={f.a_completer} disabled={lectureSeule}
          onChange={(e) => poser({ a_completer: e.target.value })} />
        <div className="form-hint">Un élément par ligne : les procédures internes que le contenu ne peut pas connaître.</div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('sources')}>Sources</label>
        <textarea id={id('sources')} className="form-textarea" rows={4} value={f.sources} disabled={lectureSeule}
          onChange={(e) => poser({ sources: e.target.value })} placeholder="Titre | https://… | Émetteur | 2026-09-21" />
        <div className="form-hint">Une source par ligne : titre | url | émetteur | date de consultation.</div>
      </div>
      <label className="aca-case" htmlFor={id('fictif')}>
        <input id={id('fictif')} type="checkbox" checked={f.fictif} disabled={lectureSeule} onChange={(e) => poser({ fictif: e.target.checked })} />
        Contenu fictif de démonstration
      </label>

      <div className="aca-pied">
        <button type="button" className="btn btn-primary" onClick={enregistrer} disabled={lectureSeule || enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer la version'}
        </button>
        <StatutEnregistrement quand={enregistreLe} />
      </div>
    </div>
  )
}

// ─── Les leçons ────────────────────────────────────────────────────────────

const etatLecon = (l) => ({
  titre: l.titre || '',
  objectif: l.objectif || '',
  duree_minutes: String(l.duree_minutes ?? 4),
  contenu_md: l.contenu_md || '',
  mq_enonce: l.mini_question?.enonce || '',
  mq_choix: texteLignes(l.mini_question?.choix),
  mq_bonne: String(l.mini_question?.bonne_reponse ?? 0),
  mq_explication: l.mini_question?.explication || '',
  sources: sourcesEnTexte(l.sources),
})

function FormulaireLecon({ version, lecon, lectureSeule, onRecharger, onAbandonner }) {
  const [f, setF] = useState(() => etatLecon(lecon))
  const [enCours, setEnCours] = useState(false)
  const [enregistreLe, setEnregistreLe] = useState(null)
  const nouvelle = !lecon.id
  const poser = (patch) => setF((prev) => ({ ...prev, ...patch }))
  const id = (c) => `aca-lecon-${lecon.id || 'nouvelle'}-${c}`
  const choix = lignes(f.mq_choix)

  async function enregistrer() {
    if (enCours) return
    if (!f.titre.trim()) { toast.error('Le titre de la leçon est obligatoire'); return }
    const bonne = nombreEntier(f.mq_bonne, 0)
    if (f.mq_enonce.trim()) {
      const probleme = erreurChoix(choix, bonne)
      if (probleme) { toast.error(probleme); return }
    }
    setEnCours(true)
    try {
      await enregistrerLecon(version.id, lecon.id || null, {
        titre: f.titre.trim(),
        objectif: f.objectif,
        duree_minutes: Math.max(1, nombreEntier(f.duree_minutes, 4)),
        contenu_md: f.contenu_md,
        mini_question: f.mq_enonce.trim()
          ? { enonce: f.mq_enonce.trim(), choix, bonne_reponse: bonne, explication: f.mq_explication }
          : {},
        sources: sourcesDepuisTexte(f.sources, lecon.sources),
      })
      toast.success('Leçon enregistrée')
      setEnregistreLe(new Date())
      if (nouvelle) onAbandonner?.()
      onRecharger?.()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  const titreSection = nouvelle ? 'Nouvelle leçon' : `Leçon ${lecon.ordre} · ${f.titre || 'sans titre'}`

  // La première leçon s ouvre d elle même, les suivantes se déplient à la
  // demande : trois éditeurs markdown d un coup font une page de dix écrans.
  return (
    <FormSection title={titreSection} hint={f.objectif} defaultOpen={nouvelle || Number(lecon.ordre) === 1}>
      <div className="aca-grille-2">
        <div className="form-group">
          <label className="form-label" htmlFor={id('titre')}>Titre</label>
          <input id={id('titre')} className="form-input" value={f.titre} disabled={lectureSeule} onChange={(e) => poser({ titre: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('duree')}>Durée (minutes)</label>
          <input id={id('duree')} className="form-input" type="number" min={1} value={f.duree_minutes} disabled={lectureSeule} onChange={(e) => poser({ duree_minutes: e.target.value })} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('objectif')}>Objectif</label>
        <input id={id('objectif')} className="form-input" value={f.objectif} disabled={lectureSeule} onChange={(e) => poser({ objectif: e.target.value })}
          placeholder="Ce que le collaborateur sait faire à la fin de la leçon" />
      </div>
      <EditeurMarkdown id={id('contenu')} label="Contenu (markdown)" value={f.contenu_md} disabled={lectureSeule} rows={16}
        onChange={(v) => poser({ contenu_md: v })} />

      <div className="form-section-title" style={{ marginTop: 8 }}>La mini question de fin de leçon</div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('mq-enonce')}>Énoncé</label>
        <input id={id('mq-enonce')} className="form-input" value={f.mq_enonce} disabled={lectureSeule} onChange={(e) => poser({ mq_enonce: e.target.value })} />
      </div>
      <div className="aca-grille-2">
        <div className="form-group">
          <label className="form-label" htmlFor={id('mq-choix')}>Choix</label>
          <textarea id={id('mq-choix')} className="form-textarea" rows={4} value={f.mq_choix} disabled={lectureSeule} onChange={(e) => poser({ mq_choix: e.target.value })} />
          <div className="form-hint">De 2 à 4 choix, un par ligne.</div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('mq-bonne')}>Bonne réponse</label>
          <select id={id('mq-bonne')} className="form-select" value={f.mq_bonne} disabled={lectureSeule} onChange={(e) => poser({ mq_bonne: e.target.value })}>
            {choix.length === 0 && <option value="0">Saisissez d abord les choix</option>}
            {choix.map((c, i) => <option key={i} value={String(i)}>{i + 1}. {c}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('mq-explication')}>Explication</label>
        <textarea id={id('mq-explication')} className="form-textarea" rows={3} value={f.mq_explication} disabled={lectureSeule} onChange={(e) => poser({ mq_explication: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('sources')}>Sources</label>
        <textarea id={id('sources')} className="form-textarea" rows={3} value={f.sources} disabled={lectureSeule} onChange={(e) => poser({ sources: e.target.value })}
          placeholder="Titre | https://… | Émetteur | 2026-09-21" />
        <div className="form-hint">Une source par ligne : titre | url | émetteur | date de consultation.</div>
      </div>
      <div className="aca-pied">
        <button type="button" className="btn btn-primary btn-sm" onClick={enregistrer} disabled={lectureSeule || enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer la leçon'}
        </button>
        {nouvelle && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onAbandonner} disabled={enCours}>Abandonner</button>
        )}
        <StatutEnregistrement quand={enregistreLe} />
      </div>
    </FormSection>
  )
}

// ─── Les questions ─────────────────────────────────────────────────────────

const etatQuestion = (q) => ({
  cle: q.cle || '',
  lecon_id: q.lecon_id || '',
  type: q.type || 'qcm',
  competence: q.competence || '',
  enonce: q.enonce || '',
  choix: texteLignes(q.choix),
  bonne_reponse: String(q.bonne_reponse ?? 0),
  explication: q.explication || '',
  difficulte: String(q.difficulte ?? 2),
})

function FormulaireQuestion({ version, question, lectureSeule, onRecharger, onAbandonner }) {
  const [f, setF] = useState(() => etatQuestion(question))
  const [enCours, setEnCours] = useState(false)
  const [enregistreLe, setEnregistreLe] = useState(null)
  const nouvelle = !question.id
  const archivee = !!question.archive_le
  const poser = (patch) => setF((prev) => ({ ...prev, ...patch }))
  const id = (c) => `aca-question-${question.id || 'nouvelle'}-${c}`
  const choix = lignes(f.choix)
  const stats = question.statistiques || {}
  const reponses = Number(stats.reponses) || 0
  const taux = pourcentage(stats.correctes, reponses)
  const aRevoir = reponses >= REPONSES_MINIMUM && taux < TAUX_A_REVOIR
  const verrou = lectureSeule || archivee

  const changerType = (type) => {
    // Un vrai ou faux n a que deux choix : on les pose si la liste est vide.
    poser(type === 'vrai_faux' && choix.length === 0 ? { type, choix: 'Vrai\nFaux' } : { type })
  }

  async function enregistrer() {
    if (enCours) return
    if (!f.enonce.trim()) { toast.error('L énoncé est obligatoire'); return }
    const bonne = nombreEntier(f.bonne_reponse, 0)
    const probleme = erreurChoix(choix, bonne)
    if (probleme) { toast.error(probleme); return }
    setEnCours(true)
    try {
      await enregistrerQuestion(version.id, question.id || null, {
        cle: f.cle.trim() || undefined,
        lecon_id: f.lecon_id || null,
        type: f.type,
        competence: f.competence.trim(),
        enonce: f.enonce.trim(),
        choix,
        bonne_reponse: bonne,
        explication: f.explication,
        difficulte: nombreEntier(f.difficulte, 2),
      })
      toast.success('Question enregistrée')
      setEnregistreLe(new Date())
      if (nouvelle) onAbandonner?.()
      onRecharger?.()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  async function archiver(archive) {
    if (enCours) return
    if (archive) {
      const ok = await confirmDialog({
        title: `Archiver la question ${question.cle} ?`,
        message: 'Elle ne sera plus tirée dans les quiz. Les réponses déjà données restent dans l historique.',
        confirmLabel: 'Archiver',
        danger: true,
      })
      if (!ok) return
    }
    setEnCours(true)
    try {
      await enregistrerQuestion(version.id, question.id, { archive })
      toast.success(archive ? 'Question archivée' : 'Question restaurée')
      onRecharger?.()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <article className={`aca-question${archivee ? ' aca-question-archivee' : ''}`} aria-label={`Question ${question.cle || 'nouvelle'}`}>
      <div className="aca-question-tete">
        <span className="aca-question-cle">{nouvelle ? 'Nouvelle question' : question.cle}</span>
        <span className="badge badge-normal">{libelleDe(TYPES_QUESTION, f.type)}</span>
        {archivee && <span className="badge badge-cancelled">Archivée</span>}
        {reponses > 0 && (
          <span className="aca-question-stats">{pluriel(reponses, 'réponse', 'réponses')}, {taux} % de bonnes réponses</span>
        )}
        {aRevoir && <span className="badge badge-high" title={`Moins de ${TAUX_A_REVOIR} % de bonnes réponses sur au moins ${REPONSES_MINIMUM} réponses`}>Formulation à revoir</span>}
        {!nouvelle && !lectureSeule && (
          <span className="aca-actions">
            {archivee
              ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => archiver(false)} disabled={enCours}>Restaurer</button>
              : <button type="button" className="btn btn-ghost btn-sm" onClick={() => archiver(true)} disabled={enCours}>Archiver la question</button>}
          </span>
        )}
      </div>
      <div className="aca-grille-3">
        <div className="form-group">
          <label className="form-label" htmlFor={id('cle')}>Clé</label>
          <input id={id('cle')} className="form-input" value={f.cle} disabled={verrou} onChange={(e) => poser({ cle: e.target.value })} placeholder="q11" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('lecon')}>Leçon</label>
          <select id={id('lecon')} className="form-select" value={f.lecon_id} disabled={verrou} onChange={(e) => poser({ lecon_id: e.target.value })}>
            <option value="">Aucune leçon en particulier</option>
            {(version.lecons || []).map((l) => <option key={l.id} value={l.id}>Leçon {l.ordre} · {l.titre}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('type')}>Type</label>
          <select id={id('type')} className="form-select" value={f.type} disabled={verrou} onChange={(e) => changerType(e.target.value)}>
            {TYPES_QUESTION.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('competence')}>Compétence</label>
          <input id={id('competence')} className="form-input" value={f.competence} disabled={verrou} onChange={(e) => poser({ competence: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('difficulte')}>Difficulté</label>
          <select id={id('difficulte')} className="form-select" value={f.difficulte} disabled={verrou} onChange={(e) => poser({ difficulte: e.target.value })}>
            {DIFFICULTES.map((d) => <option key={d.cle} value={String(d.cle)}>{d.libelle}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('enonce')}>Énoncé</label>
        <textarea id={id('enonce')} className="form-textarea" rows={3} value={f.enonce} disabled={verrou} onChange={(e) => poser({ enonce: e.target.value })} />
      </div>
      <div className="aca-grille-2">
        <div className="form-group">
          <label className="form-label" htmlFor={id('choix')}>Choix</label>
          <textarea id={id('choix')} className="form-textarea" rows={4} value={f.choix} disabled={verrou} onChange={(e) => poser({ choix: e.target.value })} />
          <div className="form-hint">De 2 à 4 choix, un par ligne, sans marquer la bonne réponse.</div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={id('bonne')}>Bonne réponse</label>
          <select id={id('bonne')} className="form-select" value={f.bonne_reponse} disabled={verrou} onChange={(e) => poser({ bonne_reponse: e.target.value })}>
            {choix.length === 0 && <option value="0">Saisissez d abord les choix</option>}
            {choix.map((c, i) => <option key={i} value={String(i)}>{i + 1}. {c}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={id('explication')}>Explication</label>
        <textarea id={id('explication')} className="form-textarea" rows={3} value={f.explication} disabled={verrou} onChange={(e) => poser({ explication: e.target.value })}
          placeholder="Ce que le collaborateur lit après avoir répondu, juste ou faux" />
      </div>
      <div className="aca-pied">
        <button type="button" className="btn btn-primary btn-sm" onClick={enregistrer} disabled={verrou || enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer la question'}
        </button>
        {nouvelle && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onAbandonner} disabled={enCours}>Abandonner</button>
        )}
        <StatutEnregistrement quand={enregistreLe} />
      </div>
    </article>
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
      // Le message de la base dit ce qui manque (« Il faut au moins 5
      // questions… ») : il s affiche tel quel, sans reformulation.
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="form-section">
      <div className="form-section-title">Publier</div>
      <p className="aca-mention" style={{ marginTop: 0 }}>
        La publication enregistre qui a relu et quand. Elle demande au moins une leçon, un corrigé par question et
        assez de questions pour un quiz complet.
      </p>
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

// ─── L aperçu collaborateur ────────────────────────────────────────────────

function ApercuCollaborateur({ version, onFermer }) {
  const questions = (version.questions || []).filter((q) => !q.archive_le)
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="modal-box aca-modale-large" role="dialog" aria-modal="true" aria-labelledby="aca-apercu-titre">
        <div className="modal-head">
          <div>
            <div className="modal-title" id="aca-apercu-titre">{version.titre}</div>
            <div className="modal-subtitle">Ce qu un collaborateur verra : les leçons, puis le quiz complet, sans les corrigés.</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Fermer" onClick={onFermer}>✕</button>
        </div>
        <div className="modal-body">
          {version.objectif && <p className="aca-apercu-objectif">{version.objectif}</p>}
          {(version.lecons || []).map((l) => (
            <section key={l.id} className="aca-apercu-lecon">
              <h3>Leçon {l.ordre} · {l.titre}</h3>
              {l.objectif && <p className="aca-apercu-objectif">{l.objectif}</p>}
              <RenduMarkdown markdown={l.contenu_md || ''} />
              {l.mini_question?.enonce && (
                <div className="aca-apercu-question">
                  <div className="aca-apercu-enonce">{l.mini_question.enonce}</div>
                  <ul className="aca-apercu-choix">
                    {(l.mini_question.choix || []).map((c, i) => (
                      <li key={i}><input type="radio" disabled aria-hidden="true" tabIndex={-1} /> {c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
          <section className="aca-apercu-quiz">
            <h3>Quiz · {pluriel(questions.length, 'question', 'questions')}</h3>
            <p className="aca-apercu-objectif">Le quiz tire quelques questions dans cette banque, dans un ordre mélangé.</p>
            {questions.map((q, n) => (
              <div key={q.id || n} className="aca-apercu-question">
                <div className="aca-apercu-enonce">{n + 1}. {q.enonce}</div>
                <ul className="aca-apercu-choix">
                  {(q.choix || []).map((c, i) => (
                    <li key={i}><input type="radio" disabled aria-hidden="true" tabIndex={-1} /> {c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
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
  const [apercu, setApercu] = useState(false)
  const [nouvellesLecons, setNouvellesLecons] = useState([])
  const [nouvellesQuestions, setNouvellesQuestions] = useState([])
  const lectureSeule = version.statut !== 'brouillon'
  const statut = STATUTS_VERSION[version.statut] || STATUTS_VERSION.brouillon
  const lecons = version.lecons || []
  const questions = version.questions || []
  const actives = questions.filter((q) => !q.archive_le)

  const sousTitre = [
    `Version ${version.numero} · ${statut.libelle.toLowerCase()}`,
    version.relu_par ? `relu par ${version.relu_par}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="aca">
      <div className="aca-entete-retour">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/administration')}>
          Retour à l administration
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
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setApercu(true)}>Prévisualiser comme un collaborateur</button>
        </div>
      </div>

      {lectureSeule && (
        <div className="notice notice-info" style={{ marginBottom: 18 }}>
          Version publiée : lecture seule. Créez un nouveau brouillon pour modifier.
        </div>
      )}

      <FormulaireVersion key={version.id} version={version} lectureSeule={lectureSeule} onRecharger={onRecharger} />

      <div className="form-section">
        <div className="form-section-title">Leçons · {lecons.length}</div>
        <div className="aca-lecons">
          {lecons.map((l) => (
            <FormulaireLecon key={l.id} version={version} lecon={l} lectureSeule={lectureSeule} onRecharger={onRecharger} />
          ))}
          {nouvellesLecons.map((cle, i) => (
            <FormulaireLecon key={cle} version={version} lecon={{ id: null, ordre: lecons.length + i + 1 }} lectureSeule={lectureSeule}
              onRecharger={onRecharger} onAbandonner={() => setNouvellesLecons((prev) => prev.filter((c) => c !== cle))} />
          ))}
        </div>
        {lecons.length === 0 && nouvellesLecons.length === 0 && (
          <div className="form-hint">Aucune leçon. Une version publiée en a au moins une.</div>
        )}
        <div className="aca-pied">
          <button type="button" className="btn btn-outline btn-sm" disabled={lectureSeule}
            onClick={() => setNouvellesLecons((prev) => [...prev, `lecon-${Date.now()}-${prev.length}`])}>
            Ajouter une leçon
          </button>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Questions · {actives.length} en banque{questions.length > actives.length ? ` · ${questions.length - actives.length} archivée${questions.length - actives.length > 1 ? 's' : ''}` : ''}</div>
        <div className="aca-questions">
          {questions.map((q) => (
            <FormulaireQuestion key={q.id} version={version} question={q} lectureSeule={lectureSeule} onRecharger={onRecharger} />
          ))}
          {nouvellesQuestions.map((cle) => (
            <FormulaireQuestion key={cle} version={version} question={{ id: null }} lectureSeule={lectureSeule}
              onRecharger={onRecharger} onAbandonner={() => setNouvellesQuestions((prev) => prev.filter((c) => c !== cle))} />
          ))}
        </div>
        {questions.length === 0 && nouvellesQuestions.length === 0 && (
          <div className="form-hint">Aucune question. Le quiz en tire plusieurs à chaque tentative : la banque en compte dix par module dans le catalogue semé.</div>
        )}
        <div className="aca-pied">
          <button type="button" className="btn btn-outline btn-sm" disabled={lectureSeule}
            onClick={() => setNouvellesQuestions((prev) => [...prev, `question-${Date.now()}-${prev.length}`])}>
            Ajouter une question
          </button>
        </div>
      </div>

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

      {apercu && <ApercuCollaborateur version={version} onFermer={() => setApercu(false)} />}
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/administration')}>Retour à l administration</button>
        </div>
        <div className="notice notice-error" role="alert">{erreur}</div>
      </div>
    )
  }
  if (!version) return <SkeletonTable rows={8} cols={2} />
  return <EditeurVersionVue version={version} onNaviguer={onNaviguer} onRecharger={() => setGeneration((g) => g + 1)} />
}
