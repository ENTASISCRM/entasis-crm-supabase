// ═══════════════════════════════════════════════════════════════════════════
// DOSSIERS SANS MOUVEMENT : les dossiers qui stagnent, à l'accueil
//
// Item C2 du plan d'amélioration. Un dossier « En cours » sans aucun
// mouvement depuis plus de trois semaines n'est plus dans la tête de
// personne : il n'a pas de relance datée (sinon la file du matin s'en
// chargerait) et personne n'y a touché. Ce bloc le remet sous les yeux du
// conseiller avec deux gestes, et rien d'autre :
//
//   Relancer    ouvre le dossier (onEdit), le conseiller pose une action
//   Abandonner  passe le statut à « Annulé » (onQuickPatch), annulable
//               depuis le toast comme tous les gestes de Ma journée
//
// Traiter une ligne la sort de la liste : ouvrir le dossier et le modifier
// rafraîchit updated_at, l'abandonner change le statut.
//
// Chez le manager, le même bloc, précédé du compte par conseiller en petites
// puces, puis la liste de tout le cabinet. Aucun montant nulle part : on
// compte des dossiers et des jours, jamais de la rémunération.
//
// Même modèle visuel que la file du matin (ActionsDuJour dans App.jsx) et
// aucune classe nouvelle : ce bloc se lit comme la suite de Ma journée. Le
// calcul vit dans lib/stagnants.js, testé à part.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import { jourISO } from '../lib/ma-journee'
import { getClientName } from '../lib/ui-shared'
import {
  dossiersStagnants, dossiersStagnantsCabinet, stagnantsParConseiller, SEUIL_STAGNATION_JOURS,
} from '../lib/stagnants'

const Geste = ({ label, title, onClick }) => (
  <button className="btn btn-ghost btn-sm" title={title} style={{ padding: '2px 8px', fontSize: 11, flexShrink: 0 }}
    onClick={(e) => { e.stopPropagation(); onClick() }}>{label}</button>
)

// Une ligne : client, produit, ancienneté, deux gestes. Le point passe en
// rouge au double du seuil, le dossier est alors vraiment perdu de vue.
const Ligne = ({ d, seuilJours, avecConseiller, onRelancer, onAbandonner }) => (
  <div className="priority-item" style={{ cursor: 'pointer' }} onClick={() => onRelancer(d)} title="Ouvrir le dossier">
    <div className={`priority-item-dot ${d.joursSansMouvement > seuilJours * 2 ? 'urgent' : 'high'}`} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="priority-item-client truncate">{getClientName(d)}</div>
      <div className="priority-item-detail">
        {avecConseiller && d.advisor_code ? `${d.advisor_code} · ` : ''}
        {d.product || 'Produit non renseigné'} · {d.joursSansMouvement} jours sans mouvement
      </div>
    </div>
    <div style={{ display: 'inline-flex', gap: 2, marginLeft: 6 }}>
      <Geste label="Relancer" title="Ouvrir le dossier pour poser une relance" onClick={() => onRelancer(d)} />
      <Geste label="Abandonner" title="Passer le dossier en Annulé (annulable)" onClick={() => onAbandonner(d)} />
    </div>
  </div>
)

export default function DossiersStagnants({ deals, profile, onEdit, onQuickPatch, seuilJours = SEUIL_STAGNATION_JOURS }) {
  const today = jourISO()
  const isManager = profile?.role === 'manager'
  const code = profile?.advisor_code

  const liste = useMemo(() => (isManager
    ? dossiersStagnantsCabinet(deals, { today, seuilJours })
    : dossiersStagnants(deals, { advisorCode: code, today, seuilJours })),
  [deals, isManager, code, today, seuilJours])

  const repartition = useMemo(() => (isManager
    ? stagnantsParConseiller(deals, { today, seuilJours })
    : []),
  [deals, isManager, today, seuilJours])

  if (!liste.length) return null

  const relancer = (d) => onEdit?.(d)
  // Écriture optimiste et annulable : quickPatchDeal restaure l'ancien
  // statut depuis le toast, même filet de sécurité que le kanban.
  const abandonner = (d) => onQuickPatch?.(d, { status: 'Annulé' }, `Dossier abandonné · ${getClientName(d)}`, { undoable: true })

  const n = liste.length
  return (
    <div style={{ marginTop: 28 }}>
      <div className="section-header">
        <div>
          <div className="section-kicker">{isManager ? 'Vue direction · à relancer ou à clore' : 'À relancer ou à clore'}</div>
          <div className="section-title">Dossiers sans mouvement</div>
          <div className="section-sub">
            {n} dossier{n > 1 ? 's' : ''} depuis plus de {seuilJours} jours
            {isManager && repartition.length > 0 ? ` · ${repartition.length} conseiller${repartition.length > 1 ? 's' : ''}` : ''}
          </div>
        </div>
      </div>
      {isManager && repartition.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {repartition.map((r) => (
            <span key={r.advisorCode} className="badge badge-normal" title={`Le plus ancien : ${r.plusAncienJours} jours sans mouvement`}>
              {r.advisorCode} · <span className="tnum">{r.nombre}</span>
            </span>
          ))}
        </div>
      )}
      <div className="priorities-list">
        {liste.map((d) => (
          <Ligne key={d.id} d={d} seuilJours={seuilJours} avecConseiller={isManager}
            onRelancer={relancer} onAbandonner={abandonner} />
        ))}
      </div>
    </div>
  )
}
