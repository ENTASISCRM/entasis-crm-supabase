import { useState, useEffect, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { statusLabel } from '../../lib/ui-shared'
import ClientModal from './ClientModal.jsx'
import ClientPeek from './ClientPeek.jsx'
import { Skeleton, SkeletonTable } from '../ui/Skeleton'
import { euro, annualize } from '../../lib/format'
import { usePersistedState } from '../../hooks/usePersistedState'
import { exporterCsv, suffixeDate, nombreFr } from '../../lib/export-csv'

export default function ClientsView({ supabase, onSelectClient, profile }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // D1 : filtres et tri mémorisés par conseiller entre deux visites.
  const prefScope = profile?.advisor_code || profile?.id || 'anon'
  const [filterType, setFilterType] = usePersistedState('clients.ownership', 'Tous', prefScope) // Tous | Mes clients
  const [statusFilter, setStatusFilter] = usePersistedState('clients.status', 'Tous', prefScope) // statut global calculé
  const [sort, setSort] = usePersistedState('clients.sort', { col: null, dir: 'desc' }, prefScope) // null = ordre de création
  const [newClientModalOpen, setNewClientModalOpen] = useState(false)
  // B4 — aperçu latéral (pattern Attio) : un clic sur une ligne ouvre le
  // panneau par-dessus la liste ; « Voir » ouvre directement la fiche.
  const [peekClient, setPeekClient] = useState(null)
  // B6 — rendu paginé : 50 lignes affichées, « Afficher plus » pour la
  // suite. Le tri, la recherche et les filtres restent globaux (toute la
  // base), seul le DOM est borné — l'écran reste instantané à 5 000 clients.
  const PAGE_SIZE = 50
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // B6 — recherche debouncée : le filtrage ne retravaille pas toute la
  // liste à chaque frappe.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [debouncedSearch, filterType, statusFilter, sort])

  const isManager = profile?.role === 'manager'

  // Charger tous les clients avec leurs deals
  useEffect(() => {
    async function loadClients() {
      // Vérifier que la session est active avant de charger
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      setLoading(true)
      try {
        // Les 3 requetes sont independantes : on les lance en parallele
        // (Promise.all) au lieu d enchainer 3 allers-retours serie.
        // advisor_code + co_advisor_code necessaires pour le filtre "Mes clients"
        // (co-conseiller, cas Gianni Pichon co-conseiller de Clement).
        // B6 — colonnes explicites au lieu de select('*') : l'annuaire ne
        // transporte que ce qu'il affiche (payload réduit à volume égal).
        const [clientsRes, dealsRes, dossiersRes] = await Promise.all([
          supabase.from('clients').select('id, nom, prenom, email, telephone, advisor_code, co_advisor_code, created_at').order('created_at', { ascending: false }),
          supabase.from('deals').select('id, client_id, product, status, pp_m, pu, advisor_code, co_advisor_code').not('client_id', 'is', null),
          supabase.from('dossiers_immo').select('id, client_id, statut_pipeline').not('client_id', 'is', null),
        ])
        if (clientsRes.error) throw clientsRes.error
        if (dealsRes.error) throw dealsRes.error
        if (dossiersRes.error) throw dossiersRes.error
        const clientsData = clientsRes.data
        const dealsData = dealsRes.data
        const dossiersData = dossiersRes.data

        // Assembler manuellement
        const clients = (clientsData || []).map(c => ({
          ...c,
          deals: (dealsData || []).filter(d => d.client_id === c.id),
          dossiers_immo: (dossiersData || []).filter(d => d.client_id === c.id)
        }))

        setClients(clients)
      } catch (error) {
        console.error('Erreur chargement clients:', error)
        toast.error('Erreur lors du chargement des clients')
      } finally {
        setLoading(false)
      }
    }

    loadClients()
  }, [supabase])

  // Fonction pour calculer le statut global d'un client
  function getGlobalStatus(deals) {
    if (!deals || deals.length === 0) return 'Aucun deal'

    const statusPriority = { 'Signé': 4, 'Prévu': 3, 'En cours': 2, 'Annulé': 1 }
    const minPriority = Math.min(...deals.map(d => statusPriority[d.status] || 1))
    return Object.keys(statusPriority).find(status => statusPriority[status] === minPriority) || 'En cours'
  }

  // Fonction pour calculer le CA total d'un client
  function getClientCA(deals) {
    if (!deals) return 0
    return deals
      .filter(d => d.status === 'Signé')
      .reduce((sum, d) => sum + annualize(d.pp_m || 0) + (d.pu || 0), 0)
  }

  // Filtrage et recherche
  const filteredClients = useMemo(() => {
    let filtered = clients

    // Filtre par ownership — un client m'appartient si :
    //   - je suis l'advisor_code principal du client (créateur)
    //   - OU j'apparais sur au moins un de ses deals comme advisor_code
    //   - OU j'apparais sur au moins un de ses deals comme co_advisor_code
    // (La table clients elle-même n'a pas de co_advisor_code — c'est sur les
    // deals. Avant ce fix, le filtre ignorait les clients où l'utilisateur
    // n'était que co-conseiller sur un deal, signalé par Gianni 26/05.)
    if (!isManager && filterType === 'Mes clients') {
      const myCode = profile?.advisor_code
      filtered = filtered.filter(c =>
        c.advisor_code === myCode ||
        (c.deals || []).some(d => d.advisor_code === myCode || d.co_advisor_code === myCode)
      )
    }

    // Recherche textuelle (valeur debouncée)
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase()
      filtered = filtered.filter(c =>
        (c.nom || '').toLowerCase().includes(searchLower) ||
        (c.prenom || '').toLowerCase().includes(searchLower) ||
        (c.email || '').toLowerCase().includes(searchLower) ||
        (c.telephone || '').toLowerCase().includes(searchLower) ||
        (c.advisor_code || '').toLowerCase().includes(searchLower)
      )
    }

    return filtered
  }, [clients, debouncedSearch, filterType, isManager, profile])

  // Enrichir les clients avec métriques calculées, puis appliquer le filtre
  // sur le statut global (Sans deal correspond a la valeur Aucun deal)
  const enrichedClients = useMemo(() => {
    const enriched = filteredClients.map(client => ({
      ...client,
      globalStatus: getGlobalStatus(client.deals),
      caTotal: getClientCA(client.deals),
      hasImmo: (client.dossiers_immo || []).length > 0
    }))
    if (statusFilter === 'Tous') return enriched
    const cible = statusFilter === 'Sans deal' ? 'Aucun deal' : statusFilter
    return enriched.filter(c => c.globalStatus === cible)
  }, [filteredClients, statusFilter])

  // Tri cliquable des colonnes Client, Produits et CA total. Sans colonne
  // choisie on garde l ordre par date de creation renvoye par la requete.
  const sortedClients = useMemo(() => {
    if (!sort.col) return enrichedClients
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...enrichedClients].sort((a, b) => {
      if (sort.col === 'client') {
        const na = `${a.nom || ''} ${a.prenom || ''}`.trim().toLowerCase()
        const nb = `${b.nom || ''} ${b.prenom || ''}`.trim().toLowerCase()
        return na.localeCompare(nb, 'fr') * dir
      }
      if (sort.col === 'produits') return ((a.deals || []).length - (b.deals || []).length) * dir
      if (sort.col === 'ca') return ((a.caTotal || 0) - (b.caTotal || 0)) * dir
      return 0
    })
  }, [enrichedClients, sort])

  // Premier clic : croissant pour le nom, decroissant pour les valeurs.
  // Second clic sur la meme colonne : sens inverse.
  const toggleSort = (col) => {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: col === 'client' ? 'asc' : 'desc' })
  }

  const sortArrow = (col) => sort.col === col ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''

  // D7 — export CSV de l'annuaire tel qu'affiché (mêmes filtres, même tri).
  function exporterClients() {
    if (!sortedClients.length) { toast('Aucun client à exporter'); return }
    const colonnes = ['Nom', 'Prénom', 'Email', 'Téléphone', 'Conseiller', 'Co-conseiller', 'Produits', 'Dossiers immobilier', 'Statut global', 'CA total']
    const lignes = sortedClients.map(c => [
      c.nom || '', c.prenom || '', c.email || '', c.telephone || '',
      c.advisor_code || '', c.co_advisor_code || '',
      (c.deals || []).length, (c.dossiers_immo || []).length,
      statusLabel(c.globalStatus) || c.globalStatus || '', nombreFr(c.caTotal),
    ])
    exporterCsv(`clients-${suffixeDate()}`, colonnes, lignes)
    toast.success(`${sortedClients.length} client${sortedClients.length > 1 ? 's' : ''} exporté${sortedClients.length > 1 ? 's' : ''}`)
  }

  const handleClientCreated = (newClient) => {
    setClients(prev => [newClient, ...prev])
    setNewClientModalOpen(false)
  }

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>
        <Skeleton h={24} w={220} style={{ marginBottom: 24 }} />
        <SkeletonTable rows={8} cols={6} />
      </div>
    )
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0, color: 'var(--t1)' }}>
            Clients ({enrichedClients.length})
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* D7 : exporte la sélection affichée (filtres + tri), pas toute la base. */}
          <button
            className="btn btn-outline"
            onClick={exporterClients}
            disabled={!sortedClients.length}
            title="Exporter les clients affichés en CSV (Excel)"
          >
            Exporter ({sortedClients.length})
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setNewClientModalOpen(true)}
          >
            + Nouveau client
          </button>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '24px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <input
            className="form-input"
            placeholder="Rechercher un client (nom, email, téléphone...)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-input"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ width: 'auto', minWidth: '150px' }}
        >
          <option value="Tous">Tous les clients</option>
          {!isManager && <option value="Mes clients">Mes clients</option>}
        </select>
        <select
          className="form-input"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '150px' }}
          title="Filtrer par statut global"
        >
          <option value="Tous">Tous les statuts</option>
          <option value="Signé">Signé</option>
          <option value="En cours">En cours</option>
          <option value="Prévu">{statusLabel('Prévu')}</option>
          <option value="Sans deal">Sans deal</option>
        </select>
      </div>

      {/* Tableau des clients */}
      {enrichedClients.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '60px' }}>
            {/* Le filtre d'appartenance est désormais mémorisé (D1) : il doit
                entrer dans ce test, sinon l'écran annonce « aucun client »
                alors qu'un filtre posé la semaine dernière est encore actif. */}
            <div style={{ fontSize: '18px', color: 'var(--t2)', marginBottom: '16px' }}>
              {(search || statusFilter !== 'Tous' || filterType !== 'Tous') ? 'Aucun client trouvé' : 'Aucun client'}
            </div>
            <div style={{ color: 'var(--t3)', marginBottom: '24px' }}>
              {(search || statusFilter !== 'Tous' || filterType !== 'Tous')
                ? 'Aucun résultat avec les filtres actifs — élargissez la recherche ou les filtres.'
                : 'Commencez par créer votre premier client'
              }
            </div>
            {!search && statusFilter === 'Tous' && filterType === 'Tous' && (
              <button
                className="btn btn-primary"
                onClick={() => setNewClientModalOpen(true)}
              >
                + Nouveau client
              </button>
            )}
          </div>
        </div>
      ) : (
        /* data-table : mêmes tokens que le reste du CRM (thead, hover CSS,
           paddings) au lieu des couleurs héritées de l'ancien thème beige.
           table-wrap porte déjà le style carte, pas besoin de .card autour. */
        <div className="table-wrap">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th
                    style={{ width: '35%', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('client')}
                    title="Trier par nom"
                    aria-sort={sort.col === 'client' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >Client{sortArrow('client')}</th>
                  <th style={{ width: '15%' }}>Conseiller</th>
                  <th
                    style={{ width: '10%', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('produits')}
                    title="Trier par nombre de produits"
                    aria-sort={sort.col === 'produits' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >Produits{sortArrow('produits')}</th>
                  <th style={{ width: '15%' }}>Statut global</th>
                  <th
                    style={{ width: '15%', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('ca')}
                    title="Trier par CA total"
                    aria-sort={sort.col === 'ca' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >CA total{sortArrow('ca')}</th>
                  <th style={{ width: '10%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedClients.slice(0, visibleCount).map(client => (
                  <tr
                    key={client.id}
                    onClick={() => setPeekClient(client)}
                    style={{ cursor: 'pointer' }}
                    title="Aperçu rapide — « Voir » ouvre la fiche complète"
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div>
                          <div className="cell-primary">
                            {client.prenom} {client.nom}
                          </div>
                          <div className="cell-sub">
                            {client.email || client.telephone || '—'}
                          </div>
                        </div>
                        {client.hasImmo && (
                          <span
                            className="badge"
                            title="Client avec dossiers immobilier"
                            style={{ background: 'var(--gold)', color: '#fff', borderColor: 'transparent' }}
                          >
                            Immo
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cell-primary">{client.advisor_code || '—'}</div>
                      {client.co_advisor_code && (
                        <div className="cell-sub">
                          Co: {client.co_advisor_code}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="cell-primary">
                        {(client.deals || []).length} produit{(client.deals || []).length > 1 ? 's' : ''}
                      </div>
                      {client.dossiers_immo?.length > 0 && (
                        <div className="cell-sub">
                          {client.dossiers_immo.length} immo
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(client.globalStatus)}`}>
                        {statusLabel(client.globalStatus)}
                      </span>
                    </td>
                    <td>
                      <div className="cell-primary">
                        {euro(client.caTotal)}
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={e => {
                          e.stopPropagation()
                          onSelectClient(client.id)
                        }}
                      >
                        Voir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedClients.length > visibleCount && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '14px 16px', borderTop: '0.5px solid var(--bd)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
                  {visibleCount} affichés sur {sortedClients.length}
                </span>
                <button className="btn btn-outline btn-sm" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                  Afficher {Math.min(PAGE_SIZE, sortedClients.length - visibleCount)} de plus
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setVisibleCount(sortedClients.length)}>
                  Tout afficher
                </button>
              </div>
            )}
        </div>
      )}

      {/* Aperçu latéral (B4) */}
      <ClientPeek
        client={peekClient}
        onClose={() => setPeekClient(null)}
        onOpenFull={(id) => { setPeekClient(null); onSelectClient(id) }}
      />

      {/* Modal nouveau client */}
      <ClientModal
        open={newClientModalOpen}
        client={null}
        onClose={() => setNewClientModalOpen(false)}
        onSave={handleClientCreated}
        supabase={supabase}
        profile={profile}
      />
    </div>
  )
}

// Helper pour les classes de statut
function getStatusBadgeClass(status) {
  switch (status) {
    case 'Signé': return 'badge-signed'
    case 'Prévu': return 'badge-forecast'
    case 'En cours': return 'badge-progress'
    case 'Annulé': return 'badge-cancelled'
    default: return ''
  }
}