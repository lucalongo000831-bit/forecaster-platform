type Transaction = Record<string, unknown>;

function number(record: Transaction, ...keys: string[]) {
  for (const key of keys) { const value = record[key]; if (typeof value === "number" && Number.isFinite(value)) return value; }
  return null;
}
function text(record: Transaction, ...keys: string[]) { for (const key of keys) if (typeof record[key] === "string") return String(record[key]).toUpperCase(); return null; }

export function analyzeInsiderActivity(transactions: Transaction[]) {
  let netShares = 0; let known = 0; let purchases = 0; let sales = 0;
  for (const item of transactions) {
    const change = number(item, "change"); const shares = number(item, "shares", "share"); const disposition = text(item, "acquiredDisposed"); const code = text(item, "transactionCode");
    const signed = change ?? (shares === null ? null : disposition === "D" || code === "S" ? -Math.abs(shares) : disposition === "A" || code === "P" ? Math.abs(shares) : null);
    if (signed === null) continue; known += 1; netShares += signed; if (signed > 0) purchases += 1; else if (signed < 0) sales += 1;
  }
  const score = known ? Math.max(0, Math.min(100, 50 + (purchases - sales) / known * 35)) : null;
  return { score, netShares: known ? netShares : null, purchases, sales, confidence: known >= 8 ? "HIGH" as const : known >= 3 ? "MEDIUM" as const : "LOW" as const };
}

export function analyzeDividends(events: Transaction[]) {
  const payments = events.flatMap((item) => { const date = text(item, "date"); const amount = number(item, "adjustedAmount", "amount"); return date && amount !== null && amount >= 0 ? [{ date, amount }] : []; }).sort((a, b) => a.date.localeCompare(b.date));
  if (!payments.length) return { payments: 0, trailingAmount: null, growthRate: null, regularity: null };
  const latestDate = new Date(payments.at(-1)!.date).getTime(); const trailing = payments.filter((item) => latestDate - new Date(item.date).getTime() < 365 * 86_400_000); const prior = payments.filter((item) => { const delta = latestDate - new Date(item.date).getTime(); return delta >= 365 * 86_400_000 && delta < 730 * 86_400_000; });
  const trailingAmount = trailing.reduce((sum, item) => sum + item.amount, 0); const priorAmount = prior.reduce((sum, item) => sum + item.amount, 0); const growthRate = priorAmount > 0 ? trailingAmount / priorAmount - 1 : null;
  const intervals = payments.slice(1).map((item, index) => (new Date(item.date).getTime() - new Date(payments[index]!.date).getTime()) / 86_400_000); const mean = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null; const dispersion = mean && intervals.length > 1 ? Math.sqrt(intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length) / mean : null;
  return { payments: payments.length, trailingAmount, growthRate, regularity: dispersion === null ? null : Math.max(0, Math.min(1, 1 - dispersion)) };
}
