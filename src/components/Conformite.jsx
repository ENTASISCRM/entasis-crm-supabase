// ═══════════════════════════════════════════════════════════════════════════
// CONFORMITÉ (DDA) : questionnaire client, profil investisseur et suivi des
// dossiers réglementaires pour les souscriptions PER (Recueil des exigences
// et besoins + Devoir de conseil, générés en PDF puis signés par le client).
//
// Cycle de vie d'un dossier : brouillon, genere, envoye, signe.
// Conseiller : voit uniquement ses dossiers (advisor_code).
// Manager : voit tout, avec un filtre par conseiller.
//
// Contenu du questionnaire : src/lib/conformite-questionnaire.js
// Génération PDF : src/lib/conformite-pdf.js
// Accès table conformite_dossiers : src/services/conformite.js
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import * as conformiteService from '../services/conformite'
import * as clientsService from '../services/clients'
import { supabase } from '../lib/supabase'
import {
  RISK_QUESTIONS,
  SCORE_MAX,
  PROFILS,
  PATRIMOINE_TRANCHES,
  TMI_OPTIONS,
  SITUATIONS_MATRIMONIALES,
  STATUTS_PRO,
  PPE_DEFINITION,
  NOTRE_CONSEIL_PER,
  computeScore,
  computeProfil,
  orientationMismatch,
  emptyReponses,
} from '../lib/conformite-questionnaire'
import { genRecueilPdf, genDevoirPdf } from '../lib/conformite-pdf'

const PRODUIT_DEFAUT = 'Plan Epargne Retraite Individuel (PER IN)'
const COMPAGNIE_DEFAUT = 'GENERALI'

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·')

// Suppression des accents pour les comparaisons de libellés (profil, etc.)
const sansAccents = (s) => String(s || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()

// ═══ Normalisation des listes d'options ═════════════════════════════════
// Les constantes du questionnaire peuvent être des tableaux de chaînes, de
// nombres ou d'objets { value, label }. On normalise ici pour rester
// robuste quel que soit le format retenu côté lib.
const optValue = (o) => (o && typeof o === 'object')
  ? (o.value ?? o.code ?? o.label ?? o.libelle ?? '')
  : o
const optLabel = (o) => {
  if (typeof o === 'number') return `${o} %`
  if (o && typeof o === 'object') return String(o.label ?? o.libelle ?? o.value ?? o.code ?? '')
  return String(o ?? '')
}
const enListe = (opts) => (Array.isArray(opts) ? opts : Object.values(opts || {}))

// ═══ Introspection du seed emptyReponses() ═══════════════════════════════
// La structure canonique des réponses est définie par la lib questionnaire.
// On résout ici les clés de section dynamiquement pour ne pas dépendre du
// nommage exact choisi côté lib (le PDF lit la même structure).
function seedSecurise() {
  try {
    const s = emptyReponses()
    return (s && typeof s === 'object') ? s : {}
  } catch {
    return {}
  }
}
const SEED_REF = seedSecurise()

function resoudreCleSection(candidats, defaut) {
  const cles = Object.keys(SEED_REF)
  for (const c of candidats) {
    if (cles.includes(c)) return c
  }
  for (const c of candidats) {
    const hit = cles.find((k) => k.includes(c))
    if (hit) return hit
  }
  return defaut
}

const CLE_SITUATION = resoudreCleSection(['situation'], 'situation')
const CLE_PRO = resoudreCleSection(['professionnelle', 'professionnel', 'pro'], 'professionnelle')
const CLE_REGL = resoudreCleSection(['reglementaire', 'reglementaires'], 'reglementaire')
const CLE_PATRIMOINE = resoudreCleSection(['patrimoine', 'patrimoniale', 'synthese'], 'patrimoine')
const CLE_CONTRAT = resoudreCleSection(['contrat', 'conseil'], 'contrat')
// La section risque est celle qui contient les identifiants des questions
const CLE_RISQUE = (() => {
  const ids = enListe(RISK_QUESTIONS).map((q, i) => q?.id || `q${i + 1}`)
  const hit = Object.keys(SEED_REF).find((k) => {
    const sec = SEED_REF[k]
    return sec && typeof sec === 'object' && !Array.isArray(sec) && ids.some((id) => id in sec)
  })
  return hit || resoudreCleSection(['risque', 'risk'], 'risque')
})()

// Clés des champs de la section Contrat et conseil (résolues sur le seed)
const CLES_CONTRAT_SEED = Object.keys(SEED_REF[CLE_CONTRAT] || {})
const K_DATE_EFFET = CLES_CONTRAT_SEED.find((k) => k.includes('effet'))
  || CLES_CONTRAT_SEED.find((k) => k.includes('date'))
  || 'date_effet'
const K_AGE_RETRAITE = CLES_CONTRAT_SEED.find((k) => k.includes('age')) || 'age_depart_retraite'
const K_FAIT_A = CLES_CONTRAT_SEED.find((k) => k.includes('fait')) || 'fait_a'

// ═══ Libellés des champs génériques ══════════════════════════════════════
const LIBELLES_CHAMPS = {
  civilite: 'Civilité',
  nom: 'Nom',
  prenom: 'Prénom',
  email: 'Email',
  telephone: 'Téléphone',
  date_naissance: 'Date de naissance',
  lieu_naissance: 'Lieu de naissance',
  nationalite: 'Nationalité',
  adresse: 'Adresse',
  code_postal: 'Code postal',
  ville: 'Ville',
  situation_matrimoniale: 'Situation matrimoniale',
  regime_matrimonial: 'Régime matrimonial',
  nb_enfants: "Nombre d'enfants",
  enfants_a_charge: 'Enfants à charge',
  personnes_a_charge: 'Personnes à charge',
  statut: 'Statut professionnel',
  statut_pro: 'Statut professionnel',
  profession: 'Profession',
  employeur: 'Employeur',
  secteur: "Secteur d'activité",
  anciennete: 'Ancienneté',
  revenus: 'Revenus annuels du foyer',
  revenus_annuels: 'Revenus annuels du foyer',
  revenus_foyer: 'Revenus du foyer',
  tmi: "Tranche marginale d'imposition (TMI)",
  ppe: 'Personne politiquement exposée (PPE)',
  ppe_fonction: 'Fonction PPE',
  us_person: 'US Person',
  residence_fiscale: 'Résidence fiscale',
  origine_fonds: 'Origine des fonds',
  capacite_juridique: 'Capacité juridique',
  protection_juridique: 'Mesure de protection juridique',
  patrimoine_total: 'Patrimoine global',
  immobilier: 'Immobilier',
  residence_principale: 'Résidence principale',
  liquidites: 'Liquidités',
  valeurs_mobilieres: 'Valeurs mobilières',
  assurance_vie: 'Assurance vie',
  epargne_retraite: 'Épargne retraite',
  emprunts: 'Emprunts en cours',
  credits: 'Crédits en cours',
  charges: 'Charges',
  charges_annuelles: 'Charges annuelles',
  capacite_epargne: "Capacité d'épargne mensuelle",
  objectifs: 'Objectifs',
  horizon: 'Horizon de placement',
  date_effet: "Date d'effet du contrat",
  age_retraite: 'Âge de départ à la retraite',
  age_depart_retraite: 'Âge de départ à la retraite',
  fait_a: 'Fait à',
  conseil: 'Texte du conseil',
}

function libelleChamp(cle) {
  if (LIBELLES_CHAMPS[cle]) return LIBELLES_CHAMPS[cle]
  const brut = String(cle).replace(/_/g, ' ').trim()
  return brut.charAt(0).toUpperCase() + brut.slice(1)
}

// Champs proposés par défaut si le seed ne fournit pas la section
const CHAMPS_DEFAUT = {
  [CLE_SITUATION]: ['nom', 'prenom', 'date_naissance', 'lieu_naissance', 'nationalite', 'adresse', 'code_postal', 'ville', 'email', 'telephone', 'situation_matrimoniale', 'nb_enfants'],
  [CLE_PRO]: ['statut', 'profession', 'employeur', 'anciennete', 'revenus_annuels', 'tmi'],
  [CLE_REGL]: ['ppe', 'ppe_fonction', 'us_person', 'residence_fiscale', 'origine_fonds'],
  [CLE_PATRIMOINE]: ['patrimoine_total', 'immobilier', 'liquidites', 'valeurs_mobilieres', 'assurance_vie', 'emprunts', 'charges_annuelles', 'capacite_epargne'],
}

function champsSection(cleSection) {
  const sec = SEED_REF[cleSection]
  if (sec && typeof sec === 'object' && !Array.isArray(sec)) {
    const cles = Object.keys(sec).filter((k) => {
      const v = sec[k]
      return !(v && typeof v === 'object' && !Array.isArray(v))
    })
    if (cles.length > 0) return cles
  }
  return CHAMPS_DEFAUT[cleSection] || []
}

// ═══ Statuts de dossier ══════════════════════════════════════════════════
const STATUTS = {
  brouillon: { label: 'Brouillon', style: { background: 'rgba(0,0,0,0.05)', color: 'var(--t3)', borderColor: 'transparent' } },
  genere: { label: 'PDF généré', style: { background: 'rgba(10,22,40,0.08)', color: 'var(--navy)', borderColor: 'rgba(10,22,40,0.15)' } },
  envoye: { label: 'Envoyé', style: { background: 'var(--gold-subtle)', color: 'var(--gold-dk)', borderColor: 'var(--gold-line)' } },
  signe: { label: 'Signé', style: { background: 'var(--signed-bg)', color: 'var(--signed)', borderColor: 'var(--signed-bd)' } },
}

function BadgeStatut({ statut }) {
  const meta = STATUTS[statut] || STATUTS.brouillon
  return <span className="badge" style={meta.style}>{meta.label}</span>
}

function styleBadgeProfil(label) {
  const l = sansAccents(label)
  if (l.includes('prudent') || l.includes('secur')) return { background: 'rgba(0,0,0,0.05)', color: 'var(--t2)', borderColor: 'transparent' }
  if (l.includes('equilibr')) return { background: 'rgba(0,113,227,0.10)', color: 'var(--apple-blue)', borderColor: 'rgba(0,113,227,0.18)' }
  if (l.includes('dynam')) return { background: 'var(--gold-subtle)', color: 'var(--gold-dk)', borderColor: 'var(--gold-line)' }
  if (l.includes('offens') || l.includes('agress') || l.includes('audac')) return { background: 'rgba(255,149,0,0.10)', color: '#B36B00', borderColor: 'rgba(255,149,0,0.20)' }
  return { background: 'rgba(10,22,40,0.08)', color: 'var(--navy)', borderColor: 'rgba(10,22,40,0.15)' }
}

function BadgeProfil({ label }) {
  if (!label) return <span style={{ color: 'var(--t3)', fontSize: 12 }}>Profil non calculé</span>
  return <span className="badge" style={styleBadgeProfil(label)}>{label}</span>
}

// Nom affiché d'un dossier (le client vit dans reponses.situation)
function nomClientDossier(row) {
  const sit = row?.reponses?.[CLE_SITUATION] || row?.reponses?.situation || {}
  const nom = `${sit.prenom || ''} ${sit.nom || ''}`.trim()
  return nom || 'Client sans nom'
}

// Calculs défensifs : la lib peut évoluer, on ne casse jamais l'UI
function scoreSecurise(reponses) {
  try { return Number(computeScore(reponses)) || 0 } catch { return 0 }
}
function profilSecurise(reponses) {
  try {
    // computeProfil attend le SCORE numerique, pas l objet reponses.
    const p = computeProfil(scoreSecurise(reponses))
    if (typeof p === 'string') return p
    return p?.label || p?.nom || p?.libelle || ''
  } catch { return '' }
}
function mismatchSecurise(reponses) {
  try { return !!orientationMismatch(reponses) } catch { return false }
}

// ═══════════════════════════════════════════════════════════════════════════
// Composant principal
// ═══════════════════════════════════════════════════════════════════════════
export default function Conformite({ profile }) {
  const isManager = profile?.role === 'manager'
  const [dossiers, setDossiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [ouvert, setOuvert] = useState(null)          // dossier en cours d'édition
  const [creation, setCreation] = useState(false)     // modale de création
  const [filtreConseiller, setFiltreConseiller] = useState('all')

  const reload = async () => {
    setLoading(true)
    try {
      const rows = await conformiteService.listAll()
      setDossiers(rows || [])
    } catch (e) {
      toast.error('Erreur de chargement : ' + (e.message || ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  // Périmètre : le conseiller ne voit que ses dossiers, le manager voit tout
  const visibles = useMemo(() => {
    let rows = dossiers
    if (!isManager) {
      rows = rows.filter((d) => d.advisor_code === profile?.advisor_code)
    } else if (filtreConseiller !== 'all') {
      rows = rows.filter((d) => d.advisor_code === filtreConseiller)
    }
    return rows
  }, [dossiers, isManager, profile?.advisor_code, filtreConseiller])

  const conseillers = useMemo(() => {
    const codes = new Set(dossiers.map((d) => d.advisor_code).filter(Boolean))
    return Array.from(codes).sort()
  }, [dossiers])

  const compteurs = useMemo(() => ({
    total: visibles.length,
    brouillons: visibles.filter((d) => d.statut === 'brouillon').length,
    generes: visibles.filter((d) => d.statut === 'genere').length,
    envoyes: visibles.filter((d) => d.statut === 'envoye').length,
    signes: visibles.filter((d) => d.statut === 'signe').length,
  }), [visibles])

  const handleDelete = async (row) => {
    if (!confirm(`Supprimer le dossier de conformité de ${nomClientDossier(row)} ? Cette action est définitive.`)) return
    try {
      await conformiteService.remove(row.id)
      setDossiers((prev) => prev.filter((d) => d.id !== row.id))
      toast.success('Dossier supprimé')
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    }
  }

  // Répercute une mise à jour de ligne dans la liste (retour éditeur)
  const handleRowChange = (row) => {
    setDossiers((prev) => prev.map((d) => (d.id === row.id ? row : d)))
    setOuvert((prev) => (prev && prev.id === row.id ? row : prev))
  }

  const handleCreated = (row) => {
    setDossiers((prev) => [row, ...prev])
    setCreation(false)
    setOuvert(row)
  }

  // ═══ Vue éditeur ════════════════════════════════════════════════════════
  if (ouvert) {
    return (
      <EditeurDossier
        dossier={ouvert}
        profile={profile}
        onBack={() => setOuvert(null)}
        onRowChange={handleRowChange}
      />
    )
  }

  // ═══ Vue liste ══════════════════════════════════════════════════════════
  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Conformité · DDA</div>
          <div className="section-title">Recueils et devoirs de conseil</div>
          <div className="section-sub">
            Questionnaire client, profil investisseur, génération des documents réglementaires (Recueil des exigences et besoins, Devoir de conseil) et suivi des signatures.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreation(true)}>+ Nouveau recueil</button>
      </div>

      {/* Compteurs */}
      <div className="kpi-grid mb-24">
        <div className="kpi-card kpi-card-blue">
          <div className="kpi-label">Dossiers</div>
          <div className="kpi-value">{compteurs.total}</div>
          <div className="kpi-hint">{compteurs.brouillons} brouillon{compteurs.brouillons !== 1 ? 's' : ''}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">PDF générés</div>
          <div className="kpi-value">{compteurs.generes}</div>
          <div className="kpi-hint">En attente d'envoi au client</div>
        </div>
        <div className="kpi-card kpi-card-gold">
          <div className="kpi-label">Envoyés</div>
          <div className="kpi-value">{compteurs.envoyes}</div>
          <div className="kpi-hint">En attente de signature</div>
        </div>
        <div className="kpi-card kpi-card-green">
          <div className="kpi-label">Signés</div>
          <div className="kpi-value">{compteurs.signes}</div>
          <div className="kpi-hint">Dossiers conformes</div>
        </div>
      </div>

      {/* Filtre conseiller (manager uniquement) */}
      {isManager && conseillers.length > 0 && (
        <div className="table-toolbar" style={{ marginBottom: 16 }}>
          <select className="filter-select" value={filtreConseiller} onChange={(e) => setFiltreConseiller(e.target.value)}>
            <option value="all">Tous les conseillers</option>
            {conseillers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* Bandeau d'aide si aucune donnée */}
      {!loading && visibles.length === 0 && (
        <div className="card card-p mb-24" style={{ background: 'var(--gold-subtle)', border: '1px solid var(--gold-line)', padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 20, lineHeight: 1, marginTop: 2 }}>📋</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--t1)' }}>Aucun dossier de conformité pour le moment.</strong>{' '}
              Pour chaque souscription PER chez Generali, crée un recueil avec le bouton « Nouveau recueil » : le questionnaire calcule le profil investisseur puis génère le Recueil des exigences et besoins et le Devoir de conseil à faire signer au client.
            </div>
          </div>
        </div>
      )}

      {/* Tableau des dossiers */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Produit</th>
              {isManager && <th>Conseiller</th>}
              <th>Statut</th>
              <th>Score · Profil</th>
              <th>Mise à jour</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isManager ? 7 : 6} style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Chargement…</td></tr>
            ) : visibles.length === 0 ? (
              <tr><td colSpan={isManager ? 7 : 6} className="table-empty-state">
                <div className="empty-title">Aucun dossier</div>
                <div className="empty-sub">Clique sur « Nouveau recueil » pour créer ton premier dossier de conformité</div>
              </td></tr>
            ) : visibles.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="cell-primary">{nomClientDossier(row)}</div>
                  <div className="cell-sub">{row?.reponses?.[CLE_SITUATION]?.email || ''}</div>
                </td>
                <td>
                  <div>{row.produit || '·'}</div>
                  <div className="cell-sub">{[row.compagnie, row.nom_produit].filter(Boolean).join(' · ')}</div>
                </td>
                {isManager && <td className="cell-mono">{row.advisor_code || '·'}</td>}
                <td><BadgeStatut statut={row.statut} /></td>
                <td>
                  {row.profil ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="cell-mono" style={{ fontWeight: 600 }}>{row.score ?? '·'}/{SCORE_MAX}</span>
                      <BadgeProfil label={row.profil} />
                    </div>
                  ) : (
                    <span style={{ color: 'var(--t3)', fontSize: 12 }}>À compléter</span>
                  )}
                </td>
                <td>{fmtDate(row.updated_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setOuvert(row)}>Ouvrir</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}>Supprimer</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modale de création */}
      {creation && (
        <ModaleCreation
          profile={profile}
          onClose={() => setCreation(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Modale de création : recherche client, lien deal optionnel, produit
// ═══════════════════════════════════════════════════════════════════════════
function ModaleCreation({ profile, onClose, onCreated }) {
  const [query, setQuery] = useState('')
  const [resultats, setResultats] = useState([])
  const [client, setClient] = useState(null)
  const [deals, setDeals] = useState([])
  const [dealId, setDealId] = useState('')
  const [produit, setProduit] = useState(PRODUIT_DEFAUT)
  const [compagnie, setCompagnie] = useState(COMPAGNIE_DEFAUT)
  const [nomProduit, setNomProduit] = useState('')
  const [saving, setSaving] = useState(false)

  // Recherche client avec debounce 250 ms
  useEffect(() => {
    if (!query || query.length < 2 || client) {
      setResultats([])
      return
    }
    const t = setTimeout(async () => {
      const r = await clientsService.searchByQuery(query)
      setResultats(r || [])
    }, 250)
    return () => clearTimeout(t)
  }, [query, client])

  // Dossiers existants du client sélectionné (lien optionnel)
  useEffect(() => {
    if (!client?.id) {
      setDeals([])
      setDealId('')
      return
    }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, product, status')
        .eq('client_id', client.id)
      if (alive && !error) setDeals(data || [])
    })()
    return () => { alive = false }
  }, [client?.id])

  const handleCreate = async () => {
    if (!client?.id) return toast.error('Sélectionne un client')
    if (!produit.trim()) return toast.error('Produit requis')
    setSaving(true)
    try {
      // Seed du questionnaire, prérempli avec l'identité du client
      const seed = emptyReponses()
      seed[CLE_SITUATION] = {
        ...(seed[CLE_SITUATION] || {}),
        nom: client.nom || '',
        prenom: client.prenom || '',
        email: client.email || '',
        telephone: client.telephone || '',
      }
      const row = await conformiteService.create({
        client_id: client.id,
        deal_id: dealId || null,
        // La colonne est NOT NULL et un profil manager peut ne pas avoir de
        // code conseiller : repli DIRECTION (visible en vue manager).
        advisor_code: profile?.advisor_code || 'DIRECTION',
        produit: produit.trim(),
        compagnie: compagnie.trim(),
        nom_produit: nomProduit.trim(),
        statut: 'brouillon',
        reponses: seed,
      })
      toast.success('Dossier de conformité créé')
      onCreated(row)
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Nouveau recueil</div>
            <div className="modal-subtitle">Recueil des exigences et besoins · Devoir de conseil</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Recherche client */}
          <div className="form-group">
            <label className="form-label">Client</label>
            {client ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 12,
                background: 'var(--signed-bg)', border: '0.5px solid var(--signed-bd)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                    {`${client.prenom || ''} ${client.nom || ''}`.trim()}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                    {[client.email, client.telephone].filter(Boolean).join(' · ') || 'Coordonnées non renseignées'}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setClient(null); setQuery('') }}>Changer</button>
              </div>
            ) : (
              <>
                <input
                  className="form-input"
                  placeholder="Rechercher un client (nom, email, téléphone)…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {resultats.length > 0 && (
                  <div style={{ marginTop: 6, border: '0.5px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
                    {resultats.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setClient(r)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '10px 14px', background: 'var(--card)', border: 'none',
                          borderBottom: '0.5px solid var(--bd)', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                          {`${r.prenom || ''} ${r.nom || ''}`.trim() || '(sans nom)'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--t3)' }}>{r.email || r.telephone || ''}</div>
                      </button>
                    ))}
                  </div>
                )}
                {query.length >= 2 && resultats.length === 0 && (
                  <div className="form-hint">Aucun client trouvé. Le client doit exister dans le CRM avant de créer le recueil.</div>
                )}
              </>
            )}
          </div>

          {/* Lien vers un dossier existant du client (optionnel) */}
          {client && deals.length > 0 && (
            <div className="form-group">
              <label className="form-label">Lier à un dossier existant (optionnel)</label>
              <select className="form-select" value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">Aucun lien</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.product || 'Dossier'} · {d.status || ''}</option>
                ))}
              </select>
              <div className="form-hint">Permet de rattacher ce recueil au deal correspondant du CRM.</div>
            </div>
          )}

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Produit</label>
              <input className="form-input" value={produit} onChange={(e) => setProduit(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Compagnie</label>
              <input className="form-input" value={compagnie} onChange={(e) => setCompagnie(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Nom du produit</label>
            <input
              className="form-input"
              value={nomProduit}
              onChange={(e) => setNomProduit(e.target.value)}
              placeholder="Generali Patrimoine PER"
            />
            <div className="form-hint">Dénomination commerciale exacte du contrat, reprise dans les PDF.</div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" disabled={saving || !client} onClick={handleCreate}>
            {saving ? 'Création…' : 'Créer le dossier'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Éditeur d'un dossier : sections, score en direct, génération des PDF
// ═══════════════════════════════════════════════════════════════════════════
const SECTIONS = [
  { id: 'situation', cle: CLE_SITUATION, label: 'Situation personnelle' },
  { id: 'pro', cle: CLE_PRO, label: 'Situation professionnelle' },
  { id: 'regl', cle: CLE_REGL, label: 'Informations réglementaires' },
  { id: 'patrimoine', cle: CLE_PATRIMOINE, label: 'Synthèse patrimoniale' },
  { id: 'risque', cle: CLE_RISQUE, label: 'Profil de risque' },
  { id: 'contrat', cle: CLE_CONTRAT, label: 'Contrat et conseil' },
  { id: 'recap', cle: null, label: 'Récapitulatif' },
]

function EditeurDossier({ dossier, profile, onBack, onRowChange }) {
  // Fusion seed + réponses stockées : garantit la présence de toutes les
  // sections même si le questionnaire a évolué depuis la création du dossier
  const initiales = useMemo(() => {
    const seed = seedSecurise()
    const stockees = dossier.reponses || {}
    const fusion = { ...seed, ...stockees }
    for (const k of Object.keys(seed)) {
      if (seed[k] && typeof seed[k] === 'object' && !Array.isArray(seed[k])) {
        fusion[k] = { ...seed[k], ...(stockees[k] || {}) }
      }
    }
    return fusion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier.id])

  const [row, setRow] = useState(dossier)
  const [reponses, setReponses] = useState(initiales)
  const [section, setSection] = useState('situation')
  const [busy, setBusy] = useState(false)

  const setField = (cleSection, cle, valeur) => {
    setReponses((prev) => ({
      ...prev,
      [cleSection]: { ...(prev[cleSection] || {}), [cle]: valeur },
    }))
  }

  // Score, profil et cohérence recalculés en direct
  const score = useMemo(() => scoreSecurise(reponses), [reponses])
  const profilLabel = useMemo(() => profilSecurise(reponses), [reponses])
  const mismatch = useMemo(() => mismatchSecurise(reponses), [reponses])

  const questionsRisque = enListe(RISK_QUESTIONS)
  const nbRepondues = useMemo(() => {
    const risque = reponses[CLE_RISQUE] || {}
    return questionsRisque.reduce((n, q, i) => {
      const qid = q?.id || `q${i + 1}`
      const v = risque[qid]
      const ok = Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && v !== '')
      return n + (ok ? 1 : 0)
    }, 0)
  }, [reponses, questionsRisque])

  // Sauvegarde : réponses + score + profil persistés, statut selon patch
  const persist = async (patchExtra = {}) => {
    const patch = {
      reponses,
      score,
      profil: profilLabel || null,
      date_effet: reponses?.[CLE_CONTRAT]?.[K_DATE_EFFET] || null,
      updated_at: new Date().toISOString(),
      ...patchExtra,
    }
    const maj = await conformiteService.update(row.id, patch)
    setRow(maj)
    onRowChange(maj)
    return maj
  }

  const handleSave = async () => {
    setBusy(true)
    try {
      await persist()
      toast.success('Dossier enregistré')
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    } finally {
      setBusy(false)
    }
  }

  // Génération PDF : sauvegarde d'abord, passe le statut à genere si brouillon
  const handlePdf = async (type) => {
    setBusy(true)
    const toastId = toast.loading('Génération du PDF…')
    try {
      const patchExtra = {}
      if (row.statut === 'brouillon') {
        patchExtra.statut = 'genere'
        patchExtra.pdf_genere_at = new Date().toISOString()
      }
      const maj = await persist(patchExtra)
      const args = {
        dossier: { ...maj, reponses },
        advisorName: profile?.full_name || '',
        advisorEmail: profile?.email || '',
      }
      if (type === 'recueil') await genRecueilPdf(args)
      else await genDevoirPdf(args)
      toast.success(type === 'recueil' ? 'Recueil des exigences et besoins téléchargé' : 'Devoir de conseil téléchargé', { id: toastId })
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''), { id: toastId })
    } finally {
      setBusy(false)
    }
  }

  const handleMarquer = async (statut) => {
    setBusy(true)
    try {
      const patch = { statut }
      if (statut === 'envoye') patch.envoye_at = new Date().toISOString()
      if (statut === 'signe') patch.signe_at = new Date().toISOString()
      await persist(patch)
      toast.success(statut === 'envoye' ? 'Dossier marqué envoyé' : 'Dossier marqué signé')
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* En tête */}
      <div className="section-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 10 }}>← Retour à la liste</button>
          <div className="section-kicker">Conformité · DDA</div>
          <div className="section-title">{nomClientDossier(row)}</div>
          <div className="section-sub">
            {[row.produit, row.compagnie, row.nom_produit].filter(Boolean).join(' · ')}
          </div>
        </div>
        <BadgeStatut statut={row.statut} />
      </div>

      {/* Bandeau sticky : score en direct + actions */}
      <div style={{ position: 'sticky', top: 8, zIndex: 30, marginBottom: 16 }}>
        <div
          className="card"
          style={{
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(14px)',
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)' }}>Score</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>
              {score}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t3)' }}> / {SCORE_MAX}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 4 }}>Profil</div>
            <BadgeProfil label={profilLabel} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)' }}>Questionnaire risque</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: nbRepondues === questionsRisque.length ? 'var(--signed)' : 'var(--t2)' }}>
              {nbRepondues} / {questionsRisque.length} réponses
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={handleSave}>Enregistrer</button>
            <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => handlePdf('recueil')}>Recueil PDF</button>
            <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => handlePdf('devoir')}>Devoir de conseil PDF</button>
            {row.statut === 'genere' && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleMarquer('envoye')}>Marquer envoyé</button>
            )}
            {(row.statut === 'envoye' || row.statut === 'genere') && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleMarquer('signe')}>Marquer signé</button>
            )}
          </div>
        </div>
        {mismatch && (
          <div style={{
            marginTop: 8, padding: '10px 16px', borderRadius: 12,
            background: 'var(--progress-bg)', border: '1px solid var(--progress-bd)',
            fontSize: 13, color: '#B36B00', fontWeight: 500,
          }}>
            ⚠ L'orientation choisie (question 7) ne correspond pas au profil calculé.
          </div>
        )}
      </div>

      {/* Navigation par sections */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            className={`btn btn-sm ${section === s.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSection(s.id)}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      {/* Contenu de la section active */}
      {section === 'situation' && (
        <SectionGenerique titre="Situation personnelle" cleSection={CLE_SITUATION} reponses={reponses} setField={setField} />
      )}
      {section === 'pro' && (
        <SectionGenerique titre="Situation professionnelle" cleSection={CLE_PRO} reponses={reponses} setField={setField} />
      )}
      {section === 'regl' && (
        <SectionGenerique
          titre="Informations réglementaires"
          cleSection={CLE_REGL}
          reponses={reponses}
          setField={setField}
          intro={PPE_DEFINITION}
        />
      )}
      {section === 'patrimoine' && (
        <SectionGenerique titre="Synthèse patrimoniale" cleSection={CLE_PATRIMOINE} reponses={reponses} setField={setField} />
      )}
      {section === 'risque' && (
        <SectionRisque reponses={reponses} setField={setField} />
      )}
      {section === 'contrat' && (
        <SectionContrat reponses={reponses} setField={setField} />
      )}
      {section === 'recap' && (
        <SectionRecap
          row={row}
          reponses={reponses}
          score={score}
          profilLabel={profilLabel}
          mismatch={mismatch}
          nbRepondues={nbRepondues}
          nbQuestions={questionsRisque.length}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Section générique : champs pilotés par la structure du seed
// ═══════════════════════════════════════════════════════════════════════════
function SectionGenerique({ titre, cleSection, reponses, setField, intro }) {
  const cles = champsSection(cleSection)
  const valeurs = reponses[cleSection] || {}

  return (
    <div className="card">
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{titre}</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 20 }}>
        {intro && (
          <div style={{
            marginBottom: 16, padding: '12px 16px', borderRadius: 12,
            background: 'rgba(0,113,227,0.05)', border: '0.5px solid rgba(0,113,227,0.15)',
            fontSize: 12, color: 'var(--t2)', lineHeight: 1.55,
          }}>
            {intro}
          </div>
        )}
        {cles.length === 0 ? (
          <div style={{ color: 'var(--t3)', fontSize: 13 }}>Aucun champ défini pour cette section.</div>
        ) : (
          <div className="form-row form-row-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            {cles.map((cle) => (
              <ChampGenerique
                key={cle}
                cleSection={cleSection}
                cle={cle}
                valeur={valeurs[cle]}
                valeurSeed={(SEED_REF[cleSection] || {})[cle]}
                onChange={(v) => setField(cleSection, cle, v)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Sélecteur générique sur une liste d'options normalisées
function SelectOptions({ options, valeur, onChange }) {
  const liste = enListe(options)
  return (
    <select
      className="form-select"
      value={valeur === null || valeur === undefined ? '' : String(valeur)}
      onChange={(e) => {
        const brut = e.target.value
        if (brut === '') return onChange(null)
        const opt = liste.find((o) => String(optValue(o)) === brut)
        onChange(opt !== undefined ? optValue(opt) : brut)
      }}
    >
      <option value="">Choisir…</option>
      {liste.map((o, i) => (
        <option key={i} value={String(optValue(o))}>{optLabel(o)}</option>
      ))}
    </select>
  )
}

// Choix du widget selon la clé et le type de la valeur seed
function ChampGenerique({ cleSection, cle, valeur, valeurSeed, onChange }) {
  const k = String(cle).toLowerCase()
  const label = libelleChamp(cle)

  // Tableaux : saisie libre séparée par des virgules
  if (Array.isArray(valeurSeed) || Array.isArray(valeur)) {
    const texte = Array.isArray(valeur) ? valeur.join(', ') : (valeur || '')
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <input
          className="form-input"
          value={texte}
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="Valeurs séparées par des virgules"
        />
      </div>
    )
  }

  // Booléens et questions oui non réglementaires
  if (typeof valeurSeed === 'boolean' || k === 'ppe' || k === 'us_person' || k.startsWith('est_')) {
    const mode = typeof valeurSeed === 'boolean' ? 'bool' : 'texte'
    const affiche = mode === 'bool'
      ? (valeur === true ? 'oui' : valeur === false ? 'non' : '')
      : (valeur || '')
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <select
          className="form-select"
          value={affiche}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') return onChange(mode === 'bool' ? null : '')
            onChange(mode === 'bool' ? v === 'oui' : v)
          }}
        >
          <option value="">Choisir…</option>
          <option value="oui">Oui</option>
          <option value="non">Non</option>
        </select>
      </div>
    )
  }

  // Listes métier connues
  if (k.includes('matrimonial')) {
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <SelectOptions options={SITUATIONS_MATRIMONIALES} valeur={valeur} onChange={onChange} />
      </div>
    )
  }
  if (cleSection === CLE_PRO && k.includes('statut')) {
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <SelectOptions options={STATUTS_PRO} valeur={valeur} onChange={onChange} />
      </div>
    )
  }
  if (k.includes('tmi')) {
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <SelectOptions options={TMI_OPTIONS} valeur={valeur} onChange={onChange} />
      </div>
    )
  }
  if (k.includes('tranche') || (cleSection === CLE_PATRIMOINE && k.includes('patrimoine'))) {
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <SelectOptions options={PATRIMOINE_TRANCHES} valeur={valeur} onChange={onChange} />
      </div>
    )
  }

  // Zones de texte longues
  if (k.includes('adresse') || k.includes('objectif') || k.includes('commentaire') || k.includes('observation') || k.includes('precision') || k.includes('conseil')) {
    return (
      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
        <label className="form-label">{label}</label>
        <textarea
          className="form-textarea"
          rows={3}
          value={valeur ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }

  // Champs simples typés par la clé ou la valeur seed
  if (typeof valeurSeed === 'number' || k.startsWith('nb_') || k.includes('montant')) {
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <input
          className="form-input"
          type="number"
          value={valeur ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      </div>
    )
  }
  const typeInput = k.includes('date') ? 'date' : k.includes('email') ? 'email' : k.includes('telephone') ? 'tel' : 'text'
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={typeInput}
        value={valeur ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 5 : profil de risque (14 questions, q4 à choix multiples)
// ═══════════════════════════════════════════════════════════════════════════
function SectionRisque({ reponses, setField }) {
  const questions = enListe(RISK_QUESTIONS)
  const risque = reponses[CLE_RISQUE] || {}

  const estMulti = (q, qid) => {
    if (q && (q.multi === true || q.multiple === true || q.type === 'multi' || q.type === 'checkbox')) return true
    const seedRisque = SEED_REF[CLE_RISQUE]
    if (seedRisque && Array.isArray(seedRisque[qid])) return true
    return qid === 'q4'
  }

  // Contrat de la lib : reponses.risque stocke l INDEX de l option choisie
  // (tableau d index pour les questions multi), jamais le libelle. computeScore,
  // orientationMismatch et le generateur PDF comparent tous des index.
  const toggleMulti = (qid, i) => {
    const courant = Array.isArray(risque[qid]) ? risque[qid] : []
    const present = courant.some((x) => Number(x) === i)
    setField(CLE_RISQUE, qid, present ? courant.filter((x) => Number(x) !== i) : [...courant, i])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {questions.map((q, idx) => {
        const qid = q?.id || `q${idx + 1}`
        const libelle = q?.label || q?.question || q?.libelle || q?.titre || qid
        const options = enListe(q?.options || q?.choix || q?.reponses || [])
        const multi = estMulti(q, qid)
        const courant = risque[qid]
        const repondu = Array.isArray(courant) ? courant.length > 0 : (courant !== null && courant !== undefined && courant !== '')

        return (
          <div key={qid} className="card" style={{ padding: '16px 20px', borderLeft: repondu ? '3px solid var(--signed)' : '3px solid var(--bd-strong)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 10 }}>
              {idx + 1}. {libelle}
              {multi && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: 'var(--t3)' }}>(plusieurs réponses possibles)</span>}
            </div>
            {options.length === 0 ? (
              <input
                className="form-input"
                value={courant ?? ''}
                onChange={(e) => setField(CLE_RISQUE, qid, e.target.value)}
                placeholder="Réponse libre"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {options.map((o, i) => {
                  const coche = multi
                    ? Array.isArray(courant) && courant.some((x) => Number(x) === i)
                    : courant !== null && courant !== undefined && courant !== '' && Number(courant) === i
                  return (
                    <label
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                        background: coche ? 'rgba(0,113,227,0.06)' : 'transparent',
                        border: `0.5px solid ${coche ? 'rgba(0,113,227,0.25)' : 'var(--bd)'}`,
                        fontSize: 13, color: 'var(--t2)', lineHeight: 1.4,
                      }}
                    >
                      <input
                        type={multi ? 'checkbox' : 'radio'}
                        name={`risque_${qid}`}
                        checked={coche}
                        onChange={() => (multi ? toggleMulti(qid, i) : setField(CLE_RISQUE, qid, i))}
                        style={{ marginTop: 2 }}
                      />
                      <span>{optLabel(o)}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 6 : contrat et conseil (date d'effet, retraite, texte du conseil)
// ═══════════════════════════════════════════════════════════════════════════
function SectionContrat({ reponses, setField }) {
  const contrat = reponses[CLE_CONTRAT] || {}
  // Le texte du conseil vit dans la section conseil du seed (reponses.conseil.texte),
  // c est la que le generateur PDF le lit. Pas dans la section contrat.
  const conseil = reponses.conseil || {}
  const clesExplicites = [K_DATE_EFFET, K_AGE_RETRAITE, K_FAIT_A]
  const autresCles = champsSection(CLE_CONTRAT).filter((k) => !clesExplicites.includes(k))

  return (
    <div className="card">
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>Contrat et conseil</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            Ces éléments alimentent directement le Devoir de conseil remis au client.
          </div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 20 }}>
        <div className="form-row form-row-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
          <div className="form-group">
            <label className="form-label">Date d'effet du contrat</label>
            <input
              className="form-input"
              type="date"
              value={contrat[K_DATE_EFFET] || ''}
              onChange={(e) => setField(CLE_CONTRAT, K_DATE_EFFET, e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Âge de départ à la retraite envisagé</label>
            <input
              className="form-input"
              type="number"
              min="50"
              max="75"
              value={contrat[K_AGE_RETRAITE] ?? ''}
              onChange={(e) => setField(CLE_CONTRAT, K_AGE_RETRAITE, e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Fait à</label>
            <input
              className="form-input"
              value={contrat[K_FAIT_A] || ''}
              onChange={(e) => setField(CLE_CONTRAT, K_FAIT_A, e.target.value)}
              placeholder="Ville de signature"
            />
          </div>
          {autresCles.map((cle) => (
            <ChampGenerique
              key={cle}
              cleSection={CLE_CONTRAT}
              cle={cle}
              valeur={contrat[cle]}
              valeurSeed={(SEED_REF[CLE_CONTRAT] || {})[cle]}
              onChange={(v) => setField(CLE_CONTRAT, cle, v)}
            />
          ))}
        </div>

        <div className="form-group" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Notre conseil</label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setField('conseil', 'texte', NOTRE_CONSEIL_PER)}
            >
              Insérer le texte type PER
            </button>
          </div>
          <textarea
            className="form-textarea"
            rows={10}
            value={conseil.texte || ''}
            onChange={(e) => setField('conseil', 'texte', e.target.value)}
            placeholder="Motivation du conseil : adéquation du produit avec la situation, les objectifs et le profil du client…"
          />
          <div className="form-hint">
            Ce texte est repris verbatim dans le Devoir de conseil. Personnalise le texte type selon la situation du client.
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 7 : récapitulatif du dossier
// ═══════════════════════════════════════════════════════════════════════════
function LigneRecap({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '0.5px solid var(--bd)' }}>
      <div style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600, textAlign: 'right' }}>{children}</div>
    </div>
  )
}

function libelleProfilEchelle(p) {
  if (typeof p === 'string') return p
  const lab = p?.label || p?.nom || p?.libelle || ''
  const min = p?.min ?? p?.scoreMin ?? p?.de
  const max = p?.max ?? p?.scoreMax ?? p?.a
  if (min !== undefined && max !== undefined) return `${lab} (${min} à ${max})`
  return lab
}

function SectionRecap({ row, reponses, score, profilLabel, mismatch, nbRepondues, nbQuestions }) {
  const sit = reponses[CLE_SITUATION] || {}
  const contrat = reponses[CLE_CONTRAT] || {}
  const echelle = enListe(PROFILS).map(libelleProfilEchelle).filter(Boolean)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      <div className="card card-p">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>
          Dossier
        </div>
        <LigneRecap label="Client">{`${sit.prenom || ''} ${sit.nom || ''}`.trim() || '·'}</LigneRecap>
        <LigneRecap label="Email">{sit.email || '·'}</LigneRecap>
        <LigneRecap label="Téléphone">{sit.telephone || '·'}</LigneRecap>
        <LigneRecap label="Produit">{row.produit || '·'}</LigneRecap>
        <LigneRecap label="Compagnie">{row.compagnie || '·'}</LigneRecap>
        <LigneRecap label="Nom du produit">{row.nom_produit || '·'}</LigneRecap>
        <LigneRecap label="Conseiller">{row.advisor_code || '·'}</LigneRecap>
        <LigneRecap label="Date d'effet">{fmtDate(contrat[K_DATE_EFFET])}</LigneRecap>
      </div>

      <div className="card card-p">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>
          Profil investisseur
        </div>
        <LigneRecap label="Score">{score} / {SCORE_MAX}</LigneRecap>
        <LigneRecap label="Profil calculé"><BadgeProfil label={profilLabel} /></LigneRecap>
        <LigneRecap label="Questionnaire risque">{nbRepondues} / {nbQuestions} réponses</LigneRecap>
        <LigneRecap label="Cohérence orientation">
          {mismatch
            ? <span style={{ color: '#B36B00' }}>⚠ Incohérence à corriger</span>
            : <span style={{ color: 'var(--signed)' }}>✓ Cohérent</span>}
        </LigneRecap>
        {echelle.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
            Échelle des profils : {echelle.join(' · ')}
          </div>
        )}
      </div>

      <div className="card card-p">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>
          Avancement
        </div>
        <LigneRecap label="Statut"><BadgeStatut statut={row.statut} /></LigneRecap>
        <LigneRecap label="Créé le">{fmtDate(row.created_at)}</LigneRecap>
        <LigneRecap label="PDF généré le">{fmtDate(row.pdf_genere_at)}</LigneRecap>
        <LigneRecap label="Envoyé le">{fmtDate(row.envoye_at)}</LigneRecap>
        <LigneRecap label="Signé le">{fmtDate(row.signe_at)}</LigneRecap>
        <LigneRecap label="Dernière mise à jour">{fmtDate(row.updated_at)}</LigneRecap>
      </div>
    </div>
  )
}
