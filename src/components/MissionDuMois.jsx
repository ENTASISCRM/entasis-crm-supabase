// src/components/MissionDuMois.jsx
// Bloc "Mission du mois" pour le dashboard conseiller — engage en mode
// course au mois.
//
// Affiche :
//   • Compteur €/jour ouvré restant pour atteindre l'objectif
//   • Top 3 leads "chauds" Lead Room (tenus >7j sans signature)
//   • Prochains RDV de la semaine (depuis le Lead Room)
//
// Demandé par Louis 28/05/2026 (#2 dans la liste des 7 améliorations).

import { useEffect, useMemo, useState } from 'react'
import { leadroomAdmin } from '../lib/leadroom-api'

const LEADROOM_API = import.meta.env.VITE_LEADROOM_URL || 'https://entasis-leadroom.vercel.app'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

// Compte les jours ouvrés (lun-ven) restants dans le mois courant.
function jourOuvresRestants() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0..11
  const lastDay = new Date(year, month + 1, 0).getDate()
  let count = 0
  for (let d = now.getDate(); d <= lastDay; d++) {
    const date = new Date(year, month, d)
    const dow = date.getDay() // 0=Dim, 1=Lun ... 6=Sam
    if (dow >= 1 && dow <= 5) count++
  }
  return count
}

export default function MissionDuMois({ profile, ppTarget, ppSigned, ppProjected, month }) {
  // Charge les leads chauds + prochains RDV depuis Lead Room
  const [leadRoomData, setLeadRoomData] = useState({ loading: true, hot: [], upcoming: [] })

  useEffect(() => {
    if (!profile?.email) {
      setLeadRoomData({ loading: false, hot: [], upcoming: [] })
      return
    }
    let cancelled = false
    Promise.all([
      // Tenus à suivre (>7j sans rappel, ce conseiller)
      leadroomAdmin(`joined-leads-detail?advisorEmail=${encodeURIComponent(profile.email)}`)
        .then(r => r.ok ? r.json() : { leads: [] })
        .catch(() => ({ leads: [] })),
      // RDV à venir cette semaine — pas d'endpoint dédié mais on peut filtrer depuis joined-leads-detail
      // Pour la v1, on se contente des "hot" leads. Les prochains RDV viendront plus tard.
    ]).then(([hotData]) => {
      if (cancelled) return
      const hot = (hotData.leads || [])
        .filter(l => !l.has_callback_future)
        .sort((a, b) => (b.days_since_rdv || 0) - (a.days_since_rdv || 0))
        .slice(0, 3)
      setLeadRoomData({ loading: false, hot, upcoming: [] })
    })
    return () => { cancelled = true }
  }, [profile?.email])

  // Calculs mission
  const mission = useMemo(() => {
    const target = Number(ppTarget || 0)
    if (target <= 0) return null
    const reste = Math.max(0, target - Number(ppSigned || 0))
    const projectedGap = target - Number(ppProjected || 0) // négatif = au-dessus de l'objectif
    const joursRestants = jourOuvresRestants()
    const parJour = joursRestants > 0 ? reste / joursRestants : reste
    return { target, reste, projectedGap, joursRestants, parJour }
  }, [ppTarget, ppSigned, ppProjected])

  // Rien à afficher si pas d'objectif
  if (!mission && leadRoomData.hot.length === 0) return null

  return (
    <div style={{ marginBottom: 24 }}>
      {/* ─── Mission du mois ──────────────────────────────────────── */}
      {mission && (
        <div className="card mb-24" style={{
          padding: 24,
          background: mission.reste === 0
            ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
            : 'linear-gradient(135deg, #0B1A2E 0%, #162443 100%)',
          color: 'white',
          borderRadius: 'var(--rad-lg, 14px)',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 700,
            }}>
              {mission.reste === 0 ? '🏆' : '🎯'}
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7, fontWeight: 600 }}>
                Mission du mois · {month}
              </div>
              {mission.reste === 0 ? (
                <>
                  <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
                    Objectif atteint ✓
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
                    Tu es au-dessus de ton palier de <strong>{fmtEur(Number(ppSigned) - mission.target)}</strong>.
                    Chaque € de PP signée en plus alimente ton variable au taux CDI.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
                    Il te manque <span style={{ color: '#C5A55A' }}>{fmtEur(mission.reste)}</span> de PP
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
                    Soit <strong>{fmtEur(mission.parJour)} / jour ouvré</strong> sur les{' '}
                    <strong>{mission.joursRestants} jour{mission.joursRestants > 1 ? 's' : ''}</strong> restant{mission.joursRestants > 1 ? 's' : ''} avant la fin du mois.
                    {mission.projectedGap <= 0
                      ? ' 🎉 Ton pipeline actuel devrait suffire.'
                      : ` Ton pipeline projeté est ${fmtEur(Math.abs(mission.projectedGap))} en-dessous — il faut convertir.`}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Barre de progression visuelle */}
          {mission.reste > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, (ppSigned / mission.target) * 100)}%`,
                  background: 'linear-gradient(90deg, #C5A55A 0%, #F4D27A 100%)',
                  transition: 'width 0.6s',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 6, opacity: 0.7 }}>
                <div>0 €</div>
                <div>{fmtEur(ppSigned)} signés / objectif {fmtEur(mission.target)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Top 3 leads chauds Lead Room ────────────────────────── */}
      {leadRoomData.hot.length > 0 && (
        <div className="card mb-24" style={{ borderTop: '3px solid #EF4444' }}>
          <div className="panel-head">
            <div>
              <div className="section-kicker" style={{ color: '#EF4444' }}>🔥 Tes leads chauds Lead Room</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
                Top 3 RDV tenus à suivre — chaque jour sans rappel = lead qui refroidit
              </div>
            </div>
          </div>
          <div style={{ padding: '0 0 6px 0' }}>
            {leadRoomData.hot.map((l, i) => (
              <div key={l.id} style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px',
                borderBottom: i < leadRoomData.hot.length - 1 ? '1px solid var(--bd)' : 'none',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: l.days_since_rdv > 14 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                  color: l.days_since_rdv > 14 ? '#EF4444' : '#B45309',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13,
                }}>
                  J+{l.days_since_rdv}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--t1)', fontSize: 14 }}>
                    {l.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                    RDV {l.rdv_date ? new Date(l.rdv_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '?'}
                    {l.campaign_slug ? ` · ${l.campaign_slug}` : ''}
                    {l.email ? ` · ${l.email}` : ''}
                  </div>
                  {l.notes_excerpt && (
                    <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--t2)', marginTop: 4 }}>
                      "{l.notes_excerpt.slice(0, 80)}{l.notes_excerpt.length > 80 ? '…' : ''}"
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <a href={`${LEADROOM_API}/leadroom`} target="_blank" rel="noreferrer"
                     style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>
                    Ouvrir Lead Room →
                  </a>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--bd)', background: 'var(--bg)', fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
            💡 Ouvre le lead dans la Lead Room pour programmer un rappel ou marquer le contrat.
          </div>
        </div>
      )}
    </div>
  )
}
