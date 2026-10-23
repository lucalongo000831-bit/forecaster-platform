import type { TechnicalChartResponse, TechnicalRangeSelection, TechnicalTimeframe } from "@/types";

type Pending = { controller: AbortController; promise: Promise<TechnicalChartResponse>; users: number };
const cache = new Map<string, { value: TechnicalChartResponse; expires: number }>();
const pending = new Map<string, Pending>();
function validBars(rows: unknown): boolean {
  if (!Array.isArray(rows) || !rows.length) return false;
  let previous = -Infinity;
  return rows.every((row) => {
    if (!row || typeof row !== "object") return false;
    const stamp = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    const valid = Number.isFinite(stamp) && stamp % 1000 === 0 && stamp > previous && [row.open, row.high, row.low, row.close, row.volume].every((n) => typeof n === "number" && Number.isFinite(n)) && [row.open, row.high, row.low, row.close].every((n) => n > 0) && row.volume >= 0 && row.low <= Math.min(row.open, row.close) && row.high >= Math.max(row.open, row.close);
    previous = stamp;
    return valid;
  });
}
export function technicalRequestKey(symbol: string, timeframe: TechnicalTimeframe, selection: TechnicalRangeSelection) { return `${symbol.toUpperCase()}:${timeframe}:${selection.range}:${selection.from ?? ""}:${selection.to ?? ""}`; }
/** Bounded per-workspace snapshots, in last-use order. The separately retained
 * verified panel snapshot remains available even after its request is evicted. */
export function retainTechnicalDatasets(current: Record<string, TechnicalChartResponse>, key: string, value: TechnicalChartResponse) {
  return Object.fromEntries([...Object.entries(current).filter(([saved]) => saved !== key), [key, value]].slice(-32));
}

/** Subscribers share one transport; removing the final subscriber cancels it.
 * Responses remain bound to symbol/interval/range/warmup, never arrival order. */
export async function requestTechnicalHistory(symbol: string, timeframe: TechnicalTimeframe, selection: TechnicalRangeSelection, signal: AbortSignal, warmup = 500, force = false): Promise<TechnicalChartResponse> {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (selection.range === "CUSTOM" && (!selection.from || !selection.to || selection.from > selection.to)) throw new Error("Select a valid From and To date before loading custom history.");
  const key = `${technicalRequestKey(symbol, timeframe, selection)}:${warmup}`;
  const saved = cache.get(key);
  if (!force && saved && saved.expires > Date.now()) return saved.value;
  let entry = pending.get(key);
  if (entry?.controller.signal.aborted) { pending.delete(key); entry = undefined; }
  if (!entry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("History request timed out. Previous verified chart retained.")), 35_000);
    const created: Pending = { controller, users: 0, promise: Promise.resolve(null as unknown as TechnicalChartResponse) };
    created.promise = (async () => {
      const query = new URLSearchParams({ symbol, timeframe, warmup: String(warmup), ...(selection.range === "CUSTOM" ? { from: selection.from!, to: selection.to! } : { range: selection.range }) });
      let failure: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(`/api/analysis/technical-chart?${query}`, { cache: "no-store", signal: controller.signal });
          const body = await response.json();
          if (!response.ok || !body.data) {
            const error = new Error(body.error?.message ?? "Technical history unavailable.");
            if (response.status < 500 && response.status !== 429) throw Object.assign(error, { noRetry: true });
            throw error;
          }
          if (body.data.symbol !== symbol.toUpperCase() || body.data.timeframe !== timeframe || !Array.isArray(body.data.bars) || !body.data.bars.length) throw Object.assign(new Error("History response does not match the selected asset and interval."), { noRetry: true });
          if (!validBars(body.data.bars) || (body.data.calculationBars !== undefined && !validBars(body.data.calculationBars))) throw Object.assign(new Error("Invalid verified history received. Previous verified chart retained."), { noRetry: true });
          if (body.data.requestedRange !== selection.range) throw Object.assign(new Error("History response does not match the selected historical range. Previous verified chart retained."), { noRetry: true });
          controller.signal.throwIfAborted();
          cache.set(key, { value: body, expires: Date.now() + 60_000 });
          if (cache.size > 16) cache.delete(cache.keys().next().value!);
          return body as TechnicalChartResponse;
        } catch (error) {
          if (controller.signal.aborted || (error as { noRetry?: boolean }).noRetry) throw error;
          failure = error;
          if (attempt === 0) await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
            const timer = setTimeout(() => { controller.signal.removeEventListener("abort", abort); resolve(); }, 300);
            controller.signal.addEventListener("abort", abort, { once: true });
          });
        }
      }
      throw failure;
    })().finally(() => { clearTimeout(timeout); if (pending.get(key) === created) pending.delete(key); });
    entry = created; pending.set(key, entry);
  }
  const shared = entry;
  shared.users++;
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = () => { if (finished) return false; finished = true; signal.removeEventListener("abort", abort); shared.users--; if (!shared.users && pending.get(key) === shared) shared.controller.abort(); return true; };
    const abort = () => { if (finish()) reject(new DOMException("Cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    shared.promise.then((value) => { if (finish()) resolve(value); }, (error) => { if (finish()) reject(error); });
  });
}
