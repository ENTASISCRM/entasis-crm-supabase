// ═══════════════════════════════════════════════════════════════════════════
// UNIVERS DISPONIBLE, PAR PARTENAIRE
//
// Une allocation type se recopie, mais elle vieillit. Entre la liste de
// l'assureur et le RDV d'aujourd'hui, un support peut avoir été absorbé ou
// dissous, et personne ne s'en aperçoit avant que l'arbitrage soit refusé.
// Cas réel, liste SwissLife de juin 2026 : Eurose C (FR0007051040), 4 % du
// pôle bas, absorbé le 21/05/2026.
//
// Ce bloc tient deux rôles, et aucun de plus. Il montre la liste officielle
// du partenaire, telle qu'elle a été extraite, et il rapproche l'allocation
// affichée de cette liste : présente, sortie du contrat avec le motif de
// l'assureur, ou absente de la liste. Il ne remplace rien tout seul et ne
// recalcule aucun poids : le CRM affiche et contrôle, il ne conçoit pas.
//
// La liste ne se charge qu'à la demande. 829 supports côté SwissLife : ce
// serait du gâchis pour un conseiller venu régler la molette et copier.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { chercher, sortieDuContrat, estFondsDAttente } from '../config/univers-uc'
import { FAMILLES } from '../config/conjoncture'
import { candidatsRemplacement } from '../lib/moteur-allocation'

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

// Les listes des assureurs sont datées d'un mois (« 2026-06 ») ou d'un jour
// (« 2026-09-04 »). On rend ce qu'on a, jamais une date reconstituée.
function dateLisible(valeur) {
  const s = String(valeur || '').trim()
  const mois = s.match(/^(\d{4})-(\d{2})$/)
  if (mois) return `${MOIS[Number(mois[2]) - 1] || mois[2]} ${mois[1]}`
  const jour = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (jour) return `${jour[3]}/${jour[2]}/${jour[1]}`
  return s
}

// Une donnée absente reste absente : un tiret, jamais un zéro. Le panorama
// Abeille ne porte ni frais ni performance, et « 0,00 % » ferait croire à une
// performance nulle mesurée.
const nombre = (v, suffixe) =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v))
    ? '—'
    : `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${suffixe}`

const pct = (n) => `${String(n).replace('.', ',')} %`

export default function UniversUC({
  partenaire,
  lignes,
  univers,
  statut,
  erreur,
  onDemander,
  onReessayer,
}) {
  const [ouvert, setOuvert] = useState(false)
  const [q, setQ] = useState('')
  const [classe, setClasse] = useState('')
  const [sriMax, setSriMax] = useState('')
  const [nbAffiches, setNbAffiches] = useState(25)

  function basculer() {
    const suivant = !ouvert
    setOuvert(suivant)
    // Le chargement part au premier dépliage, pas au montage de l'écran.
    if (suivant) onDemander()
  }

  const classes = useMemo(() => {
    if (!univers) return []
    const vues = new Set(univers.supports.map((s) => s.categorie).filter(Boolean))
    return [...vues].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [univers])

  const resultats = useMemo(() => {
    if (!univers) return []
    return chercher(univers, {
      q: q.trim() || undefined,
      classe: classe || undefined,
      // Sans plafond choisi on n'envoie rien : un support dont le SRI n'est
      // pas publié (plusieurs lignes Abeille) ne doit pas disparaître du seul
      // fait qu'on a laissé le filtre à son maximum.
      sriMax: sriMax ? Number(sriMax) : undefined,
      limite: 1000,
    }) || []
  }, [univers, q, classe, sriMax])

  // Rapprochement de l'allocation affichée à la liste du partenaire. Trois
  // issues, et on les nomme : présente, sortie du contrat (motif de
  // l'assureur), absente de la liste extraite.
  const rapprochement = useMemo(() => {
    if (!univers) return { sorties: [], absentes: [], presentes: 0 }
    const sorties = []
    const absentes = []
    let presentes = 0
    for (const l of lignes || []) {
      // La sortie prime sur la présence : chez SwissLife, cinq supports sont
      // encore souscriptibles et déjà annoncés sortants.
      const sortie = sortieDuContrat(univers, l.isin)
      if (sortie) { sorties.push({ ...sortie, poids: l.poids, fonds: l.fonds }); continue }
      // L'index du partenaire est rangé par ISIN mis en majuscules et sans
      // espace : on interroge avec la même clé, jamais avec la saisie brute.
      if (univers.parIsin?.get(String(l.isin || '').replace(/\s+/g, '').toUpperCase())) {
        presentes += 1
        continue
      }
      absentes.push(l)
    }
    return { sorties, absentes, presentes }
  }, [univers, lignes])

  // Le panorama Abeille est un PDF sans frais ni performance. On le dit une
  // fois, en tête, plutôt que de laisser croire à un trou de saisie ligne
  // après ligne.
  const avecChiffres = useMemo(
    () => !!univers && univers.supports.some((s) => s.fraisGestionMax != null || s.perfNetteAn != null),
    [univers],
  )

  const isinsAllocation = useMemo(() => (lignes || []).map((l) => l.isin), [lignes])
  const visibles = resultats.slice(0, nbAffiches)

  // Toute retouche de filtre ramène la pagination au début : sinon on garde
  // « 75 affichés » sur une recherche qui n'en rend que 3.
  function filtrer(maj) {
    maj()
    setNbAffiches(25)
  }

  return (
    <div className="card" style={{ marginTop: 20, padding: 20 }}>
      <div className="section-header" style={{ marginBottom: ouvert ? 14 : 0 }}>
        <div>
          <div className="section-kicker">Univers disponible</div>
          <div className="section-title" style={{ fontSize: 17 }}>
            Les supports référencés chez {partenaire.nom}
          </div>
          <div className="section-sub">
            La liste de l'assureur, telle qu'elle a été extraite. Elle sert à vérifier
            qu'une ligne de l'allocation existe encore, et à en chercher une autre.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={basculer}
          aria-expanded={ouvert}
          aria-controls="univers-corps"
        >
          {ouvert ? 'Masquer la liste' : 'Afficher la liste'}
        </button>
      </div>

      {ouvert && (
        <div id="univers-corps">
          {statut === 'chargement' && (
            <div className="form-hint" role="status">
              Lecture de la liste {partenaire.nom} en cours…
            </div>
          )}

          {statut === 'erreur' && (
            <div
              className="form-hint"
              role="alert"
              style={{ color: 'var(--cancelled)', borderLeft: '2px solid var(--cancelled)', paddingLeft: 12 }}
            >
              La liste {partenaire.nom} n'a pas pu être lue{erreur ? ` (${erreur})` : ''}.
              Rien n'est affiché, plutôt qu'une liste incomplète.
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={onReessayer}>
                  Réessayer
                </button>
              </div>
            </div>
          )}

          {statut === 'pret' && univers && (
            <>
              <div className="form-hint">
                {univers.supports.length} supports · liste publiée {dateLisible(univers.publie)} ·
                extraite le {dateLisible(univers.extraitLe)} du fichier {univers.sourceFichier}.
                {!avecChiffres && (
                  <> Ce document ne porte ni frais de gestion ni performance : les deux
                  colonnes restent vides, aucun chiffre n'a été reconstitué.</>
                )}
              </div>

              <RapprochementAllocation
                rapprochement={rapprochement}
                publie={dateLisible(univers.publie)}
              />

              <div className="table-toolbar" style={{ marginTop: 18 }}>
                <input
                  id="univers-q"
                  type="search"
                  className="search-input"
                  placeholder="Nom du support, ISIN, société de gestion…"
                  value={q}
                  onChange={(e) => filtrer(() => setQ(e.target.value))}
                  aria-label="Rechercher un support dans l'univers du partenaire"
                />
                <select
                  className="filter-select"
                  value={classe}
                  onChange={(e) => filtrer(() => setClasse(e.target.value))}
                  aria-label="Filtrer par classe d'actif"
                >
                  <option value="">Toutes les classes</option>
                  {classes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  className="filter-select"
                  value={sriMax}
                  onChange={(e) => filtrer(() => setSriMax(e.target.value))}
                  aria-label="SRI maximum"
                >
                  <option value="">Tous les SRI</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>SRI {n} au maximum</option>
                  ))}
                </select>
              </div>

              <div className="form-hint" style={{ marginTop: 8 }} aria-live="polite">
                {resultats.length === 0
                  ? 'Aucun support ne correspond.'
                  : `${visibles.length} support${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''} sur ${resultats.length} qui correspondent.`}
              </div>

              {resultats.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 10 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Support</th>
                        <th>ISIN</th>
                        <th>Classe</th>
                        <th style={{ textAlign: 'right' }}>SRI</th>
                        <th style={{ textAlign: 'right' }}>Frais max</th>
                        <th style={{ textAlign: 'right' }}>Performance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((s) => {
                        const attente = estFondsDAttente(s)
                        return (
                          <tr key={s.isin}>
                            <td>
                              <div className="cell-primary">{s.nom}</div>
                              <div className="cell-sub">
                                {s.societeGestion || '—'}
                                {s.sfdr ? ` · ${s.sfdr}` : ''}
                                {s.label ? ` · ${s.label}` : ''}
                                {attente && (
                                  <>
                                    {' · '}
                                    <span
                                      className="badge badge-normal"
                                      title="Verrou de la direction : le moteur ne propose jamais un fonds d'attente"
                                    >
                                      Fonds d'attente
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.isin}</td>
                            <td>{s.categorie || '—'}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {s.sri == null ? '—' : s.sri}
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {nombre(s.fraisGestionMax, ' %')}
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              <div>{nombre(s.perfNetteAn, ' %')}</div>
                              <div className="cell-sub">
                                {s.perfNette5AnsAnnualisee == null
                                  ? '—'
                                  : `${nombre(s.perfNette5AnsAnnualisee, ' %')} par an sur 5 ans`}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {visibles.length < resultats.length && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setNbAffiches((n) => n + 25)}
                  >
                    Afficher 25 supports de plus
                  </button>
                </div>
              )}

              {rapprochement.sorties.length > 0 && (
                <RemplacantsPossibles
                  univers={univers}
                  sorties={rapprochement.sorties}
                  isinsAllocation={isinsAllocation}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Ce que devient l'allocation affichée au regard de la liste du partenaire.
// Une sortie de contrat est un fait de l'assureur : on la reprend telle
// quelle, avec son motif et sa date.
// ─────────────────────────────────────────────────────────────────────────
function RapprochementAllocation({ rapprochement, publie }) {
  const { sorties, absentes, presentes } = rapprochement
  // Pôles non repris : il n'y a aucune ligne à rapprocher, et annoncer
  // « les 0 lignes figurent toutes dans la liste » ne rendrait service à
  // personne.
  if (!presentes && !sorties.length && !absentes.length) return null
  if (!sorties.length && !absentes.length) {
    return (
      <div className="form-hint" style={{ marginTop: 12, color: 'var(--signed)' }}>
        Les {presentes} lignes de l'allocation affichée figurent toutes dans cette liste.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 14 }}>
      {sorties.length > 0 && (
        <div
          className="form-hint"
          role="alert"
          style={{ color: 'var(--cancelled)', borderLeft: '2px solid var(--cancelled)', paddingLeft: 12 }}
        >
          {sorties.length} ligne{sorties.length > 1 ? 's' : ''} de l'allocation affichée
          {sorties.length > 1 ? ' ont' : ' a'} quitté le contrat. À trancher avant tout
          arbitrage : le CRM ne remplace rien tout seul.
        </div>
      )}

      {sorties.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Support sorti du contrat</th>
                <th>ISIN</th>
                <th style={{ textAlign: 'right' }}>Poids</th>
                <th>Motif de l'assureur</th>
              </tr>
            </thead>
            <tbody>
              {sorties.map((s) => (
                <tr key={s.isin}>
                  <td><div className="cell-primary">{s.nom || s.fonds}</div></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.isin}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {pct(s.poids)}
                  </td>
                  <td>{s.motif}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {absentes.length > 0 && (
        <div className="form-hint" style={{ marginTop: 10 }}>
          {absentes.length} ligne{absentes.length > 1 ? 's' : ''} de l'allocation
          {absentes.length > 1 ? ' ne figurent' : ' ne figure'} pas dans cette liste, sans y
          être signalée{absentes.length > 1 ? 's' : ''} comme sortie{absentes.length > 1 ? 's' : ''} :
          {' '}{absentes.map((l) => `${l.fonds} (${l.isin})`).join(', ')}.
          La liste a été publiée {publie} : une ligne plus récente qu'elle peut manquer
          sans avoir quitté le contrat. À confirmer auprès du partenaire.
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Chercher un remplaçant à une ligne sortie du contrat. Le CRM ne devine pas
// la famille d'un fonds qu'il ne connaît plus : c'est le conseiller qui la
// désigne, et le moteur se contente de sortir les candidats de cette famille,
// jamais un fonds d'attente. Rien ne s'applique, rien ne part en base.
// ─────────────────────────────────────────────────────────────────────────
function RemplacantsPossibles({ univers, sorties, isinsAllocation }) {
  const [famille, setFamille] = useState('')

  const candidats = useMemo(() => {
    if (!famille) return []
    return candidatsRemplacement(univers, famille, {
      exclureIsins: isinsAllocation,
      limite: 8,
    }) || []
  }, [univers, famille, isinsAllocation])

  return (
    <details style={{ marginTop: 18 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>
        Chercher un remplaçant aux {sorties.length} ligne{sorties.length > 1 ? 's' : ''} sortie{sorties.length > 1 ? 's' : ''}
      </summary>

      <div className="form-hint" style={{ marginTop: 10 }}>
        Un remplacement se décide, il ne se calcule pas. Choisissez la famille visée :
        le moteur sort les candidats de cette famille présents dans la liste du
        partenaire, hors supports déjà détenus et hors fonds d'attente.
      </div>

      <div className="table-toolbar" style={{ marginTop: 10 }}>
        <select
          className="filter-select"
          value={famille}
          onChange={(e) => setFamille(e.target.value)}
          aria-label="Famille du remplaçant recherché"
        >
          <option value="">Choisir une famille…</option>
          {FAMILLES.map((f) => <option key={f.cle} value={f.cle}>{f.nom}</option>)}
        </select>
      </div>

      {famille && candidats.length === 0 && (
        <div className="form-hint" style={{ marginTop: 10 }}>
          Aucun candidat dans cette famille chez ce partenaire.
        </div>
      )}

      {candidats.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidat</th>
                <th>ISIN</th>
                <th>Classe</th>
                <th style={{ textAlign: 'right' }}>SRI</th>
                <th style={{ textAlign: 'right' }}>Frais max</th>
              </tr>
            </thead>
            <tbody>
              {candidats.map((c) => (
                <tr key={c.isin}>
                  <td>
                    <div className="cell-primary">{c.nom}</div>
                    <div className="cell-sub">{c.societeGestion || '—'}</div>
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{c.isin}</td>
                  <td>{c.categorie || '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {c.sri == null ? '—' : c.sri}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {nombre(c.fraisGestionMax, ' %')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
