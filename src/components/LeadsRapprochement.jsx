// ═══════════════════════════════════════════════════════════════════════════
// SIGNÉS DANS LA LEAD ROOM, PAS DANS LE CRM : le bloc manager
//
// La Lead Room connaît un statut « signed » que la copie CRM des leads n'a
// pas. Vérifié en base le 2 septembre : sur quatorze leads signés là bas,
// six ont un dossier « Signé » ici, sept un dossier resté en « Prévu · Autre »
// (jamais converti), un aucun dossier. Ce bloc rend cette fuite visible et
// offre le geste qui la referme : créer ou compléter le dossier.
//
// Les données viennent d'une fonction serveur (api/leads-rapprochement.js)
// qui vérifie le rôle manager elle même et lit la base de la Lead Room avec
// une clé qui ne quitte jamais le serveur. Jamais de montant ici.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { SkeletonTable } from './ui/Skeleton'
import { fetchRapprochement } from '../services/leadsRapprochement'
import { dossierPourLead } from '../lib/leads-entrants'
import { messageErreur } from '../lib/ui-shared'

const STATUT_LEAD_ROOM = { signed: 'Signé', rdv: 'RDV posé' }

const dateFr = (v) => {
  const d = new Date(v || '')
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LeadsRapprochement({ advisorCode, onCreerDossier, onOuvrirDossier }) {
  const [lignes, setLignes] = useState(null)      // null : pas encore chargé
  const [erreur, setErreur] = useState(null)
  const [nonConfigure, setNonConfigure] = useState(false)

  useEffect(() => {
    let vivant = true
    fetchRapprochement()
      .then((r) => { if (vivant) setLignes(Array.isArray(r?.lignes) ? r.lignes : []) })
      .catch((e) => {
        if (!vivant) return
        // Sans accès Lead Room côté serveur, le bloc se tait au lieu de
        // planter l'écran : la liste de travail au dessus reste utilisable.
        if (e?.nonConfigure) { setNonConfigure(true); setLignes([]); return }
        setErreur(messageErreur(e))
      })
    return () => { vivant = false }
  }, [])

  // Un dossier existe déjà (brouillon, en cours ou annulé) : on l'ouvre tel
  // quel. Créer un brouillon neuf à côté heurtait l'index unique sur lead_id
  // dès que le dossier existant n'était plus reconnu comme brouillon (un
  // Annulé par exemple). Sans dossier, on crée le brouillon avec le vrai
  // identifiant Lead Room, celui que le rapprochement lit.
  const ouvrir = (l) => {
    if (l.dossier?.id && onOuvrirDossier) return onOuvrirDossier(l.dossier.id)
    return onCreerDossier?.(
      dossierPourLead({ nom: l.nom, email: l.email, telephone: l.telephone }, l.conseiller || advisorCode, { leadRoomId: l.leadId }),
    )
  }

  return (
    <section className="le-rapprochement" aria-labelledby="le-rapprochement-titre">
      <div className="section-header">
        <div>
          <div className="section-kicker">Direction</div>
          <div id="le-rapprochement-titre" className="section-title" style={{ fontSize: 18 }}>
            Signés dans la Lead Room, pas dans le CRM
          </div>
          <div className="section-sub">
            Leads passés en « signé » ou « RDV posé » là bas ces 120 derniers jours, sans dossier signé ici.
          </div>
        </div>
      </div>

      {nonConfigure && (
        <p className="le-discret">
          Rapprochement indisponible : accès Lead Room non configuré côté serveur
          (variables LEADROOM_SUPABASE_URL et LEADROOM_SUPABASE_SERVICE_ROLE_KEY).
        </p>
      )}
      {erreur && <div className="notice notice-error" role="alert">{erreur}</div>}
      {lignes === null && !erreur && <SkeletonTable rows={3} cols={5} />}

      {Array.isArray(lignes) && lignes.length === 0 && !nonConfigure && !erreur && (
        <p className="le-discret">Rien à rattraper : chaque affaire signée là bas a son dossier signé ici.</p>
      )}

      {Array.isArray(lignes) && lignes.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Statut Lead Room</th>
                <th>Mis à jour</th>
                <th>Situation</th>
                <th>Conseiller</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const sansDossier = l.situation === 'sans_dossier'
                return (
                  <tr key={l.leadId}>
                    <td className="cell-primary">{l.nom || 'Sans nom'}</td>
                    <td>{STATUT_LEAD_ROOM[l.statutLeadRoom] || l.statutLeadRoom}</td>
                    <td className="tnum">{dateFr(l.majLe)}</td>
                    <td>
                      {sansDossier
                        ? <span className="le-situation-manque">aucun dossier</span>
                        : `dossier resté en ${l.dossier?.status || 'Prévu'} · ${l.dossier?.product || 'Autre'}`}
                    </td>
                    <td>{l.conseiller || 'inconnu'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => ouvrir(l)}>
                        {sansDossier ? 'Créer le dossier' : 'Ouvrir le dossier'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
