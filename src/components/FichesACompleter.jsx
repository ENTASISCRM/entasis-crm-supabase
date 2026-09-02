// ═══════════════════════════════════════════════════════════════════════════
// FICHES À COMPLÉTER : les fiches clients à finir, à l'accueil du conseiller
//
// Le cabinet veut lancer des campagnes ciblées, et le seul frein est que les
// fiches ne sont pas remplies (mesure du 2 septembre 2026 : statut 19 %,
// revenus 18 %, patrimoine 15 %, date de naissance 9 %). Ce qui marche, on
// l'a vu avec le verrou de signature : demander au bon moment, et montrer.
//
// Ce bloc vit sous la file du matin et les dossiers sans mouvement. Il montre
// les trois fiches les plus urgentes à compléter (celles d'un rendez vous à
// venir d'abord, puis d'une signature récente, puis d'un dossier en cours),
// et surtout il laisse saisir les champs manquants EN LIGNE : un champ, un
// bouton Enregistrer, sans ouvrir la fiche. N'envoie que ce qui est rempli,
// jamais un effacement. Une fiche complète disparaît de la liste.
//
// Les fiches viennent de listerPourCompletude (la RLS rend au conseiller ses
// fiches, principal ou co conseiller). L'ordre vit dans lib/completude.js,
// testé à part. Même modèle visuel que Ma journée : section-header,
// priorities-list, priority-item ; les quelques règles propres sont dans
// clients/completude.css, préfixe cpl.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { jourISO } from '../lib/ma-journee'
import { nomClient, messageErreur, STATUTS_PRO } from '../lib/ui-shared'
import { prioriserFichesACompleter, scoreCompletude, SITUATIONS_FAMILIALES } from '../lib/completude'
import { listerPourCompletude, completerFiche } from '../services/clients'
import JaugeCompletude from './clients/JaugeCompletude'
import './clients/completude.css'

// Comment se saisit chaque champ manquant. Les clés sont celles de
// CHAMPS_CAMPAGNE ; la date de naissance couvre aussi l'âge (l'un des deux
// suffit au score, on demande la date, plus durable).
const SAISIES = {
  date_naissance: { libelle: 'Date de naissance', type: 'date' },
  situation_familiale: { libelle: 'Situation familiale', type: 'select', options: SITUATIONS_FAMILIALES },
  statut_pro: { libelle: 'Statut professionnel', type: 'select', options: STATUTS_PRO.map((s) => ({ valeur: s, libelle: s })) },
  profession: { libelle: 'Profession', type: 'text', placeholder: 'Architecte, infirmière…' },
  revenus_annuels: { libelle: 'Revenus annuels (€)', type: 'number', placeholder: 'par an' },
  patrimoine_estime: { libelle: 'Patrimoine estimé (€)', type: 'number', placeholder: 'estimation' },
  telephone: { libelle: 'Téléphone', type: 'tel', placeholder: '06 00 00 00 00' },
  email: { libelle: 'Email', type: 'email', placeholder: 'prenom@exemple.fr' },
}

const EMAIL_PLAUSIBLE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

function Champ({ cle, ficheId, valeur, onChange }) {
  const def = SAISIES[cle]
  if (!def) return null
  const id = `cpl-${ficheId}-${cle}`
  return (
    <label className="cpl-champ" htmlFor={id}>
      <span className="cpl-champ-libelle">{def.libelle}</span>
      {def.type === 'select' ? (
        <select id={id} className="form-select" value={valeur} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choisir…</option>
          {def.options.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
        </select>
      ) : (
        <input
          id={id}
          className="form-input"
          type={def.type}
          value={valeur}
          placeholder={def.placeholder}
          onChange={(e) => onChange(e.target.value)}
          {...(def.type === 'number' ? { min: 0, step: 1, inputMode: 'numeric' } : {})}
        />
      )}
    </label>
  )
}

export default function FichesACompleter({ profile, deals, onOpenClient, limite = 3 }) {
  const code = profile?.advisor_code
  const today = jourISO()
  const [clients, setClients] = useState([])
  // Les valeurs tapées, par fiche puis par champ. Vidées à l'enregistrement.
  const [saisies, setSaisies] = useState({})
  const [enCours, setEnCours] = useState(null)

  useEffect(() => {
    if (!code) return undefined
    let actif = true
    listerPourCompletude()
      .then((fiches) => { if (actif) setClients(fiches) })
      .catch((e) => { if (actif) toast.error('Fiches à compléter : ' + messageErreur(e)) })
    return () => { actif = false }
  }, [code])

  const mesFiches = useMemo(
    () => clients.filter((c) => c.advisor_code === code || c.co_advisor_code === code).length,
    [clients, code],
  )
  const toutes = useMemo(
    () => prioriserFichesACompleter(clients, deals, { advisorCode: code, today, limite: Infinity }),
    [clients, deals, code, today],
  )
  const liste = useMemo(() => toutes.slice(0, Math.max(0, limite)), [toutes, limite])

  if (!liste.length) return null

  const valeurDe = (ficheId, cle) => saisies[ficheId]?.[cle] ?? ''
  const saisir = (ficheId, cle, valeur) =>
    setSaisies((prev) => ({ ...prev, [ficheId]: { ...(prev[ficheId] || {}), [cle]: valeur } }))

  async function enregistrer(fiche) {
    if (enCours) return
    const valeurs = saisies[fiche.id] || {}
    const patch = Object.fromEntries(
      Object.entries(valeurs).filter(([, v]) => v != null && String(v).trim() !== ''),
    )
    if (Object.keys(patch).length === 0) {
      toast('Renseignez au moins un champ avant d’enregistrer.')
      return
    }
    if (patch.email && !EMAIL_PLAUSIBLE.test(String(patch.email).trim())) {
      toast.error('L’email saisi n’a pas la forme attendue (prenom@exemple.fr).')
      return
    }
    const nom = nomClient(fiche)
    setEnCours(fiche.id)
    try {
      const ecrits = await completerFiche(fiche.id, patch)
      setClients((prev) => prev.map((c) => (c.id === fiche.id ? { ...c, ...ecrits } : c)))
      setSaisies((prev) => { const suite = { ...prev }; delete suite[fiche.id]; return suite })
      const apres = scoreCompletude({ ...fiche, ...ecrits })
      const n = Object.keys(ecrits).length
      toast.success(apres.score >= 100
        ? `Fiche de ${nom} complète, merci.`
        : `${pluriel(n, 'champ')} enregistré${n > 1 ? 's' : ''} · ${nom} à ${apres.score} %`)
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnCours(null)
    }
  }

  return (
    <div className="cpl" style={{ marginTop: 28 }}>
      <div className="section-header">
        <div>
          <div className="section-kicker">Données clients</div>
          <div className="section-title">Compléter ces fiches</div>
          <div className="section-sub">
            {pluriel(toutes.length, 'fiche')} incomplète{toutes.length > 1 ? 's' : ''} sur {mesFiches}
            {' · '}
            {toutes.length > liste.length ? `les ${liste.length} plus urgentes ci dessous, ` : ''}
            à compléter sans ouvrir la fiche
          </div>
        </div>
      </div>
      <div className="priorities-list">
        {liste.map((f) => (
          <div key={f.id} className="priority-item cpl-ligne">
            <div className="cpl-tete">
              <div className={`priority-item-dot ${f.rang === 1 ? 'high' : 'normal'}`} />
              <div className="cpl-identite">
                <div className="priority-item-client truncate">{nomClient(f)}</div>
                <div className="priority-item-detail">
                  {majuscule(f.raison)} · {pluriel(f.manquants.length, 'champ')} à renseigner
                </div>
              </div>
              <JaugeCompletude client={f} compact />
              <div className="cpl-gestes">
                <button type="button" className="btn btn-ghost btn-sm" title="Ouvrir la fiche client complète"
                  onClick={() => onOpenClient?.(f.id)}>
                  Ouvrir la fiche
                </button>
              </div>
            </div>
            <form className="cpl-saisies" onSubmit={(e) => { e.preventDefault(); enregistrer(f) }}>
              {f.manquants.map((m) => (
                <Champ key={m.cle} cle={m.cle} ficheId={f.id} valeur={valeurDe(f.id, m.cle)}
                  onChange={(v) => saisir(f.id, m.cle, v)} />
              ))}
              <button type="submit" className="btn btn-primary btn-sm" disabled={enCours === f.id}
                title="N’enregistre que les champs remplis">
                {enCours === f.id ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  )
}
