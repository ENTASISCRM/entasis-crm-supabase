// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATIONS TYPES PAR PARTENAIRE
//
// Un onglet par partenaire, les profils de gestion en dessous. Le but tient
// en une phrase : un conseiller qui arrive doit pouvoir sortir une allocation
// validée correspondant au profil de son client, sans la reconstruire.
//
// L'écran ne conçoit rien. Il affiche ce qui a été validé, et il contrôle
// deux choses que l'œil rate :
//   • la somme des poids tombe-t-elle à 100 % ;
//   • chaque ligne correspond-elle bien à un fonds du référentiel Marchés,
//     et avec le même ISIN.
// Les écarts sont signalés, jamais corrigés en silence.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import SubTabs from './ui/SubTabs'
import { FONDS_PAR_ISIN } from '../config/fonds'
import { ALLOCATIONS, PARTENAIRES, AVERTISSEMENTS_PARTENAIRE, totalPoids } from '../config/allocations'

// Rapproche une ligne d'allocation du référentiel de fonds. Trois issues :
// l'ISIN est connu (rattaché), le nom est connu mais sous un autre ISIN
// (classe de parts différente — à trancher), ou rien ne correspond.
function rapprocher(ligne) {
  const parIsin = FONDS_PAR_ISIN[ligne.isin]
  if (parIsin) return { etat: 'ok', fonds: parIsin }

  const cle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const cibleCle = cle(ligne.fonds)
  const parNom = Object.values(FONDS_PAR_ISIN).find((f) => {
    const a = cle(f.name)
    return a.startsWith(cibleCle.slice(0, 14)) || cibleCle.startsWith(a.slice(0, 14))
  })
  if (parNom) return { etat: 'isin-divergent', fonds: parNom }
  return { etat: 'inconnu', fonds: null }
}

const pct = (n) => `${String(n).replace('.', ',')} %`

export default function AllocationsTypes() {
  const [partenaire, setPartenaire] = useState(PARTENAIRES[0].cle)

  const profils = useMemo(
    () => ALLOCATIONS.filter((a) => a.partenaire === partenaire),
    [partenaire],
  )

  const onglets = PARTENAIRES.map((p) => ({
    key: p.cle,
    label: p.nom,
    badge: ALLOCATIONS.filter((a) => a.partenaire === p.cle).length,
  }))

  function copier(profil) {
    const lignes = profil.lignes.map((l) => `${l.fonds} (${l.isin}) — ${pct(l.poids)}`)
    const texte = [`${profil.nom} · ${PARTENAIRES.find(p => p.cle === profil.partenaire)?.nom}`, ...lignes].join('\n')
    navigator.clipboard?.writeText(texte)
      .then(() => toast.success('Allocation copiée'))
      .catch(() => toast.error('Copie impossible'))
  }

  const avertissement = AVERTISSEMENTS_PARTENAIRE[partenaire]

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Allocations types · par partenaire</div>
          <div className="section-title">Allocations par profil de gestion</div>
          <div className="section-sub">
            Les allocations validées, prêtes à reprendre en rendez-vous. Le CRM les
            affiche et les contrôle — il ne les conçoit pas.
          </div>
        </div>
      </div>

      <SubTabs tabs={onglets} active={partenaire} onChange={setPartenaire} />

      {avertissement && (
        <div className="form-hint" style={{ marginTop: 16, borderLeft: '2px solid var(--warn, #B45309)', paddingLeft: 12 }}>
          {avertissement}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
        {profils.map((profil) => {
          const total = totalPoids(profil.lignes)
          const vide = profil.lignes.length === 0
          const sommeJuste = total === 100
          const rapprochements = profil.lignes.map(rapprocher)
          const nbDivergents = rapprochements.filter((r) => r.etat === 'isin-divergent').length
          const nbInconnus = rapprochements.filter((r) => r.etat === 'inconnu').length

          return (
            <div className="card" key={profil.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', padding: '18px 20px 0' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div className="section-title" style={{ fontSize: 17 }}>{profil.nom}</div>
                  <div className="section-sub">
                    Horizon {profil.horizon} · cible {profil.cible}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {!vide && (
                    <span
                      className={`badge ${sommeJuste ? 'badge-signed' : 'badge-cancelled'}`}
                      title={sommeJuste ? 'La somme des poids tombe juste' : 'La somme des poids ne fait pas 100 %'}
                    >
                      Total {pct(total)}
                    </span>
                  )}
                  {!vide && (
                    <button className="btn btn-outline btn-sm" onClick={() => copier(profil)}>
                      Copier l'allocation
                    </button>
                  )}
                </div>
              </div>

              <div style={{ padding: '14px 20px 20px' }}>
                <div className="form-hint" style={{ marginBottom: 14 }}>
                  <strong>Source :</strong> {profil.source}
                  {profil.note && <><br />{profil.note}</>}
                </div>

                {vide ? (
                  <div className="table-empty-state">
                    <div className="empty-title">Lignes non reprises</div>
                    <div className="empty-sub">
                      Le détail des supports est dans le document source et doit être
                      recopié ici. Rien n'a été reconstitué de mémoire.
                    </div>
                  </div>
                ) : (
                  <>
                    {(nbDivergents > 0 || nbInconnus > 0) && (
                      <div className="form-hint" style={{ marginBottom: 12, color: 'var(--danger, #9A2F1C)' }}>
                        {nbDivergents > 0 && (
                          <>
                            {nbDivergents} support{nbDivergents > 1 ? 's' : ''} porte
                            {nbDivergents > 1 ? 'nt' : ''} un ISIN différent de celui du
                            référentiel Marchés — classe de parts à trancher avant usage.
                          </>
                        )}
                        {nbInconnus > 0 && (
                          <> {nbInconnus} support{nbInconnus > 1 ? 's' : ''} absent
                          {nbInconnus > 1 ? 's' : ''} du référentiel.</>
                        )}
                      </div>
                    )}

                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Support</th>
                            <th>ISIN</th>
                            <th style={{ textAlign: 'right' }}>Poids</th>
                            <th>Référentiel</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profil.lignes.map((l, i) => {
                            const r = rapprochements[i]
                            return (
                              <tr key={l.isin + i}>
                                <td><div className="cell-primary">{l.fonds}</div></td>
                                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{l.isin}</td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                  {pct(l.poids)}
                                </td>
                                <td>
                                  {r.etat === 'ok' && <span className="badge badge-signed">Rattaché</span>}
                                  {r.etat === 'isin-divergent' && (
                                    <span className="badge badge-cancelled" title={`Référentiel : ${r.fonds.isin}`}>
                                      ISIN différent — {r.fonds.isin}
                                    </span>
                                  )}
                                  {r.etat === 'inconnu' && (
                                    <span className="badge badge-forecast">Hors référentiel</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
