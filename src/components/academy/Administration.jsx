// ═══════════════════════════════════════════════════════════════════════════
// ADMINISTRATION DE L ACADEMY : modules, parcours, affectations, réglages
//
// L écran de la direction et de l administrateur formation. Il liste les
// modules avec toutes leurs versions (brouillon, publié, archivé), ouvre
// l éditeur d une version, compose les parcours à partir des modules sans les
// dupliquer, affecte un module ou un parcours à des collaborateurs, règle les
// paramètres du cabinet et montre le journal des gestes d administration.
//
// La RLS et les fonctions SQL sont le vrai verrou : cet écran se réserve à
// la direction pour l affichage, la base refuse à tout le monde d autre.
// Aucune donnée de rémunération, aucune donnée client : des contenus de
// formation et des affectations.
//
// Conteneur (chargement de adminVue) et vue (tout par props) sont séparés :
// la vue se teste en renderToStaticMarkup. L éditeur d une version vit dans
// EditeurVersion.jsx et se rend quand la route porte « version ».
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { messageErreur } from '../../lib/ui-shared'
import { STATUTS, classeBadge , modulesPubliesDuParcours, libelleParcoursAffectable } from '../../lib/academy/statuts'
import { jourParis, dateHeureParis } from '../../lib/academy/format'
import {
  adminVue, creerModule, nouvelleVersion, archiverVersion, enregistrerParcours,
  affecter, modifierEcheance, retirerAffectation, enregistrerParametres,
} from '../../services/academy'
import { confirmDialog } from '../ui/confirm'
import SubTabs from '../ui/SubTabs'
import { SkeletonTable } from '../ui/Skeleton'
import EditeurVersion, { BadgeStatutVersion, LibelleTheme, LibelleNiveau, SelectTheme, SelectNiveau } from './EditeurVersion'
import './academy-admin.css'

export { EditeurVersionVue } from './EditeurVersion'

const ONGLETS = [
  { key: 'modules', label: 'Modules' },
  { key: 'parcours', label: 'Parcours' },
  { key: 'affectations', label: 'Affectations' },
  { key: 'parametres', label: 'Paramètres' },
  { key: 'journal', label: 'Journal' },
]

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const lienVersion = (id) => `#/formation/administration/version/${id}`
const estDirection = (profile) => profile?.role === 'manager' || profile?.academy_admin === true
const nombreEntier = (v, defaut) => {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : defaut
}
const detailCourt = (detail) => {
  if (detail == null) return ''
  const texte = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return texte.length > 90 ? `${texte.slice(0, 87)}…` : texte
}

// L en tête d une modale, toujours le même dessin.
function TeteModale({ id, titre, sousTitre, onFermer }) {
  return (
    <div className="modal-head">
      <div>
        <div className="modal-title" id={id}>{titre}</div>
        {sousTitre && <div className="modal-subtitle">{sousTitre}</div>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" aria-label="Fermer" onClick={onFermer}>✕</button>
    </div>
  )
}

// ─── Modules ───────────────────────────────────────────────────────────────

function ModaleNouveauModule({ onFermer, onNaviguer }) {
  const [f, setF] = useState({ slug: '', titre: '', theme: 'methode', niveau: 'fondamentaux' })
  const [enCours, setEnCours] = useState(false)
  const poser = (patch) => setF((prev) => ({ ...prev, ...patch }))
  const pret = f.slug.trim() && f.titre.trim() && !enCours

  async function creer() {
    if (!pret) return
    setEnCours(true)
    try {
      const resultat = await creerModule({ slug: f.slug, titre: f.titre, theme: f.theme, niveau: f.niveau })
      toast.success('Module créé, en brouillon')
      onFermer()
      if (resultat?.version_id) onNaviguer?.(lienVersion(resultat.version_id))
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !enCours) onFermer() }}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="aca-nouveau-module-titre" style={{ width: 'min(100%, 560px)' }}>
        <TeteModale id="aca-nouveau-module-titre" titre="Nouveau module" sousTitre="Il naît en brouillon, version 1, et se publie après relecture." onFermer={onFermer} />
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="aca-nm-titre">Titre</label>
            <input id="aca-nm-titre" className="form-input" value={f.titre} autoFocus disabled={enCours}
              onChange={(e) => poser({ titre: e.target.value })} placeholder="Ex. : Les bases de la prévoyance" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="aca-nm-slug">Identifiant</label>
            <input id="aca-nm-slug" className="form-input" value={f.slug} disabled={enCours}
              onChange={(e) => poser({ slug: e.target.value })} placeholder="bases-prevoyance" />
            <div className="form-hint">Lettres, chiffres et tirets ; il sert dans les liens et les prérequis, il ne change plus ensuite.</div>
          </div>
          <div className="aca-grille-2">
            <div className="form-group">
              <label className="form-label" htmlFor="aca-nm-theme">Thème</label>
              <SelectTheme id="aca-nm-theme" value={f.theme} disabled={enCours} onChange={(theme) => poser({ theme })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="aca-nm-niveau">Niveau</label>
              <SelectNiveau id="aca-nm-niveau" value={f.niveau} disabled={enCours} onChange={(niveau) => poser({ niveau })} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-outline" onClick={onFermer} disabled={enCours}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={creer} disabled={!pret}>{enCours ? 'Création…' : 'Créer le module'}</button>
        </div>
      </div>
    </div>
  )
}

function LigneVersion({ version, moduleId, moduleABrouillon, onNaviguer, onRecharger }) {
  const [enCours, setEnCours] = useState(false)
  const comptes = [
    pluriel(version.nb_lecons || 0, 'leçon', 'leçons'),
    pluriel(version.nb_questions || 0, 'question', 'questions'),
    pluriel(version.affectations || 0, 'affectation', 'affectations'),
    pluriel(version.validations || 0, 'validation', 'validations'),
  ].join(' · ')

  async function brouillon() {
    const ok = await confirmDialog({
      title: 'Créer un nouveau brouillon ?',
      message: 'Un nouveau brouillon copie la version actuelle. La version publiée reste en ligne jusqu à la publication du brouillon.',
      confirmLabel: 'Créer le brouillon',
    })
    if (!ok) return
    setEnCours(true)
    try {
      const id = await nouvelleVersion(moduleId)
      toast.success('Brouillon créé')
      onRecharger?.()
      if (id) onNaviguer?.(lienVersion(id))
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  async function archiver() {
    const ok = await confirmDialog({
      title: `Archiver la version ${version.numero} ?`,
      message: 'Le module disparaît du catalogue des collaborateurs. Les validations et les attestations déjà délivrées restent.',
      confirmLabel: 'Archiver',
      danger: true,
    })
    if (!ok) return
    setEnCours(true)
    try {
      await archiverVersion(version.id)
      toast.success('Version archivée')
      onRecharger?.()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="aca-version">
      <BadgeStatutVersion statut={version.statut} />
      <span className="aca-version-numero">Version {version.numero}</span>
      <span className="aca-version-meta">
        {version.relu_par ? `Relue par ${version.relu_par} · ` : ''}
        {comptes}
        {version.updated_at ? ` · modifiée le ${dateHeureParis(version.updated_at)}` : ''}
      </span>
      <span className="aca-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onNaviguer?.(lienVersion(version.id))}>Ouvrir</button>
        {version.statut !== 'brouillon' && !moduleABrouillon && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={brouillon} disabled={enCours}>Nouveau brouillon</button>
        )}
        {version.statut === 'publie' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={archiver} disabled={enCours}>Archiver</button>
        )}
      </span>
    </div>
  )
}

function OngletModules({ modules, onNaviguer, onRecharger }) {
  const [nouveau, setNouveau] = useState(false)
  return (
    <div>
      <div className="aca-outils">
        <span className="aca-mention" style={{ margin: 0 }}>{pluriel(modules.length, 'module', 'modules')} au catalogue.</span>
        <div className="aca-outils-droite">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setNouveau(true)}>Nouveau module</button>
        </div>
      </div>
      {modules.length === 0 ? (
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucun module</div>
            <div className="empty-sub">Créez un module, ou appliquez la migration du catalogue semé.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Module</th><th>Thème</th><th>Niveau</th><th>Versions</th></tr>
            </thead>
            <tbody>
              {modules.map((m) => {
                const versions = m.versions || []
                const aBrouillon = versions.some((v) => v.statut === 'brouillon')
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="cell-primary">{m.titre}</div>
                      <div className="cell-sub">{m.slug}{m.archive_le ? ' · module archivé' : ''}</div>
                    </td>
                    <td><LibelleTheme theme={m.theme} /></td>
                    <td><LibelleNiveau niveau={m.niveau} /></td>
                    <td>
                      {versions.length === 0 ? (
                        <span className="aca-version-meta">Aucune version</span>
                      ) : (
                        <div className="aca-versions">
                          {versions.map((v) => (
                            <LigneVersion key={v.id} version={v} moduleId={m.id} moduleABrouillon={aBrouillon}
                              onNaviguer={onNaviguer} onRecharger={onRecharger} />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="aca-mention">Les contenus semés sont en brouillon : ils se publient module par module après relecture.</p>
      {nouveau && <ModaleNouveauModule onFermer={() => setNouveau(false)} onNaviguer={onNaviguer} />}
    </div>
  )
}

// ─── Parcours ──────────────────────────────────────────────────────────────

const etatParcours = (p) => ({
  titre: p?.titre || '',
  description: p?.description || '',
  ordre: String(p?.ordre ?? 0),
  modules: (p?.modules || []).map((m) => ({
    module_id: m.module_id, obligatoire: m.obligatoire !== false, delai_jours: m.delai_jours == null ? '' : String(m.delai_jours),
  })),
})

function ModaleParcours({ parcours, modules, onFermer, onRecharger }) {
  const [f, setF] = useState(() => etatParcours(parcours))
  const [enCours, setEnCours] = useState(false)
  const poser = (patch) => setF((prev) => ({ ...prev, ...patch }))
  const nouveau = !parcours?.id
  const titreModale = nouveau ? 'Nouveau parcours' : `Modifier « ${parcours.titre} »`
  const modulesDisponibles = modules.filter((m) => !m.archive_le)
  const majModule = (i, patch) => poser({ modules: f.modules.map((m, j) => (j === i ? { ...m, ...patch } : m)) })
  const deplacer = (i, sens) => {
    const j = i + sens
    if (j < 0 || j >= f.modules.length) return
    const liste = [...f.modules]
    const [element] = liste.splice(i, 1)
    liste.splice(j, 0, element)
    poser({ modules: liste })
  }
  const retirer = (i) => poser({ modules: f.modules.filter((_, j) => j !== i) })
  const ajouter = () => {
    const libre = modulesDisponibles.find((m) => !f.modules.some((x) => x.module_id === m.id))
    poser({ modules: [...f.modules, { module_id: libre?.id || '', obligatoire: true, delai_jours: '' }] })
  }

  async function enregistrer() {
    if (enCours) return
    if (!f.titre.trim()) { toast.error('Le titre du parcours est obligatoire'); return }
    const ids = f.modules.map((m) => m.module_id).filter(Boolean)
    if (ids.length !== f.modules.length) { toast.error('Chaque ligne du parcours doit désigner un module'); return }
    if (new Set(ids).size !== ids.length) { toast.error('Un module ne figure qu une fois dans un parcours'); return }
    setEnCours(true)
    try {
      await enregistrerParcours(parcours?.id || null, {
        titre: f.titre.trim(),
        description: f.description,
        ordre: nombreEntier(f.ordre, 0),
        modules: f.modules.map((m, i) => ({
          module_id: m.module_id, ordre: i + 1, obligatoire: m.obligatoire !== false,
          delai_jours: m.delai_jours === '' ? null : Math.max(1, nombreEntier(m.delai_jours, 1)),
        })),
      })
      toast.success(nouveau ? 'Parcours créé' : 'Parcours enregistré')
      onRecharger?.()
      onFermer()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !enCours) onFermer() }}>
      <div className="modal-box aca-modale-large" role="dialog" aria-modal="true" aria-labelledby="aca-parcours-titre">
        <TeteModale id="aca-parcours-titre" titre={titreModale} sousTitre="Un parcours réutilise les modules, il ne les duplique pas." onFermer={onFermer} />
        <div className="modal-body">
          <div className="aca-grille-2">
            <div className="form-group">
              <label className="form-label" htmlFor="aca-p-titre">Titre</label>
              <input id="aca-p-titre" className="form-input" value={f.titre} autoFocus disabled={enCours} onChange={(e) => poser({ titre: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="aca-p-ordre">Ordre d affichage</label>
              <input id="aca-p-ordre" className="form-input" type="number" min={0} value={f.ordre} disabled={enCours} onChange={(e) => poser({ ordre: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="aca-p-description">Description</label>
            <textarea id="aca-p-description" className="form-textarea" rows={3} value={f.description} disabled={enCours} onChange={(e) => poser({ description: e.target.value })} />
          </div>
          <div className="form-group">
            <span className="form-label">Modules, dans l ordre</span>
            {f.modules.length === 0 && <div className="form-hint">Aucun module pour l instant.</div>}
            <div className="aca-modules-parcours">
              {f.modules.map((m, i) => (
                <div className="aca-module-parcours" key={i}>
                  <span className="aca-module-parcours-ordre">{i + 1}.</span>
                  <select className="form-select" aria-label={`Module ${i + 1}`} value={m.module_id} disabled={enCours}
                    onChange={(e) => majModule(i, { module_id: e.target.value })}>
                    <option value="">Choisir un module</option>
                    {modulesDisponibles.map((x) => <option key={x.id} value={x.id}>{x.titre}</option>)}
                  </select>
                  <label className="aca-case">
                    <input type="checkbox" checked={m.obligatoire} disabled={enCours} onChange={(e) => majModule(i, { obligatoire: e.target.checked })} />
                    Obligatoire
                  </label>
                  <input className="form-input aca-delai" type="number" min={1} placeholder="Délai (j)" aria-label={`Délai en jours du module ${i + 1}`}
                    value={m.delai_jours} disabled={enCours} onChange={(e) => majModule(i, { delai_jours: e.target.value })} />
                  <span className="aca-actions">
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Monter le module ${i + 1}`} onClick={() => deplacer(i, -1)} disabled={enCours || i === 0}>Monter</button>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Descendre le module ${i + 1}`} onClick={() => deplacer(i, 1)} disabled={enCours || i === f.modules.length - 1}>Descendre</button>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Retirer le module ${i + 1}`} onClick={() => retirer(i)} disabled={enCours}>Retirer</button>
                  </span>
                </div>
              ))}
            </div>
            <div className="form-hint">Le délai en jours pose l échéance à l affectation quand aucune date n est donnée.</div>
            <div>
              <button type="button" className="btn btn-outline btn-sm" onClick={ajouter} disabled={enCours || modulesDisponibles.length === 0}>Ajouter un module</button>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-outline" onClick={onFermer} disabled={enCours}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={enregistrer} disabled={enCours || !f.titre.trim()}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

function OngletParcours({ parcours, modules, onRecharger }) {
  const [edition, setEdition] = useState(null) // null : fermé ; {} : nouveau ; un parcours : modification
  return (
    <div>
      <div className="aca-outils">
        <span className="aca-mention" style={{ margin: 0 }}>Un parcours réutilise les modules, il ne les duplique pas.</span>
        <div className="aca-outils-droite">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdition({})}>Nouveau parcours</button>
        </div>
      </div>
      {parcours.length === 0 ? (
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucun parcours</div>
            <div className="empty-sub">Composez un premier parcours à partir des modules publiés.</div>
          </div>
        </div>
      ) : (
        <div className="aca-parcours">
          {parcours.map((p) => (
            <article key={p.id} className="aca-parcours-carte">
              <div className="aca-parcours-tete">
                <div>
                  <div className="aca-parcours-titre">{p.titre}{p.archive_le ? ' · archivé' : ''}</div>
                  {p.description && <div className="aca-parcours-desc">{p.description}</div>}
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setEdition(p)}>Modifier</button>
              </div>
              <div className="aca-etapes">
                {(p.modules || []).length === 0 && <span className="aca-mention" style={{ margin: 0 }}>Aucun module.</span>}
                {(p.modules || []).map((m) => (
                  <span key={m.module_id} className="aca-etape">
                    <b>{m.ordre}.</b> {m.titre}{m.obligatoire ? '' : ' · facultatif'}{m.delai_jours ? ` · J+${m.delai_jours}` : ''}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      {edition && <ModaleParcours parcours={edition.id ? edition : null} modules={modules} onFermer={() => setEdition(null)} onRecharger={onRecharger} />}
    </div>
  )
}

// ─── Affectations ──────────────────────────────────────────────────────────

function FormulaireAffectation({ collaborateurs, modules, parcours, onRecharger }) {
  const [choisis, setChoisis] = useState([])
  const [cible, setCible] = useState({ parcoursId: '', moduleId: '' })
  const [echeance, setEcheance] = useState('')
  const [obligatoire, setObligatoire] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const modulesPubliables = modules.filter((m) => !m.archive_le)
  const aVersionPubliee = (m) => (m.versions || []).some((v) => v.statut === 'publie')
  const tous = choisis.length === collaborateurs.length && collaborateurs.length > 0
  // Un parcours sans module publie ne donnerait aucune affectation : on le
  // dit dans le selecteur et on bloque le bouton.
  const parcoursChoisi = parcours.find((p) => p.id === cible.parcoursId)
  const parcoursAffectable = !parcoursChoisi || modulesPubliesDuParcours(parcoursChoisi, modules).publies > 0
  const pret = choisis.length > 0 && (cible.parcoursId || cible.moduleId) && parcoursAffectable && !enCours

  const basculer = (id) => setChoisis((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const toutSelectionner = () => setChoisis(tous ? [] : collaborateurs.map((c) => c.id))

  async function lancer() {
    if (!pret) return
    const quoi = cible.parcoursId
      ? `le parcours « ${parcours.find((p) => p.id === cible.parcoursId)?.titre || ''} »`
      : `le module « ${modules.find((m) => m.id === cible.moduleId)?.titre || ''} »`
    const ok = await confirmDialog({
      title: `Affecter ${quoi} ?`,
      message: `${pluriel(choisis.length, 'collaborateur', 'collaborateurs')}${echeance ? `, échéance le ${jourParis(echeance)}` : ', sans échéance'}${obligatoire ? ', obligatoire' : ', facultatif'}. Une affectation déjà existante n est pas doublée.`,
      confirmLabel: 'Affecter',
    })
    if (!ok) return
    setEnCours(true)
    try {
      const n = await affecter({
        profileIds: choisis, moduleId: cible.moduleId || null, parcoursId: cible.parcoursId || null,
        echeance: echeance || null, obligatoire,
      })
      if (Number(n) > 0) toast.success(`${pluriel(Number(n), 'affectation créée', 'affectations créées')}`)
      else toast('Aucune affectation créée : ces collaborateurs l avaient déjà', { icon: 'ℹ' })
      setChoisis([])
      onRecharger?.()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="form-section">
      <div className="form-section-title">Nouvelle affectation</div>
      <div className="form-group">
        <div className="aca-outils" style={{ margin: 0 }}>
          <span className="form-label">Collaborateurs · {pluriel(choisis.length, 'sélectionné', 'sélectionnés')}</span>
          <div className="aca-outils-droite">
            <button type="button" className="btn btn-ghost btn-sm" onClick={toutSelectionner} disabled={collaborateurs.length === 0}>
              {tous ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>
        </div>
        {collaborateurs.length === 0 && <div className="form-hint">Aucun collaborateur actif.</div>}
        <div className="aca-cases">
          {collaborateurs.map((c) => (
            <label key={c.id} className="aca-case" htmlFor={`aca-aff-${c.id}`}>
              <input id={`aca-aff-${c.id}`} type="checkbox" checked={choisis.includes(c.id)} onChange={() => basculer(c.id)} disabled={enCours} />
              <span>{c.full_name || c.advisor_code}</span>
              {c.advisor_code && <span className="aca-case-code">{c.advisor_code}</span>}
            </label>
          ))}
        </div>
      </div>
      <div className="aca-grille-2">
        <div className="form-group">
          <label className="form-label" htmlFor="aca-aff-parcours">Parcours</label>
          <select id="aca-aff-parcours" className="form-select" value={cible.parcoursId} disabled={enCours}
            onChange={(e) => setCible({ parcoursId: e.target.value, moduleId: '' })}>
            <option value="">Aucun parcours</option>
            {parcours.filter((p) => !p.archive_le).map((p) => (
              <option key={p.id} value={p.id} disabled={modulesPubliesDuParcours(p, modules).publies === 0}>{libelleParcoursAffectable(p, modules)}</option>
            ))}
          </select>
          {parcoursChoisi && !parcoursAffectable && <div className="form-hint">Publiez au moins un module de ce parcours avant de l affecter.</div>}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="aca-aff-module">Ou un module seul</label>
          <select id="aca-aff-module" className="form-select" value={cible.moduleId} disabled={enCours}
            onChange={(e) => setCible({ parcoursId: '', moduleId: e.target.value })}>
            <option value="">Aucun module</option>
            {modulesPubliables.map((m) => (
              <option key={m.id} value={m.id} disabled={!aVersionPubliee(m)}>
                {m.titre}{aVersionPubliee(m) ? '' : ' (aucune version publiée)'}
              </option>
            ))}
          </select>
          <div className="form-hint">Un parcours ou un module, pas les deux. Seule une version publiée s affecte.</div>
        </div>
      </div>
      <div className="aca-grille-2">
        <div className="form-group">
          <label className="form-label" htmlFor="aca-aff-echeance">Échéance</label>
          <input id="aca-aff-echeance" className="form-input" type="date" value={echeance} disabled={enCours} onChange={(e) => setEcheance(e.target.value)} />
          <div className="form-hint">Sans date, un parcours applique les délais de ses modules.</div>
        </div>
        <label className="aca-case" htmlFor="aca-aff-obligatoire" style={{ alignSelf: 'end', paddingBottom: 10 }}>
          <input id="aca-aff-obligatoire" type="checkbox" checked={obligatoire} disabled={enCours} onChange={(e) => setObligatoire(e.target.checked)} />
          Obligatoire
        </label>
      </div>
      <div className="aca-pied">
        <button type="button" className="btn btn-primary" onClick={lancer} disabled={!pret}>{enCours ? 'Affectation…' : 'Affecter'}</button>
      </div>
    </div>
  )
}

function ModaleEcheance({ affectation, onFermer, onRecharger }) {
  const [echeance, setEcheance] = useState(affectation.echeance ? String(affectation.echeance).slice(0, 10) : '')
  const [obligatoire, setObligatoire] = useState(affectation.obligatoire !== false)
  const [enCours, setEnCours] = useState(false)

  async function enregistrer() {
    if (enCours) return
    setEnCours(true)
    try {
      await modifierEcheance(affectation.id, echeance || null, obligatoire)
      toast.success('Échéance modifiée')
      onRecharger?.()
      onFermer()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !enCours) onFermer() }}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="aca-echeance-titre" style={{ width: 'min(100%, 460px)' }}>
        <TeteModale id="aca-echeance-titre" titre="Échéance" sousTitre={`${affectation.nom} · ${affectation.titre}`} onFermer={onFermer} />
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="aca-ech-date">Date</label>
            <input id="aca-ech-date" className="form-input" type="date" value={echeance} autoFocus disabled={enCours} onChange={(e) => setEcheance(e.target.value)} />
            <div className="form-hint">Vide : aucune échéance, donc jamais de retard.</div>
          </div>
          <label className="aca-case" htmlFor="aca-ech-obligatoire">
            <input id="aca-ech-obligatoire" type="checkbox" checked={obligatoire} disabled={enCours} onChange={(e) => setObligatoire(e.target.checked)} />
            Obligatoire
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-outline" onClick={onFermer} disabled={enCours}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

function OngletAffectations({ collaborateurs, modules, parcours, affectations, onRecharger }) {
  const [edition, setEdition] = useState(null)
  const [enCours, setEnCours] = useState(null)
  const titresParcours = useMemo(() => Object.fromEntries(parcours.map((p) => [p.id, p.titre])), [parcours])

  async function retirer(a) {
    const ok = await confirmDialog({
      title: `Retirer « ${a.titre} » à ${a.nom} ?`,
      message: 'L affectation disparaît de son parcours. Sa progression dans les leçons n est pas effacée.',
      confirmLabel: 'Retirer',
      danger: true,
    })
    if (!ok) return
    setEnCours(a.id)
    try {
      await retirerAffectation(a.id)
      toast.success('Affectation retirée')
      onRecharger?.()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(null)
    }
  }

  return (
    <div>
      <FormulaireAffectation collaborateurs={collaborateurs} modules={modules} parcours={parcours} onRecharger={onRecharger} />
      <div className="form-section-title" style={{ marginTop: 22 }}>Affectations existantes · {affectations.length}</div>
      {affectations.length === 0 ? (
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucune affectation</div>
            <div className="empty-sub">Choisissez des collaborateurs et un parcours ci dessus.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Collaborateur</th><th>Module</th><th>Parcours</th><th>Échéance</th><th>Statut</th><th>Obligatoire</th><th></th></tr>
            </thead>
            <tbody>
              {affectations.map((a) => (
                <tr key={a.id}>
                  <td className="cell-primary">{a.nom}</td>
                  <td>{a.titre}<div className="cell-sub">{a.slug}</div></td>
                  <td>{a.parcours_id ? (titresParcours[a.parcours_id] || 'Parcours') : <span className="aca-version-meta">Module seul</span>}</td>
                  <td className="cell-mono">{a.echeance ? jourParis(a.echeance) : ''}</td>
                  <td><span className={classeBadge(a.statut)}>{STATUTS[a.statut] || a.statut}</span></td>
                  <td>{a.obligatoire ? 'Oui' : 'Non'}</td>
                  <td>
                    <span className="aca-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdition(a)} disabled={enCours === a.id}>Échéance</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => retirer(a)}
                        disabled={a.statut === 'valide' || enCours === a.id}
                        title={a.statut === 'valide' ? 'Une affectation validée ne se retire pas : la preuve de réalisation reste' : undefined}>
                        Retirer
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edition && <ModaleEcheance affectation={edition} onFermer={() => setEdition(null)} onRecharger={onRecharger} />}
    </div>
  )
}

// ─── Paramètres ────────────────────────────────────────────────────────────

const CHAMPS_PARAMETRES = [
  { cle: 'seuil_reussite_defaut', label: 'Seuil de réussite par défaut', min: 0.5, max: 1, step: 0.05, aide: 'De 0,5 à 1, appliqué aux nouveaux modules.' },
  { cle: 'delai_j7', label: 'Première révision (jours après validation)', min: 1, step: 1 },
  { cle: 'delai_j30', label: 'Seconde révision (jours après validation)', min: 1, step: 1 },
  { cle: 'questions_par_quiz', label: 'Questions par quiz', min: 1, max: 20, step: 1 },
  { cle: 'questions_par_revision', label: 'Questions par révision', min: 1, max: 20, step: 1 },
  { cle: 'retention_intervalles_mois', label: 'Rétention des intervalles d activité (mois)', min: 1, max: 60, step: 1, aide: 'Au delà, les intervalles bruts sont purgés ; les durées calculées restent.' },
  { cle: 'inactivite_secondes', label: 'Inactivité avant arrêt du comptage (secondes)', min: 30, step: 10 },
  { cle: 'pas_battement_secondes', label: 'Pas des battements (secondes)', min: 10, step: 5 },
]

function OngletParametres({ parametres, onRecharger }) {
  const [f, setF] = useState(() => Object.fromEntries(CHAMPS_PARAMETRES.map((c) => [c.cle, String(parametres?.[c.cle] ?? '')])))
  const [enCours, setEnCours] = useState(false)
  const [enregistreLe, setEnregistreLe] = useState(null)

  async function enregistrer() {
    if (enCours) return
    const patch = {}
    for (const c of CHAMPS_PARAMETRES) {
      const v = Number(String(f[c.cle]).replace(',', '.'))
      if (!Number.isFinite(v) || v < c.min || (c.max != null && v > c.max)) {
        toast.error(`${c.label} : valeur hors limites`)
        return
      }
      patch[c.cle] = c.step < 1 ? v : Math.round(v)
    }
    if (patch.delai_j30 <= patch.delai_j7) { toast.error('La seconde révision vient après la première'); return }
    setEnCours(true)
    try {
      await enregistrerParametres(patch)
      toast.success('Paramètres enregistrés')
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
      <div className="form-section-title">Réglages du cabinet</div>
      <div className="aca-grille-2">
        {CHAMPS_PARAMETRES.map((c) => (
          <div className="form-group" key={c.cle}>
            <label className="form-label" htmlFor={`aca-prm-${c.cle}`}>{c.label}</label>
            <input id={`aca-prm-${c.cle}`} className="form-input" type="number" min={c.min} max={c.max} step={c.step}
              value={f[c.cle]} disabled={enCours} onChange={(e) => setF((prev) => ({ ...prev, [c.cle]: e.target.value }))} />
            {c.aide && <div className="form-hint">{c.aide}</div>}
          </div>
        ))}
      </div>
      <div className="form-hint">Les seuils déjà posés sur une version publiée ne bougent pas : ils font partie de la version.</div>
      <div className="aca-pied">
        <button type="button" className="btn btn-primary" onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button>
        <span className="aca-statut" role="status" aria-live="polite">{enregistreLe ? 'Enregistré' : ''}</span>
      </div>
    </div>
  )
}

// ─── Journal ───────────────────────────────────────────────────────────────

function OngletJournal({ journal }) {
  if (journal.length === 0) {
    return (
      <div className="card">
        <div className="table-empty-state">
          <div className="empty-title">Aucun geste enregistré</div>
          <div className="empty-sub">Chaque création, publication, archivage ou affectation s inscrit ici, avec son auteur.</div>
        </div>
      </div>
    )
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>Date</th><th>Qui</th><th>Action</th><th>Cible</th><th>Détail</th></tr>
        </thead>
        <tbody>
          {journal.map((j) => (
            <tr key={j.id}>
              <td className="cell-mono">{dateHeureParis(j.survenu_le)}</td>
              <td className="cell-primary">{j.nom || 'Système'}</td>
              <td>{j.action}</td>
              <td className="cell-mono">{j.cible}</td>
              <td><code className="aca-code" title={typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)}>{detailCourt(j.detail)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── La vue ────────────────────────────────────────────────────────────────

export function AdministrationVue({ vue, erreur, onNaviguer, onRecharger, ongletInitial = 'modules' }) {
  const [onglet, setOnglet] = useState(ongletInitial)
  const modules = vue?.modules || []
  const parcours = vue?.parcours || []
  const collaborateurs = vue?.collaborateurs || []
  const affectations = vue?.affectations || []
  const journal = vue?.journal || []
  const chargement = !vue && !erreur

  const sousTitre = vue
    ? `${pluriel(modules.length, 'module', 'modules')} · ${pluriel(parcours.length, 'parcours', 'parcours')} · ${pluriel(affectations.length, 'affectation', 'affectations')}`
    : 'Chargement…'

  let contenu = null
  if (erreur) contenu = <div className="notice notice-error" role="alert">{erreur}</div>
  else if (chargement) contenu = <SkeletonTable rows={6} cols={4} />
  else if (onglet === 'modules') contenu = <OngletModules modules={modules} onNaviguer={onNaviguer} onRecharger={onRecharger} />
  else if (onglet === 'parcours') contenu = <OngletParcours parcours={parcours} modules={modules} onRecharger={onRecharger} />
  else if (onglet === 'affectations') contenu = <OngletAffectations collaborateurs={collaborateurs} modules={modules} parcours={parcours} affectations={affectations} onRecharger={onRecharger} />
  else if (onglet === 'parametres') contenu = <OngletParametres key={JSON.stringify(vue?.parametres || {})} parametres={vue?.parametres} onRecharger={onRecharger} />
  else contenu = <OngletJournal journal={journal} />

  return (
    <div className="aca">
      <div className="section-header">
        <div>
          <div className="section-kicker">Formation · administration</div>
          <div className="section-title">Administration des contenus</div>
          <div className="section-sub">{sousTitre}</div>
        </div>
      </div>
      <SubTabs tabs={ONGLETS} active={onglet} onChange={setOnglet} ariaLabel="Sous onglets Administration" />
      {contenu}
    </div>
  )
}

// ─── Le conteneur ──────────────────────────────────────────────────────────

export default function Administration({ profile, route, onNaviguer }) {
  const direction = estDirection(profile)
  const versionId = route?.[1] === 'version' && route?.[2] ? route[2] : null
  const [vue, setVue] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!direction || versionId) return undefined
    let vivant = true
    adminVue()
      .then((d) => { if (vivant) { setVue(d); setErreur(null) } })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [direction, versionId, generation])

  if (!direction) {
    return (
      <div className="card">
        <div className="table-empty-state">
          <div className="empty-title">Réservé à l administration de la formation</div>
          <div className="empty-sub">Les contenus se gèrent par la direction et l administrateur formation. Votre parcours est dans l onglet Mon parcours.</div>
        </div>
      </div>
    )
  }
  if (versionId) return <EditeurVersion profile={profile} versionId={versionId} onNaviguer={onNaviguer} />
  return <AdministrationVue vue={vue} erreur={erreur} onNaviguer={onNaviguer} onRecharger={() => setGeneration((g) => g + 1)} />
}
