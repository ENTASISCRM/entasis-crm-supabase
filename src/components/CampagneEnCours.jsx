// ═══════════════════════════════════════════════════════════════════════════
// CAMPAGNE EN COURS : les cibles du conseiller, à l'accueil
//
// Quand la direction lance une campagne (écran Campagnes), chaque conseiller
// retrouve ici ses clients à contacter, campagne par campagne : le titre dit
// combien il en reste, l'accroche se lit une fois sous le titre, puis une
// ligne par client avec le téléphone et trois gestes. Un geste retire la
// ligne et peut se reprendre depuis le toast (« Remettre ») : c'est une
// vraie écriture inverse, pas un retour local.
//
// Même modèle visuel que la file du matin (ActionsDuJour dans App.jsx) et
// les dossiers sans mouvement : ce bloc se lit comme la suite de Ma journée.
// Rien ne s'affiche s'il n'y a aucune cible à contacter.
//
// La RLS rend au conseiller ses propres cibles ; on refiltre sur son code
// pour l'affichage seulement, au cas où un profil de direction ouvre cet
// accueil avec un code conseiller.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { listerMesCibles, majStatutCible } from '../services/campagnes'
import { regrouperMesCibles, libelleStatutCible } from '../lib/campagnes'
import { messageErreur, nomClient } from '../lib/ui-shared'
import './campagnes.css'

const LIMITE = 5

const GESTES = [
  { statut: 'contacte', label: 'Contacté', title: 'Le client a été joint' },
  { statut: 'rdv', label: 'RDV', title: 'Un rendez vous est pris' },
  { statut: 'pas_interesse', label: 'Pas intéressé', title: 'Le client ne souhaite pas donner suite' },
]

const Geste = ({ label, title, onClick }) => (
  <button type="button" className="btn btn-ghost btn-sm" title={title} style={{ padding: '2px 8px', fontSize: 11, flexShrink: 0 }}
    onClick={(e) => { e.stopPropagation(); onClick() }}>{label}</button>
)

function Ligne({ cible, onOuvrir, onMarquer }) {
  const client = cible.clients || {}
  const nom = nomClient(client)
  const tel = client.telephone ? String(client.telephone).trim() : ''
  return (
    <div className="priority-item" style={{ cursor: onOuvrir ? 'pointer' : 'default' }}
      onClick={() => onOuvrir?.(cible.client_id)} title={onOuvrir ? 'Ouvrir la fiche client' : undefined}>
      <div className="priority-item-dot high" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="priority-item-client truncate">{nom}</div>
        <div className="priority-item-detail" style={{ color: 'var(--t2)' }}>
          {tel ? 'À contacter' : 'À contacter · sans téléphone sur la fiche'}
        </div>
      </div>
      {tel && (
        <a href={`tel:${tel.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()}
          className="tnum" style={{ fontSize: 12, fontWeight: 650, color: 'var(--gold-dk, #A6843F)', whiteSpace: 'nowrap' }} title="Appeler">
          {tel}
        </a>
      )}
      <div style={{ display: 'inline-flex', gap: 2, marginLeft: 6 }}>
        {GESTES.map((g) => <Geste key={g.statut} label={g.label} title={g.title} onClick={() => onMarquer(cible, g.statut)} />)}
      </div>
    </div>
  )
}

export default function CampagneEnCours({ profile, onOpenClient }) {
  const code = profile?.advisor_code || null
  const [cibles, setCibles] = useState([])
  const [deplies, setDeplies] = useState(() => new Set())

  useEffect(() => {
    let vivant = true
    listerMesCibles()
      .then((liste) => { if (vivant) setCibles(liste) })
      .catch((e) => { if (vivant) console.warn('[CampagneEnCours] chargement impossible :', messageErreur(e)) })
    return () => { vivant = false }
  }, [])

  const groupes = useMemo(
    () => regrouperMesCibles(code ? cibles.filter((c) => c.advisor_code === code) : []),
    [cibles, code],
  )

  // Écriture d'abord retirée de l'écran, puis confirmée en base ; si la base
  // refuse, la ligne revient et l'erreur se lit. « Remettre » réécrit
  // à contacter : la reprise est une vraie écriture, pas un retour local.
  async function marquer(cible, statut) {
    setCibles((prev) => prev.filter((c) => c.id !== cible.id))
    try {
      await majStatutCible(cible.id, statut)
    } catch (e) {
      setCibles((prev) => (prev.some((c) => c.id === cible.id) ? prev : [cible, ...prev]))
      toast.error(messageErreur(e))
      return
    }
    toast.success((t) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        {libelleStatutCible(statut)} · {nomClient(cible.clients || {})}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { toast.dismiss(t.id); remettre(cible) }}>Remettre</button>
      </span>
    ), { duration: 7000 })
  }

  async function remettre(cible) {
    try {
      await majStatutCible(cible.id, 'a_contacter')
      setCibles((prev) => (prev.some((c) => c.id === cible.id) ? prev : [cible, ...prev]))
      toast.success(`Remis à contacter · ${nomClient(cible.clients || {})}`)
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  const deplier = (id) => setDeplies((prev) => { const n = new Set(prev); n.add(id); return n })

  if (groupes.length === 0) return null

  return (
    <>
      {groupes.map((g) => {
        const n = g.cibles.length
        const ouvert = deplies.has(g.id)
        const lignes = ouvert ? g.cibles : g.cibles.slice(0, LIMITE)
        return (
          <div key={g.id} style={{ marginTop: 28 }} className="cmp">
            <div className="section-header">
              <div>
                <div className="section-kicker">Campagne en cours</div>
                <div className="section-title">Campagne {g.nom} · {n} à contacter</div>
                {g.accroche && <div className="section-sub cmp-accueil-accroche">{g.accroche}</div>}
              </div>
            </div>
            <div className="priorities-list">
              {lignes.map((c) => <Ligne key={c.id} cible={c} onOuvrir={onOpenClient} onMarquer={marquer} />)}
            </div>
            {!ouvert && n > LIMITE && (
              <div className="cmp-accueil-voir">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => deplier(g.id)}>
                  Voir tout · {n - LIMITE} de plus
                </button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
