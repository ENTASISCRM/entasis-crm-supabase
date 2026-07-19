// src/components/Temoignages.jsx
// Bibliotheque de preuves sociales (idee 42), classee par metier et par
// produit. But concret : en rendez vous, sortir en deux clics le temoignage
// d un client du MEME metier que le prospect, et le copier pour le glisser
// dans un mail ou le lire a voix haute.
//
// Chaque temoignage : client (prenom ou initiales), metier, produit, texte,
// resultat. Filtres metier et produit, recherche plein texte, bouton Copier
// sur chaque fiche, formulaire d ajout ouvert a tous les conseillers.
//
// Donnees : temoignages via services/temoignages.js, familles via
// equipment.listFamilies pour le select produit. Charte navy et or.

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { listTemoignages, addTemoignage } from '../services/temoignages'
import { listFamilies } from '../services/equipment'

// Prenom ou initiales : on n affiche jamais un nom complet.
function afficheClient(nom) {
  const n = (nom || '').trim()
  if (!n) return 'Client'
  return n
}

// Bloc pret a coller en rendez vous ou dans un mail.
function texteACopier(t) {
  const lignes = [`« ${(t.texte || '').trim()} »`]
  const sig = [afficheClient(t.client_nom), t.metier].filter(Boolean).join(', ')
  lignes.push(sig + (t.produit ? ` (${t.produit})` : ''))
  if (t.resultat) lignes.push(`Resultat : ${t.resultat}`)
  return lignes.join('\n')
}

const FORM_VIDE = { client_nom: '', metier: '', produit: '', texte: '', resultat: '' }

export default function Temoignages({ profile }) {
  const [items, setItems] = useState([])
  const [families, setFamilies] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [fMetier, setFMetier] = useState('')
  const [fProduit, setFProduit] = useState('')
  const [q, setQ] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [form, setForm] = useState(FORM_VIDE)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const [tem, fam] = await Promise.all([listTemoignages(), listFamilies()])
        if (!vivant) return
        setItems((tem || []).filter((t) => t.visible !== false))
        setFamilies(fam || [])
      } catch (e) {
        if (vivant) setErr(e.message || 'Erreur de chargement')
      } finally {
        if (vivant) setLoading(false)
      }
    })()
    return () => { vivant = false }
  }, [])

  // Metiers presents (pour le filtre), tries.
  const metiers = useMemo(
    () => Array.from(new Set(items.map((t) => (t.metier || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr')),
    [items],
  )
  // Produits presents dans les temoignages, plus les familles de reference.
  const produits = useMemo(() => {
    const s = new Set(items.map((t) => (t.produit || '').trim()).filter(Boolean))
    for (const f of families) if (f.label) s.add(f.label)
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [items, families])

  const liste = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((t) => {
      if (fMetier && (t.metier || '') !== fMetier) return false
      if (fProduit && (t.produit || '') !== fProduit) return false
      if (needle) {
        const hay = `${t.client_nom || ''} ${t.metier || ''} ${t.produit || ''} ${t.texte || ''} ${t.resultat || ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [items, fMetier, fProduit, q])

  function copier(t) {
    navigator.clipboard?.writeText(texteACopier(t))
      .then(() => toast.success('Temoignage copie'))
      .catch(() => toast.error('Copie impossible sur ce navigateur'))
  }

  async function soumettre(e) {
    e.preventDefault()
    if (!form.texte.trim()) { toast.error('Le texte du temoignage est requis'); return }
    if (!form.metier.trim()) { toast.error('Le metier est requis pour classer le temoignage'); return }
    setEnvoi(true)
    try {
      const cree = await addTemoignage({
        client_nom: form.client_nom.trim() || null,
        metier: form.metier.trim(),
        produit: form.produit.trim() || null,
        texte: form.texte.trim(),
        resultat: form.resultat.trim() || null,
        auteur_code: profile?.advisor_code || null,
      })
      setItems((prev) => [cree, ...prev])
      setForm(FORM_VIDE)
      setFormOuvert(false)
      toast.success('Temoignage ajoute a la bibliotheque')
    } catch (e2) {
      toast.error(e2.message || 'Echec de l enregistrement')
    } finally {
      setEnvoi(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="tmo">
      <style>{styles}</style>

      <div className="tm-top">
        <div>
          <h1>Temoignages</h1>
          <div className="tm-sub">la preuve sociale du cabinet, un client du meme metier que ton prospect en deux clics</div>
        </div>
        <button className="tm-add" onClick={() => setFormOuvert((v) => !v)}>
          {formOuvert ? 'Fermer' : '+ Ajouter un temoignage'}
        </button>
      </div>

      {formOuvert && (
        <form className="tm-form" onSubmit={soumettre}>
          <div className="tm-row">
            <label>
              <span>Client (prenom ou initiales)</span>
              <input value={form.client_nom} onChange={set('client_nom')} placeholder="ex. Marc D." />
            </label>
            <label>
              <span>Metier <i>*</i></span>
              <input value={form.metier} onChange={set('metier')} placeholder="ex. Chirurgien dentiste" />
            </label>
            <label>
              <span>Produit</span>
              <select value={form.produit} onChange={set('produit')}>
                <option value="">—</option>
                {families.map((f) => <option key={f.key} value={f.label}>{f.label}</option>)}
              </select>
            </label>
          </div>
          <label className="tm-full">
            <span>Temoignage <i>*</i></span>
            <textarea value={form.texte} onChange={set('texte')} rows={3} placeholder="Ce que le client a dit, a la premiere personne de preference." />
          </label>
          <label className="tm-full">
            <span>Resultat concret</span>
            <input value={form.resultat} onChange={set('resultat')} placeholder="ex. 9 200 € d economie d impot la premiere annee" />
          </label>
          <div className="tm-actions">
            <button type="button" className="tm-sec" onClick={() => { setForm(FORM_VIDE); setFormOuvert(false) }}>Annuler</button>
            <button type="submit" className="tm-pri" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Ajouter'}</button>
          </div>
        </form>
      )}

      <div className="tm-filtres">
        <input className="tm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (client, metier, texte…)" />
        <select value={fMetier} onChange={(e) => setFMetier(e.target.value)}>
          <option value="">Tous les metiers</option>
          {metiers.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={fProduit} onChange={(e) => setFProduit(e.target.value)}>
          <option value="">Tous les produits</option>
          {produits.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {(fMetier || fProduit || q) && (
          <button className="tm-clear" onClick={() => { setFMetier(''); setFProduit(''); setQ('') }}>Reinitialiser</button>
        )}
      </div>

      {loading && <div className="tm-empty">Chargement…</div>}
      {err && <div className="tm-empty err">Erreur : {err}</div>}
      {!loading && !err && liste.length === 0 && (
        <div className="tm-empty">
          {items.length === 0
            ? 'Aucun temoignage pour l instant. Ajoute le premier pour lancer la bibliotheque.'
            : 'Aucun temoignage ne correspond a ces filtres.'}
        </div>
      )}

      {!loading && !err && liste.length > 0 && (
        <>
          <div className="tm-count">{liste.length} temoignage{liste.length > 1 ? 's' : ''}{items.length !== liste.length ? ` sur ${items.length}` : ''}</div>
          <div className="tm-grid">
            {liste.map((t) => (
              <div key={t.id} className="tm-carte">
                <div className="tm-quote">« {t.texte} »</div>
                {t.resultat && <div className="tm-res">✓ {t.resultat}</div>}
                <div className="tm-meta">
                  <div className="tm-cli">
                    <span className="tm-nom">{afficheClient(t.client_nom)}</span>
                    {t.metier && <span className="tm-metier">{t.metier}</span>}
                  </div>
                  <div className="tm-right">
                    {t.produit && <span className="tm-prod">{t.produit}</span>}
                    <button className="tm-copy" onClick={() => copier(t)} title="Copier le temoignage">Copier</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const styles = `
.tmo{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; --navy:#0A1628; --gold:#C9A961; --gold-dk:#A6843F; --vert:#2C6B4E; color:var(--ink); font-size:13px }
.tmo *{ box-sizing:border-box }
.tmo .tm-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px }
.tmo h1{ font-size:22px; font-weight:700; color:var(--navy); margin:0; letter-spacing:-.02em }
.tmo .tm-sub{ color:var(--silver); font-size:12px; margin-top:2px; max-width:520px }
.tmo .tm-add{ background:var(--navy); color:#fff; border:none; border-radius:10px; padding:9px 16px; font-size:12.5px; font-weight:750; cursor:pointer; white-space:nowrap }
.tmo .tm-add:hover{ background:#122543 }

.tmo .tm-form{ background:#fff; border:1px solid rgba(201,169,97,.45); border-radius:14px; padding:14px; margin-bottom:14px; box-shadow:0 6px 22px rgba(201,169,97,.12) }
.tmo .tm-row{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px }
.tmo .tm-form label{ display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:700; color:var(--navy); text-transform:uppercase; letter-spacing:.03em }
.tmo .tm-form label i{ color:#B4453B; font-style:normal }
.tmo .tm-full{ margin-top:10px }
.tmo .tm-form input,.tmo .tm-form select,.tmo .tm-form textarea{ border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:12.5px; font-weight:500; color:var(--ink); background:#fff; text-transform:none; letter-spacing:0; font-family:inherit }
.tmo .tm-form input:focus,.tmo .tm-form select:focus,.tmo .tm-form textarea:focus{ outline:none; border-color:var(--gold) }
.tmo .tm-form textarea{ resize:vertical }
.tmo .tm-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px }
.tmo .tm-pri{ background:var(--navy); color:#fff; border:none; border-radius:9px; padding:8px 18px; font-size:12.5px; font-weight:750; cursor:pointer }
.tmo .tm-pri:disabled{ opacity:.5; cursor:default }
.tmo .tm-sec{ background:#fff; color:#5b6470; border:1px solid var(--line); border-radius:9px; padding:8px 14px; font-size:12.5px; font-weight:650; cursor:pointer }

.tmo .tm-filtres{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; align-items:center }
.tmo .tm-filtres input,.tmo .tm-filtres select{ border:1px solid var(--line); border-radius:9px; padding:7px 10px; font-size:12.5px; background:#fff; color:var(--ink) }
.tmo .tm-search{ flex:1; min-width:200px }
.tmo .tm-filtres input:focus,.tmo .tm-filtres select:focus{ outline:none; border-color:var(--gold) }
.tmo .tm-clear{ background:none; border:none; color:var(--gold-dk); font-weight:700; font-size:12px; cursor:pointer; text-decoration:underline }

.tmo .tm-count{ font-size:11px; color:var(--silver); font-weight:600; margin-bottom:8px }
.tmo .tm-empty{ padding:26px; text-align:center; color:var(--silver) }
.tmo .tm-empty.err{ color:#B4453B }

.tmo .tm-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:12px }
.tmo .tm-carte{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px 15px; display:flex; flex-direction:column; box-shadow:0 1px 2px rgba(10,22,40,.04) }
.tmo .tm-quote{ font-size:13.5px; line-height:1.5; color:var(--ink); font-style:italic }
.tmo .tm-res{ margin-top:10px; font-size:12px; font-weight:700; color:var(--vert); background:#E9F4EE; border:1px solid #CBE5D6; border-radius:9px; padding:6px 10px }
.tmo .tm-meta{ display:flex; align-items:flex-end; justify-content:space-between; gap:10px; margin-top:12px; padding-top:11px; border-top:1px solid #F4F2ED }
.tmo .tm-cli{ min-width:0 }
.tmo .tm-nom{ display:block; font-weight:750; color:var(--navy); font-size:13px }
.tmo .tm-metier{ display:block; font-size:11px; color:var(--silver); font-weight:600 }
.tmo .tm-right{ display:flex; align-items:center; gap:8px; flex-shrink:0 }
.tmo .tm-prod{ font-size:10px; font-weight:800; color:var(--gold-dk); border:1.5px solid var(--gold); border-radius:999px; padding:2px 9px; white-space:nowrap }
.tmo .tm-copy{ background:#fff; color:var(--navy); border:1px solid var(--line); border-radius:8px; padding:6px 12px; font-size:12px; font-weight:700; cursor:pointer }
.tmo .tm-copy:hover{ border-color:var(--gold); color:var(--gold-dk) }

@media(max-width:560px){
  .tmo .tm-row{ grid-template-columns:1fr }
}
`
