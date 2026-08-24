// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATIONS TYPES PAR PARTENAIRE
//
// Un onglet par partenaire, et une molette prudent / équilibré / dynamique.
// Le but tient en une phrase : un conseiller qui arrive doit pouvoir sortir
// l'allocation correspondant au profil de son client sans la reconstruire.
//
// La molette applique littéralement la règle de Louis — « pour faire un
// modéré ou un équilibré, tu mets un peu de dynamique et un peu de prudent ».
// Elle interpole entre les deux pôles du partenaire choisi. Les allocations
// ne sont pas les mêmes d'un partenaire à l'autre : chacun a ses pôles.
//
// L'écran ne conçoit rien. Il affiche, il mélange, et il contrôle deux choses
// que l'œil rate :
//   • la somme des poids tombe-t-elle à 100 % ;
//   • chaque ligne correspond-elle à un fonds du référentiel Marchés, et avec
//     le même ISIN.
// Les écarts sont signalés, jamais corrigés en silence.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import SubTabs from './ui/SubTabs'
import { FONDS_PAR_ISIN } from '../config/fonds'
import {
  ALLOCATIONS,
  PARTENAIRES,
  AVERTISSEMENTS_PARTENAIRE,
  CRANS,
  melanger,
  normaliser,
  totalPoids,
} from '../config/allocations'

// Rapproche une ligne d'allocation du référentiel de fonds. Trois issues :
// l'ISIN est connu (rattaché), le nom est connu mais sous un autre ISIN
// (classe de parts différente — à trancher), ou rien ne correspond.
function rapprocher(ligne) {
  const parIsin = FONDS_PAR_ISIN[ligne.isin]
  if (parIsin) return { etat: 'ok', fonds: parIsin }

  const cle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const cibleCle = cle(ligne.fonds)
  const parNom = Object.values(FONDS_PAR_ISIN).find((f) => {
    const a = cle(f.name)
    return a.startsWith(cibleCle.slice(0, 14)) || cibleCle.startsWith(a.slice(0, 14))
  })
  if (parNom) return { etat: 'isin-divergent', fonds: parNom }
  return { etat: 'inconnu', fonds: null }
}

const pct = (n) => `${String(n).replace('.', ',')} %`
const parId = (id) => ALLOCATIONS.find((a) => a.id === id) || null

export default function AllocationsTypes() {
  const [partenaireCle, setPartenaireCle] = useState(PARTENAIRES[0].cle)
  // Un curseur par partenaire : passer de SwissLife à Abeille ne doit pas
  // réinitialiser le profil sur lequel on travaillait.
  const [curseurs, setCurseurs] = useState(() =>
    Object.fromEntries(PARTENAIRES.map((p) => [p.cle, 50])),
  )
  const [ramene, setRamene] = useState(false)

  const partenaire = PARTENAIRES.find((p) => p.cle === partenaireCle)
  const poleBas = parId(partenaire.poleBas)
  const poleHaut = parId(partenaire.poleHaut)
  const curseur = curseurs[partenaireCle] ?? 50
  const complet = (poleBas?.lignes?.length || 0) > 0 && (poleHaut?.lignes?.length || 0) > 0

  const lignesBrutes = useMemo(
    () => (complet ? melanger(poleBas, poleHaut, curseur / 100) : []),
    [complet, poleBas, poleHaut, curseur],
  )
  const lignes = useMemo(
    () => (ramene ? normaliser(lignesBrutes) : lignesBrutes),
    [ramene, lignesBrutes],
  )
  const rapprochements = useMemo(() => lignes.map(rapprocher), [lignes])

  const total = totalPoids(lignes)
  const sommeJuste = total === 100
  const nbDivergents = rapprochements.filter((r) => r.etat === 'isin-divergent').length
  const nbInconnus = rapprochements.filter((r) => r.etat === 'inconnu').length

  const cran = CRANS.find((c) => c.valeur === curseur)
  const partBas = 100 - curseur
  // Sur un cran extrême, n'annoncer que le pôle réellement utilisé : afficher
  // « 0 % Offensif diversifié » ne dit rien à personne.
  const libelleMix = complet
    ? [partBas && `${pct(partBas)} ${poleBas.nom}`, curseur && `${pct(curseur)} ${poleHaut.nom}`]
      .filter(Boolean).join(' · ')
    : ''

  const onglets = PARTENAIRES.map((p) => ({ key: p.cle, label: p.nom }))

  function deplacer(v) {
    setCurseurs((c) => ({ ...c, [partenaireCle]: v }))
    setRamene(false)
  }

  function copier() {
    const entete = `${cran ? cran.libelle : 'Sur mesure'} · ${partenaire.nom}`
    const corps = lignes.map((l) => `${l.fonds} (${l.isin}) — ${pct(l.poids)}`)
    navigator.clipboard?.writeText([entete, libelleMix, '', ...corps, '', `Total ${pct(total)}`].join('\n'))
      .then(() => toast.success('Allocation copiée'))
      .catch(() => toast.error('Copie impossible'))
  }

  const avertissement = AVERTISSEMENTS_PARTENAIRE[partenaireCle]

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Allocations types · par partenaire</div>
          <div className="section-title">Allocations par profil de gestion</div>
          <div className="section-sub">
            Choisissez le partenaire, réglez la molette sur le profil du client,
            l&apos;allocation se compose. Le CRM affiche et contrôle — il ne conçoit pas.
          </div>
        </div>
      </div>

      <SubTabs
        tabs={onglets}
        active={partenaireCle}
        onChange={(k) => { setPartenaireCle(k); setRamene(false) }}
        ariaLabel="Partenaires"
      />

      {avertissement && (
        <div className="form-hint" style={{ marginTop: 16, borderLeft: '2px solid var(--progress)', paddingLeft: 12 }}>
          {avertissement}
        </div>
      )}
      {partenaire.reserve && (
        <div className="form-hint" style={{ marginTop: 10, borderLeft: '2px solid var(--progress)', paddingLeft: 12 }}>
          {partenaire.reserve}
        </div>
      )}

      <div className="card" style={{ marginTop: 20, padding: 20 }}>
        <div className="molette">
          <div className="molette-head">
            <div>
              <div className="molette-profil">{cran ? cran.libelle : 'Sur mesure'}</div>
              <div className="molette-mix">
                {complet
                  ? libelleMix
                  : 'Molette indisponible tant que les deux pôles ne sont pas saisis'}
              </div>
            </div>
            {complet && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  className={`badge ${sommeJuste ? 'badge-signed' : 'badge-cancelled'}`}
                  title={sommeJuste ? 'La somme des poids tombe juste' : 'La somme des poids ne fait pas 100 %'}
                >
                  Total {pct(total)}
                </span>
                {!sommeJuste && (
                  <button className="btn btn-outline btn-sm" onClick={() => setRamene(true)}>
                    Ramener à 100 %
                  </button>
                )}
                {ramene && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setRamene(false)}>
                    Revenir aux poids d&apos;origine
                  </button>
                )}
                <button className="btn btn-outline btn-sm" onClick={copier}>
                  Copier l&apos;allocation
                </button>
              </div>
            )}
          </div>

          <input
            type="range"
            className="molette-range"
            min={0}
            max={100}
            step={5}
            value={curseur}
            disabled={!complet}
            onChange={(e) => deplacer(Number(e.target.value))}
            aria-label="Profil de gestion, du plus prudent au plus dynamique"
            aria-valuetext={cran ? cran.libelle : `${partBas} % prudent, ${curseur} % dynamique`}
          />

          <div className="molette-crans">
            {CRANS.map((c) => (
              <button
                key={c.valeur}
                type="button"
                className={`molette-cran${curseur === c.valeur ? ' is-active' : ''}`}
                disabled={!complet}
                onClick={() => deplacer(c.valeur)}
              >
                {c.libelle}
              </button>
            ))}
          </div>
        </div>

        <div className="form-hint" style={{ marginTop: 16 }}>
          <strong>Côté prudent :</strong> {poleBas.nom} — {poleBas.source}
          {poleBas.note && <> · {poleBas.note}</>}
          <br />
          <strong>Côté dynamique :</strong> {poleHaut.nom} — {poleHaut.source}
          {poleHaut.note && <> · {poleHaut.note}</>}
        </div>

        {ramene && (
          <div className="form-hint" style={{ marginTop: 10, color: 'var(--forecast)' }}>
            Poids recalculés au prorata pour tomber à 100 %. Ils ne sont plus
            identiques à ceux des documents source.
          </div>
        )}

        {!complet ? (
          <div className="table-empty-state" style={{ marginTop: 16 }}>
            <div className="empty-title">Pôles non repris</div>
            <div className="empty-sub">
              Les deux allocations de référence existent, mais uniquement dans les
              documents cités ci-dessus. Le détail des supports doit être recopié ici :
              rien n&apos;a été reconstitué de mémoire.
            </div>
          </div>
        ) : (
          <>
            {(nbDivergents > 0 || nbInconnus > 0) && (
              <div className="form-hint" style={{ marginTop: 14, color: 'var(--cancelled)' }}>
                {nbDivergents > 0 && (
                  <>
                    {nbDivergents} support{nbDivergents > 1 ? 's' : ''} porte
                    {nbDivergents > 1 ? 'nt' : ''} un ISIN différent de celui du
                    référentiel Marchés — classe de parts à trancher avant usage.
                  </>
                )}
                {nbInconnus > 0 && (
                  <> {nbInconnus} support{nbInconnus > 1 ? 's' : ''} absent
                  {nbInconnus > 1 ? 's' : ''} du référentiel Marchés.</>
                )}
              </div>
            )}

            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Support</th>
                    <th>ISIN</th>
                    <th style={{ textAlign: 'right' }}>Poids</th>
                    <th>Référentiel</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => {
                    const r = rapprochements[i]
                    return (
                      <tr key={l.isin}>
                        <td><div className="cell-primary">{l.fonds}</div></td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{l.isin}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {pct(l.poids)}
                        </td>
                        <td>
                          {r.etat === 'ok' && <span className="badge badge-signed">Rattaché</span>}
                          {r.etat === 'isin-divergent' && (
                            <span className="badge badge-cancelled" title={`Référentiel : ${r.fonds.isin}`}>
                              ISIN différent — {r.fonds.isin}
                            </span>
                          )}
                          {r.etat === 'inconnu' && (
                            <span className="badge badge-forecast">Hors référentiel</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
