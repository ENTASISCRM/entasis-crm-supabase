// src/components/dossiers/SequenceRelance.jsx
// Bloc « Séquence de relance » de la modale dossier (item B2 du plan
// d'amélioration), posé juste au dessus des champs « Prochaine action » et
// « Pour le ».
//
// Sans séquence : un sélecteur de gabarit et un bouton Démarrer. Avec une
// séquence : le nom du gabarit, ses étapes avec leur état, et un bouton
// discret pour l'arrêter.
//
// Le composant n'écrit rien en base. Il applique les patchs de lib/sequences
// champ par champ via set(), le setter du formulaire : le conseiller voit
// « Prochaine action » et « Pour le » se remplir sous ses yeux, et c'est le
// bouton Enregistrer de la modale qui persiste, comme pour tout le reste.

import { useState } from 'react'
import { SEQUENCES_LISTE } from '../../config/sequencesRelance'
import { demarrerSequence, arreterSequence, etapesDe, gabaritDe } from '../../lib/sequences'
import { jourISO } from '../../lib/ma-journee'

// Date courte à la française, « 30/08 », depuis une date ISO.
const dateCourte = (iso) => {
  if (!iso) return ''
  const [, m, j] = String(iso).slice(0, 10).split('-')
  return `${j}/${m}`
}

// « J+2, J+7 et J+15 »
const resumeDelais = (g) => {
  const d = g.etapes.map((e) => `J+${e.delaiJours}`)
  return d.length > 1 ? `${d.slice(0, -1).join(', ')} et ${d[d.length - 1]}` : d[0] || ''
}

// Rendu d'une étape : point de couleur, libellé, état à droite. Les couleurs
// doublent un texte d'état, elles ne portent jamais l'information seules.
// Gris secondaire (t2) partout où le texte est utile : le tertiaire passe
// sous le seuil AA dès qu'il porte autre chose qu'une indication.
const RENDU = {
  faite: { point: 'var(--signed)', couleur: 'var(--t2)', poids: 500, barre: true },
  en_cours: { point: 'var(--gold)', couleur: 'var(--t1)', poids: 650, barre: false },
  a_venir: { point: 'var(--t3)', couleur: 'var(--t2)', poids: 500, barre: false },
}

function Etape({ etape }) {
  const r = RENDU[etape.etat] || RENDU.a_venir
  const etat = etape.etat === 'faite'
    ? 'faite'
    : etape.etat === 'en_cours'
      ? (etape.date ? `posée le ${dateCourte(etape.date)}` : 'en cours, sans date')
      : `prévue le ${dateCourte(etape.date)}`
  return (
    <div role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: '18px' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: r.point, flexShrink: 0 }} />
      <span style={{
        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: r.couleur, fontWeight: r.poids, textDecoration: r.barre ? 'line-through' : 'none',
      }}>
        Étape {etape.numero} · J+{etape.delaiJours} · {etape.action}
      </span>
      <span className="tnum" style={{ color: 'var(--t2)', whiteSpace: 'nowrap', flexShrink: 0 }}>{etat}</span>
    </div>
  )
}

export default function SequenceRelance({ deal, set, today = jourISO() }) {
  const [choix, setChoix] = useState(SEQUENCES_LISTE[0]?.cle || '')
  if (!deal || typeof set !== 'function') return null

  // Un patch s'applique champ par champ : le formulaire n'expose qu'un
  // setter unitaire, et quatre appels successifs sur un setState
  // fonctionnel se cumulent sans perte.
  const appliquer = (patch) => {
    if (!patch) return
    for (const [cle, valeur] of Object.entries(patch)) set(cle, valeur)
  }

  // Sans séquence : choisir un gabarit et démarrer.
  if (!deal.sequence_key) {
    const selection = gabaritDe(choix)
    return (
      <div className="form-group">
        <label className="form-label" htmlFor="seq-relance-choix">Séquence de relance</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            id="seq-relance-choix"
            className="form-select"
            value={choix}
            onChange={(e) => setChoix(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          >
            {SEQUENCES_LISTE.map((g) => (
              <option key={g.cle} value={g.cle}>{g.libelle}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={!selection}
            onClick={() => appliquer(demarrerSequence(choix, today))}
            title="Pose l’étape 1 dans « Prochaine action », les suivantes s’armeront à chaque « Fait »"
          >
            Démarrer
          </button>
        </div>
        {selection && (
          <div className="form-hint">
            {selection.description} Étapes à {resumeDelais(selection)}, chacune armée quand la précédente est faite.
          </div>
        )}
      </div>
    )
  }

  // Avec séquence : le gabarit, ses étapes, et la sortie.
  const gabarit = gabaritDe(deal.sequence_key)
  const etapes = etapesDe(deal, today)
  // Une clé posée sans numéro d'étape valable (sauvegarde partielle, ligne
  // écrite à la main) : aucune étape n'est en cours, la séquence n'avance
  // plus. On le dit au lieu d'afficher trois étapes « à venir » muettes.
  const sansEtapeCourante = etapes.length > 0 && !etapes.some((e) => e.etat === 'en_cours')
  const boutonArreter = (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ padding: '2px 8px', fontSize: 11, flexShrink: 0 }}
      onClick={() => appliquer(arreterSequence())}
      title="Retire la séquence et vide la prochaine action"
    >
      Arrêter la séquence
    </button>
  )

  if (!gabarit) {
    // Clé absente de la config (gabarit retiré après coup) : on le dit et
    // on laisse sortir proprement plutôt que d'afficher un bloc vide.
    return (
      <div className="form-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <label className="form-label">Séquence de relance</label>
          {boutonArreter}
        </div>
        <div className="form-hint">Séquence inconnue ({String(deal.sequence_key)}) : le gabarit n’existe plus.</div>
      </div>
    )
  }

  return (
    <div className="form-group">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <label className="form-label">Séquence de relance · {gabarit.libelle}</label>
        {boutonArreter}
      </div>
      <div role="list" aria-label={`Étapes de la séquence ${gabarit.libelle}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {etapes.map((e) => <Etape key={e.numero} etape={e} />)}
      </div>
      <div className="form-hint">
        {sansEtapeCourante
          ? 'Aucune étape en cours sur ce dossier : la séquence ne s’armera pas. Arrêtez la séquence puis choisissez la de nouveau pour repartir de l’étape 1.'
          : 'L’étape suivante s’arme quand l’action en cours est marquée faite dans « Ma journée ». Aucun email n’est envoyé.'}
      </div>
    </div>
  )
}
