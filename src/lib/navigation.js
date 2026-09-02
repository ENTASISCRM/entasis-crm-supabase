/* ─────────────────────────────────────────────────────────────────────────────
   NAVIGATION — source unique (Série B / B1).

   La sidebar passe de ~20 entrées à 8-9 DOMAINES ; chaque domaine regroupe
   des vues (les onglets historiques). Les clés `tab` sont inchangées : les
   conditionnels de rendu d'App.jsx et PAGE_TITLES restent valides.

   Cette structure est lue par :
   - la Sidebar (domaines + badges agrégés)
   - la barre de sous-onglets du domaine actif (App.jsx)
   - la palette ⌘K (liste des vues accessibles au rôle)
   - le routing hash (validation des deep links)
   → fin de la double maintenance sidebar/palette signalée dans
     CommandPalette.jsx.

   `sub` distingue les sous-vues d'un même tab (clients annuaire/dossiers).
   `badgeKey` pointe vers un compteur fourni par l'appelant (pipeline,
   immobilier, editorial) — la structure reste pure, sans dépendre des data.
───────────────────────────────────────────────────────────────────────────── */

export function buildNavDomains({ isManager, isRhDelegue, canSmartRh }) {
  const domains = [
    {
      key: 'accueil', label: 'Accueil', icon: 'Dashboard',
      views: [{ tab: 'dashboard', label: isManager ? 'Vue cabinet' : 'Mon mois' }],
    },
    {
      // A6 : les leads se lisent dans le CRM ; la Lead Room reste a un clic.
      key: 'leads', label: 'Leads', icon: 'Leads',
      views: [
        { tab: 'leads', sub: 'entrants', label: 'Leads entrants' },
        { tab: 'leads', sub: 'live', label: 'Leads Live' },
      ],
    },
    {
      key: 'activite', label: 'Activité', icon: 'Pipeline',
      views: [
        { tab: 'pipeline', label: 'Pipeline', badgeKey: 'pipeline' },
        { tab: 'forecast', label: (isManager || isRhDelegue) ? 'Management' : 'Prévisionnel' },
        { tab: 'agenda', label: 'Agenda' },
        { tab: 'cockpit', label: 'Cockpit ratios' },
      ],
    },
    {
      key: 'clients', label: 'Clients', icon: 'Team',
      views: [
        { tab: 'clients', sub: 'annuaire', label: 'Annuaire' },
        { tab: 'clients', sub: 'dossiers', label: 'Dossiers du mois' },
        // D6 : le rattrapage des fiches sans prenom, reserve a la direction.
        ...(isManager ? [{ tab: 'clients', sub: 'rattrapage', label: 'Fiches à rattraper' }] : []),
        { tab: 'multi-equipement', label: 'Multi-équipement' },
        { tab: 'conformite', label: 'Conformité' },
      ],
    },
    {
      key: 'partenaires', label: 'Partenaires', icon: 'Building',
      views: [
        { tab: 'partenaires', label: 'Annuaire' },
        { tab: 'immobilier', label: 'Immobilier · dossiers', badgeKey: 'immobilier' },
      ],
    },
    {
      key: 'marches', label: 'Marchés & Produits', icon: 'Market',
      views: [
        { tab: 'market', label: 'Marchés financiers' },
        { tab: 'ucs-structures', label: 'UCS Structurés' },
        { tab: 'allocations', label: 'Allocations types' },
      ],
    },
    {
      key: 'equipe-rh', label: 'Équipe & RH', icon: 'Team',
      views: [
        // Ordre : pilotage direction d'abord, self-service ensuite.
        ...((isManager || isRhDelegue) ? [
          { tab: 'team', label: 'Équipe' },
          { tab: 'pilotage-rh', label: 'Pilotage RH' },
          { tab: 'recrutement', label: 'Recrutement' },
        ] : []),
        ...(canSmartRh ? [{ tab: 'smart-rh', label: 'Smart RH · congés' }] : []),
        { tab: 'remuneration', label: 'Rémunération' },
      ],
    },
    ...(isManager ? [{
      key: 'editorial', label: 'Éditorial', icon: 'Editorial',
      views: [{ tab: 'editorial', label: 'Agent éditorial', badgeKey: 'editorial' }],
    }] : []),
    {
      key: 'outils', label: 'Outils CGP', icon: 'Outils',
      views: [{ tab: 'outils', label: 'Outils CGP' }],
    },
  ]
  return domains.filter((d) => d.views.length > 0)
}

// Identifiant unique d'une vue dans la barre de sous-onglets (`clients` a
// deux sous-vues qui partagent le même tab).
export const viewId = (v) => (v.sub ? `${v.tab}:${v.sub}` : v.tab)

// Domaine auquel appartient un onglet actif.
export const domainOf = (domains, tab) => domains.find((d) => d.views.some((v) => v.tab === tab))

// Ensemble des tabs accessibles (validation des deep links + palette).
export const visibleTabs = (domains) => new Set(domains.flatMap((d) => d.views.map((v) => v.tab)))
