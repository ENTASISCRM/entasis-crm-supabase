// ═══════════════════════════════════════════════════════════════════════════
// FICHE COLLABORATEUR : l’entraînement d’une personne, daté et sans jugement
//
// La direction ouvre cette fiche depuis le pilotage ; un collaborateur peut
// ouvrir la sienne (même fonction SQL, même garde : la base refuse la fiche
// d’un autre). Elle dit ce qui s’est passé et quand : série et XP,
// progression par deck (couronnes, exercices vus et dus), sessions avec
// leur score, exercices à consolider, frise des événements, XP et temps
// actif par semaine. Les commentaires de coaching sont visibles par la
// direction seulement : la fonction SQL ne les rend pas au collaborateur qui
// regarde sa fiche, l’écran ne lui montre donc pas le bloc.
//
// Conteneur (chargement) et vue (props) séparés, comme partout dans
// l’Academy : la vue se rend en test sans base. Aucune donnée de
// rémunération, aucun graphique chart.js ici (des barres CSS suffisent).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { messageErreur } from '../../lib/ui-shared'
import { STATUTS, classeBadge, libelleCouronnes } from '../../lib/academy/statuts'
import { formatDuree, jourParis, dateHeureParis, semaineLibelle, pourcentage } from '../../lib/academy/format'
import { fiche, commenterCoaching } from '../../services/academy'
import { confirmDialog } from '../ui/confirm'
import { SkeletonCards, SkeletonTable } from '../ui/Skeleton'
import { Couronnes } from './Couronnes'
import './academy-pilotage.css'

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const nombre = (v) => Number(v) || 0
const estDirection = (profile) => profile?.role === 'manager' || profile?.academy_admin === true

const FORCE_MAX = 5

// La durée d’une session, de son ouverture à sa fin ; '' si l’une manque.
function dureeSession(s) {
  const a = new Date(String(s?.demarree_le || ''))
  const b = new Date(String(s?.terminee_le || ''))
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return ''
  const secondes = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000))
  if (secondes < 60) return `${secondes} s`
  return formatDuree(secondes)
}

// Les événements de la frise : un libellé français par type, calculé depuis le
// détail rendu par la base. La couleur de la pastille est portée par la classe
// du même nom dans academy-pilotage.css.
const EVENEMENTS = {
  session_terminee: (d) => {
    const morceaux = ['Session terminée']
    if (d.total != null) morceaux.push(`${nombre(d.bons)} sur ${nombre(d.total)}`)
    if (d.xp != null) morceaux.push(`${nombre(d.xp)} XP`)
    return morceaux.join(', ')
  },
  module_valide: (d) => `Deck validé${d.couronnes != null ? `, ${libelleCouronnes(d.couronnes)}` : ''}`,
  affectation_creee: () => 'Affectation créée',
  version_publiee: (d) => `Nouvelle version publiée${d.numero != null ? ` (version ${d.numero})` : ''}`,
  version_archivee: () => 'Version archivée',
}

function libelleEvenement(e) {
  const f = EVENEMENTS[e?.type]
  return f ? f(e?.detail || {}) : String(e?.type || 'Événement')
}

function detailEvenement(e) {
  const d = e?.detail || {}
  const morceaux = []
  if (e?.titre) morceaux.push(e.titre)
  if (d.echeance) morceaux.push(`échéance le ${jourParis(d.echeance)}`)
  if (d.motif === 'nouvelle_version') morceaux.push('nouvelle version du deck')
  if (d.relu_par) morceaux.push(`relu par ${d.relu_par}`)
  return morceaux.join(' · ')
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
          <div className="form-hint" style={{ marginTop: 8 }}>La fiche d’un collègue est réservée au manager. Ta propre fiche est accessible depuis Aujourd hui.</div>
        </div>
      </div>
    )
  }

  const profil = donnees?.profil || {}
  const serie = donnees?.serie || {}
  const affectations = donnees?.affectations || []
  const sessions = donnees?.sessions || []
  const itemsFaibles = donnees?.items_faibles || []
  const evenements = donnees?.evenements || []
  const semaines = donnees?.semaines || []
  const commentaires = donnees?.commentaires || []
  const valides = affectations.filter((a) => a.statut === 'valide').length
  const retards = affectations.filter((a) => a.en_retard).length
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/parcours')}>Retour à Aujourd hui</button>
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
            <div className="card card-p acp-kpi" title="Jours consécutifs avec au moins une session terminée, en Europe/Paris">
              <div className="acp-kpi-kicker">Série en cours</div>
              <div className="acp-kpi-valeur">{pluriel(nombre(serie.serie), 'jour', 'jours')}</div>
              <div className="acp-kpi-sous">{serie.dernier_jour ? `Dernière session le ${jourParis(serie.dernier_jour)}` : 'Aucune session terminée'} · objectif {pluriel(nombre(serie.objectif_quotidien) || 1, 'session par jour', 'sessions par jour')}.</div>
            </div>
            <div className="card card-p acp-kpi" title="La plus longue série de jours consécutifs">
              <div className="acp-kpi-kicker">Meilleure série</div>
              <div className="acp-kpi-valeur">{pluriel(nombre(serie.meilleure), 'jour', 'jours')}</div>
              <div className="acp-kpi-sous">Le record personnel, jamais comparé à celui d’un collègue.</div>
            </div>
            <div className="card card-p acp-kpi" title="Somme des XP de toutes les sessions terminées">
              <div className="acp-kpi-kicker">XP total</div>
              <div className="acp-kpi-valeur">{nombre(donnees.xp_total)}<span className="acp-kpi-effectif">XP</span></div>
              <div className="acp-kpi-sous">{pluriel(sessions.length, 'session terminée', 'sessions terminées')} · {formatDuree(donnees.temps_actif_s)} de temps actif.</div>
            </div>
            <div className="card card-p acp-kpi" title="Exercices dont la révision espacée est arrivée à échéance et qui ne sont pas encore sus par cœur">
              <div className="acp-kpi-kicker">Exercices dus</div>
              <div className="acp-kpi-valeur">{nombre(donnees.items_dus)}</div>
              <div className="acp-kpi-sous">À revoir aujourd’hui, tous decks confondus.</div>
            </div>
          </div>

          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Progression par deck</div>
                <div className="acp-bloc-sous">
                  {pluriel(affectations.length, 'deck affecté', 'decks affectés')}, {valides} validé{valides > 1 ? 's' : ''}
                  {retards > 0 ? `, ${pluriel(retards, 'en retard', 'en retard')}` : ''}
                </div>
              </div>
            </div>
            {affectations.length === 0 ? (
              <div className="card">
                <div className="table-empty-state">
                  <div className="empty-title">Aucun deck affecté</div>
                  <div className="empty-sub">Affectez un parcours ou un deck depuis le pilotage.</div>
                </div>
              </div>
            ) : (
              <ul className="acp-progression">
                {affectations.map((a) => {
                  const nbItems = nombre(a.nb_items)
                  const vus = Math.min(nombre(a.items_vus), nbItems || nombre(a.items_vus))
                  const pct = pourcentage(vus, nbItems)
                  const dus = nombre(a.items_dus)
                  return (
                    <li key={a.id} className="acp-module">
                      <div>
                        <div className="acp-module-titre">{a.titre}</div>
                        {a.competence && <div className="acp-module-competence">{a.competence}</div>}
                        <div className="acp-module-couronnes"><Couronnes n={a.couronnes} /></div>
                      </div>
                      <div className="acp-module-statut">
                        <span className={classeBadge(a.statut)}>{STATUTS[a.statut] || a.statut}</span>
                        {a.en_retard && <span className="badge badge-urgent">En retard</span>}
                        {a.obligatoire && <span className="badge badge-normal">Obligatoire</span>}
                        <div className="team-bar-wrap" style={{ flex: 1, minWidth: 120 }} title="Exercices vus au moins une fois">
                          <div className="team-bar-track"><div className={`team-bar-fill${a.statut === 'valide' ? ' signed' : ''}`} style={{ width: `${pct}%` }} /></div>
                          <span className="team-bar-pct">{vus}/{nbItems} vus</span>
                        </div>
                        <span className="acp-module-chiffres">
                          {dus > 0 ? <span className="badge badge-progress">{pluriel(dus, 'exercice dû', 'exercices dus')}</span> : 'Aucun exercice dû'}
                          {' · '}{nombre(a.xp)} XP · {pluriel(nombre(a.sessions), 'session', 'sessions')}
                        </span>
                      </div>
                      <div className={`acp-module-meta${a.en_retard ? ' retard' : ''}`}>
                        {a.valide_le ? `Validé le ${jourParis(a.valide_le)}` : a.echeance ? `Échéance le ${jourParis(a.echeance)}` : 'Sans échéance'}
                        <br />
                        {a.derniere_session ? `Dernière session le ${dateHeureParis(a.derniere_session)}` : 'Aucune session'}
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
                <div className="acp-bloc-titre">Sessions</div>
                <div className="acp-bloc-sous">{pluriel(sessions.length, 'session terminée', 'sessions terminées')}, la plus récente d’abord</div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Deck</th><th scope="col">Date</th><th scope="col">Score</th><th scope="col">XP</th><th scope="col">Durée</th></tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td colSpan={5}><div className="table-empty-state"><div className="empty-title">Aucune session</div><div className="empty-sub">La première session terminée apparaîtra ici avec son score.</div></div></td></tr>
                  ) : sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="cell-primary">{s.titre}</td>
                      <td className="cell-mono">{dateHeureParis(s.terminee_le || s.demarree_le)}</td>
                      <td className="cell-mono">{s.nb_total != null ? `${nombre(s.nb_bons)}/${nombre(s.nb_total)}` : 'Non évalué'}</td>
                      <td className="cell-mono">{nombre(s.xp)}</td>
                      <td className="cell-mono">{dureeSession(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Exercices à consolider</div>
                <div className="acp-bloc-sous">Les exercices les moins sus (force 0 à 2 sur {FORCE_MAX}), les plus fragiles d’abord</div>
              </div>
            </div>
            {itemsFaibles.length === 0 ? (
              <div className="card">
                <div className="table-empty-state">
                  <div className="empty-title">Rien à consolider</div>
                  <div className="empty-sub">Aucun exercice n’est en difficulté : chaque exercice vu a été réussi au moins deux fois de suite.</div>
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th scope="col">Exercice</th><th scope="col">Compétence</th><th scope="col">Deck</th><th scope="col">Force</th><th scope="col">Prochaine révision</th></tr>
                  </thead>
                  <tbody>
                    {itemsFaibles.map((i) => (
                      <tr key={i.item_id}>
                        <td className="cell-primary">{i.enonce_court || 'Sans énoncé'}</td>
                        <td>{i.competence || ''}</td>
                        <td>{i.titre_module || ''}</td>
                        <td className="cell-mono">{nombre(i.force)} sur {FORCE_MAX}</td>
                        <td className="cell-mono">{i.prochaine_le ? jourParis(i.prochaine_le) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Frise chronologique</div>
                <div className="acp-bloc-sous">{pluriel(evenements.length, 'événement', 'événements')}, le plus récent d’abord</div>
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
                      <div className="acp-frise-libelle">{libelleEvenement(e)}</div>
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
                <div className="acp-bloc-titre">XP et temps actif par semaine</div>
                <div className="acp-bloc-sous">Semaines en heure de Paris, intervalles acceptés seulement</div>
              </div>
            </div>
            {semaines.length === 0 ? (
              <div className="card">
                <div className="table-empty-state">
                  <div className="empty-title">Aucune activité mesurée</div>
                  <div className="empty-sub">Le temps se mesure pendant une session, chaque réponse vaut un battement.</div>
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
                        <span className="acp-barre-xp">{nombre(s.xp)} XP · {pluriel(nombre(s.sessions), 'session', 'sessions')}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          {profile?.role === 'manager' && (
            <div className="acp-bloc">
              <div className="acp-bloc-tete">
                <div>
                  <div className="acp-bloc-titre">Commentaires de coaching</div>
                  <div className="acp-bloc-sous">Visibles par la direction seulement, jamais par la personne</div>
                </div>
              </div>
              {commentaires.length === 0 ? (
                <div className="form-hint" style={{ color: 'var(--t2)' }}>Aucun commentaire pour l’instant.</div>
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
              <form className="acp-form-coaching" onSubmit={(e) => { e.preventDefault(); onAjouterCommentaire?.() }}>
                <label className="form-label" htmlFor="acp-coaching-texte">Nouveau commentaire</label>
                <textarea id="acp-coaching-texte" className="form-textarea" rows={3} value={commentaire}
                  placeholder="Un point d’appui, une piste de travail, un rendez vous convenu"
                  onChange={(e) => onCommentaire?.(e.target.value)} disabled={enregistrement} />
                <button type="submit" className="btn btn-primary btn-sm" disabled={enregistrement || !String(commentaire).trim()}>
                  {enregistrement ? 'Enregistrement…' : 'Ajouter le commentaire'}
                </button>
              </form>
            </div>
          )}
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
      message: `Il restera visible par la direction seulement : ${donnees?.profil?.full_name || 'la personne'} ne le verra pas sur sa fiche.`,
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
