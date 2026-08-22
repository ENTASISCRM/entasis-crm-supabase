/* ─────────────────────────────────────────────────────────────────────────────
   AIDE RACCOURCIS — overlay « ? » (Série D / D8).

   Les raccourcis existaient déjà mais restaient invisibles : personne ne
   découvre ⌘K sans qu'on le lui dise. Le « ? » (pattern Attio, Linear, Gmail)
   affiche la liste complète — la fonctionnalité devient enfin utilisable par
   toute l'équipe.
──────────────────────────────────────────────────────────────────────────── */
import { useEffect } from 'react'

const GROUPES = [
  {
    titre: 'Navigation',
    items: [
      { touches: ['⌘', 'K'], libelle: 'Rechercher un client, un dossier ou un écran' },
      { touches: ['/'], libelle: 'Aller à la recherche de l\'écran affiché' },
      { touches: ['?'], libelle: 'Afficher cette aide' },
    ],
  },
  {
    titre: 'Actions',
    items: [
      { touches: ['N'], libelle: 'Nouveau dossier' },
      { touches: ['Échap'], libelle: 'Fermer la fenêtre ou le panneau ouvert' },
    ],
  },
  {
    titre: 'Souris',
    items: [
      { libelle: 'Glisser une carte du pipeline pour changer son statut' },
      { libelle: 'Cliquer une ligne de l\'annuaire pour l\'aperçu client' },
    ],
  },
]

export default function ShortcutsHelp({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 1300 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ width: 'min(100%, 520px)' }} role="dialog" aria-modal="true" aria-label="Raccourcis clavier">
        <div className="modal-head">
          <div>
            <div className="modal-title">Raccourcis clavier</div>
            <div className="modal-subtitle">Pour aller plus vite au quotidien</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
        </div>
        <div className="modal-body">
          {GROUPES.map(g => (
            <div key={g.titre}>
              <div className="form-section-title mb-16">{g.titre}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.items.map(it => (
                  <div key={it.libelle} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Les gestes souris n'ont pas de touche : la colonne
                        réservée aux kbd disparaît pour eux, sinon la liste
                        se termine sur un vide inexpliqué. */}
                    {(it.touches || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, minWidth: 92 }}>
                        {it.touches.map(t => <kbd key={t} className="kbd">{t}</kbd>)}
                      </div>
                    )}
                    <span style={{ fontSize: 13.5, color: 'var(--t2)' }}>{it.libelle}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>Compris</button>
        </div>
      </div>
    </div>
  )
}
