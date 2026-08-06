import type {
  AnnualPerformancePoint,
  BrandIdentity,
  CalendarData,
  DashboardData,
  FinancialPoint,
  FundamentalsData,
  InsiderTransaction,
  InstrumentProfile,
  MomentumData,
  NewsData,
  OverviewData,
  PatternCase,
  PatternData,
  PoliticalData,
  PoliticalTrade,
  PortfolioData,
  SearchInstrument,
  SeasonalityData,
  ShellData,
  TimePoint,
  WatchlistEntry,
} from "@/types";

export interface MockFinancialDataset {
  brand: BrandIdentity;
  shell: ShellData;
  instrument: InstrumentProfile;
  dashboard: DashboardData;
  calendar: CalendarData;
  watchlist: WatchlistEntry[];
  portfolio: PortfolioData;
  searchUniverse: SearchInstrument[];
  overview: OverviewData;
  seasonality: SeasonalityData;
  pattern: PatternData;
  momentum: MomentumData;
  fundamentals: FundamentalsData;
  political: PoliticalData;
  news: NewsData;
}

const brand: BrandIdentity = {
  name: "KAIRO",
  suffix: " markets",
  tagline: "Markets, made legible.",
};

const instrument: InstrumentProfile = {
  name: "Helio Systems",
  symbol: "HLIO",
  market: "NASDAQ",
  currency: "USD",
  country: "United States",
  category: "Equities",
  sector: "Semiconductors",
  classifications: ["Technology", "Large cap", "NASDAQ 100", "AI infrastructure"],
  quote: {
    price: 219.22,
    change: 3.18,
    changePercent: 1.47,
    dayLow: 213.9,
    dayHigh: 221.08,
    volume: 28_400_000,
    currency: "USD",
    marketStatus: "Market open",
  },
  earnings: { daysUntil: 20, dateLabel: "Aug 26, after close", consensusEps: 1.03 },
};

function wave(index: number, drift = 0.7, amplitude = 13) {
  return 28 + index * drift + Math.sin(index * 0.55) * amplitude + Math.cos(index * 0.19) * 8;
}

const priceSeries: TimePoint[] = Array.from({ length: 72 }, (_, index) => ({
  label: `${2021 + Math.floor(index / 14)}-${String((index % 12) + 1).padStart(2, "0")}`,
  value: Math.max(11, Number(wave(index, 2.55, 18).toFixed(2))),
  comparison: Number((16 + index * 2.5 + Math.sin(index * 0.22) * 8).toFixed(2)),
  volume: Math.round(18 + Math.abs(Math.sin(index * 0.7)) * 75),
}));

const shortPriceSeries: TimePoint[] = Array.from({ length: 46 }, (_, index) => ({
  label: `${index + 1} Jul`,
  value: Number((205 + Math.sin(index * 0.54) * 13 + index * 0.35).toFixed(2)),
  comparison: index > 31 ? Number((218 + (index - 31) * 1.1 + Math.sin(index) * 5).toFixed(2)) : undefined,
  buy: index % 8 === 2 ? Math.round(15 + index * 2.5) : undefined,
  sell: index % 11 === 5 ? Math.round(22 + index * 2.8) : undefined,
}));

const seasonalitySeries = Array.from({ length: 48 }, (_, index) => ({
  week: index + 1,
  current: Number((44 + Math.sin(index * 0.42) * 17 + index * 0.5).toFixed(2)),
  average: Number((70 - index * 0.8 + Math.sin(index * 0.33) * 9).toFixed(2)),
  analogue: Number((84 - index * 1.05 + Math.cos(index * 0.28) * 12).toFixed(2)),
}));

const drawdownSeries: TimePoint[] = priceSeries.map((point, index) => ({
  label: point.label,
  value: Number((-Math.abs(Math.sin(index * 0.22) * 42 + Math.cos(index * 0.09) * 16)).toFixed(2)),
}));

const annualPerformance: AnnualPerformancePoint[] = [
  93.67, 41.43, -75.55, 114.47, -16.71, -12.39, -12.68, 25.94, 26.42, 63.74,
  229.94, 89.8, -32.93, 72.43, 117.67, 124.33, -51.49, 245.81, 178.78, 34.84, 16.08,
].map((value, index) => ({ year: String(2006 + index), value }));

const dividendSeries: TimePoint[] = priceSeries.slice(10, 58).map((item, index) => ({
  label: item.label,
  value: index < 40 ? 0.004 : 0.01 + (index - 40) * 0.03,
}));

const financials: FinancialPoint[] = [
  ["2020", 11, 3, 5, 26, 0.17, 27],
  ["2021", 17, 4, 6, 30, 0.06, 26],
  ["2022", 27, 10, 9, 45, 0.41, 37],
  ["2023", 27, 4, 6, 18, 0.06, 16],
  ["2024", 61, 30, 27, 91, 0.03, 56],
  ["2025", 130, 73, 61, 119, 0.11, 64],
  ["2026", 216, 120, 97, 101, 0.01, 66],
  ["TTM", 253, 160, 146, 114, 0.01, 75],
].map(([year, sales, income, cashFlow, roe, debt, margin]) => ({
  year: String(year),
  sales: Number(sales),
  income: Number(income),
  cashFlow: Number(cashFlow),
  roe: Number(roe),
  debt: Number(debt),
  margin: Number(margin),
}));

const insiderNames = [
  ["Mara Keller", "director"], ["Mara Keller", "director"], ["Neil Carter", "director"],
  ["Jules Ortiz", "chief accounting officer"], ["Priya Shah", "EVP & chief financial officer"],
  ["Darin Ross", "director"], ["Mara Keller", "director"], ["Priya Shah", "EVP & chief financial officer"],
];

const insiderTransactions: InsiderTransaction[] = Array.from({ length: 20 }, (_, index) => ({
  id: index + 1,
  date: `${String(18 - (index % 12)).padStart(2, "0")}/06/2026`,
  insider: insiderNames[index % insiderNames.length][0],
  role: insiderNames[index % insiderNames.length][1],
  security: "Common Stock",
  transaction: index === 8 ? "Purchase" : "Sale",
  value: Number((171 + index * 2.37).toFixed(3)),
  shares: 500 + ((index * 18317) % 565000),
}));

const politicalPeople = [
  ["Sam Liccard", "Civic", "California"], ["Daniel Newhouse", "Union", "Washington"],
  ["Cleo Fields", "Civic", "Louisiana"], ["Ro Khanna", "Civic", "California"],
  ["Sheldon White", "Civic", "Rhode Island"], ["Dan Mercer", "Union", "Pennsylvania"],
  ["Katie Britt", "Union", "Alabama"], ["Nancy Collins", "Civic", "California"],
] as const;

const politicalTrades: PoliticalTrade[] = Array.from({ length: 38 }, (_, index) => {
  const person = politicalPeople[index % politicalPeople.length];
  const level = index % 9 === 2 ? 4 : index % 5 === 0 ? 2 : 1;
  return {
    id: index + 1,
    name: person[0],
    role: index % 7 === 4 ? "Senator" : "Representative",
    party: person[1],
    region: person[2],
    type: index % 3 === 1 ? "BUY" : "SELL",
    published: `${String(27 - (index % 22)).padStart(2, "0")}/07/2026`,
    traded: `${String(21 - (index % 18)).padStart(2, "0")}/06/2026`,
    amount: level === 4 ? "1.00M - 5.00M" : level === 2 ? "15.00K - 50.00K" : "1.00K - 15.00K",
    amountLevel: level,
  };
});

const watchlist: WatchlistEntry[] = [
  { symbol: "HLIO", name: "Helio Systems", price: 219.22, changePercent: 2.41, signal: "BUY" },
  { symbol: "ALPH", name: "Alphacore", price: 184.76, changePercent: -0.64, signal: "HOLD" },
  { symbol: "VRTX", name: "Vertex Cloud", price: 92.31, changePercent: 1.27, signal: "BUY" },
  { symbol: "ORBT", name: "Orbit Networks", price: 54.83, changePercent: -2.08, signal: "SELL" },
];

const portfolio: PortfolioData = {
  positions: [
    { symbol: "HLIO", quantity: 42, averagePrice: 161.8, currentPrice: 219.22 },
    { symbol: "ALPH", quantity: 18, averagePrice: 173.4, currentPrice: 184.76 },
    { symbol: "VRTX", quantity: 65, averagePrice: 76.2, currentPrice: 92.31 },
    { symbol: "CASH", quantity: 1, averagePrice: 4200, currentPrice: 4200 },
  ],
  totalReturn: 4382,
  dayChangePercent: 1.84,
};

const searchUniverse: SearchInstrument[] = [
  { symbol: "HLIO", name: "Helio Systems", type: "Stock", venue: "NASDAQ", price: 219.22, href: "/instrument/nasdaq/hlio/overview" },
  { symbol: "ALPH", name: "Alphacore Technologies", type: "Stock", venue: "NYSE", price: 184.76, href: "/search" },
  { symbol: "SPX", name: "S&P 500", type: "Index", venue: "INDEX", price: 5243.6, href: "/search" },
  { symbol: "BTCUSD", name: "Bitcoin USD", type: "Crypto", venue: "CRYPTO", price: 61840, href: "/search" },
  { symbol: "GLD", name: "Gold Trust", type: "ETF", venue: "NYSE", price: 232.4, href: "/search" },
  { symbol: "EURUSD", name: "Euro / US Dollar", type: "Forex", venue: "FX", price: 1.09, href: "/search" },
];

const patternCases: PatternCase[] = Array.from({ length: 18 }, (_, index) => ({
  id: index + 1,
  direction: index < 10 ? "bullish" : "bearish",
  start: `${String(9 + index).padStart(2, "0")}/07/${2025 - index}`,
  end: `${String(5 + index).padStart(2, "0")}/08/${2025 - index}`,
  performance: Number((1.2 + index * 1.73).toFixed(2)),
  drop: Number((-0.9 - index * 0.48).toFixed(2)),
  rise: Number((6.2 + index * 1.3).toFixed(2)),
}));

const scoreSeries: TimePoint[] = [16.73, 20.39, 19, 23.41, 16.8, 44.51, 52.68, 59.71, 53.85]
  .map((value, index) => ({ label: String(2019 + index), value }));

const sharesSeries: TimePoint[] = financials.map((item, index) => ({
  label: item.year,
  value: Number((24.36 + Math.sin(index * 0.7) * 0.38).toFixed(2)),
}));

const politicalChartSeries: TimePoint[] = priceSeries.slice(8).map((point, index) => ({
  ...point,
  buy: index % 7 === 1 ? (index + 1) * 120 : 0,
  sell: index % 9 === 2 ? (index + 1) * 110 : 0,
}));

const overview: OverviewData = {
  priceSeries,
  drawdownSeries,
  annualPerformance,
  dividendSeries,
  returns: [
    ["1 Month", 12.1], ["6 Months", 18.24], ["This Year", 16.08], ["1 Year", 22.18],
    ["3 Years", 382.65], ["5 Years", 976.19], ["10 Years", 14812.93], ["20 Years", 55374.86],
  ].map(([label, value]) => ({ label: String(label), value: Number(value) })),
  insiderTransactions,
  insiderTotalActivity: 700,
};

const fundamentals: FundamentalsData = {
  summaryColumns: [
    [
      { label: "Ex-Dividend date", value: "04/06/2026" }, { label: "Payment date", value: "26/06/2026" },
      { label: "Annual Dividend", value: "0.28 ($)" }, { label: "Dividend Yield", value: "0.13%" },
      { label: "Shareholders Yield", value: "1.65%" },
    ],
    [
      { label: "Next Earnings", value: "26/08/2026" }, { label: "Market cap", value: "5.32T (USD)" },
      { label: "EPS (TTM)", value: "6.55 ($)" }, { label: "P/E (TTM)", value: "33.47" },
      { label: "Last Close", value: "219.22 ($)" },
    ],
  ],
  financials,
  fairValues: [
    { label: "Discounted Cash Flow", value: 531.77 }, { label: "Peter Lynch", value: 296.43 },
    { label: "Economic Value Added", value: 287.27 }, { label: "EV / Sales", value: 212.4 },
  ],
  averageFairValue: 331.97,
  fairValueUpsidePercent: 51.43,
  scoreSeries,
  solidityScore: 53.85,
  sharesSeries,
  valueSignals: [
    { label: "Shares Outstanding", value: "decreasing" },
    { label: "Shareholders Yield", value: "increasing" },
    { label: "Weighted Financials", value: "increasing" },
  ],
  products: [
    { name: "Compute", value: 162, color: "#f2b84b" }, { name: "Data center", value: 194, color: "#e95f75" },
    { name: "Networking", value: 31, color: "#6576ed" }, { name: "Gaming", value: 16, color: "#9c5dd5" },
    { name: "Other", value: 6, color: "#40d7a5" },
  ],
  revenueByYear: [2023, 2024, 2025, 2026].map((year, index) => ({
    year, compute: index * 50 + 10, data: index * 58 + 18, networking: index * 9 + 5, gaming: index * 4 + 8,
  })),
  ratios: [
    { label: "P/E", value: "33.47", comparison: "Sector 29.12" },
    { label: "EV / Sales", value: "21.40", comparison: "Sector 8.91" },
    { label: "Gross Margin", value: "78.2%", comparison: "Sector 54.0%" },
    { label: "Return on Equity", value: "101.5%", comparison: "Sector 18.6%" },
    { label: "Debt / Equity", value: "0.01", comparison: "Sector 0.42" },
    { label: "FCF Margin", value: "44.7%", comparison: "Sector 16.2%" },
  ],
  statementPeriods: [2022, 2023, 2024, 2025, "TTM"],
  statementRows: [
    { label: "Revenue", values: [11.7, 26.9, 60.9, 130.5, 216.4] },
    { label: "Cost of revenue", values: [4.6, 11.6, 16.6, 29.3, 47.8] },
    { label: "Gross profit", values: [7.1, 15.3, 44.3, 101.2, 168.6] },
    { label: "Operating income", values: [1.9, 4.2, 32.9, 81.5, 137.2] },
    { label: "Net income", values: [2.8, 9.8, 29.8, 72.9, 119.6] },
    { label: "Free cash flow", values: [4.7, 8.1, 27, 60.9, 96.8] },
  ],
  transcripts: ["Q2 2026", "Q1 2026", "Q4 2025", "Q3 2025"].map((period) => ({
    period,
    date: "August 2026",
    title: "Helio Systems earnings call",
    paragraphs: [
      { speaker: "Operator", text: "Welcome to the Helio Systems quarterly earnings call. All financial figures and statements on this page are fictional and provided solely for interface demonstration." },
      { speaker: "Chief executive", text: "Demand for accelerated infrastructure remained broad across cloud, enterprise and sovereign programs. We expanded supply, improved platform availability and continued investing in the software ecosystem." },
      { speaker: "Chief financial officer", text: "Mock revenue reached $63.4 billion, with data-center growth offsetting normal seasonality in other segments. Gross margin remained resilient and free cash flow supported continued investment." },
    ],
  })),
};

const shell: ShellData = {
  brand,
  primaryInstrument: { market: instrument.market, symbol: instrument.symbol },
  marketStatus: "US market open",
  marketClosesIn: "Closes in 2h 41m",
  searchResults: [
    { name: "EURUSD", meta: "FOREX", href: "/instrument/nasdaq/hlio/overview" },
    { name: "DAX 40", meta: "GDAXI INDEX", href: "/instrument/nasdaq/hlio/overview" },
    { name: "S&P 500", meta: "GSPC INDEX", href: "/instrument/nasdaq/hlio/overview" },
    { name: "NASDAQ 100", meta: "NDX INDEX", href: "/instrument/nasdaq/hlio/overview" },
    { name: "Gold Futures", meta: "GCUSD COMMODITY", href: "/instrument/nasdaq/hlio/overview" },
    { name: "Crude Oil", meta: "CLUSD COMMODITY", href: "/instrument/nasdaq/hlio/overview" },
    { name: "Bitcoin", meta: "BTCUSD CRYPTO", href: "/instrument/nasdaq/hlio/overview" },
    { name: instrument.name, meta: `${instrument.symbol} ${instrument.market}`, href: "/instrument/nasdaq/hlio/overview" },
  ],
};

const dashboard: DashboardData = {
  greetingName: "Sam",
  pulse: [
    { name: "S&P 500", value: "5,243.60", change: "+0.62%" },
    { name: "NASDAQ 100", value: "18,219.11", change: "+1.04%" },
    { name: "10Y yield", value: "4.17%", change: "-3 bps" },
    { name: "VIX", value: "14.82", change: "-4.31%" },
  ],
  watchlist,
  spotlight: instrument,
  spotlightSeries: priceSeries,
  portfolioValue: 24891,
  monthlyPortfolioChange: 884,
  signalSummary: "18 buy / 6 hold",
  constructivePercent: 74,
  upcomingEvents: 4,
  briefTitle: "Momentum is broadening beyond mega-cap technology.",
  briefBody: "Four of your tracked sectors now trade above their 50-day average. Earnings dispersion remains the key risk for the next two weeks.",
};

export const mockFinancialDataset: MockFinancialDataset = {
  brand,
  shell,
  instrument,
  dashboard,
  calendar: {
    monthLabel: "August 2026",
    days: Array.from({ length: 35 }, (_, index) => ({
      day: index + 1,
      signal: index % 7 === 0 ? "SELL" : index % 3 === 0 ? "HOLD" : "BUY",
      events: index % 6 === 0 ? 2 : 0,
    })),
    selectedEventTitle: "HLIO signal review",
    selectedEventDescription: "Momentum checkpoint, two macro releases and an analyst revision are scheduled for this mock session.",
  },
  watchlist,
  portfolio,
  searchUniverse,
  overview,
  seasonality: {
    series: seasonalitySeries,
    bestMonth: "November",
    positiveYearsPercent: 72,
    averageReturn: 8.4,
    bias: "Bullish",
  },
  pattern: {
    series: shortPriceSeries,
    probability: { bullish: 56, bearish: 44 },
    robustness: 4,
    strength: "Weak",
    assessment: "This pattern is uncertain; caution is advised.",
    correlatedEvent: { trade: "Bullish", date: "22/07/2013", performance: 4.7, maxDrop: -2.85 },
    cases: patternCases,
  },
  momentum: {
    mood: "Neutral",
    assessment: "The market is stable",
    metrics: [
      { label: "Advanced DPO", value: 75.7 }, { label: "Wyckoff", value: 25.6 }, { label: "Speed", value: 15.1 },
    ],
    dpoSeries: priceSeries.slice(18),
    oscillatorSeries: priceSeries.map((item, index) => ({
      label: item.label,
      value: Math.sin(index * 0.39) * 92 + Math.cos(index * 0.18) * 38,
    })),
  },
  fundamentals,
  political: { chartSeries: politicalChartSeries, trades: politicalTrades },
  news: {
    recaps: [
      "Helio faces a complex landscape, recently bolstered by a major hyperscaler choosing its chips for AI infrastructure. Market sentiment remains constructive, while valuation and execution risks deserve attention ahead of the next earnings report.",
      "Infrastructure demand continues to expand across data centers, networking and accelerated compute. Analysts expect resilient margins, but the market is watching supply and capital spending closely.",
      "The company’s software ecosystem remains a meaningful competitive advantage. New product launches and a broader partner network support the long-term mock outlook.",
    ],
    articles: [
      "Helio secures pipeline for 128 next-generation systems",
      "The hyperscaler guarantee keeps investors watching the next report",
      "Analysts highlight resilient margins and expanding demand",
      "Compute shares gain momentum as infrastructure spending rises",
      "New safety team signals a broader open-model strategy",
      "Data-center roadmap points to a strong second half",
    ].map((title, index) => ({
      id: index + 1,
      title,
      source: index % 2 ? "Market Ledger" : "GlobeWire",
      date: "06/08/2026",
    })),
  },
};
