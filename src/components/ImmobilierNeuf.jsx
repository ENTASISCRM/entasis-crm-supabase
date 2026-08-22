/* ─────────────────────────────────────────────────────────────────────────────
   IMMOBILIER NEUF — conteneur unique fusionnant les 4 anciens onglets immo
   (Vue Immo / Programmes / Mes Dossiers / Pipeline VEFA) en sous-vues.

   INTÉGRATION (à faire dans App.jsx par le chef de chantier) :

   1. Lazy import à AJOUTER :
        const ImmobilierNeuf = lazy(() => import('./components/ImmobilierNeuf'))

   2. Lazy imports à RETIRER (lignes ~20-23) :
        const VueImmobilier = lazy(() => import('./components/VueImmobilier'))
        const CatalogueProgrammes = lazy(() => import('./components/CatalogueProgrammes'))
        const MesDossiersImmo = lazy(() => import('./components/MesDossiersImmo'))
        const PipelineVEFA = lazy(() => import('./components/PipelineVEFA'))
      (ces 4 composants restent sur disque : ils sont désormais importés
       statiquement par CE conteneur, lui-même lazy-loadé.)

   3. Sidebar — remplacer les 4 entrées immoItems
        {key:'immo-dashboard', label:'Vue Immo',      Icon:Icon.Building}
        {key:'immo-programmes',label:'Programmes',    Icon:Icon.Catalogue}
        {key:'immo-dossiers',  label:'Mes Dossiers',  Icon:Icon.ImmoFolder, badge:dossiersImmoCount||0}
        {key:'immo-pipeline',  label:'Pipeline VEFA', Icon:Icon.Kanban}
      par UNE seule :
        {key:'immobilier', label:'Immobilier Neuf', Icon:Icon.Building, badge:dossiersImmoCount||0}

   4. Rendu conditionnel — remplacer les 4 lignes (~5535-5538)
        {activeTab==='immo-dashboard'&&<VueImmobilier profile={profile} setActiveTab={setActiveTab}/>}
        {activeTab==='immo-programmes'&&<CatalogueProgrammes setActiveTab={setActiveTab}/>}
        {activeTab==='immo-dossiers'&&<MesDossiersImmo profile={profile} teamProfiles={teamProfiles} setActiveTab={setActiveTab}/>}
        {activeTab==='immo-pipeline'&&<PipelineVEFA profile={profile} teamProfiles={teamProfiles}/>}
      par UNE seule :
        {activeTab==='immobilier'&&<ImmobilierNeuf profile={profile} teamProfiles={teamProfiles}/>}

   5. PAGE_TITLES — retirer les 4 entrées
        'immo-dashboard':'Immobilier Neuf', 'immo-programmes':'Catalogue Programmes',
        'immo-dossiers':'Mes Dossiers Immobilier', 'immo-pipeline':'Pipeline VEFA'
      et les remplacer par :
        'immobilier':'Immobilier Neuf 🏠'

   6. CommandPalette : AUCUN changement — elle reçoit pages={PAGE_TITLES} et
      suivra automatiquement la fusion des entrées.
───────────────────────────────────────────────────────────────────────────── */
import { useState } from 'react'
import SubTabs from './ui/SubTabs'
import VueImmobilier from './VueImmobilier'
import CatalogueProgrammes from './CatalogueProgrammes'
import MesDossiersImmo from './MesDossiersImmo'
import PipelineVEFA from './PipelineVEFA'

// Sous-vues internes du conteneur.
const VIEWS = [
  { key: 'dashboard', label: "Vue d'ensemble" },
  { key: 'programmes', label: 'Programmes' },
  { key: 'dossiers', label: 'Mes dossiers' },
  { key: 'pipeline', label: 'Pipeline' },
]

// Les composants enfants naviguent encore via setActiveTab(<ancien id d'onglet
// App>). On traduit ces ids historiques vers le state `view` local ; tout autre
// id est ignoré silencieusement.
const LEGACY_TAB_TO_VIEW = {
  'immo-dashboard': 'dashboard',
  'immo-programmes': 'programmes',
  'immo-dossiers': 'dossiers',
  'immo-pipeline': 'pipeline',
}

export default function ImmobilierNeuf({ profile, teamProfiles, initialView = 'dashboard' }) {
  const [view, setView] = useState(VIEWS.some(v => v.key === initialView) ? initialView : 'dashboard')

  // Shim passé aux enfants à la place du setActiveTab global d'App.
  const navigate = (tabId) => {
    const target = LEGACY_TAB_TO_VIEW[tabId]
    if (target) setView(target)
  }

  return (
    <div>
      <SubTabs
        ariaLabel="Sous-onglets Immobilier Neuf"
        tabs={VIEWS}
        active={view}
        onChange={setView}
      />

      {view === 'dashboard' && <VueImmobilier profile={profile} setActiveTab={navigate} />}
      {view === 'programmes' && <CatalogueProgrammes setActiveTab={navigate} />}
      {view === 'dossiers' && <MesDossiersImmo profile={profile} teamProfiles={teamProfiles} setActiveTab={navigate} />}
      {view === 'pipeline' && <PipelineVEFA profile={profile} teamProfiles={teamProfiles} />}
    </div>
  )
}
