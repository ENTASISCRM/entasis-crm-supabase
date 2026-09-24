// ═══════════════════════════════════════════════════════════════════════════
// SUCCÈS : la galerie complète, débloqués et verrouillés
//
// academy_mes_succes rend TOUT le catalogue, dans l’ordre, avec obtenu_le à
// null tant que le succès n’est pas gagné : l’écran montre donc aussi ce qui
// reste à faire, et la condition se lit en clair sur chaque carte verrouillée.
// C’est le serveur qui attribue, jamais le navigateur.
//
// Les pictogrammes viennent du mot clé rangé en base (colonne icone) et se
// dessinent par le composant Picto : aucun emoji, aucune image. Un succès
// verrouillé se grise par CSS, le dessin ne change pas.
//
// Conteneur (charge academy_mes_succes) et présentation séparés : la vue
// reçoit la liste par props et se teste avec renderToStaticMarkup.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { mesSucces } from '../../services/academy'
import { messageErreur } from '../../lib/ui-shared'
import { jourParis } from '../../lib/academy/format'
import { Picto } from './Picto'
import { SkeletonText } from '../ui/Skeleton'

const SECRET_TITRE = 'Succès secret'
const SECRET_TEXTE = 'Sa condition se découvre en jouant.'

function Entete({ sousTitre }) {
  return (
    <div className="section-header">
      <div>
        <div className="section-kicker">Formation</div>
        <div className="section-title">Succès</div>
        {sousTitre && <div className="section-sub">{sousTitre}</div>}
      </div>
    </div>
  )
}

// Une carte du catalogue. Un succès secret encore verrouillé ne livre ni son
// titre ni sa condition : il se découvre en jouant.
function CarteSucces({ succes }) {
  const obtenu = Boolean(succes?.obtenu_le)
  const secret = succes?.secret === true && !obtenu
  const titre = secret ? SECRET_TITRE : (succes?.titre || succes?.code || 'Succès')
  const texte = secret ? SECRET_TEXTE : (succes?.description || '')
  return (
    <li className={`card card-p ac-succes${obtenu ? ' obtenu' : ' verrouille'}`}>
      <Picto nom={secret ? 'neutre' : succes?.icone} taille={30} />
      <div className="ac-succes-titre">{titre}</div>
      {texte && <div className="ac-succes-texte">{texte}</div>}
      <div className={`ac-succes-date${obtenu ? ' on' : ''}`}>
        {obtenu ? `Obtenu le ${jourParis(succes.obtenu_le)}` : 'Pas encore débloqué'}
      </div>
    </li>
  )
}

export function SuccesVue({ succes, onNaviguer }) {
  const liste = Array.isArray(succes) ? succes : []
  const obtenus = liste.filter((s) => Boolean(s?.obtenu_le)).length
  const total = liste.length

  const retour = (
    <div className="ac-retour">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNaviguer?.('#/formation/resultats')}>
        Retour à mes résultats
      </button>
    </div>
  )

  if (total === 0) {
    return (
      <div>
        <Entete />
        {retour}
        <div className="card">
          <div className="table-empty-state">
            <div className="empty-title">Aucun succès au catalogue pour l’instant</div>
            <div className="empty-sub">Les succès arrivent avec la prochaine mise à jour de la formation. Tes sessions continuent de compter.</div>
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => onNaviguer?.('#/formation/parcours')}>
              Voir Aujourd hui
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Entete sousTitre={`${obtenus} sur ${total} débloqué${obtenus > 1 ? 's' : ''}`} />
      {retour}
      <ul className="ac-succes-grille">
        {liste.map((s, i) => <CarteSucces key={s?.code || i} succes={s} />)}
      </ul>
    </div>
  )
}

export default function Succes({ onNaviguer }) {
  const [succes, setSucces] = useState(null)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let vivant = true
    mesSucces()
      .then((s) => { if (vivant) setSucces(Array.isArray(s) ? s : []) })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [])

  if (erreur) return <div><Entete /><div className="notice notice-error" role="alert">{erreur}</div></div>
  if (!succes) return <div><Entete /><SkeletonText lines={6} /></div>
  return <SuccesVue succes={succes} onNaviguer={onNaviguer} />
}
