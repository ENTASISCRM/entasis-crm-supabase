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
import { confirmDialog } from './ui/confirm'
import { correspond } from '../lib/recherche'
import SubTabs from './ui/SubTabs'
import { SkeletonRows, SkeletonText } from './ui/Skeleton'
import * as service from '../services/conseillerContrats'
import * as profilesService from '../services/profiles'
import * as contratDocs from '../services/contratDocs'
import * as congesService from '../services/conges'
import MandatairesConformite from './MandatairesConformite'
import { soldeConges, fmtJours } from '../lib/conges-solde'
import { impersonate } from '../services/impersonation'
import { TYPES_CONTRAT, LIBELLE_TYPE_CONTRAT } from '../lib/contrat-enums'
import { messageErreur } from '../lib/ui-shared'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')

// Contrats bornés dans le temps : la date de fin est obligatoire, c est elle
// qui pilote les projections (fin de contrat, fin des aides, remplacement).
const TYPES_BORNES = ['ALTERNANT', 'CDD', 'STAGIAIRE']

// Parse une date YYYY-MM-DD en minuit LOCAL. new Date('YYYY-MM-DD') donne
// minuit UTC, soit 1 à 2 h de décalage en France : un contrat qui commence
// aujourd hui serait « à venir » jusqu à 2 h du matin.
const dateLocale = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
// Fin de journée locale : un contrat reste en poste jusqu au soir de sa date de fin.
const finDeJour = (s) => {
  const d = dateLocale(s)
  d.setHours(23, 59, 59, 999)
  return d
}

// Temps restant avant la fin de contrat, en clair (« dans 8 mois », « terminé »).
const resteAvant = (dateFin) => {
  if (!dateFin) return null
  const jours = Math.round((finDeJour(dateFin) - new Date()) / 86400000)
  if (jours < 0) return { texte: 'terminé', alerte: false, passe: true }
  if (jours <= 31) return { texte: `dans ${jours} j`, alerte: true, passe: false }
  const mois = Math.round(jours / 30.4)
  return { texte: `dans ${mois} mois`, alerte: mois <= 3, passe: false }
}

// Statut temporel d un contrat : en poste aujourd hui, arrivée à venir, ou
// déjà terminé. C est la clé de lecture de tout l onglet (KPIs, projection,
// regroupement du tableau) : un contrat de septembre ne coûte rien en juillet.
const statutContrat = (c) => {
  const now = new Date()
  if (c.date_fin && finDeJour(c.date_fin) < now) return 'termine'
  if (c.date_debut && dateLocale(c.date_debut) > now) return 'avenir'
  return 'enposte'
}

// Coût réel mensuel d un contrat : le salaire brut PLUS le coût école
// restant à charge (frais de formation d un alternant après prise en charge
// OPCO, champ reste_a_charge_mensuel). Le champ s AJOUTE au salaire, il ne
// le remplace pas : un alternant coûte son salaire ET la facture de l école.
const coutMensuel = (c) =>
  Number(c.salaire_brut_mensuel || 0) + Number(c.reste_a_charge_mensuel || 0)

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
  conges_deja_pris: 0,
  conges_report: '',
  palier_pp_mensuel: 0,
  palier_pu_mensuel: 0,
  date_debut: new Date().toISOString().slice(0, 10),
  date_fin: null,
  actif: true,
  notes: '',
}

export default function PilotageRH({ profile }) {
  const [contrats, setContrats] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // contrat en cours d'édition (modale)
  const [creating, setCreating] = useState(false)
  const [prefillProfile, setPrefillProfile] = useState(null)
  // Sous onglets : equipe salariee / conformite des mandataires
  const [vue, setVue] = useState('equipe')
  // Une seule vue d ensemble a la fois (la frise ET la projection empilees
  // rendaient la page interminable)
  const [vueGraph, setVueGraph] = useState('frise')
  // Menu d actions secondaires de la ligne (garde une seule action visible
  // par ligne : Editer). La position ({ id, top, right }) est figee a
  // l ouverture car le menu est rendu en position:fixed : le table-wrap a
  // overflow:hidden, un menu en absolu dedans serait rogne sur les
  // dernieres lignes du tableau.
  const [menuOuvert, setMenuOuvert] = useState(null)
  const [filterType, setFilterType] = useState('all')
  const [filterActif, setFilterActif] = useState('actifs')
  const [search, setSearch] = useState('')
  // Ids des contrats qui ont au moins un document joint (contrat de travail scanné)
  const [avecDocs, setAvecDocs] = useState(new Set())
  // Demandes de congés Smart RH (la RLS donne tout à la direction) : sert au
  // calcul du solde acquis moins pris par personne
  const [conges, setConges] = useState([])

  // Congés groupés par demandeur pour le calcul du solde
  const congesParPersonne = useMemo(() => {
    const m = new Map()
    for (const c of conges) {
      if (!c.demandeur_id) continue
      const l = m.get(c.demandeur_id) || []
      l.push(c)
      m.set(c.demandeur_id, l)
    }
    return m
  }, [conges])

  const refreshDocs = async () => {
    try { setAvecDocs(await contratDocs.contratsAvecDocs()) } catch { /* non bloquant */ }
  }

  const reload = async () => {
    setLoading(true)
    try {
      const [data, prof, cg] = await Promise.all([
        service.list(),
        profilesService.listTeam().catch(() => []),
        congesService.listConges().catch(() => []),
      ])
      // Les dirigeants (gerants et profils manager, Louis et Jean) ne sont
      // pas geres dans cet onglet : hors liste, hors stats, hors projection.
      setContrats(data.filter((c) => c.type_contrat !== 'GERANT' && c.profile?.role !== 'manager'))
      setProfiles(prof)
      setConges(cg)
      refreshDocs()
    } catch (e) {
      toast.error('Erreur de chargement : ' + (messageErreur(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  // Un clic n importe ou referme le menu d actions ouvert. Le scroll et le
  // resize aussi : le menu est en position:fixed, il ne suivrait pas sa ligne.
  useEffect(() => {
    if (!menuOuvert) return undefined
    const fermer = () => setMenuOuvert(null)
    document.addEventListener('click', fermer)
    window.addEventListener('scroll', fermer, true)
    window.addEventListener('resize', fermer)
    return () => {
      document.removeEventListener('click', fermer)
      window.removeEventListener('scroll', fermer, true)
      window.removeEventListener('resize', fermer)
    }
  }, [menuOuvert])

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
      // Les dirigeants (role manager) ne sont pas geres dans cet onglet :
      // pas de contrat a leur creer, ils ne sont pas des profils orphelins.
      .filter(p => p.is_active && p.role !== 'manager' && !linkedIds.has(p.id))
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
      toast.error('Erreur : ' + (messageErreur(e)))
    }
  }

  const handleLierTous = async () => {
    if (liaisonsPossibles.length === 0) return
    if (!(await confirmDialog({title:`Lier ${liaisonsPossibles.length} contrat(s) à leur profil ?`,message:'Les contrats sont matchés automatiquement par nom ou code.',confirmLabel:'Lier automatiquement'}))) return
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
        // Accents et ordre des mots ignorés (lib/recherche) : « herve » doit
        // trouver Hervé, « dupont marie » doit trouver Marie Dupont.
        if (!correspond(`${c.full_name || ''} ${c.matricule || ''}`, search)) return false
      }
      return true
    })
  }, [contrats, filterType, filterActif, search])

  // Toutes les stats sont calculées sur les contrats EN POSTE aujourd hui :
  // les embauches futures et les contrats terminés ne comptent ni dans
  // l effectif ni dans la masse (même règle que l onglet Rémunération).
  const stats = useMemo(() => {
    const actifs = contrats.filter(c => c.actif)
    const enPoste = actifs.filter(c => statutContrat(c) === 'enposte')
    const aVenir = actifs.filter(c => statutContrat(c) === 'avenir')
    const termines = actifs.filter(c => statutContrat(c) === 'termine')
    return {
      total: enPoste.length,
      aVenir: aVenir.length,
      termines: termines.length,
      cdi: enPoste.filter(c => c.type_contrat === 'CDI').length,
      cdd: enPoste.filter(c => c.type_contrat === 'CDD').length,
      alternants: enPoste.filter(c => c.type_contrat === 'ALTERNANT').length,
      stagiaires: enPoste.filter(c => c.type_contrat === 'STAGIAIRE').length,
      mandataires: enPoste.filter(c => c.type_contrat === 'MANDATAIRE').length,
      masseSalarialeMensuelle: enPoste.reduce((sum, c) => sum + Number(c.salaire_brut_mensuel || 0), 0),
      coutReelMensuel: enPoste.reduce((sum, c) => sum + coutMensuel(c), 0),
      // Alternants en poste dont le coût école n a pas encore été saisi :
      // leur coût réel est sous-estimé (salaire seul, sans la formation)
      sansCoutEcole: enPoste.filter(c => (c.reste_a_charge_mensuel == null || c.reste_a_charge_mensuel === '') && c.type_contrat === 'ALTERNANT').length,
    }
  }, [contrats])

  // Projection 12 mois du coût réel entreprise. Chaque contrat compte au
  // PRORATA de ses jours de présence dans le mois (un CDD qui finit le 10
  // coûte un tiers de mois, une arrivée le 25 coûte une semaine). L effectif
  // affiché est celui en poste au dernier jour du mois.
  const projection = useMemo(() => {
    const now = new Date()
    const out = []
    for (let i = 0; i < 12; i++) {
      const mStart = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const mEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0, 23, 59, 59, 999)
      const joursMois = new Date(now.getFullYear(), now.getMonth() + i + 1, 0).getDate()
      let cout = 0, brut = 0, nb = 0, arrivees = 0, departs = 0
      for (const c of contrats) {
        if (!c.actif) continue
        const debut = c.date_debut ? dateLocale(c.date_debut) : null
        const fin = c.date_fin ? finDeJour(c.date_fin) : null
        if (debut && debut > mEnd) continue
        if (fin && fin < mStart) continue
        const de = debut && debut > mStart ? debut : mStart
        const a = fin && fin < mEnd ? fin : mEnd
        const part = Math.min(1, Math.max(0, Math.round((a - de) / 86400000 + 0.5) / joursMois))
        brut += Number(c.salaire_brut_mensuel || 0) * part
        cout += coutMensuel(c) * part
        // En poste au dernier jour du mois
        if (!fin || fin >= mEnd) nb++
        if (debut && debut >= mStart && debut <= mEnd) arrivees++
        if (fin && fin >= mStart && fin <= mEnd) departs++
      }
      out.push({ mois: mStart, cout: Math.round(cout), brut: Math.round(brut), nb, arrivees, departs })
    }
    return out
  }, [contrats])

  // Ce qui reclame une action, condense en pastilles : sans ca il fallait
  // parcourir tout le tableau pour reperer les trous.
  const aTraiter = useMemo(() => {
    const actifs = contrats.filter((c) => c.actif && statutContrat(c) !== 'termine')
    const out = []
    const pousser = (cle, liste, texte, urgent) => {
      if (liste.length === 0) return
      out.push({
        cle,
        label: texte(liste.length),
        detail: liste.map((c) => c.full_name).join(', '),
        urgent: !!urgent,
      })
    }
    pousser('fin',
      actifs.filter((c) => TYPES_BORNES.includes(c.type_contrat) && !c.date_fin),
      (n) => `${n} date${n > 1 ? 's' : ''} de fin manquante${n > 1 ? 's' : ''}`, true)
    pousser('proche',
      actifs.filter((c) => { const r = c.date_fin ? resteAvant(c.date_fin) : null; return r && !r.passe && r.alerte }),
      (n) => `${n} fin${n > 1 ? 's' : ''} de contrat sous 3 mois`, true)
    pousser('docs',
      actifs.filter((c) => !avecDocs.has(String(c.id))),
      (n) => `${n} dossier${n > 1 ? 's' : ''} sans document`)
    pousser('ecole',
      actifs.filter((c) => (c.reste_a_charge_mensuel == null || c.reste_a_charge_mensuel === '') && c.type_contrat === 'ALTERNANT'),
      (n) => `${n} coût${n > 1 ? 's' : ''} école à saisir`)
    return out
  }, [contrats, avecDocs])

  const nbMandataires = useMemo(
    () => contrats.filter((c) => c.type_contrat === 'MANDATAIRE' && c.actif).length,
    [contrats],
  )

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
      toast.error('Erreur : ' + (messageErreur(e)))
    }
  }

  // Désactive en un clic tous les contrats terminés encore actifs (fin de
  // stage ou de CDD passée) : ils sortent des listes mais restent
  // consultables via le filtre Inactifs.
  const handleDesactiverTermines = async (list) => {
    if (!(await confirmDialog({title:`Désactiver ${list.length} contrat(s) terminé(s) ?`,message:'Ils restent consultables via le filtre Inactifs.',confirmLabel:'Désactiver'}))) return
    let ok = 0
    for (const c of list) {
      try { await service.setActif(c.id, false); ok++ } catch (e) { console.error('[PilotageRH] désactiver terminés', e) }
    }
    toast.success(`${ok}/${list.length} contrat(s) désactivé(s)`)
    reload()
  }

  // Suppression definitive (mauvaise saisie) : confirmation obligatoire,
  // les documents archives du bucket sont effaces avec la fiche pour ne
  // pas laisser d orphelins. Pour un depart, le bon geste reste Desactiver.
  const handleSupprimer = async (contrat) => {
    const ok = await confirmDialog({
      title: `Supprimer la fiche de ${contrat.full_name} ?`,
      message: 'Cette action est irréversible : le contrat, son historique et ses documents archivés seront effacés. Pour un départ ou une fin de contrat, utilise plutôt Désactiver.',
      confirmLabel: 'Supprimer définitivement',
      danger: true,
    })
    if (!ok) return
    try {
      try {
        const docs = await contratDocs.listDocsParCategorie(contrat.id)
        for (const fichiers of Object.values(docs)) {
          for (const d of fichiers) await contratDocs.deletePath(d.path)
        }
      } catch (e) { console.error('[PilotageRH] purge documents', e) }
      await service.remove(contrat.id)
      toast.success('Fiche supprimée')
      reload()
      return true
    } catch (e) {
      toast.error('Erreur : ' + (messageErreur(e)))
    }
    return false
  }

  const handleToggleActif = async (contrat) => {
    if (!(await confirmDialog({title:`${contrat.actif ? 'Désactiver' : 'Réactiver'} le contrat de ${contrat.full_name} ?`,confirmLabel:contrat.actif ? 'Désactiver' : 'Réactiver',danger:contrat.actif}))) return
    try {
      await service.setActif(contrat.id, !contrat.actif)
      toast.success(contrat.actif ? 'Contrat désactivé' : 'Contrat réactivé')
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (messageErreur(e)))
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
      toast.error('Erreur : ' + (messageErreur(e)), { id: toastId })
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

      {/* Sous onglets : l equipe salariee d un cote, la conformite des
          mandataires independants de l autre (obligations INPI, ORIAS,
          declarations URSSAF trimestrielles). */}
      <SubTabs
        ariaLabel="Sous-onglets Pilotage RH"
        tabs={[
          { key: 'equipe', label: 'Équipe salariée' },
          { key: 'mandataires', label: 'Mandataires · conformité', badge: nbMandataires },
        ]}
        active={vue}
        onChange={setVue}
      />

      {vue === 'mandataires' && <MandatairesConformite contrats={contrats} profile={profile} />}

      {vue === 'equipe' && (<>
      {/* Trois chiffres, pas plus : combien nous sommes, ce que ca coute,
          ou on va. Le brut est devenu un detail du cout reel. */}
      <div className="kpi-grid mb-24">
        <div className="kpi-card kpi-card-blue">
          <div className="kpi-label">En poste aujourd'hui</div>
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-hint">
            {stats.cdi} CDI · {stats.cdd} CDD · {stats.alternants} alt. · {stats.stagiaires} stag. · {stats.mandataires} mand.
            {stats.aVenir > 0 ? ` · +${stats.aVenir} à venir` : ''}
            {stats.termines > 0 ? ` · ${stats.termines} terminé${stats.termines > 1 ? 's' : ''} encore actif${stats.termines > 1 ? 's' : ''}` : ''}
          </div>
        </div>
        <div className="kpi-card kpi-card-green">
          <div className="kpi-label">Coût réel entreprise / mois</div>
          <div className="kpi-value">{fmtEur(stats.coutReelMensuel)}</div>
          <div className="kpi-hint">
            {fmtEur(stats.coutReelMensuel * 12)} / an · {fmtEur(stats.masseSalarialeMensuelle)} de brut
            {stats.sansCoutEcole > 0 ? ` · ${stats.sansCoutEcole} coût${stats.sansCoutEcole > 1 ? 's' : ''} école à saisir` : ''}
          </div>
        </div>
        <div className="kpi-card kpi-card-gold">
          <div className="kpi-label">Coût réel dans 3 mois</div>
          <div className="kpi-value">{fmtEur(projection[3]?.cout || 0)}</div>
          <div className="kpi-hint">
            {(() => {
              const delta = (projection[3]?.cout || 0) - (projection[0]?.cout || 0)
              const signe = delta > 0 ? '+' : delta < 0 ? '−' : ''
              return `${signe}${fmtEur(Math.abs(delta))} vs ce mois · ${projection[3]?.nb || 0} en poste`
            })()}
          </div>
        </div>
      </div>

      {/* Ce qui reclame une action, en une ligne. Survole une pastille pour
          voir qui est concerne. Rien ne s affiche si tout est en ordre. */}
      {aTraiter.length > 0 && (
        <div className="card mb-24" style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px',
        }}>
          <span style={{
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--t3)', flexShrink: 0,
          }}>À traiter</span>
          {aTraiter.map((a) => (
            <span
              key={a.cle}
              title={a.detail}
              style={{
                fontSize: 12, fontWeight: 650, padding: '4px 11px', borderRadius: 999, cursor: 'default',
                background: a.urgent ? 'rgba(255,59,48,0.09)' : 'rgba(255,149,0,0.10)',
                color: a.urgent ? '#c0392b' : '#B26B00',
              }}
            >
              {a.label}
            </span>
          ))}
        </div>
      )}

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

      {/* Vue d ensemble : une seule a la fois (les deux empilees rendaient la
          page interminable avant d arriver au tableau). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--t3)', marginRight: 2,
        }}>Vue d'ensemble</span>
        {[
          { key: 'frise', label: 'Échéances' },
          { key: 'couts', label: 'Coûts 12 mois' },
        ].map((g) => (
          <button
            key={g.key}
            onClick={() => setVueGraph(g.key)}
            style={{
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 650, padding: '5px 12px', borderRadius: 999,
              background: vueGraph === g.key ? 'rgba(201,169,97,0.16)' : 'rgba(0,0,0,0.04)',
              color: vueGraph === g.key ? 'var(--gold-dk, #A6843F)' : 'var(--t3)',
            }}
          >
            {g.label}
          </button>
        ))}
      </div>
      {vueGraph === 'frise'
        ? <TimelineRH contrats={contrats} />
        : <ProjectionCout projection={projection} />}

      {/* Toolbar filtres */}
      <div className="table-toolbar mb-16" style={{ marginBottom: 16 }}>
        <input className="search-input" data-global-search placeholder="Rechercher un conseiller…"
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

      {/* Tableau : 6 colonnes au lieu de 10. Les donnees liees sont
          regroupees dans une meme cellule (contrat = type + dates + echeance,
          remuneration = brut + reste a charge), et une seule action reste
          visible par ligne, le reste passe dans le menu. */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Conseiller</th>
              <th>Contrat</th>
              <th style={{ textAlign: 'right' }}>Rémunération</th>
              <th style={{ textAlign: 'right' }}>Paliers PP · PU</th>
              <th style={{ textAlign: 'right' }}
                  title="Congés payés : 2,5 j acquis par mois complet depuis le début du contrat, moins les congés validés dans Smart RH">
                Congés
              </th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={5} cols={6} />
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="table-empty-state">
                <div className="empty-title">Aucun contrat trouvé</div>
                <div className="empty-sub">Ajuste les filtres ou ajoute un nouveau contrat</div>
              </td></tr>
            ) : (() => {
              const parStatut = { enposte: [], avenir: [], termine: [] }
              for (const c of filtered) parStatut[c.actif ? statutContrat(c) : 'termine'].push(c)
              const groupes = [
                { key: 'enposte', titre: 'En poste', dot: VERT, list: parStatut.enposte },
                { key: 'avenir', titre: 'Arrivées à venir', dot: '#0071E3', list: parStatut.avenir },
                { key: 'termine', titre: 'Terminés ou archivés', dot: 'var(--t3)', list: parStatut.termine },
              ].filter((g) => g.list.length > 0)

              const rowFor = (c) => {
                const col = TYPE_COLORS[c.type_contrat] || TYPE_COLORS.CDI
                const reste = c.actif && c.date_fin ? resteAvant(c.date_fin) : null
                const racAn = c.reste_a_charge_mensuel != null && c.reste_a_charge_mensuel !== ''
                  ? Number(c.reste_a_charge_mensuel) * 12 : null
                const solde = c.profile_id
                  ? soldeConges(c, congesParPersonne.get(c.profile_id) || [])
                  : soldeConges(c, [])
                const aDoc = avecDocs.has(String(c.id))
                const finManquante = TYPES_BORNES.includes(c.type_contrat) && !c.date_fin && c.actif
                return (
                  <tr key={c.id} style={{ opacity: c.actif ? 1 : 0.5 }}>
                    {/* Qui */}
                    <td>
                      <div className="cell-primary">
                        {c.full_name}
                        {aDoc && (
                          <button
                            onClick={() => setEditing(c)}
                            title="Documents archivés : cliquer pour les voir ou en ajouter"
                            style={{ background: 'none', border: 'none', padding: 0, marginLeft: 6, fontSize: 12, cursor: 'pointer' }}
                          >📎</button>
                        )}
                      </div>
                      <div className="cell-sub">
                        {c.matricule ? `Mat. ${c.matricule}` : 'Sans matricule'}
                        {!aDoc && c.actif && (
                          <button
                            onClick={() => setEditing(c)}
                            title="Aucun document archivé pour ce contrat"
                            style={{
                              background: 'none', border: 'none', padding: 0, marginLeft: 8, cursor: 'pointer',
                              color: 'var(--warning, #B26B00)', fontSize: 11, fontFamily: 'inherit',
                              textDecoration: 'underline dotted', textUnderlineOffset: 3,
                            }}
                          >documents à joindre</button>
                        )}
                      </div>
                    </td>

                    {/* Contrat : type, periode et echeance dans une seule cellule */}
                    <td>
                      <span style={{
                        display: 'inline-flex', padding: '3px 10px', borderRadius: 999,
                        fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
                        background: col.bg, color: col.fg,
                      }}>
                        {LIBELLE_TYPE_CONTRAT[c.type_contrat] || c.type_contrat}
                      </span>
                      <div className="cell-sub" style={{ marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtDate(c.date_debut)}
                        {c.date_fin ? ` → ${fmtDate(c.date_fin)}` : ''}
                        {reste && (
                          <span style={{ color: reste.alerte ? 'var(--danger, #c0392b)' : undefined, fontWeight: reste.alerte ? 700 : 400 }}>
                            {` · ${reste.texte}`}
                          </span>
                        )}
                        {finManquante && (
                          <button
                            onClick={() => setEditing(c)}
                            style={{
                              background: 'none', border: 'none', padding: 0, marginLeft: 6, cursor: 'pointer',
                              color: 'var(--danger, #c0392b)', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                              textDecoration: 'underline dotted', textUnderlineOffset: 3,
                            }}
                          >fin à saisir</button>
                        )}
                      </div>
                    </td>

                    {/* Remuneration : salaire brut, et pour les alternants le
                        cout ecole (facture de formation apres OPCO) qui
                        s ajoute au salaire dans les couts et projections */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="cell-mono">{fmtEur(c.salaire_brut_mensuel)}</div>
                      <div className="cell-sub">
                        {racAn != null ? `+ école ${fmtEur(racAn)} / an` : c.type_contrat === 'ALTERNANT' ? (
                          <button
                            onClick={() => setEditing(c)}
                            title="Facture de l'école après prise en charge OPCO : elle s'ajoute au salaire dans les coûts et projections"
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              color: 'var(--t3)', fontSize: 'inherit', fontFamily: 'inherit',
                              textDecoration: 'underline dotted', textUnderlineOffset: 3,
                            }}
                          >coût école à saisir</button>
                        ) : null}
                      </div>
                    </td>

                    {/* Paliers */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="cell-mono">{c.palier_pp_mensuel > 0 ? fmtEur(c.palier_pp_mensuel) : '—'}</div>
                      <div className="cell-sub">
                        {c.palier_pu_mensuel > 0 ? `PU ${fmtEur(c.palier_pu_mensuel)}` : 'PU —'}
                      </div>
                    </td>

                    {/* Conges */}
                    <td style={{ textAlign: 'right' }}>
                      {solde ? (
                        <>
                          <div className="cell-mono" style={{ color: solde.restant < 0 ? 'var(--danger, #c0392b)' : undefined }}>
                            {fmtJours(solde.restant)}
                          </div>
                          <div className="cell-sub">{fmtJours(solde.acquis)} acquis · {fmtJours(solde.pris)} pris</div>
                        </>
                      ) : <span style={{ color: 'var(--t3)' }}>—</span>}
                    </td>

                    {/* Actions : une seule visible, le reste dans le menu */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Éditer</button>
                        <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Autres actions"
                            onClick={(e) => {
                              if (menuOuvert?.id === c.id) { setMenuOuvert(null); return }
                              const r = e.currentTarget.getBoundingClientRect()
                              setMenuOuvert({ id: c.id, top: r.bottom + 4, right: window.innerWidth - r.right })
                            }}
                          >⋯</button>
                          {menuOuvert?.id === c.id && (
                            <div style={{
                              position: 'fixed', right: menuOuvert.right, top: menuOuvert.top, zIndex: 30,
                              background: '#fff', border: '0.5px solid var(--bd)', borderRadius: 10,
                              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 200,
                              textAlign: 'left',
                            }}>
                              {profile?.role === 'manager' && c.profile_id && c.actif && c.type_contrat !== 'GERANT' && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ width: '100%', justifyContent: 'flex-start' }}
                                  onClick={() => { setMenuOuvert(null); handleImpersonate(c) }}
                                >👤 Voir en tant que</button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: '100%', justifyContent: 'flex-start' }}
                                onClick={() => { setMenuOuvert(null); handleToggleActif(c) }}
                              >{c.actif ? '⏸ Désactiver' : '▶ Réactiver'}</button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--danger, #c0392b)' }}
                                onClick={() => { setMenuOuvert(null); handleSupprimer(c) }}
                              >Supprimer la fiche</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              }

              return groupes.flatMap((g) => {
                const terminesActifs = g.key === 'termine' ? g.list.filter((c) => c.actif) : []
                return [
                  <tr key={`head-${g.key}`}>
                    <td colSpan={6} style={{ background: 'rgba(0,0,0,0.02)', padding: '7px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 7,
                          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', color: 'var(--t3)',
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.dot }} />
                          {g.titre} · {g.list.length}
                        </span>
                        {terminesActifs.length > 0 && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleDesactiverTermines(terminesActifs)}
                            title="Les contrats terminés encore actifs faussent les listes : un clic pour les archiver"
                          >
                            Désactiver les {terminesActifs.length} terminé{terminesActifs.length > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>,
                  ...g.list.map(rowFor),
                ]
              })
            })()}
          </tbody>
        </table>
      </div>

      </>)}

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
          onDocsChange={refreshDocs}
          onSupprimer={editing ? async () => { if (await handleSupprimer(editing)) setEditing(null) } : null}
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
// ─────────────────────────────────────────────────────────────────────────
// Dossier documents du salarié : une case par catégorie (contrat de
// travail, CERFA pour les alternants, pièce d identité, sécurité sociale).
// Upload, ouverture via URL signée temporaire, suppression. Bucket privé
// 'contrats-rh', accès manager uniquement via les policies storage.
// ─────────────────────────────────────────────────────────────────────────
function DocsContrat({ contratId, typeContrat, nomSalarie, onChange }) {
  const [docs, setDocs] = useState(null)
  const [busy, setBusy] = useState(false)
  // Erreur de chargement VISIBLE : sans ça, un échec affichait des cases
  // vides comme si les documents déjà déposés avaient disparu.
  const [erreur, setErreur] = useState(null)

  const reloadDocs = async () => {
    setErreur(null)
    try { setDocs(await contratDocs.listDocsParCategorie(contratId)) }
    catch (e) {
      console.error('[DocsContrat] chargement', e)
      setErreur(messageErreur(e))
      setDocs(null)
    }
  }
  useEffect(() => { reloadDocs() }, [contratId])   // eslint-disable-line react-hooks/exhaustive-deps

  // CERFA : uniquement pour les alternants, les autres cases pour tous
  const categories = contratDocs.CATEGORIES.filter(
    (c) => c.key !== 'cerfa' || typeContrat === 'ALTERNANT'
  )

  const onUpload = async (categorie, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) return toast.error('Fichier trop lourd (20 Mo max)')
    setBusy(true)
    try {
      await contratDocs.uploadDoc(contratId, file, categorie)
      toast.success('Document archivé')
      await reloadDocs()
      onChange && onChange()
    } catch (err) {
      toast.error('Envoi impossible : ' + (messageErreur(err)))
    } finally { setBusy(false) }
  }

  const ouvrir = async (path) => {
    try {
      const url = await contratDocs.urlPath(path)
      window.open(url, '_blank', 'noopener')
    } catch (err) { toast.error('Ouverture impossible : ' + (messageErreur(err))) }
  }

  const supprimer = async (d) => {
    if (!(await confirmDialog({title:`Supprimer « ${contratDocs.nomAffiche(d.name)} » ?`,message:'Le fichier sera définitivement effacé.',confirmLabel:'Supprimer',danger:true}))) return
    setBusy(true)
    try {
      await contratDocs.deletePath(d.path)
      toast.success('Document supprimé')
      await reloadDocs()
      onChange && onChange()
    } catch (err) { toast.error('Suppression impossible : ' + (messageErreur(err))) }
    finally { setBusy(false) }
  }

  // Telecharge TOUS les documents de la fiche en un seul zip (un sous
  // dossier par categorie) : pratique pour transmettre un dossier complet.
  const toutTelecharger = async () => {
    setBusy(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      let n = 0
      for (const cat of categories) {
        for (const d of (docs?.[cat.key] || [])) {
          const url = await contratDocs.urlPath(d.path)
          const rep = await fetch(url)
          if (!rep.ok) throw new Error(`téléchargement de ${contratDocs.nomAffiche(d.name)} refusé`)
          zip.file(`${cat.label}/${contratDocs.nomAffiche(d.name)}`, await rep.blob())
          n++
        }
      }
      if (n === 0) { toast('Aucun document dans la fiche'); return }
      const blob = await zip.generateAsync({ type: 'blob' })
      const slug = String(nomSalarie || 'salarie').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `documents-${slug}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success(`${n} document${n > 1 ? 's' : ''} téléchargé${n > 1 ? 's' : ''} (zip)`)
    } catch (e) {
      toast.error('Téléchargement impossible : ' + (messageErreur(e)))
    } finally { setBusy(false) }
  }

  const fmtTaille = (n) => {
    const v = Number(n || 0)
    if (v <= 0) return ''
    return v >= 1048576 ? `${(v / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(v / 1024))} Ko`
  }

  const nbFournis = docs ? categories.filter((c) => (docs[c.key] || []).length > 0).length : 0

  return (
    <div className="form-group" style={{ marginBottom: 16 }}>
      <label className="form-label">
        Dossier documents
        {docs && (
          <span style={{
            marginLeft: 8, fontSize: 11, fontWeight: 700,
            color: nbFournis === categories.length ? 'var(--signed, #34C759)' : 'var(--warning, #FF9500)',
          }}>
            {nbFournis}/{categories.length} fournis
          </span>
        )}
      </label>
      <div style={{
        border: '0.5px solid var(--bd)', borderRadius: 12, padding: '4px 12px 10px',
        background: 'rgba(0,0,0,0.015)',
      }}>
        {erreur ? (
          <div style={{ fontSize: 12, color: 'var(--danger, #c0392b)', padding: '8px 0' }}>
            Impossible de charger les documents ({erreur}).{' '}
            <button
              type="button"
              onClick={reloadDocs}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'underline' }}
            >Réessayer</button>
          </div>
        ) : docs === null ? (
          <div style={{ padding: '8px 0' }}><SkeletonText lines={3} gap={8} /></div>
        ) : categories.map((cat) => {
          const fichiers = docs[cat.key] || []
          const fourni = fichiers.length > 0
          return (
            <div key={cat.key} style={{ padding: '8px 0', borderBottom: '0.5px solid var(--bd)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  background: fourni ? 'rgba(52,199,89,0.15)' : 'rgba(0,0,0,0.05)',
                  color: fourni ? 'var(--signed, #34C759)' : 'var(--t3)',
                  border: `1px solid ${fourni ? 'rgba(52,199,89,0.4)' : 'var(--bd)'}`,
                }}>{fourni ? '✓' : ''}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)', flex: 1 }}>
                  {cat.label}
                  {!fourni && <span style={{ fontWeight: 500, color: 'var(--t3)' }}> · {cat.hint}</span>}
                </span>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', flexShrink: 0 }}>
                  {busy ? '…' : '+ Joindre'}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx"
                    onChange={(e) => onUpload(cat.key, e)}
                    disabled={busy}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              {fichiers.map((d) => (
                <div key={d.path} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0 3px 26px',
                }}>
                  <span style={{ fontSize: 12 }}>📎</span>
                  <button
                    type="button"
                    onClick={() => ouvrir(d.path)}
                    title="Ouvrir le document (lien sécurisé temporaire)"
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, color: 'var(--t1)', fontFamily: 'inherit',
                      textAlign: 'left', flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {contratDocs.nomAffiche(d.name)}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--t3)', flexShrink: 0 }}>{fmtTaille(d.size)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => supprimer(d)}
                    style={{ flexShrink: 0 }}
                  >✕</button>
                </div>
              ))}
            </div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 }}>
          <div className="form-hint" style={{ margin: 0 }}>
            Stockage sécurisé, visible uniquement par la direction. 20 Mo max par fichier.
          </div>
          {nbFournis > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={toutTelecharger} style={{ flexShrink: 0 }}>
              {busy ? '…' : '⬇ Tout télécharger'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ContratModal({ contrat, profiles = [], contratsExistants = [], onClose, onSave, onDocsChange, onSupprimer }) {
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

  // Nom du profil lié quand il désigne quelqu'un d'autre que le contrat :
  // c'est ce qui a rendu l'écrasement de la fiche de Jean invisible.
  //
  // La comparaison ne peut pas être une égalité stricte : en base, la moitié
  // des fiches abrègent ou écorchent le nom du profil (« Arthur » pour Arthur
  // Follezou Gicquiaud, « Victor OSCHENSEI » pour Victor Ochsenbein). Alerter
  // dessus rendrait le signal inutile. On ne parle donc de discordance que
  // lorsque les deux noms n'ont AUCUN mot en commun — Charlotte Billard face
  // à Jean Decamps, oui ; Nans MARRO-DUZAT face à Nans Marro-Dauzat, non.
  const profilDiscordant = useMemo(() => {
    if (!form.profile_id) return null
    const p = profiles.find(x => x.id === form.profile_id)
    const nomProfil = (p?.full_name || '').trim()
    const nomContrat = (form.full_name || '').trim()
    if (!nomProfil || !nomContrat) return null
    const mots = (n) => new Set(
      n.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().split(/[^a-z0-9]+/).filter(m => m.length > 2),
    )
    const a = mots(nomProfil)
    const b = mots(nomContrat)
    if (!a.size || !b.size) return null
    const enCommun = [...a].some(m => b.has(m))
    return enCommun ? null : nomProfil
  }, [form.profile_id, form.full_name, profiles])

  const handleSubmit = async (e) => {
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
    // Réutiliser un contrat existant comme modèle pour quelqu'un d'autre écrase
    // la fiche de son titulaire — historique, salaire et dates compris. C'est
    // arrivé : la fiche de Jean Decamps est devenue celle de Charlotte Billard.
    // On ne l'interdit pas (une correction de nom reste légitime), on le dit.
    const ancienNom = (contrat.full_name || '').trim()
    const nouveauNom = form.full_name.trim()
    if (!isNew && ancienNom && nouveauNom.toLowerCase() !== ancienNom.toLowerCase()) {
      const ok = await confirmDialog({
        title: `Remplacer la fiche de ${ancienNom} ?`,
        message: `Vous êtes en train de renommer un contrat existant en « ${nouveauNom} ». `
          + `La fiche de ${ancienNom} sera écrasée : son type de contrat, son salaire, ses dates et son historique deviendront ceux de ${nouveauNom}.\n\n`
          + `Pour ajouter une personne, fermez cette fenêtre et utilisez « Nouveau contrat ».`,
        confirmLabel: `Écraser la fiche de ${ancienNom}`,
        danger: true,
      })
      if (!ok) return
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
              {profilDiscordant && (
                <div className="form-hint" style={{ color: 'var(--cancelled)', marginTop: 6 }}>
                  Ce contrat est au nom de <strong>{form.full_name}</strong> mais il est rattaché
                  au profil de <strong>{profilDiscordant}</strong>. Les dossiers de {profilDiscordant} et
                  son salaire seront comptés sur cette fiche. Vérifiez le profil lié.
                </div>
              )}
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

            {/* Cout ecole d un alternant : la facture de formation qui reste
                a payer apres la prise en charge OPCO. Saisie en ANNUEL,
                stockee en mensuel en base pour que projections et KPIs
                restent en euros/mois. Ce montant s AJOUTE au salaire brut
                dans les couts, il ne le remplace pas. */}
            <div className="form-group">
              <label className="form-label">Coût école restant à charge (€ / an)</label>
              <input className="form-input" type="number" step="1" min="0"
                     placeholder="facture de l'école après prise en charge OPCO"
                     value={form.reste_a_charge_mensuel == null || String(form.reste_a_charge_mensuel).trim() === ''
                       ? ''
                       : Math.round(Number(form.reste_a_charge_mensuel) * 12)}
                     onChange={e => handleChange('reste_a_charge_mensuel', e.target.value === '' ? '' : String(Number(e.target.value) / 12))} />
              <div className="form-hint">
                Frais de formation restant à payer par l entreprise sur l année (alternants). S ajoute au salaire brut dans les coûts et projections. Vide = 0.
              </div>
            </div>

            {/* Régularisation d historique : jours posés avant Smart RH */}
            <div className="form-group">
              <label className="form-label">Congés déjà pris hors Smart RH (jours)</label>
              <input className="form-input" type="number" step="0.5" min="0"
                     value={form.conges_deja_pris ?? 0}
                     onChange={e => handleChange('conges_deja_pris', e.target.value)} />
              <div className="form-hint">
                Jours décomptés posés avant la mise en place de Smart RH (vendredi = 2 j) : ils sont déduits du solde pour partir d un compteur juste.
              </div>
            </div>

            {/* Période de référence : report figé par la direction au 1er juin */}
            <div className="form-group">
              <label className="form-label">Report au 1er juin (jours)</label>
              <input className="form-input" type="number" step="0.5"
                     placeholder="vide = report automatique intégral"
                     value={form.conges_report ?? ''}
                     onChange={e => handleChange('conges_report', e.target.value)} />
              <div className="form-hint">
                Solde reporté de la période précédente (les congés se comptent du 1er juin au 31 mai). Vide = tout le solde non pris se reporte automatiquement ; saisis un nombre à la bascule pour le figer ou le plafonner.
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

            {/* Contrat de travail : le document signé vit dans la fiche */}
            {form.id ? (
              <DocsContrat contratId={form.id} typeContrat={form.type_contrat} nomSalarie={form.full_name} onChange={onDocsChange} />
            ) : (
              <div className="form-hint" style={{ marginBottom: 12 }}>
                📎 Enregistre la fiche une première fois pour pouvoir joindre les documents (contrat, CERFA, identité, sécu).
              </div>
            )}

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

          <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
            <div>
              {!isNew && onSupprimer && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: 'var(--danger, #c0392b)' }}
                  title="Supprimer définitivement cette fiche (confirmation demandée)"
                  onClick={onSupprimer}
                >
                  Supprimer cette fiche
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn btn-primary">{isNew ? 'Créer' : 'Enregistrer'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Projection du coût réel entreprise sur 12 mois
// Une barre par mois : salaire brut plus coût école restant à charge.
// Les arrivées et fins de contrat entrent et sortent à leur date, c est
// l outil de projection financière de la direction.
// ─────────────────────────────────────────────────────────────────────────
function ProjectionCout({ projection }) {
  const moisCourt = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  const max = Math.max(...projection.map(p => p.cout), 1)
  const fmtCompact = (v) => v >= 10000
    ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€`
    : fmtEur(v)
  return (
    <div className="card mb-24">
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Projection financière
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginTop: 4 }}>
            Coût réel entreprise sur 12 mois
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            Salaire brut plus coût école restant à charge, au prorata des jours de présence. Effectif compté au dernier jour du mois.
          </div>
        </div>
      </div>
      <div className="panel-body" style={{ overflowX: 'auto', padding: '18px 20px 14px' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', minWidth: 12 * 74 }}>
          {projection.map((p, i) => {
            const estCourant = i === 0
            const hPct = Math.max(4, (p.cout / max) * 100)
            return (
              <div
                key={i}
                title={`${moisCourt[p.mois.getMonth()]} ${p.mois.getFullYear()} : ${fmtEur(p.cout)} de coût réel (${fmtEur(p.brut)} brut), ${p.nb} en poste`}
                style={{ flex: 1, minWidth: 68, textAlign: 'center' }}
              >
                <div style={{
                  fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: estCourant ? 'var(--gold-dk)' : 'var(--t2)', marginBottom: 4, whiteSpace: 'nowrap',
                }}>
                  {fmtCompact(p.cout)}
                </div>
                <div style={{ height: 110, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{
                    width: '100%',
                    height: `${hPct}%`,
                    borderRadius: '7px 7px 3px 3px',
                    background: estCourant
                      ? 'linear-gradient(180deg, var(--gold) 0%, rgba(201,169,97,0.75) 100%)'
                      : 'linear-gradient(180deg, rgba(201,169,97,0.42) 0%, rgba(201,169,97,0.22) 100%)',
                    transition: 'height 300ms ease',
                  }} />
                </div>
                <div style={{
                  marginTop: 6, fontSize: 10, fontWeight: estCourant ? 700 : 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: estCourant ? 'var(--gold-dk)' : 'var(--t3)', whiteSpace: 'nowrap',
                }}>
                  {moisCourt[p.mois.getMonth()]}{p.mois.getMonth() === 0 ? ` ${p.mois.getFullYear()}` : ''}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 1, whiteSpace: 'nowrap' }}>
                  {p.nb} pers.
                  {p.arrivees > 0 && <span style={{ color: VERT, fontWeight: 700 }}> +{p.arrivees}</span>}
                  {p.departs > 0 && <span style={{ color: ROUGE, fontWeight: 700 }}> −{p.departs}</span>}
                </div>
              </div>
            )
          })}
        </div>
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
        const d = dateLocale(dateStr)
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
    // Une fin de contrat n est « passée » qu une fois la journée écoulée
    const limite = isStart
      ? ev.date
      : new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate(), 23, 59, 59)
    const isPast = limite < now
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
