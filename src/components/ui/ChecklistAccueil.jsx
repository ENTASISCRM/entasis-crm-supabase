/* ─────────────────────────────────────────────────────────────────────────────
   CHECKLIST D'ACCUEIL — premiers pas d'un nouveau conseiller (Série D / D9).

   Le pattern d'activation de HubSpot/Attio : plutôt qu'une formation, une
   petite liste qui se coche TOUTE SEULE à mesure que le conseiller fait les
   gestes clés. Rien à saisir, rien à valider — c'est un guide, pas un
   formulaire.

   Elle disparaît d'elle-même une fois tout coché, et reste masquable à tout
   moment (choix mémorisé par conseiller).
──────────────────────────────────────────────────────────────────────────── */
import { usePersistedState } from '../../hooks/usePersistedState'

export default function ChecklistAccueil({ etapes, scope }) {
  const [masquee, setMasquee] = usePersistedState('accueil.checklistMasquee', false, scope)
  const faits = etapes.filter(e => e.fait).length
  const total = etapes.length
  // Tout est fait, ou l'utilisateur l'a rangée : on n'encombre plus l'accueil.
  if (masquee || faits === total) return null

  return (
    <div className="card card-p mb-24" style={{ borderLeft: '3px solid var(--gold)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="section-kicker">Premiers pas</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginTop: 2 }}>
            Prendre le CRM en main
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--t3)', marginTop: 2 }}>
            {faits} sur {total} — les étapes se cochent automatiquement.
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setMasquee(true)}>Masquer</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
        {etapes.map(e => (
          <div key={e.cle} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '7px 0' }}>
            <span aria-hidden="true" style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800,
              background: e.fait ? 'var(--signed-bg, rgba(52,199,89,0.14))' : 'rgba(0,0,0,0.05)',
              color: e.fait ? 'var(--signed, #1B6B46)' : 'var(--t3)',
              border: e.fait ? 'none' : '1px dashed var(--bd-strong)',
            }}>{e.fait ? '✓' : ''}</span>
            <span style={{
              flex: 1, fontSize: 13.5,
              color: e.fait ? 'var(--t3)' : 'var(--t1)',
              textDecoration: e.fait ? 'line-through' : 'none',
            }}>
              {e.libelle}
              {e.aide && !e.fait && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--t3)', textDecoration: 'none' }}>{e.aide}</span>}
            </span>
            {!e.fait && e.onAller && (
              <button className="btn btn-outline btn-sm" onClick={e.onAller}>{e.libelleAction || 'Y aller'}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
