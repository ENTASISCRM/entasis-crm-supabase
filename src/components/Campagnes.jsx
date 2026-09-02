// ═══════════════════════════════════════════════════════════════════════════
// CAMPAGNES : le ciblage en direct sur les fiches clients, côté direction
//
// Hier, la direction a chiffré une campagne prévoyance à la main. Cet écran
// rend ce comptage instantané : des critères à cocher, un compte de cibles
// qui bouge à chaque clic, et juste à côté ce que les fiches vides coûtent
// (« 308 fiches sans statut »). C'est la ligne la plus importante de
// l'écran : elle dit où est le gisement.
//
// Trois zones : les campagnes préconfigurées et le formulaire, le compteur,
// la liste des cibles avec l'export et le lancement. Un onglet à part liste
// les campagnes en cours avec leur entonnoir. Les conseillers reçoivent
// leurs cibles à l'accueil (CampagneEnCours).
//
// La RLS reste le vrai verrou : cet écran se réserve à la direction pour
// l'affichage, mais c'est la base qui refuse une insertion à quelqu'un
// d'autre, et creerCampagne le signale au lieu de le taire. Aucun montant
// de rémunération nulle part : on compte des clients.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { STATUTS_PRO, messageErreur, nomClient, texteRechercheClient } from '../lib/ui-shared'
import { correspond } from '../lib/recherche'
import { euro } from '../lib/format'
import { exporterCsv, suffixeDate } from '../lib/export-csv'
import { jourISO } from '../lib/ma-journee'
import { SEQUENCES, SEQUENCES_LISTE } from '../config/sequencesRelance'
import {
  CRITERES_VIDES, CAMPAGNES_PRECONFIGUREES, SITUATIONS_FAMILIALES, STATUTS_CIBLE, COLONNES_CSV,
  evaluerCibles, libelleNonEvaluables, criteresActifs, normaliserCriteres, resumeCriteres,
  campagnePreconfiguree, entonnoir, ligneCsv, slugCampagne,
} from '../lib/campagnes'
import { listerPourCiblage } from '../services/clients'
import { listEquipment, listFamilies } from '../services/equipment'
import { listerCampagnes, creerCampagne, listerCiblesParCampagnes, cloturerCampagne } from '../services/campagnes'
import { confirmDialog } from './ui/confirm'
import SubTabs from './ui/SubTabs'
import { SkeletonTable } from './ui/Skeleton'
import './campagnes.css'

// Au delà, la liste se déplie sur demande : 500 lignes d'un coup ralentissent
// le compteur, qui doit rester instantané.
const LIMITE_AFFICHAGE = 150

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const basculer = (liste, valeur) => (liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur])

function Puce({ actif, onClick, children, title, petite }) {
  return (
    <button type="button" className={`cmp-puce${petite ? ' cmp-puce-sm' : ''}${actif ? ' on' : ''}`}
      aria-pressed={!!actif} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

// Tout ce qui décrit une cible, pour la recherche tolérante.
const texteCible = (c, famillesLabels, conseillersLabels) => [
  texteRechercheClient(c), c.statut_pro, c.profession, c.situation_familiale,
  conseillersLabels[c.advisor_code],
  ...(c.familles || []).map((f) => famillesLabels[f] || f),
].filter(Boolean).join(' ')

// ─── Zone 1 à 3 : le ciblage ───────────────────────────────────────────────

function Ciblage({ clients, equipement, familles, conseillers, chargement, erreur, onLancee }) {
  const [criteres, setCriteres] = useState(() => ({ ...CRITERES_VIDES }))
  const [presetCle, setPresetCle] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [toutAfficher, setToutAfficher] = useState(false)
  const [lancement, setLancement] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const today = jourISO()

  const famillesLabels = useMemo(() => Object.fromEntries((familles || []).map((f) => [f.key, f.label])), [familles])
  const conseillersLabels = useMemo(
    () => Object.fromEntries(conseillers.map((p) => [p.advisor_code, p.full_name || p.advisor_code])),
    [conseillers],
  )

  const resultat = useMemo(
    () => evaluerCibles(clients, equipement, criteres, { today }),
    [clients, equipement, criteres, today],
  )
  const visibles = useMemo(
    () => (recherche.trim()
      ? resultat.cibles.filter((c) => correspond(texteCible(c, famillesLabels, conseillersLabels), recherche))
      : resultat.cibles),
    [resultat, recherche, famillesLabels, conseillersLabels],
  )
  const affichees = toutAfficher ? visibles : visibles.slice(0, LIMITE_AFFICHAGE)
  const actifs = criteresActifs(criteres)
  const nonEvaluables = libelleNonEvaluables(resultat.nonEvaluables)
  const nbConseillers = new Set(resultat.cibles.map((c) => c.advisor_code || '')).size
  const preset = presetCle ? campagnePreconfiguree(presetCle) : null

  // Toucher un critère à la main détache la puce préconfigurée : le nom et
  // l'accroche proposés au lancement ne prétendent plus venir d'elle.
  const poser = (patch) => { setPresetCle(null); setCriteres((prev) => ({ ...prev, ...patch })) }
  const chargerPreset = (p) => { setPresetCle(p.cle); setCriteres(normaliserCriteres(p.criteres)); setToutAfficher(false) }
  const vider = () => { setPresetCle(null); setCriteres({ ...CRITERES_VIDES }) }
  const nombre = (champ) => (e) => poser({ [champ]: e.target.value === '' ? null : Number(e.target.value) })
  const valeur = (v) => (v == null ? '' : v)

  const nomParDefaut = preset?.nom || `Campagne du ${dateFr(today)}`

  const exporter = () => {
    if (visibles.length === 0) { toast('Rien à exporter'); return }
    exporterCsv(
      `campagne-${slugCampagne(nomParDefaut)}-${suffixeDate()}`,
      COLONNES_CSV,
      visibles.map((c) => ligneCsv(c, { famillesLabels, conseillersLabels })),
      'campagnes',
    )
    toast.success(`${pluriel(visibles.length, 'ligne exportée', 'lignes exportées')}`)
  }

  const ouvrirLancement = () => setLancement({
    nom: nomParDefaut,
    sequence_key: preset?.sequence_key || 'relance_devis',
    accroche: preset?.accroche || '',
  })

  async function lancer() {
    if (enCours || !lancement) return
    const nom = String(lancement.nom || '').trim()
    if (!nom) { toast.error('Donnez un nom à la campagne.'); return }
    const n = resultat.cibles.length
    const ok = await confirmDialog({
      title: `Lancer « ${nom} » vers ${pluriel(n, 'client', 'clients')} ?`,
      message: `${pluriel(nbConseillers, 'conseiller recevra', 'conseillers recevront')} ses cibles à l'accueil du CRM. `
        + `Critères : ${resumeCriteres(criteres, { famillesLabels, conseillersLabels }) || 'aucun, toutes les fiches'}.`,
      confirmLabel: 'Lancer la campagne',
    })
    if (!ok) return
    setEnCours(true)
    try {
      const { nbCibles } = await creerCampagne(
        { nom, criteres: normaliserCriteres(criteres), sequence_key: lancement.sequence_key || null, accroche: lancement.accroche },
        resultat.cibles,
      )
      toast.success(`Campagne « ${nom} » lancée : ${pluriel(nbCibles, 'cible', 'cibles')}`)
      setLancement(null)
      onLancee?.()
    } catch (e) {
      toast.error('Lancement impossible : ' + messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  const sequence = lancement ? SEQUENCES[lancement.sequence_key] : null

  return (
    <div>
      {/* Zone 1 : les campagnes préconfigurées, puis le formulaire. */}
      <div className="cmp-puces" role="group" aria-label="Campagnes préconfigurées">
        {CAMPAGNES_PRECONFIGUREES.map((p) => (
          <Puce key={p.cle} actif={presetCle === p.cle} onClick={() => chargerPreset(p)}
            title={resumeCriteres(p.criteres, { famillesLabels })}>
            {p.nom}
          </Puce>
        ))}
        <button type="button" className="cmp-puce cmp-puce-vider" onClick={vider} disabled={!actifs}>Repartir de zéro</button>
      </div>

      <div className="cmp-criteres">
        <div className="cmp-critere">
          <span className="form-label">Statut professionnel</span>
          <div className="cmp-puces" role="group" aria-label="Statut professionnel">
            {STATUTS_PRO.map((s) => (
              <Puce key={s} petite actif={criteres.statuts.includes(s)} onClick={() => poser({ statuts: basculer(criteres.statuts, s) })}>{s}</Puce>
            ))}
          </div>
        </div>
        <div className="cmp-critere">
          <label className="form-label" htmlFor="cmp-age-min">Âge</label>
          <div className="cmp-nombres">
            <span>de</span>
            <input id="cmp-age-min" className="form-input" type="number" min={18} max={120} placeholder="min" value={valeur(criteres.ageMin)} onChange={nombre('ageMin')} />
            <span>à</span>
            <input className="form-input" type="number" min={18} max={120} placeholder="max" aria-label="Âge maximum" value={valeur(criteres.ageMax)} onChange={nombre('ageMax')} />
            <span>ans</span>
          </div>
        </div>
        <div className="cmp-critere">
          <label className="form-label" htmlFor="cmp-revenus">Revenus annuels</label>
          <div className="cmp-nombres">
            <span>au moins</span>
            <input id="cmp-revenus" className="form-input" type="number" min={0} step={5000} placeholder="80 000" value={valeur(criteres.revenusMin)} onChange={nombre('revenusMin')} />
            <span>€</span>
          </div>
        </div>
        <div className="cmp-critere">
          <label className="form-label" htmlFor="cmp-patrimoine">Patrimoine estimé</label>
          <div className="cmp-nombres">
            <span>au moins</span>
            <input id="cmp-patrimoine" className="form-input" type="number" min={0} step={10000} placeholder="300 000" value={valeur(criteres.patrimoineMin)} onChange={nombre('patrimoineMin')} />
            <span>€</span>
          </div>
        </div>
        <div className="cmp-critere">
          <span className="form-label">Situation familiale</span>
          <div className="cmp-puces" role="group" aria-label="Situation familiale">
            {SITUATIONS_FAMILIALES.map((s) => (
              <Puce key={s} petite actif={criteres.situations.includes(s)} onClick={() => poser({ situations: basculer(criteres.situations, s) })}>{s}</Puce>
            ))}
          </div>
        </div>
        <div className="cmp-critere">
          <label className="form-label" htmlFor="cmp-enfants">Enfants</label>
          <div className="cmp-nombres">
            <span>au moins</span>
            <input id="cmp-enfants" className="form-input" type="number" min={1} max={12} placeholder="1" value={valeur(criteres.enfantsMin)} onChange={nombre('enfantsMin')} />
          </div>
        </div>
        <div className="cmp-critere">
          <span className="form-label">Familles déjà détenues</span>
          <div className="cmp-puces" role="group" aria-label="Familles présentes">
            {(familles || []).map((f) => (
              <Puce key={f.key} petite actif={criteres.famillesPresentes.includes(f.key)}
                onClick={() => poser({ famillesPresentes: basculer(criteres.famillesPresentes, f.key) })}>{f.label}</Puce>
            ))}
          </div>
        </div>
        <div className="cmp-critere">
          <span className="form-label">Familles absentes</span>
          <div className="cmp-puces" role="group" aria-label="Familles absentes">
            {(familles || []).map((f) => (
              <Puce key={f.key} petite actif={criteres.famillesAbsentes.includes(f.key)}
                onClick={() => poser({ famillesAbsentes: basculer(criteres.famillesAbsentes, f.key) })}>{f.label}</Puce>
            ))}
          </div>
        </div>
        {conseillers.length > 0 && (
          <div className="cmp-critere">
            <span className="form-label">Conseillers</span>
            <div className="cmp-puces" role="group" aria-label="Conseillers">
              {conseillers.map((p) => (
                <Puce key={p.advisor_code} petite actif={criteres.conseillers.includes(p.advisor_code)} title={p.advisor_code}
                  onClick={() => poser({ conseillers: basculer(criteres.conseillers, p.advisor_code) })}>{p.full_name || p.advisor_code}</Puce>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Zone 2 : le compteur, en direct. */}
      <div className="cmp-compteur" role="status" aria-live="polite">
        <span className="cmp-compteur-n">{chargement ? '…' : resultat.cibles.length}</span>
        <span className="cmp-compteur-l">{resultat.cibles.length > 1 ? 'clients cibles' : 'client cible'}</span>
        {!chargement && resultat.nbNonEvaluables > 0 && (
          <span className="cmp-compteur-ne">
            · <b>{resultat.nbNonEvaluables}</b> non {resultat.nbNonEvaluables > 1 ? 'évaluables' : 'évaluable'} : {nonEvaluables}
          </span>
        )}
        {!chargement && (
          <span className="cmp-compteur-aide">
            {actifs
              ? `Sur ${pluriel(resultat.total, 'fiche', 'fiches')}${resultat.exclus > 0 ? ` · ${pluriel(resultat.exclus, 'exclue', 'exclues')} par les critères` : ''}. Un client dont un champ demandé est vide n'est ni cible ni exclu : c'est ce que les fiches à compléter coûtent.`
              : `Sur ${pluriel(resultat.total, 'fiche', 'fiches')}. Aucun critère posé : toutes les fiches sont cibles. Choisissez une campagne ou cochez un critère.`}
          </span>
        )}
      </div>

      {/* Zone 3 : la liste, l'export, le lancement. */}
      <div className="cmp-outils">
        <input className="search-input" data-global-search placeholder="Rechercher dans les cibles : nom, conseiller, statut, famille"
          value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher dans les cibles" />
        <div className="cmp-outils-droite">
          <button type="button" className="btn btn-outline btn-sm" onClick={exporter} disabled={chargement || visibles.length === 0}>Exporter</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={ouvrirLancement} disabled={chargement || resultat.cibles.length === 0}>
            Lancer la campagne
          </button>
        </div>
      </div>

      {chargement ? (
        <SkeletonTable rows={6} cols={7} />
      ) : erreur ? (
        <div className="notice notice-error" role="alert">{erreur}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th><th>Conseiller</th><th>Âge</th><th>Statut</th><th>Revenus</th><th>Patrimoine</th><th>Familles</th>
              </tr>
            </thead>
            <tbody>
              {affichees.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--t2)', padding: 32 }}>
                    {resultat.cibles.length === 0 ? 'Aucune fiche ne remplit ces critères.' : 'Aucune cible ne correspond à la recherche.'}
                  </td>
                </tr>
              ) : affichees.map((c) => (
                <tr key={c.id}>
                  <td className="cell-primary">{nomClient(c)}</td>
                  <td title={c.advisor_code || ''}>{conseillersLabels[c.advisor_code] || c.advisor_code || <span className="cmp-inconnu">sans conseiller</span>}</td>
                  <td className="cell-mono">{c.age == null ? <span className="cmp-inconnu">inconnu</span> : `${c.age} ans`}</td>
                  <td>{c.statut_pro || <span className="cmp-inconnu">inconnu</span>}</td>
                  <td className="cell-mono">{Number(c.revenus_annuels) > 0 ? euro(c.revenus_annuels) : <span className="cmp-inconnu">inconnus</span>}</td>
                  <td className="cell-mono">{Number(c.patrimoine_estime) > 0 ? euro(c.patrimoine_estime) : <span className="cmp-inconnu">inconnu</span>}</td>
                  <td>
                    {c.familles.length === 0
                      ? <span className="cmp-inconnu">aucune</span>
                      : <span className="cmp-fam">{c.familles.map((f) => <span key={f}>{famillesLabels[f] || f}</span>)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length > affichees.length && (
            <div className="cmp-plus">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setToutAfficher(true)}>
                Afficher les {visibles.length - affichees.length} autres
              </button>
            </div>
          )}
        </div>
      )}

      {lancement && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !enCours) setLancement(null) }}>
          <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="cmp-lancer-titre" style={{ width: 'min(100%, 560px)' }}>
            <div className="modal-head">
              <div>
                <div className="modal-title" id="cmp-lancer-titre">Lancer la campagne</div>
                <div className="cmp-campagne-meta">
                  {pluriel(resultat.cibles.length, 'cible', 'cibles')} · {pluriel(nbConseillers, 'conseiller', 'conseillers')}
                  {recherche.trim() ? ' · la recherche ne restreint pas le lancement' : ''}
                </div>
              </div>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label" htmlFor="cmp-lancer-nom">Nom de la campagne</label>
                <input id="cmp-lancer-nom" className="form-input" value={lancement.nom} autoFocus
                  onChange={(e) => setLancement((l) => ({ ...l, nom: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cmp-lancer-seq">Séquence de relance proposée</label>
                <select id="cmp-lancer-seq" className="form-select" value={lancement.sequence_key || ''}
                  onChange={(e) => setLancement((l) => ({ ...l, sequence_key: e.target.value || null }))}>
                  <option value="">Aucune</option>
                  {SEQUENCES_LISTE.map((s) => <option key={s.cle} value={s.cle}>{s.libelle}</option>)}
                </select>
                {sequence && <div className="form-hint">{sequence.description}</div>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cmp-lancer-accroche">Accroche</label>
                <textarea id="cmp-lancer-accroche" className="form-textarea" rows={4} value={lancement.accroche}
                  placeholder="La phrase d'ouverture que le conseiller lira au dessus de ses cibles"
                  onChange={(e) => setLancement((l) => ({ ...l, accroche: e.target.value }))} />
              </div>
              <div className="form-hint">
                Critères : {resumeCriteres(criteres, { famillesLabels, conseillersLabels }) || 'aucun, toutes les fiches'}
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-outline" onClick={() => setLancement(null)} disabled={enCours}>Annuler</button>
              <button type="button" className="btn btn-primary" onClick={lancer} disabled={enCours || !String(lancement.nom || '').trim()}>
                {enCours ? 'Lancement…' : 'Lancer la campagne'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Les campagnes en cours ────────────────────────────────────────────────

function CarteCampagne({ campagne, cibles, famillesLabels, conseillersLabels, onCloturer }) {
  const e = useMemo(() => entonnoir(cibles), [cibles])
  const close = !!campagne.cloturee_at
  const sequence = campagne.sequence_key ? SEQUENCES[campagne.sequence_key] : null
  const resume = resumeCriteres(campagne.criteres, { famillesLabels, conseillersLabels })
  const etapes = [
    { cle: 'total', label: 'Cibles', n: e.total, sous: `${e.parStatut.a_contacter} à contacter` },
    ...STATUTS_CIBLE.filter((s) => s.cle !== 'a_contacter').map((s) => ({ cle: s.cle, label: s.label, n: e.parStatut[s.cle] })),
  ]
  return (
    <article className={`cmp-campagne${close ? ' cmp-campagne-close' : ''}`}>
      <div className="cmp-campagne-head">
        <div>
          <div className="cmp-campagne-nom">{campagne.nom}</div>
          <div className="cmp-campagne-meta">
            {close ? `Clôturée le ${dateFr(campagne.cloturee_at)} · lancée le ${dateFr(campagne.created_at)}` : `Lancée le ${dateFr(campagne.created_at)}`}
            {sequence ? ` · ${sequence.libelle}` : ''}
            {resume ? ` · ${resume}` : ''}
          </div>
          {campagne.accroche && <p className="cmp-accroche">{campagne.accroche}</p>}
        </div>
        {!close && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCloturer(campagne)}>Clôturer</button>
        )}
      </div>
      <div className="cmp-entonnoir">
        {etapes.map((et) => (
          <div className="cmp-etape" key={et.cle}>
            <div className="cmp-etape-n">{et.n}</div>
            <div className="cmp-etape-l">{et.label}</div>
            {et.sous && <div className="cmp-etape-s">{et.sous}</div>}
          </div>
        ))}
      </div>
      {e.parConseiller.length > 0 && (
        <div className="table-wrap cmp-detail">
          <table className="data-table">
            <thead>
              <tr>
                <th>Conseiller</th>
                <th>Cibles</th>
                {STATUTS_CIBLE.map((s) => <th key={s.cle}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {e.parConseiller.map((l) => (
                <tr key={l.advisor_code}>
                  <td className="cell-primary" title={l.advisor_code}>{conseillersLabels[l.advisor_code] || l.advisor_code}</td>
                  <td className="cell-mono">{l.total}</td>
                  {STATUTS_CIBLE.map((s) => <td key={s.cle} className="cell-mono">{l.parStatut[s.cle]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

function CampagnesEnCours({ campagnes, cibles, famillesLabels, conseillersLabels, chargement, erreur, onRecharger }) {
  const parCampagne = useMemo(() => {
    const m = new Map()
    for (const c of cibles) {
      if (!m.has(c.campagne_id)) m.set(c.campagne_id, [])
      m.get(c.campagne_id).push(c)
    }
    return m
  }, [cibles])
  const ouvertes = campagnes.filter((c) => !c.cloturee_at)
  const closes = campagnes.filter((c) => c.cloturee_at)

  async function cloturer(c) {
    const ok = await confirmDialog({
      title: `Clôturer « ${c.nom} » ?`,
      message: 'Les cibles restantes disparaissent de l’accueil des conseillers. Les statuts déjà saisis sont conservés.',
      confirmLabel: 'Clôturer',
      danger: true,
    })
    if (!ok) return
    try {
      await cloturerCampagne(c.id)
      toast.success(`Campagne « ${c.nom} » clôturée`)
      onRecharger?.()
    } catch (e) {
      toast.error('Clôture impossible : ' + messageErreur(e))
    }
  }

  if (chargement) return <SkeletonTable rows={4} cols={5} />
  if (erreur) return <div className="notice notice-error" role="alert">{erreur}</div>
  if (campagnes.length === 0) {
    return (
      <div className="card">
        <div className="table-empty-state">
          <div className="empty-title">Aucune campagne lancée</div>
          <div className="form-hint" style={{ marginTop: 8, color: 'var(--t2)' }}>Ciblez des fiches dans l'onglet Cibler, puis lancez la campagne : elle apparaîtra ici avec son entonnoir.</div>
        </div>
      </div>
    )
  }
  return (
    <div>
      {ouvertes.length === 0 && <div className="form-hint" style={{ color: 'var(--t2)', marginBottom: 12 }}>Aucune campagne en cours.</div>}
      {ouvertes.map((c) => (
        <CarteCampagne key={c.id} campagne={c} cibles={parCampagne.get(c.id) || []}
          famillesLabels={famillesLabels} conseillersLabels={conseillersLabels} onCloturer={cloturer} />
      ))}
      {closes.length > 0 && (
        <>
          <div className="cmp-sous-titre">Clôturées</div>
          {closes.map((c) => (
            <CarteCampagne key={c.id} campagne={c} cibles={parCampagne.get(c.id) || []}
              famillesLabels={famillesLabels} conseillersLabels={conseillersLabels} onCloturer={cloturer} />
          ))}
        </>
      )}
    </div>
  )
}

// ─── L'écran ───────────────────────────────────────────────────────────────

export default function Campagnes({ profile, teamProfiles }) {
  const estManager = profile?.role === 'manager'
  const [onglet, setOnglet] = useState('cibler')
  const [fiches, setFiches] = useState({ clients: [], equipement: [], familles: [], chargement: true, erreur: null })
  const [suivi, setSuivi] = useState({ campagnes: [], cibles: [], chargement: true, erreur: null })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!estManager) return
    let actif = true
    Promise.all([listerPourCiblage(), listEquipment(), listFamilies()])
      .then(([clients, equipement, familles]) => {
        if (actif) setFiches({ clients, equipement, familles, chargement: false, erreur: null })
      })
      .catch((e) => {
        if (!actif) return
        setFiches((f) => ({ ...f, chargement: false, erreur: messageErreur(e) }))
        toast.error('Chargement des fiches impossible : ' + messageErreur(e))
      })
    return () => { actif = false }
  }, [estManager])

  useEffect(() => {
    if (!estManager) return
    let actif = true
    setSuivi((s) => ({ ...s, chargement: true }))
    listerCampagnes()
      .then(async (campagnes) => {
        const cibles = await listerCiblesParCampagnes(campagnes.map((c) => c.id))
        if (actif) setSuivi({ campagnes, cibles, chargement: false, erreur: null })
      })
      .catch((e) => { if (actif) setSuivi((s) => ({ ...s, chargement: false, erreur: messageErreur(e) })) })
    return () => { actif = false }
  }, [estManager, version])

  const conseillers = useMemo(
    () => (teamProfiles || [])
      .filter((p) => p?.is_active && p?.advisor_code)
      .sort((a, b) => String(a.full_name || a.advisor_code).localeCompare(String(b.full_name || b.advisor_code), 'fr')),
    [teamProfiles],
  )
  const famillesLabels = useMemo(() => Object.fromEntries(fiches.familles.map((f) => [f.key, f.label])), [fiches.familles])
  const conseillersLabels = useMemo(
    () => Object.fromEntries(conseillers.map((p) => [p.advisor_code, p.full_name || p.advisor_code])),
    [conseillers],
  )
  const nbEnCours = suivi.campagnes.filter((c) => !c.cloturee_at).length

  if (!estManager) {
    return (
      <div className="card">
        <div className="table-empty-state">
          <div style={{ fontSize: 16, color: 'var(--t2)' }}>Réservé à la direction</div>
          <div className="form-hint" style={{ marginTop: 8 }}>Le ciblage des campagnes est réservé au manager. Vos cibles à contacter sont sur votre accueil.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="cmp">
      <div className="section-header">
        <div>
          <div className="section-kicker">Vue direction · ciblage</div>
          <div className="section-title">Campagnes</div>
          <div className="section-sub">
            {fiches.chargement ? 'Chargement des fiches…' : `${pluriel(fiches.clients.length, 'fiche client', 'fiches clients')} évaluées en direct`}
            {nbEnCours > 0 ? ` · ${pluriel(nbEnCours, 'campagne en cours', 'campagnes en cours')}` : ''}
          </div>
        </div>
      </div>
      <SubTabs
        tabs={[{ key: 'cibler', label: 'Cibler' }, { key: 'en_cours', label: 'Campagnes en cours', badge: nbEnCours }]}
        active={onglet}
        onChange={setOnglet}
        ariaLabel="Sous onglets Campagnes"
      />
      {onglet === 'cibler' ? (
        <Ciblage
          clients={fiches.clients} equipement={fiches.equipement} familles={fiches.familles} conseillers={conseillers}
          chargement={fiches.chargement} erreur={fiches.erreur}
          onLancee={() => { setVersion((v) => v + 1); setOnglet('en_cours') }}
        />
      ) : (
        <CampagnesEnCours
          campagnes={suivi.campagnes} cibles={suivi.cibles} famillesLabels={famillesLabels} conseillersLabels={conseillersLabels}
          chargement={suivi.chargement} erreur={suivi.erreur}
          onRecharger={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  )
}
