// ═══════════════════════════════════════════════════════════════════════════
// OPPORTUNITÉS DU JOUR : les occasions de contact du matin
//
// Agrège 8 générateurs (fiches à compléter, anniversaires, revue de contrat,
// sprint PER, recalage Madelin, épargne des enfants, cap des 70 ans, clients
// orphelins — voir services/opportunites.js).
//
// FORME : UNE carte, sections en puces, UNE liste visible à la fois.
// La première version empilait une carte par section — en-tête, encart
// d'alerte, règle, liste complète, le tout en rouge pour les fiches. Trois
// sections actives = un mur qu'on fait défiler avant d'atteindre la suite du
// tableau de bord (retour de Louis, 28/08). Le pattern des inbox de triage
// (Linear) : lignes denses ~34px, l'aperçu court, « afficher les autres » à
// la demande, et la couleur d'alerte réservée à ce qui bloque vraiment — ici
// le badge « à signer ». Une fiche incomplète est une tâche, pas un incendie :
// 28 lignes rouges ne hiérarchisent plus rien.
//
// La section fiches à compléter liste les clients dont la fiche est incomplète
// au sens du verrou de signature. Clic = copie du nom pour retrouver la
// fiche ; les autres sections copient le téléphone.
//
// Périmètre de données : la RLS applique le périmètre (manager voit tout et
// dispose d'un filtre conseiller, conseiller voit ses clients). Aucune
// écriture : l'écran lit, calcule côté client et copie dans le presse papier.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { SkeletonCards } from './ui/Skeleton'
import { chargerDonnees, construireSections } from '../services/opportunites'
import { messageErreur } from '../lib/ui-shared'

export default function OpportunitesDuJour({ profile, embedded }) {
  const isManager = profile?.role === 'manager'
  const [donnees, setDonnees] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [cons, setCons] = useState('all')     // filtre conseiller du manager
  const [active, setActive] = useState(null)  // clé de la section affichée
  const [tout, setTout] = useState(false)     // liste dépliée au-delà de l'aperçu

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const d = await chargerDonnees({ manager: isManager })
        if (vivant) setDonnees(d)
      } catch (e) { if (vivant) setErr(messageErreur(e)) }
      finally { if (vivant) setLoading(false) }
    })()
    return () => { vivant = false }
  }, [isManager])

  // Codes conseillers présents dans le portefeuille visible (filtre manager)
  const conseillers = useMemo(() => {
    if (!donnees) return []
    return Array.from(new Set(donnees.clients.map((c) => c.advisor_code).filter(Boolean))).sort()
  }, [donnees])
  const nomConseiller = useMemo(() => {
    const m = {}
    ;(donnees?.profils || []).forEach((p) => { if (p.advisor_code) m[p.advisor_code] = p.full_name })
    return m
  }, [donnees])

  // Le filtre conseiller s'applique en amont des générateurs : les clients
  // et les deals sont réduits au portefeuille choisi, les sections se
  // recalculent (les orphelins disparaissent d'eux mêmes, leur code ne
  // correspondant à aucun conseiller actif sélectionnable).
  const sections = useMemo(() => {
    if (!donnees) return []
    const filtrees = cons === 'all' ? donnees : {
      ...donnees,
      clients: donnees.clients.filter((c) => c.advisor_code === cons),
      deals: donnees.deals.filter((d) => d.advisor_code === cons),
    }
    return construireSections(filtrees, { isManager, today: new Date() })
  }, [donnees, cons, isManager])

  // Le total en tête compte les vraies occasions de contact : la section fiches
  // à compléter est exclue (ce n'est pas un appel), elle a son propre compteur.
  const total = useMemo(() => sections.reduce((s, x) => s + (x.fiches ? 0 : x.items.length), 0), [sections])
  // En mode intégré (Mon mois), on ne montre que les sections qui ont vraiment
  // une action du jour : pas de puces vides qui alourdissent le tableau de bord.
  const secShown = embedded ? sections.filter((s) => s.items.length > 0) : sections

  // Section affichée : celle choisie si elle existe encore (le filtre
  // conseiller peut la vider), sinon la première. L'aperçu se replie à
  // chaque changement de section.
  const secActive = secShown.find((s) => s.key === active) || secShown[0] || null
  const choisir = (k) => { setActive(k); setTout(false) }

  // Clic sur un client : copie du téléphone dans le presse papier
  function copierTelephone(it) {
    if (!it.telephone) { toast(`Pas de téléphone renseigné pour ${it.nom}`); return }
    navigator.clipboard?.writeText(it.telephone)
      .then(() => toast.success(`Téléphone de ${it.nom} copié`))
      .catch(() => toast.error('Copie impossible sur ce navigateur'))
  }

  // Clic sur une fiche à compléter : copie du nom (le téléphone peut justement
  // faire partie des champs manquants), pour retrouver la fiche et la remplir.
  function copierNom(it) {
    navigator.clipboard?.writeText(it.nom)
      .then(() => toast.success(`« ${it.nom} » copié, ouvrez la fiche pour compléter`))
      .catch(() => toast.error('Copie impossible sur ce navigateur'))
  }

  // Copie de la liste complète d'une section, prête à coller dans des notes
  function copierListe(sec) {
    const lignes = sec.items.map((it) =>
      `${it.nom} · ${it.raison}${it.detail ? ` · ${it.detail}` : ''}${it.telephone ? ` · ${it.telephone}` : ''}`)
    const txt = `${sec.titre} (${sec.items.length})\n${lignes.join('\n')}`
    navigator.clipboard?.writeText(txt)
      .then(() => toast.success(`${sec.items.length} client${sec.items.length > 1 ? 's' : ''} copiés`))
      .catch(() => toast.error('Copie impossible sur ce navigateur'))
  }

  const dateDuJour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className={`opj${embedded ? ' emb' : ''}`}>
      <style>{styles}</style>

      {embedded ? (
        <div className="embhd">
          <h2>Actions immédiates du jour</h2>
          <span className="embkpi">{total} occasion{total > 1 ? 's' : ''}</span>
        </div>
      ) : (
        <div className="hd">
          <div>
            <h1>Opportunités du jour</h1>
            <div className="sub">{dateDuJour}</div>
          </div>
          <div className="kpi">
            <span className="v">{total}</span>
            <span className="l">occasion{total > 1 ? 's' : ''} de contact aujourd'hui</span>
          </div>
        </div>
      )}

      {isManager && conseillers.length > 0 && (
        <div className="filtre">
          <span>Conseiller</span>
          <select value={cons} onChange={(e) => setCons(e.target.value)}>
            <option value="all">Tout le cabinet</option>
            {conseillers.map((c) => (
              <option key={c} value={c}>{nomConseiller[c] ? `${c} · ${nomConseiller[c]}` : c}</option>
            ))}
          </select>
        </div>
      )}

      {loading && <SkeletonCards n={3} height={84} />}
      {err && <div className="empty err">Erreur : {err}</div>}

      {embedded && !loading && !err && secShown.length === 0 && (
        <div className="embvide">Rien d'urgent aujourd'hui, tout est à jour.</div>
      )}

      {!loading && !err && secShown.length > 0 && (
        <section className="carte">
          {/* Une puce par section, compteur inclus : c'est le sommaire ET le
              sélecteur. Une seule liste dessous — fini l'empilement de cartes. */}
          <div className="puces" role="tablist" aria-label="Sections du jour">
            {secShown.map((sec) => (
              <button
                key={sec.key}
                role="tab"
                aria-selected={sec.key === secActive?.key}
                className={`puce${sec.key === secActive?.key ? ' on' : ''}${sec.fiches ? ' todo' : ''}`}
                title={sec.regle}
                onClick={() => choisir(sec.key)}
              >
                {sec.titre}
                <span className="n">{sec.items.length}</span>
              </button>
            ))}
          </div>

          {secActive && (
            <div className="corps">
              {/* Une seule ligne de contexte, sobre : l'accroche pour les
                  fiches, la règle sinon. La version longue vit dans le title
                  de la puce — plus de double encart rouge + règle grise. */}
              <div className="ctx">
                <span className="ctxt" title={secActive.regle}>
                  {secActive.fiches ? secActive.accroche : secActive.regle}
                </span>
                {secActive.urgent && <span className="stag">URGENT</span>}
                {secActive.managerOnly && <span className="stag mgr">MANAGER</span>}
                <span className="sp" />
                <button
                  className="copy"
                  disabled={secActive.items.length === 0}
                  onClick={() => copierListe(secActive)}
                >
                  Copier la liste
                </button>
              </div>

              {secActive.items.length === 0 && secActive.encartDates && (
                <div className="edu">
                  Aucune date de naissance renseignée dans le portefeuille.
                  {' '}<b>Renseigne les dates de naissance sur les fiches clients</b>{' '}
                  pour activer les rappels d'anniversaire et le compte à rebours des 70 ans.
                </div>
              )}
              {secActive.items.length === 0 && secActive.fiches && (
                <div className="vide ok">Toutes les fiches de ce portefeuille sont complètes. Rien à relancer.</div>
              )}
              {secActive.items.length === 0 && !secActive.encartDates && !secActive.fiches && (
                <div className="vide">Aucun client concerné aujourd'hui</div>
              )}

              {secActive.items.length > 0 && (
                <ul className={tout ? 'deplie' : ''}>
                  {(tout ? secActive.items : secActive.items.slice(0, APERCU)).map((it) => (
                    <li
                      key={it.id}
                      className={secActive.fiches || it.telephone ? 'click' : ''}
                      title={secActive.fiches
                        ? 'Cliquer pour copier le nom et retrouver la fiche'
                        : (it.telephone ? 'Cliquer pour copier le téléphone' : undefined)}
                      onClick={() => (secActive.fiches ? copierNom(it) : copierTelephone(it))}
                    >
                      <span className="nm">{it.nom}</span>
                      {secActive.fiches && it.dealActif && <span className="asigner">à signer</span>}
                      {isManager && it.advisorCode && <span className="adv">{it.advisorCode}</span>}
                      {secActive.fiches ? (
                        /* Les champs manquants en petites pastilles neutres :
                           la même phrase rouge répétée 28 fois ne se lit pas,
                           une rangée de pastilles se balaie d'un coup d'œil. */
                        <span className="why chips">
                          {it.manquants.map((m) => <span key={m} className="chip">{m}</span>)}
                          {it.bonus && <span className="chip bonus" title={`${it.bonus} recommandée`}>{it.bonus} ?</span>}
                        </span>
                      ) : (
                        <span className="why">
                          {it.raison}
                          {it.detail && <span className="det"> · {it.detail}</span>}
                        </span>
                      )}
                      {!secActive.fiches && it.telephone && (
                        <a className="tel" href={`tel:${String(it.telephone).replace(/\s/g, '')}`}
                           onClick={(e) => e.stopPropagation()} title="Appeler">{it.telephone}</a>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {secActive.items.length > APERCU && (
                <button className="plus" onClick={() => setTout((v) => !v)}>
                  {tout
                    ? 'Réduire'
                    : `Afficher les ${secActive.items.length - APERCU} autres`}
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// Lignes visibles avant « Afficher les autres » : assez pour juger la teneur
// de la liste, pas assez pour pousser le reste du tableau de bord hors écran.
const APERCU = 5

const styles = `
.opj{ --line:#ECEAE4; --silver:#8A95A8; --ink:#1D1D1F; --rouge:#B4453B; color:var(--ink); font-size:13px; max-width:980px }
.opj *{ box-sizing:border-box }
.opj .hd{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:12px }
.opj h1{ font-size:22px; font-weight:700; color:var(--navy,#0A1628); margin:0; letter-spacing:-.02em }
.opj .sub{ color:var(--silver); font-size:12px; margin-top:2px; text-transform:capitalize }
.opj .kpi{ background:#fff; border:1px solid rgba(201,169,97,.45); border-radius:12px; padding:10px 16px; display:flex; flex-direction:column; gap:3px; text-align:left; min-width:190px }
.opj .kpi .v{ font-size:22px; font-weight:750; color:var(--gold-dk,#A6843F); line-height:1 }
.opj .kpi .l{ font-size:10.5px; color:var(--silver); font-weight:600 }
.opj .filtre{ display:flex; align-items:center; gap:8px; margin-bottom:12px; font-size:12px; color:var(--silver); font-weight:600 }
.opj .filtre select{ border:1px solid var(--line); border-radius:8px; padding:5px 8px; font-size:12px; background:#fff; color:var(--navy,#0A1628); font-weight:600 }

/* ── La carte unique ─────────────────────────────────────────────────── */
.opj .carte{ background:#fff; border:1px solid var(--line); border-radius:13px; overflow:hidden; box-shadow:0 1px 2px rgba(10,22,40,.04) }
.opj .puces{ display:flex; gap:6px; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid #F4F2ED; background:#FCFBF8 }
.opj .puce{ display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line); background:#fff; border-radius:999px; padding:5px 11px; font-size:12px; font-weight:650; color:#5b6470; cursor:pointer; font-family:inherit }
.opj .puce:hover{ border-color:rgba(201,169,97,.55); color:var(--navy,#0A1628) }
.opj .puce.on{ border-color:var(--gold,#C9A961); background:#FBF4E4; color:var(--navy,#0A1628) }
.opj .puce .n{ font-size:10.5px; font-weight:750; background:#F3F1EC; color:#5b6470; border-radius:999px; padding:1px 7px; min-width:20px; text-align:center; font-variant-numeric:tabular-nums }
.opj .puce.on .n{ background:var(--gold,#C9A961); color:#fff }
/* La puce des fiches à compléter garde SON signal — le compteur rouge —
   mais le rouge s'arrête là : la liste elle-même reste calme. */
.opj .puce.todo .n{ background:var(--rouge); color:#fff }

.opj .corps{ padding:0 }
.opj .ctx{ display:flex; align-items:center; gap:8px; padding:9px 14px; border-bottom:1px solid #F4F2ED }
.opj .ctxt{ font-size:11.5px; color:var(--silver); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0 }
.opj .stag{ font-size:9px; font-weight:800; letter-spacing:.06em; background:var(--gold,#C9A961); color:#fff; border-radius:999px; padding:2.5px 8px; flex-shrink:0 }
.opj .stag.mgr{ background:var(--navy,#0A1628) }
.opj .sp{ flex:1 }
.opj .copy{ border:1px solid var(--line); background:#fff; border-radius:8px; padding:4px 10px; font-size:11px; font-weight:700; color:#5b6470; cursor:pointer; white-space:nowrap; flex-shrink:0; font-family:inherit }
.opj .copy:hover{ border-color:var(--gold,#C9A961); color:var(--gold-dk,#A6843F) }
.opj .copy:disabled{ opacity:.45; cursor:default }

/* Lignes denses ~34px : nom, badges, raison, téléphone à droite. */
.opj ul{ list-style:none; margin:0; padding:0 }
.opj ul.deplie{ max-height:296px; overflow-y:auto }
.opj li{ display:flex; align-items:center; gap:10px; padding:7px 14px; border-top:1px solid #F4F2ED }
.opj li:first-child{ border-top:none }
.opj li.click{ cursor:pointer }
.opj li.click:hover{ background:#FCFBF6 }
.opj .nm{ font-weight:650; color:var(--navy,#0A1628); white-space:nowrap }
.opj .adv{ font-size:9.5px; font-weight:700; color:var(--silver); background:#F3F1EC; border-radius:5px; padding:1.5px 6px; flex-shrink:0 }
.opj .asigner{ font-size:9px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; background:var(--rouge); color:#fff; border-radius:999px; padding:2px 7px; white-space:nowrap; flex-shrink:0 }
.opj .why{ flex:1; min-width:0; font-size:12px; color:#5b6470; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.opj .why .det{ color:var(--silver) }
/* Champs manquants en pastilles : balayables d'un coup d'œil, sans crier. */
.opj .why.chips{ display:flex; gap:4px; flex-wrap:wrap; white-space:normal }
.opj .chip{ font-size:10px; font-weight:650; color:#7a6a4f; background:#F7F4EC; border:1px solid #EBE5D6; border-radius:5px; padding:1px 6px; line-height:1.5 }
.opj .chip.bonus{ color:var(--silver); background:#F6F6F4; border-color:var(--line); font-style:italic }
.opj .tel{ font-size:12px; font-weight:650; color:var(--gold-dk,#A6843F); font-variant-numeric:tabular-nums; white-space:nowrap; margin-left:auto }

.opj .plus{ display:block; width:100%; border:none; border-top:1px solid #F4F2ED; background:#FCFBF8; padding:8px; font-size:11.5px; font-weight:700; color:var(--gold-dk,#A6843F); cursor:pointer; font-family:inherit }
.opj .plus:hover{ background:#FBF4E4 }

.opj .vide{ padding:12px 14px; font-size:12px; color:var(--silver) }
.opj .vide.ok{ color:#4a7a52 }
.opj .edu{ margin:10px 14px 12px; background:#FBF4E4; border:1px solid rgba(201,169,97,.5); border-radius:10px; padding:10px 12px; font-size:12px; color:#6b5620 }
.opj .edu b{ color:var(--gold-dk,#A6843F) }
.opj .empty{ padding:20px; text-align:center; color:var(--silver) }
.opj .err{ color:var(--rouge) }
.opj.emb{ max-width:none; margin-bottom:22px }
.opj .embhd{ display:flex; align-items:center; gap:10px; margin-bottom:10px }
.opj .embhd h2{ margin:0; font-size:15px; font-weight:750; color:var(--navy,#0A1628) }
.opj .embkpi{ font-size:11px; font-weight:750; color:var(--gold-dk,#A6843F); background:#FBF4E4; border:1px solid rgba(201,169,97,.45); border-radius:999px; padding:3px 10px }
.opj .embvide{ font-size:12.5px; color:#4a7a52; background:#F2F9F5; border:1px solid #CBE5D6; border-radius:12px; padding:14px 16px }
`
