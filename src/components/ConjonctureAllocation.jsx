// ═══════════════════════════════════════════════════════════════════════════
// CONJONCTURE ET INFLEXIONS D'ALLOCATION
//
// Même doctrine que l'écran qui l'accueille : « RIEN N'EST INVENTÉ », le CRM
// affiche et contrôle, il ne conçoit pas. Ce bloc lit le régime de marché
// retenu par la direction, montre les inclinaisons qui en découlent avec leur
// raison et leur source, et laisse le moteur PROPOSER des inflexions de poids
// sur un pôle documenté.
//
// Le mot proposer est à prendre au pied de la lettre. Chaque inflexion
// s'accepte ou se refuse une par une, rien ne s'applique tout seul, rien ne
// part en base, et le tableau de l'allocation reste celui des documents
// source. Ce qui a été retenu sort par le bouton « Copier l'allocation ».
//
// Trois verrous posés par la direction, rappelés à l'écran parce qu'un
// conseiller qui ne voit pas une proposition doit savoir pourquoi :
//   • le pôle prudent Abeille ne bouge jamais ;
//   • aucun monétaire, fonds euro ou fonds d'attente n'est proposé ;
//   • le total ne se normalise jamais tout seul.
//
// Une inclinaison peut aussi ne rien trouver à viser. Les deux entrées les
// mieux sourcées de la note du 04/09/2026 visent la duration souveraine, et
// aucune catégorie des deux assureurs ne nomme un émetteur souverain : elles
// s'affichaient avec leur argument et rien en face. La colonne « Sur ce pôle »
// dit ce silence et sa raison, parce qu'un argument documenté sans réponse se
// lit comme une panne du moteur.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import {
  FAMILLES,
  REGIMES,
  REGIME_COURANT,
  INCLINAISONS,
} from '../config/conjoncture'
import {
  estVerrouille,
  proposerInflexions,
  appliquerPropositions,
  inclinaisonsSansCible,
} from '../lib/moteur-allocation'
import { totalPoids } from '../config/allocations'

const pct = (n) => `${String(Math.round(Number(n) * 10) / 10).replace('.', ',')} %`

const nomFamille = (cle) => FAMILLES.find((f) => f.cle === cle)?.nom || cle

// La même liste vide à chaque rendu, pour que « rien de retenu » ne se
// distingue pas de lui même d'un rendu à l'autre et ne relance pas les calculs.
const AUCUN_RETENU = []

const TON_SENS = { renforcer: 'badge-signed', alleger: 'badge-progress', maintenir: 'badge-normal' }
const LIBELLE_SENS = { renforcer: 'Renforcer', alleger: 'Alléger', maintenir: 'Maintenir' }

// Les dates du cadre sont écrites en ISO. On les rend au format du cabinet,
// sans jamais recomposer une date qu'on ne reconnaît pas.
function dateLisible(valeur) {
  const s = String(valeur || '').trim()
  const jour = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return jour ? `${jour[3]}/${jour[2]}/${jour[1]}` : s
}

// Une source peut être une phrase ou une fiche. On accepte les deux plutôt
// que d'imposer une forme au fichier de conjoncture.
function libelleSource(s) {
  if (!s) return ''
  if (typeof s === 'string') return s
  const morceaux = [s.titre || s.nom || s.libelle, s.auteur || s.maison, s.date || s.publieLe]
  return morceaux.filter(Boolean).join(' · ') || s.url || ''
}

// Les raisons écrites dans la note font parfois mille signes : entières dans
// une colonne de tableau, elles rendent la ligne illisible. On montre la
// première phrase, celle qui porte le fait daté, et le raisonnement complet
// reste à un clic, jamais tronqué dans la donnée.
function resume(texte, max = 220) {
  const t = String(texte || '').trim()
  const fin = t.indexOf('. ')
  const phrase = fin > 40 ? t.slice(0, fin + 1) : t
  if (phrase.length <= max) return phrase
  const coupe = phrase.slice(0, max)
  return `${coupe.slice(0, coupe.lastIndexOf(' '))}…`
}

function Pourquoi({ texte, sources, libelle = 'Le raisonnement complet' }) {
  const complet = String(texte || '').trim()
  if (!complet) return <div className="form-hint">Raison non renseignée.</div>
  const debut = resume(complet)
  return (
    <>
      <div>{debut}</div>
      {debut !== complet && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--t3)' }}>
            {libelle}
          </summary>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--t2)' }}>{complet}</div>
        </details>
      )}
      <Sources sources={sources} />
    </>
  )
}

function Sources({ sources, id }) {
  const liste = (Array.isArray(sources) ? sources : sources ? [sources] : []).filter(Boolean)
  if (!liste.length) {
    return <div className="form-hint" id={id}>Source non renseignée.</div>
  }
  return (
    <details id={id} style={{ marginTop: 4 }}>
      <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--t3)' }}>
        {liste.length > 1 ? `${liste.length} sources` : 'Source'}
      </summary>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11.5, color: 'var(--t3)' }}>
        {liste.map((s, i) => (
          <li key={i} style={{ marginBottom: 2 }}>
            {typeof s === 'object' && s.url
              ? <a href={s.url} target="_blank" rel="noreferrer">{libelleSource(s) || s.url}</a>
              : libelleSource(s)}
          </li>
        ))}
      </ul>
    </details>
  )
}

// Ce que le moteur a trouvé, ou pas, en face d'une inclinaison, sur le pôle
// affiché. Les quatre silences ne se rattrapent pas de la même façon, ils ne se
// disent donc pas de la même façon :
//   une famille que la liste de l'assureur ne nomme pas est une limite de la
//   donnée, elle ne se corrige pas en arbitrant le portefeuille ;
//   une famille qu'aucune ligne du pôle ne porte est une information sur le
//   portefeuille, elle se regarde ;
//   un pôle verrouillé est une décision de la direction ;
//   une famille portée par le pôle et laissée immobile est un fait rendu tel
//   quel, sans lui inventer une cause.
//
// Un maintenir ne produit rien par construction : il ne s'affiche donc pas
// comme un manque, ce n'en est pas un.
function SurLePole({ inclinaison, entree, nbPropositions, nomPole, nomPartenaire }) {
  const doux = { fontSize: 12, color: 'var(--t3)' }

  if (inclinaison.sens === 'maintenir') {
    return (
      <div style={doux}>
        {inclinaison.famille
          ? 'Un maintenir ne déplace aucune ligne : rien n\'est attendu ici.'
          : "Cette entrée vise le calendrier d'exécution, pas une classe d'actifs."}
      </div>
    )
  }

  if (!entree) {
    // Servie : la réponse est dans le tableau des propositions, plus bas.
    if (!nbPropositions) return null
    return (
      <div style={doux}>
        {nbPropositions > 1
          ? `${nbPropositions} propositions ci dessous.`
          : 'Une proposition ci dessous.'}
      </div>
    )
  }

  if (entree.cause === 'pole_verrouille') {
    return <div style={doux}>Ce pôle ne bouge pas : décision de la direction.</div>
  }

  if (entree.cause === 'famille_absente_des_listes') {
    return (
      <div style={{ ...doux, color: 'var(--forecast)' }}>
        Rien à proposer ici, et le portefeuille n'y est pour rien : aucun support de
        la liste {nomPartenaire} ne se classe en « {nomFamille(entree.famille)} ».
        Ce que vise la note ne se lit pas dans les catégories de l'assureur, et
        aucun arbitrage sur ce pôle n'y changera quoi que ce soit.
      </div>
    )
  }

  if (entree.cause === 'aucune_ligne_du_pole') {
    // La phrase se dit de ce que le moteur sait lire : une ligne que la liste
    // du partenaire ne reconnaît pas ne dit rien de sa famille, et la réserve
    // s'écrit plutôt que de se taire.
    const inconnues = entree.lignesNonClassees || 0
    const reserve = inconnues > 0
      ? ` ${inconnues} ligne${inconnues > 1 ? 's' : ''} du pôle ${inconnues > 1 ? 'ne sont rattachées' : "n'est rattachée"} à aucune famille : la phrase ne ${inconnues > 1 ? 'les' : 'la'} compte pas.`
      : ''
    return (
      <div style={doux}>
        Rien à proposer ici : aucune ligne de {nomPole} n'appartient à la famille
        « {nomFamille(entree.famille)} ».{reserve}
      </div>
    )
  }

  return (
    <div style={doux}>
      Le pôle porte bien cette famille, et le moteur ne propose aucun mouvement
      dessus.
    </div>
  )
}

export default function ConjonctureAllocation({
  partenaire,
  poleAffiche,
  poleBas,
  poleHaut,
  lignes,
  univers,
  statutUnivers,
  erreurUnivers,
  onDemanderUnivers,
  onReessayerUnivers,
  onRetenues,
  onAllerAuCran,
}) {
  // Ce qui est coché à l'écran et ce que la copie emporte doivent être la même
  // chose à chaque rendu, pas seulement une fois les effets passés. Les cases
  // retiennent donc la clé du contexte dans lequel elles ont été cochées :
  // dès que ce contexte change, elles ne comptent plus, sans attendre l'effet
  // qui les efface. Incident du 04/09/2026, plus bas.
  const [retenus, setRetenus] = useState({ cle: '', isins: [] })

  const regime = useMemo(
    () => REGIMES.find((r) => r.cle === REGIME_COURANT.cle) || null,
    [],
  )
  const inclinaisons = useMemo(
    () => INCLINAISONS[REGIME_COURANT.cle] || [],
    [],
  )

  const verrouille = !!poleAffiche && estVerrouille(poleAffiche.id)

  const propositions = useMemo(() => {
    if (!poleAffiche || verrouille || !univers) return []
    return proposerInflexions({
      poleId: poleAffiche.id,
      lignes,
      regime: REGIME_COURANT.cle,
      univers,
    }) || []
  }, [poleAffiche, verrouille, univers, lignes])

  // Les inclinaisons qui ne trouvent rien à viser, et pourquoi. Le moteur ne
  // sait le dire qu'avec la liste des supports sous les yeux, sauf sur un pôle
  // verrouillé où la réponse est la décision elle même : hors de ces deux cas
  // la colonne ne s'affiche pas, plutôt que d'afficher un diagnostic à blanc.
  const colonneSurLePole = !!poleAffiche && (verrouille || statutUnivers === 'pret')

  const sansCible = useMemo(() => {
    if (!colonneSurLePole) return []
    return inclinaisonsSansCible({
      poleId: poleAffiche.id,
      lignes,
      regime: REGIME_COURANT.cle,
      univers,
    }) || []
  }, [colonneSurLePole, poleAffiche, lignes, univers])

  // Le rang, et pas la famille : deux entrées de la note visent les souverains,
  // elles doivent se lire chacune en face de son propre argument.
  const sansCibleParRang = useMemo(
    () => new Map(sansCible.map((e) => [e.rang, e])),
    [sansCible],
  )

  const propositionsParFamille = useMemo(() => {
    const compte = new Map()
    for (const p of propositions) compte.set(p.famille, (compte.get(p.famille) || 0) + 1)
    return compte
  }, [propositions])

  // Changer de pôle, de partenaire, de cran ou de poids change le jeu de
  // propositions : ce qui avait été retenu ne veut plus rien dire, on repart de
  // zéro.
  //
  // Les poids font partie de la clé, et c'est tout l'objet du correctif du
  // 04/09/2026. « Ramener à 100 % » ne change ni le pôle ni la liste des
  // supports, seulement leurs poids : la clé ne bougeait pas, les cases
  // restaient cochées et l'écran continuait d'annoncer deux inflexions
  // retenues, pendant que l'écran du dessus avait déjà vidé les siennes. Le
  // conseiller collait au client une allocation sans les inflexions qu'il
  // croyait emporter.
  const cleContexte = `${poleAffiche?.id || ''}|${propositions.map((p) => `${p.isin}:${p.poids}>${p.poidsPropose}`).join(',')}`
  const retenusIci = retenus.cle === cleContexte ? retenus.isins : AUCUN_RETENU
  useEffect(() => {
    setRetenus({ cle: cleContexte, isins: [] })
    onRetenues([])
  }, [cleContexte, onRetenues])

  const propositionsRetenues = useMemo(
    () => propositions.filter((p) => retenusIci.includes(p.isin)),
    [propositions, retenusIci],
  )

  // Le total se recalcule sous les yeux du conseiller, et il reste ce qu'il
  // est : aucune remise à 100 % automatique, verrou de la direction.
  const totalAvant = totalPoids(lignes)
  const totalApres = useMemo(
    () => (propositionsRetenues.length
      ? totalPoids(appliquerPropositions(lignes, propositionsRetenues))
      : totalAvant),
    [lignes, propositionsRetenues, totalAvant],
  )

  function basculer(isin) {
    const suivant = retenusIci.includes(isin)
      ? retenusIci.filter((i) => i !== isin)
      : [...retenusIci, isin]
    // La coche est datée du contexte où elle a été faite : c'est ce qui permet
    // de la retirer du rendu dès que ce contexte change.
    setRetenus({ cle: cleContexte, isins: suivant })
    onRetenues(propositions.filter((p) => suivant.includes(p.isin)))
  }

  return (
    <div className="card" style={{ marginTop: 20, padding: 20 }}>
      <div className="section-header" style={{ marginBottom: 14 }}>
        <div>
          <div className="section-kicker">Conjoncture</div>
          <div className="section-title" style={{ fontSize: 17 }}>
            {regime?.nom || REGIME_COURANT.cle}
          </div>
          <div className="section-sub">
            Régime retenu le {dateLisible(REGIME_COURANT.retenuLe)}
            {regime?.resume ? ` · ${regime.resume}` : ''}
          </div>
        </div>
      </div>

      {/* La note de la direction fait plusieurs milliers de signes : on ouvre
          sur le fait qui qualifie le régime, le reste se déplie. */}
      <div
        id="conjoncture-source-regime"
        style={{ borderLeft: '2px solid var(--gold)', paddingLeft: 12, fontSize: 12.5, color: 'var(--t2)' }}
      >
        {REGIME_COURANT.note
          ? (
            <Pourquoi
              texte={REGIME_COURANT.note}
              sources={REGIME_COURANT.source}
              libelle="La note complète"
            />
          )
          : <Sources sources={REGIME_COURANT.source} />}
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--t3)' }}>
          Les {REGIMES.length} régimes du cadre
        </summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--t3)' }}>
          {REGIMES.map((r) => (
            <li key={r.cle} style={{ marginBottom: 4 }}>
              <strong style={{ color: r.cle === REGIME_COURANT.cle ? 'var(--t1)' : 'inherit' }}>
                {r.nom}
              </strong>
              {r.cle === REGIME_COURANT.cle ? ' (en cours)' : ''}
              {r.resume ? ` · ${r.resume}` : ''}
            </li>
          ))}
        </ul>
      </details>

      {/* ── Les inclinaisons du régime, avant toute allocation ───────────── */}
      <div className="form-hint" style={{ marginTop: 18, fontWeight: 600, color: 'var(--t2)' }}>
        Ce que le régime incline, famille par famille
      </div>

      {inclinaisons.length === 0 ? (
        <div className="form-hint" style={{ marginTop: 8 }}>
          Aucune inclinaison n'est écrite pour ce régime.
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ce que le régime vise</th>
                <th>Sens</th>
                <th>Ampleur</th>
                {colonneSurLePole && <th>Sur ce pôle</th>}
                <th>Pourquoi</th>
              </tr>
            </thead>
            <tbody>
              {/* Une même famille porte parfois deux inclinaisons, la duration
                  longue et la dette française par exemple : la clé prend le
                  rang, sinon deux lignes se confondent. */}
              {inclinaisons.map((i, rang) => (
                <tr key={`${i.famille}-${rang}`}>
                  <td>
                    <div className="cell-primary">{i.classe || nomFamille(i.famille)}</div>
                    {i.classe && <div className="cell-sub">{nomFamille(i.famille)}</div>}
                  </td>
                  <td>
                    <span className={`badge ${TON_SENS[i.sens] || 'badge-normal'}`}>
                      {LIBELLE_SENS[i.sens] || i.sens}
                    </span>
                  </td>
                  <td>{i.ampleur}</td>
                  {colonneSurLePole && (
                    <td>
                      <SurLePole
                        inclinaison={i}
                        entree={sansCibleParRang.get(rang)}
                        nbPropositions={propositionsParFamille.get(i.famille) || 0}
                        nomPole={poleAffiche.nom}
                        nomPartenaire={partenaire.nom}
                      />
                    </td>
                  )}
                  <td><Pourquoi texte={i.pourquoi} sources={i.sources} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Les propositions du moteur sur le pôle affiché ───────────────── */}
      <div className="form-hint" style={{ marginTop: 22, fontWeight: 600, color: 'var(--t2)' }}>
        Propositions du moteur
      </div>

      {/* Arbitre par la direction le 04/09/2026 : sur un cran intermediaire, on
          ne propose rien plutot que de proposer sans source. Le melange des
          deux poles est une composition sur mesure, aucun document ne le
          porte, et une inflexion sans source n a pas sa place dans cet ecran. */}
      {!poleAffiche && (
        <>
          <div className="form-hint" style={{ marginTop: 8 }}>
            La molette est sur un mélange des deux pôles. Ce mélange est une
            composition sur mesure : il ne sort d'aucun document, et le moteur ne
            propose que sur un pôle documenté. Ramenez la molette sur un cran pour
            lire les inflexions du pôle concerné.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onAllerAuCran(0)}>
              Aller sur {poleBas.nom}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onAllerAuCran(100)}>
              Aller sur {poleHaut.nom}
            </button>
          </div>
        </>
      )}

      {poleAffiche && verrouille && (
        <div
          className="form-hint"
          style={{ marginTop: 8, borderLeft: '2px solid var(--progress)', paddingLeft: 12 }}
        >
          Le pôle {poleAffiche.nom} chez {partenaire.nom} ne bouge pas : décision de la
          direction. Aucune proposition, aucun calcul sur ce pôle.
        </div>
      )}

      {poleAffiche && !verrouille && (
        <>
          <div className="form-hint" style={{ marginTop: 8 }}>
            Pôle travaillé : {poleAffiche.nom} ({partenaire.nom}). Le moteur ne propose
            jamais un monétaire, un fonds euro ou un fonds d'attente, et il ne ramène
            jamais le total à 100 % de lui même.
          </div>

          {statutUnivers === 'inactif' && (
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={onDemanderUnivers}>
                Voir les propositions du moteur
              </button>
              <div className="form-hint" style={{ marginTop: 6 }}>
                La liste des supports du partenaire est lue à ce moment là, pas avant.
              </div>
            </div>
          )}

          {statutUnivers === 'chargement' && (
            <div className="form-hint" style={{ marginTop: 10 }} role="status">
              Lecture de la liste des supports {partenaire.nom} en cours…
            </div>
          )}

          {statutUnivers === 'erreur' && (
            <div
              className="form-hint"
              role="alert"
              style={{ marginTop: 10, color: 'var(--cancelled)', borderLeft: '2px solid var(--cancelled)', paddingLeft: 12 }}
            >
              Sans la liste des supports {partenaire.nom}, le moteur ne sait pas à quelle
              famille rattacher les lignes : aucune proposition n'est affichée
              {erreurUnivers ? ` (${erreurUnivers})` : ''}.
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={onReessayerUnivers}>
                  Réessayer
                </button>
              </div>
            </div>
          )}

          {statutUnivers === 'pret' && propositions.length === 0 && (
            <div className="form-hint" style={{ marginTop: 10 }}>
              Le régime en cours ne déplace aucune ligne de ce pôle. La colonne
              « Sur ce pôle » du tableau ci dessus dit, inclinaison par inclinaison,
              ce qui n'a rien trouvé à viser et pourquoi.
            </div>
          )}

          {statutUnivers === 'pret' && propositions.length > 0 && (
            <>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Retenir</th>
                      <th>Support</th>
                      <th>Famille</th>
                      <th>Sens</th>
                      <th style={{ textAlign: 'right' }}>Poids</th>
                      <th>Pourquoi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propositions.map((p) => {
                      const coche = retenusIci.includes(p.isin)
                      return (
                        <tr key={p.isin}>
                          <td>
                            <input
                              type="checkbox"
                              checked={coche}
                              onChange={() => basculer(p.isin)}
                              aria-label={`Retenir l'inflexion sur ${p.fonds} : ${pct(p.poids)} vers ${pct(p.poidsPropose)}`}
                            />
                          </td>
                          <td>
                            <div className="cell-primary">{p.fonds}</div>
                            <div className="cell-sub" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {p.isin}
                            </div>
                          </td>
                          <td>{nomFamille(p.famille)}</td>
                          <td>
                            <span className={`badge ${TON_SENS[p.sens] || 'badge-normal'}`}>
                              {LIBELLE_SENS[p.sens] || p.sens}
                            </span>
                            <div className="cell-sub">ampleur {p.ampleur}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {pct(p.poids)} vers {pct(p.poidsPropose)}
                          </td>
                          <td><Pourquoi texte={p.pourquoi} sources={p.sources} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}
                aria-live="polite"
              >
                <span className={`badge ${totalApres === 100 ? 'badge-signed' : 'badge-cancelled'}`}>
                  Total avec les inflexions retenues {pct(totalApres)}
                </span>
                <span className="form-hint" style={{ margin: 0 }}>
                  {propositionsRetenues.length === 0
                    ? `Aucune inflexion retenue · total d'origine ${pct(totalAvant)}`
                    : `${propositionsRetenues.length} inflexion${propositionsRetenues.length > 1 ? 's' : ''} retenue${propositionsRetenues.length > 1 ? 's' : ''} · total d'origine ${pct(totalAvant)}`}
                </span>
                {retenusIci.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setRetenus({ cle: cleContexte, isins: [] }); onRetenues([]) }}
                  >
                    Tout refuser
                  </button>
                )}
              </div>

              {totalApres !== 100 && (
                <div className="form-hint" style={{ marginTop: 8, color: 'var(--forecast)' }}>
                  Le total ne tombe pas à 100 % et il n'est pas ramené tout seul :
                  verrou de la direction. À arbitrer avant de proposer l'allocation.
                </div>
              )}

              <div className="form-hint" style={{ marginTop: 8 }}>
                Rien n'est appliqué et rien n'est enregistré. Le tableau ci dessus reste
                l'allocation des documents source ; les inflexions retenues partent dans le
                presse papier avec le bouton « Copier l'allocation ».
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
