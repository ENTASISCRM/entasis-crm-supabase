// ═══════════════════════════════════════════════════════════════════════════
// FICHES À RATTRAPER : separer le prenom du nom, fiche par fiche, sous
// controle de la direction (item D6 du plan d amelioration).
//
// 331 fiches sur 381 ont tout dans le champ nom (« Aurélie Exemple ») et rien
// dans prenom. Cet ecran liste ces fiches, propose une separation par fiche
// (lib/noms, avec une confiance et une raison), et n ecrit QUE ce qu une
// personne a coche, relu, eventuellement corrige a la main, puis confirme.
// Seules les propositions de confiance haute sont cochees d avance.
//
// Rien ici ne contourne la RLS : chaque ecriture passe par
// appliquerSeparations, qui signale une fiche refusee au lieu de la compter.
//
// Deux garde fous ajoutes apres l audit du 2 septembre : une ligne retouchee
// a la main passe en puce « corrigée » (l heuristique ne repond plus d elle),
// et les fiches cochees que la recherche masque sont comptees avant l ecriture,
// dans le bandeau et dans la confirmation.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { separerNomComplet } from '../../lib/noms'
import { correspond } from '../../lib/recherche'
import { messageErreur } from '../../lib/ui-shared'
import { confirmDialog } from '../ui/confirm'
import { SkeletonTable } from '../ui/Skeleton'
import { listerFichesSansPrenom, appliquerSeparations } from '../../services/clients'

// Puces de confiance. Couleurs mesurees au seuil AA sur fond clair : les
// verts et oranges de la charte (badge-signed, badge-progress) passent sous
// 4,5:1 des qu ils portent du texte, d ou des teintes plus sombres ici.
const CONFIANCE = {
  haute: { label: 'sûre', couleur: '#1B7A3E', fond: 'rgba(52,199,89,0.12)' },
  moyenne: { label: 'probable', couleur: '#8A5300', fond: 'rgba(255,149,0,0.12)' },
  faible: { label: 'à vérifier', couleur: '#B4453B', fond: 'rgba(180,69,59,0.10)' },
  // Une ligne retouchee a la main ne porte plus le jugement de l heuristique :
  // c est la personne qui repond de la separation, la puce le dit.
  corrigee: { label: 'corrigée', couleur: '#1D4E89', fond: 'rgba(0,113,227,0.10)' },
}

function PuceConfiance({ confiance, raison }) {
  const c = CONFIANCE[confiance] || CONFIANCE.faible
  return (
    <span className="badge" title={raison} style={{ color: c.couleur, background: c.fond, borderColor: 'transparent' }}>
      {c.label}
    </span>
  )
}

// Tout ce qui decrit une ligne, pour la recherche tolerante.
function texteRecherche(l) {
  return [l.nomActuel, l.prenom, l.nom, l.advisor_code, l.email, l.telephone].filter(Boolean).join(' ')
}

const champInline = { height: 30, fontSize: 13, padding: '0 10px', minWidth: 120 }

/**
 * Applique une retouche a une ligne et remet la puce de confiance a jour.
 * Une valeur qui differe de la proposition passe la ligne en « corrigée » :
 * l heuristique ne repond plus d elle, c est la personne qui l a ecrite. Un
 * retour a la valeur proposee rend son jugement d origine a la ligne. Les
 * autres champs (la case a cocher) ne touchent pas a la puce.
 *
 * Fonction pure, exportee pour se tester sans navigateur.
 */
export function retoucherLigne(ligne, patch) {
  const suivant = { ...ligne, ...patch }
  if (!('prenom' in (patch || {})) && !('nom' in (patch || {}))) return suivant
  const p = suivant.propose || {}
  if (suivant.prenom === p.prenom && suivant.nom === p.nom) {
    return { ...suivant, confiance: p.confiance, raison: p.raison }
  }
  const origine = [p.prenom, p.nom].filter(Boolean).join(' ')
  return {
    ...suivant,
    confiance: 'corrigee',
    raison: `Corrigé à la main, proposition d'origine : « ${origine || 'aucune'} »`,
  }
}

export default function RattrapageFiches({ profile }) {
  const estManager = profile?.role === 'manager'
  const [lignes, setLignes] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    if (!estManager) { setChargement(false); return }
    let actif = true
    setChargement(true)
    setErreur(null)
    listerFichesSansPrenom()
      .then((fiches) => {
        if (!actif) return
        setLignes(fiches.map((f) => {
          const p = separerNomComplet(f.nom)
          return {
            id: f.id,
            nomActuel: f.nom,
            advisor_code: f.advisor_code,
            email: f.email,
            telephone: f.telephone,
            prenom: p.prenom,
            nom: p.nom,
            confiance: p.confiance,
            raison: p.raison,
            coche: p.confiance === 'haute',
            // La proposition d origine, pour savoir si la ligne a ete
            // retouchee et pouvoir revenir a son jugement initial.
            propose: { prenom: p.prenom, nom: p.nom, confiance: p.confiance, raison: p.raison },
          }
        }))
      })
      .catch((e) => {
        if (!actif) return
        setErreur(messageErreur(e))
        toast.error('Chargement impossible : ' + messageErreur(e))
      })
      .finally(() => { if (actif) setChargement(false) })
    return () => { actif = false }
  }, [estManager])

  const visibles = useMemo(
    () => (recherche.trim() ? lignes.filter((l) => correspond(texteRecherche(l), recherche)) : lignes),
    [lignes, recherche],
  )
  const cochees = useMemo(() => lignes.filter((l) => l.coche), [lignes])
  // Ce qui partirait sans etre a l ecran : la recherche cache des lignes, les
  // cases cochees, elles, restent. On ne change pas ce comportement (on perdrait
  // une selection en tapant dans le champ), on le dit avant d ecrire.
  const horsFiltre = useMemo(() => {
    if (!recherche.trim()) return 0
    const vus = new Set(visibles.map((l) => l.id))
    return cochees.filter((l) => !vus.has(l.id)).length
  }, [cochees, visibles, recherche])

  const modifier = (id, patch) => setLignes((prev) => prev.map((l) => (l.id === id ? retoucherLigne(l, patch) : l)))
  // Cocher n a jamais decoche : une ligne relue puis corrigee a la main reste
  // cochee. Pour repartir de zero, « Tout décocher ». Avec une recherche en
  // cours, on ne coche que ce qui est affiche.
  const cocherSures = () => setLignes((prev) => {
    const vus = new Set(visibles.map((l) => l.id))
    const filtre = recherche.trim().length > 0
    return prev.map((l) => ((l.confiance === 'haute' && (!filtre || vus.has(l.id))) ? { ...l, coche: true } : l))
  })
  const toutDecocher = () => setLignes((prev) => prev.map((l) => ({ ...l, coche: false })))

  async function appliquer() {
    if (enCours || cochees.length === 0) return
    const sansNom = cochees.filter((l) => !String(l.nom || '').trim())
    if (sansNom.length > 0) {
      toast.error(`${sansNom.length} fiche${sansNom.length > 1 ? 's' : ''} cochée${sansNom.length > 1 ? 's' : ''} sans nom proposé : corrigez ou décochez avant d'appliquer.`)
      return
    }
    const n = cochees.length
    const ok = await confirmDialog({
      title: `Appliquer ${n} séparation${n > 1 ? 's' : ''} ?`,
      message: [
        'Le prénom et le nom proposés seront écrits sur chaque fiche cochée. Les fiches non cochées ne bougent pas.',
        horsFiltre > 0
          ? `Attention : ${horsFiltre} fiche${horsFiltre > 1 ? 's cochées ne sont' : ' cochée n\'est'} pas affichée${horsFiltre > 1 ? 's' : ''} avec la recherche en cours, ${horsFiltre > 1 ? 'elles partiront' : 'elle partira'} aussi.`
          : null,
      ].filter(Boolean).join(' '),
      confirmLabel: 'Appliquer',
    })
    if (!ok) return

    setEnCours(true)
    try {
      const { faites, echecs } = await appliquerSeparations(
        cochees.map((l) => ({ id: l.id, prenom: l.prenom, nom: l.nom })),
      )
      const faitesSet = new Set(faites)
      setLignes((prev) => prev.filter((l) => !faitesSet.has(l.id)))
      if (faites.length > 0) {
        toast.success(`${faites.length} fiche${faites.length > 1 ? 's' : ''} mise${faites.length > 1 ? 's' : ''} à jour`)
      }
      if (echecs.length > 0) {
        toast.error(`${echecs.length} fiche${echecs.length > 1 ? 's' : ''} refusée${echecs.length > 1 ? 's' : ''} : ${echecs[0].message}`)
      }
    } catch (e) {
      toast.error('Erreur : ' + messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  if (!estManager) {
    return (
      <div className="card">
        <div className="table-empty-state">
          <div style={{ fontSize: 16, color: 'var(--t2)' }}>Réservé à la direction</div>
          <div className="form-hint" style={{ marginTop: 8 }}>Le rattrapage des fiches clients est réservé au manager.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-title">Fiches à rattraper</div>
          <div className="section-sub">
            {chargement
              ? 'Chargement…'
              : `${lignes.length} fiche${lignes.length > 1 ? 's' : ''} sans prénom · ${cochees.length} cochée${cochees.length > 1 ? 's' : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={cocherSures} disabled={chargement || lignes.length === 0}>
            {recherche.trim() ? 'Cocher les propositions sûres affichées' : 'Tout cocher les propositions sûres'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={toutDecocher} disabled={chargement || cochees.length === 0}>
            Tout décocher
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={appliquer} disabled={chargement || enCours || cochees.length === 0}>
            {enCours ? 'Application…' : `Appliquer la sélection${cochees.length ? ` (${cochees.length})` : ''}`}
          </button>
          {horsFiltre > 0 && (
            <span className="form-hint" style={{ alignSelf: 'center', color: 'var(--t2)' }}>
              dont {horsFiltre} hors de la recherche
            </span>
          )}
        </div>
      </div>

      <div className="form-hint" style={{ marginBottom: 14 }}>
        Chaque ligne est une proposition. Corrigez le prénom et le nom à la main si besoin, cochez ce qui est juste,
        puis appliquez : rien n'est écrit sans être coché et confirmé. Seules les propositions sûres sont cochées d'avance.
      </div>

      <div className="table-toolbar" style={{ marginBottom: 14 }}>
        <input
          className="search-input"
          data-global-search
          placeholder="Rechercher : nom, prénom, email, téléphone, code conseiller"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      {chargement ? (
        <SkeletonTable rows={6} cols={6} />
      ) : erreur ? (
        <div className="notice notice-error">{erreur}</div>
      ) : lignes.length === 0 ? (
        <div className="card">
          <div className="table-empty-state">
            <div style={{ fontSize: 16, color: 'var(--t2)' }}>Aucune fiche à rattraper</div>
            <div className="form-hint" style={{ marginTop: 8 }}>Toutes les fiches visibles ont un prénom séparé du nom.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 36 }} aria-label="Sélection" />
                <th>Nom actuel</th>
                <th>Prénom proposé</th>
                <th>Nom proposé</th>
                <th>Confiance</th>
                <th>Conseiller</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--t3)', padding: 32 }}>
                    Aucune fiche ne correspond à la recherche.
                  </td>
                </tr>
              ) : visibles.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!l.coche}
                      onChange={(e) => modifier(l.id, { coche: e.target.checked })}
                      aria-label={`Cocher la fiche ${l.nomActuel}`}
                    />
                  </td>
                  <td className="cell-primary">{l.nomActuel}</td>
                  <td>
                    <input
                      className="form-input"
                      style={champInline}
                      value={l.prenom}
                      onChange={(e) => modifier(l.id, { prenom: e.target.value })}
                      placeholder="Prénom"
                      aria-label={`Prénom proposé pour ${l.nomActuel}`}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      style={champInline}
                      value={l.nom}
                      onChange={(e) => modifier(l.id, { nom: e.target.value })}
                      placeholder="Nom"
                      aria-label={`Nom proposé pour ${l.nomActuel}`}
                    />
                  </td>
                  <td><PuceConfiance confiance={l.confiance} raison={l.raison} /></td>
                  <td className="cell-mono">{l.advisor_code || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
