// api/nav.js — Vercel serverless function
export default async function handler(req, res) {
  const allowedOrigins = [
    'https://entasis-crm-supabase.vercel.app',
    'http://localhost:5173',
    'http://localhost:4173'
  ]

  const origin = req.headers.origin
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else {
    res.setHeader('Access-Control-Allow-Origin',
      'https://entasis-crm-supabase.vercel.app')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { isin, ticker, msId } = req.query
  if (!isin) return res.status(400).json({ error: 'isin required' })

  // Validation ISIN
  const isinRegex = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/
  if (isin && !isinRegex.test(isin)) {
    return res.status(400).json({ error: 'Format ISIN invalide' })
  }

  try {
    // ── MORNINGSTAR PATH (pour fonds LU sans données Yahoo complètes) ──
    if (msId) {
      const today = new Date()
      const from  = new Date(today); from.setFullYear(from.getFullYear() - 1)
      const fmt = d => d.toISOString().slice(0, 10)

      const msUrl = `https://lt.morningstar.com/api/rest.svc/timeseries_price/9vehuxllxs?id=${msId}&currencyId=EUR&idtype=Morningstar&frequency=daily&startDate=${fmt(from)}&endDate=${fmt(today)}&outputType=JSON`
      const msRes = await fetch(msUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const msData = await msRes.json()

      const series = msData?.TimeSeries?.Security?.[0]?.CurrencyData?.[0]?.Returns?.[0]?.Return || []

      if (series.length > 2) {
        const valid = series
          .filter(x => x.Value != null)
          .map(x => ({ c: parseFloat(x.Value), t: new Date(x.Date).getTime() / 1000 }))
          .sort((a, b) => a.t - b.t)

        if (valid.length > 2) {
          const last   = valid[valid.length - 1]
          const prev   = valid[valid.length - 2]
          const now    = last.t * 1000
          function closest(ms) {
            return valid.reduce((b, x) => Math.abs(x.t*1000-ms) < Math.abs(b.t*1000-ms) ? x : b).c
          }
          function perf(from) {
            if (!from || !last.c) return null
            return Math.round(((last.c - from) / from) * 10000) / 100
          }
          return res.status(200).json({
            isin, symbol: msId, currency: 'EUR',
            vl:     Math.round(last.c * 100) / 100,
            change: prev ? Math.round(((last.c - prev.c) / prev.c) * 10000) / 100 : null,
            date:   new Date(last.t * 1000).toLocaleDateString('fr-FR'),
            perf1W: perf(closest(now - 7*24*3600*1000)),
            perf1M: perf(closest(now - 30*24*3600*1000)),
            perf3M: perf(closest(now - 91*24*3600*1000)),
            perf1Y: perf(closest(now - 365*24*3600*1000)),
          })
        }
      }
      // Si Morningstar échoue, continuer avec Yahoo ci-dessous
    }

    // ── YAHOO PATH ──
    let resolvedSymbol = ticker || null

    if (!resolvedSymbol) {
      const searchRes = await fetch(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      const searchData = await searchRes.json()
      const quotes = searchData?.quotes || []
      if (quotes.length === 0) return res.status(404).json({ error: 'not found', isin })

      // Préférer les codes 0P (OTC/Morningstar, historique complet)
      const preferred = quotes.find(q => q.symbol?.startsWith('0P'))
      resolvedSymbol = (preferred || quotes[0]).symbol
    }

    const priceRes = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${resolvedSymbol}?interval=1d&range=1y`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    const priceData = await priceRes.json()
    const result = priceData?.chart?.result?.[0]
    if (!result) return res.status(404).json({ error: 'no price data', symbol: resolvedSymbol })

    const closes    = result.indicators?.quote?.[0]?.close || []
    const timestamps = result.timestamps || result.timestamp || []
    const valid = closes
      .map((c, i) => ({ c, t: timestamps[i] }))
      .filter(x => x.c != null)

    if (valid.length === 0) return res.status(404).json({ error: 'no closes', symbol: resolvedSymbol })

    const uniquePrices = new Set(valid.map(x => Math.round(x.c * 100)))
    if (uniquePrices.size <= 2) return res.status(404).json({ error: 'flat data', symbol: resolvedSymbol })

    const last  = valid[valid.length - 1]
    const prev  = valid[valid.length - 2]
    const now   = last.t * 1000

    function closest(ms) {
      return valid.reduce((b, x) => Math.abs(x.t*1000-ms) < Math.abs(b.t*1000-ms) ? x : b).c
    }
    function perf(from) {
      if (!from || !last.c) return null
      return Math.round(((last.c - from) / from) * 10000) / 100
    }

    return res.status(200).json({
      isin, symbol: resolvedSymbol,
      name:     result.meta?.longName || result.meta?.shortName || '',
      currency: result.meta?.currency || 'EUR',
      vl:     Math.round(last.c * 100) / 100,
      change: prev ? Math.round(((last.c - prev.c) / prev.c) * 10000) / 100 : null,
      date:   new Date(last.t * 1000).toLocaleDateString('fr-FR'),
      perf1W: perf(closest(now - 7*24*3600*1000)),
      perf1M: perf(closest(now - 30*24*3600*1000)),
      perf3M: perf(closest(now - 91*24*3600*1000)),
      perf1Y: perf(closest(now - 365*24*3600*1000)),
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
