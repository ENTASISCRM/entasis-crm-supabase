// ═══════════════════════════════════════════════════════════════════════════
// NOTICE « DONNÉES SUIVIES » : ce que la formation enregistre, et pour qui
//
// Le collaborateur doit pouvoir lire, à un clic, ce que l Academy garde de
// lui : le texte vient de academy_parametres.notice_donnees (rendu par
// academy_mon_parcours), la durée de conservation aussi. La phrase sur les
// destinataires est fixe : lui et la direction, personne d autre.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect } from 'react'
import { SkeletonText } from '../ui/Skeleton'

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

export default function NoticeDonnees({ texte, retentionMois, chargement, erreur, onFermer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onFermer?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFermer])

  const retention = Number(retentionMois) > 0 ? pluriel(Number(retentionMois), 'mois', 'mois') : null

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer?.() }}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="ac-notice-titre" style={{ width: 'min(100%, 560px)' }}>
        <div className="modal-head">
          <div>
            <div className="modal-title" id="ac-notice-titre">Données suivies</div>
            <div className="modal-subtitle">Ce que la formation enregistre de ton activité</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Fermer" onClick={onFermer}>✕</button>
        </div>
        <div className="modal-body">
          {erreur ? (
            <div className="notice notice-error" role="alert" style={{ marginBottom: 0 }}>{erreur}</div>
          ) : chargement ? (
            <SkeletonText lines={4} />
          ) : (
            <>
              <p className="ac-notice" style={{ margin: 0, whiteSpace: 'pre-line' }}>
                {texte || 'La formation enregistre les leçons ouvertes, la position de lecture, les réponses aux quiz et des battements d activité pendant qu une leçon est visible et manipulée. Aucune capture d écran, aucune frappe, aucune webcam.'}
              </p>
              <p className="ac-notice" style={{ margin: 0 }}>
                <strong>Conservation.</strong>{' '}
                {retention
                  ? `Les intervalles d activité sont conservés ${retention}, puis purgés. Les validations, les attestations et les scores restent dans ton historique de formation.`
                  : 'Les intervalles d activité sont purgés après la durée fixée par la direction. Les validations, les attestations et les scores restent dans ton historique de formation.'}
              </p>
              <p className="ac-notice" style={{ margin: 0 }}>
                <strong>Destinataires.</strong> Ces données sont visibles par deux personnes : vous et la direction. Le temps actif est une estimation : une lecture sans interaction pendant plus de deux minutes n est pas comptée.
              </p>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
