// src/components/MissionDuMois.jsx
// Bloc "Mission du mois" pour le dashboard conseiller — engage en mode
// course au mois.
//
// Affiche le compteur €/jour ouvré restant pour atteindre l'objectif du mois.
//
// Demandé par Louis 28/05/2026 (#2 dans la liste des 7 améliorations).
//
// La carte « Tes leads chauds Lead Room » vivait ici. Retirée le 25/08/2026
// sur demande de Louis : elle triait par ancienneté DÉCROISSANTE et gardait
// les trois premiers, donc elle présentait les leads les plus vieux comme
// les plus chauds — le contraire de son propre sous-titre. Avec le miroir
// leads_room figé depuis le 4 mai, elle affichait un RDV du 7 mai en
// « J+109 » comme action du jour. Le conseiller ne peut rien faire d'un
// lead mort ; le manager, lui, a l'alerte de santé des flux.

import { useMemo } from 'react'

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

export default function MissionDuMois({ ppTarget, ppSigned, ppProjected, month }) {
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
  if (!mission) return null

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

    </div>
  )
}
