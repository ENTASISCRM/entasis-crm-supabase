// ═══════════════════════════════════════════════════════════════════════════
// EXPORTER POUR RECONTACT
//
// Demande de Louis du 24 septembre : une liste de leads à rappeler, sortie
// depuis l'écran, sans passer par l'éditeur SQL de la Lead Room. Le fichier
// part du navigateur, comme les autres exports du CRM, et laisse une trace
// serveur (SEC-07, journal des exports).
//
// Le bloc est replié par défaut et ne lit la base qu'à l'ouverture : la liste
// de travail du matin n'a pas à payer une seconde requête pour un geste
// occasionnel.
//
// Vocabulaire : aucune colonne ne dit qu'un lead a refusé, sur décision de
// Louis, et l'ancienneté se mesure sur le dernier mouvement, la copie CRM
// n'ayant pas de date de refus. Voir l'en tête de src/lib/leads-export.js.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { listSansSuite } from '../services/leads'
import {
  ANCIENNETE_JOURS, COLONNES_RECONTACT, NOMBRES,
  campagnesDe, lignesRecontact, nomFichierRecontact, resumeSelection, selectionRecontact,
} from '../lib/leads-export'
import { exporterCsv, suffixeDate } from '../lib/export-csv'
import { messageErreur } from '../lib/ui-shared'

const TOUTES = ''

export default function LeadsExportRecontact() {
  const [ouvert, setOuvert] = useState(false)
  const [leads, setLeads] = useState(null)      // null : pas encore chargé
  const [erreur, setErreur] = useState(null)
  const [campagne, setCampagne] = useState(TOUTES)
  const [nombre, setNombre] = useState(50)
  const [jours, setJours] = useState(ANCIENNETE_JOURS)
  const [avecRendus, setAvecRendus] = useState(false)

  useEffect(() => {
    if (!ouvert || leads !== null) return
    let vivant = true
    listSansSuite()
      .then((liste) => { if (vivant) { setLeads(liste); setErreur(null) } })
      .catch((e) => { if (vivant) setErreur(messageErreur(e)) })
    return () => { vivant = false }
  }, [ouvert, leads])

  const campagnes = useMemo(() => campagnesDe(leads || []), [leads])

  // Éligibles : tout ce qui passe les critères. Retenus : ce que le nombre
  // demandé garde. Le bandeau montre les deux, pour qu'on voie le reste.
  const eligibles = useMemo(
    () => selectionRecontact(leads || [], { campagne, avecRendus, jours, nombre: 0 }),
    [leads, campagne, avecRendus, jours],
  )
  const retenus = useMemo(
    () => (nombre > 0 ? eligibles.slice(0, nombre) : eligibles),
    [eligibles, nombre],
  )

  function exporter() {
    if (!retenus.length) return
    exporterCsv(
      nomFichierRecontact(campagne, suffixeDate()),
      COLONNES_RECONTACT,
      lignesRecontact(retenus),
      'leads',
    )
  }

  const enChargement = ouvert && leads === null && !erreur

  return (
    <section className="le-export" aria-labelledby="le-export-titre">
      <h3 id="le-export-titre" className="le-export-titre">
        <button
          type="button"
          className="le-export-bascule"
          aria-expanded={ouvert}
          onClick={() => setOuvert((v) => !v)}
        >
          {ouvert ? '▾' : '▸'} Exporter pour recontact
        </button>
      </h3>

      {!ouvert && (
        <p className="le-export-pitch">
          Les leads sans suite, à rappeler plus tard : une campagne, un nombre, un fichier.
        </p>
      )}

      {ouvert && (
        <>
          {erreur && <div className="notice notice-error" role="alert">{erreur}</div>}
          {enChargement && <p className="le-export-pitch">Lecture des leads sans suite…</p>}

          {Array.isArray(leads) && (
            <>
              <div className="le-export-champs">
                <label className="le-export-champ">
                  <span>Campagne</span>
                  <select className="form-input" value={campagne} onChange={(e) => setCampagne(e.target.value)}>
                    <option value={TOUTES}>Toutes les campagnes</option>
                    {campagnes.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label className="le-export-champ">
                  <span>Ancienneté</span>
                  <select className="form-input" value={jours} onChange={(e) => setJours(Number(e.target.value))}>
                    <option value={ANCIENNETE_JOURS}>Sans mouvement depuis plus de deux mois</option>
                    <option value={0}>Tous, quelle que soit la date</option>
                  </select>
                </label>

                <label className="le-export-champ">
                  <span>Nombre</span>
                  <select className="form-input" value={nombre} onChange={(e) => setNombre(Number(e.target.value))}>
                    {NOMBRES.map((n) => <option key={n} value={n}>{n} leads</option>)}
                    <option value={0}>Tous les éligibles</option>
                  </select>
                </label>
              </div>

              <label className="le-export-case">
                <input type="checkbox" checked={avecRendus} onChange={(e) => setAvecRendus(e.target.checked)} />
                <span>Inclure les leads rendus au pool, qu&apos;un collègue peut reprendre</span>
              </label>

              <div className="le-export-pied">
                <span className="le-export-compte">{resumeSelection(retenus.length, eligibles.length)}</span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={exporter}
                  disabled={!retenus.length}
                >
                  Télécharger le fichier
                </button>
              </div>

              <p className="le-export-note">
                Le fichier porte le nom, le numéro, l&apos;email, la campagne et les champs de
                qualification. Les notes d&apos;appel restent dans la Lead Room : à relire là bas
                avant de rappeler, une fiche peut porter un « ne pas rappeler ». Chaque export
                est tracé.
              </p>
            </>
          )}
        </>
      )}
    </section>
  )
}
