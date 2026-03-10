// api/nav.js — Vercel serverless function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { isin, boursoCode } = req.query
  if (!isin) return res.status(400).json({ error: 'isin required' })

  // ── Boursorama (fonds LU sans données Yahoo fiables) ──────────────────────
  if (boursoCode) {
    try {
      const r = await fetch(
        `https://www.boursorama.com/bourse/action/graph/ws/GetTicksEOD?symbol=${boursoCode}&length=365&period=0&guid=`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
      )
      const raw = await r.json()
      const ticks = raw?.d?.qd   // tableau [{d: "2025-03-10", o, h, l, c, v}, ...]
      if (!ticks || ticks.length === 0) throw new Error('no boursorama ticks')

      const valid = ticks
        .filter(x => x.c != null)
        .sort((a, b) => a.d.localeCompare(b.d))

      const last = valid[valid.length - 1]
      const prev = valid[valid.length - 2]

      function closest(targetDate) {
        return valid.reduce((best, x) =>
          Math.abs(x.d.localeCompare(targetDate)) < Math.abs(best.d.localeCompare(targetDate)) ? x : best
        ).c
      }

      function dateOffset(days) {
        const d = new Date(last.d)
        d.setDate(d.getDate() - days)
        return d.toISOString().split('T')[0]
      }

      function perf(from) {
        if (!from || !last.c || from === last.c) return null
        return Math.round(((last.c - from) / from) * 10000) / 100
      }

      return res.status(200).json({
        isin,
        symbol: boursoCode,
        name: '',
        currency: 'EUR',
        vl:     Math.round(last.c * 100) / 100,
        change: prev ? Math.round(((last.c - prev.c) / prev.c) * 10000) / 100 : null,
        date:   last.d.split('-').reverse().join('/'),
        perf1W: perf(closest(dateOffset(7))),
        perf1M: perf(closest(dateOffset(30))),
        perf3M: perf(closest(dateOffset(91))),
        perf1Y: perf(closest(dateOffset(365))),
      })
    } catch (e) {
      // continue to Yahoo fallback
    }
  }

  // ── Yahoo Finance (fonds FR, bien couverts) ───────────────────────────────
  try {
    const searchRes = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=1&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    const searchData = await searchRes.json()
    const quote = searchData?.quotes?.[0]
    if (!quote?.symbol) return res.status(404).json({ error: 'not found', isin })

    const priceRes = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${quote.symbol}?interval=1d&range=1y`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    const priceData = await priceRes.json()
    const result = priceData?.chart?.result?.[0]
    if (!result) return res.status(404).json({ error: 'no price data' })

    const closes = result.indicators?.quote?.[0]?.close || []
    const timestamps = result.timestamps || result.timestamp || []
    const valid = closes.map((c, i) => ({ c, t: timestamps[i] })).filter(x => x.c != null)
    if (valid.length === 0) return res.status(404).json({ error: 'no closes' })

    const last = valid[valid.length - 1]
    const prev = valid[valid.length - 2]
    const now  = last.t * 1000

    function closest(ms) {
      return valid.reduce((b, x) => Math.abs(x.t*1000-ms) < Math.abs(b.t*1000-ms) ? x : b).c
    }
    function perf(from) {
      if (!from || !last.c || from === last.c) return null
      return Math.round(((last.c - from) / from) * 10000) / 100
    }

    return res.status(200).json({
      isin,
      symbol: quote.symbol,
      name: result.meta?.longName || '',
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
