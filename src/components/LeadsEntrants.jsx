// ═══════════════════════════════════════════════════════════════════════════
// LEADS ENTRANTS : l'écran par défaut du domaine Leads
//
// Item A6 du plan d'amélioration. Jusqu'ici l'onglet Leads n'était qu'une
// iframe vers la Lead Room, avec une seconde connexion et un autre mot de
// passe : source récurrente de blocages. Cet écran lit la copie CRM des leads
// (public.leads, alimentée chaque jour par le pont) et en fait une liste de
// travail : à moi, nouveaux, pris par un collègue. L'iframe reste à un clic
// (« Ouvrir la Lead Room ») pour prendre ou rendre un lead, gestes qui
// restent là bas dans cette version : ici, aucune écriture dans leads.
//
// Le geste utile est « Créer le dossier » : il ouvre la modale dossier
// préremplie (nom, téléphone, email, source lead_room), le même brouillon
// que celui que le pont écrit quand un RDV est calé, sans lead_id (la copie
// CRM ne connaît pas l'identifiant Lead Room). C'est ce qui évite qu'une
// affaire signée là bas reste invisible ici.
//
// Périmètre : la RLS de leads (lecture pour tout membre actif) fait foi. Le
// bloc de rapprochement en bas est réservé au manager et passe par une
// fonction serveur qui vérifie le rôle elle même.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { SkeletonTable } from './ui/Skeleton'
import LeadsRapprochement from './LeadsRapprochement'
import { listRecents } from '../services/leads'
import {
  classerLeads, rechercherLeads, dossierPourLead, delaiPremierAppel,
  libelleDelai, libelleRecu,
} from '../lib/leads-entrants'
import { messageErreur } from '../lib/ui-shared'
import './leads-entrants.css'

// La liste se rafraîchit d'elle même : un lead reçu pendant qu'on regarde
// l'écran doit apparaître sans recharger la page.
const RAFRAICHISSEMENT_MS = 60000
const JOURS = 30

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

export default function LeadsEntrants({ profile, onCreerDossier, onOuvrirDossier, onOuvrirLeadRoom }) {
  const estManager = profile?.role === 'manager'
  const [leads, setLeads] = useState(null)         // null : pas encore chargé
  const [chargeLe, setChargeLe] = useState(() => new Date())
  const [erreur, setErreur] = useState(null)
  const [requete, setRequete] = useState('')

  useEffect(() => {
    let vivant = true
    async function charger() {
      try {
        const liste = await listRecents({ jours: JOURS })
        if (!vivant) return
        setLeads(liste)
        setChargeLe(new Date())
        setErreur(null)
      } catch (e) {
        if (vivant) setErreur(messageErreur(e))
      }
    }
    charger()
    const minuterie = setInterval(charger, RAFRAICHISSEMENT_MS)
    return () => { vivant = false; clearInterval(minuterie) }
  }, [])

  // Le classement se fait sur tout, la recherche se fait groupe par groupe :
  // l'en tête compte les leads, pas les résultats de la recherche.
  const tous = useMemo(
    () => classerLeads(leads || [], { profileId: profile?.id, today: chargeLe }),
    [leads, profile?.id, chargeLe],
  )
  const delai = useMemo(() => delaiPremierAppel(leads || [], { today: chargeLe }), [leads, chargeLe])

  // « Créer le dossier » n'est pas proposé sur un lead pris par un collègue :
  // son brouillon, posé par le pont sous son code, est invisible pour moi
  // (RLS), et je créerais un second dossier pour la même affaire. La
  // direction, qui voit tous les dossiers, garde le geste partout.
  const groupes = useMemo(() => [
    { cle: 'aMoi', titre: 'À moi', dot: 'le-dot-moi', items: rechercherLeads(tous.aMoi, requete), creation: true },
    { cle: 'nouveaux', titre: 'Nouveaux, personne ne les a pris', dot: 'le-dot-nouveau', items: rechercherLeads(tous.nouveaux, requete), creation: true },
    { cle: 'enCours', titre: 'Pris par un collègue', dot: 'normal', items: rechercherLeads(tous.enCours, requete), creation: estManager },
  ], [tous, requete, estManager])

  const sousTitre = [
    `${pluriel(tous.nouveaux.length, 'nouveau', 'nouveaux')} · ${tous.aMoi.length} à moi`,
    delai != null ? `délai médian avant premier appel : ${libelleDelai(delai)}` : null,
  ].filter(Boolean).join(' · ')

  const creer = (lead) => onCreerDossier?.(dossierPourLead(lead, profile?.advisor_code))
  const enChargement = leads === null && !erreur
  const vide = Array.isArray(leads) && leads.length === 0

  return (
    <div className="le">
      <div className="section-header">
        <div>
          <div className="section-kicker">Leads</div>
          <div className="section-title">Leads entrants</div>
          <div className="section-sub">{sousTitre}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOuvrirLeadRoom?.()}>
          Ouvrir la Lead Room
        </button>
      </div>

      <div className="le-outils">
        <input
          className="form-input"
          type="search"
          value={requete}
          onChange={(e) => setRequete(e.target.value)}
          placeholder="Chercher un nom, une campagne, un numéro"
          aria-label="Chercher un lead"
        />
      </div>

      {erreur && <div className="notice notice-error" role="alert">{erreur}</div>}
      {enChargement && <SkeletonTable rows={5} cols={4} />}

      {vide && (
        <div className="table-empty-state">
          <div className="empty-title">Aucun lead reçu ces {JOURS} derniers jours</div>
          <div className="empty-sub">Le pont depuis la Lead Room alimente cette liste chaque jour.</div>
        </div>
      )}

      {Array.isArray(leads) && leads.length > 0 && (
        <>
          {groupes.map((g) => (
            <section key={g.cle} className="le-groupe" aria-labelledby={`le-groupe-${g.cle}`}>
              <h3 id={`le-groupe-${g.cle}`} className="le-groupe-titre">
                {g.titre}
                <span className="le-groupe-nombre">{g.items.length}</span>
              </h3>
              {g.items.length === 0 ? (
                <div className="le-vide">
                  {requete.trim() ? `Aucun lead ne correspond à « ${requete.trim()} » ici.` : 'Aucun lead.'}
                </div>
              ) : (
                <ul className="priorities-list le-liste">
                  {g.items.map((lead) => (
                    <li key={lead.id} className="priority-item le-ligne">
                      <span className={`priority-item-dot ${g.dot}`} aria-hidden="true" />
                      <div className="le-identite">
                        <div className="priority-item-client">{lead.nom || 'Sans nom'}</div>
                        <div className="le-meta">
                          {lead.campagne && <span className="le-chip" title="Campagne">{lead.campagne}</span>}
                          <span>{libelleRecu(lead, chargeLe)}</span>
                        </div>
                      </div>
                      {lead.telephoneAppel ? (
                        <a className="le-tel tnum" href={`tel:${lead.telephoneAppel}`} title="Appeler">
                          {lead.telephoneAffiche}
                        </a>
                      ) : (
                        <span className="le-tel le-tel-vide">sans numéro</span>
                      )}
                      {g.creation ? (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => creer(lead)}>
                          Créer le dossier
                        </button>
                      ) : (
                        <span className="le-discret" title="Le dossier se crée depuis le compte du conseiller qui a pris le lead">pris par un collègue</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {tous.morts.length > 0 && (
            <p className="le-morts">
              {pluriel(tous.morts.length, 'lead mort ou rendu', 'leads morts ou rendus')} sur la période, non affichés.
            </p>
          )}
        </>
      )}

      {profile?.role === 'manager' && (
        <LeadsRapprochement advisorCode={profile?.advisor_code} onCreerDossier={onCreerDossier} onOuvrirDossier={onOuvrirDossier} />
      )}
    </div>
  )
}
