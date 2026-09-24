// ═══════════════════════════════════════════════════════════════════════════
// DECK : la page d’un module, avant et entre les sessions
//
// Ce que dit la page : l’objectif et la compétence visée, où j’en suis
// (couronnes, exercices vus et dus, XP, statut, échéance), le gros bouton
// « Démarrer une session » (ou « Reprendre la session » quand une session
// ouverte de moins de deux heures attend), le mémo d’une page, la force par
// compétence, l historique des sessions, l attestation interne à trois
// couronnes, les sources. Plus de leçons ni de quiz : on apprend en
// s’entraînant.
//
// L’attestation se génère à la demande : le module PDF (jsPDF) n’est chargé
// qu’au clic, pour rester hors du paquet servi à l’ouverture du CRM.
//
// Le mémo porte ses SCHÉMAS : la version rend une liste
// [{ cle, titre, svg, legende }] et le markdown place chaque figure avec un
// marqueur [schema:cle] seul sur sa ligne. On découpe donc le mémo autour
// des marqueurs et on rend chaque morceau ; un schéma que le mémo n’appelle
// pas se pose à la fin, un marqueur sans schéma disparaît sans bruit (un
// mémo ne doit jamais afficher une erreur au collaborateur).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { lireModule } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { jourISO } from '../../lib/ma-journee'
import { classeBadge, enRetard, libelleEcheance, STATUTS } from '../../lib/academy/statuts'
import { dateHeureParis, formatDuree, jourParis, libelleNiveau, libelleTheme } from '../../lib/academy/format'
import { decouperMemo, normaliserCle } from '../../lib/academy/editeur-items'
import { Couronnes } from './Couronnes'
import Schema from './Schema'
import RenduMarkdown from '../ui/RenduMarkdown'
import { SkeletonText } from '../ui/Skeleton'
import './academy-schemas.css'

const FORCE_MAX = 5
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

function Sources({ sources }) {
  const liste = Array.isArray(sources) ? sources : []
  if (liste.length === 0) return null
  return (
    <details className="ac-details">
      <summary>Sources ({liste.length})</summary>
      <div className="ac-details-corps">
        <ul className="ac-sources">
          {liste.map((s, i) => (
            <li key={i}>
              {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.titre || s.url}</a> : <span>{s.titre}</span>}
              {s.emetteur ? ` · ${s.emetteur}` : ''}
              {s.date_consultation ? ` · consultée le ${jourParis(s.date_consultation)}` : ''}
              {s.ce_qu_elle_etablit ? ` : ${s.ce_qu_elle_etablit}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

// La force moyenne d’une compétence sur cinq, en barre.
function Competence({ c }) {
  const force = Math.max(0, Math.min(FORCE_MAX, Number(c.force_moyenne) || 0))
  const pct = Math.round((100 * force) / FORCE_MAX)
  return (
    <li className="ac-competence">
      <div className="ac-ligne">
        <span className="ac-competence-nom ac-croissance">{c.competence}</span>
        <span className="ac-muet">{pluriel(Number(c.nb) || 0, 'exercice', 'exercices')}</span>
      </div>
      <div className="team-bar-wrap" aria-label={`Force ${force} sur ${FORCE_MAX}`}>
        <div className="team-bar-track"><div className={`team-bar-fill${force >= 4 ? ' signed' : ''}`} style={{ width: `${pct}%` }} /></div>
        <span className="team-bar-pct">{String(force).replace('.', ',')}/{FORCE_MAX}</span>
      </div>
    </li>
  )
}

// Le mémo et ses figures, dans l’ordre de lecture : les morceaux de texte
// rendus par le markdown, les schémas appelés par un marqueur à leur place,
// et à la fin ceux que le mémo n’a pas appelés (un mémo sans marqueur les
// reçoit donc tous à la suite).
function Memo({ memo, schemas }) {
  const { parties, fin } = useMemo(() => {
    const liste = (Array.isArray(schemas) ? schemas : []).filter((s) => s && normaliserCle(s.cle))
    const parCle = new Map(liste.map((s) => [normaliserCle(s.cle), s]))
    const appeles = new Set()
    const morceaux = decouperMemo(memo)
      .map((p) => (p.type === 'schema' ? { ...p, schema: parCle.get(p.cle) || null } : p))
      .filter((p) => {
        if (p.type !== 'schema') return true
        if (!p.schema) return false
        appeles.add(p.cle)
        return true
      })
    return { parties: morceaux, fin: liste.filter((s) => !appeles.has(normaliserCle(s.cle))) }
  }, [memo, schemas])

  if (parties.length === 0 && fin.length === 0) {
    return <div className="ac-muet">Ce deck n’a pas encore de mémo : tout s’apprend par les exercices.</div>
  }
  const figure = (s, cle) => <Schema key={cle} svg={s.svg} titre={s.titre} legende={s.legende} />
  return (
    <>
      {parties.map((p, i) => (p.type === 'schema'
        ? figure(p.schema, `m${i}`)
        : <RenduMarkdown key={`m${i}`} markdown={p.texte} />))}
      {fin.map((s, i) => figure(s, `f${i}`))}
    </>
  )
}

export function ModuleDetailVue({ module, profile, aujourdhui, onNaviguer, onAttestation }) {
  const m = module || {}
  const affectation = m.affectation ? { ...m.affectation, valide_le: m.validation?.valide_le } : null
  const statut = affectation?.statut || (m.validation?.valide_le ? 'valide' : Number(m.items_vus) > 0 ? 'en_cours' : 'non_commence')
  const retard = affectation ? enRetard({ ...affectation, statut }, aujourdhui) : false
  const echeance = affectation ? libelleEcheance({ ...affectation, statut }, aujourdhui) : ''
  const nbItems = Number(m.nb_items) || 0
  const vus = Math.min(nbItems, Number(m.items_vus) || 0)
  const dus = Number(m.items_dus) || 0
  const couronnes = Number(m.couronnes) || 0
  const competences = Array.isArray(m.competences) ? m.competences : []
  const sessions = Array.isArray(m.sessions) ? m.sessions : []
  const reprise = !!m.entrainement_ouvert
  const vide = nbItems === 0
  const memo = String(m.memo_md || '').trim()
  const parSession = Math.min(12, nbItems || 12)

  return (
    <div>
      <div className="ac-retour">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/catalogue')}>Retour au catalogue</button>
      </div>

      <div className="section-header">
        <div>
          <div className="section-kicker">{[libelleTheme(m.theme), libelleNiveau(m.niveau)].filter(Boolean).join(' · ')}</div>
          <div className="section-title">{m.titre}</div>
          {m.objectif && <div className="section-sub">{m.objectif}</div>}
          <div className="ac-entete-meta">
            {m.competence && <span>Compétence : {m.competence}</span>}
            {m.duree_minutes ? <span>· {m.duree_minutes} min</span> : null}
            <span>· {pluriel(nbItems, 'exercice', 'exercices')}</span>
          </div>
          <div className="ac-entete-meta">
            <span className={classeBadge(statut)}>{STATUTS[statut] || 'Non commencé'}</span>
            {retard && <span className="badge badge-urgent">En retard</span>}
            {affectation?.obligatoire && <span className="badge badge-normal">Obligatoire</span>}
            {echeance && <span>{echeance}</span>}
            {!affectation && <span>Consultation libre, deck non affecté</span>}
            {m.duree_active_s > 0 && <span>· temps actif {formatDuree(m.duree_active_s)}</span>}
          </div>
        </div>
      </div>

      <section className="card card-p ac-maitrise" aria-labelledby="ac-md-maitrise">
        <div className="ac-maitrise-gauche">
          <div id="ac-md-maitrise" className="ac-kpi-kicker">Maîtrise</div>
          <Couronnes n={couronnes} taille="grande" />
          <div className="ac-maitrise-chiffres">
            <span>{vus} sur {nbItems} {nbItems > 1 ? 'exercices vus' : 'exercice vu'}</span>
            <span className={dus > 0 ? 'ac-du' : ''}>{dus > 0 ? `${dus} à revoir` : 'rien à revoir'}</span>
            <span>{Number(m.xp) || 0} XP</span>
            {sessions.length > 0 && <span>{pluriel(sessions.length, 'session', 'sessions')}</span>}
          </div>
          <div className="ac-muet">
            {couronnes >= 3
              ? 'Deck validé. Les révisions espacées entretiennent la maîtrise jusqu’à cinq couronnes.'
              : 'Trois couronnes valident le deck : chaque exercice su au moins deux fois.'}
          </div>
        </div>
        <div className="ac-maitrise-droite">
          <button type="button" className="btn btn-primary ac-btn-grand" disabled={vide} title={vide ? 'Aucun exercice dans ce deck' : undefined}
            onClick={() => onNaviguer?.(`#/formation/entrainement/${m.version_id}`)}>
            {reprise ? 'Reprendre la session' : 'Démarrer une session'}
          </button>
          <div className="ac-muet">
            {vide ? 'Aucun exercice dans ce deck : rien à jouer pour l’instant.'
              : reprise ? 'Une session est en cours, tu reprends où tu t es arrêté.'
                : `${parSession} exercices, corrigés un par un, les erreurs rejouées à la fin.`}
          </div>
        </div>
      </section>

      <section className="ac-bloc" aria-labelledby="ac-md-memo">
        <h3 id="ac-md-memo" className="ac-bloc-titre">Mémo</h3>
        <div className="card card-p ac-memo">
          <Memo memo={memo} schemas={m.schemas} />
        </div>
      </section>

      {competences.length > 0 && (
        <section className="ac-bloc" aria-labelledby="ac-md-competences">
          <h3 id="ac-md-competences" className="ac-bloc-titre">Compétences</h3>
          <div className="card card-p">
            <ul className="ac-competences">
              {competences.map((c) => <Competence key={c.competence} c={c} />)}
            </ul>
          </div>
        </section>
      )}

      <section className="ac-bloc" aria-labelledby="ac-md-sessions">
        <h3 id="ac-md-sessions" className="ac-bloc-titre">Historique des sessions</h3>
        {sessions.length === 0 ? (
          <div className="ac-muet">Aucune session terminée sur ce deck.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Bonnes réponses</th><th>XP</th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-mono">{dateHeureParis(s.terminee_le || s.demarree_le)}</td>
                    <td className="cell-mono">{Number(s.nb_bons) || 0}/{Number(s.nb_total) || 0}</td>
                    <td className="cell-mono">{Number(s.xp) || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {m.attestation && (
        <section className="ac-bloc" aria-labelledby="ac-md-attestation">
          <h3 id="ac-md-attestation" className="ac-bloc-titre">Attestation interne de réalisation</h3>
          <div className="card card-p ac-attestation">
            <div className="ac-croissance">
              <div className="priority-item-client">
                <span className="ac-attestation-numero">{m.attestation.numero}</span>
              </div>
              <div className="priority-item-detail">
                Délivrée le {jourParis(m.attestation.delivree_le)} · maîtrise à trois couronnes
                {m.relu_par ? ` · contenu relu par ${m.relu_par}` : ''}
              </div>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onAttestation?.({
              numero: m.attestation.numero,
              delivreeLe: m.attestation.delivree_le,
              nomCollaborateur: profile?.full_name || '',
              titreModule: m.titre,
              slug: m.slug,
              competence: m.competence,
              reluPar: m.relu_par,
            })}>
              Télécharger l’attestation interne
            </button>
          </div>
        </section>
      )}

      <Sources sources={m.sources} />
    </div>
  )
}

export default function ModuleDetail({ profile, slug, onNaviguer }) {
  const [module, setModule] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [aujourdhui] = useState(() => jourISO())

  useEffect(() => {
    let vivant = true
    setModule(null)
    setErreur(null)
    lireModule(slug)
      .then((m) => { if (vivant) setModule(m) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [slug])

  async function telecharger(donnees) {
    try {
      const { genererAttestation } = await import('../../lib/academy/attestation-pdf')
      await genererAttestation(donnees)
      toast.success('Attestation générée')
    } catch (e) {
      toast.error('Attestation impossible : ' + messageErreur(e))
    }
  }

  if (erreur) {
    return (
      <div>
        <div className="ac-retour">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/catalogue')}>Retour au catalogue</button>
        </div>
        <div className="notice notice-error" role="alert">{erreur}</div>
      </div>
    )
  }
  if (!module) return <div className="card card-p"><SkeletonText lines={6} /></div>
  return <ModuleDetailVue module={module} profile={profile} aujourdhui={aujourdhui} onNaviguer={onNaviguer} onAttestation={telecharger} />
}
