// ═══════════════════════════════════════════════════════════════════════════
// RÉMUNÉRATION — Onglet conseiller (vue perso) + manager (vue équipe)
//
// Vue conseiller :
//   • Booster motivation : barre de progression palier, écart au seuil
//     de rentabilité, projection si le pipeline signe
//   • Détail des deals du mois en cours
//
// Vue manager :
//   • Tableau équipe complète (un conseiller par ligne)
//   • Alertes sous-palier
//   • Pas de comparaison directe inter-conseillers : chaque ligne montre
//     uniquement la situation du conseiller, pas la moyenne ou un classement
//
// Doc canonique : src/lib/bareme-entasis.js
// Moteur calcul : src/lib/calcul-commission.js
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import * as contratsService from '../services/conseillerContrats'
import { LIBELLE_TYPE_CONTRAT } from '../lib/bareme-entasis'
import {
  commissionsMois,
  evaluerRentabilite,
  dealsDuMois,
  dealsDuConseiller,
  codesContrat,
  valeurCabinetDeal,
  commissionsDeal,
  mapProduitDeal,
  partDeal,
} from '../lib/calcul-commission'
import { BAREME_PRODUITS, DATE_REMISE_A_ZERO_RENTABILITE } from '../lib/bareme-entasis'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})
const fmtEurPrecis = (v) => Number(v || 0).toLocaleString('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
})
const fmtPct = (v) => `${(Number(v || 0)).toFixed(1)} %`

export default function Remuneration({ profile, deals, month }) {
  const isManager = profile?.role === 'manager'
  const [contrats, setContrats] = useState([])
  const [contratPerso, setContratPerso] = useState(null)
  const [loading, setLoading] = useState(true)
  const [vue, setVue] = useState(isManager ? 'manager' : 'perso')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        if (isManager) {
          const liste = await contratsService.list()
          if (!alive) return
          setContrats(liste)
          // Le manager voit aussi sa propre ligne si elle existe
          const own = liste.find(c => c.profile_id === profile.id) ||
                      liste.find(c => c.full_name?.toLowerCase().includes((profile.full_name || '').toLowerCase()))
          setContratPerso(own || null)
        } else {
          const own = await contratsService.getOwn()
          if (!alive) return
          setContratPerso(own)
        }
      } catch (e) {
        console.error('[Remuneration] load', e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [isManager, profile?.id, profile?.full_name])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
        Chargement…
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">{isManager ? 'Pilotage équipe' : 'Mon mois'}</div>
          <div className="section-title">Rémunération</div>
          <div className="section-sub">
            {isManager
              ? 'Variable de chaque conseiller, palier et seuil de rentabilité.'
              : 'Suivi de ton variable ce mois-ci, ton palier et ton seuil de rentabilité.'}
          </div>
        </div>
        {isManager && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`btn ${vue === 'manager' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVue('manager')}>Vue équipe</button>
            <button
              className={`btn ${vue === 'perso' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVue('perso')}>Ma vue conseiller</button>
          </div>
        )}
      </div>

      {vue === 'perso' && (
        <VueConseiller
          contrat={contratPerso}
          profile={profile}
          deals={deals}
          month={month}
          isManager={isManager}
        />
      )}

      {vue === 'manager' && isManager && (
        <VueManager
          contrats={contrats}
          deals={deals}
          month={month}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Vue conseiller : son propre suivi
// ─────────────────────────────────────────────────────────────────────────
function VueConseiller({ contrat, profile, deals, month, isManager }) {
  if (!contrat) {
    return (
      <div className="card card-p">
        <div className="empty-title">Aucun contrat trouvé</div>
        <div className="empty-sub" style={{ marginTop: 4 }}>
          {isManager
            ? 'Va dans Pilotage RH pour lier ton profil à un contrat.'
            : 'Demande à ton manager de créer ton contrat dans Pilotage RH.'}
        </div>
      </div>
    )
  }

  // Codes de matching : matricule + full_name + profile.advisor_code.
  // Inclure profile.advisor_code est essentiel — c'est lui qui est
  // stocké dans les deals (deal.advisor_code = 'AUTOP', 'PAULIN', etc.).
  const codesConseiller = useMemo(() => codesContrat(contrat, profile), [contrat, profile])

  // Deals où le conseiller intervient (principal OU co)
  const dealsConseiller = useMemo(
    () => dealsDuConseiller(deals, codesConseiller),
    [deals, codesConseiller]
  )

  const dealsMois = useMemo(
    () => dealsDuMois(dealsConseiller, month),
    [dealsConseiller, month]
  )

  const rentab = useMemo(
    () => evaluerRentabilite(contrat, dealsConseiller, profile),
    [contrat, dealsConseiller, profile]
  )

  const comm = useMemo(
    // On passe rentab complet (avec ecart) pour que commissionsMois puisse
    // calculer le ratio « seule la part au-dessus du seuil est versée ».
    () => commissionsMois(dealsMois, contrat, rentab, profile),
    [dealsMois, contrat, rentab, profile]
  )

  const salaireFixe = Number(contrat.salaire_brut_mensuel || 0)
  const totalBrut = salaireFixe + comm.total
  // Cohérent avec commissionsMois : pas de salaire → pas de palier (le
  // variable se déclenche dès le 1er € puisqu'il n'y a rien à rembourser).
  const aucunSalaire = salaireFixe <= 0
  const palierPp = aucunSalaire ? 0 : Number(contrat.palier_pp_mensuel || 0)
  const palierPu = aucunSalaire ? 0 : Number(contrat.palier_pu_mensuel || 0)
  const pctPalierPp = palierPp > 0 ? Math.min(100, (comm.ppRealisee / palierPp) * 100) : 0
  const pctPalierPu = palierPu > 0 ? Math.min(100, (comm.puRealisee / palierPu) * 100) : 0
  const resteAvantPalierPp = Math.max(0, palierPp - comm.ppRealisee)
  const resteAvantPalierPu = Math.max(0, palierPu - comm.puRealisee)

  // Les mandataires ne sont pas salariés : ils facturent Entasis. Pas de
  // salaire fixe, pas de "brut" (ils touchent le net facturé). On adapte
  // les KPIs en conséquence.
  const isMandataire = contrat.type_contrat === 'MANDATAIRE' || contrat.type_contrat === 'GERANT'

  return (
    <div>
      <div className="kpi-grid mb-24">
        {isMandataire ? (
          <>
            {/* Mandataire : pas de fixe ni de brut — ils facturent Entasis */}
            <div className="kpi-card kpi-card-green">
              <div className="kpi-label">Commissions {month}</div>
              <div className="kpi-value">{fmtEur(comm.total)}</div>
              <div className="kpi-hint">{dealsMois.length} dossier{dealsMois.length !== 1 ? 's' : ''} signé{dealsMois.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="kpi-card kpi-card-blue">
              <div className="kpi-label">À facturer ce mois</div>
              <div className="kpi-value">{fmtEur(comm.total)}</div>
              <div className="kpi-hint">{LIBELLE_TYPE_CONTRAT[contrat.type_contrat]} · facture Entasis (net)</div>
            </div>
          </>
        ) : (
          <>
            <div className="kpi-card kpi-card-gold">
              <div className="kpi-label">Salaire fixe brut</div>
              <div className="kpi-value">{fmtEur(salaireFixe)}</div>
              <div className="kpi-hint">{LIBELLE_TYPE_CONTRAT[contrat.type_contrat]} · garanti</div>
            </div>
            <div className="kpi-card kpi-card-green">
              <div className="kpi-label">Variable {month}</div>
              <div className="kpi-value">{fmtEur(comm.total)}</div>
              <div className="kpi-hint">{dealsMois.length} dossier{dealsMois.length !== 1 ? 's' : ''} signé{dealsMois.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="kpi-card kpi-card-blue">
              <div className="kpi-label">Total brut estimé</div>
              <div className="kpi-value">{fmtEur(totalBrut)}</div>
              <div className="kpi-hint">Fixe + variable du mois</div>
            </div>
          </>
        )}
      </div>

      {/* PHASE 1 — Seuil de déclenchement (tous les produits comptent) */}
      {!rentab.rentabilise && salaireFixe > 0 && (
        <PalierCard
          titre="Seuil de déclenchement du variable"
          realise={rentab.valeurCumulee}
          cible={rentab.brutCumule}
          pct={rentab.brutCumule > 0
            ? Math.min(100, (rentab.valeurCumulee / rentab.brutCumule) * 100)
            : 0}
          reste={Math.max(0, rentab.brutCumule - rentab.valeurCumulee)}
          atteint={false}
          variable={0}
          hint={`Plus que ${fmtEur(Math.max(0, rentab.brutCumule - rentab.valeurCumulee))} avant le déclenchement de ton variable. Tous les produits comptent dans ce seuil : PP, PU, SCPI, UCS, MH, Girardin, PE, Prévoyance, Mutuelle.`}
        />
      )}

      {/* PHASE 2 — pas de palier mensuel : une fois le seuil cumulatif
          passé, toutes les commissions sont versées intégralement à leur
          taux propre. Le détail des deals ci-dessous montre la ventilation
          par produit (PP, PU, SCPI, UCS, MH, Girardin, PE, Prév., Mutuelle). */}

      {/* Frise : tous les deals comptés dans le seuil + leur taux */}
      {salaireFixe > 0 && (
        <FriseSeuilRentabilite
          contrat={contrat}
          dealsConseiller={dealsConseiller}
          rentab={rentab}
          profile={profile}
        />
      )}

      {/* Détail des deals du mois */}
      <SectionDetail comm={comm} month={month} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Carte palier avec barre de progression
// ─────────────────────────────────────────────────────────────────────────
function PalierCard({ titre, realise, cible, pct, reste, atteint, variable, hint }) {
  return (
    <div className="card card-p" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)' }}>{titre}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--t2)' }}>{hint}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.015em', fontVariantNumeric: 'tabular-nums' }}>
            {fmtEur(realise)} <span style={{ color: 'var(--t3)', fontWeight: 500, fontSize: 14 }}>/ {fmtEur(cible)}</span>
          </div>
          {atteint && variable > 0 && (
            <div style={{ fontSize: 12, color: 'var(--signed)', marginTop: 2 }}>
              Variable débloqué : {fmtEur(variable)}
            </div>
          )}
        </div>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: atteint
            ? 'linear-gradient(90deg, var(--signed) 0%, #2A9847 100%)'
            : 'linear-gradient(90deg, var(--gold) 0%, var(--gold-dk, #A6843F) 100%)',
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Frise du seuil de rentabilité : montre la production cumulée depuis
// l'embauche, avec une barre de progression empilée et le détail de
// chaque deal (date, client, valeur cabinet, taux applicable une fois
// rentabilisé). Visible pour les conseillers salariés (pas mandataires).
// ─────────────────────────────────────────────────────────────────────────
function FriseSeuilRentabilite({ contrat, dealsConseiller, rentab, profile }) {
  const codes = useMemo(() => codesContrat(contrat, profile), [contrat, profile])

  // Liste enrichie des deals signés depuis le point de référence du seuil
  // (= max(date_debut contrat, DATE_REMISE_A_ZERO)). On affiche dans
  // l'ordre chronologique pour bien voir l'historique d'accumulation.
  const lignes = useMemo(() => {
    const debutContrat = contrat?.date_debut ? new Date(contrat.date_debut) : null
    const remiseZero = new Date(DATE_REMISE_A_ZERO_RENTABILITE)
    const debut = debutContrat && debutContrat > remiseZero ? debutContrat : remiseZero
    const out = []
    let cumul = 0
    for (const deal of dealsConseiller || []) {
      if (deal.status !== 'Signé' || !deal.date_signed) continue
      const ds = new Date(deal.date_signed)
      if (ds < debut) continue
      const part = partDeal(deal, codes)
      if (!part) continue
      const valeur = valeurCabinetDeal(deal, part)
      if (valeur <= 0) continue
      cumul += valeur
      // Récupère les taux pour info pédagogique : taux mandataire (utilisé
      // pour la valeur cabinet et le seuil) + taux CDI (qui s'appliquera
      // après franchissement du seuil).
      const calcs = commissionsDeal(deal, { ...contrat, rentabilise: false }, part)  // taux mandataire
      const calcsCdi = commissionsDeal(deal, { ...contrat, rentabilise: true }, part)
      out.push({
        deal,
        date: ds,
        client: deal.clients
          ? `${deal.clients.prenom || ''} ${deal.clients.nom || ''}`.trim() || (deal.client_id || '—')
          : (deal.client_id || '—'),
        produit: deal.product || deal.produit || '—',
        compagnie: deal.company || deal.compagnie || '',
        coConseiller: part < 1,
        valeur,
        cumul,
        calcs,        // taux mandataire (= ce qui compte pour le seuil)
        calcsCdi,     // taux CDI (= ce qu'il touchera une fois rentabilisé)
      })
    }
    return out.sort((a, b) => a.date - b.date)
  }, [dealsConseiller, codes, contrat])

  // Si pas de deal du tout, on cache le bloc
  if (lignes.length === 0) return null

  const cible = Number(rentab?.brutCumule || 0)
  const realise = Number(rentab?.valeurCumulee || 0)
  const ecartCible = Math.max(0, cible - realise)

  // Construit les segments de la barre empilée (1 segment par deal)
  const total = Math.max(cible, realise)
  const segments = lignes.map((l) => ({
    pct: total > 0 ? (l.valeur / total) * 100 : 0,
    color: colorForProduit(l.produit),
    l,
  }))

  return (
    <div className="card mb-24" style={{ overflow: 'hidden' }}>
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Détail du seuil de rentabilité
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginTop: 4 }}>
            Production cumulée depuis ton embauche · {lignes.length} dossier{lignes.length !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            Chaque segment = un dossier qui contribue au remboursement du salaire (valeur cabinet, taux mandataire).
          </div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '12px 20px 20px' }}>
        {/* Barre empilée multi-deals */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden',
            background: 'rgba(0,0,0,0.04)', border: '1px solid var(--bd)',
          }}>
            {segments.map((s, i) => (
              <div key={i}
                style={{
                  width: `${s.pct}%`, height: '100%', background: s.color,
                  borderRight: i < segments.length - 1 ? '1px solid rgba(255,255,255,0.6)' : 'none',
                }}
                title={`${s.l.client} · ${s.l.produit} · ${fmtEur(s.l.valeur)} valeur cabinet`}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--t2)' }}>
              <strong style={{ color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(realise)}</strong> de valeur cabinet cumulée
            </span>
            <span style={{ color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
              Objectif : {fmtEur(cible)}{ecartCible > 0 ? ` · reste ${fmtEur(ecartCible)}` : ' · ✅ rentabilisé'}
            </span>
          </div>
        </div>

        {/* Tableau détaillé */}
        <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Date</th>
                <th>Dossier</th>
                <th style={{ textAlign: 'right' }}>Valeur cabinet</th>
                <th style={{ textAlign: 'right' }}>Cumul</th>
                <th style={{ textAlign: 'right' }}>Taux une fois rentabilisé</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => {
                const passe = l.cumul <= cible
                return (
                  <tr key={l.deal.id || i}>
                    <td className="cell-mono" style={{ fontSize: 12 }}>
                      {l.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colorForProduit(l.produit), flexShrink: 0 }} />
                        <span className="cell-primary">{l.client}</span>
                      </div>
                      <div className="cell-sub" style={{ marginLeft: 14 }}>
                        {l.produit}{l.compagnie ? ` · ${l.compagnie}` : ''}
                        {l.coConseiller && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--gold-dk)', fontWeight: 700 }}>50 % co</span>}
                      </div>
                    </td>
                    <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {fmtEur(l.valeur)}
                    </td>
                    <td className="cell-mono" style={{ textAlign: 'right', color: passe ? 'var(--t2)' : 'var(--signed, #2A9847)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtEur(l.cumul)}
                    </td>
                    <td className="cell-mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--t2)' }}>
                      {l.calcsCdi.map((c, j) => (
                        <div key={j}>
                          {c.produitKey === 'pu_versement_libre' && <span style={{ fontSize: 9, fontWeight: 700, padding: '0 4px', borderRadius: 3, background: 'rgba(139,92,246,0.12)', color: '#7C3AED', marginRight: 4 }}>PU</span>}
                          {fmtPct(c.taux)}
                        </div>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Couleur stable par catégorie de produit (cohérent avec FUND_COLORS)
function colorForProduit(produit) {
  const p = (produit || '').toLowerCase()
  if (p.includes('per')) return '#7C3AED'
  if (p.includes('assurance vie') || p === 'av') return '#0EA5E9'
  if (p.includes('scpi')) return '#10B981'
  if (p.includes('ucs') || p.includes('structur')) return '#F59E0B'
  if (p.includes('pe') || p.includes('private')) return '#EC4899'
  if (p.includes('prévoyance') || p.includes('prevoyance')) return '#EF4444'
  if (p.includes('mutuelle') || p.includes('santé')) return '#06B6D4'
  if (p.includes('girardin')) return '#84CC16'
  if (p.includes('monument') || p === 'mh') return '#A6843F'
  return '#86868B'
}

// ─────────────────────────────────────────────────────────────────────────
// Section détail des deals du mois
// ─────────────────────────────────────────────────────────────────────────
function SectionDetail({ comm, month }) {
  if (!comm.detail.length) {
    return (
      <div className="card card-p" style={{ textAlign: 'center', padding: 32 }}>
        <div className="empty-title">Aucun dossier signé ce mois-ci</div>
        <div className="empty-sub" style={{ marginTop: 4 }}>
          Une fois tes dossiers signés en {month}, tu verras le détail ici.
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>Détail des dossiers du mois</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            {comm.detail.length} dossier{comm.detail.length !== 1 ? 's' : ''} · variable brut : {fmtEur(comm.total)}
          </div>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Produit</th>
            <th style={{ textAlign: 'right' }}>Assiette</th>
            <th style={{ textAlign: 'right' }}>Taux</th>
            <th style={{ textAlign: 'right' }}>Commission</th>
            <th>Régime</th>
          </tr>
        </thead>
        <tbody>
          {comm.detail.map((d, i) => {
            const clientName = d.deal.clients
              ? `${d.deal.clients.prenom || ''} ${d.deal.clients.nom || ''}`.trim()
              : (d.deal.client_id || '—')
            // Phase 1 (avant seuil) : aucun variable versé tant que le
            //   seuil mensuel de déclenchement n'est pas franchi.
            // Sous palier : pareil pour les produits soumis au palier.
            const phase1 = d.remboursementSalaire
            const sousPalier = d.sousPalier
            const masqueValeurs = phase1 || sousPalier
            // Suffixe pour distinguer la ligne PU d'un deal qui a aussi
            // une PP (ex : PER Individuel avec versement initial + mensuel).
            const isLignePu = d.produitKey === 'pu_versement_libre'
            const produitLabel = d.deal.product || d.deal.produit || '—'
            return (
              <tr key={`${d.deal.id || i}-${d.produitKey || 'main'}`}>
                <td className="cell-primary">{clientName || '—'}</td>
                <td>
                  <div>
                    {produitLabel}
                    {isLignePu && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.12)', color: '#7C3AED', letterSpacing: '0.04em' }}>
                        PU
                      </span>
                    )}
                  </div>
                  <div className="cell-sub">{d.deal.company || d.deal.compagnie || ''}</div>
                </td>
                <td className="cell-mono" style={{ textAlign: 'right' }}>{fmtEur(d.assiette)}</td>
                <td className="cell-mono" style={{ textAlign: 'right', color: masqueValeurs ? 'var(--t3)' : 'var(--t1)' }}>
                  {masqueValeurs ? '—' : fmtPct(d.taux)}
                </td>
                <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600, color: masqueValeurs ? 'var(--t3)' : 'var(--t1)' }}>
                  {masqueValeurs ? '—' : fmtEurPrecis(d.montantEffectif ?? d.montant)}
                </td>
                <td>
                  {phase1 ? (
                    <span className="badge badge-progress" title="Sous le seuil mensuel de déclenchement du variable">
                      Sous seuil
                    </span>
                  ) : sousPalier ? (
                    <span style={{ color: 'var(--t3)' }}>—</span>
                  ) : d.horsPalier ? (
                    <span className="badge badge-forecast">Hors palier</span>
                  ) : (
                    <span className="badge badge-signed">Au-dessus palier</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Vue manager : tableau équipe
// ─────────────────────────────────────────────────────────────────────────
function VueManager({ contrats, deals, month }) {
  const lignes = useMemo(() => {
    return contrats
      .filter(c => c.actif && c.type_contrat !== 'GERANT')
      .map(c => {
        // Le service liste contrats joint maintenant le profile lié
        // (c.profile = { id, advisor_code, email, full_name }) → on
        // l'utilise pour que codesContrat inclue l'advisor_code, sans
        // quoi le matching deal.advisor_code → contrat échoue côté
        // manager et le tableau affiche 0 € partout.
        const profileLie = c.profile || null
        const codes = codesContrat(c, profileLie)
        const dealsConseiller = dealsDuConseiller(deals, codes)
        const dealsMois = dealsDuMois(dealsConseiller, month)
        const rentab = evaluerRentabilite(c, dealsConseiller, profileLie)
        const comm = commissionsMois(dealsMois, c, rentab, profileLie)
        return {
          contrat: c,
          rentab,
          comm,
          totalBrut: Number(c.salaire_brut_mensuel || 0) + comm.total,
        }
      })
  }, [contrats, deals, month])

  const totals = useMemo(() => {
    return {
      fixe: lignes.reduce((s, l) => s + Number(l.contrat.salaire_brut_mensuel || 0), 0),
      variable: lignes.reduce((s, l) => s + l.comm.total, 0),
      total: lignes.reduce((s, l) => s + l.totalBrut, 0),
    }
  }, [lignes])

  return (
    <div>
      {/* KPIs équipe — 3 cartes (le statut rentabilité reste interne au moteur). */}
      <div className="kpi-grid mb-24">
        <div className="kpi-card kpi-card-gold">
          <div className="kpi-label">Masse fixe brute / mois</div>
          <div className="kpi-value">{fmtEur(totals.fixe)}</div>
          <div className="kpi-hint">{lignes.length} conseiller{lignes.length !== 1 ? 's' : ''} actif{lignes.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="kpi-card kpi-card-green">
          <div className="kpi-label">Variable {month}</div>
          <div className="kpi-value">{fmtEur(totals.variable)}</div>
          <div className="kpi-hint">Commissions du mois</div>
        </div>
        <div className="kpi-card kpi-card-blue">
          <div className="kpi-label">Total brut équipe</div>
          <div className="kpi-value">{fmtEur(totals.total)}</div>
          <div className="kpi-hint">Fixe + variable {month}</div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Conseiller</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Brut fixe</th>
              <th style={{ textAlign: 'right' }}>PP réalisée</th>
              <th>Palier PP</th>
              <th style={{ textAlign: 'right' }}>Variable {month}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
                Aucun conseiller actif. Ajoute des contrats dans Pilotage RH.
              </td></tr>
            ) : lignes.map(l => {
              const palierPp = Number(l.contrat.palier_pp_mensuel || 0)
              const pctPp = palierPp > 0 ? Math.min(100, (l.comm.ppRealisee / palierPp) * 100) : 100
              return (
                <tr key={l.contrat.id}>
                  <td>
                    <div className="cell-primary">{l.contrat.full_name}</div>
                    <div className="cell-sub">{l.contrat.matricule ? `Mat. ${l.contrat.matricule}` : ''}</div>
                  </td>
                  <td>
                    <span className="badge badge-normal">
                      {LIBELLE_TYPE_CONTRAT[l.contrat.type_contrat]}
                    </span>
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{fmtEur(l.contrat.salaire_brut_mensuel)}</td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{fmtEur(l.comm.ppRealisee)}</td>
                  <td>
                    {palierPp > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
                        <div style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.05)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${pctPp}%`,
                            background: l.comm.palierPpAtteint ? 'var(--signed)' : 'var(--gold)',
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right', color: l.comm.palierPpAtteint ? 'var(--signed)' : 'var(--t2)', fontWeight: 600 }}>
                          {pctPp.toFixed(0)}%
                        </span>
                      </div>
                    ) : <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--t1)' }}>{fmtEur(l.comm.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
