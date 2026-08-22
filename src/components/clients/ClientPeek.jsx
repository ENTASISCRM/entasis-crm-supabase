/* ─────────────────────────────────────────────────────────────────────────────
   CLIENT PEEK — aperçu client en panneau latéral (Série B / B4).

   Pattern Attio : depuis l'annuaire, un clic sur une ligne ouvre cet aperçu
   par-dessus la liste (identité, contact en 1 clic, produits, CA) sans
   perdre la liste ni ses filtres — « Ouvrir la fiche » développe la vue
   complète. Aucune requête : tout vient de la ligne déjà chargée par
   l'annuaire (client + deals + dossiers_immo).
───────────────────────────────────────────────────────────────────────────── */
import { useEffect } from 'react'
import { statusLabel } from '../../lib/ui-shared'
import { euro, annualize } from '../../lib/format'

const STATUS_CLASS = {
  'Signé': 'badge badge-signed',
  'En cours': 'badge badge-progress',
  'Prévu': 'badge badge-forecast',
  'Annulé': 'badge badge-cancelled',
}

export default function ClientPeek({ client, onClose, onOpenFull }) {
  useEffect(() => {
    if (!client) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [client, onClose])

  if (!client) return null

  const deals = client.deals || []
  const signed = deals.filter(d => d.status === 'Signé')
  const ca = client.caTotal ?? signed.reduce((s, d) => s + annualize(d.pp_m) + (d.pu || 0), 0)
  const nbImmo = (client.dossiers_immo || []).length
  const nom = `${client.prenom || ''} ${client.nom || ''}`.trim() || 'Client'

  return (
    <div className="peek-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="peek-panel" role="dialog" aria-modal="true" aria-label={`Aperçu ${nom}`}>
        <div className="peek-head">
          <div>
            <div className="peek-name">{nom}</div>
            <div className="peek-sub">
              {client.advisor_code || '—'}
              {client.co_advisor_code ? ` · co ${client.co_advisor_code}` : ''}
              {client.globalStatus ? (
                <span className={`${STATUS_CLASS[client.globalStatus] || 'badge'}`} style={{ marginLeft: 8 }}>
                  {statusLabel(client.globalStatus)}
                </span>
              ) : null}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fermer l'aperçu">✕</button>
        </div>

        <div className="peek-body">
          {(client.email || client.telephone) && (
            <div className="peek-contact">
              {client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}
              {client.telephone && <a href={`tel:${String(client.telephone).replace(/[^+\d]/g, '')}`}>{client.telephone}</a>}
            </div>
          )}

          <div className="peek-stat-row">
            <div className="peek-stat"><div className="v">{deals.length}</div><div className="l">Produits</div></div>
            <div className="peek-stat"><div className="v">{euro(ca)}</div><div className="l">CA signé</div></div>
            <div className="peek-stat"><div className="v">{nbImmo}</div><div className="l">Immo</div></div>
          </div>

          {deals.length > 0 && (
            <>
              <div className="peek-section-title">Produits</div>
              {deals.slice(0, 8).map(d => (
                <div key={d.id} className="peek-deal">
                  <div style={{ minWidth: 0 }}>
                    <div className="peek-deal-name">{d.product || '—'}</div>
                    <div className="peek-deal-amounts">
                      {d.pp_m > 0 && `PP ${euro(annualize(d.pp_m))}/an`}
                      {d.pp_m > 0 && d.pu > 0 && ' · '}
                      {d.pu > 0 && `PU ${euro(d.pu)}`}
                      {!d.pp_m && !d.pu && '—'}
                    </div>
                  </div>
                  <span className={STATUS_CLASS[d.status] || 'badge'}>{statusLabel(d.status)}</span>
                </div>
              ))}
              {deals.length > 8 && (
                <div className="peek-more">+ {deals.length - 8} autre{deals.length - 8 > 1 ? 's' : ''} sur la fiche complète</div>
              )}
            </>
          )}

          {deals.length === 0 && (
            <div className="peek-empty">Aucun produit pour l'instant — la fiche complète permet d'en créer un.</div>
          )}
        </div>

        <div className="peek-foot">
          <button className="btn btn-outline" onClick={onClose}>Fermer</button>
          <button className="btn btn-gold" onClick={() => onOpenFull(client.id)}>Ouvrir la fiche complète</button>
        </div>
      </aside>
    </div>
  )
}
