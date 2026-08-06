import { clamp, mean, sampleStandardDeviation } from "@/engines/shared/statistics";
import { BACKTEST_MODEL_VERSION, type BacktestInput, type BacktestMetrics, type BacktestResult, type BacktestTrade } from "./types";

type Bar = { timestamp: string; open: number; high: number; low: number; close: number };
type Position = { side: "LONG" | "SHORT"; entryIndex: number; entryAt: string; entryPrice: number; quantity: number; initialStop: number; target: number; trailingStop: number; extreme: number; entryCommission: number };

function normalizedBars(input: BacktestInput["bars"], from: string, to: string): Bar[] {
  return [...new Map(input.flatMap((bar): Array<[string, Bar]> => {
    const date = bar.timestamp.slice(0, 10); const adjusted = bar.adjustedClose ?? bar.close; const factor = bar.close > 0 ? adjusted / bar.close : 1;
    if (date < from || date > to || ![bar.open, bar.high, bar.low, adjusted, factor].every(Number.isFinite) || adjusted <= 0) return [];
    return [[bar.timestamp, { timestamp: bar.timestamp, open: bar.open * factor, high: bar.high * factor, low: bar.low * factor, close: adjusted }]];
  })).values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function signalAt(bars: Bar[], index: number, strategy: BacktestInput["configuration"]["strategy"]) {
  if (index < 200) return 0;
  const close = bars[index].close; const sma50 = average(bars.slice(index - 49, index + 1).map((bar) => bar.close)); const sma200 = average(bars.slice(index - 199, index + 1).map((bar) => bar.close));
  if (strategy === "SMA_CROSS") return sma50 > sma200 ? 1 : sma50 < sma200 ? -1 : 0;
  if (strategy === "BREAKOUT") { const previous = bars.slice(index - 20, index); const high = Math.max(...previous.map((bar) => bar.high)); const low = Math.min(...previous.map((bar) => bar.low)); return close > high ? 1 : close < low ? -1 : 0; }
  const momentum = close / bars[index - 20].close - 1;
  return sma50 > sma200 && momentum > 0 ? 1 : sma50 < sma200 && momentum < 0 ? -1 : 0;
}
function executionPrice(price: number, side: "LONG" | "SHORT", entering: boolean, frictionBps: number) { const buy = entering ? side === "LONG" : side === "SHORT"; return price * (1 + (buy ? 1 : -1) * frictionBps / 10_000); }

export function runBacktest(input: BacktestInput): BacktestResult {
  const started = Date.now(); const config = input.configuration; const bars = normalizedBars(input.bars, config.from, config.to);
  if (bars.length < 230) throw new Error("INSUFFICIENT_BACKTEST_DATA");
  const signals = bars.map((_, index) => signalAt(bars, index, config.strategy)); const friction = clamp(config.spreadBps, 0, 500) / 2 + clamp(config.slippageBps, 0, 500);
  let capital = config.initialCapital; let position: Position | null = null; let exposureDays = 0; let turnoverNotional = 0; const trades: BacktestTrade[] = []; const equityCurve: BacktestResult["equityCurve"] = [];
  const closePosition = (current: Position, index: number, rawPrice: number, reason: BacktestTrade["exitReason"]) => {
    const exitPrice = executionPrice(rawPrice, current.side, false, friction); const gross = (exitPrice - current.entryPrice) * current.quantity * (current.side === "LONG" ? 1 : -1); const costs = current.entryCommission + config.commission; const pnl = gross - costs; capital += gross - config.commission;
    turnoverNotional += Math.abs(exitPrice * current.quantity); trades.push({ side: current.side, entryAt: current.entryAt, exitAt: bars[index].timestamp, entryPrice: current.entryPrice, exitPrice, quantity: current.quantity, costs, pnl, returnPercent: pnl / (current.entryPrice * current.quantity) * 100, holdingDays: index - current.entryIndex + 1, exitReason: reason });
  };
  const openPosition = (index: number, signal: number): Position | null => {
    const side = signal > 0 ? "LONG" : "SHORT"; if ((side === "LONG" && config.direction === "SHORT") || (side === "SHORT" && config.direction === "LONG")) return null;
    const rawPrice = config.entryTiming === "NEXT_OPEN" ? bars[index].open : bars[index].close; const entryPrice = executionPrice(rawPrice, side, true, friction); const basis = config.reinvest ? capital : config.initialCapital; const quantity = Math.max(0, (basis - config.commission) / entryPrice); if (!quantity) return null;
    capital -= config.commission; turnoverNotional += entryPrice * quantity; const stop = side === "LONG" ? entryPrice * (1 - config.stopPercent) : entryPrice * (1 + config.stopPercent); const target = side === "LONG" ? entryPrice * (1 + config.targetPercent) : entryPrice * (1 - config.targetPercent); return { side, entryIndex: index, entryAt: bars[index].timestamp, entryPrice, quantity, initialStop: stop, target, trailingStop: stop, extreme: entryPrice, entryCommission: config.commission };
  };
  for (let index = 201; index < bars.length; index += 1) {
    const bar = bars[index]; const priorSignal = signals[index - 1];
    if (position && priorSignal !== 0 && (priorSignal > 0 ? "LONG" : "SHORT") !== position.side) { closePosition(position, index, bar.open, "SIGNAL"); position = null; }
    if (!position && priorSignal !== 0) position = openPosition(index, priorSignal);
    if (position) {
      exposureDays += 1; const current = position; const stop = Math.max(current.initialStop, current.side === "LONG" ? current.trailingStop : Number.NEGATIVE_INFINITY); const shortStop = Math.min(current.initialStop, current.side === "SHORT" ? current.trailingStop : Number.POSITIVE_INFINITY);
      const exit = current.side === "LONG" && bar.low <= stop ? { price: stop, reason: (stop === current.initialStop ? "STOP" : "TRAILING") as BacktestTrade["exitReason"] }
        : current.side === "SHORT" && bar.high >= shortStop ? { price: shortStop, reason: (shortStop === current.initialStop ? "STOP" : "TRAILING") as BacktestTrade["exitReason"] }
          : current.side === "LONG" && bar.high >= current.target ? { price: current.target, reason: "TARGET" as const }
            : current.side === "SHORT" && bar.low <= current.target ? { price: current.target, reason: "TARGET" as const }
              : index - current.entryIndex + 1 >= config.maximumHoldingDays ? { price: bar.close, reason: "MAX_HOLD" as const } : null;
      if (exit) { closePosition(current, index, exit.price, exit.reason); position = null; }
      else if (current.side === "LONG") { current.extreme = Math.max(current.extreme, bar.high); current.trailingStop = Math.max(current.trailingStop, current.extreme * (1 - config.trailingPercent)); }
      else { current.extreme = Math.min(current.extreme, bar.low); current.trailingStop = Math.min(current.trailingStop, current.extreme * (1 + config.trailingPercent)); }
    }
    const unrealized = position ? (bar.close - position.entryPrice) * position.quantity * (position.side === "LONG" ? 1 : -1) : 0; equityCurve.push({ timestamp: bar.timestamp, value: capital + unrealized });
  }
  if (position) { closePosition(position, bars.length - 1, bars.at(-1)!.close, "END_OF_DATA"); position = null; equityCurve[equityCurve.length - 1] = { timestamp: bars.at(-1)!.timestamp, value: capital }; }
  const returns = equityCurve.slice(1).map((point, index) => point.value / equityCurve[index].value - 1); const averageReturn = mean(returns); const volatility = sampleStandardDeviation(returns); const downside = sampleStandardDeviation(returns.filter((value) => value < 0));
  let peak = equityCurve[0]?.value ?? config.initialCapital; let maximumDrawdown = 0; let currentDuration = 0; let drawdownDuration = 0; const drawdownCurve = equityCurve.map((point) => { peak = Math.max(peak, point.value); const drawdown = peak ? (point.value / peak - 1) * 100 : 0; if (drawdown < 0) { currentDuration += 1; drawdownDuration = Math.max(drawdownDuration, currentDuration); } else currentDuration = 0; maximumDrawdown = Math.min(maximumDrawdown, drawdown); return { timestamp: point.timestamp, value: drawdown }; });
  const years = (new Date(bars.at(-1)!.timestamp).getTime() - new Date(bars[0].timestamp).getTime()) / (365.25 * 86_400_000); const totalReturn = (capital / config.initialCapital - 1) * 100; const cagr = years > 0 && capital > 0 ? ((capital / config.initialCapital) ** (1 / years) - 1) * 100 : null;
  const wins = trades.filter((trade) => trade.pnl > 0); const losses = trades.filter((trade) => trade.pnl < 0); const averageWin = mean(wins.map((trade) => trade.pnl)); const averageLoss = mean(losses.map((trade) => trade.pnl));
  const benchmarkBars = input.benchmarkBars ? normalizedBars(input.benchmarkBars, config.from, config.to) : []; const benchmarkReturn = benchmarkBars.length > 1 ? (benchmarkBars.at(-1)!.close / benchmarkBars[0].close - 1) * 100 : null; const benchmarkCurve = benchmarkBars.map((bar) => ({ timestamp: bar.timestamp, value: config.initialCapital * bar.close / benchmarkBars[0].close }));
  const benchmarkReturns = benchmarkBars.slice(1).map((bar, index) => bar.close / benchmarkBars[index].close - 1); const paired = Math.min(returns.length, benchmarkReturns.length); const strategyPaired = returns.slice(-paired); const benchmarkPaired = benchmarkReturns.slice(-paired); const strategyMean = mean(strategyPaired); const benchmarkMean = mean(benchmarkPaired); const covariance = paired > 1 && strategyMean !== null && benchmarkMean !== null ? strategyPaired.reduce((sum, value, index) => sum + (value - strategyMean) * (benchmarkPaired[index] - benchmarkMean), 0) / (paired - 1) : null; const benchmarkVariance = benchmarkPaired.length > 1 && benchmarkMean !== null ? benchmarkPaired.reduce((sum, value) => sum + (value - benchmarkMean) ** 2, 0) / (paired - 1) : null;
  const metrics: BacktestMetrics = { totalReturn, cagr, annualizedVolatility: volatility === null ? null : volatility * Math.sqrt(252) * 100, sharpeRatio: volatility && averageReturn !== null ? averageReturn / volatility * Math.sqrt(252) : null, sortinoRatio: downside && averageReturn !== null ? averageReturn / downside * Math.sqrt(252) : null, calmarRatio: cagr !== null && maximumDrawdown < 0 ? cagr / Math.abs(maximumDrawdown) : null, maximumDrawdown, drawdownDuration, winRate: trades.length ? wins.length / trades.length * 100 : null, lossRate: trades.length ? losses.length / trades.length * 100 : null, averageWin, averageLoss, payoffRatio: averageWin !== null && averageLoss !== null && averageLoss !== 0 ? averageWin / Math.abs(averageLoss) : null, profitFactor: losses.reduce((sum, trade) => sum + Math.abs(trade.pnl), 0) > 0 ? wins.reduce((sum, trade) => sum + trade.pnl, 0) / losses.reduce((sum, trade) => sum + Math.abs(trade.pnl), 0) : null, expectancy: trades.length ? mean(trades.map((trade) => trade.pnl)) : null, exposure: exposureDays / Math.max(1, bars.length - 201) * 100, turnover: turnoverNotional / config.initialCapital, numberOfTrades: trades.length, averageHoldingPeriod: mean(trades.map((trade) => trade.holdingDays)), bestTrade: trades.length ? Math.max(...trades.map((trade) => trade.returnPercent)) : null, worstTrade: trades.length ? Math.min(...trades.map((trade) => trade.returnPercent)) : null, benchmarkReturn, alpha: benchmarkReturn === null ? null : totalReturn - benchmarkReturn, beta: covariance !== null && benchmarkVariance && benchmarkVariance > 0 ? covariance / benchmarkVariance : null };
  return { configuration: config, metrics, trades, equityCurve, drawdownCurve, benchmarkCurve, dataPoints: bars.length, warmupPoints: 200, modelVersion: BACKTEST_MODEL_VERSION, createdAt: new Date().toISOString(), runtimeMs: Date.now() - started, persisted: false, biasControls: ["Signals use only bars available through the previous close.", "Default execution occurs at the next session open.", "Prices are adjusted with each bar's adjusted-close factor.", "Costs, half-spread and slippage are charged on every round trip.", "No optimization is performed on the evaluation range."], limitations: ["Single-symbol history cannot remove survivorship bias.", "Intraday ordering is conservative: when stop and target are both touched, stop is assumed first.", "Taxes, borrow availability, funding rates and FX conversion are not modeled.", "Historical results are not indicative of future performance."] };
}
