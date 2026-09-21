// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE DES FORMATIONS : la vue direction d Entasis Academy
//
// Ce que la direction veut savoir, dans l ordre où elle le demande : qui est
// actif, où en sont les obligations, qui est en retard, ce que les réponses
// aux quiz montrent par compétence, et quelles notions faire travailler en
// collectif. Chaque indicateur porte son dénominateur et sa définition : un
// « 12 sur 15 » se discute, un « 80 % » seul se croit.
//
// Ce que l écran refuse : une note d engagement, un classement, une
// qualification automatique. La colonne « À examiner » liste des faits
// (un quiz soumis en douze secondes, trois échecs sur un module), jamais un
// verdict. Une absence de tentative s écrit « Non évalué », jamais 0 %.
//
// Le conteneur Pilotage charge `pilotage(depuis, jusqua)` et `matrice()` ;
// la vue PilotageVue reçoit tout par props et se teste sans base. Les
// modales d écriture (affecter, échéance) demandent confirmation, la relance
// n envoie rien : elle propose un texte à copier. Aucune donnée de
// rémunération, la fonction SQL n en rend pas et l écran n en demande pas.
// ═══════════════════════════════════════════════════════════════════════════

import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { messageErreur } from '../../lib/ui-shared'
import { ajouterJours } from '../../lib/sequences'
import { exporterCsv, suffixeDate } from '../../lib/export-csv'
import { formatDuree, jourParis, dateHeureParis, pourcentage } from '../../lib/academy/format'
import { joursEntre , modulesPubliesDuParcours, libelleParcoursAffectable } from '../../lib/academy/statuts'
import { lignesCsvPilotage } from '../../lib/academy/csv'
import { pilotage, matrice, fiche, adminVue, affecter, modifierEcheance } from '../../services/academy'
import { confirmDialog } from '../ui/confirm'
import { SkeletonCards, SkeletonTable } from '../ui/Skeleton'
import './academy-pilotage.css'

const GraphiquesPilotage = lazy(() => import('./GraphiquesPilotage'))

// ─── Constantes et petites fonctions pures ─────────────────────────────────

const PERIODES = [
  { cle: '7', libelle: '7 jours', jours: 7 },
  { cle: '30', libelle: '30 jours', jours: 30 },
  { cle: '90', libelle: '90 jours', jours: 90 },
  { cle: 'tout', libelle: 'Depuis le début', jours: null },
]
const PERIODE_INITIALE = { cle: 'tout', depuis: null, jusqua: null }

const STATUTS_FILTRE = [
  { cle: 'non_commence', libelle: 'Non commencé', champ: 'modules_non_commences' },
  { cle: 'en_cours', libelle: 'En cours', champ: 'modules_en_cours' },
  { cle: 'a_revoir', libelle: 'À revoir', champ: 'modules_a_revoir' },
  { cle: 'valide', libelle: 'Validé', champ: 'modules_valides' },
  { cle: 'en_retard', libelle: 'En retard', champ: 'retards' },
]
const FILTRES_VIDES = { collaborateur: '', parcours: '', module: '', statut: '' }
const TRI_INITIAL = { cle: 'nom', sens: 'asc' }

// Au delà, une cellule de la matrice dit « (ancien) » : le dernier score date.
const ANCIEN_JOURS = 90

const CELLULES = {
  acquis: { libelle: 'Acquis', classe: 'acp-cellule-acquis' },
  a_renforcer: { libelle: 'À renforcer', classe: 'acp-cellule-renforcer' },
  non_evalue: { libelle: 'Non évalué', classe: 'acp-cellule-non' },
}
const TYPES_TENTATIVE = { quiz: 'quiz', revision_j7: 'révision J+7', revision_j30: 'révision J+30' }

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const nombre = (v) => Number(v) || 0
const estDirection = (profile) => profile?.role === 'manager' || profile?.academy_admin === true

// Les parcours d une ligne arrivent en titres, parfois en objets : on ne garde
// que les titres.
const titresParcours = (ligne) => (Array.isArray(ligne?.parcours) ? ligne.parcours : [])
  .map((p) => (typeof p === 'string' ? p : p?.titre))
  .filter(Boolean)

const prenomDe = (nom) => String(nom || '').trim().split(/\s+/)[0] || ''
const scorePct = (s) => (s && nombre(s.total) > 0 ? Math.round((100 * nombre(s.score)) / nombre(s.total)) : null)

// La période d une puce, calculée depuis le jour rendu par la base (jamais
// depuis l horloge du navigateur) : « 7 jours » couvre aujourd hui et les six
// jours qui précèdent.
function periodePuce(p, aujourdhui) {
  if (!p.jours) return { cle: p.cle, depuis: null, jusqua: null }
  return { cle: p.cle, depuis: ajouterJours(aujourdhui, -(p.jours - 1)), jusqua: null }
}

function libellePeriode(periode, donnees) {
  const depuis = donnees?.depuis || periode?.depuis
  const jusqua = donnees?.jusqua || periode?.jusqua
  if (!depuis && !jusqua) return 'depuis le début'
  if (depuis && jusqua) return `du ${jourParis(depuis)} au ${jourParis(jusqua)}`
  if (depuis) return `depuis le ${jourParis(depuis)}`
  return `jusqu au ${jourParis(jusqua)}`
}

// Les filtres s appliquent côté client. Le filtre module s appuie sur la
// matrice : le pilotage ne détaille pas les affectations par module, la
// matrice sait qui a soumis une tentative sur quelle version.
function filtrerLignes(lignes, filtres, matriceD) {
  let liste = Array.isArray(lignes) ? lignes : []
  const f = filtres || FILTRES_VIDES
  if (f.collaborateur) liste = liste.filter((l) => l.profile_id === f.collaborateur)
  if (f.parcours) liste = liste.filter((l) => titresParcours(l).includes(f.parcours))
  if (f.statut) {
    const champ = STATUTS_FILTRE.find((s) => s.cle === f.statut)?.champ
    if (champ) liste = liste.filter((l) => nombre(l[champ]) > 0)
  }
  if (f.module) {
    const evalues = new Set((matriceD?.lignes || [])
      .filter((m) => (m.cellules || []).some((c) => c.version_id === f.module && c.statut !== 'non_evalue'))
      .map((m) => m.profile_id))
    liste = liste.filter((l) => evalues.has(l.profile_id))
  }
  return liste
}

const CLES_TRI = {
  nom: (l) => String(l.nom || ''),
  parcours: (l) => titresParcours(l).join(', '),
  modules: (l) => pourcentage(l.modules_valides, l.modules_affectes),
  derniere_activite: (l) => String(l.derniere_activite || ''),
  temps_actif_s: (l) => nombre(l.temps_actif_s),
  premier_score: (l) => scorePct(l.premier_score) ?? -1,
  dernier_score: (l) => scorePct(l.dernier_score) ?? -1,
  retards: (l) => nombre(l.retards),
  prochaine_revision: (l) => String(l.prochaine_revision || '9999-12-31'),
}

function trierLignes(lignes, tri) {
  const cle = CLES_TRI[tri?.cle] || CLES_TRI.nom
  const sens = tri?.sens === 'desc' ? -1 : 1
  return [...lignes].sort((a, b) => {
    const va = cle(a)
    const vb = cle(b)
    const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr')
    return (r * sens) || String(a.nom || '').localeCompare(String(b.nom || ''), 'fr')
  })
}

// Le texte de relance proposé : des faits, le vouvoiement, aucune menace.
function texteRelance(ligne) {
  const restants = Math.max(0, nombre(ligne.modules_affectes) - nombre(ligne.modules_valides))
  const retards = nombre(ligne.retards)
  const lignes = [
    `Bonjour ${prenomDe(ligne.nom)},`,
    '',
    `il vous reste ${pluriel(restants, 'module', 'modules')} à valider${retards > 0 ? `, dont ${retards} en retard` : ''}.`,
  ]
  if (ligne.prochaine_revision) lignes.push(`Votre prochaine révision est prévue le ${jourParis(ligne.prochaine_revision)}.`)
  lignes.push('', 'Vous pouvez reprendre depuis la rubrique Formation du CRM, à votre rythme.', '', 'Bonne journée,', 'La direction')
  return lignes.join('\n')
}

// ─── Barre de filtres ──────────────────────────────────────────────────────

function BarreFiltres({ donnees, matriceD, filtres, onFiltre, periode, onPeriode }) {
  const aujourdhui = donnees?.aujourdhui || null
  const lignes = donnees?.lignes || []
  const collaborateurs = [...lignes].sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr'))
  const parcours = Array.from(new Set(lignes.flatMap(titresParcours))).sort((a, b) => a.localeCompare(b, 'fr'))
  const modules = matriceD?.competences || []
  const actifs = Object.values(filtres).some(Boolean)
  const poser = (patch) => onFiltre({ ...filtres, ...patch })

  return (
    <div className="acp-filtres" role="group" aria-label="Filtres du pilotage">
      <div className="acp-filtres-ligne">
        <span className="acp-filtres-libelle">Période</span>
        <div className="acp-puces" role="group" aria-label="Périodes rapides">
          {PERIODES.map((p) => (
            <button key={p.cle} type="button" className={`acp-puce${periode.cle === p.cle ? ' on' : ''}`}
              aria-pressed={periode.cle === p.cle} disabled={!!p.jours && !aujourdhui}
              onClick={() => onPeriode(periodePuce(p, aujourdhui))}>
              {p.libelle}
            </button>
          ))}
        </div>
        <div className="acp-periode">
          <label htmlFor="acp-depuis">du</label>
          <input id="acp-depuis" className="form-input" type="date" value={periode.depuis || ''} max={periode.jusqua || aujourdhui || undefined}
            onChange={(e) => onPeriode({ cle: 'libre', depuis: e.target.value || null, jusqua: periode.jusqua })} />
          <label htmlFor="acp-jusqua">au</label>
          <input id="acp-jusqua" className="form-input" type="date" value={periode.jusqua || ''} min={periode.depuis || undefined} max={aujourdhui || undefined}
            onChange={(e) => onPeriode({ cle: 'libre', depuis: periode.depuis, jusqua: e.target.value || null })} />
        </div>
      </div>
      <div className="acp-filtres-ligne">
        <span className="acp-filtres-libelle">Filtrer</span>
        <select className="filter-select" aria-label="Collaborateur" value={filtres.collaborateur} onChange={(e) => poser({ collaborateur: e.target.value })}>
          <option value="">Tous les collaborateurs</option>
          {collaborateurs.map((l) => <option key={l.profile_id} value={l.profile_id}>{l.nom}{l.advisor_code ? ` (${l.advisor_code})` : ''}</option>)}
        </select>
        <select className="filter-select" aria-label="Parcours" value={filtres.parcours} onChange={(e) => poser({ parcours: e.target.value })}>
          <option value="">Tous les parcours</option>
          {parcours.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="filter-select" aria-label="Module" value={filtres.module} onChange={(e) => poser({ module: e.target.value })}
          title="Collaborateurs ayant au moins une tentative soumise sur ce module">
          <option value="">Tous les modules</option>
          {modules.map((m) => <option key={m.version_id} value={m.version_id}>{m.titre}</option>)}
        </select>
        <select className="filter-select" aria-label="Statut" value={filtres.statut} onChange={(e) => poser({ statut: e.target.value })}>
          <option value="">Tous les statuts</option>
          {STATUTS_FILTRE.map((s) => <option key={s.cle} value={s.cle}>{s.libelle}</option>)}
        </select>
        {actifs && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFiltre({ ...FILTRES_VIDES })}>Effacer les filtres</button>
        )}
      </div>
      {filtres.module && (
        <div className="acp-filtres-note">Filtre module : collaborateurs ayant au moins une tentative soumise sur ce module.</div>
      )}
    </div>
  )
}

// ─── Indicateurs ───────────────────────────────────────────────────────────

function Indicateurs({ indicateurs, definitions }) {
  const i = indicateurs || {}
  const d = definitions || {}
  const num = nombre(i.premiere_reussite_num)
  const den = nombre(i.premiere_reussite_den)
  const cartes = [
    {
      cle: 'actifs', kicker: 'Actifs sur la période', valeur: `${nombre(i.actifs_periode)} sur ${nombre(i.affectes)}`,
      sous: d.actifs_periode || 'Collaborateurs affectés ayant eu au moins une activité acceptée sur la période, rapportés aux collaborateurs affectés.',
    },
    {
      cle: 'obligatoires', kicker: 'Obligatoires validées', valeur: `${nombre(i.obligatoires_validees)} sur ${nombre(i.obligatoires_total)}`,
      sous: d.obligatoires || 'Affectations obligatoires validées rapportées aux affectations obligatoires.',
    },
    {
      cle: 'echues', kicker: 'Échues non validées', valeur: String(nombre(i.echues_non_validees)), effectif: `sur ${nombre(i.echues_total)} échues`,
      sous: d.echues || 'Affectations dont l échéance est passée et qui ne sont pas validées. Les échéances absentes ne comptent pas.',
    },
    {
      cle: 'premiere', kicker: 'Réussite au premier essai',
      valeur: den > 0 ? `${pourcentage(num, den)} %` : 'Non évalué',
      effectif: den > 0 ? `${num} sur ${den}` : 'aucune première tentative',
      sous: d.premiere_reussite || 'Premières tentatives de quiz réussies rapportées aux premières tentatives soumises sur la période.',
    },
    {
      cle: 'temps', kicker: 'Temps actif estimé', valeur: formatDuree(i.temps_actif_s),
      sous: d.temps_actif || 'Somme des intervalles d activité acceptés, fusionnés par personne. Une lecture sans interaction n est pas comptée.',
    },
    {
      cle: 'revisions', kicker: 'Révisions en attente', valeur: String(nombre(i.revisions_en_attente)),
      sous: 'Révisions J+7 et J+30 dues à ce jour et non faites.',
    },
  ]
  return (
    <div className="kpi-grid acp-kpis">
      {cartes.map((c) => (
        <div key={c.cle} className="card card-p acp-kpi" title={c.sous}>
          <div className="acp-kpi-kicker">{c.kicker}</div>
          <div className="acp-kpi-valeur">
            {c.valeur}
            {c.effectif && <span className="acp-kpi-effectif">{c.effectif}</span>}
          </div>
          <div className="acp-kpi-sous">{c.sous}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Tableau par personne ──────────────────────────────────────────────────

const COLONNES = [
  { cle: 'nom', libelle: 'Collaborateur' },
  { cle: 'parcours', libelle: 'Parcours' },
  { cle: 'modules', libelle: 'Modules' },
  { cle: 'derniere_activite', libelle: 'Dernière activité' },
  { cle: 'temps_actif_s', libelle: 'Temps actif' },
  { cle: 'premier_score', libelle: 'Premier score' },
  { cle: 'dernier_score', libelle: 'Dernier score' },
  { cle: 'retards', libelle: 'Retards' },
  { cle: 'prochaine_revision', libelle: 'Prochaine révision' },
  { cle: null, libelle: 'À examiner' },
  { cle: null, libelle: 'Actions' },
]

// Un bouton dans l en tête, pas un onClick sur le th : le tri se fait au clavier.
function ThTri({ colonne, tri, onTri }) {
  if (!colonne.cle) return <th scope="col">{colonne.libelle}</th>
  const actif = tri.cle === colonne.cle
  return (
    <th scope="col" aria-sort={actif ? (tri.sens === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={`acp-tri${actif ? ' on' : ''}`} onClick={() => onTri(colonne.cle)} title={`Trier par ${colonne.libelle}`}>
        {colonne.libelle}
        <span className="acp-tri-fleche" aria-hidden="true">{actif ? (tri.sens === 'desc' ? '↓' : '↑') : '⇅'}</span>
      </button>
    </th>
  )
}

function Score({ s }) {
  if (!s || s.total == null) return <span className="acp-rien">Non évalué</span>
  const details = [s.titre, s.type ? TYPES_TENTATIVE[s.type] || s.type : null, s.le ? jourParis(s.le) : null].filter(Boolean).join(' · ')
  return (
    <>
      <span className="cell-mono">{nombre(s.score)}/{nombre(s.total)}</span>
      {details && <div className="cell-sub">{details}</div>}
    </>
  )
}

function LignePersonne({ ligne, onFiche, onAffecter, onEcheance, onRelance }) {
  const parcours = titresParcours(ligne)
  const affectes = nombre(ligne.modules_affectes)
  const valides = nombre(ligne.modules_valides)
  const pct = pourcentage(valides, affectes)
  const retards = nombre(ligne.retards)
  const dues = nombre(ligne.revisions_dues)
  const faits = Array.isArray(ligne.a_examiner) ? ligne.a_examiner.filter(Boolean) : []
  return (
    <tr>
      <td>
        <div className="cell-primary">{ligne.nom || 'Sans nom'}</div>
        {ligne.advisor_code && <div className="cell-sub">{ligne.advisor_code}</div>}
      </td>
      <td>{parcours.length > 0 ? parcours.join(', ') : <span className="acp-rien">Aucun parcours</span>}</td>
      <td>
        <span className="cell-mono">{valides} / {affectes}</span>
        <div className="team-bar-wrap">
          <div className="team-bar-track"><div className="team-bar-fill signed" style={{ width: `${pct}%` }} /></div>
          <span className="team-bar-pct">{pct} %</span>
        </div>
      </td>
      <td className="cell-mono">{ligne.derniere_activite ? dateHeureParis(ligne.derniere_activite) : <span className="acp-rien">Aucune</span>}</td>
      <td className="cell-mono">{formatDuree(ligne.temps_actif_s)}</td>
      <td><Score s={ligne.premier_score} /></td>
      <td><Score s={ligne.dernier_score} /></td>
      <td>{retards > 0 ? <span className="badge badge-urgent">{pluriel(retards, 'en retard', 'en retard')}</span> : <span className="cell-mono">0</span>}</td>
      <td>
        {ligne.prochaine_revision ? <span className="cell-mono">{jourParis(ligne.prochaine_revision)}</span> : <span className="acp-rien">Aucune</span>}
        {dues > 0 && <div className="cell-sub">{pluriel(dues, 'due', 'dues')}</div>}
      </td>
      <td>
        {faits.length > 0
          ? <ul className="acp-faits">{faits.map((f, i) => <li key={i}>{f}</li>)}</ul>
          : <span className="acp-rien">Rien à signaler</span>}
      </td>
      <td>
        <div className="acp-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFiche?.(ligne)}>Fiche</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAffecter?.(ligne)}>Affecter</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEcheance?.(ligne)}>Échéance</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRelance?.(ligne)}>Relance</button>
        </div>
      </td>
    </tr>
  )
}

function TableauPersonnes({ lignes, total, tri, onTri, onFiche, onAffecter, onEcheance, onRelance, onExporter }) {
  return (
    <div className="acp-bloc">
      <div className="acp-bloc-tete">
        <div>
          <div className="acp-bloc-titre">Par collaborateur</div>
          <div className="acp-bloc-sous">
            {lignes.length === total ? pluriel(total, 'collaborateur', 'collaborateurs') : `${lignes.length} sur ${pluriel(total, 'collaborateur', 'collaborateurs')}`}
            {' · le CSV reprend les lignes affichées'}
          </div>
        </div>
        <div className="acp-outils">
          <button type="button" className="btn btn-outline btn-sm" onClick={onExporter} disabled={lignes.length === 0}>Exporter en CSV</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table acp-table">
          <thead>
            <tr>{COLONNES.map((c) => <ThTri key={c.libelle} colonne={c} tri={tri} onTri={onTri} />)}</tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr>
                <td colSpan={COLONNES.length}>
                  <div className="table-empty-state">
                    <div className="empty-title">{total === 0 ? 'Aucun collaborateur affecté' : 'Aucun collaborateur ne correspond aux filtres'}</div>
                    <div className="empty-sub">
                      {total === 0
                        ? 'Affectez un parcours ou un module depuis l administration des contenus : les personnes apparaîtront ici.'
                        : 'Élargissez la période ou effacez un filtre.'}
                    </div>
                  </div>
                </td>
              </tr>
            ) : lignes.map((l) => (
              <LignePersonne key={l.profile_id} ligne={l} onFiche={onFiche} onAffecter={onAffecter} onEcheance={onEcheance} onRelance={onRelance} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Matrice collaborateurs × compétences ──────────────────────────────────

function Cellule({ cellule, aujourdhui }) {
  const statut = CELLULES[cellule?.statut] || CELLULES.non_evalue
  const ancien = !!(cellule?.derniere_le && aujourdhui && joursEntre(cellule.derniere_le, aujourdhui) > ANCIEN_JOURS)
  const title = cellule?.derniere_le
    ? `dernier score ${cellule.dernier_pct == null ? 'inconnu' : `${nombre(cellule.dernier_pct)} %`} le ${jourParis(cellule.derniere_le)}`
    : 'aucune tentative soumise'
  return (
    <span className={`acp-cellule ${statut.classe}${ancien ? ' acp-cellule-ancien' : ''}`} title={title}>
      {statut.libelle}{ancien ? ' (ancien)' : ''}
    </span>
  )
}

function Matrice({ matriceD, aujourdhui, filtres }) {
  const competences = matriceD?.competences || []
  const lignes = (matriceD?.lignes || []).filter((l) => !filtres?.collaborateur || l.profile_id === filtres.collaborateur)
  const seuils = matriceD?.seuils || {}
  return (
    <div className="acp-bloc">
      <div className="acp-bloc-tete">
        <div>
          <div className="acp-bloc-titre">Compétences par collaborateur</div>
          <div className="acp-bloc-sous">Ce que les réponses ont montré, module par module. Une cellule ne juge pas la personne.</div>
        </div>
      </div>
      {competences.length === 0 || lignes.length === 0 ? (
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">{competences.length === 0 ? 'Aucun module publié' : 'Aucun collaborateur affecté'}</div>
            <div className="empty-sub">La matrice se remplit dès qu un module publié est affecté et qu un quiz est soumis.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap acp-matrice-wrap">
          <table className="data-table acp-matrice">
            <thead>
              <tr>
                <th scope="col">Collaborateur</th>
                {competences.map((c) => (
                  <th key={c.version_id} scope="col">
                    {c.titre}
                    {c.competence && <div className="cell-sub">{c.competence}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.profile_id}>
                  <td className="cell-primary">{l.nom}</td>
                  {competences.map((c) => (
                    <td key={c.version_id}>
                      <Cellule cellule={(l.cellules || []).find((x) => x.version_id === c.version_id)} aujourdhui={aujourdhui} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="acp-legende" aria-label="Légende de la matrice">
        {Object.keys(CELLULES).map((k) => (
          <span key={k}>
            <span className={`acp-cellule ${CELLULES[k].classe}`}>{CELLULES[k].libelle}</span>
            {seuils[k] || ''}
          </span>
        ))}
        <span><span className="acp-cellule acp-cellule-non acp-cellule-ancien">(ancien)</span>dernière tentative de plus de {ANCIEN_JOURS} jours</span>
      </div>
    </div>
  )
}

// ─── Notions à travailler en collectif ─────────────────────────────────────

function Notions({ notions }) {
  const liste = (Array.isArray(notions) ? notions : [])
    .filter((n) => nombre(n.reponses) >= 3)
    .map((n) => ({ ...n, taux: pourcentage(n.correctes, n.reponses) }))
    .sort((a, b) => a.taux - b.taux || String(a.competence).localeCompare(String(b.competence), 'fr'))
  return (
    <div className="acp-bloc">
      <div className="acp-bloc-tete">
        <div>
          <div className="acp-bloc-titre">Notions à travailler en collectif</div>
          <div className="acp-bloc-sous">Taux de bonnes réponses croissant sur la période · une notion apparaît à partir de 3 réponses</div>
        </div>
      </div>
      {liste.length === 0 ? (
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Pas encore assez de réponses</div>
            <div className="empty-sub">Une notion s affiche dès que trois réponses ont été données sur la période.</div>
          </div>
        </div>
      ) : (
        <ul className="acp-notions">
          {liste.map((n) => (
            <li key={n.competence} className="acp-notion">
              <span className="acp-notion-taux">{n.taux} %</span>
              <span className="acp-notion-nom">{n.competence}</span>
              <span className="acp-notion-detail">
                {pluriel(nombre(n.reponses), 'réponse', 'réponses')}, {pluriel(nombre(n.effectif), 'personne', 'personnes')}
                {n.derniere_le ? `, dernière le ${jourParis(n.derniere_le)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── La vue de présentation ────────────────────────────────────────────────

export function PilotageVue({
  profile, donnees, matriceD, chargement, erreur,
  filtres = FILTRES_VIDES, onFiltre, periode = PERIODE_INITIALE, onPeriode, tri = TRI_INITIAL, onTri,
  onFiche, onAffecter, onEcheance, onRelance, onExporter,
}) {
  const lignes = useMemo(
    () => trierLignes(filtrerLignes(donnees?.lignes, filtres, matriceD), tri),
    [donnees, filtres, matriceD, tri],
  )

  if (!estDirection(profile)) {
    return (
      <div className="card">
        <div className="table-empty-state">
          <div className="acp-garde-titre">Réservé à la direction</div>
          <div className="form-hint" style={{ marginTop: 8 }}>Le pilotage des formations est réservé au manager et à l administrateur formation. Ton parcours est dans l onglet Mon parcours.</div>
        </div>
      </div>
    )
  }

  const affectes = donnees?.indicateurs?.affectes
  const enChargement = chargement || (!donnees && !erreur)

  return (
    <div className="acp">
      <div className="section-header">
        <div>
          <div className="section-kicker">Formation · pilotage</div>
          <div className="section-title">Pilotage des formations</div>
          <div className="section-sub" role="status" aria-live="polite">
            Heures en Europe/Paris · {affectes == null ? 'chargement…' : pluriel(nombre(affectes), 'collaborateur affecté', 'collaborateurs affectés')}
          </div>
        </div>
      </div>

      <BarreFiltres donnees={donnees} matriceD={matriceD} filtres={filtres} onFiltre={onFiltre || (() => {})} periode={periode} onPeriode={onPeriode || (() => {})} />

      {erreur && <div className="notice notice-error" role="alert">{erreur}</div>}

      {enChargement ? (
        <>
          <SkeletonCards n={6} />
          <div style={{ height: 22 }} />
          <SkeletonTable rows={6} cols={8} />
        </>
      ) : donnees ? (
        <>
          <Indicateurs indicateurs={donnees.indicateurs} definitions={donnees.definitions} />
          <TableauPersonnes lignes={lignes} total={(donnees.lignes || []).length} tri={tri} onTri={onTri || (() => {})}
            onFiche={onFiche} onAffecter={onAffecter} onEcheance={onEcheance} onRelance={onRelance} onExporter={onExporter} />
          <Matrice matriceD={matriceD} aujourdhui={donnees.aujourdhui} filtres={filtres} />
          <Notions notions={donnees.notions} />
          <div className="acp-bloc">
            <div className="acp-bloc-tete">
              <div>
                <div className="acp-bloc-titre">Sur la période</div>
                <div className="acp-bloc-sous">Chaque graphique a son tableau de valeurs, sous « Valeurs ».</div>
              </div>
            </div>
            <Suspense fallback={<SkeletonCards n={3} height={260} />}>
              <GraphiquesPilotage semaines={donnees.semaines} scoresCompetences={donnees.scores_competences}
                effectif={nombre(affectes)} periodeLibelle={libellePeriode(periode, donnees)} />
            </Suspense>
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─── Modales ───────────────────────────────────────────────────────────────

function Modale({ id, titre, sousTitre, onFermer, children, pied, largeur = 560 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFermer])
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby={`${id}-titre`} style={{ width: `min(100%, ${largeur}px)` }}>
        <div className="modal-head">
          <div>
            <div className="modal-title" id={`${id}-titre`}>{titre}</div>
            {sousTitre && <div className="modal-subtitle">{sousTitre}</div>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Fermer" onClick={onFermer}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{pied}</div>
      </div>
    </div>
  )
}

function ModaleAffecter({ ligne, onFermer, onFait }) {
  const [admin, setAdmin] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [mode, setMode] = useState('parcours')
  const [parcoursId, setParcoursId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [echeance, setEcheance] = useState('')
  const [obligatoire, setObligatoire] = useState(true)
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    let vivant = true
    adminVue()
      .then((a) => { if (vivant) setAdmin(a) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [])

  const parcours = (admin?.parcours || []).filter((p) => !p.archive_le)
  const modules = (admin?.modules || []).filter((m) => !m.archive_le && (m.versions || []).some((v) => v.statut === 'publie'))
  const choisi = mode === 'parcours' ? parcours.find((p) => p.id === parcoursId) : modules.find((m) => m.id === moduleId)
  // Un parcours sans module publie ne donne aucune affectation.
  const parcoursAffectable = mode !== 'parcours' || !choisi || modulesPubliesDuParcours(choisi, admin?.modules || []).publies > 0

  async function valider() {
    if (enCours || !choisi) return
    const ok = await confirmDialog({
      title: `Affecter « ${choisi.titre} » à ${ligne.nom} ?`,
      message: `${mode === 'parcours' ? 'Parcours' : 'Module'}${echeance ? `, échéance le ${jourParis(echeance)}` : ', sans échéance'}${obligatoire ? ', obligatoire' : ', facultatif'}. Une affectation déjà existante n est pas dupliquée.`,
      confirmLabel: 'Affecter',
    })
    if (!ok) return
    setEnCours(true)
    try {
      await affecter({
        profileIds: [ligne.profile_id],
        moduleId: mode === 'module' ? moduleId : null,
        parcoursId: mode === 'parcours' ? parcoursId : null,
        echeance: echeance || null,
        obligatoire,
      })
      toast.success('Affectation enregistrée')
      onFait?.()
      onFermer()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Modale id="acp-affecter" titre="Affecter une formation" sousTitre={`${ligne.nom}${ligne.advisor_code ? ` · ${ligne.advisor_code}` : ''}`} onFermer={onFermer}
      pied={(
        <>
          <button type="button" className="btn btn-outline" onClick={onFermer} disabled={enCours}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={valider} disabled={enCours || !choisi || !parcoursAffectable}>{enCours ? 'Enregistrement…' : 'Affecter'}</button>
        </>
      )}>
      {erreur && <div className="notice notice-error" role="alert">{erreur}</div>}
      {!admin && !erreur ? <SkeletonCards n={2} height={60} /> : admin && (
        <>
          <div className="form-group">
            <span className="form-label">Quoi</span>
            <div className="acp-puces" role="group" aria-label="Type d affectation">
              <button type="button" className={`acp-puce${mode === 'parcours' ? ' on' : ''}`} aria-pressed={mode === 'parcours'} onClick={() => setMode('parcours')}>Un parcours</button>
              <button type="button" className={`acp-puce${mode === 'module' ? ' on' : ''}`} aria-pressed={mode === 'module'} onClick={() => setMode('module')}>Un module publié</button>
            </div>
          </div>
          {mode === 'parcours' ? (
            <div className="form-group">
              <label className="form-label" htmlFor="acp-affecter-parcours">Parcours</label>
              <select id="acp-affecter-parcours" className="form-select" value={parcoursId} onChange={(e) => setParcoursId(e.target.value)}>
                <option value="">Choisir un parcours</option>
                {parcours.map((p) => (
                  <option key={p.id} value={p.id} disabled={modulesPubliesDuParcours(p, admin?.modules || []).publies === 0}>{libelleParcoursAffectable(p, admin?.modules || [])}</option>
                ))}
              </select>
              {parcours.length === 0 && <div className="form-hint">Aucun parcours actif.</div>}
              {choisi && !parcoursAffectable && <div className="form-hint">Publiez au moins un module de ce parcours avant de l affecter.</div>}
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label" htmlFor="acp-affecter-module">Module</label>
              <select id="acp-affecter-module" className="form-select" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
                <option value="">Choisir un module</option>
                {modules.map((m) => <option key={m.id} value={m.id}>{m.titre}</option>)}
              </select>
              {modules.length === 0 && <div className="form-hint">Aucun module publié : publiez une version depuis l administration.</div>}
            </div>
          )}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="acp-affecter-echeance">Échéance</label>
              <input id="acp-affecter-echeance" className="form-input" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
              <div className="form-hint">Facultative. Sans échéance, aucun retard n est compté.</div>
            </div>
            <div className="form-group">
              <span className="form-label">Caractère</span>
              <label htmlFor="acp-affecter-obligatoire" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input id="acp-affecter-obligatoire" type="checkbox" checked={obligatoire} onChange={(e) => setObligatoire(e.target.checked)} />
                Obligatoire
              </label>
            </div>
          </div>
        </>
      )}
    </Modale>
  )
}

function ModaleEcheance({ ligne, onFermer, onFait }) {
  const [donnees, setDonnees] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [affectationId, setAffectationId] = useState('')
  const [echeance, setEcheance] = useState('')
  const [obligatoire, setObligatoire] = useState(true)
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    let vivant = true
    fiche(ligne.profile_id)
      .then((f) => { if (vivant) setDonnees(f) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [ligne.profile_id])

  const affectations = donnees?.affectations || []
  const choisie = affectations.find((a) => a.id === affectationId)

  const choisir = (id) => {
    setAffectationId(id)
    const a = affectations.find((x) => x.id === id)
    setEcheance(a?.echeance ? String(a.echeance).slice(0, 10) : '')
    setObligatoire(a ? !!a.obligatoire : true)
  }

  async function valider() {
    if (enCours || !choisie) return
    const ok = await confirmDialog({
      title: `Modifier l échéance de « ${choisie.titre} » ?`,
      message: `${ligne.nom} : ${echeance ? `nouvelle échéance le ${jourParis(echeance)}` : 'plus d échéance'}, ${obligatoire ? 'obligatoire' : 'facultatif'}.`,
      confirmLabel: 'Enregistrer',
    })
    if (!ok) return
    setEnCours(true)
    try {
      await modifierEcheance(choisie.id, echeance || null, obligatoire)
      toast.success('Échéance enregistrée')
      onFait?.()
      onFermer()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Modale id="acp-echeance" titre="Modifier une échéance" sousTitre={`${ligne.nom}${ligne.advisor_code ? ` · ${ligne.advisor_code}` : ''}`} onFermer={onFermer}
      pied={(
        <>
          <button type="button" className="btn btn-outline" onClick={onFermer} disabled={enCours}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={valider} disabled={enCours || !choisie}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}>
      {erreur && <div className="notice notice-error" role="alert">{erreur}</div>}
      {!donnees && !erreur ? <SkeletonCards n={2} height={60} /> : donnees && (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor="acp-echeance-affectation">Affectation</label>
            <select id="acp-echeance-affectation" className="form-select" value={affectationId} onChange={(e) => choisir(e.target.value)}>
              <option value="">Choisir une affectation</option>
              {affectations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.titre}{a.echeance ? ` · échéance ${jourParis(a.echeance)}` : ' · sans échéance'}{a.statut === 'valide' ? ' · validé' : ''}
                </option>
              ))}
            </select>
            {affectations.length === 0 && <div className="form-hint">Aucune affectation pour cette personne.</div>}
          </div>
          {choisie && (
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="acp-echeance-date">Échéance</label>
                <input id="acp-echeance-date" className="form-input" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
                <div className="form-hint">Vider la date retire l échéance.</div>
              </div>
              <div className="form-group">
                <span className="form-label">Caractère</span>
                <label htmlFor="acp-echeance-obligatoire" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input id="acp-echeance-obligatoire" type="checkbox" checked={obligatoire} onChange={(e) => setObligatoire(e.target.checked)} />
                  Obligatoire
                </label>
              </div>
            </div>
          )}
        </>
      )}
    </Modale>
  )
}

function ModaleRelance({ ligne, onFermer }) {
  const texte = texteRelance(ligne)
  const restants = Math.max(0, nombre(ligne.modules_affectes) - nombre(ligne.modules_valides))
  const objet = `Formation : ${pluriel(restants, 'module', 'modules')} à valider`

  async function copier() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Presse papiers indisponible')
      await navigator.clipboard.writeText(`Objet : ${objet}\n\n${texte}`)
      toast.success('Texte copié')
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  return (
    <Modale id="acp-relance" titre="Aperçu de la relance" sousTitre="Aucun envoi automatique : copiez le texte dans votre messagerie" onFermer={onFermer}
      pied={(
        <>
          <button type="button" className="btn btn-outline" onClick={onFermer}>Fermer</button>
          <button type="button" className="btn btn-primary" onClick={copier}>Copier le texte</button>
        </>
      )}>
      <div className="acp-relance-champ">Destinataire : <b>{ligne.nom}</b>{ligne.advisor_code ? ` (${ligne.advisor_code})` : ''}</div>
      <div className="acp-relance-champ">Objet : <b>{objet}</b></div>
      <div className="acp-relance-texte">{texte}</div>
      <div className="form-hint">Ce texte est une proposition : relisez le, adaptez le, puis envoyez le vous même. Rien ne part depuis cet écran.</div>
    </Modale>
  )
}

// ─── Le conteneur ──────────────────────────────────────────────────────────

export default function Pilotage({ profile, onNaviguer }) {
  const direction = estDirection(profile)
  const [periode, setPeriode] = useState(PERIODE_INITIALE)
  const [filtres, setFiltres] = useState(FILTRES_VIDES)
  const [tri, setTri] = useState(TRI_INITIAL)
  const [donnees, setDonnees] = useState(null)
  const [matriceD, setMatriceD] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [version, setVersion] = useState(0)
  const [modale, setModale] = useState(null)

  useEffect(() => {
    if (!direction) return undefined
    let vivant = true
    setChargement(true)
    setErreur(null)
    Promise.all([pilotage(periode.depuis, periode.jusqua), matrice()])
      .then(([p, m]) => {
        if (!vivant) return
        setDonnees(p)
        setMatriceD(m)
        setChargement(false)
      })
      .catch((e) => {
        if (!vivant) return
        setErreur(messageErreur(e))
        setChargement(false)
      })
    return () => { vivant = false }
  }, [direction, periode.depuis, periode.jusqua, version])

  const recharger = () => setVersion((v) => v + 1)
  const fermer = useCallback(() => setModale(null), [])
  const trier = (cle) => setTri((t) => (t.cle === cle ? { cle, sens: t.sens === 'asc' ? 'desc' : 'asc' } : { cle, sens: 'asc' }))

  const exporter = () => {
    const visibles = trierLignes(filtrerLignes(donnees?.lignes, filtres, matriceD), tri)
    if (visibles.length === 0) { toast('Rien à exporter'); return }
    const { colonnes, lignes } = lignesCsvPilotage(visibles)
    exporterCsv('academy-pilotage-' + suffixeDate(), colonnes, lignes, 'academy')
    toast.success(pluriel(visibles.length, 'ligne exportée', 'lignes exportées'))
  }

  return (
    <>
      <PilotageVue
        profile={profile} donnees={donnees} matriceD={matriceD} chargement={chargement} erreur={erreur}
        filtres={filtres} onFiltre={setFiltres} periode={periode} onPeriode={setPeriode} tri={tri} onTri={trier}
        onFiche={(l) => onNaviguer?.('#/formation/fiche/' + l.profile_id)}
        onAffecter={(l) => setModale({ type: 'affecter', ligne: l })}
        onEcheance={(l) => setModale({ type: 'echeance', ligne: l })}
        onRelance={(l) => setModale({ type: 'relance', ligne: l })}
        onExporter={exporter}
      />
      {modale?.type === 'affecter' && <ModaleAffecter ligne={modale.ligne} onFermer={fermer} onFait={recharger} />}
      {modale?.type === 'echeance' && <ModaleEcheance ligne={modale.ligne} onFermer={fermer} onFait={recharger} />}
      {modale?.type === 'relance' && <ModaleRelance ligne={modale.ligne} onFermer={fermer} />}
    </>
  )
}
