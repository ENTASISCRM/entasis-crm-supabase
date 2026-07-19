// src/components/CertificationsProduit.jsx
// Certifications produit (idee 93) : une grille conseillers en lignes, familles
// de produits en colonnes. Une pastille verte quand le conseiller est certifie
// sur la famille, grise sinon. Le manager coche ou decoche d un clic (upsert
// ou delete dans certifications_produit). Tout le monde peut lire la grille :
// elle sert au routage, savoir qui est habilite a vendre quoi.
//
// Regle affichee : un conseiller ne devrait vendre que les produits qu il
// maitrise. Un compteur de couverture donne l etat global.
//
// Donnees : product_families (colonnes) via equipment.listFamilies,
// profiles.listTeam (lignes, conseillers actifs), certifications.listCertifications.
// Charte navy et or, aligne sur MultiEquipement et Conformite.

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { listFamilies } from '../services/equipment'
import { listTeam } from '../services/profiles'
import { listCertifications, certifier, decertifier } from '../services/certifications'

export default function CertificationsProduit({ profile }) {
  const isManager = profile?.role === 'manager'
  const [families, setFamilies] = useState([])
  const [conseillers, setConseillers] = useState([])
  const [certs, setCerts] = useState(new Set()) // cle advisor_code|famille
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null) // cellule en cours d ecriture

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const [fam, team, cert] = await Promise.all([
          listFamilies(), listTeam(), listCertifications(),
        ])
        if (!vivant) return
        // On exclut la famille fourre tout Autre : elle n est pas un domaine
        // de certification.
        setFamilies(fam.filter((f) => f.key !== 'autre'))
        // Conseillers actifs (les vendeurs), tries par nom.
        setConseillers(
          (team || [])
            .filter((p) => p.is_active && p.role === 'advisor' && p.advisor_code)
            .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'fr')),
        )
        setCerts(new Set((cert || []).map((c) => `${c.advisor_code}|${c.famille}`)))
      } catch (e) {
        if (vivant) setErr(e.message || 'Erreur de chargement')
      } finally {
        if (vivant) setLoading(false)
      }
    })()
    return () => { vivant = false }
  }, [])

  const cle = (code, fam) => `${code}|${fam}`

  async function toggle(code, fam) {
    if (!isManager) return
    const k = cle(code, fam)
    if (busy) return
    const etait = certs.has(k)
    // Optimiste : on bascule tout de suite, on rembobine si l ecriture echoue.
    const next = new Set(certs)
    if (etait) next.delete(k); else next.add(k)
    setCerts(next)
    setBusy(k)
    try {
      if (etait) {
        await decertifier({ advisor_code: code, famille: fam })
      } else {
        await certifier({ advisor_code: code, famille: fam, valide_par: profile?.full_name || profile?.advisor_code || null })
      }
    } catch (e) {
      const revert = new Set(next)
      if (etait) revert.add(k); else revert.delete(k)
      setCerts(revert)
      toast.error(e.message || 'Ecriture refusee (reserve aux managers)')
    } finally {
      setBusy(null)
    }
  }

  // Compteurs de couverture.
  const stats = useMemo(() => {
    const total = conseillers.length * families.length
    const remplies = certs.size
    const parFamille = Object.fromEntries(families.map((f) => [f.key, 0]))
    const parConseiller = Object.fromEntries(conseillers.map((c) => [c.advisor_code, 0]))
    for (const k of certs) {
      const [code, fam] = k.split('|')
      if (fam in parFamille && code in parConseiller) {
        parFamille[fam] += 1
        parConseiller[code] += 1
      }
    }
    return { total, remplies, couverture: total ? Math.round((100 * remplies) / total) : 0, parFamille, parConseiller }
  }, [certs, conseillers, families])

  return (
    <div className="crt">
      <style>{styles}</style>

      <div className="cr-top">
        <div>
          <h1>Certifications produit</h1>
          <div className="cr-sub">qui est habilite a vendre quoi, pour router les leads au bon conseiller</div>
        </div>
        {!loading && !err && (
          <div className="cr-couv">
            <div className="cvv">{stats.couverture} %</div>
            <div className="cvl">de couverture · {stats.remplies}/{stats.total} habilitations</div>
          </div>
        )}
      </div>

      <div className="cr-note">
        <b>Un conseiller ne devrait vendre que les produits qu il maitrise.</b>{' '}
        {isManager
          ? 'Cliquez une pastille pour certifier ou retirer une habilitation.'
          : 'Seul un manager peut modifier les habilitations.'}
      </div>

      {loading && <div className="cr-empty">Chargement…</div>}
      {err && <div className="cr-empty err">Erreur : {err}</div>}
      {!loading && !err && (conseillers.length === 0 || families.length === 0) && (
        <div className="cr-empty">Aucun conseiller actif ou aucune famille de produit.</div>
      )}

      {!loading && !err && conseillers.length > 0 && families.length > 0 && (
        <div className="cr-scroll">
          <table className="cr-tab">
            <thead>
              <tr>
                <th className="cr-corner">Conseiller</th>
                {families.map((f) => (
                  <th key={f.key} className="cr-fam">
                    <span className="cr-dot" style={{ background: f.couleur || '#8A95A8' }} />
                    <span className="cr-flab">{f.label}</span>
                  </th>
                ))}
                <th className="cr-tot">Maitrise</th>
              </tr>
            </thead>
            <tbody>
              {conseillers.map((c) => (
                <tr key={c.advisor_code}>
                  <td className="cr-nom">
                    <span className="cr-cnom">{c.full_name || c.advisor_code}</span>
                    <span className="cr-ccode">{c.advisor_code}</span>
                  </td>
                  {families.map((f) => {
                    const on = certs.has(cle(c.advisor_code, f.key))
                    const k = cle(c.advisor_code, f.key)
                    return (
                      <td key={f.key} className="cr-cell">
                        <button
                          className={`cr-pastille${on ? ' on' : ''}${isManager ? ' clic' : ''}${busy === k ? ' busy' : ''}`}
                          onClick={() => toggle(c.advisor_code, f.key)}
                          disabled={!isManager || !!busy}
                          title={isManager
                            ? `${c.full_name || c.advisor_code} · ${f.label} : ${on ? 'certifie, cliquer pour retirer' : 'non certifie, cliquer pour certifier'}`
                            : `${on ? 'Certifie' : 'Non certifie'} · ${f.label}`}
                          aria-label={`${c.full_name || c.advisor_code} ${f.label} ${on ? 'certifie' : 'non certifie'}`}
                        >
                          {on ? '✓' : ''}
                        </button>
                      </td>
                    )
                  })}
                  <td className="cr-rowtot">{stats.parConseiller[c.advisor_code] || 0}/{families.length}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="cr-nom foot">Certifies</td>
                {families.map((f) => (
                  <td key={f.key} className="cr-coltot">{stats.parFamille[f.key] || 0}/{conseillers.length}</td>
                ))}
                <td className="cr-rowtot foot" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

const styles = `
.crt{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; --navy:#0A1628; --gold:#C9A961; --gold-dk:#A6843F; --vert:#2C6B4E; color:var(--ink); font-size:13px }
.crt *{ box-sizing:border-box }
.crt .cr-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:10px }
.crt h1{ font-size:22px; font-weight:700; color:var(--navy); margin:0; letter-spacing:-.02em }
.crt .cr-sub{ color:var(--silver); font-size:12px; margin-top:2px }
.crt .cr-couv{ background:var(--navy); border-radius:12px; padding:10px 16px; color:#fff; text-align:right }
.crt .cvv{ font-size:20px; font-weight:800; color:var(--gold); letter-spacing:-.02em; font-variant-numeric:tabular-nums; line-height:1.05 }
.crt .cvl{ font-size:10.5px; font-weight:600; opacity:.8; margin-top:2px }
.crt .cr-note{ background:#FBF6EC; border:1px solid rgba(201,169,97,.4); border-radius:10px; padding:8px 12px; font-size:12px; color:#6b5620; margin-bottom:12px; line-height:1.45 }
.crt .cr-note b{ color:var(--gold-dk) }
.crt .cr-empty{ padding:26px; text-align:center; color:var(--silver) }
.crt .cr-empty.err{ color:#B4453B }

.crt .cr-scroll{ overflow-x:auto; border:1px solid var(--line); border-radius:14px; background:#fff }
.crt .cr-tab{ width:100%; border-collapse:collapse; min-width:640px }
.crt .cr-tab th,.crt .cr-tab td{ border-bottom:1px solid #F4F2ED }
.crt thead th{ background:#FCFBF9; padding:9px 6px; vertical-align:bottom; text-align:center }
.crt .cr-corner{ text-align:left; padding-left:14px; font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:var(--silver); font-weight:750; position:sticky; left:0; background:#FCFBF9; z-index:2; min-width:150px }
.crt .cr-fam{ min-width:66px }
.crt .cr-dot{ display:block; width:9px; height:9px; border-radius:50%; margin:0 auto 5px }
.crt .cr-flab{ display:block; font-size:9.5px; font-weight:700; color:#5b6470; line-height:1.2 }
.crt .cr-tot{ font-size:9.5px; text-transform:uppercase; letter-spacing:.03em; color:var(--silver); font-weight:750; min-width:64px }

.crt tbody tr:hover td{ background:#FCFBF6 }
.crt .cr-nom{ text-align:left; padding:8px 6px 8px 14px; position:sticky; left:0; background:#fff; z-index:1 }
.crt tbody tr:hover .cr-nom{ background:#FCFBF6 }
.crt .cr-cnom{ display:block; font-weight:700; color:var(--navy); font-size:12.5px; white-space:nowrap }
.crt .cr-ccode{ display:block; font-size:9.5px; color:var(--silver); font-weight:600 }
.crt .cr-cell{ text-align:center; padding:6px 4px }
.crt .cr-pastille{ width:26px; height:26px; border-radius:50%; border:1.5px solid #DDDAD2; background:#F1EFEA; color:#fff; font-size:13px; font-weight:800; line-height:1; display:inline-flex; align-items:center; justify-content:center; cursor:default; transition:transform .08s, background .12s }
.crt .cr-pastille.on{ background:var(--vert); border-color:var(--vert) }
.crt .cr-pastille.clic{ cursor:pointer }
.crt .cr-pastille.clic:hover{ transform:scale(1.12); border-color:var(--gold) }
.crt .cr-pastille.on.clic:hover{ border-color:var(--vert) }
.crt .cr-pastille.busy{ opacity:.5 }
.crt .cr-rowtot{ text-align:center; font-size:11px; font-weight:750; color:var(--navy); font-variant-numeric:tabular-nums; white-space:nowrap }

.crt tfoot td{ background:#FBFAF7 }
.crt .cr-nom.foot{ font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:var(--silver); font-weight:750 }
.crt .cr-coltot{ text-align:center; font-size:11px; font-weight:750; color:var(--gold-dk); font-variant-numeric:tabular-nums }
`
