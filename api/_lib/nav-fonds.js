// ═══════════════════════════════════════════════════════════════════════════
// RÉCUPÉRATION DE LA VL D'UN FONDS
//
// Extrait de api/nav.js pour être partagé entre les deux endpoints :
//   • api/nav.js        — un fonds, conservé pour compatibilité
//   • api/nav-batch.js  — tous les fonds de l'écran Marchés en un appel
//
// Aucune logique modifiée au passage : mêmes sources (Morningstar puis Yahoo),
// mêmes calculs de performance, mêmes cas d'échec. Les deux endpoints ne
// peuvent donc plus diverger.
// ═══════════════════════════════════════════════════════════════════════════

const UA = { 'User-Agent': 'Mozilla/5.0' }
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

export const isinValide = (isin) => ISIN_REGEX.test(String(isin || ''))

// Performances calculées sur la série : on cherche le point le plus proche de
// la date visée plutôt que d'exiger une cotation ce jour-là (jours fériés,
// fonds valorisés hebdomadairement).
function pointLePlusProche(serie, ms) {
  return serie.reduce((b, x) => (Math.abs(x.t * 1000 - ms) < Math.abs(b.t * 1000 - ms) ? x : b)).c
}

function perfDepuis(depart, dernier) {
  if (!depart || !dernier) return null
  return Math.round(((dernier - depart) / depart) * 10000) / 100
}

function performances(serie) {
  const dernier = serie[serie.length - 1]
  const avant = serie[serie.length - 2]
  const maintenant = dernier.t * 1000
  const jours = (n) => pointLePlusProche(serie, maintenant - n * 24 * 3600 * 1000)
  return {
    vl: Math.round(dernier.c * 100) / 100,
    change: avant ? Math.round(((dernier.c - avant.c) / avant.c) * 10000) / 100 : null,
    date: new Date(dernier.t * 1000).toLocaleDateString('fr-FR'),
    perf1W: perfDepuis(jours(7), dernier.c),
    perf1M: perfDepuis(jours(30), dernier.c),
    perf3M: perfDepuis(jours(91), dernier.c),
    perf1Y: perfDepuis(jours(365), dernier.c),
  }
}

// ── Morningstar : pour les fonds LU que Yahoo ne couvre pas complètement ──
async function viaMorningstar(isin, msId) {
  const aujourdhui = new Date()
  const depuis = new Date(aujourdhui)
  depuis.setFullYear(depuis.getFullYear() - 1)
  const fmt = (d) => d.toISOString().slice(0, 10)

  const url = `https://lt.morningstar.com/api/rest.svc/timeseries_price/9vehuxllxs?id=${msId}&currencyId=EUR&idtype=Morningstar&frequency=daily&startDate=${fmt(depuis)}&endDate=${fmt(aujourdhui)}&outputType=JSON`
  const reponse = await fetch(url, { headers: UA })
  const data = await reponse.json()

  // Deux formats possibles selon les fonds : HistoryDetail (actuel) ou
  // CurrencyData[0].Returns[0].Return (ancien).
  const titre = data?.TimeSeries?.Security?.[0]
  let serie = titre?.HistoryDetail || []
  if (serie.length === 0) serie = titre?.CurrencyData?.[0]?.Returns?.[0]?.Return || []
  if (serie.length <= 2) return null

  const valides = serie
    .filter((x) => x.Value != null)
    .map((x) => ({ c: parseFloat(x.Value), t: new Date(x.EndDate || x.Date).getTime() / 1000 }))
    .sort((a, b) => a.t - b.t)
  if (valides.length <= 2) return null

  return { isin, symbol: msId, currency: 'EUR', ...performances(valides) }
}

// ── Yahoo Finance : source par défaut ──
async function viaYahoo(isin, ticker) {
  let symbole = ticker || null

  if (!symbole) {
    const recherche = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`,
      { headers: UA },
    )
    const data = await recherche.json()
    const cotations = data?.quotes || []
    if (cotations.length === 0) return { erreur: 'not found', isin }
    // Préférer les codes 0P (OTC/Morningstar) : historique plus complet.
    const prefere = cotations.find((q) => q.symbol?.startsWith('0P'))
    symbole = (prefere || cotations[0]).symbol
  }

  const cours = await fetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbole}?interval=1d&range=1y`,
    { headers: UA },
  )
  const data = await cours.json()
  const resultat = data?.chart?.result?.[0]
  if (!resultat) return { erreur: 'no price data', symbol: symbole }

  const closes = resultat.indicators?.quote?.[0]?.close || []
  const dates = resultat.timestamps || resultat.timestamp || []
  const valides = closes.map((c, i) => ({ c, t: dates[i] })).filter((x) => x.c != null)
  if (valides.length === 0) return { erreur: 'no closes', symbol: symbole }

  // Une série quasi plate trahit une cotation figée : on préfère ne rien
  // afficher plutôt qu'une performance inventée.
  const prixDistincts = new Set(valides.map((x) => Math.round(x.c * 100)))
  if (prixDistincts.size <= 2) return { erreur: 'flat data', symbol: symbole }

  return {
    isin,
    symbol: symbole,
    name: resultat.meta?.longName || resultat.meta?.shortName || '',
    currency: resultat.meta?.currency || 'EUR',
    ...performances(valides),
  }
}

/**
 * VL et performances d'un fonds. Morningstar d'abord quand un msId est fourni,
 * Yahoo ensuite — y compris si Morningstar n'a rien renvoyé d'exploitable.
 * Ne lève jamais : renvoie { erreur } pour que le traitement groupé continue.
 */
export async function vlDuFonds({ isin, ticker, msId }) {
  if (!isinValide(isin)) return { erreur: 'Format ISIN invalide', isin }
  try {
    if (msId) {
      const ms = await viaMorningstar(isin, msId)
      if (ms) return ms
    }
    return await viaYahoo(isin, ticker)
  } catch (e) {
    return { erreur: e?.message || 'Erreur inconnue', isin }
  }
}

/**
 * Traite une liste de fonds avec un plafond de requêtes simultanées. Sans lui,
 * 37 fonds déclencheraient 37 appels d'un coup vers Yahoo et Morningstar, ce
 * qui invite au throttling. Huit à la fois suffisent : le lot complet part en
 * cinq vagues, très loin des 37 allers-retours que faisait le navigateur.
 */
export async function vlDesFonds(fonds, simultanes = 8) {
  const resultats = new Array(fonds.length)
  let curseur = 0
  const ouvrier = async () => {
    while (curseur < fonds.length) {
      const i = curseur++
      resultats[i] = await vlDuFonds(fonds[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(simultanes, fonds.length) }, ouvrier))
  return resultats
}
