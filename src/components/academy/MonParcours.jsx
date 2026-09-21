// ═══════════════════════════════════════════════════════════════════════════
// MON PARCOURS : l écran d entrée du collaborateur dans la formation
//
// Une seule question à l ouverture : qu est ce que je fais maintenant ? La
// carte « Prochaine étape » y répond (prochaineAction de statuts.js : une
// révision due avant un module en retard, avant un module en cours, avant un
// module non commencé). Puis quatre chiffres, la liste des modules affectés
// avec leur progression et leur échéance, les révisions dues, les dernières
// réussites.
//
// Conteneur (charge academy_mon_parcours) et présentation séparés : la vue
// reçoit tout par props et se teste avec renderToStaticMarkup.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { monParcours } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { ajouterJours } from '../../lib/sequences'
import { classeBadge, enRetard, libelleEcheance, prochaineAction, progressionPct, STATUTS } from '../../lib/academy/statuts'
import { revisionsDues, libelleRevision } from '../../lib/academy/revisions'
import { formatDuree, jourParis } from '../../lib/academy/format'
import { SkeletonCards } from '../ui/Skeleton'

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const jour = (v) => (v ? String(v).slice(0, 10) : '')

// Le lien vers lequel mène la prochaine étape, selon son type.
function cibleAction(action) {
  if (!action) return null
  if (action.type === 'revision') return `#/formation/quiz/${action.version_id}/revision_${String(action.revisionType || 'J7').toLowerCase()}`
  if (action.type === 'quiz') return `#/formation/quiz/${action.version_id}`
  if (action.type === 'lecon' && action.lecon?.id) return `#/formation/lecon/${action.lecon.id}`
  return `#/formation/module/${action.slug}`
}

function Entete({ sousTitre }) {
  return (
    <div className="section-header">
      <div>
        <div className="section-kicker">Formation</div>
        <div className="section-title">Mon parcours</div>
        {sousTitre && <div className="section-sub">{sousTitre}</div>}
      </div>
    </div>
  )
}

// Même motif que KpiCard d App.jsx (non exportée) : kicker, valeur, sous texte.
function Kpi({ kicker, valeur, sous }) {
  return (
    <div className="card card-p">
      <div className="ac-kpi-kicker">{kicker}</div>
      <div className="ac-kpi-valeur">{valeur}</div>
      {sous && <div className="ac-kpi-sous">{sous}</div>}
    </div>
  )
}

function Affectation({ a, aujourdhui, onNaviguer }) {
  const retard = enRetard(a, aujourdhui)
  const pct = progressionPct(a)
  const valide = a.statut === 'valide'
  const echeance = libelleEcheance(a, aujourdhui)
  const cible = a.prochaine_lecon?.id && !valide ? `#/formation/lecon/${a.prochaine_lecon.id}` : `#/formation/module/${a.slug}`
  const bouton = valide ? 'Revoir' : a.statut === 'en_cours' || a.statut === 'a_revoir' ? 'Reprendre' : 'Commencer'
  return (
    <li className="priority-item ac-affectation">
      <span className={`priority-item-dot ${retard ? 'urgent' : 'normal'}`} aria-hidden="true"
        style={valide ? { background: 'var(--signed)' } : undefined} />
      <div className="ac-affectation-corps">
        <div className="priority-item-client">{a.titre}</div>
        <div className="priority-item-detail">
          {[a.parcours_titre, a.obligatoire ? 'obligatoire' : 'facultatif', a.duree_minutes ? `${a.duree_minutes} min` : null].filter(Boolean).join(' · ')}
        </div>
        <div className="team-bar-wrap ac-affectation-barre" aria-label={`Progression ${pct} %`}>
          <div className="team-bar-track"><div className={`team-bar-fill${valide ? ' signed' : ''}`} style={{ width: `${pct}%` }} /></div>
          <span className="team-bar-pct">{pluriel(a.lecons_terminees || 0, 'leçon', 'leçons')} sur {a.nb_lecons || 0}</span>
        </div>
      </div>
      <div className="ac-affectation-droite">
        {echeance && <span className="ac-muet">{echeance}</span>}
        <span className="ac-badges">
          <span className={classeBadge(a.statut)}>{STATUTS[a.statut] || 'Non commencé'}</span>
          {retard && <span className="badge badge-urgent">En retard</span>}
        </span>
        <button type="button" className={`btn btn-sm ${valide ? 'btn-ghost' : 'btn-outline'}`} onClick={() => onNaviguer?.(cible)}>{bouton}</button>
      </div>
    </li>
  )
}

export function MonParcoursVue({ parcours, aujourdhui, onNaviguer }) {
  const affectations = Array.isArray(parcours?.affectations) ? parcours.affectations : []
  const revisions = Array.isArray(parcours?.revisions) ? parcours.revisions : []
  const reussites = Array.isArray(parcours?.dernieres_reussites) ? parcours.dernieres_reussites : []
  const jourJ = aujourdhui || parcours?.aujourdhui

  if (affectations.length === 0 && revisions.length === 0 && reussites.length === 0) {
    return (
      <div>
        <Entete />
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucun module affecté</div>
            <div className="empty-sub">Ton responsable t affectera un parcours, ou parcours le catalogue.</div>
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => onNaviguer?.('#/formation/catalogue')}>
              Parcourir le catalogue
            </button>
          </div>
        </div>
      </div>
    )
  }

  const action = prochaineAction(parcours, jourJ)
  const dues = revisionsDues(revisions, jourJ)
  const valides = affectations.filter((a) => a.statut === 'valide').length
  const retards = affectations.filter((a) => enRetard(a, jourJ)).length
  const horizon = jourJ ? ajouterJours(jourJ, 7) : null
  const proches = affectations.filter((a) => a.statut !== 'valide' && a.echeance && jourJ
    && jour(a.echeance) >= jourJ && jour(a.echeance) <= horizon).length

  // Les retards d abord, puis par échéance, les validés à la fin.
  const ordonnees = [...affectations].sort((a, b) => {
    const ra = enRetard(a, jourJ) ? 0 : 1
    const rb = enRetard(b, jourJ) ? 0 : 1
    if (ra !== rb) return ra - rb
    const va = a.statut === 'valide' ? 1 : 0
    const vb = b.statut === 'valide' ? 1 : 0
    if (va !== vb) return va - vb
    return String(jour(a.echeance) || '9999').localeCompare(String(jour(b.echeance) || '9999'))
  })

  const sousTitre = [
    `${valides} sur ${pluriel(affectations.length, 'module affecté', 'modules affectés')} ${valides > 1 ? 'validés' : 'validé'}`,
    retards > 0 ? pluriel(retards, 'en retard', 'en retard') : null,
    dues.length > 0 ? pluriel(dues.length, 'révision due', 'révisions dues') : null,
  ].filter(Boolean).join(' · ')

  return (
    <div>
      <Entete sousTitre={sousTitre} />

      <div className="card card-p ac-prochaine">
        <div className="ac-kpi-kicker">Prochaine étape</div>
        {action ? (
          <div className="ac-ligne">
            <div className="ac-croissance">
              <div className="ac-prochaine-libelle">{action.libelle}</div>
              <div className="ac-prochaine-sous">{action.titre}</div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => onNaviguer?.(cibleAction(action))}>{action.bouton}</button>
          </div>
        ) : (
          <div>
            <div className="ac-prochaine-libelle">Tout est à jour</div>
            <div className="ac-prochaine-sous">Aucune leçon, aucun quiz ni aucune révision n attend. Tu peux parcourir le catalogue.</div>
          </div>
        )}
      </div>

      <div className="kpi-grid">
        <Kpi kicker="Modules validés" valeur={`${valides}/${affectations.length}`} sous={retards > 0 ? pluriel(retards, 'module en retard', 'modules en retard') : 'aucun retard'} />
        <Kpi kicker="Révisions dues" valeur={dues.length} sous={dues.length ? 'à faire dès maintenant' : 'rien à réviser'} />
        <Kpi kicker="Échéances à venir 7 j" valeur={proches} sous="modules à rendre dans la semaine" />
        <Kpi kicker="Temps actif 7 j" valeur={formatDuree(parcours?.temps_actif_7j_s)} sous={`${formatDuree(parcours?.temps_actif_s)} au total, estimé`} />
      </div>

      <section className="ac-bloc" aria-labelledby="ac-mp-modules">
        <h3 id="ac-mp-modules" className="ac-bloc-titre">Mes modules</h3>
        {ordonnees.length === 0 ? (
          <div className="ac-muet">Aucun module affecté pour le moment.</div>
        ) : (
          <ul className="priorities-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {ordonnees.map((a) => <Affectation key={a.id || a.version_id} a={a} aujourdhui={jourJ} onNaviguer={onNaviguer} />)}
          </ul>
        )}
      </section>

      <section className="ac-bloc" aria-labelledby="ac-mp-revisions">
        <h3 id="ac-mp-revisions" className="ac-bloc-titre">Révisions dues</h3>
        {dues.length === 0 ? (
          <div className="ac-muet">Aucune révision due. Une révision arrive 7 jours puis 30 jours après chaque module validé.</div>
        ) : (
          <ul className="ac-liste-plate">
            {dues.map((r) => (
              <li key={r.id || `${r.version_id}-${r.type}`} className="card card-p ac-ligne">
                <div className="ac-croissance">
                  <div className="priority-item-client">{r.titre}</div>
                  <div className="priority-item-detail">{libelleRevision(r.type)} · échéance le {jourParis(r.echeance)}</div>
                </div>
                <button type="button" className="btn btn-primary btn-sm"
                  onClick={() => onNaviguer?.(`#/formation/quiz/${r.version_id}/revision_${String(r.type).toLowerCase()}`)}>
                  Réviser
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ac-bloc" aria-labelledby="ac-mp-reussites">
        <h3 id="ac-mp-reussites" className="ac-bloc-titre">Dernières réussites</h3>
        {reussites.length === 0 ? (
          <div className="ac-muet">Aucun module validé pour l instant.</div>
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
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.(`#/formation/module/${r.slug}`)}>Ouvrir</button>
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
  return <MonParcoursVue parcours={parcours} aujourdhui={parcours.aujourdhui} onNaviguer={onNaviguer} />
}
