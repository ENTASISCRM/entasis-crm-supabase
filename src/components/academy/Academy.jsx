// ═══════════════════════════════════════════════════════════════════════════
// ENTASIS ACADEMY : le conteneur de la rubrique Formation
//
// App.jsx lit le hash après #/formation/ et passe la route en tableau :
//   ['parcours'] (défaut, Aujourd hui), ['catalogue'], ['module', slug],
//   ['entrainement', versionId], ['resultats'], ['succes'], ['pilotage'],
//   ['fiche', profileId], ['administration', ...]
// La galerie des succès s’ouvre depuis Aujourd hui et Mes résultats : elle
// n’a pas de sous onglet à elle, App.jsx la range sous « Mes résultats ».
// Ce composant choisit l’écran. Pilotage, fiche d’un autre et administration
// sont réservés à la direction (manager ou drapeau academy_admin) : ce
// n’est qu’un affichage, la RLS et les fonctions SQL restent le vrai verrou.
//
// L’entraînement se rend seul : pas de pied « Données suivies », rien qui
// détourne d’une session de douze exercices. Sur tous les autres écrans, ce
// lien ouvre la notice lue dans academy_mon_parcours (texte et rétention),
// chargée au premier clic seulement.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { monParcours } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import MonParcours from './MonParcours'
import Catalogue from './Catalogue'
import ModuleDetail from './ModuleDetail'
import Entrainement from './Entrainement'
import MesResultats from './MesResultats'
import Succes from './Succes'
import Pilotage from './Pilotage'
import FicheCollaborateur from './FicheCollaborateur'
import Administration from './Administration'
import NoticeDonnees from './NoticeDonnees'
import './academy.css'

const estDirection = (profile) => profile?.role === 'manager' || profile?.academy_admin === true

function ReserveDirection({ detail }) {
  return (
    <div className="card">
      <div className="table-empty-state">
        <div style={{ fontSize: 16, color: 'var(--t2)' }}>Réservé à la direction</div>
        <div className="form-hint" style={{ marginTop: 8 }}>{detail || 'Cet écran est réservé au manager et à l’administrateur de la formation. Tes decks et tes résultats sont dans Formation.'}</div>
      </div>
    </div>
  )
}

export default function Academy({ profile, route, onNaviguer }) {
  const [notice, setNotice] = useState(null)
  const r = Array.isArray(route) && route.length > 0 ? route : ['parcours']
  const [vue, a] = r
  const direction = estDirection(profile)

  async function ouvrirNotice() {
    if (notice?.texte !== undefined) { setNotice((n) => ({ ...n, ouverte: true })); return }
    setNotice({ ouverte: true, chargement: true })
    try {
      const p = await monParcours()
      setNotice({ ouverte: true, chargement: false, texte: p?.notice_donnees || '', retention: p?.retention_intervalles_mois })
    } catch (e) {
      setNotice({ ouverte: true, chargement: false, erreur: messageErreur(e) })
    }
  }

  // La session d’entraînement occupe l’écran seule.
  if (vue === 'entrainement') {
    return (
      <div className="ac ac-plein">
        <Entrainement key={a} profile={profile} versionId={a} onNaviguer={onNaviguer} />
      </div>
    )
  }

  let contenu
  switch (vue) {
    case 'catalogue':
      contenu = <Catalogue profile={profile} onNaviguer={onNaviguer} />
      break
    case 'module':
      contenu = <ModuleDetail key={a} profile={profile} slug={a} onNaviguer={onNaviguer} />
      break
    case 'resultats':
      contenu = <MesResultats profile={profile} onNaviguer={onNaviguer} />
      break
    case 'succes':
      contenu = <Succes profile={profile} onNaviguer={onNaviguer} />
      break
    case 'pilotage':
      contenu = direction ? <Pilotage profile={profile} onNaviguer={onNaviguer} /> : <ReserveDirection />
      break
    case 'fiche':
      contenu = direction || (a && a === profile?.id)
        ? <FicheCollaborateur key={a} profile={profile} profileId={a} onNaviguer={onNaviguer} />
        : <ReserveDirection detail="La fiche d’un autre collaborateur est réservée à la direction." />
      break
    case 'administration':
      contenu = direction ? <Administration profile={profile} route={r} onNaviguer={onNaviguer} /> : <ReserveDirection />
      break
    default:
      contenu = <MonParcours profile={profile} onNaviguer={onNaviguer} />
  }

  return (
    <div className="ac">
      {contenu}
      <div className="ac-pied">
        <span>Ce que la formation enregistre :</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={ouvrirNotice}>Données suivies</button>
      </div>
      {notice?.ouverte && (
        <NoticeDonnees
          texte={notice.texte}
          retentionMois={notice.retention}
          chargement={notice.chargement}
          erreur={notice.erreur}
          onFermer={() => setNotice((n) => ({ ...n, ouverte: false }))}
        />
      )}
    </div>
  )
}
