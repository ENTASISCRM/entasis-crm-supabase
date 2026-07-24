// src/components/clients/ClientContratsCard.jsx
// Carte « Patrimoine — Contrats » de la fiche client : le référentiel des
// contrats vivants (créés à la signature des deals, complétables à la main),
// leur timeline d'événements (versements, arbitrages, rachats, avenants) et
// leurs valorisations datées. C'est la vue « ce que le client possède chez
// nous et comment ça évolue », par opposition au pipeline des deals.

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import {
  listContratsForClient, createContrat, updateContrat,
  addContratEvent, upsertValorisation, valeurConnue,
} from '../../services/contrats'
import { listFamilies } from '../../services/equipment'

const EVENT_TYPES = [
  { key: 'versement', label: 'Versement' },
  { key: 'arbitrage', label: 'Arbitrage' },
  { key: 'rachat_partiel', label: 'Rachat partiel' },
  { key: 'rachat_total', label: 'Rachat total' },
  { key: 'avenant', label: 'Avenant' },
  { key: 'clause_beneficiaire', label: 'Clause bénéficiaire' },
  { key: 'autre', label: 'Autre' },
]

const EVENT_LABELS = {
  ouverture: 'Souscription',
  ...Object.fromEntries(EVENT_TYPES.map(t => [t.key, t.label])),
}

const STATUTS = [
  { key: 'actif', label: 'Actif' },
  { key: 'suspendu', label: 'Suspendu' },
  { key: 'rachete', label: 'Racheté' },
  { key: 'clos', label: 'Clos' },
]

const STATUT_STYLE = {
  actif: { backgroundColor: 'rgba(22, 163, 74, 0.12)', color: '#15803D' },
  suspendu: { backgroundColor: 'rgba(217, 119, 6, 0.14)', color: '#B45309' },
  rachete: { backgroundColor: 'rgba(180, 69, 59, 0.10)', color: '#B4453B' },
  clos: { backgroundColor: 'rgba(60, 60, 67, 0.10)', color: 'var(--t3)' },
}

function euro(amount) {
  if (amount === null || amount === undefined || amount === '') return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

function dateFr(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR')
}

const aujourdhui = () => new Date().toISOString().slice(0, 10)

// Formulaire compact d'ajout d'un événement de timeline.
function EventForm({ contrat, profile, onDone, onCancel }) {
  const [type, setType] = useState('versement')
  const [dateEvent, setDateEvent] = useState(aujourdhui())
  const [montant, setMontant] = useState('')
  const [detail, setDetail] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!dateEvent) { toast.error('Date obligatoire'); return }
    setSaving(true)
    try {
      await addContratEvent(contrat.id, {
        type, date_event: dateEvent,
        montant: montant === '' ? null : Number(montant),
        detail: detail.trim() || null,
        saisi_par: profile?.id || null,
      })
      // Un rachat total clôt le contrat : on aligne le statut sans clic en plus.
      if (type === 'rachat_total' && contrat.statut === 'actif') {
        await updateContrat(contrat.id, { statut: 'rachete' })
      }
      toast.success('Événement ajouté')
      onDone()
    } catch (e) {
      console.error('Erreur ajout événement:', e)
      toast.error("Impossible d'ajouter l'événement")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
      <select className="input" value={type} onChange={e => setType(e.target.value)} style={{ width: '170px' }}>
        {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      <input className="input" type="date" value={dateEvent} onChange={e => setDateEvent(e.target.value)} style={{ width: '150px' }} />
      <input className="input" type="number" placeholder="Montant €" value={montant} onChange={e => setMontant(e.target.value)} style={{ width: '120px' }} />
      <input className="input" type="text" placeholder="Détail (optionnel)" value={detail} onChange={e => setDetail(e.target.value)} style={{ flex: '1 1 160px' }} />
      <button className="btn btn-primary btn-sm" onClick={submit} disabled={saving}>
        {saving ? '…' : 'Ajouter'}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annuler</button>
    </div>
  )
}

// Formulaire compact de valorisation datée.
function ValoForm({ contrat, profile, onDone, onCancel }) {
  const [dateValo, setDateValo] = useState(aujourdhui())
  const [valeur, setValeur] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!dateValo || valeur === '') { toast.error('Date et valeur obligatoires'); return }
    setSaving(true)
    try {
      await upsertValorisation(contrat.id, { date_valo: dateValo, valeur, saisi_par: profile?.id || null })
      toast.success('Valorisation enregistrée')
      onDone()
    } catch (e) {
      console.error('Erreur valorisation:', e)
      toast.error("Impossible d'enregistrer la valorisation")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
      <input className="input" type="date" value={dateValo} onChange={e => setDateValo(e.target.value)} style={{ width: '150px' }} />
      <input className="input" type="number" placeholder="Valeur du contrat €" value={valeur} onChange={e => setValeur(e.target.value)} style={{ width: '170px' }} />
      <button className="btn btn-primary btn-sm" onClick={submit} disabled={saving}>
        {saving ? '…' : 'Enregistrer'}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annuler</button>
    </div>
  )
}

// Formulaire de création manuelle (contrat souscrit avant le CRM / hors deal).
function NouveauContratForm({ clientId, client, families, onDone, onCancel }) {
  const [produit, setProduit] = useState('')
  const [famille, setFamille] = useState('av')
  const [compagnie, setCompagnie] = useState('')
  const [numero, setNumero] = useState('')
  const [dateEffet, setDateEffet] = useState('')
  const [montantInitial, setMontantInitial] = useState('')
  const [versement, setVersement] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!produit.trim()) { toast.error('Produit obligatoire'); return }
    setSaving(true)
    try {
      const contrat = await createContrat({
        client_id: clientId,
        famille,
        produit: produit.trim(),
        compagnie: compagnie.trim() || null,
        numero_contrat: numero.trim() || null,
        date_effet: dateEffet || null,
        montant_initial: montantInitial === '' ? null : Number(montantInitial),
        versement_programme: versement === '' ? null : Number(versement),
        advisor_code: client?.advisor_code || null,
      })
      await addContratEvent(contrat.id, {
        type: 'ouverture',
        date_event: dateEffet || aujourdhui(),
        montant: montantInitial === '' ? null : Number(montantInitial),
        detail: 'Souscription — ' + produit.trim(),
      })
      toast.success('Contrat ajouté')
      onDone()
    } catch (e) {
      console.error('Erreur création contrat:', e)
      toast.error('Impossible de créer le contrat')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      padding: '16px', marginBottom: '16px',
      backgroundColor: 'var(--bg)', border: '1px dashed var(--bd)', borderRadius: 'var(--rad)',
    }}>
      <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '10px' }}>Nouveau contrat</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <input className="input" type="text" placeholder="Produit (ex. Assurance vie Lucya)" value={produit} onChange={e => setProduit(e.target.value)} style={{ flex: '1 1 220px' }} />
        <select className="input" value={famille} onChange={e => setFamille(e.target.value)} style={{ width: '160px' }}>
          {families.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <input className="input" type="text" placeholder="Compagnie" value={compagnie} onChange={e => setCompagnie(e.target.value)} style={{ width: '150px' }} />
        <input className="input" type="text" placeholder="N° de contrat" value={numero} onChange={e => setNumero(e.target.value)} style={{ width: '150px' }} />
        <input className="input" type="date" value={dateEffet} onChange={e => setDateEffet(e.target.value)} style={{ width: '150px' }} title="Date d'effet" />
        <input className="input" type="number" placeholder="Montant initial €" value={montantInitial} onChange={e => setMontantInitial(e.target.value)} style={{ width: '150px' }} />
        <input className="input" type="number" placeholder="Versement prog. €/mois" value={versement} onChange={e => setVersement(e.target.value)} style={{ width: '170px' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={saving}>
          {saving ? '…' : 'Créer le contrat'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  )
}

export default function ClientContratsCard({ clientId, client, profile }) {
  const [contrats, setContrats] = useState([])
  const [families, setFamilies] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [formOuvert, setFormOuvert] = useState(null) // { contratId, type: 'event' | 'valo' }
  const [creationOuverte, setCreationOuverte] = useState(false)

  const recharger = useCallback(async () => {
    try {
      const data = await listContratsForClient(clientId)
      setContrats(data)
    } catch (e) {
      console.error('Erreur chargement contrats:', e)
      toast.error('Erreur chargement des contrats')
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    let vivant = true
    ;(async () => {
      try {
        const [fam, data] = await Promise.all([listFamilies(), listContratsForClient(clientId)])
        if (!vivant) return
        setFamilies(fam)
        setContrats(data)
      } catch (e) {
        console.error('Erreur chargement contrats:', e)
      } finally {
        if (vivant) setLoading(false)
      }
    })()
    return () => { vivant = false }
  }, [clientId])

  const familleDe = key => families.find(f => f.key === key)
  const actifs = contrats.filter(c => c.statut === 'actif')
  const totalConnu = actifs.reduce((sum, c) => sum + valeurConnue(c), 0)

  return (
    <div className="card" style={{ marginBottom: '32px' }}>
      <div className="card-header" style={{ padding: '24px 28px 16px 28px' }}>
        <h3>
          Patrimoine — Contrats
          {!loading && contrats.length > 0 && (
            <span style={{ fontWeight: '400', fontSize: '13px', color: 'var(--t2)', marginLeft: '8px' }}>
              {actifs.length} actif{actifs.length > 1 ? 's' : ''} · {euro(totalConnu)} chez Entasis
            </span>
          )}
        </h3>
        <button className="btn btn-secondary btn-sm" onClick={() => setCreationOuverte(v => !v)}>
          + Ajouter un contrat
        </button>
      </div>
      <div className="card-body" style={{ padding: '0 28px 24px 28px' }}>
        {creationOuverte && (
          <NouveauContratForm
            clientId={clientId}
            client={client}
            families={families}
            onDone={() => { setCreationOuverte(false); recharger() }}
            onCancel={() => setCreationOuverte(false)}
          />
        )}

        {loading ? (
          <div style={{ color: 'var(--t2)', fontSize: '13px' }}>Chargement…</div>
        ) : contrats.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--t2)', padding: '32px', fontSize: '13px' }}>
            Aucun contrat. Ils se créent automatiquement à la signature d'un deal,
            ou manuellement pour un contrat souscrit avant le CRM.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {contrats.map(contrat => {
              const fam = familleDe(contrat.famille)
              const isExpanded = expanded === contrat.id
              const valeur = valeurConnue(contrat)
              const derniereValo = contrat.valorisations[0] || null
              const delta = derniereValo && Number(contrat.montant_initial) > 0
                ? ((Number(derniereValo.valeur) - Number(contrat.montant_initial)) / Number(contrat.montant_initial)) * 100
                : null
              return (
                <div key={contrat.id}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : contrat.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: '12px', flexWrap: 'wrap', padding: '16px', cursor: 'pointer',
                      backgroundColor: isExpanded ? 'rgba(192, 155, 90, 0.05)' : 'var(--bg)',
                      borderRadius: 'var(--rad)',
                      border: isExpanded ? '2px solid #C09B5A' : '1px solid var(--bd)',
                    }}
                  >
                    <div style={{ minWidth: '220px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        {fam && (
                          <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                            backgroundColor: fam.couleur || 'var(--gold)', color: 'white',
                          }}>
                            {fam.label}
                          </span>
                        )}
                        <span style={{ fontWeight: '600', fontSize: '14px' }}>{contrat.produit}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--t2)' }}>
                        {[contrat.compagnie, contrat.numero_contrat ? `N° ${contrat.numero_contrat}` : 'N° à renseigner',
                          `effet ${dateFr(contrat.date_effet)}`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{euro(valeur)}</div>
                        <div style={{ fontSize: '11px', color: delta === null ? 'var(--t3)' : delta >= 0 ? '#15803D' : '#B4453B' }}>
                          {derniereValo
                            ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} % · valo du ${dateFr(derniereValo.date_valo)}`
                            : 'valeur initiale (aucune valo saisie)'}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '10px',
                        ...(STATUT_STYLE[contrat.statut] || {}),
                      }}>
                        {(STATUTS.find(s => s.key === contrat.statut) || {}).label || contrat.statut}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      marginTop: '8px', marginLeft: '20px', padding: '16px',
                      backgroundColor: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 'var(--rad)',
                    }}>
                      {/* Champs de vie du contrat */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
                        <input
                          className="input"
                          type="text"
                          placeholder="N° de contrat"
                          defaultValue={contrat.numero_contrat || ''}
                          onBlur={async e => {
                            const v = e.target.value.trim() || null
                            if (v === contrat.numero_contrat) return
                            try {
                              await updateContrat(contrat.id, { numero_contrat: v })
                              toast.success('N° de contrat enregistré')
                              recharger()
                            } catch { toast.error('Enregistrement impossible') }
                          }}
                          style={{ width: '180px' }}
                        />
                        <select
                          className="input"
                          value={contrat.statut}
                          onChange={async e => {
                            try {
                              await updateContrat(contrat.id, { statut: e.target.value })
                              toast.success('Statut mis à jour')
                              recharger()
                            } catch { toast.error('Mise à jour impossible') }
                          }}
                          style={{ width: '130px' }}
                        >
                          {STATUTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <span style={{ fontSize: '12px', color: 'var(--t2)' }}>
                          Versement programmé : {contrat.versement_programme ? `${euro(contrat.versement_programme)}/mois` : '—'}
                        </span>
                        <div style={{ flex: 1 }} />
                        <button className="btn btn-secondary btn-sm" onClick={() => setFormOuvert({ contratId: contrat.id, type: 'event' })}>
                          + Événement
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setFormOuvert({ contratId: contrat.id, type: 'valo' })}>
                          + Valorisation
                        </button>
                      </div>

                      {formOuvert?.contratId === contrat.id && formOuvert.type === 'event' && (
                        <EventForm
                          contrat={contrat}
                          profile={profile}
                          onDone={() => { setFormOuvert(null); recharger() }}
                          onCancel={() => setFormOuvert(null)}
                        />
                      )}
                      {formOuvert?.contratId === contrat.id && formOuvert.type === 'valo' && (
                        <ValoForm
                          contrat={contrat}
                          profile={profile}
                          onDone={() => { setFormOuvert(null); recharger() }}
                          onCancel={() => setFormOuvert(null)}
                        />
                      )}

                      {/* Timeline des événements */}
                      <div style={{ marginTop: '14px' }}>
                        {contrat.events.length === 0 ? (
                          <div style={{ fontSize: '13px', color: 'var(--t2)' }}>Aucun événement.</div>
                        ) : contrat.events.map(ev => (
                          <div key={ev.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                            gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--bd)', fontSize: '13px',
                          }}>
                            <div>
                              <strong>{EVENT_LABELS[ev.type] || ev.type}</strong>
                              {ev.detail && <span style={{ color: 'var(--t2)' }}> — {ev.detail}</span>}
                            </div>
                            <div style={{ whiteSpace: 'nowrap', color: 'var(--t2)', fontSize: '12px' }}>
                              {ev.montant != null && <strong style={{ color: 'var(--t1)', marginRight: '8px' }}>{euro(ev.montant)}</strong>}
                              {dateFr(ev.date_event)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Historique des valorisations */}
                      {contrat.valorisations.length > 0 && (
                        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--t2)' }}>
                          <strong style={{ color: 'var(--t1)' }}>Valorisations :</strong>{' '}
                          {contrat.valorisations.map(v => `${euro(v.valeur)} (${dateFr(v.date_valo)})`).join(' · ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
