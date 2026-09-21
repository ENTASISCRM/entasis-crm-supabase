// ═══════════════════════════════════════════════════════════════════════════
// GRAPHIQUES DU PILOTAGE : trois vues chart.js, chargées à part
//
// Chargé en lazy par Pilotage.jsx : chart.js pèse lourd et la direction ne
// regarde pas toujours les courbes. Chaque graphique est doublé d un tableau
// (« Valeurs ») qui porte exactement les mêmes nombres : un lecteur d écran,
// une impression ou un doute sur une barre trouvent la valeur écrite.
//
// Sobre : or, navy et vert (le validé est vert partout dans le CRM), rien
// d autre. Aucune donnée de rémunération, aucun classement de personnes : on
// compte des modules, des minutes et des moyennes par compétence.
// ═══════════════════════════════════════════════════════════════════════════

import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend,
} from 'chart.js'
import { Bar, Chart } from 'react-chartjs-2'
import { formatDuree, semaineLibelle } from '../../lib/academy/format'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend)

const OR = '#C9A961'
const NAVY = '#0A1628'
const VERT = '#34C759'
const AIRE = 'rgba(201,169,97,0.16)'

const optionsBase = (suffixe) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
    tooltip: {
      callbacks: {
        label: (c) => `${c.dataset.label} : ${c.parsed.y}${suffixe || ''}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
  },
})

// Le cumul des validations, semaine après semaine.
function cumul(valeurs) {
  let total = 0
  return valeurs.map((v) => { total += Number(v) || 0; return total })
}

// Les scores par compétence arrivent en lignes (compétence, type) : on les
// range en une ligne par compétence avec les deux types côte à côte.
function pivoterScores(scores) {
  const parCompetence = new Map()
  for (const s of scores || []) {
    const cle = s.competence || 'Sans compétence'
    if (!parCompetence.has(cle)) parCompetence.set(cle, { competence: cle, initial: null, revision: null })
    const ligne = parCompetence.get(cle)
    const type = s.type === 'revision' ? 'revision' : 'initial'
    ligne[type] = { moyenne_pct: Number(s.moyenne_pct) || 0, effectif: Number(s.effectif) || 0, derniere_le: s.derniere_le }
  }
  return Array.from(parCompetence.values())
}

function CarteGraphique({ titre, sousTitre, children, valeurs }) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <div className="chart-title">{titre}</div>
          <div className="chart-subtitle">{sousTitre}</div>
        </div>
      </div>
      <div className="chart-body">
        <div className="acp-graphe">{children}</div>
        <details className="acp-valeurs">
          <summary>Valeurs</summary>
          {valeurs}
        </details>
      </div>
    </div>
  )
}

export default function GraphiquesPilotage({ semaines, scoresCompetences, effectif, periodeLibelle }) {
  const sem = Array.isArray(semaines) ? semaines : []
  const labels = sem.map((s) => semaineLibelle(s.semaine) || String(s.semaine || ''))
  const valides = sem.map((s) => Number(s.valides) || 0)
  const validesCumules = cumul(valides)
  const affectations = sem.map((s) => Number(s.affectations) || 0)
  const minutes = sem.map((s) => Math.round((Number(s.temps_actif_s) || 0) / 60))
  const scores = pivoterScores(scoresCompetences)
  const sousTitre = `${effectif} collaborateur${effectif > 1 ? 's' : ''} affecté${effectif > 1 ? 's' : ''} · ${periodeLibelle}`

  const donneesActivite = {
    labels,
    datasets: [
      {
        type: 'line', label: 'Modules validés (cumul)', data: validesCumules,
        borderColor: VERT, backgroundColor: VERT, borderWidth: 2, tension: 0.3, pointRadius: 3, fill: false, order: 0,
      },
      {
        type: 'bar', label: 'Nouvelles affectations', data: affectations,
        backgroundColor: AIRE, borderColor: OR, borderWidth: 1, borderRadius: 4, order: 1,
      },
    ],
  }
  const donneesTemps = {
    labels,
    datasets: [{ label: 'Temps actif estimé (min)', data: minutes, backgroundColor: OR, borderRadius: 4 }],
  }
  const donneesScores = {
    labels: scores.map((s) => s.competence),
    datasets: [
      { label: 'Score initial (%)', data: scores.map((s) => (s.initial ? s.initial.moyenne_pct : null)), backgroundColor: NAVY, borderRadius: 4 },
      { label: 'Score de révision (%)', data: scores.map((s) => (s.revision ? s.revision.moyenne_pct : null)), backgroundColor: OR, borderRadius: 4 },
    ],
  }
  const optionsScores = optionsBase(' %')
  optionsScores.scales.y.max = 100

  return (
    <div className="acp-graphes">
      <CarteGraphique
        titre="Modules validés et nouvelles affectations par semaine"
        sousTitre={sousTitre}
        valeurs={(
          <table className="data-table">
            <thead><tr><th>Semaine</th><th>Validés</th><th>Validés (cumul)</th><th>Nouvelles affectations</th></tr></thead>
            <tbody>
              {sem.length === 0 ? (
                <tr><td colSpan={4} className="acp-rien">Aucune semaine sur la période</td></tr>
              ) : sem.map((s, i) => (
                <tr key={s.semaine || i}>
                  <td>{labels[i]}</td>
                  <td className="cell-mono">{valides[i]}</td>
                  <td className="cell-mono">{validesCumules[i]}</td>
                  <td className="cell-mono">{affectations[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      >
        {sem.length === 0
          ? <div className="acp-rien">Aucune donnée sur la période</div>
          : <Chart type="bar" data={donneesActivite} options={optionsBase()} aria-label="Modules validés cumulés et nouvelles affectations par semaine" />}
      </CarteGraphique>

      <CarteGraphique
        titre="Temps actif estimé par semaine"
        sousTitre={sousTitre}
        valeurs={(
          <table className="data-table">
            <thead><tr><th>Semaine</th><th>Minutes</th><th>Durée</th></tr></thead>
            <tbody>
              {sem.length === 0 ? (
                <tr><td colSpan={3} className="acp-rien">Aucune semaine sur la période</td></tr>
              ) : sem.map((s, i) => (
                <tr key={s.semaine || i}>
                  <td>{labels[i]}</td>
                  <td className="cell-mono">{minutes[i]}</td>
                  <td className="cell-mono">{formatDuree(s.temps_actif_s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      >
        {sem.length === 0
          ? <div className="acp-rien">Aucune donnée sur la période</div>
          : <Bar data={donneesTemps} options={optionsBase(' min')} aria-label="Temps actif estimé par semaine, en minutes" />}
      </CarteGraphique>

      <CarteGraphique
        titre="Scores initiaux et de révision par compétence"
        sousTitre={sousTitre}
        valeurs={(
          <table className="data-table">
            <thead><tr><th>Compétence</th><th>Initial</th><th>Effectif</th><th>Révision</th><th>Effectif</th></tr></thead>
            <tbody>
              {scores.length === 0 ? (
                <tr><td colSpan={5} className="acp-rien">Aucune tentative sur la période</td></tr>
              ) : scores.map((s) => (
                <tr key={s.competence}>
                  <td className="cell-primary">{s.competence}</td>
                  <td className="cell-mono">{s.initial ? `${s.initial.moyenne_pct} %` : 'Non évalué'}</td>
                  <td className="cell-mono">{s.initial ? s.initial.effectif : ''}</td>
                  <td className="cell-mono">{s.revision ? `${s.revision.moyenne_pct} %` : 'Non évalué'}</td>
                  <td className="cell-mono">{s.revision ? s.revision.effectif : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      >
        {scores.length === 0
          ? <div className="acp-rien">Aucune tentative sur la période</div>
          : <Bar data={donneesScores} options={optionsScores} aria-label="Scores moyens initiaux et de révision par compétence" />}
      </CarteGraphique>
    </div>
  )
}

