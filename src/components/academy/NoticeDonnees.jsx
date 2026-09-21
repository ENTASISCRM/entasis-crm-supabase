// ═══════════════════════════════════════════════════════════════════════════
// NOTICE « DONNÉES SUIVIES » : ce que la formation enregistre, et pour qui
//
// Le collaborateur doit pouvoir lire, à un clic, ce que l’Academy garde de
// lui en mode entraînement : le texte vient de academy_parametres.
// notice_donnees (rendu par academy_mon_parcours, modifiable dans l’onglet
// Paramètres de l’administration), la durée de conservation aussi. La
// phrase sur les destinataires est fixe : lui, la direction et
// l’administrateur de la formation ; les commentaires de coaching, la
// direction seulement.
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
                {texte || 'La formation enregistre tes sessions d’exercices : chaque réponse donnée et si elle était juste, la force et la date de prochaine révision de chaque exercice, ta série de jours, et le temps actif, compté à chaque réponse (une session laissée ouverte ne compte pas). Aucune capture d’écran, aucune frappe, aucune webcam.'}
              </p>
              <p className="ac-notice" style={{ margin: 0 }}>
                <strong>Conservation.</strong>{' '}
                {retention
                  ? `Les intervalles bruts de temps actif sont purgés après ${retention} ; un total par jour est conservé. Les sessions, les validations et les attestations restent dans ton historique de formation.`
                  : 'Les intervalles bruts de temps actif sont purgés après la durée fixée par la direction ; un total par jour est conservé. Les sessions, les validations et les attestations restent dans ton historique de formation.'}
              </p>
              <p className="ac-notice" style={{ margin: 0 }}>
                <strong>Destinataires.</strong> Ces données sont lisibles par toi, par la direction et par l’administrateur de la formation. Les commentaires de coaching sont lisibles par la direction seulement.
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
