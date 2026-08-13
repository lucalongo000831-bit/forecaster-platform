import "server-only";

import {
  BreadthEngine, CreditStressEngine, CrossAssetStressEngine, EquityStressEngine, GlobalStressEngine,
  LiquidityStressEngine, MacroStressEngine, NewsRiskEngine, RatesStressEngine, VolatilityStressEngine,
  average, buildComponent, metric, round, scale,
  type CrossAssetRow, type EquityMarketRow, type GlobalRiskComponent, type GlobalRiskHistoryPoint, type GlobalRiskSnapshot, type GlobalRiskSource, type RiskMetric,
} from "@/engines/global-risk";
import { cacheDelete, cacheGet, cacheSet } from "@/lib/server/redis";
import { structuredLog } from "@/lib/server/logger";
import { financialProviderRouter } from "@/providers";
import type { MacroObservation, ProviderNewsItem, ProviderResult } from "@/providers/types";
import { publishDatasetSnapshot } from "@/services/data-v2";
import type { MarketChartDto, MarketQuoteDto } from "@/types";
import { loadGlobalRiskHistory, loadGlobalRiskHistoryReference, loadLatestGlobalRiskSnapshot, loadPersistentGlobalInputs, persistGlobalRiskSnapshot } from "./global-risk-repository";
import { marketSeriesStats, rollingCorrelation, type MarketSeriesStats } from "./market-math";

const CACHE_KEY = "global-risk:current:v1";
const EQUITIES = [
  ["SPY", "S&P 500"], ["QQQ", "Nasdaq 100"], ["DIA", "Dow Jones"], ["IWM", "Russell 2000 proxy"], ["VGK", "European equities"], ["EWI", "Italy / FTSE MIB proxy"],
] as const;
const CROSS_ASSETS = [
  ["SPY", "S&P 500"], ["QQQ", "Nasdaq"], ["TLT", "US Treasury proxy"], ["UUP", "US dollar"], ["GLD", "Gold"], ["USO", "Oil"], ["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"], ["VGK", "European equities"],
] as const;
const SECTORS = ["XLK", "XLF", "XLE", "XLV", "XLI", "XLP", "XLY", "XLU"];
const CHART_SYMBOLS = [...new Set([...EQUITIES.map(([symbol]) => symbol), ...CROSS_ASSETS.map(([symbol]) => symbol), ...SECTORS, "RSP", "HYG", "LQD"])] as string[];
const QUOTE_SYMBOLS = [...new Set([...CHART_SYMBOLS, "^VIX", "^TNX", "^UST2Y"])] as string[];
let pending: Promise<GlobalRiskSnapshot> | null = null;

function fmt(value: number | null, suffix = "") { return value === null ? "Unavailable" : `${round(value, 2)}${suffix}`; }
function sourceName(value: string | undefined) { return value && value !== "unavailable" ? value.toUpperCase() : "UNAVAILABLE"; }
function quoteMap(result: ProviderResult<MarketQuoteDto[]> | null) { return new Map((result?.data ?? []).map((quote) => [quote.symbol.toUpperCase(), quote])); }
type ChartRecord = { data: MarketChartDto; meta: ProviderResult<MarketChartDto>["meta"] };
function seriesMap(results: PromiseSettledResult<ProviderResult<MarketChartDto>>[]) {
  return new Map(results.flatMap((result): Array<[string, ChartRecord]> => result.status === "fulfilled" ? [[result.value.data.symbol.toUpperCase(), { data: result.value.data, meta: result.value.meta }]] : []));
}
function statsFor(series: Map<string, ChartRecord>, symbol: string) { const chart = series.get(symbol.toUpperCase()); return chart ? marketSeriesStats(chart.data.points) : null; }
function downsideStress(value: number | null | undefined, high: number) { return value === null || value === undefined ? null : scale(-value, 0, high); }
function absoluteStress(value: number | null | undefined, low: number, high: number) { return value === null || value === undefined ? null : scale(Math.abs(value), low, high); }
function crossRow(symbol: string, name: string, stats: MarketSeriesStats | null, source: string): CrossAssetRow { const stress = average([downsideStress(stats?.oneMonth, 15), scale(stats?.annualizedVolatility ?? null, 10, symbol.includes("BTC") || symbol.includes("ETH") ? 100 : 45)]); return { symbol, name, price: stats?.price ?? null, oneDay: stats?.oneDay ?? null, fiveDay: stats?.fiveDay ?? null, oneMonth: stats?.oneMonth ?? null, volatility: stats?.annualizedVolatility ?? null, trend: !stats?.price || !stats.sma50 ? "UNAVAILABLE" : stats.price > stats.sma50 * 1.01 ? "UP" : stats.price < stats.sma50 * 0.99 ? "DOWN" : "SIDEWAYS", stressContribution: stress, source }; }
function correlation(first: string, second: string, charts: Map<string, ChartRecord>) { const a = charts.get(first)?.data.points; const b = charts.get(second)?.data.points; return a && b ? rollingCorrelation(a, b) : null; }

function volatilityMetrics(quotes: Map<string, MarketQuoteDto>, charts: Map<string, ChartRecord>): RiskMetric[] {
  const vix = quotes.get("^VIX"); const s = (symbol: string) => statsFor(charts, symbol); const asOf = vix?.asOf ?? null;
  return [
    metric("vix", "VIX", vix?.price ?? null, scale(vix?.price ?? null, 12, 45), { displayValue: fmt(vix?.price ?? null), dataType: vix ? "DIRECT" : "UNAVAILABLE", source: sourceName(vix?.source), asOf }),
    metric("sp500_realized_vol", "S&P 500 realized volatility", s("SPY")?.annualizedVolatility ?? null, scale(s("SPY")?.annualizedVolatility ?? null, 10, 45), { displayValue: fmt(s("SPY")?.annualizedVolatility ?? null, "%"), source: "KAIRO calculated", detail: "Annualized standard deviation of daily log returns." }),
    metric("nasdaq_realized_vol", "Nasdaq realized volatility", s("QQQ")?.annualizedVolatility ?? null, scale(s("QQQ")?.annualizedVolatility ?? null, 12, 55), { displayValue: fmt(s("QQQ")?.annualizedVolatility ?? null, "%"), source: "KAIRO calculated" }),
    metric("europe_realized_vol", "Europe realized volatility", s("VGK")?.annualizedVolatility ?? null, scale(s("VGK")?.annualizedVolatility ?? null, 10, 45), { displayValue: fmt(s("VGK")?.annualizedVolatility ?? null, "%"), source: "KAIRO calculated" }),
    metric("btc_realized_vol", "Bitcoin realized volatility", s("BTC-USD")?.annualizedVolatility ?? null, scale(s("BTC-USD")?.annualizedVolatility ?? null, 30, 110), { displayValue: fmt(s("BTC-USD")?.annualizedVolatility ?? null, "%"), source: "KAIRO calculated" }),
    metric("sp500_atr", "S&P 500 normalized ATR", s("SPY")?.atrPercent ?? null, scale(s("SPY")?.atrPercent ?? null, 0.7, 4), { displayValue: fmt(s("SPY")?.atrPercent ?? null, "%"), source: "KAIRO calculated" }),
  ];
}

function creditMetrics(charts: Map<string, ChartRecord>, inputs: PersistentInputs): RiskMetric[] { const hyg = statsFor(charts, "HYG"); const lqd = statsFor(charts, "LQD"); const xlf = statsFor(charts, "XLF"); const directSpread = latestEconomic(inputs, "us_high_yield_spread")[0]; const relative = hyg?.oneMonth !== null && hyg?.oneMonth !== undefined && lqd?.oneMonth !== null && lqd?.oneMonth !== undefined ? hyg.oneMonth - lqd.oneMonth : null; return [
  metric("high_yield_spread", "US high-yield option-adjusted spread", directSpread?.value ?? null, scale(directSpread?.value ?? null, 2.5, 10), { displayValue: fmt(directSpread?.value ?? null, "%"), dataType: directSpread?.value === null || directSpread?.value === undefined ? "MISSING" : "DIRECT", source: "FRED BAMLH0A0HYM2", asOf: directSpread?.observedAt.toISOString() ?? null }),
  metric("hyg_month", "High yield ETF 1M", hyg?.oneMonth ?? null, downsideStress(hyg?.oneMonth, 12), { displayValue: fmt(hyg?.oneMonth ?? null, "%"), dataType: hyg?.oneMonth !== null && hyg?.oneMonth !== undefined ? "PROXY" : "UNAVAILABLE", source: "HYG proxy", detail: "ETF price performance proxy; not a direct credit spread." }),
  metric("hyg_lqd_relative", "HYG vs LQD relative performance", relative, downsideStress(relative, 6), { displayValue: fmt(relative, "%"), dataType: relative === null ? "UNAVAILABLE" : "PROXY", source: "HYG/LQD proxy" }),
  metric("financials_drawdown", "Financial sector drawdown", xlf?.drawdown52Week ?? null, downsideStress(xlf?.drawdown52Week, 25), { displayValue: fmt(xlf?.drawdown52Week ?? null, "%"), dataType: xlf?.drawdown52Week !== null && xlf?.drawdown52Week !== undefined ? "PROXY" : "UNAVAILABLE", source: "XLF proxy" }),
]; }

function liquidityMetrics(quotes: Map<string, MarketQuoteDto>, charts: Map<string, ChartRecord>): RiskMetric[] { const spy = statsFor(charts, "SPY"); const uup = statsFor(charts, "UUP"); const tlt = statsFor(charts, "TLT"); const quote = quotes.get("SPY"); const spread = quote?.bid && quote.ask && quote.price ? (quote.ask - quote.bid) / quote.price * 10_000 : null; return [
  metric("relative_volume", "S&P 500 relative volume", spy?.relativeVolume ?? null, spy?.relativeVolume === null || spy?.relativeVolume === undefined ? null : scale(Math.abs(spy.relativeVolume - 1), 0.1, 1.5), { displayValue: fmt(spy?.relativeVolume ?? null, "×"), dataType: spy ? "PROXY" : "UNAVAILABLE", source: "SPY volume proxy" }),
  metric("bid_ask", "S&P 500 bid/ask spread", spread, scale(spread, 0.2, 8), { displayValue: fmt(spread, " bps"), dataType: spread === null ? "UNAVAILABLE" : "DIRECT", source: sourceName(quote?.source) }),
  metric("usd_strength", "USD 1M strength", uup?.oneMonth ?? null, scale(uup?.oneMonth ?? null, 0, 8), { displayValue: fmt(uup?.oneMonth ?? null, "%"), dataType: uup ? "PROXY" : "UNAVAILABLE", source: "UUP proxy" }),
  metric("treasury_vol", "Treasury proxy volatility", tlt?.annualizedVolatility ?? null, scale(tlt?.annualizedVolatility ?? null, 8, 30), { displayValue: fmt(tlt?.annualizedVolatility ?? null, "%"), dataType: tlt ? "PROXY" : "UNAVAILABLE", source: "TLT proxy" }),
]; }

function ratesMetrics(quotes: Map<string, MarketQuoteDto>, macro: MacroObservation[][], inputs: PersistentInputs): RiskMetric[] { const ten = quotes.get("^TNX"); const two = quotes.get("^UST2Y"); const persistedFed = latestEconomic(inputs, "us_policy_rate")[0]; const persistedTwo = latestEconomic(inputs, "us_2y")[0]; const persistedTen = latestEconomic(inputs, "us_10y")[0]; const groups = macro.flat(); const latest = (indicator: MacroObservation["indicator"]) => groups.filter((item) => item.indicator === indicator && item.value !== null).sort((a, b) => b.date.localeCompare(a.date))[0]; const fed = latest("RATES"); const inflation = latest("INFLATION"); const fedValue = persistedFed?.value ?? fed?.value ?? null; const twoValue = persistedTwo?.value ?? two?.price ?? null; const tenValue = persistedTen?.value ?? ten?.price ?? null; const curve = tenValue !== null && twoValue !== null ? tenValue - twoValue : null; const curveState = curve === null ? "UNKNOWN" : curve < -0.1 ? "INVERTED" : curve < 0.2 ? "FLAT" : "NORMAL"; return [
  metric("fed_funds", "Fed funds rate", fedValue, scale(fedValue, 2, 7), { displayValue: fmt(fedValue, "%"), dataType: fedValue === null ? "UNAVAILABLE" : "DIRECT", source: persistedFed ? `${sourceName(persistedFed.provider)} official persisted` : "FMP / Alpha Vantage", asOf: persistedFed?.observedAt.toISOString() ?? fed?.date ?? null }),
  metric("us_2y", "US 2Y yield", twoValue, scale(twoValue, 2, 7), { displayValue: fmt(twoValue, "%"), dataType: twoValue === null ? "UNAVAILABLE" : "DIRECT", source: persistedTwo ? `${sourceName(persistedTwo.provider)} official persisted` : sourceName(two?.source), asOf: persistedTwo?.observedAt.toISOString() ?? two?.asOf ?? null }),
  metric("us_10y", "US 10Y yield", tenValue, scale(tenValue, 2, 7), { displayValue: fmt(tenValue, "%"), dataType: tenValue === null ? "UNAVAILABLE" : "DIRECT", source: persistedTen ? `${sourceName(persistedTen.provider)} official persisted` : sourceName(ten?.source), asOf: persistedTen?.observedAt.toISOString() ?? ten?.asOf ?? null }),
  metric("yield_curve", "2Y/10Y spread", curve, curve === null ? null : scale(-curve, 0, 1.5), { displayValue: fmt(curve, "%"), dataType: curve === null ? "MISSING" : "CALCULATED_FROM_DIRECT", source: "KAIRO calculated from US 2Y and 10Y", detail: curveState }),
  metric("inflation", "Inflation", inflation?.value ?? null, scale(inflation?.value ?? null, 2, 8), { displayValue: fmt(inflation?.value ?? null, "%"), dataType: inflation ? "DIRECT" : "UNAVAILABLE", source: "FMP / Alpha Vantage", asOf: inflation?.date ?? null }),
]; }

function breadthMetrics(charts: Map<string, ChartRecord>): RiskMetric[] { const available = SECTORS.map((symbol) => statsFor(charts, symbol)).filter((item): item is MarketSeriesStats => Boolean(item?.price)); const sufficientUniverse = available.length / SECTORS.length >= .8; const above50 = sufficientUniverse ? available.filter((item) => item.sma50 && item.price! > item.sma50).length / available.length * 100 : null; const above200 = sufficientUniverse ? available.filter((item) => item.sma200 && item.price! > item.sma200).length / available.length * 100 : null; const rsp = statsFor(charts, "RSP"); const spy = statsFor(charts, "SPY"); const iwm = statsFor(charts, "IWM"); const equalRelative = rsp?.oneMonth !== null && rsp?.oneMonth !== undefined && spy?.oneMonth !== null && spy?.oneMonth !== undefined ? rsp.oneMonth - spy.oneMonth : null; const smallRelative = iwm?.oneMonth !== null && iwm?.oneMonth !== undefined && spy?.oneMonth !== null && spy?.oneMonth !== undefined ? iwm.oneMonth - spy.oneMonth : null; return [
  metric("above_sma50", "Tracked sectors above SMA50", above50, scale(above50, 20, 80, true), { displayValue: fmt(above50, "%"), dataType: above50 === null ? "UNAVAILABLE" : "PROXY", source: "Sector ETF breadth proxy" }),
  metric("above_sma200", "Tracked sectors above SMA200", above200, scale(above200, 20, 80, true), { displayValue: fmt(above200, "%"), dataType: above200 === null ? "UNAVAILABLE" : "PROXY", source: "Sector ETF breadth proxy" }),
  metric("equal_weight", "Equal-weight vs cap-weight 1M", equalRelative, downsideStress(equalRelative, 6), { displayValue: fmt(equalRelative, "%"), dataType: equalRelative === null ? "UNAVAILABLE" : "PROXY", source: "RSP/SPY proxy" }),
  metric("small_caps", "Small caps vs large caps 1M", smallRelative, downsideStress(smallRelative, 8), { displayValue: fmt(smallRelative, "%"), dataType: smallRelative === null ? "UNAVAILABLE" : "PROXY", source: "IWM/SPY proxy" }),
]; }

function equityRows(charts: Map<string, ChartRecord>): EquityMarketRow[] { return EQUITIES.map(([symbol, name]) => { const stats = statsFor(charts, symbol); const row = crossRow(symbol, name, stats, sourceName(charts.get(symbol)?.meta.provider)); return { ...row, drawdown52Week: stats?.drawdown52Week ?? null, sma50: stats?.sma50 ?? null, sma200: stats?.sma200 ?? null, rsi14: stats?.rsi14 ?? null }; }); }
function equityMetrics(rows: EquityMarketRow[]): RiskMetric[] { return rows.map((row) => metric(row.symbol === "SPY" ? "sp500_drawdown" : `equity_${row.symbol.toLowerCase()}`, row.name, row.drawdown52Week, average([downsideStress(row.drawdown52Week, 25), scale(row.volatility, 12, 50), row.price && row.sma200 ? scale(-(row.price / row.sma200 - 1) * 100, 0, 18) : null]), { displayValue: row.price === null ? "Unavailable" : `${fmt(row.oneDay, "%")} 1D · ${fmt(row.drawdown52Week, "%")} DD`, dataType: row.price === null ? "MISSING" : "CALCULATED_FROM_DIRECT", source: row.source })); }

function crossAssetMetrics(charts: Map<string, ChartRecord>) { const correlations = [{ key: "equity_bond", label: "Equity / bond", value: correlation("SPY", "TLT", charts) }, { key: "equity_gold", label: "Equity / gold", value: correlation("SPY", "GLD", charts) }, { key: "equity_usd", label: "Equity / USD", value: correlation("SPY", "UUP", charts) }, { key: "equity_btc", label: "Equity / Bitcoin", value: correlation("SPY", "BTC-USD", charts) }, { key: "btc_nasdaq", label: "Bitcoin / Nasdaq", value: correlation("BTC-USD", "QQQ", charts) }]; const available = correlations.map((item) => item.value).filter((value): value is number => value !== null); const stressCorrelation = available.length ? Math.max(...available.map(Math.abs)) : null; return [metric("stress_correlation", "Maximum absolute rolling correlation", stressCorrelation, scale(stressCorrelation, 0.3, 0.85), { displayValue: fmt(stressCorrelation), source: "KAIRO calculated", detail: "60-session rolling return correlation." }), ...correlations.map((item) => metric(item.key, item.label, item.value, absoluteStress(item.value, 0.35, 0.9), { displayValue: fmt(item.value), source: "KAIRO calculated" }))]; }

function macroMetrics(groups: MacroObservation[][], highImpactEvents: number | null, inputs: PersistentInputs): RiskMetric[] { const all = groups.flat(); const observations = (indicator: MacroObservation["indicator"]) => all.filter((item) => item.indicator === indicator && item.value !== null).sort((a, b) => b.date.localeCompare(a.date)); const latest = (indicator: MacroObservation["indicator"]) => observations(indicator)[0]?.value ?? null; const percentageChange = (rows: ReturnType<typeof latestEconomic>, lag: number) => rows.length > lag && rows[0]!.value !== null && rows[lag]!.value ? (rows[0]!.value! / rows[lag]!.value! - 1) * 100 : null; const cpi = latestEconomic(inputs, "us_cpi"); const gdp = latestEconomic(inputs, "us_gdp"); const unemployment = latestEconomic(inputs, "us_unemployment"); const inflationValue = percentageChange(cpi, 12) ?? latest("INFLATION"); const gdpValue = percentageChange(gdp, 4) ?? latest("GDP"); const providerEmployment = observations("EMPLOYMENT"); const unemploymentChange = unemployment.length > 1 ? unemployment[0]!.value! - unemployment[1]!.value! : providerEmployment.length > 1 ? providerEmployment[0]!.value! - providerEmployment[1]!.value! : null; return [
  metric("macro_inflation", "Inflation pressure", inflationValue, scale(inflationValue, 2, 8), { displayValue: fmt(inflationValue, "%"), dataType: inflationValue === null ? "UNAVAILABLE" : cpi.length > 12 ? "CALCULATED_FROM_DIRECT" : "DIRECT", source: cpi.length > 12 ? "FRED official persisted · YoY calculated" : "FMP / Alpha Vantage", asOf: cpi[0]?.observedAt.toISOString() ?? null }),
  metric("macro_gdp", "Real GDP growth", gdpValue, scale(gdpValue, -2, 4, true), { displayValue: fmt(gdpValue, "% YoY"), dataType: gdpValue === null ? "UNAVAILABLE" : gdp.length > 4 ? "CALCULATED_FROM_DIRECT" : "DIRECT", source: gdp.length > 4 ? "FRED official persisted · YoY calculated" : "FMP / Alpha Vantage", asOf: gdp[0]?.observedAt.toISOString() ?? null }),
  metric("macro_employment", "Unemployment change", unemploymentChange, scale(unemploymentChange, 0, 1.5), { displayValue: fmt(unemploymentChange, " pp"), dataType: unemploymentChange === null ? "MISSING" : "CALCULATED_FROM_DIRECT", source: unemployment.length > 1 ? "FRED official persisted · KAIRO calculated" : "KAIRO calculated", asOf: unemployment[0]?.observedAt.toISOString() ?? null }),
  metric("macro_events", "Major events next 7D", highImpactEvents, scale(highImpactEvents, 1, 10), { displayValue: highImpactEvents === null ? "Unavailable" : String(highImpactEvents), dataType: highImpactEvents === null ? "UNAVAILABLE" : "DIRECT", source: "FMP economic calendar" }),
]; }

function newsMetrics(news: ProviderNewsItem[] | null): RiskMetric[] { if (!news) return [metric("news_sentiment", "Overall news sentiment", null, null), metric("negative_share", "Negative news share", null, null), metric("news_volume", "Risk-news volume", null, null)]; const scores = news.map((item) => item.overallSentimentScore).filter((value): value is number => value !== null); const sentiment = average(scores); const negativeShare = scores.length ? scores.filter((value) => value < -0.15).length / scores.length * 100 : null; const topics = new Set(news.flatMap((item) => item.topics.map((topic) => topic.toLowerCase()))); return [
  metric("news_sentiment", "Overall news sentiment", sentiment, sentiment === null ? null : scale(-sentiment, -0.1, 0.5), { displayValue: fmt(sentiment), dataType: sentiment === null ? "UNAVAILABLE" : "DIRECT", source: "Alpha Vantage / provider news" }),
  metric("negative_share", "Negative news share", negativeShare, scale(negativeShare, 10, 70), { displayValue: fmt(negativeShare, "%"), dataType: negativeShare === null ? "MISSING" : "CALCULATED_FROM_DIRECT", source: "KAIRO calculated from direct news sentiment" }),
  metric("news_volume", "Risk-news volume", news.length, scale(news.length, 5, 50), { displayValue: String(news.length), dataType: "DIRECT", source: "Alpha Vantage / provider news", detail: [...topics].slice(0, 6).join(", ") || "No classified topics" }),
]; }

type PersistentInputs = Awaited<ReturnType<typeof loadPersistentGlobalInputs>>;
function latestEconomic(inputs: PersistentInputs, key: string) { return inputs.economic.filter((item) => item.key === key && item.value !== null).sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime()); }
export function energyMetrics(inputs: PersistentInputs, charts: Map<string, ChartRecord>): RiskMetric[] {
  const inventory = latestEconomic(inputs, "us_crude_inventory"); const gas = latestEconomic(inputs, "us_gas_storage"); const oil = statsFor(charts, "USO");
  const change = (rows: typeof inventory) => rows.length > 1 ? rows[0]!.value! - rows[1]!.value! : null;
  return [
    metric("crude_inventory_change", "Crude inventory trend", change(inventory), absoluteStress(change(inventory), 1_000, 15_000), { displayValue: fmt(change(inventory), " kb"), dataType: inventory.length > 1 ? "CALCULATED_FROM_DIRECT" : "UNAVAILABLE", source: "EIA", asOf: inventory[0]?.observedAt.toISOString() ?? null }),
    metric("gas_storage_change", "Natural gas storage trend", change(gas), absoluteStress(change(gas), 20, 150), { displayValue: fmt(change(gas), " Bcf"), dataType: gas.length > 1 ? "CALCULATED_FROM_DIRECT" : "UNAVAILABLE", source: "EIA", asOf: gas[0]?.observedAt.toISOString() ?? null }),
    metric("energy_price_trend", "Energy price proxy 1M", oil?.oneMonth ?? null, absoluteStress(oil?.oneMonth, 5, 25), { displayValue: fmt(oil?.oneMonth ?? null, "%"), dataType: oil ? "PROXY" : "UNAVAILABLE", source: "USO price proxy" }),
  ];
}

function positioningMetrics(inputs: PersistentInputs): RiskMetric[] {
  const byContract = new Map<string, typeof inputs.positioning>(); for (const row of inputs.positioning) byContract.set(row.contract, [...(byContract.get(row.contract) ?? []), row]);
  const current = [...byContract.values()].map((rows) => rows.sort((a, b) => b.reportDate.getTime() - a.reportDate.getTime())[0]!).filter(Boolean); const ratios = current.map((row) => row.net !== null && row.openInterest ? row.net / row.openInterest * 100 : null).filter((value): value is number => value !== null);
  const crowding = ratios.length ? Math.max(...ratios.map(Math.abs)) : null; const changes = [...byContract.values()].map((rows) => rows.length > 1 && rows[0]!.net !== null && rows[1]!.net !== null ? rows[0]!.net! - rows[1]!.net! : null).filter((value): value is number => value !== null); const weeklyChange = changes.length ? changes.reduce((sum, value) => sum + Math.abs(value), 0) / changes.length : null;
  return [
    metric("cot_crowding", "COT maximum net/open-interest", crowding, scale(crowding, 15, 55), { displayValue: fmt(crowding, "%"), dataType: crowding === null ? "UNAVAILABLE" : "DIRECT", source: "CFTC COT", asOf: current[0]?.reportDate.toISOString() ?? null }),
    metric("cot_weekly_change", "COT average weekly net change", weeklyChange, weeklyChange === null ? null : scale(weeklyChange, 1_000, 100_000), { displayValue: fmt(weeklyChange), dataType: weeklyChange === null ? "MISSING" : "CALCULATED_FROM_DIRECT", source: "CFTC COT" }),
  ];
}

function persistentNewsMetrics(inputs: PersistentInputs, fallback: ProviderNewsItem[] | null) {
  if (!inputs.news.length) return newsMetrics(fallback);
  const cutoff = Date.now() - 48 * 3_600_000; const recent = inputs.news.filter((item) => item.publishedAt.getTime() >= cutoff); const sample = recent.length ? recent : inputs.news.slice(0, 50); const sentiments = sample.map((item) => item.sentiment).filter((value): value is number => value !== null); const sentiment = average(sentiments); const negativeShare = sentiments.length ? sentiments.filter((value) => value < -0.15).length / sentiments.length * 100 : null; const riskTerms = /war|sanction|conflict|crisis|default|attack|tariff|recession/i; const riskVolume = sample.filter((item) => riskTerms.test(item.title)).length;
  return [metric("news_sentiment", "Overall news sentiment", sentiment, sentiment === null ? null : scale(-sentiment, -0.1, 0.5), { displayValue: fmt(sentiment), dataType: sentiment === null ? "MISSING" : "CALCULATED_FROM_DIRECT", source: "Marketaux persisted", asOf: sample[0]?.publishedAt.toISOString() ?? null }), metric("negative_share", "Negative news share", negativeShare, scale(negativeShare, 10, 70), { displayValue: fmt(negativeShare, "%"), source: "KAIRO calculated from direct news sentiment" }), metric("risk_news_volume", "Risk-topic article volume", riskVolume, scale(riskVolume, 2, 25), { displayValue: String(riskVolume), dataType: "CALCULATED_FROM_DIRECT", source: "Marketaux persisted" })];
}

async function collectGlobalRisk(): Promise<GlobalRiskSnapshot> {
  const now = new Date(); const from = now.toISOString().slice(0, 10); const to = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const [quotesSettled, chartSettled, macroSettled, newsSettled, calendarSettled, history, latest, persistentInputs] = await Promise.all([
    financialProviderRouter.quotes(QUOTE_SYMBOLS).then((value) => ({ status: "fulfilled" as const, value })).catch((reason) => ({ status: "rejected" as const, reason })),
    Promise.allSettled(CHART_SYMBOLS.map((symbol) => financialProviderRouter.analyticsChart(symbol, "1Y", "1d"))),
    Promise.allSettled(["INFLATION", "RATES", "GDP", "EMPLOYMENT"].map((indicator) => financialProviderRouter.macroIndicator(indicator as MacroObservation["indicator"]))),
    financialProviderRouter.topicNews(["economy", "financial_markets", "energy", "technology", "finance", "regulation", "blockchain", "manufacturing"], 50).then((value) => ({ status: "fulfilled" as const, value })).catch((reason) => ({ status: "rejected" as const, reason })),
    financialProviderRouter.economicCalendar(from, to).then((value) => ({ status: "fulfilled" as const, value })).catch((reason) => ({ status: "rejected" as const, reason })),
    loadGlobalRiskHistoryReference(now), loadLatestGlobalRiskSnapshot(), loadPersistentGlobalInputs(),
  ]);
  const quotesResult = quotesSettled.status === "fulfilled" ? quotesSettled.value : null; const quotes = quoteMap(quotesResult); const charts = seriesMap(chartSettled);
  const macroResults = macroSettled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []); const macro = macroResults.map((result) => result.data); const newsResult = newsSettled.status === "fulfilled" ? newsSettled.value : null; const highImpactEvents = calendarSettled.status === "fulfilled" ? calendarSettled.value.data.filter((event) => event.impact?.toLowerCase() === "high").length : null;
  const equities = equityRows(charts); const crossAssets = CROSS_ASSETS.map(([symbol, name]) => crossRow(symbol, name, statsFor(charts, symbol), sourceName(charts.get(symbol)?.meta.provider)));
  const persistentEconomicProviders = [...new Set(persistentInputs.economic.map((item) => item.provider.toUpperCase()))];
  const components: GlobalRiskComponent[] = [new VolatilityStressEngine().evaluate(volatilityMetrics(quotes, charts)), new CreditStressEngine().evaluate(creditMetrics(charts, persistentInputs)), new LiquidityStressEngine().evaluate(liquidityMetrics(quotes, charts)), new RatesStressEngine().evaluate(ratesMetrics(quotes, macro, persistentInputs)), new BreadthEngine().evaluate(breadthMetrics(charts)), new EquityStressEngine().evaluate(equityMetrics(equities)), new CrossAssetStressEngine().evaluate(crossAssetMetrics(charts)), new MacroStressEngine().evaluate(macroMetrics(macro, highImpactEvents, persistentInputs)), buildComponent("ENERGY", "Energy stress", energyMetrics(persistentInputs, charts), "Official energy observations and an explicitly labelled price proxy."), buildComponent("POSITIONING", "Market positioning", positioningMetrics(persistentInputs), "Weekly CFTC positioning; insufficient history is not scored."), new NewsRiskEngine().evaluate(persistentNewsMetrics(persistentInputs, newsResult?.data ?? null))];
  const previous = new Map(latest?.components.map((component) => [component.key, component]) ?? []); for (let index = 0; index < components.length; index += 1) { const component = components[index]!; const old = previous.get(component.key); if (component.score === null && old?.score !== null && old?.score !== undefined) components[index] = { ...old, weight: component.weight, completeness: Math.min(old.completeness, 50), confidence: "VERY_LOW", classification: `${old.classification} · STALE LKG`, summary: `${old.summary} Last-known-good value; current source unavailable.`, freshness: "STALE", isLastKnownGood: true, change: null }; else { component.change = component.score !== null && old?.score !== null && old?.score !== undefined ? round(component.score - old.score) : null; component.freshness = component.score === null ? "UNAVAILABLE" : "FRESH"; component.isLastKnownGood = false; } }
  const timestamps = [quotesResult?.meta.sourceTimestamp, ...[...charts.values()].map((item) => item.meta.sourceTimestamp), ...macroResults.map((item) => item.meta.sourceTimestamp), newsResult?.meta.sourceTimestamp].filter((value): value is string => Boolean(value)).sort();
  const sources: GlobalRiskSource[] = [
    { provider: quotesResult?.meta.provider ?? "market providers", category: "MARKET", asOf: quotesResult?.meta.sourceTimestamp ?? timestamps.at(-1) ?? null, freshness: quotesResult?.meta.freshnessType ?? "UNAVAILABLE", available: Boolean(quotesResult || charts.size) },
    { provider: macroResults.map((item) => item.meta.provider).join(" / ") || "macro providers", category: "MACRO", asOf: macroResults.map((item) => item.meta.sourceTimestamp).filter(Boolean).sort().at(-1) ?? null, freshness: macroResults[0]?.meta.freshnessType ?? "UNAVAILABLE", available: macroResults.length > 0 },
    { provider: newsResult?.meta.provider ?? "news providers", category: "NEWS", asOf: newsResult?.meta.sourceTimestamp ?? null, freshness: newsResult?.meta.freshnessType ?? "UNAVAILABLE", available: Boolean(newsResult) },
    { provider: persistentEconomicProviders.length ? `${persistentEconomicProviders.join(" / ")} official persisted` : "official economic store", category: "MACRO", asOf: persistentInputs.economic[0]?.observedAt.toISOString() ?? null, freshness: persistentInputs.economic.length ? "CACHED" : "UNAVAILABLE", available: persistentInputs.economic.length > 0 },
    { provider: persistentInputs.positioning.length ? "CFTC official persisted" : "CFTC", category: "MARKET", asOf: persistentInputs.positioning[0]?.reportDate.toISOString() ?? null, freshness: persistentInputs.positioning.length ? "CACHED" : "UNAVAILABLE", available: persistentInputs.positioning.length > 0 },
    { provider: "KAIRO deterministic engines", category: "CALCULATED", asOf: now.toISOString(), freshness: "CURRENT", available: true },
  ];
  const snapshot = new GlobalStressEngine().calculate({ components, history, equityMarkets: equities, crossAssets, sources, inputTimestamp: timestamps.at(-1) ?? now.toISOString(), calculatedAt: now.toISOString() });
  if (snapshot.dataCompleteness < 10 && latest) return { ...latest, confidence: "VERY_LOW", sources: sources.map((source) => ({ ...source, available: false, freshness: "UNAVAILABLE" })) };
  const id = await persistGlobalRiskSnapshot(snapshot, 15);
  await publishDatasetSnapshot({ dataset: "global_risk", payload: snapshot as unknown as Record<string, unknown>, recordCount: snapshot.components.length, coverage: snapshot.dataCompleteness, sourceSucceeded: snapshot.activeLayers > 0, schemaValid: true, allowVerifiedEmpty: false, sourceTimestamp: snapshot.inputTimestamp, expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(), freshness: "FRESH", schemaVersion: "global-risk-snapshot-v2", modelVersion: snapshot.modelVersion });
  return { ...snapshot, id };
}

export async function getGlobalRiskCurrent(options: { force?: boolean } = {}) {
  if (options.force) await cacheDelete(CACHE_KEY);
  if (!options.force) { const cached = await cacheGet<GlobalRiskSnapshot>(CACHE_KEY); if (cached) return cached; }
  if (pending) return pending;
  pending = collectGlobalRisk().then(async (snapshot) => { await cacheSet(CACHE_KEY, snapshot, 300); return snapshot; }).catch(async (error) => { structuredLog("error", "global-risk.calculation.failed", { code: error instanceof Error ? error.name : "UNKNOWN" }); const latest = await loadLatestGlobalRiskSnapshot(); if (latest) return { ...latest, confidence: "VERY_LOW" as const }; throw error; }).finally(() => { pending = null; });
  return pending;
}

const RANGE_MS: Record<string, number> = { "1D": 86_400_000, "5D": 5 * 86_400_000, "1M": 31 * 86_400_000, "3M": 93 * 86_400_000, "6M": 186 * 86_400_000, "1Y": 366 * 86_400_000, MAX: 20 * 366 * 86_400_000 };
export async function getGlobalRiskHistory(range = "1M"): Promise<GlobalRiskHistoryPoint[]> { const duration = RANGE_MS[range] ?? RANGE_MS["1M"]!; const now = new Date(); const history = await loadGlobalRiskHistory(new Date(now.getTime() - duration), now); if (history.length) return history; const current = await getGlobalRiskCurrent(); return [{ id: current.id ?? "current", score: current.score, status: current.status, systemicStress: current.systemicStress, trend: current.trend, calculatedAt: current.calculatedAt, statusChanged: false }]; }
