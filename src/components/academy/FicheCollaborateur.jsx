// ═══════════════════════════════════════════════════════════════════════════
// FICHE COLLABORATEUR : le parcours d une personne, daté et sans jugement
//
// La direction ouvre cette fiche depuis le pilotage ; un collaborateur peut
// ouvrir la sienne (même fonction SQL, même garde : la base refuse la fiche
// d un autre). Elle dit ce qui s est passé et quand : progression par
// module, tentatives avec leur score, révisions, frise des événements, temps
// actif par semaine. Les commentaires de coaching sont réservés au manager :
// un conseiller qui regarde sa fiche les lit, il n en écrit pas.
//
// Conteneur (chargement) et vue (props) séparés, comme partout dans
// l Academy : la vue se rend en test sans base. Aucune donnée de
// rémunération, aucun graphique chart.js ici (des barres CSS suffisent).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { messageErreur } from '../../lib/ui-shared'
import { STATUTS, classeBadge, progressionPct } from '../../lib/academy/statuts'
import { formatDuree, jourParis, dateHeureParis, semaineLibelle } from '../../lib/academy/format'
import { fiche, commenterCoaching } from '../../services/academy'
import { confirmDialog } from '../ui/confirm'
import { SkeletonCards, SkeletonTable } from '../ui/Skeleton'
import './academy-pilotage.css'

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const nombre = (v) => Number(v) || 0
const estDirection = (profile) => profile?.role === 'manager' || profile?.academy_admin === true

const TYPES_TENTATIVE = { quiz: 'Quiz', revision_j7: 'Révision J+7', revision_j30: 'Révision J+30' }
const TYPES_REVISION = { J7: 'J+7', J30: 'J+30' }
const RESULTATS = { reussie: { libelle: 'Réussie', classe: 'badge badge-signed' }, echouee: { libelle: 'Échouée', classe: 'badge badge-urgent' } }

// Les événements de la frise : un libellé français par type, la couleur de
// la pastille est portée par la classe du même nom dans academy-pilotage.css.
const EVENEMENTS = {
  affectation_creee: 'Affectation créée',
  lecon_terminee: 'Leçon terminée',
  tentative_soumise: 'Tentative soumise',
  module_valide: 'Module validé',
  revision_faite: 'Révision faite',
}

function detailEvenement(e) {
  const d = e?.detail || {}
  const morceaux = []
  if (e?.titre) morceaux.push(e.titre)
  if (d.titre && d.titre !== e?.titre) morceaux.push(d.titre)
  if (d.type && TYPES_TENTATIVE[d.type]) morceaux.push(TYPES_TENTATIVE[d.type])
  if (d.type && TYPES_REVISION[d.type]) morceaux.push(`révision ${TYPES_REVISION[d.type]}`)
  if (d.score != null && d.total != null) morceaux.push(`${d.score}/${d.total}`)
  if (d.reussie === true) morceaux.push('réussie')
  if (d.reussie === false) morceaux.push('échouée')
  if (d.echeance) morceaux.push(`échéance le ${jourParis(d.echeance)}`)
  if (d.motif === 'nouvelle_version') morceaux.push('nouvelle version du module')
  return morceaux.join(' · ')
}

function Resultat({ valeur }) {
  const r = RESULTATS[valeur]
  if (!r) return <span className="acp-rien">En attente</span>
  return <span className={r.classe}>{r.libelle}</span>
}

// ─── La vue ────────────────────────────────────────────────────────────────

export function FicheVue({
  profile, profileId, donnees, chargement, erreur, onNaviguer,
  commentaire = '', onCommentaire, onAjouterCommentaire, enregistrement = false,
}) {
  const direction = estDirection(profile)
  const soi = !!profileId && profileId === profile?.id
  if (!direction && !soi) {
    return (
      <div className="card">
        <div className="table-empty-state">
          <div className="acp-garde-titre">Réservé à la direction</div>
          <div className="form-hint" style={{ marginTop: 8 }}>La fiche d un collègue est réservée au manager. Ta propre fiche est accessible depuis Mon parcours.</div>
        </div>
      </div>
    )
  }

  const profil = donnees?.profil || {}
  const affectations = donnees?.affectations || []
  const tentatives = donnees?.tentatives || []
  const revisions = donnees?.revisions || []
  const evenements = donnees?.evenements || []
  const semaines = donnees?.semaines || []
  const commentaires = donnees?.commentaires || []
  const valides = affectations.filter((a) => a.statut === 'valide').length
  const retards = affectations.filter((a) => a.en_retard).length
  const revisionsDues = revisions.filter((r) => r.due).length
  const maxSemaine = Math.max(0, ...semaines.map((s) => nombre(s.temps_actif_s)))
  const enChargement = chargement || (!donnees && !erreur)

  return (
    <div className="acp">
      <div className="section-header">
        <div>
          <div className="section-kicker">Formation · fiche collaborateur</div>
          <div className="section-title">{profil.full_name || (enChargement ? 'Chargement…' : 'Collaborateur')}</div>
          <div className="section-sub">
            {profil.advisor_code ? `${profil.advisor_code} · ` : ''}
            {soi && !direction ? 'Ta fiche de formation · heures en Europe/Paris' : 'Heures en Europe/Paris'}
            {profil.is_active === false ? ' · profil désactivé' : ''}
          </div>
        </div>
        <div className="acp-entete-actions">
          {direction && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/pilotage')}>Retour au pilotage</button>
          )}
          {!direction && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/parcours')}>Retour à mon parcours</button>
          )}
        </div>
      </div>

      {erreur && <div className="notice notice-error" role="alert">{erreur}</div>}

      {enChargement ? (
        <>
          <SkeletonCards n={4} />
          <div style={{ height: 22 }} />
          <SkeletonTable rows={5} cols={5} />
        </>
      ) : donnees ? (
        <>
          <div className="kpi-grid acp-kpis">
            <div className="card card-p acp-kpi" title="Modules validés rapportés aux modules affectés">
              <div className="acp-kpi-kicker">Modules validés</div>
              <div className="acp-kpi-valeur">{valides} sur {affectations.length}</div>
              <div className="acp-kpi-sous">Un module est validé quand le quiz atteint le seuil du module.</div>
            </div>
            <div className="card card-p acp-kpi" title="Somme des intervalles d activité acceptés, fusionnés">
              <div className="acp-kpi-kicker">Temps actif total</div>
              <div className="acp-kpi-valeur">{formatDuree(donnees.temps_actif_s)}</div>
              <div className="acp-kpi-sous">Estimation : une lecture sans interaction n est pas comptée.</div>
            </div>
            <div className="card card-p acp-kpi" title="Révisions J+7 et J+30 dues et non faites">
              <div className="acp-kpi-kicker">Révisions dues</div>
              <div className="acp-kpi-valeur">{revisionsDues}</div>
              <div className="acp-kpi-sous">{pluriel(revisions.length, 'révision programmée', 'révisions programmées')} au total.</div>
            </div>
            <div className="card card-p acp-kpi" title="Affectations dont l échéance est passée et qui ne sont pas validées">
              <div className="acp-kpi-kicker">Retards</div>
              <div className="acp-kpi-valeur">{retards}</div>
              <div className="acp-kpi-sous">Les affectations sans échéance ne comptent pas.</div>
            </div>
          </div>

          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Progression par module</div>
                <div className="acp-bloc-sous">{pluriel(affectations.length, 'module affecté', 'modules affectés')}</div>
              </div>
            </div>
            {affectations.length === 0 ? (
              <div className="card">
                <div className="table-empty-state">
                  <div className="empty-title">Aucun module affecté</div>
                  <div className="empty-sub">Affectez un parcours ou un module depuis le pilotage.</div>
                </div>
              </div>
            ) : (
              <ul className="acp-progression">
                {affectations.map((a) => {
                  const pct = progressionPct(a)
                  return (
                    <li key={a.id} className="acp-module">
                      <div>
                        <div className="acp-module-titre">{a.titre}</div>
                        {a.competence && <div className="acp-module-competence">{a.competence}</div>}
                      </div>
                      <div className="acp-module-statut">
                        <span className={classeBadge(a.statut)}>{STATUTS[a.statut] || a.statut}</span>
                        {a.en_retard && <span className="badge badge-urgent">En retard</span>}
                        {a.obligatoire && <span className="badge badge-normal">Obligatoire</span>}
                        <div className="team-bar-wrap" style={{ flex: 1, minWidth: 120 }}>
                          <div className="team-bar-track"><div className={`team-bar-fill${a.statut === 'valide' ? ' signed' : ''}`} style={{ width: `${pct}%` }} /></div>
                          <span className="team-bar-pct">{nombre(a.lecons_terminees)}/{nombre(a.nb_lecons)}</span>
                        </div>
                      </div>
                      <div className={`acp-module-meta${a.en_retard ? ' retard' : ''}`}>
                        {a.valide_le ? `Validé le ${jourParis(a.valide_le)}` : a.echeance ? `Échéance le ${jourParis(a.echeance)}` : 'Sans échéance'}
                        <br />
                        {formatDuree(a.temps_actif_s)} de temps actif
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Tentatives</div>
                <div className="acp-bloc-sous">{pluriel(tentatives.length, 'tentative soumise', 'tentatives soumises')}, la plus récente d abord</div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Module</th><th scope="col">Type</th><th scope="col">Date</th><th scope="col">Score</th><th scope="col">Résultat</th><th scope="col">Durée</th></tr>
                </thead>
                <tbody>
                  {tentatives.length === 0 ? (
                    <tr><td colSpan={6}><div className="table-empty-state"><div className="empty-title">Aucune tentative</div><div className="empty-sub">Le premier quiz soumis apparaîtra ici avec son score.</div></div></td></tr>
                  ) : tentatives.map((t) => (
                    <tr key={t.id}>
                      <td className="cell-primary">{t.titre}</td>
                      <td>{TYPES_TENTATIVE[t.type] || t.type}{t.numero > 1 ? ` · essai ${t.numero}` : ''}</td>
                      <td className="cell-mono">{dateHeureParis(t.soumise_le)}</td>
                      <td className="cell-mono">{t.total != null ? `${nombre(t.score)}/${nombre(t.total)}` : 'Non évalué'}</td>
                      <td>{t.reussie === true ? <span className="badge badge-signed">Réussie</span> : t.reussie === false ? <span className="badge badge-urgent">Échouée</span> : <span className="acp-rien">Non évalué</span>}</td>
                      <td className="cell-mono">{t.duree_s != null ? formatDuree(t.duree_s) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Révisions</div>
                <div className="acp-bloc-sous">J+7 et J+30 après chaque validation</div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Module</th><th scope="col">Type</th><th scope="col">Échéance</th><th scope="col">Résultat</th></tr>
                </thead>
                <tbody>
                  {revisions.length === 0 ? (
                    <tr><td colSpan={4}><div className="table-empty-state"><div className="empty-title">Aucune révision programmée</div><div className="empty-sub">Les révisions se créent à la validation d un module.</div></div></td></tr>
                  ) : revisions.map((r) => (
                    <tr key={r.id}>
                      <td className="cell-primary">{r.titre}</td>
                      <td>{TYPES_REVISION[r.type] || r.type}</td>
                      <td className="cell-mono">
                        {jourParis(r.echeance)}
                        {r.due && <div className="cell-sub">due</div>}
                        {r.faite_le && <div className="cell-sub">faite le {jourParis(r.faite_le)}</div>}
                      </td>
                      <td><Resultat valeur={r.resultat} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Frise chronologique</div>
                <div className="acp-bloc-sous">{pluriel(evenements.length, 'événement', 'événements')}, le plus récent d abord</div>
              </div>
            </div>
            {evenements.length === 0 ? (
              <div className="card">
                <div className="table-empty-state">
                  <div className="empty-title">Rien encore</div>
                  <div className="empty-sub">La première affectation ouvrira la frise.</div>
                </div>
              </div>
            ) : (
              <div className="card card-p">
                <ol className="acp-frise">
                  {evenements.map((e) => (
                    <li key={e.id} className="acp-frise-item">
                      <span className={`acp-frise-pastille ${EVENEMENTS[e.type] ? e.type : 'autre'}`} aria-hidden="true" />
                      <div className="acp-frise-libelle">{EVENEMENTS[e.type] || e.type}</div>
                      {detailEvenement(e) && <div className="acp-frise-detail">{detailEvenement(e)}</div>}
                      <div className="acp-frise-date">{dateHeureParis(e.survenu_le)}</div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Temps actif par semaine</div>
                <div className="acp-bloc-sous">Semaines en heure de Paris, intervalles acceptés seulement</div>
              </div>
            </div>
            {semaines.length === 0 ? (
              <div className="card">
                <div className="table-empty-state">
                  <div className="empty-title">Aucune activité mesurée</div>
                  <div className="empty-sub">Le temps se mesure à l ouverture d une leçon, quand la page est visible et qu il y a une interaction.</div>
                </div>
              </div>
            ) : (
              <div className="card card-p">
                <ul className="acp-barres">
                  {semaines.map((s) => {
                    const secondes = nombre(s.temps_actif_s)
                    const largeur = maxSemaine > 0 ? Math.round((100 * secondes) / maxSemaine) : 0
                    return (
                      <li key={s.semaine} className="acp-barre">
                        <span>{semaineLibelle(s.semaine) || s.semaine}</span>
                        <div className="acp-barre-piste" aria-hidden="true"><div className="acp-barre-remplissage" style={{ width: `${largeur}%` }} /></div>
                        <span className="acp-barre-valeur">{formatDuree(secondes)}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Commentaires de coaching</div>
                <div className="acp-bloc-sous">{profile?.role === 'manager' ? 'Visibles par la direction et par la personne' : 'Notes laissées par la direction'}</div>
              </div>
            </div>
            {commentaires.length === 0 ? (
              <div className="form-hint" style={{ color: 'var(--t2)' }}>Aucun commentaire pour l instant.</div>
            ) : (
              <ul className="acp-commentaires">
                {commentaires.map((c) => (
                  <li key={c.id} className="acp-commentaire">
                    <div className="acp-commentaire-meta">{c.auteur || 'Direction'} · {dateHeureParis(c.created_at)}</div>
                    <div className="acp-commentaire-texte">{c.texte}</div>
                  </li>
                ))}
              </ul>
            )}
            {profile?.role === 'manager' && (
              <form className="acp-form-coaching" onSubmit={(e) => { e.preventDefault(); onAjouterCommentaire?.() }}>
                <label className="form-label" htmlFor="acp-coaching-texte">Nouveau commentaire</label>
                <textarea id="acp-coaching-texte" className="form-textarea" rows={3} value={commentaire}
                  placeholder="Un point d appui, une piste de travail, un rendez vous convenu"
                  onChange={(e) => onCommentaire?.(e.target.value)} disabled={enregistrement} />
                <button type="submit" className="btn btn-primary btn-sm" disabled={enregistrement || !String(commentaire).trim()}>
                  {enregistrement ? 'Enregistrement…' : 'Ajouter le commentaire'}
                </button>
              </form>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─── Le conteneur ──────────────────────────────────────────────────────────

export default function FicheCollaborateur({ profile, profileId, onNaviguer }) {
  const autorise = estDirection(profile) || (!!profileId && profileId === profile?.id)
  const [donnees, setDonnees] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [version, setVersion] = useState(0)
  const [commentaire, setCommentaire] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)

  useEffect(() => {
    if (!autorise || !profileId) return undefined
    let vivant = true
    setChargement(true)
    setErreur(null)
    fiche(profileId)
      .then((f) => { if (!vivant) return; setDonnees(f); setChargement(false) })
      .catch((e) => { if (!vivant) return; setErreur(messageErreur(e)); setChargement(false) })
    return () => { vivant = false }
  }, [autorise, profileId, version])

  async function ajouterCommentaire() {
    const texte = String(commentaire || '').trim()
    if (!texte || enregistrement) return
    const ok = await confirmDialog({
      title: 'Ajouter ce commentaire de coaching ?',
      message: `Il sera visible par ${donnees?.profil?.full_name || 'la personne'} sur sa fiche.`,
      confirmLabel: 'Ajouter',
    })
    if (!ok) return
    setEnregistrement(true)
    try {
      await commenterCoaching(profileId, texte)
      toast.success('Commentaire ajouté')
      setCommentaire('')
      setVersion((v) => v + 1)
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <FicheVue
      profile={profile} profileId={profileId} donnees={donnees} chargement={chargement} erreur={erreur} onNaviguer={onNaviguer}
      commentaire={commentaire} onCommentaire={setCommentaire} onAjouterCommentaire={ajouterCommentaire} enregistrement={enregistrement}
    />
  )
}
