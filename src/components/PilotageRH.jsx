// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE RH — Module manager-only
// Édition des contrats des conseillers : type, salaire brut, paliers PP/PU,
// dates de début/fin, statut actif/inactif.
//
// CONFIDENTIALITÉ STRICTE
//   Composant rendu UNIQUEMENT si profile.role === 'manager'.
//   Les RLS Supabase doublent cette garde côté serveur.
//
// Doc canonique : src/lib/bareme-entasis.js
// Migration BDD : supabase/migrations/20260525130000_conseiller_contrats.sql
// ═══════════════════════════════════════════════════════════════════════════

import { Fragment, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import * as service from '../services/conseillerContrats'
import * as profilesService from '../services/profiles'
import { impersonate } from '../services/impersonation'
import { TYPES_CONTRAT, LIBELLE_TYPE_CONTRAT } from '../lib/contrat-enums'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')

// Contrats bornés dans le temps : la date de fin est obligatoire, c est elle
// qui pilote les projections (fin de contrat, fin des aides, remplacement).
const TYPES_BORNES = ['ALTERNANT', 'CDD', 'STAGIAIRE']

// Temps restant avant la fin de contrat, en clair (« dans 8 mois », « terminé »).
const resteAvant = (dateFin) => {
  if (!dateFin) return null
  const jours = Math.round((new Date(dateFin) - new Date()) / 86400000)
  if (jours < 0) return { texte: 'terminé', alerte: false, passe: true }
  if (jours <= 31) return { texte: `dans ${jours} j`, alerte: true, passe: false }
  const mois = Math.round(jours / 30.4)
  return { texte: `dans ${mois} mois`, alerte: mois <= 3, passe: false }
}

const TYPE_COLORS = {
  GERANT:     { bg: 'var(--gold-soft, rgba(201,169,97,0.12))', fg: 'var(--gold-dk, #A6843F)' },
  CDI:        { bg: 'rgba(0,113,227,0.10)',                    fg: '#0071E3' },
  CDD:        { bg: 'rgba(0,113,227,0.10)',                    fg: '#0071E3' },
  ALTERNANT:  { bg: 'rgba(52,199,89,0.10)',                    fg: '#1F8B3B' },
  STAGIAIRE:  { bg: 'rgba(255,149,0,0.10)',                    fg: '#B36B00' },
  MANDATAIRE: { bg: 'rgba(0,0,0,0.04)',                        fg: 'var(--t2)' },
}

const EMPTY_CONTRAT = {
  matricule: '',
  full_name: '',
  type_contrat: 'CDI',
  salaire_brut_mensuel: 0,
  reste_a_charge_mensuel: '',
  palier_pp_mensuel: 0,
  palier_pu_mensuel: 0,
  date_debut: new Date().toISOString().slice(0, 10),
  date_fin: null,
  actif: true,
  notes: '',
}

export default function PilotageRH() {
  const [contrats, setContrats] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // contrat en cours d'édition (modale)
  const [creating, setCreating] = useState(false)
  const [prefillProfile, setPrefillProfile] = useState(null)
  const [filterType, setFilterType] = useState('all')
  const [filterActif, setFilterActif] = useState('actifs')
  const [search, setSearch] = useState('')

  const reload = async () => {
    setLoading(true)
    try {
      const [data, prof] = await Promise.all([
        service.list(),
        profilesService.listTeam().catch(() => []),
      ])
      setContrats(data)
      setProfiles(prof)
    } catch (e) {
      toast.error('Erreur de chargement : ' + (e.message || ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  // Helper : normalisation de nom pour matching (insensible casse / accents /
  // tirets / apostrophes). "Nans MARRO-DUZAT" === "Nans Marro Duzat" ===
  // "nans marro-duzat", etc. Critique pour le matching des profils orphelins
  // où le format du nom diffère entre profiles.full_name et
  // conseiller_contrats.full_name.
  const normNom = (s) => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // sans accents
    .replace(/[-–—_'.]/g, ' ')                          // tirets/apostrophes → espace
    .replace(/\s+/g, ' ').trim()

  // Profils Supabase non encore reliés à un contrat.
  // Pour chacun, on cherche un contrat existant sans profile_id qui matche
  // par nom (ou par matricule = advisor_code). Si trouvé → on propose
  // "Lier au contrat existant" au lieu de "+ Créer son contrat".
  // Permet de rattraper les contrats seedés sans profile_id.
  const profilsOrphelins = useMemo(() => {
    const linkedIds = new Set(contrats.map(c => c.profile_id).filter(Boolean))
    const contratsLibres = contrats.filter(c => !c.profile_id)
    return profiles
      .filter(p => p.is_active && !linkedIds.has(p.id))
      .map(p => {
        const contratExistant = contratsLibres.find(c =>
          normNom(c.full_name) === normNom(p.full_name) ||
          (p.advisor_code && c.matricule && p.advisor_code.toUpperCase() === c.matricule.toUpperCase())
        )
        return { ...p, contratExistant }
      })
      .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''))
  }, [profiles, contrats])

  // Liaisons automatiques possibles (profil ↔ contrat existant)
  const liaisonsPossibles = profilsOrphelins.filter(p => p.contratExistant)

  const handleLierAuContrat = async (profilId, contratId) => {
    try {
      await service.update(contratId, { profile_id: profilId })
      toast.success('Contrat lié')
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    }
  }

  const handleLierTous = async () => {
    if (liaisonsPossibles.length === 0) return
    if (!confirm(`Lier automatiquement ${liaisonsPossibles.length} contrat(s) existant(s) à leur profil ? Les contrats sont matchés par nom ou code.`)) return
    let ok = 0
    for (const p of liaisonsPossibles) {
      try {
        await service.update(p.contratExistant.id, { profile_id: p.id })
        ok++
      } catch (e) {
        console.error('[PilotageRH] lier tous', e)
      }
    }
    toast.success(`${ok}/${liaisonsPossibles.length} contrat(s) liés`)
    reload()
  }

  const filtered = useMemo(() => {
    return contrats.filter(c => {
      if (filterType !== 'all' && c.type_contrat !== filterType) return false
      if (filterActif === 'actifs' && !c.actif) return false
      if (filterActif === 'inactifs' && c.actif) return false
      if (search) {
        const s = search.toLowerCase()
        if (!(c.full_name || '').toLowerCase().includes(s) &&
            !(c.matricule || '').toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [contrats, filterType, filterActif, search])

  const stats = useMemo(() => {
    const actifs = contrats.filter(c => c.actif)
    return {
      total: actifs.length,
      cdi: actifs.filter(c => c.type_contrat === 'CDI').length,
      cdd: actifs.filter(c => c.type_contrat === 'CDD').length,
      alternants: actifs.filter(c => c.type_contrat === 'ALTERNANT').length,
      stagiaires: actifs.filter(c => c.type_contrat === 'STAGIAIRE').length,
      mandataires: actifs.filter(c => c.type_contrat === 'MANDATAIRE').length,
      masseSalarialeMensuelle: actifs.reduce((sum, c) => sum + Number(c.salaire_brut_mensuel || 0), 0),
      // Coût réel : le reste à charge quand il est saisi, sinon le brut. C est
      // ce chiffre qui sert aux projections financières (les alternants coûtent
      // bien moins que leur brut une fois les aides déduites).
      coutReelMensuel: actifs.reduce((sum, c) => sum + (
        c.reste_a_charge_mensuel != null && c.reste_a_charge_mensuel !== ''
          ? Number(c.reste_a_charge_mensuel)
          : Number(c.salaire_brut_mensuel || 0)
      ), 0),
      // Nombre de contrats pour lesquels le reste à charge n est pas encore saisi
      sansResteACharge: actifs.filter(c => (c.reste_a_charge_mensuel == null || c.reste_a_charge_mensuel === '') && Number(c.salaire_brut_mensuel || 0) > 0).length,
    }
  }, [contrats])

  const handleSave = async (payload) => {
    try {
      if (payload.id) {
        await service.update(payload.id, payload)
        toast.success('Contrat mis à jour')
      } else {
        await service.create(payload)
        toast.success('Contrat créé')
      }
      setEditing(null)
      setCreating(false)
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    }
  }

  const handleToggleActif = async (contrat) => {
    if (!confirm(`${contrat.actif ? 'Désactiver' : 'Réactiver'} le contrat de ${contrat.full_name} ?`)) return
    try {
      await service.setActif(contrat.id, !contrat.actif)
      toast.success(contrat.actif ? 'Contrat désactivé' : 'Contrat réactivé')
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    }
  }

  // Impersonation : génère un magic link et ouvre la session du conseiller
  // ciblé dans un nouvel onglet. Tout est audité côté serveur.
  const handleImpersonate = async (contrat) => {
    if (!contrat.profile_id) {
      toast.error('Aucun profil Supabase lié — impossible d\'impersonner')
      return
    }
    const reason = prompt(
      `Se connecter en tant que ${contrat.full_name} ?\n\n` +
      `L'action sera journalisée dans audit_impersonation.\n` +
      `Raison (optionnelle) :`,
      ''
    )
    if (reason === null) return  // Annulé
    const toastId = toast.loading('Génération du lien…')
    try {
      const { link, target } = await impersonate(contrat.profile_id, reason)
      toast.success(`Connecté en tant que ${target.full_name || target.email}`, { id: toastId })
      // Ouvre dans un onglet de navigation privée idéalement, mais le browser
      // ne permet pas de forcer ça en JS → on ouvre dans un nouvel onglet
      // et on prévient l'utilisateur.
      window.open(link, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''), { id: toastId })
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <div>
          <div className="section-kicker">Module manager · Confidentiel</div>
          <div className="section-title">Pilotage RH</div>
          <div className="section-sub">Contrats, salaires, paliers de commission par conseiller. Les conseillers n'ont accès qu'à leur propre ligne.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nouveau contrat</button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid mb-24">
        <div className="kpi-card kpi-card-blue">
          <div className="kpi-label">Effectif actif</div>
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-hint">{stats.cdi} CDI · {stats.cdd} CDD · {stats.alternants} alt. · {stats.stagiaires} stag. · {stats.mandataires} mand.</div>
        </div>
        <div className="kpi-card kpi-card-gold">
          <div className="kpi-label">Masse salariale brute / mois</div>
          <div className="kpi-value">{fmtEur(stats.masseSalarialeMensuelle)}</div>
          <div className="kpi-hint">Hors charges patronales et variables</div>
        </div>
        <div className="kpi-card kpi-card-green">
          <div className="kpi-label">Coût réel entreprise / mois</div>
          <div className="kpi-value">{fmtEur(stats.coutReelMensuel)}</div>
          <div className="kpi-hint">
            {fmtEur(stats.coutReelMensuel * 12)} / an
            {stats.masseSalarialeMensuelle > stats.coutReelMensuel
              ? ` · ${fmtEur(stats.masseSalarialeMensuelle - stats.coutReelMensuel)} d aides / mois`
              : ''}
            {stats.sansResteACharge > 0 ? ` · ${stats.sansResteACharge} contrat(s) au brut faute de saisie` : ''}
          </div>
        </div>
        <div className="kpi-card kpi-card-amber">
          <div className="kpi-label">Mandataires</div>
          <div className="kpi-value">{stats.mandataires}</div>
          <div className="kpi-hint">Indépendants — facturent Entasis</div>
        </div>
      </div>

      {/* Profils Supabase sans contrat (orphelins) */}
      {profilsOrphelins.length > 0 && (
        <div className="card mb-24" style={{ borderTop: '2px solid var(--apple-orange, #FF9500)' }}>
          <div className="panel-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#FF9500' }}>
                À traiter · {profilsOrphelins.length} profil{profilsOrphelins.length !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginTop: 4 }}>
                Profils Supabase sans contrat
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                {liaisonsPossibles.length > 0
                  ? `${liaisonsPossibles.length} profil(s) matchent un contrat existant non lié — peut être rattaché en 1 clic.`
                  : "Ces conseillers se sont inscrits via une invitation mais n'ont pas encore de contrat."}
              </div>
            </div>
            {liaisonsPossibles.length > 0 && (
              <button className="btn btn-primary btn-sm" onClick={handleLierTous}>
                ↪ Lier auto les {liaisonsPossibles.length} match{liaisonsPossibles.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profilsOrphelins.map(p => {
              const hasMatch = !!p.contratExistant
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: hasMatch ? 'rgba(52,199,89,0.05)' : 'rgba(0,0,0,0.025)',
                  border: `0.5px solid ${hasMatch ? 'rgba(52,199,89,0.25)' : 'var(--bd)'}`,
                  borderRadius: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                      {p.full_name || '(sans nom)'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                      {p.email} · {p.advisor_code ? `Code ${p.advisor_code}` : 'Sans code'} · {p.role === 'manager' ? 'Manager' : 'Conseiller'}
                    </div>
                    {hasMatch && (
                      <div style={{ fontSize: 11, color: 'var(--signed)', marginTop: 4, fontWeight: 500 }}>
                        ✓ Contrat trouvé : {p.contratExistant.full_name}
                        {p.contratExistant.matricule ? ` (mat. ${p.contratExistant.matricule})` : ''}
                      </div>
                    )}
                  </div>
                  {hasMatch ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleLierAuContrat(p.id, p.contratExistant.id)}
                      >↪ Lier au contrat existant</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setPrefillProfile(p)
                          setCreating(true)
                        }}
                        title="Créer un nouveau contrat (ignorer le match)"
                      >+ Créer</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {/* Dropdown de liaison manuelle pour les cas où le
                          matching auto échoue (typos, prénoms différents, etc.).
                          Louis voit tous les contrats orphelins et choisit. */}
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const contratId = e.target.value
                          if (contratId) handleLierAuContrat(p.id, contratId)
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '0.5px solid var(--bd)',
                          background: 'rgba(0,0,0,0.04)',
                          fontSize: 12,
                          fontFamily: 'inherit',
                          color: 'var(--t1)',
                          cursor: 'pointer',
                          maxWidth: 220,
                        }}
                        title="Lier ce profil à un contrat existant sans liaison"
                      >
                        <option value="">↪ Lier à un contrat…</option>
                        {contrats
                          .filter(c => !c.profile_id && c.actif)
                          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                          .map(c => (
                            <option key={c.id} value={c.id}>
                              {c.full_name}{c.matricule ? ` (mat. ${c.matricule})` : ''} · {LIBELLE_TYPE_CONTRAT[c.type_contrat]}
                            </option>
                          ))}
                      </select>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setPrefillProfile(p)
                          setCreating(true)
                        }}
                      >+ Créer</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Frise chronologique — vue d'ensemble des échéances RH */}
      <TimelineRH contrats={contrats} />

      {/* Toolbar filtres */}
      <div className="table-toolbar mb-16" style={{ marginBottom: 16 }}>
        <input className="search-input" placeholder="Rechercher un conseiller…"
               value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">Tous les types</option>
          {TYPES_CONTRAT.map(t => <option key={t} value={t}>{LIBELLE_TYPE_CONTRAT[t]}</option>)}
        </select>
        <select className="filter-select" value={filterActif} onChange={e => setFilterActif(e.target.value)}>
          <option value="actifs">Actifs seulement</option>
          <option value="inactifs">Inactifs seulement</option>
          <option value="all">Tous</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Conseiller</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Brut / mois</th>
              <th style={{ textAlign: 'right' }}>Reste à charge</th>
              <th style={{ textAlign: 'right' }}>Palier PP</th>
              <th style={{ textAlign: 'right' }}>Palier PU</th>
              <th>Début</th>
              <th>Fin</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="table-empty-state">
                <div className="empty-title">Aucun contrat trouvé</div>
                <div className="empty-sub">Ajuste les filtres ou ajoute un nouveau contrat</div>
              </td></tr>
            ) : filtered.map(c => {
              const col = TYPE_COLORS[c.type_contrat] || TYPE_COLORS.CDI
              return (
                <tr key={c.id} style={{ opacity: c.actif ? 1 : 0.5 }}>
                  <td>
                    <div className="cell-primary">{c.full_name}</div>
                    <div className="cell-sub">{c.matricule ? `Mat. ${c.matricule}` : 'Sans matricule'}</div>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', padding: '3px 10px', borderRadius: 999,
                      fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
                      background: col.bg, color: col.fg,
                    }}>
                      {LIBELLE_TYPE_CONTRAT[c.type_contrat] || c.type_contrat}
                    </span>
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{fmtEur(c.salaire_brut_mensuel)}</td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>
                    {c.reste_a_charge_mensuel != null && c.reste_a_charge_mensuel !== ''
                      ? fmtEur(c.reste_a_charge_mensuel)
                      : <span style={{ color: 'var(--t3)' }}>à saisir</span>}
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{c.palier_pp_mensuel > 0 ? fmtEur(c.palier_pp_mensuel) : '—'}</td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{c.palier_pu_mensuel > 0 ? fmtEur(c.palier_pu_mensuel) : '—'}</td>
                  <td>{fmtDate(c.date_debut)}</td>
                  <td>
                    {c.date_fin ? (
                      <>
                        <div>{fmtDate(c.date_fin)}</div>
                        {(() => {
                          const r = c.actif ? resteAvant(c.date_fin) : null
                          if (!r) return null
                          return (
                            <div className="cell-sub" style={{ color: r.alerte ? 'var(--danger, #c0392b)' : undefined }}>
                              {r.texte}
                            </div>
                          )
                        })()}
                      </>
                    ) : TYPES_BORNES.includes(c.type_contrat) && c.actif ? (
                      <span style={{ color: 'var(--danger, #c0392b)', fontSize: 12 }}>à saisir</span>
                    ) : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                      {c.profile_id && c.actif && c.type_contrat !== 'GERANT' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleImpersonate(c)}
                          title="Se connecter en tant que ce conseiller (action auditée)"
                        >👤 Voir en tant que</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Éditer</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleToggleActif(c)}>
                        {c.actif ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modale d'édition / création */}
      {(editing || creating) && (
        <ContratModal
          contrat={
            editing
              ? editing
              : prefillProfile
                ? {
                    ...EMPTY_CONTRAT,
                    profile_id: prefillProfile.id,
                    full_name: prefillProfile.full_name || '',
                    matricule: prefillProfile.advisor_code || '',
                  }
                : { ...EMPTY_CONTRAT }
          }
          profiles={profiles}
          contratsExistants={contrats}
          onClose={() => { setEditing(null); setCreating(false); setPrefillProfile(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Modale d'édition / création de contrat
// ─────────────────────────────────────────────────────────────────────────
function ContratModal({ contrat, profiles = [], contratsExistants = [], onClose, onSave }) {
  const [form, setForm] = useState(contrat)
  const isNew = !contrat.id

  const handleChange = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  // Profils disponibles pour la liaison : actifs + non liés ailleurs (sauf
  // celui qu'on est en train d'éditer s'il était déjà lié).
  const profilsLies = useMemo(() => {
    const lies = new Set(
      contratsExistants
        .filter(c => c.id !== contrat.id && c.profile_id)
        .map(c => c.profile_id)
    )
    return profiles.filter(p => p.is_active && !lies.has(p.id))
  }, [profiles, contratsExistants, contrat.id])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.full_name?.trim()) return toast.error('Nom requis')
    if (!form.type_contrat) return toast.error('Type de contrat requis')
    if (!form.date_debut) return toast.error('Date de début requise')
    if (TYPES_BORNES.includes(form.type_contrat) && !form.date_fin) {
      return toast.error(`Date de fin requise pour un contrat ${LIBELLE_TYPE_CONTRAT[form.type_contrat] || form.type_contrat}`)
    }
    if (form.date_fin && form.date_debut && form.date_fin < form.date_debut) {
      return toast.error('La date de fin doit être après la date de début')
    }
    onSave(form)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-head">
            <div>
              <div className="modal-title">{isNew ? 'Nouveau contrat' : `Éditer · ${contrat.full_name}`}</div>
              <div className="modal-subtitle">Confidentiel — données salariales</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            {/* Profil Supabase lié — clé pour que le conseiller voie sa
                ligne via les RLS et que les deals soient correctement
                rattachés (advisor_code). */}
            <div className="form-group">
              <label className="form-label">Profil Supabase lié</label>
              <select
                className="form-select"
                value={form.profile_id || ''}
                onChange={e => {
                  const id = e.target.value || null
                  const p = profilsLies.find(x => x.id === id)
                  setForm(prev => ({
                    ...prev,
                    profile_id: id,
                    // Pré-remplit nom + matricule si vides et qu'on lie
                    full_name: prev.full_name || (p?.full_name || ''),
                    matricule: prev.matricule || (p?.advisor_code || ''),
                  }))
                }}
              >
                <option value="">— Aucun (contrat orphelin) —</option>
                {profilsLies.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || '(sans nom)'} · {p.email} {p.advisor_code ? `· ${p.advisor_code}` : ''}
                  </option>
                ))}
              </select>
              <div className="form-hint">
                Sans lien, le conseiller ne pourra pas voir sa rémunération côté CRM (RLS).
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Nom complet</label>
                <input className="form-input" value={form.full_name || ''}
                       onChange={e => handleChange('full_name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Matricule</label>
                <input className="form-input" value={form.matricule || ''}
                       onChange={e => handleChange('matricule', e.target.value)}
                       placeholder="00009…" />
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Type de contrat</label>
                <select className="form-select" value={form.type_contrat}
                        onChange={e => handleChange('type_contrat', e.target.value)}>
                  {TYPES_CONTRAT.map(t => <option key={t} value={t}>{LIBELLE_TYPE_CONTRAT[t]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Salaire brut mensuel (€)</label>
                <input className="form-input" type="number" step="0.01" min="0"
                       value={form.salaire_brut_mensuel}
                       onChange={e => handleChange('salaire_brut_mensuel', e.target.value)} />
                <div className="form-hint">0 pour mandataire / gérant</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Reste à charge entreprise (€ / mois)</label>
                <input className="form-input" type="number" step="0.01" min="0"
                       placeholder="ce que l entreprise paie réellement"
                       value={form.reste_a_charge_mensuel ?? ''}
                       onChange={e => handleChange('reste_a_charge_mensuel', e.target.value)} />
                <div className="form-hint">
                  Coût réel après aides et exonérations (surtout alternants). Vide = on retient le brut.
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Aide mensuelle estimée</label>
                <input className="form-input" type="text" readOnly tabIndex={-1}
                       value={(() => {
                         const brut = Number(form.salaire_brut_mensuel || 0)
                         const rac = String(form.reste_a_charge_mensuel ?? '').trim()
                         if (rac === '' || brut <= 0) return '—'
                         const ecart = brut - Number(rac)
                         return ecart > 0 ? `${fmtEur(ecart)} / mois (${fmtEur(ecart * 12)} / an)` : '—'
                       })()} />
                <div className="form-hint">Écart entre le brut et le reste à charge, calculé.</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Palier PP mensuel (€)</label>
                <input className="form-input" type="number" step="100" min="0"
                       value={form.palier_pp_mensuel}
                       onChange={e => handleChange('palier_pp_mensuel', e.target.value)} />
                <div className="form-hint">Seuil PP à atteindre pour débloquer variable. 0 = aucun palier.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Palier PU mensuel (€)</label>
                <input className="form-input" type="number" step="1000" min="0"
                       value={form.palier_pu_mensuel}
                       onChange={e => handleChange('palier_pu_mensuel', e.target.value)} />
                <div className="form-hint">Seuil PU à atteindre. 0 = aucun palier.</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Date de début</label>
                <input className="form-input" type="date"
                       value={form.date_debut || ''}
                       onChange={e => handleChange('date_debut', e.target.value)} required />
              </div>
              <div className="form-group">
                {(() => {
                  const borne = TYPES_BORNES.includes(form.type_contrat)
                  const duree = (() => {
                    if (!form.date_debut || !form.date_fin) return null
                    const d = new Date(form.date_debut); const f = new Date(form.date_fin)
                    if (f < d) return null
                    const mois = Math.max(0, Math.round((f - d) / 2629800000))
                    return mois > 0 ? `${mois} mois de contrat` : null
                  })()
                  return (
                    <>
                      <label className="form-label">Date de fin {borne ? '(obligatoire)' : '(optionnel)'}</label>
                      <input className="form-input" type="date"
                             value={form.date_fin || ''}
                             min={form.date_debut || undefined}
                             required={borne}
                             onChange={e => handleChange('date_fin', e.target.value || null)} />
                      <div className="form-hint">
                        {borne
                          ? `Contrat borné : la fin pilote les projections${duree ? ` · ${duree}` : ''}`
                          : 'CDI et gérant : laisser vide'}
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes manager (privées)</label>
              <textarea className="form-textarea" rows={3}
                        value={form.notes || ''}
                        onChange={e => handleChange('notes', e.target.value)}
                        placeholder="Commentaires internes, dérogations, contexte…" />
            </div>

            {!isNew && (
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
                  <input type="checkbox" checked={!!form.actif}
                         onChange={e => handleChange('actif', e.target.checked)} />
                  Contrat actif
                </label>
              </div>
            )}
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">{isNew ? 'Créer' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Frise chronologique RH
// Une colonne par mois : les arrivées (embauches) au dessus de la ligne,
// les fins de contrat en dessous. Le regroupement par mois garantit zéro
// chevauchement, même quand plusieurs événements tombent le même jour.
// Fenêtre affichée : M moins 2 à M plus 5 (8 mois).
// ─────────────────────────────────────────────────────────────────────────
const VERT = '#34C759'
const ROUGE = '#FF3B30'

function TimelineRH({ contrats }) {
  const MOIS_AVANT = 2
  const MOIS_APRES = 5
  const moisFr = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

  const { events, mois, currentIdx } = useMemo(() => {
    const now = new Date()
    const startMonth = new Date(now.getFullYear(), now.getMonth() - MOIS_AVANT, 1)
    const endMonth = new Date(now.getFullYear(), now.getMonth() + MOIS_APRES + 1, 0)
    const totalMois = MOIS_AVANT + 1 + MOIS_APRES
    const mois = []
    for (let i = 0; i < totalMois; i++) {
      const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1)
      mois.push({
        date: d,
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: moisFr[d.getMonth()],
        annee: d.getFullYear(),
      })
    }
    const out = []
    for (const c of contrats) {
      if (!c.actif && !c.date_fin) continue
      const pushEv = (dateStr, type) => {
        if (!dateStr) return
        const d = new Date(dateStr)
        if (d < startMonth || d > endMonth) return
        out.push({
          date: d,
          type,
          contrat: c,
          sub: `${LIBELLE_TYPE_CONTRAT[c.type_contrat]}${c.matricule ? ` · ${c.matricule}` : ''}`,
        })
      }
      pushEv(c.date_debut, 'start')
      pushEv(c.date_fin, 'end')
    }
    out.sort((a, b) => a.date - b.date)
    out.forEach((ev, i) => { ev.idx = i })
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentIdx = mois.findIndex(m => m.key === currentKey)
    return { events: out, mois, currentIdx }
  }, [contrats])

  // Regroupe les événements par mois, arrivées et fins séparées
  const parMois = useMemo(() => {
    const map = new Map(mois.map(m => [m.key, { starts: [], ends: [] }]))
    for (const ev of events) {
      const key = `${ev.date.getFullYear()}-${String(ev.date.getMonth() + 1).padStart(2, '0')}`
      const slot = map.get(key)
      if (slot) slot[ev.type === 'start' ? 'starts' : 'ends'].push(ev)
    }
    return map
  }, [events, mois])

  if (events.length === 0) {
    return (
      <div className="card card-p mb-24" style={{ textAlign: 'center', padding: '20px 16px', color: 'var(--t3)', fontSize: 13 }}>
        Aucune échéance RH dans les 6 prochains mois.
      </div>
    )
  }

  const now = new Date()
  const nbArrivees = events.filter(e => e.type === 'start').length
  const nbFins = events.length - nbArrivees
  const AXE = 26    // position verticale de la ligne dans la cellule axe

  // Une puce événement : jour en gros, nom, type de contrat
  const puce = (ev) => {
    const isStart = ev.type === 'start'
    const color = isStart ? VERT : ROUGE
    const isPast = ev.date < now
    const jours = Math.ceil((ev.date - now) / 86400000)
    const compteARebours = !isStart && !isPast && jours <= 45 ? `J-${jours}` : null
    return (
      <div
        key={`${ev.contrat.id}-${ev.type}`}
        className="tlm-chip"
        title={`${ev.contrat.full_name} : ${isStart ? 'embauche' : 'fin de contrat'} le ${ev.date.toLocaleDateString('fr-FR')} (${ev.sub})`}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#fff',
          border: '0.5px solid var(--bd)',
          borderLeft: `3px solid ${color}`,
          borderRadius: 10,
          padding: '6px 9px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          animationDelay: `${(ev.idx || 0) * 45}ms`,
          '--tl-opacity': isPast ? 0.55 : 1,
          opacity: isPast ? 0.55 : 1,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 24, textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {String(ev.date.getDate()).padStart(2, '0')}
          </div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginTop: 2 }}>
            {isStart ? 'arr.' : 'fin'}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ev.contrat.full_name}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ev.sub}
          </div>
        </div>
        {compteARebours && (
          <div style={{
            fontSize: 9, fontWeight: 700, color: ROUGE, flexShrink: 0,
            background: 'rgba(255,59,48,0.10)', padding: '2px 6px', borderRadius: 999,
          }}>
            {compteARebours}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card mb-24 timeline-rh">
      <div className="panel-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Frise chronologique
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginTop: 4 }}>
            Échéances RH sur {mois.length} mois
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            Arrivées en haut, fins de contrat en bas.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, fontWeight: 600, color: 'var(--t2)', paddingTop: 4, flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: VERT }} />
            {nbArrivees} arrivée{nbArrivees > 1 ? 's' : ''}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ROUGE }} />
            {nbFins} fin{nbFins > 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '18px 16px 14px', overflowX: 'auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${mois.length}, minmax(148px, 1fr))`,
          minWidth: mois.length * 148,
        }}>
          {mois.map((m, i) => {
            const slot = parMois.get(m.key) || { starts: [], ends: [] }
            const isCurrent = i === currentIdx
            const isPastM = i < currentIdx
            const colBg = isCurrent ? 'rgba(201,169,97,0.06)' : 'transparent'
            // Position du repère aujourd'hui dans le mois courant (bornée pour rester lisible)
            const joursDansMois = new Date(m.date.getFullYear(), m.date.getMonth() + 1, 0).getDate()
            const todayPct = Math.min(86, Math.max(14, (now.getDate() / joursDansMois) * 100))
            return (
              <Fragment key={m.key}>
                {/* Zone haute : les arrivées du mois */}
                <div style={{
                  gridColumn: i + 1, gridRow: 1,
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  gap: 6, padding: '6px 5px 14px',
                  background: colBg,
                  borderRadius: isCurrent ? '12px 12px 0 0' : 0,
                }}>
                  {slot.starts.map(puce)}
                </div>
                {/* Cellule axe : segment de ligne, point du mois, label */}
                <div style={{ gridColumn: i + 1, gridRow: 2, position: 'relative', height: 66, background: colBg }}>
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: AXE, height: 2,
                    background: isPastM ? 'rgba(0,0,0,0.06)' : 'rgba(201,169,97,0.30)',
                  }} />
                  <div
                    className={isCurrent ? 'timeline-dot-current' : ''}
                    style={{
                      position: 'absolute', left: '50%', top: AXE + 1,
                      transform: 'translate(-50%, -50%)',
                      width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10,
                      borderRadius: '50%',
                      background: isCurrent ? 'var(--gold)' : isPastM ? '#D0D0D5' : '#fff',
                      border: isCurrent ? '2px solid #fff' : `2px solid ${isPastM ? '#D0D0D5' : 'var(--bd-strong)'}`,
                      boxShadow: isCurrent
                        ? '0 0 0 4px rgba(201,169,97,0.15), 0 2px 6px rgba(201,169,97,0.35)'
                        : '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  />
                  <div style={{
                    position: 'absolute', left: '50%', top: AXE + 12, transform: 'translateX(-50%)',
                    fontSize: 10.5, fontWeight: isCurrent ? 700 : 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    color: isCurrent ? 'var(--gold-dk)' : isPastM ? 'var(--t3)' : 'var(--t2)',
                  }}>
                    {m.label}
                    {(i === 0 || m.date.getMonth() === 0) && (
                      <span style={{ fontWeight: 500, color: 'var(--t3)', marginLeft: 4 }}>{m.annee}</span>
                    )}
                  </div>
                  {isCurrent && (
                    <div style={{
                      position: 'absolute', left: `${todayPct}%`, top: 0,
                      transform: 'translateX(-50%)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                      <div style={{
                        fontSize: 8.5, fontWeight: 700, letterSpacing: '0.09em',
                        color: 'var(--gold-dk)', textTransform: 'uppercase', marginBottom: 3, whiteSpace: 'nowrap',
                      }}>
                        aujourd'hui
                      </div>
                      <div style={{
                        width: 0, height: 0,
                        borderLeft: '5px solid transparent',
                        borderRight: '5px solid transparent',
                        borderTop: '6px solid var(--gold)',
                      }} />
                    </div>
                  )}
                </div>
                {/* Zone basse : les fins de contrat du mois */}
                <div style={{
                  gridColumn: i + 1, gridRow: 3,
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
                  gap: 6, padding: '14px 5px 6px',
                  background: colBg,
                  borderRadius: isCurrent ? '0 0 12px 12px' : 0,
                }}>
                  {slot.ends.map(puce)}
                </div>
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}
