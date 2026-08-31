// src/components/AnnuairePartenaires.jsx
// ═══════════════════════════════════════════════════════════════════════════
// ANNUAIRE DES PARTENAIRES — le carnet du cabinet (31/08/2026)
//
// On n ouvre pas cette page pour la lire, on l ouvre pour trouver un numero
// en trois secondes. Elle est donc dense : une ligne par contact, tout
// visible sans derouler, la recherche et les filtres toujours sous la main
// meme quand on descend.
//
// La version en cartes demandait 2,6 ecrans de scroll pour 17 contacts.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES_ANNUAIRE, CONTACTS_ANNUAIRE, initialesContact } from '../config/annuairePartenaires'
import { logoDe } from '../lib/logos-partenaires'
import { correspond } from '../lib/recherche'

const telHref = (t) => `tel:${String(t).replace(/[^+\d]/g, '')}`

// Ecrire ouvre la fenetre de redaction Gmail dans un onglet, jamais mailto :
// le cabinet est sur Google Workspace, un mailto ouvrirait l application
// Mail du poste, que personne n utilise (meme mecanique que mail-immo.js).
const gmailHref = (e) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(e)}`

export default function AnnuairePartenaires({ onOuvrirImmobilier }) {
  const [requete, setRequete] = useState('')
  const [filtre, setFiltre] = useState('tous')
  const champRef = useRef(null)
  const barreRef = useRef(null)
  const sentinelleRef = useRef(null)

  // La barre ne prend son filet et son ombre qu une fois collee en haut :
  // au repos elle doit se fondre dans la page, pas flotter dessus.
  useEffect(() => {
    const sentinelle = sentinelleRef.current
    const barre = barreRef.current
    if (!sentinelle || !barre || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      ([e]) => barre.classList.toggle('collee', !e.isIntersecting),
      { threshold: 1 },
    )
    obs.observe(sentinelle)
    return () => obs.disconnect()
  }, [])

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
      {/* ── Barre de tete : elle colle en haut, on garde la recherche et les
             filtres sous la main meme en bas de liste. ─────────────────── */}
      <div ref={sentinelleRef} className="annu-sentinelle" aria-hidden="true" />
      <div className="annu-barre" ref={barreRef}>
        <div className="annu-barre-in">
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
          {/* Des filtres, pas des onglets : ils n ouvrent aucun panneau. */}
          <div className="annu-chips" role="group" aria-label="Filtrer par métier">
            <ChipFiltre actif={filtre === 'tous'} onClick={() => setFiltre('tous')} label="Tous" n={compteurs.tous} />
            {CATEGORIES_ANNUAIRE.map((cat) => (
              <ChipFiltre key={cat.cle} actif={filtre === cat.cle} onClick={() => setFiltre(filtre === cat.cle ? 'tous' : cat.cle)}
                label={cat.label} n={compteurs[cat.cle] || 0} />
            ))}
          </div>
        </div>
      </div>

      <p className="annu-sr" role="status" aria-live="polite">
        {visibles.length === 0
          ? 'Aucun contact ne correspond'
          : `${visibles.length} contact${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''}`}
      </p>

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
            <section key={cat.cle} className={`annu-groupe annu-teinte-${cat.cle}`}>
              <div className="annu-groupe-head">
                <h2 className="annu-groupe-titre">{cat.label}</h2>
                <span className="annu-groupe-n">{contacts.length}</span>
                <span className="annu-groupe-accroche">{cat.accroche}</span>
                {cat.cle === 'immobilier' && onOuvrirImmobilier && (
                  <button className="annu-renvoi" onClick={onOuvrirImmobilier}
                    title="Aller à la transmission de dossier immobilier">
                    Transmettre un dossier <IcoFleche />
                  </button>
                )}
              </div>
              <div className="annu-liste">
                {contacts.map((c) => <RangContact key={`${c.societe}-${c.nom}`} contact={c} />)}
              </div>
            </section>
          )
        })
      )}
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

// Une ligne = un contact. Identite a gauche, coordonnees a droite, chacune
// avec son bouton de copie : joindre et copier sont deux gestes distincts.
function RangContact({ contact: c }) {
  const [copie, setCopie] = useState(null)

  const copier = async (texte) => {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(texte)
      setTimeout(() => setCopie(null), 1600)
    } catch { /* presse papier indisponible : les liens restent utilisables */ }
  }

  return (
    <article className="annu-rang">
      <Embleme societe={c.societe} nom={c.nom} />

      <span className="annu-rang-id">
        <span className="annu-rang-nom">{c.nom}</span>
        <span className="annu-rang-meta">
          <span className="annu-rang-societe">{c.societe}</span>
          {c.role ? <span className="annu-rang-role"> · {c.role}</span> : null}
        </span>
      </span>

      <span className="annu-rang-coord">
        {c.telephones.map((t) => (
          <Coordonnee key={t} valeur={t} href={telHref(t)} icone={<IcoTel />}
            titre={`Appeler ${c.nom}`} libelleCopie="Copier le numéro"
            copie={copie === t} onCopier={() => copier(t)} />
        ))}
        {c.emails.map((e) => (
          <Coordonnee key={e} valeur={e} href={gmailHref(e)} icone={<IcoMail />} externe large
            titre={`Écrire à ${c.nom} dans Gmail`} libelleCopie="Copier l adresse"
            copie={copie === e} onCopier={() => copier(e)} />
        ))}
        {c.astuce && <span className="annu-astuce" title={c.astuce}><IcoInfo /> {c.astuce}</span>}
      </span>

      <span className="annu-sr" role="status" aria-live="polite">
        {copie ? `${copie} copié dans le presse papier` : ''}
      </span>
    </article>
  )
}

// Le logo de la maison quand le cabinet l a fourni, le monogramme de la
// personne sinon. Purement decoratif : le nom et la societe sont deja ecrits
// juste a cote, un lecteur d ecran n a rien a gagner a l entendre deux fois.
function Embleme({ societe, nom }) {
  const logo = logoDe(societe)
  if (logo) {
    return (
      <span className="annu-avatar annu-avatar-logo" aria-hidden="true">
        <img src={logo} alt="" loading="lazy" />
      </span>
    )
  }
  return <span className="annu-avatar" aria-hidden="true">{initialesContact(nom)}</span>
}

function Coordonnee({ valeur, href, icone, titre, libelleCopie, copie, onCopier, externe, large }) {
  return (
    <span className={`annu-coord${large ? ' large' : ''}`}>
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
  <svg width="12" height="12" viewBox="0 0 24 24" {...svg}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
)
const IcoMail = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" {...svg}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
)
const IcoCopie = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" {...svg}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
)
const IcoOk = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" {...svg} strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>
)
const IcoInfo = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
)
const IcoFleche = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" {...svg} strokeWidth="1.9"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
)
