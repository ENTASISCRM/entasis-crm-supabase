/* ─────────────────────────────────────────────────────────────────────────────
   TIMELINE CLIENT — journal d'échanges + historique (Série D / D4 + D10).

   Une seule chronologie pour toute la relation, façon « Interactions » de Zoho :
   - les échanges consignés à la main (appels, mails, RDV, courriers, notes)
   - les actions déjà tracées sur les dossiers (table `activities`)
   - les jalons des dossiers (création, signature)

   Le conseiller consigne en trois champs (type, date, objet) : si c'est plus
   long, personne ne le fait.
──────────────────────────────────────────────────────────────────────────── */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { SkeletonText } from '../ui/Skeleton'
import { confirmDialog } from '../ui/confirm'
import { messageErreur } from '../../lib/ui-shared'
import * as interactionsService from '../../services/interactions'
import { TYPES_ECHANGE, SENS_ECHANGE, libelleType } from '../../services/interactions'

// Pastille de couleur par nature d'entrée — l'œil trie sans lire.
const COULEUR = {
  appel: { c: 'var(--forecast, #0071E3)', bg: 'rgba(0,113,227,0.12)' },
  email: { c: 'var(--gold-dk, #A6843F)', bg: 'rgba(201,169,97,0.14)' },
  rdv: { c: 'var(--signed, #1B6B46)', bg: 'var(--signed-bg, rgba(52,199,89,0.12))' },
  courrier: { c: 'var(--t2)', bg: 'rgba(0,0,0,0.05)' },
  note: { c: 'var(--t2)', bg: 'rgba(0,0,0,0.05)' },
  activite: { c: 'var(--t3)', bg: 'rgba(0,0,0,0.04)' },
  dossier: { c: 'var(--progress, #B36B00)', bg: 'var(--progress-bg, rgba(255,149,0,0.12))' },
}

const LIBELLE_ACTION = {
  create: 'Dossier créé',
  update: 'Dossier modifié',
  delete: 'Dossier supprimé',
  convert_lead: 'Lead converti en dossier',
}

const fmtDate = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return String(iso).slice(0, 10) }
}

export default function ClientTimeline({ clientId, deals = [], history = [] }) {
  const [echanges, setEchanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [saisieOuverte, setSaisieOuverte] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    type: 'appel',
    sens: 'sortant',
    objet: '',
    contenu: '',
    occurredAt: new Date().toISOString().slice(0, 10),
    dealId: '',
  })

  const recharger = useCallback(async () => {
    try {
      setEchanges(await interactionsService.listByClient(clientId))
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    setLoading(true)
    recharger()
  }, [clientId, recharger])

  async function enregistrer(e) {
    e.preventDefault()
    if (saving) return
    if (!form.objet.trim() && !form.contenu.trim()) {
      toast.error('Indiquez au moins un objet ou un compte rendu.')
      return
    }
    setSaving(true)
    try {
      await interactionsService.create({ clientId, ...form })
      toast.success('Échange consigné')
      setForm(f => ({ ...f, objet: '', contenu: '', dealId: '' }))
      setSaisieOuverte(false)
      await recharger()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setSaving(false)
    }
  }

  async function supprimer(entree) {
    if (!(await confirmDialog({
      title: 'Supprimer cet échange ?',
      message: 'Il disparaîtra de l\'historique du client.',
      confirmLabel: 'Supprimer', danger: true,
    }))) return
    try {
      await interactionsService.remove(entree.id)
      toast.success('Échange supprimé')
      await recharger()
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  // Fusion des trois sources en une chronologie unique, du plus récent au
  // plus ancien. Les échanges restent supprimables, pas les traces système.
  const entrees = [
    ...echanges.map(e => ({
      id: `ech-${e.id}`,
      date: e.occurred_at,
      nature: e.type,
      titre: e.objet || libelleType(e.type),
      detail: e.contenu,
      auteur: e.auteur?.full_name || e.auteur?.advisor_code || '',
      meta: `${libelleType(e.type)}${e.sens === 'entrant' ? ' entrant' : e.sens === 'interne' ? ' interne' : ''}`,
      supprimable: e,
    })),
    ...(history || []).map(a => ({
      id: `act-${a.id}`,
      date: a.created_at,
      nature: 'activite',
      titre: LIBELLE_ACTION[a.action_type] || a.action_type,
      auteur: a.user?.full_name || 'Système',
      meta: 'Historique',
    })),
    ...(deals || []).filter(d => d.date_signed).map(d => ({
      id: `deal-${d.id}`,
      date: `${String(d.date_signed).slice(0, 10)}T12:00:00`,
      nature: 'dossier',
      titre: `Signature — ${d.product}`,
      detail: d.company ? `Compagnie : ${d.company}` : null,
      meta: 'Jalon dossier',
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)))

  return (
    <div className="card" style={{ marginBottom: '32px' }}>
      <div className="card-header" style={{ padding: '24px 28px 16px 28px' }}>
        <h3>
          Historique de la relation
          {!loading && <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--t2)', marginLeft: 8 }}>
            {entrees.length} entrée{entrees.length > 1 ? 's' : ''}
          </span>}
        </h3>
        <button className="btn btn-primary btn-sm" onClick={() => setSaisieOuverte(o => !o)}>
          {saisieOuverte ? 'Fermer' : '+ Consigner un échange'}
        </button>
      </div>

      <div className="card-body" style={{ padding: '0 28px 24px 28px' }}>
        {saisieOuverte && (
          <form onSubmit={enregistrer} style={{ border: '0.5px solid var(--bd)', borderRadius: 'var(--rad-lg, 12px)', padding: 16, marginBottom: 20, background: 'var(--bg-subtle, rgba(0,0,0,0.02))' }}>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPES_ECHANGE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sens</label>
                <select className="form-select" value={form.sens} onChange={e => setForm(f => ({ ...f, sens: e.target.value }))}>
                  {SENS_ECHANGE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.occurredAt} onChange={e => setForm(f => ({ ...f, occurredAt: e.target.value }))}/>
              </div>
            </div>
            <div className="form-group mt-16">
              <label className="form-label">Objet</label>
              <input className="form-input" value={form.objet} onChange={e => setForm(f => ({ ...f, objet: e.target.value }))} placeholder="Ex. Relance relevé 2025, point arbitrage…"/>
            </div>
            <div className="form-group mt-16">
              <label className="form-label">Compte rendu</label>
              <textarea className="form-textarea" rows={3} value={form.contenu} onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))} placeholder="Ce qui s'est dit, décisions, prochaine étape…"/>
            </div>
            {deals.length > 0 && (
              <div className="form-group mt-16">
                <label className="form-label">Dossier concerné (optionnel)</label>
                <select className="form-select" value={form.dealId} onChange={e => setForm(f => ({ ...f, dealId: e.target.value }))}>
                  <option value="">— Aucun en particulier —</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.product} · {d.month}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-outline" onClick={() => setSaisieOuverte(false)}>Annuler</button>
              <button type="submit" className="btn btn-gold" disabled={saving}>{saving ? 'Enregistrement…' : 'Consigner'}</button>
            </div>
          </form>
        )}

        {loading ? (
          <SkeletonText lines={4} />
        ) : entrees.length === 0 ? (
          <div className="table-empty-state">
            <div className="empty-title">Aucun échange consigné</div>
            <div className="empty-sub">Consignez appels, mails et rendez-vous : la fiche devient la mémoire complète de la relation.</div>
          </div>
        ) : (
          <div className="timeline">
            {entrees.map(e => {
              const col = COULEUR[e.nature] || COULEUR.note
              return (
                <div key={e.id} className="timeline-entry">
                  <div className="timeline-rail">
                    <span className="timeline-bullet" style={{ background: col.bg, borderColor: col.c }}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t1)' }}>{e.titre}</span>
                      <span className="badge" style={{ color: col.c, background: col.bg, borderColor: 'transparent' }}>{e.meta}</span>
                      <span className="tnum" style={{ fontSize: 11.5, color: 'var(--t3)' }}>{fmtDate(e.date)}</span>
                      {e.auteur && <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>· {e.auteur}</span>}
                      {e.supprimable && (
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', height: 22, padding: '0 8px', fontSize: 11 }}
                          onClick={() => supprimer(e.supprimable)}>Supprimer</button>
                      )}
                    </div>
                    {e.detail && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{e.detail}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
