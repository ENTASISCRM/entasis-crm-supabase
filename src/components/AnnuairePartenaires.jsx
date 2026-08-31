// src/components/AnnuairePartenaires.jsx
// ═══════════════════════════════════════════════════════════════════════════
// ANNUAIRE DES PARTENAIRES — le carnet du cabinet (31/08/2026)
//
// Tous les contacts utiles a un dossier client, au meme endroit, pour toute
// l equipe : referents immobilier, notaire, assureurs, maisons de gestion,
// avocat et expert comptable. Source : config/annuairePartenaires.js.
//
// Trois gestes et rien d autre : appeler, copier le numero, ecrire.
// La recherche est la meme que partout dans le CRM (accents ignores, ordre
// des mots libre, tolerance a une lettre) et les puces filtrent par metier.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useRef, useState } from 'react'
import { CATEGORIES_ANNUAIRE, CONTACTS_ANNUAIRE, initialesContact } from '../config/annuairePartenaires'
import { correspond } from '../lib/recherche'

const telHref = (t) => `tel:${String(t).replace(/[^+\d]/g, '')}`

// Ecrire ouvre la fenetre de redaction Gmail dans un onglet, jamais mailto :
// le cabinet est sur Google Workspace, un mailto ouvrirait l application Mail
// du poste, que personne n utilise. Meme mecanique que la transmission de
// dossier immobilier (lib/mail-immo.js).
const gmailHref = (e) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(e)}`

export default function AnnuairePartenaires({ onOuvrirImmobilier }) {
  const [requete, setRequete] = useState('')
  const [filtre, setFiltre] = useState('tous')
  const champRef = useRef(null)

  const visibles = useMemo(() => {
    const q = requete.trim()
    return CONTACTS_ANNUAIRE.filter((c) => {
      if (filtre !== 'tous' && c.categorie !== filtre) return false
      if (!q) return true
      return correspond([c.nom, c.societe, c.role || ''].join(' '), q)
    })
  }, [requete, filtre])

  const parCategorie = useMemo(() => {
    const m = new Map()
    for (const c of visibles) {
      if (!m.has(c.categorie)) m.set(c.categorie, [])
      m.get(c.categorie).push(c)
    }
    return m
  }, [visibles])

  const compteurs = useMemo(() => {
    const m = { tous: CONTACTS_ANNUAIRE.length }
    for (const c of CONTACTS_ANNUAIRE) m[c.categorie] = (m[c.categorie] || 0) + 1
    return m
  }, [])

  return (
    <div className="annu">
      {/* ── Bandeau ─────────────────────────────────────────────────────── */}
      <header className="immo2-hero">
        <div className="immo2-hero-glow" aria-hidden="true" />
        <div className="immo2-hero-in">
          <span className="immo2-hero-kicker">Partenaires</span>
          <h1 className="immo2-hero-title">Le carnet du cabinet.</h1>
          <p className="immo2-hero-sub">
            Tous les contacts utiles à un dossier, au même endroit et à jour pour toute
            l’équipe : référents immobilier, notaire, assureurs, maisons d’investissement,
            avocat et expert comptable. Appelez, copiez, écrivez : un clic.
          </p>
        </div>
      </header>

      {/* ── Recherche + filtres ─────────────────────────────────────────── */}
      <div className="annu-controls">
        <div className="annu-search" onClick={() => champRef.current?.focus()}>
          <IcoLoupe />
          <input
            ref={champRef}
            className="annu-search-input"
            value={requete}
            onChange={(e) => setRequete(e.target.value)}
            placeholder="Chercher un nom, une société, une spécialité…"
            aria-label="Chercher un contact partenaire"
          />
          {requete && (
            <button className="annu-search-clear" onClick={() => setRequete('')} aria-label="Effacer la recherche">×</button>
          )}
        </div>
        {/* Des filtres, pas des onglets : ils n ouvrent aucun panneau, ils
            restreignent la meme liste. aria-pressed dit l etat sans mentir
            sur la nature du controle. */}
        <div className="annu-chips" role="group" aria-label="Filtrer par métier">
          <ChipFiltre actif={filtre === 'tous'} onClick={() => setFiltre('tous')} label="Tous" n={compteurs.tous} />
          {CATEGORIES_ANNUAIRE.map((cat) => (
            <ChipFiltre key={cat.cle} actif={filtre === cat.cle} onClick={() => setFiltre(filtre === cat.cle ? 'tous' : cat.cle)}
              label={cat.label} n={compteurs[cat.cle] || 0} />
          ))}
        </div>
      </div>

      {/* Ce que l ecran montre deja, dit a voix haute pour qui ne le voit pas. */}
      <p className="annu-sr" role="status" aria-live="polite">
        {visibles.length === 0
          ? 'Aucun contact ne correspond'
          : `${visibles.length} contact${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''}`}
      </p>

      {/* ── Sections par métier ─────────────────────────────────────────── */}
      {visibles.length === 0 ? (
        <div className="annu-vide">
          <p className="annu-vide-t">Aucun contact ne correspond à « {requete.trim()} »</p>
          <p className="annu-vide-s">Essayez le nom de la société ou une spécialité (SCPI, santé, notaire…).</p>
        </div>
      ) : (
        CATEGORIES_ANNUAIRE.map((cat) => {
          const contacts = parCategorie.get(cat.cle)
          if (!contacts || contacts.length === 0) return null
          return (
            <section key={cat.cle} className={`annu-section annu-${cat.cle}`}>
              <div className="annu-section-head">
                <div>
                  <h2 className="annu-section-titre">{cat.label}</h2>
                  <p className="annu-section-accroche">{cat.accroche}</p>
                </div>
                <span className="annu-section-n">{contacts.length}</span>
              </div>
              <div className="annu-grille">
                {contacts.map((c) => (
                  <CarteContact key={`${c.societe}-${c.nom}`} contact={c} onOuvrirImmobilier={onOuvrirImmobilier} />
                ))}
              </div>
            </section>
          )
        })
      )}

      <p className="annu-maj">
        Un contact manque ou a changé ? Dites-le, la mise à jour est visible par tout le
        cabinet en quelques minutes.
      </p>
    </div>
  )
}

function ChipFiltre({ actif, onClick, label, n }) {
  return (
    <button type="button" aria-pressed={actif} className={`annu-chip${actif ? ' on' : ''}`} onClick={onClick}>
      {label} <em aria-hidden="true">{n}</em>
      <span className="annu-sr">{` ${n} contact${n > 1 ? 's' : ''}`}</span>
    </button>
  )
}

// Une carte = une personne (ou un service) et ses trois gestes.
function CarteContact({ contact: c, onOuvrirImmobilier }) {
  const [copie, setCopie] = useState(null)

  const copier = async (texte) => {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(texte)
      setTimeout(() => setCopie(null), 1600)
    } catch { /* clipboard indisponible : le lien tel reste utilisable */ }
  }

  return (
    <article className={`annu-carte annu-teinte-${c.categorie}`}>
      <div className="annu-carte-haut">
        <div className="annu-avatar" aria-hidden="true">{initialesContact(c.nom)}</div>
        <div className="annu-id">
          <span className="annu-societe">{c.societe}</span>
          <h3 className="annu-nom">{c.nom}</h3>
        </div>
      </div>

      {c.role && <p className="annu-role">{c.role}</p>}
      {c.astuce && <p className="annu-astuce"><IcoInfo /> {c.astuce}</p>}

      {/* Telephone et email obeissent a la meme regle : un clic pour agir,
          un bouton pour copier. Copier sert autant que joindre, on colle
          l adresse dans un dossier, un message, un formulaire. */}
      <div className="annu-actions">
        {c.telephones.map((t) => (
          <LigneContact key={t} valeur={t} href={telHref(t)} icone={<IcoTel />}
            titre={`Appeler ${c.nom}`} libelleCopie="Copier le numéro"
            copie={copie === t} onCopier={() => copier(t)} />
        ))}
        {c.emails.map((e) => (
          <LigneContact key={e} valeur={e} href={gmailHref(e)} icone={<IcoMail />} externe
            titre={`Écrire à ${c.nom} dans Gmail`} libelleCopie="Copier l adresse"
            copie={copie === e} onCopier={() => copier(e)} />
        ))}
      </div>

      <span className="annu-sr" role="status" aria-live="polite">
        {copie ? `${copie} copié dans le presse papier` : ''}
      </span>

      {c.referentImmo && onOuvrirImmobilier && (
        <button className="annu-renvoi" onClick={onOuvrirImmobilier}
          title="Transmettre un dossier depuis l onglet Immobilier">
          Transmettre un dossier <IcoFleche />
        </button>
      )}
    </article>
  )
}

// Une coordonnee : le lien qui agit, le bouton qui copie. Un email est plus
// long qu un numero, il est tronque a l affichage mais copie en entier.
function LigneContact({ valeur, href, icone, titre, libelleCopie, copie, onCopier, externe }) {
  return (
    <span className="annu-ligne">
      <a className="annu-lien" href={href} title={titre}
        {...(externe ? { target: '_blank', rel: 'noreferrer' } : {})}>
        {icone} <span className="annu-lien-val">{valeur}</span>
      </a>
      <button className="annu-copie" onClick={onCopier}
        title={libelleCopie} aria-label={`${libelleCopie} ${valeur}`}>
        {copie ? <IcoOk /> : <IcoCopie />}
      </button>
    </span>
  )
}

/* ─── Pictogrammes, trait fin, cohérents avec le reste du CRM ───────────── */
const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
const IcoLoupe = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...svg}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
)
const IcoTel = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" {...svg}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
)
const IcoMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" {...svg}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
)
const IcoCopie = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" {...svg}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
)
const IcoOk = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" {...svg} strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>
)
const IcoInfo = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
)
const IcoFleche = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" {...svg} strokeWidth="1.9"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
)
