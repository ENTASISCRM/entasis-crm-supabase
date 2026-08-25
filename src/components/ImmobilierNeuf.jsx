// src/components/ImmobilierNeuf.jsx
// ═══════════════════════════════════════════════════════════════════════════
// IMMOBILIER — refonte du 25/08/2026
//
// Entasis ne commercialise pas de lots. Deux partenaires officiels le font :
//   • le neuf              -> Althera Patrimoine, Tanguy Barbosa
//   • la défiscalisation   -> François 1er, Sébastien Hallard
//
// Le conseiller qualifie et reste sur son dossier : le référent choisit les
// lots sur son extranet et fait le rendez-vous avec lui. C est une vente à
// deux, pas un dossier que l on donne.
//
// La transmission ouvre un brouillon dans le Gmail du conseiller, déjà adressé
// au référent et déjà rédigé. C est lui qui appuie sur Envoyer : l échange se
// poursuit ensuite dans sa propre boîte, là où il saura le retrouver.
//
// L ancien module (catalogue de programmes, pipeline VEFA, fiches lots) a été
// retiré : il faisait croire que nous vendions.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react'
import { PARTENAIRES_IMMO, partenaireDe, ETAPES_IMMO, etapeDe } from '../config/partenairesImmo'
import {
  listDossiers, creerDossier, majDossier, supprimerDossier, marquerTransmis,
  chercherClients,
} from '../services/dossiersImmo'
import { euro, messageErreur } from '../lib/ui-shared'
import { fichesDuPartenaire } from '../config/fichesImmo'
import { telechargerFiche, telechargerLot } from '../lib/fiches-immo-pdf'
import { brouillonMail, ouvrirGmail } from '../lib/mail-immo'

const MONOGRAMMES = { althera: 'AP', francois1er: 'F1' }

const dateCourte = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

const joursDepuis = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

const nouveauDossier = () => ({
  client_id: null,
  client_nom: '', client_email: '', client_telephone: '',
  objectif: '', dispositif_retenu: '', budget_total: '', apport: '', notes: '',
})

export default function ImmobilierNeuf({ profile }) {
  const [dossiers, setDossiers] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [modale, setModale] = useState(null)   // { partenaire, form, etape, envoi }
  const [filtre, setFiltre] = useState('tous') // tous | althera | francois1er

  const recharger = useCallback(async () => {
    try {
      setDossiers(await listDossiers())
      setErreur(null)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => { recharger() }, [recharger])

  const visibles = useMemo(
    () => (filtre === 'tous' ? dossiers : dossiers.filter((d) => d.partenaire === filtre)),
    [dossiers, filtre],
  )

  const compteurs = useMemo(() => {
    const c = { transmis: 0, etude: 0, reserve: 0, acte: 0, sans_suite: 0 }
    for (const d of dossiers) {
      const k = d.statut_pipeline || 'transmis'
      if (k in c) c[k] += 1
    }
    return c
  }, [dossiers])

  const parPartenaire = useMemo(() => {
    const c = {}
    for (const p of PARTENAIRES_IMMO) {
      const siens = dossiers.filter((d) => d.partenaire === p.cle)
      c[p.cle] = {
        total: siens.length,
        actifs: siens.filter((d) => !['acte', 'sans_suite'].includes(d.statut_pipeline)).length,
      }
    }
    return c
  }, [dossiers])

  // ── Transmission ────────────────────────────────────────────────────────
  const ouvrir = (partenaire) => setModale({ partenaire, form: nouveauDossier(), etape: 'saisie', envoi: false })

  // Le brouillon Gmail s ouvre AVANT l enregistrement : un navigateur ne
  // laisse ouvrir une fenêtre que dans la foulée immédiate du clic, un await
  // au milieu la ferait bloquer par le bloqueur de fenêtres.
  const envoyer = async () => {
    if (!modale || modale.envoi) return
    const f = modale.form
    ouvrirGmail(modale.partenaire, f, profile?.full_name)
    setModale((m) => ({ ...m, envoi: true }))
    try {
      await creerDossier({
        partenaire: modale.partenaire.cle,
        client_id: f.client_id,
        client_nom: f.client_nom.trim(),
        client_email: f.client_email.trim() || null,
        client_telephone: f.client_telephone.trim() || null,
        objectif: f.objectif.trim() || null,
        dispositif_retenu: f.dispositif_retenu || null,
        budget_total: f.budget_total === '' ? null : Number(f.budget_total),
        apport: f.apport === '' ? null : Number(f.apport),
        notes: f.notes.trim() || null,
        statut_pipeline: 'transmis',
        transmis_le: new Date().toISOString(),
        transmis_par: profile?.full_name || null,
        referent_email: modale.partenaire.email,
        conseiller_id: profile?.id || null,
      })
      await recharger()
      setModale((m) => ({ ...m, etape: 'envoye', envoi: false }))
    } catch (e) {
      // Le brouillon est ouvert malgré tout : on le dit, plutôt que de laisser
      // croire que rien ne s est passé.
      setModale((m) => ({ ...m, envoi: false, erreur: `${messageErreur(e)} Le brouillon Gmail est ouvert, le suivi n a pas été enregistré.` }))
    }
  }

  // Rouvrir le brouillon d un dossier déjà saisi (mail jamais parti, ou
  // relance après plusieurs jours sans retour).
  const rouvrir = (d) => {
    const p = partenaireDe(d.partenaire)
    if (!p) return
    ouvrirGmail(p, {
      client_nom: d.client_nom || '', client_email: d.client_email || '',
      client_telephone: d.client_telephone || '', objectif: d.objectif || '',
      dispositif_retenu: d.dispositif_retenu || '',
      budget_total: d.budget_total ?? '', apport: d.apport ?? '',
      notes: d.notes || '',
    }, profile?.full_name)
    if (!d.transmis_le) {
      marquerTransmis(d.id, profile?.full_name, p.email).then(recharger).catch((e) => setErreur(messageErreur(e)))
    }
  }

  const changerStatut = async (d, statut) => {
    setDossiers((prev) => prev.map((x) => (x.id === d.id ? { ...x, statut_pipeline: statut } : x)))
    try { await majDossier(d.id, { statut_pipeline: statut }) }
    catch (e) { setErreur(messageErreur(e)); recharger() }
  }

  const retirer = async (d) => {
    if (!window.confirm(`Retirer le dossier de ${d.client_nom} du suivi ?\n\nCela n annule rien chez le partenaire, cela nettoie seulement votre liste.`)) return
    try { await supprimerDossier(d.id); await recharger() }
    catch (e) { setErreur(messageErreur(e)) }
  }

  if (chargement) {
    return (
      <div className="immo-loading">
        <div className="spinner" />
        <p style={{ marginTop: 14, color: 'var(--t3)', fontSize: 13 }}>Chargement des dossiers transmis…</p>
      </div>
    )
  }

  return (
    <div className="immo2">
      {/* ── Bandeau d intention ─────────────────────────────────────────── */}
      <header className="immo2-hero">
        <div className="immo2-hero-glow" aria-hidden="true" />
        <div className="immo2-hero-in">
          <span className="immo2-hero-kicker">Immobilier</span>
          <h1 className="immo2-hero-title">Vous qualifiez, nos référents vous aident à vendre.</h1>
          <p className="immo2-hero-sub">
            Entasis ne commercialise pas de lots. Décrivez le projet de votre client et transmettez
            le dossier au bon partenaire : il sélectionne les biens sur son extranet, puis fait le
            rendez-vous avec vous. Le client reste le vôtre, vous restez sur le dossier.
          </p>
        </div>
      </header>

      {erreur && <div className="immo2-alert">{erreur}</div>}

      {/* ── Les deux référents ──────────────────────────────────────────── */}
      <div className="immo2-partners">
        {PARTENAIRES_IMMO.map((p) => (
          <article key={p.cle} className={`immo2-partner immo2-partner-${p.cle}`}>
            <div className="immo2-partner-top">
              <div className="immo2-mono">{MONOGRAMMES[p.cle]}</div>
              <div className="immo2-partner-id">
                <span className="immo2-partner-metier">{p.metier}</span>
                <h2 className="immo2-partner-societe">{p.societe}</h2>
              </div>
              {parPartenaire[p.cle]?.actifs > 0 && (
                <span className="immo2-partner-count" title="Dossiers en cours chez ce partenaire">
                  {parPartenaire[p.cle].actifs}
                </span>
              )}
            </div>

            <p className="immo2-partner-accroche">{p.accroche}</p>

            <div className="immo2-referent">
              <span className="immo2-referent-label">Votre référent</span>
              <span className="immo2-referent-nom">{p.referent}</span>
              <div className="immo2-referent-contacts">
                <a className="immo2-contact" href={`mailto:${p.email}`}>
                  <IcoMail /> {p.email}
                </a>
                <a className="immo2-contact" href={`tel:${p.telephone.replace(/\s/g, '')}`}>
                  <IcoTel /> {p.telephone}
                </a>
              </div>
            </div>

            <FichesPartenaire partenaire={p} conseiller={profile?.full_name} />

            <div className="immo2-partner-actions">
              <button className="immo2-btn immo2-btn-gold" onClick={() => ouvrir(p)}>
                <IcoSend /> Préparer le mail au référent
              </button>
              {p.extranet && (
                <a className="immo2-btn immo2-btn-ghost" href={p.extranet} target="_blank" rel="noreferrer">
                  Ouvrir l’extranet
                </a>
              )}
              {p.site && (
                <a className="immo2-btn immo2-btn-ghost" href={p.site} target="_blank" rel="noreferrer"
                  title="Programmes et disponibilités publiés par le partenaire">
                  Voir ses programmes
                </a>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* ── Suivi ───────────────────────────────────────────────────────── */}
      <section className="immo2-suivi">
        <div className="immo2-suivi-head">
          <div>
            <span className="immo2-kicker">Suivi</span>
            <h2 className="immo2-h2">Dossiers transmis</h2>
          </div>
          <div className="immo2-seg">
            <button className={filtre === 'tous' ? 'on' : ''} onClick={() => setFiltre('tous')}>
              Tous <em>{dossiers.length}</em>
            </button>
            {PARTENAIRES_IMMO.map((p) => (
              <button key={p.cle} className={filtre === p.cle ? 'on' : ''} onClick={() => setFiltre(p.cle)}>
                {p.societe} <em>{parPartenaire[p.cle]?.total || 0}</em>
              </button>
            ))}
          </div>
        </div>

        {dossiers.length > 0 && (
          <div className="immo2-stats">
            {ETAPES_IMMO.filter((e) => e.cle !== 'sans_suite').map((e) => (
              <div key={e.cle} className={`immo2-stat immo2-stat-${e.cle}`}>
                <span className="immo2-stat-v">{compteurs[e.cle]}</span>
                <span className="immo2-stat-l">{e.label}</span>
              </div>
            ))}
          </div>
        )}

        {visibles.length === 0 ? (
          <div className="immo2-empty">
            <div className="immo2-empty-ico"><IcoKeys /></div>
            <p className="immo2-empty-t">Aucun dossier transmis</p>
            <p className="immo2-empty-s">
              Dès qu un client évoque un projet immobilier, envoyez le dossier au référent concerné :
              il revient vers vous avec les lots et vous accompagne au rendez-vous.
            </p>
          </div>
        ) : (
          <div className="immo2-list">
            {visibles.map((d) => {
              const p = partenaireDe(d.partenaire)
              const attente = d.statut_pipeline === 'transmis' ? joursDepuis(d.transmis_le) : null
              return (
                <article key={d.id} className="immo2-row">
                  <div className={`immo2-row-mono immo2-mono-${d.partenaire}`}>{MONOGRAMMES[d.partenaire] || '?'}</div>

                  <div className="immo2-row-main">
                    <h3 className="immo2-row-client">{d.client_nom || 'Client sans nom'}</h3>
                    <p className="immo2-row-meta">
                      {p?.societe || 'Partenaire inconnu'}
                      {d.dispositif_retenu ? ` · ${d.dispositif_retenu}` : ''}
                      {d.objectif ? ` · ${d.objectif}` : ''}
                    </p>
                  </div>

                  <div className="immo2-row-budget">
                    {d.budget_total ? <span className="immo2-row-eur">{euro(d.budget_total)}</span> : <span className="immo2-row-vide">Budget non précisé</span>}
                    {d.apport ? <span className="immo2-row-apport">dont {euro(d.apport)} d apport</span> : null}
                  </div>

                  <div className="immo2-row-date">
                    {d.transmis_le
                      ? <>Transmis le {dateCourte(d.transmis_le)}{attente != null && attente >= 7 && <em className="immo2-relance">sans retour depuis {attente} j</em>}</>
                      : <span className="immo2-nonenvoye">Pas encore envoyé</span>}
                  </div>

                  <div className="immo2-row-actions">
                    <select
                      className={`immo2-statut immo2-statut-${d.statut_pipeline || 'transmis'}`}
                      value={d.statut_pipeline || 'transmis'}
                      onChange={(e) => changerStatut(d, e.target.value)}
                      title={etapeDe(d.statut_pipeline).aide}
                    >
                      {ETAPES_IMMO.map((e) => <option key={e.cle} value={e.cle}>{e.label}</option>)}
                    </select>
                    <button className="immo2-mini" onClick={() => rouvrir(d)}
                      title={d.transmis_le ? 'Rouvrir le mail dans Gmail pour relancer' : 'Ouvrir le mail dans Gmail'}>
                      {d.transmis_le ? 'Relancer' : 'Envoyer'}
                    </button>
                    <button className="immo2-mini immo2-mini-danger" onClick={() => retirer(d)} title="Retirer du suivi">×</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {modale && (
        <ModaleTransmission
          modale={modale}
          setModale={setModale}
          envoyer={envoyer}
          profileNom={profile?.full_name}
          fermer={() => setModale(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Fiches dispositif : une par produit du partenaire, en PDF, a lire avant le
// rendez vous. Elles disent a qui le dispositif s adresse, comment il marche,
// ce qui fait capoter un dossier, et quoi demander au client. Rien sur la
// remuneration. Le PDF se fabrique dans le navigateur, au clic : aucun
// fichier a heberger, aucune version qui traine.
// ═══════════════════════════════════════════════════════════════════════════
function FichesPartenaire({ partenaire, conseiller }) {
  const fiches = useMemo(() => fichesDuPartenaire(partenaire.cle), [partenaire.cle])
  const [enCours, setEnCours] = useState(null)
  const [erreur, setErreur] = useState(null)

  if (fiches.length === 0) return null

  const telecharger = async (fiche) => {
    setEnCours(fiche.cle); setErreur(null)
    try { await telechargerFiche(fiche, partenaire, conseiller) }
    catch (e) { setErreur(messageErreur(e)) }
    finally { setEnCours(null) }
  }

  const toutTelecharger = async () => {
    setEnCours('lot'); setErreur(null)
    try { await telechargerLot(fiches, partenaire, conseiller) }
    catch (e) { setErreur(messageErreur(e)) }
    finally { setEnCours(null) }
  }

  return (
    <div className="immo2-fiches">
      <div className="immo2-fiches-head">
        <span className="immo2-fiches-titre">Fiches dispositif</span>
        <button className="immo2-fiches-tout" onClick={toutTelecharger} disabled={enCours === 'lot'}>
          {enCours === 'lot' ? 'Préparation…' : 'Tout télécharger'}
        </button>
      </div>
      <p className="immo2-fiches-aide">
        À qui ça s’adresse, ce qui fait capoter un dossier, les questions à poser. À lire avant le rendez-vous.
      </p>
      <div className="immo2-fiches-liste">
        {fiches.map((f) => (
          <button key={f.cle} className="immo2-fiche" onClick={() => telecharger(f)}
            disabled={enCours === f.cle} title={f.accroche}>
            <IcoPdf />
            <span>{f.dispositif}</span>
          </button>
        ))}
      </div>
      {erreur && <span className="form-hint" style={{ color: 'var(--cancelled)' }}>{erreur}</span>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Modale de transmission. Deux temps : on saisit, puis on relit le mail avant
// qu il s ouvre dans Gmail. Rien ne part d ici : c est le conseiller qui
// appuie sur Envoyer dans sa propre boîte.
// ═══════════════════════════════════════════════════════════════════════════
function ModaleTransmission({ modale, setModale, envoyer, profileNom, fermer }) {
  const { partenaire, form, etape } = modale
  const set = (k, v) => setModale((m) => ({ ...m, form: { ...m.form, [k]: v }, erreur: null }))
  const pret = form.client_nom.trim().length > 1

  return (
    <div className="modal-overlay" onClick={fermer}>
      <div className="modal-box immo2-modal" onClick={(e) => e.stopPropagation()}>
        {etape === 'envoye' ? (
          <div className="immo2-done">
            <div className="immo2-done-ico"><IcoCheck /></div>
            <h2 className="immo2-done-t">Le mail est prêt dans Gmail</h2>
            <p className="immo2-done-s">
              L onglet Gmail s est ouvert, adressé à {partenaire.referent} et déjà rédigé pour{' '}
              <strong>{form.client_nom}</strong>. Relisez, appuyez sur Envoyer : la réponse arrivera
              dans votre boîte, et le dossier est déjà noté dans votre suivi.
            </p>
            <button className="immo2-btn immo2-btn-dark" onClick={fermer}>Terminer</button>
          </div>
        ) : (
          <>
            <div className="modal-head immo2-modal-head">
              <div>
                <div className="modal-title">Transmettre à {partenaire.referent}</div>
                <div className="modal-subtitle">{partenaire.societe} · {partenaire.metier}</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={fermer}>×</button>
            </div>

            <div className="modal-body">
              {etape === 'saisie' ? (
                <>
                  <div className="form-section">
                    <div className="form-section-title">Le client</div>
                    <div className="form-row form-row-2">
                      <ChampClient form={form} set={set} setModale={setModale} />
                      <div className="form-group">
                        <label className="form-label">Téléphone</label>
                        <input className="form-input" value={form.client_telephone}
                          onChange={(e) => set('client_telephone', e.target.value)} placeholder="06 12 34 56 78" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input className="form-input" type="email" value={form.client_email}
                        onChange={(e) => set('client_email', e.target.value)} placeholder="marie.dupont@email.fr" />
                    </div>
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">Le projet</div>
                    <div className="form-row form-row-2">
                      <div className="form-group">
                        <label className="form-label">Objectif</label>
                        <input className="form-input" value={form.objectif}
                          onChange={(e) => set('objectif', e.target.value)}
                          placeholder="Réduire l impôt, se constituer un patrimoine…" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Dispositif envisagé</label>
                        <select className="form-select" value={form.dispositif_retenu}
                          onChange={(e) => set('dispositif_retenu', e.target.value)}>
                          <option value="">À définir avec le référent</option>
                          {partenaire.dispositifs.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-row form-row-2">
                      <div className="form-group">
                        <label className="form-label">Budget</label>
                        <input className="form-input" type="number" min="0" value={form.budget_total}
                          onChange={(e) => set('budget_total', e.target.value)} placeholder="250000" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Apport</label>
                        <input className="form-input" type="number" min="0" value={form.apport}
                          onChange={(e) => set('apport', e.target.value)} placeholder="30000" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Précisions pour le référent</label>
                      <textarea className="form-textarea" rows={3} value={form.notes}
                        onChange={(e) => set('notes', e.target.value)}
                        placeholder="Secteur souhaité, situation fiscale, capacité d emprunt, disponibilités du client…" />
                      <span className="form-hint">
                        Ce texte part tel quel dans le mail. Aucun montant de rémunération n y figure.
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="immo2-recap">
                  <p className="immo2-recap-intro">
                    Le mail va s ouvrir dans votre Gmail, adressé à <strong>{partenaire.email}</strong>,
                    déjà rédigé. Vous le relisez et vous appuyez sur Envoyer : l échange reste dans
                    votre boîte.
                  </p>
                  <div className="immo2-recap-card">
                    <LigneRecap label="Client" v={form.client_nom} />
                    <LigneRecap label="Téléphone" v={form.client_telephone} />
                    <LigneRecap label="Email" v={form.client_email} />
                    <LigneRecap label="Objectif" v={form.objectif} />
                    <LigneRecap label="Dispositif" v={form.dispositif_retenu || 'À définir avec le référent'} />
                    <LigneRecap label="Budget" v={form.budget_total ? euro(form.budget_total) : null} />
                    <LigneRecap label="Apport" v={form.apport ? euro(form.apport) : null} />
                    <LigneRecap label="Précisions" v={form.notes} />
                  </div>
                  <details className="immo2-apercu">
                    <summary>Voir le texte du mail</summary>
                    <pre>{brouillonMail(partenaire, form, profileNom).corps}</pre>
                  </details>
                </div>
              )}

              {modale.erreur && <div className="immo2-alert">{modale.erreur}</div>}
            </div>

            <div className="modal-foot">
              {etape === 'saisie' ? (
                <>
                  <button className="btn btn-ghost" onClick={fermer}>Annuler</button>
                  <button className="immo2-btn immo2-btn-gold" disabled={!pret}
                    onClick={() => setModale((m) => ({ ...m, etape: 'relecture' }))}>
                    Relire avant envoi
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-ghost" onClick={() => setModale((m) => ({ ...m, etape: 'saisie' }))}>
                    Modifier
                  </button>
                  <button className="immo2-btn immo2-btn-gold" disabled={modale.envoi} onClick={envoyer}>
                    {modale.envoi ? 'Ouverture…' : <><IcoSend /> Ouvrir dans Gmail</>}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Recherche de fiche client : rattacher la transmission a un client connu la
// fait apparaitre dans son onglet Immobilier. Saisie libre acceptee pour un
// prospect qui n a pas encore de fiche.
function ChampClient({ form, set, setModale }) {
  const [suggestions, setSuggestions] = useState([])
  const [ouvert, setOuvert] = useState(false)

  useEffect(() => {
    if (form.client_id || form.client_nom.trim().length < 2) { setSuggestions([]); return }
    let vivant = true
    const t = setTimeout(async () => {
      const r = await chercherClients(form.client_nom)
      if (vivant) { setSuggestions(r); setOuvert(r.length > 0) }
    }, 220)
    return () => { vivant = false; clearTimeout(t) }
  }, [form.client_nom, form.client_id])

  const choisir = (c) => {
    setModale((m) => ({
      ...m,
      form: {
        ...m.form,
        client_id: c.id,
        client_nom: `${c.prenom || ''} ${c.nom || ''}`.trim(),
        client_email: c.email || m.form.client_email,
        client_telephone: c.telephone || m.form.client_telephone,
      },
    }))
    setOuvert(false)
  }

  return (
    <div className="form-group immo2-autoc">
      <label className="form-label">Nom et prénom *</label>
      <input
        className="form-input" value={form.client_nom} autoFocus autoComplete="off"
        onChange={(e) => { set('client_id', null); set('client_nom', e.target.value) }}
        onFocus={() => setOuvert(suggestions.length > 0)}
        onBlur={() => setTimeout(() => setOuvert(false), 160)}
        placeholder="Marie Dupont"
      />
      {form.client_id
        ? <span className="form-hint immo2-lie">Rattaché à sa fiche client</span>
        : <span className="form-hint">Tapez le nom pour retrouver une fiche existante.</span>}
      {ouvert && suggestions.length > 0 && (
        <ul className="immo2-suggestions">
          {suggestions.map((c) => (
            <li key={c.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(c)}>
                <strong>{`${c.prenom || ''} ${c.nom || ''}`.trim()}</strong>
                {c.email && <span>{c.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const LigneRecap = ({ label, v }) => (
  <div className="immo2-recap-l">
    <span>{label}</span>
    <strong className={v ? '' : 'vide'}>{v || 'non renseigné'}</strong>
  </div>
)

// ─── Pictogrammes (trait fin, cohérent avec le reste du CRM) ──────────────
const IcoMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
  </svg>
)
const IcoTel = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
)
const IcoSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </svg>
)
const IcoCheck = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)
const IcoPdf = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    <path d="M12 18v-6" /><path d="m9 15 3 3 3-3" />
  </svg>
)
const IcoKeys = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.8V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.8" /><path d="M9.5 21v-6h5v6" />
  </svg>
)
