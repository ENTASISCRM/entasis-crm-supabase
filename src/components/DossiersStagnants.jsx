// ═══════════════════════════════════════════════════════════════════════════
// DOSSIERS SANS MOUVEMENT : les dossiers qui stagnent, à l'accueil
//
// Item C2 du plan d'amélioration. Un dossier « En cours » sans aucun
// mouvement depuis plus de trois semaines n'est plus dans la tête de
// personne : il n'a aucune relance datée, passée ou à venir (une relance,
// même en retard, est déjà dans la file du matin) et personne n'y a touché.
// Ce bloc le remet sous les yeux du conseiller avec quatre gestes :
//
//   Déjà signé         ouvre le dossier en Signé (onEdit), même chemin que le
//                      kanban : la modale exige la date de signature et la
//                      fiche client complète (verrou du 13 juillet). Jamais
//                      de passage en Signé d'un clic.
//   Toujours en cours  le dossier avance, rien à poser : on le marque vu, il
//                      sort de la liste et n'y revient qu'après 21 jours sans
//                      mouvement (le 22e jour, la règle est « plus de 21 »)
//   Relancer           ouvre le dossier (onEdit), le conseiller pose une action
//   Abandonner         passe le statut à « Annulé » (onQuickPatch) après
//                      confirmation, comme partout ailleurs ; le toast permet
//                      de revenir en arrière, mais updated_at ayant bougé, le
//                      dossier ne réapparaîtra ici que 21 jours plus tard :
//                      d'où la confirmation avant le geste
//
// Traiter une ligne la sort de la liste : ouvrir le dossier et le modifier
// rafraîchit updated_at, l'abandonner change le statut.
//
// Depuis le 2 septembre, à la demande de Louis, le bloc porte une seconde
// liste : les dossiers SIGNÉS dont la fiche client n'est pas finie. Un
// dossier signé n'a plus rien à relancer, mais il laisse une obligation, la
// fiche. Elle entre ici quand ni la signature ni la fiche n'ont bougé depuis
// 21 jours, un seul geste : Compléter la fiche (onOpenClient). Sur une fiche
// partagée, la ligne dit qui a saisi en dernier et quand, pour que le second
// conseiller ne refasse pas ce que le premier a fait.
//
// Chez le manager, le même bloc, précédé du compte par conseiller en petites
// puces, puis la liste de tout le cabinet. Aucun montant nulle part : on
// compte des dossiers et des jours, jamais de la rémunération.
//
// Même modèle visuel que la file du matin (ActionsDuJour dans App.jsx) et
// aucune classe nouvelle : ce bloc se lit comme la suite de Ma journée. Le
// calcul vit dans lib/stagnants.js, testé à part.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { confirmDialog } from './ui/confirm'
import { jourISO } from '../lib/ma-journee'
import { getClientName, nomClient } from '../lib/ui-shared'
import { dateCourte } from '../lib/completude'
import { listerPourCompletude } from '../services/clients'
import {
  dossiersStagnants, dossiersStagnantsCabinet, stagnantsParConseiller,
  fichesSigneesSansMouvement, fichesSigneesParConseiller, SEUIL_STAGNATION_JOURS,
} from '../lib/stagnants'

// Au delà, la liste des fiches se replie : cent fiches d'un coup sur un
// accueil ne se lisent pas, huit se traitent.
const FICHES_VISIBLES = 8

const Geste = ({ label, title, onClick }) => (
  <button className="btn btn-ghost btn-sm" title={title} style={{ padding: '2px 8px', fontSize: 11, flexShrink: 0 }}
    onClick={(e) => { e.stopPropagation(); onClick() }}>{label}</button>
)

// Une ligne : client, produit, ancienneté, quatre gestes. Le point passe en
// rouge au double du seuil, le dossier est alors vraiment perdu de vue.
const Ligne = ({ d, seuilJours, avecConseiller, onSigner, onGarderEnCours, onRelancer, onAbandonner }) => (
  <div className="priority-item" style={{ cursor: 'pointer' }} onClick={() => onRelancer(d)} title="Ouvrir le dossier">
    <div className={`priority-item-dot ${d.joursSansMouvement > seuilJours * 2 ? 'urgent' : 'high'}`} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="priority-item-client truncate">{getClientName(d)}</div>
      <div className="priority-item-detail">
        {avecConseiller && d.advisor_code ? `${d.advisor_code} · ` : ''}
        {d.product || 'Produit non renseigné'} · {d.joursSansMouvement} jours sans mouvement
      </div>
    </div>
    <div style={{ display: 'inline-flex', gap: 2, marginLeft: 6 }}>
      <Geste label="Déjà signé" title="Ouvrir le dossier en Signé pour poser la date de signature (la fiche client doit être complète)" onClick={() => onSigner(d)} />
      <Geste label="Toujours en cours" title={`Le dossier avance : il reste en cours et ne revient dans ce bloc qu après ${seuilJours} jours sans mouvement`} onClick={() => onGarderEnCours(d)} />
      <Geste label="Relancer" title="Ouvrir le dossier pour poser une relance" onClick={() => onRelancer(d)} />
      <Geste label="Abandonner" title="Passer le dossier en Annulé (annulable)" onClick={() => onAbandonner(d)} />
    </div>
  </div>
)

// Qui a saisi la fiche en dernier, vu par la personne qui regarde. « Vous »
// si c'est elle, le code du collègue sinon : c'est ce qui évite au second
// conseiller de refaire ce que le premier a fait.
const derniereSaisie = (f, code) => {
  if (!f.majLe) return null
  const quand = dateCourte(f.majLe)
  if (!f.majPar) return `fiche modifiée le ${quand}`
  if (code && f.majPar === code) return `vous avez saisi le ${quand}`
  return `${f.majPar} a saisi le ${quand}`
}

// Une fiche de dossier signé à finir : client, conseiller, produit, date de
// signature, complétude, et le co conseiller quand il y en a un.
const LigneFiche = ({ f, seuilJours, avecConseiller, code, onCompleter }) => {
  const autre = [f.deal.advisor_code, f.coConseiller].filter((c) => c && c !== code)
  const partage = f.coConseiller
    ? (avecConseiller ? `avec ${f.coConseiller}` : (autre[0] ? `avec ${autre[0]}` : null))
    : null
  const saisie = derniereSaisie(f, code)
  const n = f.manquants.length
  return (
    <div className="priority-item" style={{ cursor: 'pointer' }} onClick={() => onCompleter(f)} title="Ouvrir la fiche client">
      <div className={`priority-item-dot ${f.joursSansMouvement > seuilJours * 2 ? 'urgent' : 'high'}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="priority-item-client truncate">{nomClient(f.client)}</div>
        <div className="priority-item-detail">
          {avecConseiller && f.deal.advisor_code ? `${f.deal.advisor_code} · ` : ''}
          {f.deal.product || 'Produit non renseigné'}
          {f.nbDossiers > 1 ? ` (+${f.nbDossiers - 1})` : ''}
          {f.signeLe ? ` · signé le ${dateCourte(f.signeLe)}` : ''}
          {` · fiche à ${f.score} %, ${n} champ${n > 1 ? 's' : ''} manquant${n > 1 ? 's' : ''}`}
          {` · ${f.joursSansMouvement} jours sans mouvement`}
          {partage ? ` · ${partage}` : ''}
          {saisie ? ` · ${saisie}` : ''}
        </div>
      </div>
      <div style={{ display: 'inline-flex', gap: 2, marginLeft: 6 }}>
        <Geste label="Compléter la fiche" title="Ouvrir la fiche client pour renseigner les champs manquants" onClick={() => onCompleter(f)} />
      </div>
    </div>
  )
}

export default function DossiersStagnants({ deals, profile, onEdit, onQuickPatch, onOpenClient, clients: clientsFournis, seuilJours = SEUIL_STAGNATION_JOURS }) {
  const today = jourISO()
  const isManager = profile?.role === 'manager'
  const code = profile?.advisor_code

  // Les fiches viennent du même service que le bloc « Compléter ces
  // fiches » : la RLS rend au conseiller les siennes, à la direction toutes.
  // Un appelant (test, harnais) peut les fournir directement.
  const [clientsCharges, setClientsCharges] = useState([])
  useEffect(() => {
    if (clientsFournis) return undefined
    let actif = true
    listerPourCompletude()
      .then((fiches) => { if (actif) setClientsCharges(fiches) })
      // Sans fiches, la première liste s'affiche quand même : on ne bloque
      // pas les dossiers en cours sur une panne de lecture des fiches.
      .catch(() => {})
    return () => { actif = false }
  }, [clientsFournis])
  const clients = clientsFournis || clientsCharges

  const liste = useMemo(() => (isManager
    ? dossiersStagnantsCabinet(deals, { today, seuilJours })
    : dossiersStagnants(deals, { advisorCode: code, today, seuilJours })),
  [deals, isManager, code, today, seuilJours])

  const repartition = useMemo(() => (isManager
    ? stagnantsParConseiller(deals, { today, seuilJours })
    : []),
  [deals, isManager, today, seuilJours])

  const fiches = useMemo(() => fichesSigneesSansMouvement(deals, clients, {
    advisorCode: isManager ? null : code, today, seuilJours,
  }), [deals, clients, isManager, code, today, seuilJours])

  const repartitionFiches = useMemo(() => (isManager
    ? fichesSigneesParConseiller(deals, clients, { today, seuilJours })
    : []),
  [deals, clients, isManager, today, seuilJours])

  const [toutesLesFiches, setToutesLesFiches] = useState(false)

  if (!liste.length && !fiches.length) return null

  const relancer = (d) => onEdit?.(d)
  // Même chemin que le kanban quand on glisse un dossier en Signé : la modale
  // s'ouvre en Signé, elle exige la date de signature et la fiche client
  // complète. C'est elle qui tient le verrou, pas ce bloc.
  const signer = (d) => onEdit?.({ ...d, status: 'Signé' })
  // Le dossier avance mais rien n'est à poser : on le marque vu. En base, le
  // déclencheur remet updated_at à l'instant de l'écriture ; on le pose aussi
  // en local pour que la ligne sorte tout de suite, sans rechargement. Pas
  // d'annulation : la seule conséquence est un retour ici après 21 jours.
  // La direction voit tout le cabinet : sur le dossier d'un autre, le geste
  // sort le dossier de l'accueil de ce conseiller sans qu'il le sache, on
  // confirme donc avant.
  const garderEnCours = async (d) => {
    const titulaire = d.advisor_code || d.co_advisor_code
    const dUnAutre = isManager && code && titulaire && d.advisor_code !== code && d.co_advisor_code !== code
    if (dUnAutre && !(await confirmDialog({
      title: `Garder en cours le dossier de ${getClientName(d)} ?`,
      message: `Ce dossier est celui de ${titulaire}. Il sortira aussi de son accueil, et n'y reviendra qu'après ${seuilJours} jours sans mouvement.`,
      confirmLabel: 'Garder en cours',
    }))) return
    onQuickPatch?.(
      d,
      { status: 'En cours', updated_at: new Date().toISOString() },
      `Dossier gardé en cours · ${getClientName(d)} · il ne reviendra ici qu après ${seuilJours} jours sans mouvement`,
    )
  }
  // Confirmation d'abord (le passage en Annulé est confirmé partout
  // ailleurs), puis écriture optimiste et annulable : quickPatchDeal
  // restaure l'ancien statut depuis le toast, même filet que le kanban.
  const abandonner = async (d) => {
    const ok = await confirmDialog({
      title: `Abandonner le dossier de ${getClientName(d)} ?`,
      message: 'Il passera en Annulé et sortira du pipeline.',
      confirmLabel: 'Abandonner',
      danger: true,
    })
    if (!ok) return
    onQuickPatch?.(d, { status: 'Annulé' }, `Dossier abandonné · ${getClientName(d)}`, { undoable: true })
  }
  const completer = (f) => onOpenClient?.(f.client.id)

  const n = liste.length
  const nf = fiches.length
  const fichesAffichees = toutesLesFiches ? fiches : fiches.slice(0, FICHES_VISIBLES)
  const enCoConseil = fiches.filter((f) => f.coConseiller).length

  return (
    <div style={{ marginTop: 28 }}>
      <div className="section-header">
        <div>
          <div className="section-kicker">{isManager ? 'Vue direction · à relancer ou à clore' : 'À relancer ou à clore'}</div>
          <div className="section-title">Dossiers sans mouvement</div>
          <div className="section-sub">
            {n > 0
              ? <>{n} dossier{n > 1 ? 's' : ''} en cours depuis plus de {seuilJours} jours
                {isManager && repartition.length > 0 ? ` · ${repartition.length} conseiller${repartition.length > 1 ? 's' : ''}` : ''}</>
              : <>Aucun dossier en cours sans mouvement</>}
            {nf > 0 ? ` · ${nf} fiche${nf > 1 ? 's' : ''} de dossier${nf > 1 ? 's' : ''} signé${nf > 1 ? 's' : ''} à compléter` : ''}
          </div>
        </div>
      </div>

      {isManager && repartition.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {repartition.map((r) => (
            <span key={r.advisorCode} className="badge badge-normal" title={`Le plus ancien : ${r.plusAncienJours} jours sans mouvement`}>
              {r.advisorCode} · <span className="tnum">{r.nombre}</span>
            </span>
          ))}
        </div>
      )}
      {n > 0 && (
        <div className="priorities-list">
          {liste.map((d) => (
            <Ligne key={d.id} d={d} seuilJours={seuilJours} avecConseiller={isManager}
              onSigner={signer} onGarderEnCours={garderEnCours} onRelancer={relancer} onAbandonner={abandonner} />
          ))}
        </div>
      )}

      {nf > 0 && (
        <div style={{ marginTop: n > 0 ? 18 : 0 }}>
          <div className="section-header" style={{ marginBottom: 8 }}>
            <div>
              <div className="section-kicker">{isManager ? 'Vue direction · signés, fiche à finir' : 'Signés, fiche à finir'}</div>
              <div className="section-sub">
                {nf} fiche{nf > 1 ? 's' : ''} de dossier{nf > 1 ? 's' : ''} signé{nf > 1 ? 's' : ''} incomplète{nf > 1 ? 's' : ''}, sans saisie depuis plus de {seuilJours} jours
                {enCoConseil > 0 ? ` · ${enCoConseil} en co conseil` : ''}
                {isManager && repartitionFiches.length > 0 ? ` · ${repartitionFiches.length} conseiller${repartitionFiches.length > 1 ? 's' : ''}` : ''}
              </div>
            </div>
          </div>
          {isManager && repartitionFiches.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {repartitionFiches.map((r) => (
                <span key={r.advisorCode} className="badge badge-normal" title={`La plus ancienne : ${r.plusAncienJours} jours sans mouvement`}>
                  {r.advisorCode} · <span className="tnum">{r.nombre}</span>
                </span>
              ))}
            </div>
          )}
          <div className="priorities-list">
            {fichesAffichees.map((f) => (
              <LigneFiche key={f.client.id} f={f} seuilJours={seuilJours} avecConseiller={isManager} code={code}
                onCompleter={completer} />
            ))}
          </div>
          {nf > FICHES_VISIBLES && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
              onClick={() => setToutesLesFiches((v) => !v)}>
              {toutesLesFiches ? `Replier, ne garder que les ${FICHES_VISIBLES} plus anciennes` : `Voir les ${nf - FICHES_VISIBLES} autres`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
