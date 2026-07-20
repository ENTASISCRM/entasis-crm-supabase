// src/components/EditorialHub.jsx
// Onglet « Éditorial » (manager uniquement — double barrière : l'onglet est
// masqué aux advisors dans App.jsx ET le RLS de editorial_packages est
// manager-only). File des packages générés par l'agent éditorial : liste
// filtrable, détail avec article rendu, dérivés LinkedIn/X copiables, actions
// publier/rejeter via POST /api/editorial/moderate (session Supabase).
// Lecture des données en direct via le client Supabase (RLS).

import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

const SITE_JOURNAL = 'https://www.entasis-conseil.fr/journal'

const THEME_META = {
  'per-retraite':       { label: 'PER & Retraite',        color: '#4F6BED' },
  'assurance-vie':      { label: 'Assurance vie',         color: '#0E8074' },
  immobilier:           { label: 'Immobilier',            color: '#B4540A' },
  fiscalite:            { label: 'Fiscalité',             color: '#7C3AED' },
  'gestion-patrimoine': { label: 'Gestion de patrimoine', color: '#A6843F' },
  'protection-sociale': { label: 'Protection sociale',    color: '#0369A1' },
}

const STATUT_META = {
  genere:          { label: 'Généré',           color: 'var(--gold-dk)',   bg: 'var(--gold-subtle)',   bd: 'var(--gold-line)' },
  en_attente_veto: { label: 'En attente veto',  color: 'var(--progress)',  bg: 'var(--progress-bg)',   bd: 'var(--progress-bd)' },
  publie:          { label: 'Publié',           color: 'var(--signed)',    bg: 'var(--signed-bg)',     bd: 'var(--signed-bd)' },
  rejete:          { label: 'Rejeté',           color: 'var(--cancelled)', bg: 'var(--cancelled-bg)',  bd: 'var(--cancelled-bd)' },
}

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

// « publication auto dans 18h » / « dans 45 min » / « imminente »
function countdown(deadlineIso) {
  const ms = new Date(deadlineIso).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  if (ms <= 0) return 'publication auto imminente (deadline dépassée)'
  const h = Math.floor(ms / 3600000)
  if (h >= 1) return `publication auto dans ${h}h${h < 10 ? String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0') : ''}`
  return `publication auto dans ${Math.max(1, Math.floor(ms / 60000))} min`
}

function copy(text, label = 'Copié dans le presse-papier') {
  navigator.clipboard.writeText(text).then(
    () => toast.success(label),
    () => toast.error('Copie impossible')
  )
}

function Badge({ label, color, bg, bd }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
      color, background: bg || `${color}14`, border: `1px solid ${bd || `${color}45`}`, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      border: active ? '1px solid var(--navy)' : '1px solid var(--line, rgba(60,60,67,0.14))',
      background: active ? 'var(--navy)' : 'var(--card)', color: active ? '#fff' : 'var(--t2, #3A3A3C)',
    }}>{children}</button>
  )
}

function CopyBtn({ text, label = 'Copier', toastLabel }) {
  return (
    <button className="btn btn-outline btn-sm" style={{ fontSize: 12, padding: '5px 12px' }}
      onClick={() => copy(text, toastLabel)}>
      {label}
    </button>
  )
}

/* ── Vue liste ─────────────────────────────────────────────────────────── */

function PackageRow({ pkg, onOpen }) {
  const theme = THEME_META[pkg.theme] || { label: pkg.theme, color: 'var(--t3)' }
  const statut = STATUT_META[pkg.statut] || { label: pkg.statut, color: 'var(--t3)' }
  const titre = pkg.article_frontmatter?.title || pkg.sujet

  return (
    <div onClick={() => onOpen(pkg.id)} style={{
      background: 'var(--card)', border: '1px solid var(--line, rgba(60,60,67,0.12))',
      borderRadius: 'var(--rad-lg)', padding: '14px 18px', marginBottom: 10, cursor: 'pointer',
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titre}
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>
          Généré le {fmtDate(pkg.created_at)}
          {pkg.statut === 'en_attente_veto' && pkg.veto_deadline && (
            <span style={{ color: 'var(--progress)', fontWeight: 600 }}> · {countdown(pkg.veto_deadline)}</span>
          )}
          {pkg.statut === 'publie' && (
            <>
              {' · '}publié le {fmtDate(pkg.published_at)}{' · '}
              <a href={`${SITE_JOURNAL}/${pkg.article_slug}`} target="_blank" rel="noopener noreferrer"
                 onClick={(e) => e.stopPropagation()} style={{ color: 'var(--gold-dk)' }}>
                voir l'article ↗
              </a>
            </>
          )}
        </div>
      </div>
      <Badge label={theme.label} color={theme.color} />
      <Badge {...statut} />
    </div>
  )
}

/* ── Vue détail ────────────────────────────────────────────────────────── */

function ConfirmRejectModal({ titre, onConfirm, onCancel, busy }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onCancel}>
      <div style={{ background: 'var(--card)', borderRadius: 'var(--rad-lg)', padding: '26px 30px', maxWidth: 440, margin: 16 }}
           onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>Rejeter cet article ?</div>
        <p style={{ fontSize: 13, color: 'var(--t2, #3A3A3C)', lineHeight: 1.5, margin: '0 0 6px' }}>
          « {titre} » sera définitivement écarté de la publication. Cette action est <strong>irréversible</strong> —
          le sujet restera dans la liste anti-répétition de l'agent.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>Annuler</button>
          <button onClick={onConfirm} disabled={busy} style={{
            background: 'var(--cancelled)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1,
          }}>{busy ? 'Rejet…' : 'Rejeter définitivement'}</button>
        </div>
      </div>
    </div>
  )
}

function PackageDetail({ pkg, onBack, onModerated }) {
  const [showRaw, setShowRaw] = useState(false)
  const [rejectModal, setRejectModal] = useState(false)
  const [busy, setBusy] = useState(false)

  const fm = pkg.article_frontmatter || {}
  const theme = THEME_META[pkg.theme] || { label: pkg.theme, color: 'var(--t3)' }
  const statut = STATUT_META[pkg.statut] || { label: pkg.statut, color: 'var(--t3)' }
  const articleHtml = useMemo(() => marked.parse(pkg.article_md || '', { async: false }), [pkg.article_md])
  const tweets = Array.isArray(pkg.thread_x) ? pkg.thread_x : []
  const sources = Array.isArray(pkg.sources) ? pkg.sources : []
  // Formats 360° — absents sur les packages antérieurs à la migration : tolérer.
  const slides = Array.isArray(pkg.carrousel_insta) ? pkg.carrousel_insta : []
  const video = pkg.script_video && typeof pkg.script_video === 'object' && !Array.isArray(pkg.script_video) ? pkg.script_video : {}
  const videoSequences = Array.isArray(video.sequences) ? video.sequences : []
  const hasVideo = !!(video.hook && videoSequences.length)
  const slideText = (s) => `${s.titre}\n\n${s.texte}`
  const videoText = hasVideo
    ? [`HOOK : ${video.hook}`, '',
       ...videoSequences.map((s, i) => `SÉQUENCE ${i + 1} [${s.plan || 'plan libre'}]\nOral : ${s.texte_oral}\nÉcran : ${s.texte_ecran || '—'}`),
       '', `CTA : ${video.cta || '—'}`, `Durée cible : ${video.duree_cible_sec || '—'} s`].join('\n')
    : ''

  async function moderate(action) {
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/editorial/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ id: pkg.id, action }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body.statut) {
        toast(`Déjà traité entre-temps (statut : ${STATUT_META[body.statut]?.label || body.statut})`, { icon: 'ℹ️' })
      } else if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`)
      } else if (action === 'publish') {
        toast.success('Article publié — le déploiement du site est en cours (quelques minutes).')
      } else {
        toast.success('Article rejeté.')
      }
      setRejectModal(false)
      await onModerated()
    } catch (err) {
      toast.error(`Échec : ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <style>{`
        .edito-md { font-size: 14px; line-height: 1.65; color: var(--t1); }
        .edito-md h2 { font-size: 17px; margin: 22px 0 8px; }
        .edito-md h3 { font-size: 14.5px; margin: 16px 0 6px; }
        .edito-md p, .edito-md li { margin: 7px 0; }
        .edito-md blockquote { border-left: 3px solid var(--gold-line); margin: 10px 0; padding: 4px 14px; background: var(--gold-subtle); border-radius: 0 8px 8px 0; }
        .edito-md table { border-collapse: collapse; font-size: 13px; margin: 10px 0; }
        .edito-md th, .edito-md td { border: 1px solid rgba(60,60,67,0.16); padding: 6px 10px; text-align: left; }
        .edito-md a { color: var(--gold-dk); }
        .edito-md hr { border: none; border-top: 1px solid rgba(60,60,67,0.12); margin: 18px 0; }
      `}</style>

      <button className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Retour à la liste</button>

      {/* En-tête + actions */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--line, rgba(60,60,67,0.12))', borderRadius: 'var(--rad-lg)', padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <Badge label={theme.label} color={theme.color} />
          <Badge {...statut} />
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>{fm.title || pkg.sujet}</div>
        <div style={{ fontSize: 13, color: 'var(--t2, #3A3A3C)', fontStyle: 'italic', marginBottom: 10 }}>{fm.description}</div>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>
          {fm.category} · {fm.author} · {fm.readingTime} · slug <code>{pkg.article_slug}</code> · généré le {fmtDate(pkg.created_at)}
        </div>

        {pkg.statut === 'en_attente_veto' && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--progress-bg)', border: '1px solid var(--progress-bd)', borderRadius: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--progress)', marginBottom: 10 }}>
              {countdown(pkg.veto_deadline)} — deadline : {fmtDate(pkg.veto_deadline)}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => moderate('publish')} disabled={busy} style={{
                background: 'var(--signed)', color: '#fff', border: 'none', borderRadius: 8,
                padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1,
              }}>{busy ? '…' : 'Publier maintenant'}</button>
              <button onClick={() => setRejectModal(true)} disabled={busy} style={{
                background: 'var(--card)', color: 'var(--cancelled)', border: '1px solid var(--cancelled-bd)',
                borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Rejeter</button>
            </div>
          </div>
        )}
        {pkg.statut === 'publie' && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <a href={`${SITE_JOURNAL}/${pkg.article_slug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--signed)', fontWeight: 600 }}>
              Voir l'article en ligne ↗
            </a>
            <span style={{ color: 'var(--t3)' }}> · publié le {fmtDate(pkg.published_at)} · commit <code>{(pkg.commit_sha || '').slice(0, 10) || 'n/a'}</code></span>
          </div>
        )}
        {pkg.statut === 'rejete' && pkg.notes_revision && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--cancelled)' }}>{pkg.notes_revision}</div>
        )}
        {pkg.statut === 'genere' && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--t3)' }}>
            Package hors circuit de veto (généré manuellement) — aucune action automatique ne le concerne.
          </div>
        )}
      </div>

      {/* Article */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--line, rgba(60,60,67,0.12))', borderRadius: 'var(--rad-lg)', padding: '20px 24px', marginBottom: 16 }}>
        <div className="section-header" style={{ marginBottom: 10 }}>
          <div className="section-title" style={{ fontSize: 15 }}>Article</div>
          <button className="btn btn-outline btn-sm" style={{ fontSize: 12 }} onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? 'Voir le rendu' : 'Voir le markdown brut'}
          </button>
        </div>
        {showRaw
          ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--bg, #F5F5F7)', borderRadius: 10, padding: 16, maxHeight: 480, overflow: 'auto' }}>{pkg.article_md}</pre>
          : <div className="edito-md" dangerouslySetInnerHTML={{ __html: articleHtml }} />}
      </div>

      {/* Post LinkedIn */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--line, rgba(60,60,67,0.12))', borderRadius: 'var(--rad-lg)', padding: '20px 24px', marginBottom: 16 }}>
        <div className="section-header" style={{ marginBottom: 10 }}>
          <div className="section-title" style={{ fontSize: 15 }}>Post LinkedIn</div>
          {pkg.post_linkedin && <CopyBtn text={pkg.post_linkedin} label="Copier le post" toastLabel="Post LinkedIn copié" />}
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.55, color: 'var(--t1)', margin: 0 }}>
          {pkg.post_linkedin || '(absent)'}
        </pre>
      </div>

      {/* Thread X */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--line, rgba(60,60,67,0.12))', borderRadius: 'var(--rad-lg)', padding: '20px 24px', marginBottom: 16 }}>
        <div className="section-header" style={{ marginBottom: 10 }}>
          <div className="section-title" style={{ fontSize: 15 }}>Thread X ({tweets.length} tweets)</div>
          {tweets.length > 0 && <CopyBtn text={tweets.join('\n\n')} label="Copier tout le thread" toastLabel="Thread complet copié" />}
        </div>
        {tweets.map((t, i) => (
          <div key={i} style={{
            border: '1px solid rgba(60,60,67,0.12)', borderRadius: 10, padding: '10px 14px', marginBottom: 8,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', paddingTop: 2, minWidth: 26 }}>{i + 1}/{tweets.length}</div>
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>{t}</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10.5, color: t.length > 280 ? 'var(--cancelled)' : 'var(--t3)', marginBottom: 4 }}>{t.length}/280</div>
              <CopyBtn text={t} label="Copier" toastLabel={`Tweet ${i + 1} copié`} />
            </div>
          </div>
        ))}
        {!tweets.length && <div style={{ fontSize: 13, color: 'var(--t3)' }}>(absent)</div>}
      </div>

      {/* Carrousel Instagram */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--line, rgba(60,60,67,0.12))', borderRadius: 'var(--rad-lg)', padding: '20px 24px', marginBottom: 16 }}>
        <div className="section-header" style={{ marginBottom: 10 }}>
          <div className="section-title" style={{ fontSize: 15 }}>Carrousel Instagram ({slides.length} slides)</div>
          {slides.length > 0 && <CopyBtn text={slides.map((s, i) => `— Slide ${i + 1} —\n${slideText(s)}`).join('\n\n')} label="Copier tout le carrousel" toastLabel="Carrousel complet copié" />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {slides.map((s, i) => (
            <div key={i} style={{ border: '1px solid rgba(60,60,67,0.12)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>SLIDE {i + 1}/{slides.length}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>{s.titre}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--t2, #3A3A3C)', flex: 1, marginBottom: 8 }}>{s.texte}</div>
              <CopyBtn text={slideText(s)} label="Copier" toastLabel={`Slide ${i + 1} copiée`} />
            </div>
          ))}
        </div>
        {!slides.length && <div style={{ fontSize: 13, color: 'var(--t3)' }}>(absent — package antérieur au format 360° ou carrousel invalide à la génération)</div>}
      </div>

      {/* Script vidéo */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--line, rgba(60,60,67,0.12))', borderRadius: 'var(--rad-lg)', padding: '20px 24px', marginBottom: 16 }}>
        <div className="section-header" style={{ marginBottom: 10 }}>
          <div className="section-title" style={{ fontSize: 15 }}>
            Script vidéo{hasVideo && video.duree_cible_sec ? ` (~${video.duree_cible_sec} s, vertical)` : ''}
          </div>
          {hasVideo && <CopyBtn text={videoText} label="Copier le script" toastLabel="Script vidéo copié" />}
        </div>
        {hasVideo ? (
          <>
            <div style={{ background: 'var(--gold-subtle)', border: '1px solid var(--gold-line)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gold-dk)' }}>HOOK (&lt; 3 s) </span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t1)' }}>{video.hook}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
                <thead>
                  <tr>
                    {['#', 'Plan', 'Texte oral', 'Texte écran'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid rgba(60,60,67,0.16)', color: 'var(--t3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {videoSequences.map((s, i) => (
                    <tr key={i}>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(60,60,67,0.08)', color: 'var(--t3)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(60,60,67,0.08)', color: 'var(--t2, #3A3A3C)', minWidth: 120 }}>{s.plan || '—'}</td>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(60,60,67,0.08)', color: 'var(--t1)', minWidth: 220 }}>{s.texte_oral}</td>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(60,60,67,0.08)', color: 'var(--t2, #3A3A3C)', minWidth: 140 }}>{s.texte_ecran || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {video.cta && (
              <div style={{ fontSize: 12.5, marginTop: 10 }}>
                <span style={{ fontWeight: 700, color: 'var(--t3)' }}>CTA : </span>
                <span style={{ color: 'var(--t1)' }}>{video.cta}</span>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>(absent — package antérieur au format 360° ou script invalide à la génération)</div>
        )}
      </div>

      {/* Sources */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--line, rgba(60,60,67,0.12))', borderRadius: 'var(--rad-lg)', padding: '20px 24px', marginBottom: 24 }}>
        <div className="section-title" style={{ fontSize: 15, marginBottom: 10 }}>Sources d'actualité</div>
        {sources.map((s, i) => (
          <div key={i} style={{ fontSize: 13, margin: '6px 0' }}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-dk)' }}>{s.titre || s.url}</a>
            <span style={{ color: 'var(--t3)' }}> — {s.date}</span>
          </div>
        ))}
        {!sources.length && <div style={{ fontSize: 13, color: 'var(--t3)' }}>(aucune)</div>}
      </div>

      {rejectModal && (
        <ConfirmRejectModal
          titre={fm.title || pkg.sujet}
          busy={busy}
          onCancel={() => setRejectModal(false)}
          onConfirm={() => moderate('reject')}
        />
      )}
    </div>
  )
}

/* ── Encart configuration Newsletter (liste Brevo) ─────────────────────── */

async function authFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}`, ...options.headers },
  })
}

function NewsletterConfig() {
  const [lists, setLists] = useState(null)      // null = pas encore chargé, [] = chargé vide
  const [current, setCurrent] = useState(null)  // { id, name } configuré
  const [loadErr, setLoadErr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const cfgRes = await authFetch('/api/editorial/config')
        if (cfgRes.ok) setCurrent((await cfgRes.json()).brevo_list_id || null)
        const listRes = await authFetch('/api/editorial/brevo-lists')
        const body = await listRes.json().catch(() => ({}))
        if (listRes.ok) setLists(body.lists || [])
        else { setLists([]); setLoadErr(body.error || `Erreur ${listRes.status}`) }
      } catch (e) {
        setLists([]); setLoadErr(e.message)
      }
    })()
  }, [])

  async function onSelect(e) {
    const id = Number(e.target.value)
    if (!id) return
    const list = (lists || []).find((l) => l.id === id)
    setSaving(true)
    try {
      const res = await authFetch('/api/editorial/config', {
        method: 'PUT',
        body: JSON.stringify({ id, name: list?.name || '' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`)
      setCurrent(body.brevo_list_id)
      toast.success('Liste de la newsletter enregistrée')
    } catch (err) {
      toast.error(`Échec : ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line, rgba(60,60,67,0.12))', borderRadius: 'var(--rad-lg)', padding: '16px 20px', marginBottom: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="section-kicker" style={{ marginBottom: 2 }}>Newsletter mensuelle</div>
          <div style={{ fontSize: 13, color: 'var(--t2, #3A3A3C)' }}>
            Liste de destinataires Brevo :{' '}
            {current
              ? <strong>{current.name || `liste n° ${current.id}`}</strong>
              : <span style={{ color: 'var(--progress)', fontWeight: 600 }}>non configurée</span>}
          </div>
        </div>
        <div style={{ minWidth: 240 }}>
          {lists === null && <span style={{ fontSize: 12.5, color: 'var(--t3)' }}>Chargement des listes Brevo…</span>}
          {lists !== null && loadErr && <span style={{ fontSize: 12.5, color: 'var(--cancelled)' }}>{loadErr}</span>}
          {lists !== null && !loadErr && (
            <select
              className="month-select" style={{ width: '100%' }} disabled={saving}
              value={current?.id || ''} onChange={onSelect}
            >
              <option value="">— Choisir une liste —</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.totalSubscribers} abonnés)</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 10, lineHeight: 1.5 }}>
        La newsletter est générée en brouillon dans Brevo le 1er de chaque mois ; vous la relisez et l'envoyez depuis Brevo.
      </div>
    </div>
  )
}

/* ── Composant principal ───────────────────────────────────────────────── */

export default function EditorialHub({ onPendingChange }) {
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [statutFilter, setStatutFilter] = useState('tous')
  const [themeFilter, setThemeFilter] = useState('tous')

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('editorial_packages')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else {
      setPackages(data || [])
      onPendingChange?.((data || []).filter((p) => p.statut === 'en_attente_veto').length)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const visible = useMemo(() => packages
    .filter((p) => statutFilter === 'tous' || p.statut === statutFilter)
    .filter((p) => themeFilter === 'tous' || p.theme === themeFilter),
  [packages, statutFilter, themeFilter])

  const selected = packages.find((p) => p.id === selectedId)

  if (selected) {
    return <PackageDetail pkg={selected} onBack={() => setSelectedId(null)} onModerated={load} />
  }

  const pending = packages.filter((p) => p.statut === 'en_attente_veto').length

  return (
    <div>
      <div className="section-header mb-16">
        <div>
          <div className="section-kicker">Agent éditorial</div>
          <div className="section-title">File des packages</div>
          <div className="section-sub">
            {packages.length} package{packages.length > 1 ? 's' : ''}
            {pending > 0 && <span style={{ color: 'var(--progress)', fontWeight: 600 }}> · {pending} en attente de relecture</span>}
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>Rafraîchir</button>
      </div>

      <NewsletterConfig />


      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <Pill active={statutFilter === 'tous'} onClick={() => setStatutFilter('tous')}>Tous statuts</Pill>
        {Object.entries(STATUT_META).map(([k, m]) => (
          <Pill key={k} active={statutFilter === k} onClick={() => setStatutFilter(k)}>{m.label}</Pill>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <Pill active={themeFilter === 'tous'} onClick={() => setThemeFilter('tous')}>Tous thèmes</Pill>
        {Object.entries(THEME_META).map(([k, m]) => (
          <Pill key={k} active={themeFilter === k} onClick={() => setThemeFilter(k)}>{m.label}</Pill>
        ))}
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {loading && <div style={{ padding: 24, color: 'var(--t3)', fontSize: 13 }}>Chargement…</div>}
      {!loading && !visible.length && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
          Aucun package {statutFilter !== 'tous' || themeFilter !== 'tous' ? 'pour ces filtres' : 'généré pour le moment'}.
        </div>
      )}
      {visible.map((pkg) => <PackageRow key={pkg.id} pkg={pkg} onOpen={setSelectedId} />)}
    </div>
  )
}
