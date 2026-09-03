// src/components/clients/ClientLeadRoomCard.jsx
// Carte « Origine — Lead Room » de la fiche client : d ou vient la personne
// (campagne, date de reception, reponses au formulaire) et ce qui a deja ete
// tente avant la signature (historique d appels, issues).
//
// Pourquoi : jusqu ici les deux outils s ignoraient. Le conseiller qui ouvre
// une fiche client ne savait pas par quelle campagne la personne etait
// arrivee, ni combien de fois elle avait ete appelee. La carte ne s affiche
// que si la Lead Room connait la personne, et l absence de reponse n est
// jamais une erreur : elle veut dire « pas passe par la Lead Room ».

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { SkeletonText } from '../ui/Skeleton'

const ISSUE_LABEL = {
  rdv: 'RDV pris', callback: 'à rappeler', not_joined: 'pas de réponse',
  refused: 'refus', bad: 'faux numéro', joined: 'joint', signed: 'signé',
}
const STATUT_LABEL = {
  pending: 'à appeler', taken: 'en cours', joined: 'contact établi',
  not_joined: 'pas de réponse', rdv: 'RDV calé', refused: 'refus', signed: 'signé',
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDuree(s) {
  const n = Number(s) || 0
  if (n <= 0) return ''
  const m = Math.floor(n / 60)
  return m > 0 ? `${m} min` : `${n} s`
}

export default function ClientLeadRoomCard({ client }) {
  const [etat, setEtat] = useState('charge')  // charge | vide | pret | erreur
  const [data, setData] = useState(null)

  useEffect(() => {
    let vivant = true
    const tel = (client?.telephone || '').trim()
    if (!tel) { setEtat('vide'); return }
    const charger = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const r = await fetch(`/api/leadroom-context?phone=${encodeURIComponent(tel)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const j = await r.json().catch(() => ({}))
        if (!vivant) return
        if (j?.trouve) { setData(j); setEtat('pret') } else { setEtat('vide') }
      } catch {
        if (vivant) setEtat('erreur')
      }
    }
    charger()
    return () => { vivant = false }
  }, [client?.telephone])

  // Personne inconnue de la Lead Room : on n affiche rien plutot qu une carte
  // vide. La majorite des clients viennent de la téléprospection ou du réseau.
  if (etat === 'vide') return null
  if (etat === 'erreur') return null

  const lead = data?.lead
  const appels = data?.appels || []
  const reponses = lead?.reponses ? Object.entries(lead.reponses) : []

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div>
          <div className="section-kicker">Origine</div>
          <div className="card-title">Lead Room</div>
        </div>
        {lead?.campagne && (
          <div className="badge" style={{ background: 'rgba(197,165,90,0.12)', color: '#8a6d2f', border: 0 }}>
            {lead.campagne}
          </div>
        )}
      </div>

      {etat === 'charge' && <div style={{ padding: 16 }}><SkeletonText lines={3} /></div>}

      {etat === 'pret' && lead && (
        <div style={{ padding: '4px 16px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 28px', fontSize: 13, marginBottom: reponses.length || appels.length ? 14 : 0 }}>
            <div><span style={{ color: '#9ca3af' }}>Reçu le </span>{fmtDate(lead.recuLe)}</div>
            <div><span style={{ color: '#9ca3af' }}>État </span>{STATUT_LABEL[lead.statut] || lead.statut}</div>
            {lead.conseiller && <div><span style={{ color: '#9ca3af' }}>Prospecté par </span>{lead.conseiller}</div>}
            {lead.rdv && <div><span style={{ color: '#9ca3af' }}>RDV </span>{fmtDate(lead.rdv)}</div>}
            {lead.territoire && lead.territoire !== 'Métropole' && (
              <div><span style={{ color: '#9ca3af' }}>Zone </span>{lead.territoire}</div>
            )}
          </div>

          {reponses.length > 0 && (
            <div style={{ marginBottom: appels.length ? 14 : 0 }}>
              <div className="section-kicker" style={{ marginBottom: 6 }}>Ce qu'il a répondu</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
                {reponses.map(([k, v]) => (
                  <div key={k} style={{ fontSize: 13 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', fontWeight: 600 }}>{k}</div>
                    <div>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {appels.length > 0 && (
            <div>
              <div className="section-kicker" style={{ marginBottom: 6 }}>
                {appels.length} appel{appels.length > 1 ? 's' : ''} avant signature
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {appels.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13, color: '#4b5563' }}>
                    <span style={{ minWidth: 110 }}>{fmtDate(a.date)}</span>
                    <span style={{ minWidth: 90 }}>{ISSUE_LABEL[a.issue] || a.issue || '—'}</span>
                    <span style={{ color: '#9ca3af' }}>{fmtDuree(a.duree)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
