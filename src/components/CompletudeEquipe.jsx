// ═══════════════════════════════════════════════════════════════════════════
// COMPLÉTUDE DES FICHES PAR CONSEILLER : la vue direction
//
// Sur les cinq champs qui servent aux campagnes, l'écart entre conseillers
// va de 90 % à 0 % (mesure du 2 septembre 2026). La direction a besoin de le
// voir pour en parler : un tableau, un conseiller par ligne, le nombre de
// fiches, le score moyen, les fiches complètes et les trois champs qui
// manquent le plus souvent. Aucun montant nulle part : on compte des champs,
// jamais de la rémunération.
//
// Les fiches viennent de listerPourCompletude ; la RLS donne tout au manager.
// Un client compte pour son conseiller principal. Le calcul vit dans
// lib/completude.js, testé à part.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { messageErreur } from '../lib/ui-shared'
import { completudeParConseiller, champsLesPlusManquants, niveauDe } from '../lib/completude'
import { listerPourCompletude } from '../services/clients'
import { SkeletonTable } from './ui/Skeleton'
import './clients/completude.css'

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`
const pourcent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0)

// Une barre et un pourcentage, mêmes couleurs que la jauge d'une fiche.
function Score({ score }) {
  return (
    <span className="cpl-jauge cpl-compact cpl-score-cellule" data-niveau={niveauDe(score)} title={`Score moyen ${score} %`}>
      <span className="cpl-barre" aria-hidden="true">
        <span className="cpl-remplissage" style={{ width: `${score}%` }} />
      </span>
      <span className="cpl-pct">{score} %</span>
    </span>
  )
}

function Puces({ manquantsParChamp, limite = 3 }) {
  const puces = champsLesPlusManquants(manquantsParChamp, limite)
  if (!puces.length) return <span style={{ color: 'var(--t2)' }}>rien ne manque</span>
  return (
    <div className="cpl-puces">
      {puces.map((p) => (
        <span key={p.cle} className="cpl-puce" title={`${p.libelle} manque sur ${pluriel(p.nombre, 'fiche')}`}>
          {p.libelle} <span className="cpl-puce-nombre">{p.nombre}</span>
        </span>
      ))}
    </div>
  )
}

export default function CompletudeEquipe() {
  const [clients, setClients] = useState(null)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let actif = true
    listerPourCompletude()
      .then((fiches) => { if (actif) setClients(fiches) })
      .catch((e) => { if (actif) { setErreur(messageErreur(e)); setClients([]) } })
    return () => { actif = false }
  }, [])

  const lignes = useMemo(() => completudeParConseiller(clients || []), [clients])

  const total = clients?.length || 0
  const completes = lignes.reduce((s, l) => s + l.completes, 0)
  const scoreCabinet = total > 0
    ? Math.round(lignes.reduce((s, l) => s + l.scoreMoyen * l.fiches, 0) / total)
    : 0
  const manquantsCabinet = useMemo(() => {
    const cumul = {}
    for (const l of lignes) {
      for (const [cle, n] of Object.entries(l.manquantsParChamp)) cumul[cle] = (cumul[cle] || 0) + n
    }
    return cumul
  }, [lignes])

  return (
    <div className="cpl" style={{ marginTop: 28 }}>
      <div className="section-header">
        <div>
          <div className="section-kicker">Vue direction · données clients</div>
          <div className="section-title">Complétude des fiches</div>
          <div className="section-sub">
            {clients === null
              ? 'Chargement des fiches…'
              : `${pluriel(total, 'fiche')}, ${completes} complète${completes > 1 ? 's' : ''} · score moyen du cabinet ${scoreCabinet} % · ${pluriel(lignes.length, 'conseiller')}`}
          </div>
        </div>
      </div>

      {erreur && <div className="notice notice-error" style={{ marginBottom: 12 }}>Chargement impossible : {erreur}</div>}

      {clients === null ? (
        <SkeletonTable rows={4} cols={5} />
      ) : lignes.length === 0 ? (
        <div className="cpl-vide">Aucune fiche visible.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Conseiller</th>
                <th>Fiches</th>
                <th>Score moyen</th>
                <th>Complètes</th>
                <th>Champs les plus souvent manquants</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.advisorCode}>
                  <td className="cell-primary">{l.advisorCode}</td>
                  <td className="cell-mono">{l.fiches}</td>
                  <td><Score score={l.scoreMoyen} /></td>
                  <td className="cell-mono">
                    {l.completes} <span style={{ color: 'var(--t2)' }}>({pourcent(l.completes, l.fiches)} %)</span>
                  </td>
                  <td><Puces manquantsParChamp={l.manquantsParChamp} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="cpl-tfoot">
              <tr>
                <td>Cabinet</td>
                <td className="cell-mono">{total}</td>
                <td><Score score={scoreCabinet} /></td>
                <td className="cell-mono">{completes} ({pourcent(completes, total)} %)</td>
                <td><Puces manquantsParChamp={manquantsCabinet} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
