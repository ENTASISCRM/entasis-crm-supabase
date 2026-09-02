// ═══════════════════════════════════════════════════════════════════════════
// DOUBLONS CLIENTS : fusionner, jamais supprimer.
//
// Thomas a demandé le 26/08 « un onglet supprimer » pour les doublons. Une
// suppression aurait été destructrice : la clé étrangère vers clients est en
// CASCADE pour les contrats, les documents, les échanges et les équipements
// déclarés, et les dossiers auraient été orphelinés. Sur les groupes mesurés,
// la majorité porte des données des DEUX côtés : le bouton demandé aurait
// détruit des contrats signés.
//
// L'écran fait donc l'opération juste : on choisit la fiche qui reste, on voit
// exactement ce qui va la rejoindre, et la coquille disparaît une fois vidée.
// Tout se joue dans une seule transaction SQL (fusionner_clients), y compris
// les collisions d'unicité sur les équipements, les missions et les campagnes.
//
// Les droits vivent dans la fonction SQL : un conseiller ne fusionne que ses
// propres fiches des deux côtés, la direction fusionne librement. L'écran le
// dit avant le clic plutôt que de laisser la base refuser.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { messageErreur } from '../../lib/ui-shared'
import { confirmDialog } from '../ui/confirm'
import { SkeletonTable } from '../ui/Skeleton'
import { listerDoublons, fusionner } from '../../services/clients'
import { nomComplet, dateFr, poids, resume, meilleureFiche } from '../../lib/doublons'

const CRITERES = {
  'téléphone': { label: 'Même téléphone', aide: 'Le critère le plus sûr', couleur: '#1B7A3E', fond: 'rgba(52,199,89,0.12)' },
  'email': { label: 'Même email', aide: 'Très fiable', couleur: '#1D4E89', fond: 'rgba(0,113,227,0.10)' },
  'nom': { label: 'Même nom', aide: 'À vérifier, deux personnes peuvent être homonymes', couleur: '#8A5300', fond: 'rgba(255,149,0,0.12)' },
}

export default function DoublonsClients({ profile }) {
  const [groupes, setGroupes] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [choix, setChoix] = useState({})      // cle du groupe -> id de la fiche gardée
  const [enCours, setEnCours] = useState(null)

  const estManager = profile?.role === 'manager'
  const monCode = profile?.advisor_code

  const charger = async () => {
    setChargement(true)
    try {
      const g = await listerDoublons()
      setGroupes(g)
      setChoix(Object.fromEntries(g.map((x) => [x.cle, meilleureFiche(x.fiches).client_id])))
      setErreur(null)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setChargement(false)
    }
  }

  useEffect(() => { charger() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Un conseiller ne peut fusionner que si les DEUX fiches sont à lui. On le
  // dit avant le clic, la base refuserait de toute façon.
  const aLeDroit = (groupe) => {
    if (estManager) return true
    if (!monCode) return false
    return groupe.fiches.every((f) => f.advisor_code === monCode || f.co_advisor_code === monCode)
  }

  const totalFiches = useMemo(
    () => groupes.reduce((s, g) => s + g.fiches.length, 0),
    [groupes],
  )

  const lancerFusion = async (groupe) => {
    const gardeId = choix[groupe.cle]
    const garde = groupe.fiches.find((f) => f.client_id === gardeId)
    const absorbes = groupe.fiches.filter((f) => f.client_id !== gardeId)
    if (!garde || absorbes.length === 0) return

    const aDeplacer = absorbes.reduce((s, f) => s + poids(f), 0)
    const detail = absorbes.map((f) => `${nomComplet(f)} (${resume(f)})`).join(', ')

    const ok = await confirmDialog({
      title: `Fusionner sur la fiche de ${nomComplet(garde)} ?`,
      message:
        `${absorbes.length === 1 ? 'La fiche' : 'Les fiches'} ${detail} `
        + `${absorbes.length === 1 ? 'sera absorbée' : 'seront absorbées'}.\n\n`
        + (aDeplacer > 0
          ? `${aDeplacer} élément${aDeplacer > 1 ? 's' : ''} (dossiers, contrats, documents, échanges) rejoindra la fiche conservée, ainsi que les informations qui lui manquent. Rien n'est supprimé.`
          : 'Aucun rattachement à déplacer, la coquille sera simplement retirée.')
        + '\n\nCette opération ne se défait pas.',
      confirmLabel: 'Fusionner',
      danger: true,
    })
    if (!ok) return

    setEnCours(groupe.cle)
    try {
      let deplaces = 0
      for (const f of absorbes) {
        const r = await fusionner(gardeId, f.client_id)
        deplaces += Object.values(r?.deplace || {}).reduce((s, v) => s + Number(v || 0), 0)
      }
      toast.success(
        deplaces > 0
          ? `Fiches fusionnées, ${deplaces} élément${deplaces > 1 ? 's' : ''} rapatrié${deplaces > 1 ? 's' : ''}.`
          : 'Fiches fusionnées.',
      )
      await charger()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(null)
    }
  }

  if (chargement) return <SkeletonTable />

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Qualité des données</div>
          <div className="section-title">Doublons clients</div>
          <div className="section-sub">
            {groupes.length === 0
              ? 'Aucun doublon détecté dans votre périmètre.'
              : `${groupes.length} groupe${groupes.length > 1 ? 's' : ''} · ${totalFiches} fiches concernées`}
          </div>
        </div>
      </div>

      <div className="card card-p mb-24" style={{ borderLeft: '3px solid var(--gold)' }}>
        <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--t2)' }}>
          <strong style={{ color: 'var(--t1)' }}>On fusionne, on ne supprime pas.</strong>{' '}
          Supprimer une fiche emporterait ses contrats, ses documents et ses échanges, et
          détacherait ses dossiers. Ici, vous choisissez la fiche qui reste : tout ce que
          porte l&apos;autre la rejoint, y compris les informations qui lui manquent, puis la
          coquille vidée disparaît.
        </div>
      </div>

      {erreur && (
        <div className="card card-p mb-24" style={{ color: 'var(--cancelled)', fontSize: 13 }}>{erreur}</div>
      )}

      {groupes.length === 0 && !erreur && (
        <div className="table-empty-state">
          <div className="empty-title">Aucun doublon</div>
          <div className="empty-sub">
            Rien à fusionner pour l&apos;instant. Cet écran se remplit tout seul dès que deux
            fiches partagent un téléphone, un email ou un nom complet.
          </div>
        </div>
      )}

      {groupes.map((groupe) => {
        const c = CRITERES[groupe.critere] || CRITERES.nom
        const autorise = aLeDroit(groupe)
        const gardeId = choix[groupe.cle]
        const conseillers = [...new Set(groupe.fiches.map((f) => f.advisor_code).filter(Boolean))]

        return (
          <div key={groupe.cle} className="card card-p mb-16">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                color: c.couleur, background: c.fond,
              }}>{c.label}</span>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{c.aide}</span>
              {conseillers.length > 1 && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
                  color: '#8A5300', background: 'rgba(255,149,0,0.12)',
                }} title="Les deux fiches n'appartiennent pas au même conseiller">
                  {conseillers.join(' et ')}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {groupe.fiches.map((f) => {
                const garde = f.client_id === gardeId
                return (
                  <label key={f.client_id} style={{
                    display: 'grid',
                    gridTemplateColumns: '22px minmax(0,1fr) auto',
                    alignItems: 'center', gap: 14, cursor: autorise ? 'pointer' : 'default',
                    padding: '12px 14px', borderRadius: 'var(--rad-md)',
                    border: `1px solid ${garde ? 'var(--gold-line)' : 'var(--bd)'}`,
                    background: garde ? 'var(--gold-subtle)' : 'var(--bg-subtle)',
                    opacity: autorise ? 1 : 0.7,
                  }}>
                    <input
                      type="radio"
                      name={`garde-${groupe.cle}`}
                      checked={garde}
                      disabled={!autorise}
                      onChange={() => setChoix((p) => ({ ...p, [groupe.cle]: f.client_id }))}
                      style={{ width: 16, height: 16, accentColor: 'var(--gold)' }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
                        {nomComplet(f)}
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--t3)', marginLeft: 8 }}>
                          {f.advisor_code || 'sans conseiller'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                        {[f.email, f.telephone].filter(Boolean).join(' · ') || 'aucun contact'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 3 }}>
                        {resume(f)} · créée le {dateFr(f.created_at)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                      color: garde ? 'var(--gold-dk)' : 'var(--t3)',
                    }}>
                      {garde ? 'Fiche conservée' : 'Sera absorbée'}
                    </span>
                  </label>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                {autorise
                  ? 'Choisissez la fiche à conserver, puis fusionnez.'
                  : 'Ces fiches appartiennent à des conseillers différents : seule la direction peut les fusionner.'}
              </div>
              <button
                className="btn btn-primary btn-sm"
                disabled={!autorise || enCours === groupe.cle}
                onClick={() => lancerFusion(groupe)}
              >
                {enCours === groupe.cle ? 'Fusion en cours…' : 'Fusionner'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
