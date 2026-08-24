// ═══════════════════════════════════════════════════════════════════════════
// RÉFÉRENTIEL DES FONDS
//
// Extrait de App.jsx pour être partagé entre l'écran Marchés (qui suit leurs
// performances) et les allocations types (qui les assemblent par profil).
// Aucune donnée modifiée au passage : même liste, même ordre, mêmes ISIN.
// ═══════════════════════════════════════════════════════════════════════════

export const FUNDS_DEFAULT = [
    // ─── Fonds historiques ──────────────────────────────────────────────
    {name:'Lazard Japon AC H EUR',        isin:'FR0014008M81', cat:'Actions Japon',        refSymbol:'INDEX:NKY',        refLabel:'Nikkei 225', color:'#EF4444'},
    {name:'AXA Or et Matières Premières', isin:'FR0010011171', cat:'Matières premières',   refSymbol:'TVC:GOLD',       refLabel:'Or',         color:'#F59E0B'},
    {name:'AP Meeschaert Gl. Convictions',isin:'FR001400CSI0', cat:'Actions Monde Value',  refSymbol:'FOREXCOM:SPXUSD',  refLabel:'S&P 500',    color:'#10B981'},
    {name:'Fidelity Em Mkts A-USD',       isin:'LU0261950470', morningstarId:'FOGBR05KLN', cat:'Actions Ém. Marchés',  refSymbol:'AMEX:EEM',       refLabel:'EEM ETF',    color:'#F97316'},
    {name:'Fidelity Global Technology',   isin:'LU0099574567', morningstarId:'F0GBR04D20', cat:'Actions Technologie',  refSymbol:'NASDAQ:QQQ',       refLabel:'Nasdaq QQQ', color:'#7C3AED'},
    {name:'Quadrige France Smallcaps',    isin:'FR0011466093', cat:'Actions France Small', refSymbol:'INDEX:CAC40',      refLabel:'CAC 40',     color:'#0EA5E9'},
    {name:'Pictet Clean Energy Transtn',  isin:'LU0280435461', yahooTicker:'0P00008OBP.F', cat:'Énergie Propre',       refSymbol:'AMEX:ICLN',        refLabel:'ICLN ETF',   color:'#06B6D4'},
    {name:'First Eagle Amundi Intl',      isin:'LU0068578508', yahooTicker:'0P0000RXYQ.F', cat:'Actions Monde Flex.',  refSymbol:'FOREXCOM:SPXUSD',  refLabel:'S&P 500',    color:'#84CC16'},
    {name:'Groupama Global Disruption',   isin:'LU1897556517', cat:'Actions Innovation',   refSymbol:'NASDAQ:QQQ',       refLabel:'Nasdaq QQQ', color:'#EC4899'},
    {name:'Claresco USA',                 isin:'LU1379103812', cat:'Actions USA',          refSymbol:'FOREXCOM:SPXUSD',  refLabel:'S&P 500',    color:'#6366F1'},
    // ─── Fonds ajoutés 27/05 (contrats clients Louis) ───────────────────
    // ISIN vérifiés + tickers Yahoo / IDs Morningstar ajoutés pour les
    // fonds que Yahoo ne résout pas par ISIN seul (Carmignac LU, BGF,
    // Pictet, Echiquier Agenor).
    {name:'Carmignac Patrimoine A EUR',        isin:'FR0010135103', morningstarId:'F0GBR04F90', cat:'Allocation flexible',     refSymbol:'FOREXCOM:SPXUSD',  refLabel:'S&P 500',     color:'#14B8A6'},
    {name:'CPR Actions USA Responsable P',     isin:'FR0010501858', cat:'Actions USA ISR',         refSymbol:'FOREXCOM:SPXUSD',  refLabel:'S&P 500',     color:'#8B5CF6'},
    {name:'DNCA Alpha Bonds B EUR',            isin:'LU1694789535', cat:'Obligataire absolu',      refSymbol:'NASDAQ:AGG',       refLabel:'AGG ETF',     color:'#F43F5E'},
    {name:'Echiquier Agenor SRI Mid Cap Eur',  isin:'FR0010321810', morningstarId:'F0GBR04VT4',    cat:'Actions Mid Cap Europe',  refSymbol:'INDEX:CAC40',      refLabel:'CAC 40',      color:'#22C55E'},
    {name:'BDL Rempart C',                     isin:'FR0010174144', cat:'Actions Europe Long/Short',refSymbol:'INDEX:CAC40',     refLabel:'CAC 40',      color:'#3B82F6'},
    {name:'Eurose C',                          isin:'FR0007051040', cat:'Allocation prudent',      refSymbol:'INDEX:CAC40',      refLabel:'CAC 40',      color:'#EAB308'},
    {name:'Carmignac Pf Asia Discovery',       isin:'LU0336083810', yahooTicker:'0P0000RXYR.F',    cat:'Actions Asie',            refSymbol:'INDEX:HSI',        refLabel:'Hang Seng',   color:'#DC2626'},
    {name:'BGF World Healthscience A2 H EUR',  isin:'LU1822774284', yahooTicker:'0P0001DIJB.F',    cat:'Actions Santé',           refSymbol:'AMEX:XLV',         refLabel:'XLV ETF',     color:'#0891B2'},
    {name:'Pictet Security P EUR',             isin:'LU0270904781', morningstarId:'F0000000LF',    cat:'Actions Sécurité',        refSymbol:'NASDAQ:QQQ',       refLabel:'Nasdaq QQQ',  color:'#7E22CE'},
    {name:'Echiquier Space B',                 isin:'LU2466448532', cat:'Actions Espace/Tech',     refSymbol:'NASDAQ:QQQ',       refLabel:'Nasdaq QQQ',  color:'#1D4ED8'},
    {name:'BGF World Energy A2',               isin:'LU0252965963', morningstarId:'F0GBR04K8F',    cat:'Actions Énergie',         refSymbol:'AMEX:XLE',         refLabel:'XLE ETF',     color:'#B45309'},
    {name:'Lazard Actions Emergentes R',       isin:'FR0010380675', cat:'Actions Émergents',       refSymbol:'AMEX:EEM',         refLabel:'EEM ETF',     color:'#DB2777'},
    {name:'Pictet Water P EUR',                isin:'LU0104884860', morningstarId:'F0GBR04BC7',    cat:'Actions Eau',             refSymbol:'NASDAQ:PHO',       refLabel:'PHO ETF',     color:'#0EA5E9'},
    // ─── Fonds ajoutés 24/08 (fonds cités dans nos allocations) ─────────
    // Robeco Smart Energy : 12 % de la proposition PER SwissLife du 04/06.
    //   Classe D-EUR Cap, ISIN LU2145461757 (source : robeco.com).
    // Eleva Absolute Return Europe : validé côté Abeille par Sébastien Pesce
    //   le 30/07 (SRI 2, catégorie 3, donc commissionné). Classe R (EUR) acc,
    //   ISIN LU1331973468 (source : elevacapital.com). Vérifier que c'est bien
    //   la classe référencée au contrat Abeille avant de la proposer.
    {name:'Robeco Smart Energy D-EUR Cap',     isin:'LU2145461757', yahooTicker:'0P0001KWJF.F',    cat:'Énergie Propre',          refSymbol:'AMEX:ICLN',        refLabel:'ICLN ETF',    color:'#65A30D'},
    {name:'Eleva Absolute Return Europe R',    isin:'LU1331973468', cat:'Performance absolue',     refSymbol:'INDEX:CAC40',      refLabel:'CAC 40',      color:'#64748B'},
  ]

// Index par ISIN, pour rattacher une ligne d'allocation à son fonds.
export const FONDS_PAR_ISIN = Object.fromEntries(FUNDS_DEFAULT.map(f => [f.isin, f]))
