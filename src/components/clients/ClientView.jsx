import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { Skeleton, SkeletonCards, SkeletonTable } from '../ui/Skeleton'
import SubTabs from '../ui/SubTabs'
import { statusLabel } from '../../lib/ui-shared'
import { euro, annualize } from '../../lib/format'
import ClientModal from './ClientModal.jsx'
import ClientEquipementCard from './ClientEquipementCard.jsx'
import ClientContratsCard from './ClientContratsCard.jsx'
import ClientEspaceCard from './ClientEspaceCard.jsx'
import ClientTimeline from './ClientTimeline.jsx'
import { partenaireDe, etapeDe } from '../../config/partenairesImmo'

// Copie une valeur dans le presse papiers avec retour visuel
function copier(valeur, label) {
  navigator.clipboard.writeText(valeur)
    .then(() => toast.success(`${label} copié`))
    .catch(() => toast.error('Copie impossible'))
}

// euro/annualize : source unique lib/format.js (B7).

// Statuts avec couleurs
const STATUS_CLASS = {
  'Signé': 'badge badge-signed',
  'En cours': 'badge badge-progress',
  'Prévu': 'badge badge-forecast',
  'Annulé': 'badge badge-cancelled',
}

// Etapes d un dossier confie a un partenaire immobilier (Althera, François 1er).
const PIPELINE_STATUS_CLASS = {
  'transmis': 'badge badge-forecast',
  'etude': 'badge badge-progress',
  'reserve': 'badge badge-progress',
  'acte': 'badge badge-signed',
  'sans_suite': 'badge badge-normal',
}

// Rouge charte pour le manque (voir styles.css, semantique "manque").
const ROUGE_MANQUE = '#B4453B'

// Champs obligatoires d'une fiche client, STRICTEMENT identiques au verrou de
// signature d'un deal (App.jsx submitInner, passage en "Signé"). Sans eux,
// impossible de signer et le module Opportunites reste aveugle. La
// date_naissance ne compte PAS ici : c'est un bonus recommande pour les
// anniversaires, traite a part.
const CHAMPS_REQUIS = [
  { cle: 'email', label: 'email' },
  { cle: 'telephone', label: 'téléphone' },
  { cle: 'statut_pro', label: 'statut' },
  { cle: 'profession', label: 'profession' },
  { cle: 'revenus_annuels', label: 'revenus' },
  { cle: 'patrimoine_estime', label: 'patrimoine' },
]

// Un champ est renseigne s'il n'est ni null/undefined ni chaine vide apres
// trim. Meme regle que le verrou de signature : une valeur numerique a 0
// (ex. patrimoine 0) compte comme renseignee, c'est une donnee saisie.
function champRempli(valeur) {
  return valeur != null && String(valeur).trim() !== ''
}

// Calcule l'etat de completude d'une fiche client (6 champs obligatoires).
function calculerCompletude(client) {
  const manquants = CHAMPS_REQUIS.filter(c => !champRempli(client?.[c.cle]))
  return {
    remplis: CHAMPS_REQUIS.length - manquants.length,
    total: CHAMPS_REQUIS.length,
    manquants,
    complet: manquants.length === 0,
    dateNaissanceManquante: !champRempli(client?.date_naissance),
  }
}

export default function ClientView({ clientId, onBack, supabase, profile, onEditDeal, onAddDeal }) {
  const [client, setClient] = useState(null)
  const [clientDeals, setClientDeals] = useState([])
  const [clientDossiers, setClientDossiers] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [expandedDeal, setExpandedDeal] = useState(null)
  // B4 — la fiche en onglets : Synthèse / Patrimoine & contrats /
  // Documents & espace client / Immobilier / Historique.
  const [tab, setTab] = useState('synthese')

  const isManager = profile?.role === 'manager'

  // Charger toutes les données du client
  useEffect(() => {
    if (!clientId) return

    async function loadClientData() {
      // Vérifier que la session est active avant de charger
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      setLoading(true)
      try {
        // 1-2-3 : client, deals et dossiers immo sont independants, on les charge
        // en parallele (Promise.all) au lieu de 3 allers-retours serie.
        const [clientRes, dealsRes, dossiersRes] = await Promise.all([
          supabase.from('clients').select('*').eq('id', clientId).single(),
          supabase.from('deals').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
          supabase.from('dossiers_immo').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        ])

        if (clientRes.error) throw clientRes.error
        setClient(clientRes.data)

        if (dealsRes.error) throw dealsRes.error
        const dealsData = dealsRes.data || []
        setClientDeals(dealsData)

        if (dossiersRes.error) throw dossiersRes.error
        setClientDossiers(dossiersRes.data || [])

        // 4. Historique des actions (depend des dealIds, donc apres)
        if (dealsData?.length > 0) {
          const dealIds = dealsData.map(d => d.id)
          const { data: historyData, error: historyError } = await supabase
            .from('activities')
            .select(`
              *,
              user:profiles(full_name)
            `)
            .in('deal_id', dealIds)
            .order('created_at', { ascending: false })
            .limit(20)

          if (!historyError) {
            setHistory(historyData || [])
          }
        }

      } catch (error) {
        console.error('Erreur chargement client:', error)
        toast.error('Erreur lors du chargement')
      } finally {
        setLoading(false)
      }
    }

    loadClientData()
  }, [clientId])

  // Calcul des métriques
  const signedDeals = clientDeals.filter(d => d.status === 'Signé')
  const caTotal = signedDeals.reduce((sum, d) => sum + annualize(d.pp_m || 0) + (d.pu || 0), 0)

  // Statut global (le moins avancé)
  const statusPriority = { 'Signé': 4, 'Prévu': 3, 'En cours': 2, 'Annulé': 1 }
  const globalStatus = clientDeals.length > 0
    ? Object.keys(statusPriority).find(status =>
        statusPriority[status] === Math.min(...clientDeals.map(d => statusPriority[d.status] || 1))
      ) || 'En cours'
    : 'Aucun deal'

  // Derniere activite : anciennete en jours de la derniere action chargee
  // (history est trie du plus recent au plus ancien). Au dela de 90 jours,
  // ou sans aucune activite, le chip passe en ambre : signal de relance.
  const lastActivityDays = history.length > 0
    ? Math.max(0, Math.floor((Date.now() - new Date(history[0].created_at).getTime()) / 86400000))
    : null
  const activiteEnRetard = lastActivityDays === null || lastActivityDays >= 90

  // Recharger les deals du client après sauvegarde
  const reloadClientDeals = async () => {
    if (!client?.id) return
    try {
      const { data } = await supabase
        .from('deals')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
      setClientDeals(data || [])
    } catch (error) {
      console.error('Erreur rechargement deals:', error)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <Skeleton h={22} w={260} style={{ marginBottom: 18 }} />
        <SkeletonCards n={5} />
        <div style={{ height: 22 }} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="notice notice-error">
        Client introuvable
        <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: '16px' }}>
          ← Retour
        </button>
      </div>
    )
  }

  // Completude de la fiche (client garanti non nul apres les gardes ci-dessus).
  // Vert si 6/6, rouge si <= 2/6, orange sinon.
  const completude = calculerCompletude(client)
  const scoreCouleur = completude.complet
    ? '#2C6B4E'
    : (completude.remplis <= 2 ? ROUGE_MANQUE : '#B45309')

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Bandeau "Fiche incomplete" : impossible a rater, en haut de la fiche.
          N'apparait que si au moins un champ obligatoire manque. */}
      {!completude.complet && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          padding: '16px 20px',
          marginBottom: '24px',
          backgroundColor: 'rgba(180, 69, 59, 0.08)',
          border: `1px solid ${ROUGE_MANQUE}`,
          borderLeft: `4px solid ${ROUGE_MANQUE}`,
          borderRadius: 'var(--rad)'
        }}>
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: ROUGE_MANQUE, marginBottom: '6px' }}>
              ⚠ Fiche incomplète
            </div>
            <div style={{ fontSize: '13px', color: 'var(--t1)', marginBottom: '8px' }}>
              Champs manquants : {completude.manquants.map(c => c.label).join(', ')}.
            </div>
            <div style={{ fontSize: '13px', color: 'var(--t2)' }}>
              À compléter pour pouvoir signer et alimenter les opportunités de vente.
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setEditModalOpen(true)}
            style={{ whiteSpace: 'nowrap', alignSelf: 'center' }}
          >
            Compléter
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        paddingBottom: '20px',
        borderBottom: '1px solid var(--bd)'
      }}>
        <div>
          <button
            className="btn btn-secondary"
            onClick={onBack}
            style={{ marginBottom: '12px' }}
          >
            ← Retour à la liste
          </button>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '600',
            margin: '0 0 8px 0',
            color: 'var(--t1)'
          }}>
            {client.prenom} {client.nom}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', color: 'var(--t2)' }}>
              Conseiller: {client.advisor_code || '—'}
            </span>
            {client.co_advisor_code && (
              <span style={{ fontSize: '14px', color: 'var(--t2)' }}>
                Co-conseiller: {client.co_advisor_code}
              </span>
            )}
            <span className={STATUS_CLASS[globalStatus] || 'badge'}>
              {statusLabel(globalStatus)}
            </span>

            {/* Score de completude, toujours visible (vert a 6/6). */}
            <span
              title="Complétude de la fiche client (6 champs obligatoires pour signer)"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span style={{ fontSize: '13px', fontWeight: '600', color: scoreCouleur, whiteSpace: 'nowrap' }}>
                Fiche {completude.remplis}/{completude.total}
              </span>
              <span style={{
                width: '64px',
                height: '6px',
                borderRadius: '3px',
                backgroundColor: 'rgba(60,60,67,0.12)',
                overflow: 'hidden',
                display: 'inline-block'
              }}>
                <span style={{
                  display: 'block',
                  width: `${(completude.remplis / completude.total) * 100}%`,
                  height: '100%',
                  backgroundColor: scoreCouleur,
                  borderRadius: '3px'
                }} />
              </span>
            </span>

            {/* Date de naissance : bonus recommande (anniversaires), hors score
                obligatoire. Signal doux, jamais rouge. */}
            {completude.dateNaissanceManquante && (
              <span style={{
                fontSize: '12px',
                fontWeight: '600',
                padding: '3px 8px',
                borderRadius: '10px',
                backgroundColor: 'var(--gold-subtle)',
                color: 'var(--gold-dk)',
                whiteSpace: 'nowrap'
              }}>
                Date de naissance recommandée
              </span>
            )}
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setEditModalOpen(true)}
        >
          Modifier
        </button>
      </div>

      {/* B4 — sections en onglets : consultation ciblée au lieu d'un long
          défilement ; les cartes Contrats/Espace/Équipement chargent leurs
          données à leur montage, donc chaque onglet charge à la demande. */}
      <SubTabs
        ariaLabel="Sections de la fiche client"
        tabs={[
          { key: 'synthese', label: 'Synthèse' },
          { key: 'patrimoine', label: 'Patrimoine & contrats', badge: clientDeals.length },
          { key: 'documents', label: 'Documents & espace client' },
          { key: 'immobilier', label: 'Immobilier', badge: clientDossiers.length },
          { key: 'historique', label: 'Historique' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'synthese' && (<>
      {/* Cards résumé */}
      <div className="grid grid-4" style={{ marginBottom: '32px' }}>
        <div className="card">
          <div className="card-header" style={{ padding: '20px 24px 12px 24px' }}>
            <h3>Produits financiers</h3>
          </div>
          <div className="card-body" style={{ padding: '0 24px 20px 24px' }}>
            <div className="kpi-value">{clientDeals.length}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header" style={{ padding: '20px 24px 12px 24px' }}>
            <h3>CA total</h3>
          </div>
          <div className="card-body" style={{ padding: '0 24px 20px 24px' }}>
            <div className="kpi-value">{euro(caTotal)}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header" style={{ padding: '20px 24px 12px 24px' }}>
            <h3>Dossiers immobilier</h3>
          </div>
          <div className="card-body" style={{ padding: '0 24px 20px 24px' }}>
            <div className="kpi-value">{clientDossiers.length}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header" style={{ padding: '20px 24px 12px 24px' }}>
            <h3>Patrimoine estimé</h3>
          </div>
          <div className="card-body" style={{ padding: '0 24px 20px 24px' }}>
            <div className="kpi-value">{euro(client.patrimoine_estime)}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header" style={{ padding: '20px 24px 12px 24px' }}>
            <h3>Dernière activité</h3>
          </div>
          <div className="card-body" style={{ padding: '0 24px 20px 24px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div className="kpi-value">
              {lastActivityDays === null
                ? '—'
                : lastActivityDays === 0
                  ? 'Auj.'
                  : `il y a ${lastActivityDays} j`}
            </div>
            <span style={{
              fontSize: '11px',
              fontWeight: '600',
              padding: '3px 8px',
              borderRadius: '10px',
              backgroundColor: activiteEnRetard ? 'rgba(217, 119, 6, 0.14)' : 'rgba(22, 163, 74, 0.12)',
              color: activiteEnRetard ? '#B45309' : '#15803D'
            }}>
              {activiteEnRetard ? 'À relancer' : 'Suivi actif'}
            </span>
          </div>
        </div>
      </div>

      {/* Section Informations client */}
      <div className="grid grid-2" style={{ marginBottom: '32px' }}>
        {/* Colonne gauche - Identité */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-header" style={{ padding: '24px 28px 16px 28px' }}>
            <h3>Identité</h3>
          </div>
          <div className="card-body" style={{ padding: '0 28px 24px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ marginBottom: '12px' }}>
                <strong>Nom complet:</strong> {client.prenom} {client.nom}
              </div>
              {client.email && (
                <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <strong>Email:</strong>
                  <a href={`mailto:${client.email}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                    {client.email}
                  </a>
                  <button
                    onClick={() => copier(client.email, 'Email')}
                    title="Copier l'email"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '13px' }}
                  >
                    📋
                  </button>
                </div>
              )}
              {client.telephone && (
                <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <strong>Téléphone:</strong>
                  <a href={`tel:${client.telephone.replace(/[^+\d]/g, '')}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                    {client.telephone}
                  </a>
                  <button
                    onClick={() => copier(client.telephone, 'Téléphone')}
                    title="Copier le téléphone"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '13px' }}
                  >
                    📋
                  </button>
                </div>
              )}
              {client.age && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>Âge:</strong> {client.age} ans
                </div>
              )}
              {client.situation_familiale && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>Situation:</strong> {client.situation_familiale}
                </div>
              )}
              {client.nb_enfants > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>Enfants:</strong> {client.nb_enfants}
                </div>
              )}
              {client.profession && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>Profession:</strong> {client.profession}
                </div>
              )}
              {(client.adresse || client.ville) && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>Adresse:</strong> {[client.adresse, client.code_postal, client.ville].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite - Patrimoine */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-header" style={{ padding: '24px 28px 16px 28px' }}>
            <h3>Patrimoine & Objectifs</h3>
          </div>
          <div className="card-body" style={{ padding: '0 28px 24px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {client.revenus_annuels && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>Revenus annuels:</strong> {euro(client.revenus_annuels)}
                </div>
              )}
              {client.patrimoine_estime && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>Patrimoine estimé:</strong> {euro(client.patrimoine_estime)}
                </div>
              )}
              {client.objectifs?.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>Objectifs:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {client.objectifs.map(obj => (
                      <span key={obj} className="badge" style={{
                        backgroundColor: 'var(--gold)',
                        color: 'white',
                        fontSize: '11px'
                      }}>
                        {obj}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {client.notes && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>Notes:</strong>
                  <div style={{
                    marginTop: '6px',
                    padding: '8px',
                    backgroundColor: 'var(--bg)',
                    borderRadius: 'var(--rad)',
                    fontSize: '13px',
                    lineHeight: '1.4'
                  }}>
                    {client.notes}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </>)}

      {tab === 'patrimoine' && (<>
      {/* Section Produits financiers */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <div className="card-header" style={{ padding: '24px 28px 16px 28px' }}>
          <h3>Produits financiers ({clientDeals.length})</h3>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onAddDeal && onAddDeal({
              client_id: client.id,
              client: `${client.prenom || ''} ${client.nom}`.trim(),
              client_email: client.email || '',
              client_phone: client.telephone || ''
            }, reloadClientDeals)}
          >
            + Ajouter un produit
          </button>
        </div>
        <div className="card-body" style={{ padding: '0 28px 24px 28px' }}>
          {clientDeals.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--t2)', padding: '40px' }}>
              Aucun produit financier
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {clientDeals.map(deal => {
                const isExpanded = expandedDeal === deal.id
                return (
                  <div key={deal.id}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '16px',
                        backgroundColor: isExpanded ? 'rgba(201, 169, 97, 0.05)' : 'var(--bg)',
                        borderRadius: 'var(--rad)',
                        border: isExpanded ? '2px solid var(--gold)' : '1px solid var(--bd)',
                        cursor: 'pointer'
                      }}
                      onClick={() => setExpandedDeal(isExpanded ? null : deal.id)}
                    >
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                          {deal.product}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--t2)' }}>
                          PP: {euro(annualize(deal.pp_m || 0))} | PU: {euro(deal.pu || 0)}
                        </div>
                        {deal.co_advisor_code && (
                          <div style={{ fontSize: '11px', color: 'var(--t3)' }}>
                            Co-conseiller: {deal.co_advisor_code}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className={STATUS_CLASS[deal.status]}>
                          {statusLabel(deal.status)}
                        </span>
                        {deal.date_signed && (
                          <span style={{ fontSize: '12px', color: 'var(--t2)' }}>
                            {deal.date_signed}
                          </span>
                        )}
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditDeal && onEditDeal(deal, reloadClientDeals)
                          }}
                        >
                          Modifier
                        </button>
                      </div>
                    </div>

                    {/* Détails expandés */}
                    {isExpanded && (
                      <div style={{
                        marginTop: '8px',
                        padding: '16px',
                        backgroundColor: 'var(--bg)',
                        borderRadius: 'var(--rad)',
                        border: '1px solid var(--bd)',
                        marginLeft: '20px'
                      }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
                          Détails du produit
                        </h4>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <strong>Mois:</strong> {deal.month || '—'}
                          </div>
                          <div>
                            <strong>Compagnie:</strong> {deal.company || '—'}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <strong>Source:</strong> {deal.source || '—'}
                          </div>
                          <div>
                            <strong>Priorité:</strong> {deal.priority || 'Normale'}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <strong>Date prévue:</strong> {deal.date_expected || '—'}
                          </div>
                          <div>
                            <strong>Date signée:</strong> {deal.date_signed || '—'}
                          </div>
                        </div>

                        {deal.tags && deal.tags.length > 0 && (
                          <div style={{ marginBottom: '12px' }}>
                            <strong>Tags:</strong>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                              {deal.tags.map(tag => (
                                <span key={tag} style={{
                                  background: 'var(--gold)',
                                  color: 'white',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '11px'
                                }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {deal.notes && (
                          <div>
                            <strong>Notes:</strong>
                            <div style={{
                              marginTop: '4px',
                              padding: '8px',
                              backgroundColor: 'white',
                              borderRadius: '4px',
                              fontSize: '13px',
                              lineHeight: '1.4'
                            }}>
                              {deal.notes}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section Patrimoine : referentiel contrats (vie du contrat, timeline,
          valorisations), alimente automatiquement par les deals signes */}
      <ClientContratsCard clientId={client.id} client={client} profile={profile} />

      {/* Section Equipement : familles detenues, absences et suggestion */}
      <ClientEquipementCard clientId={client.id} client={client} supabase={supabase} />
      </>)}

      {/* Section Espace client : acces portail + documents partages */}
      {tab === 'documents' && (
        <ClientEspaceCard clientId={client.id} client={client} supabase={supabase} profile={profile} />
      )}

      {/* Section Dossiers immobilier — Entasis ne vend pas de lots : le dossier
          est confie a un referent partenaire, on suit ici ce qui lui a ete
          transmis et ou cela en est. */}
      {tab === 'immobilier' && (clientDossiers.length > 0 ? (
        <div className="card" style={{ marginBottom: '32px' }}>
          <div className="card-header">
            <h3>Dossiers confiés à un partenaire ({clientDossiers.length})</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {clientDossiers.map(dossier => {
                const partenaire = partenaireDe(dossier.partenaire)
                const etape = etapeDe(dossier.statut_pipeline)
                return (
                  <div key={dossier.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px',
                    backgroundColor: 'var(--bg)',
                    borderRadius: 'var(--rad)',
                    border: '1px solid var(--bd)'
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                        {partenaire ? `${partenaire.societe} · ${partenaire.referent}` : 'Partenaire non précisé'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--t2)' }}>
                        {dossier.dispositif_retenu || 'Dispositif à définir'}
                        {dossier.budget_total ? ` | Budget ${euro(dossier.budget_total)}` : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>
                        {dossier.transmis_le
                          ? `Transmis le ${new Date(dossier.transmis_le).toLocaleDateString('fr-FR')}`
                          : 'Pas encore transmis au référent'}
                      </div>
                    </div>
                    <span className={PIPELINE_STATUS_CLASS[dossier.statut_pipeline] || 'badge'}>
                      {etape.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="table-empty-state">
          <div className="empty-title">Aucun dossier immobilier</div>
          <div className="empty-sub">Les dossiers transmis à Althera Patrimoine ou à François 1er depuis l onglet Immobilier apparaîtront ici.</div>
        </div>
      ))}

      {/* Section Historique — D4 : une seule chronologie (échanges consignés
          à la main + activités système + jalons de signature des dossiers). */}
      {tab === 'historique' && (
        <ClientTimeline clientId={client.id} deals={clientDeals} history={history} profile={profile} />
      )}

      {/* Modal d'édition */}
      <ClientModal
        open={editModalOpen}
        client={client}
        onClose={() => setEditModalOpen(false)}
        onSave={(updatedClient) => {
          setClient(updatedClient)
          setEditModalOpen(false)
        }}
        supabase={supabase}
        profile={profile}
      />
    </div>
  )
}