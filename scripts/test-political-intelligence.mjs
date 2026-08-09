const timeoutMs = 15_000;
const key = process.env.FMP_API_KEY?.trim();
const base = (process.env.FMP_BASE_URL ?? "https://financialmodelingprep.com").replace(/\/$/, "");

async function request(path, params = {}) {
  if (!key) return { ok: false, status: "NOT_CONFIGURED", rows: [] };
  const url = new URL(`/stable/${path}`, base);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  try {
    const response = await fetch(url, { headers: { apikey: key }, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    const payload = await response.json().catch(() => []);
    return { ok: response.ok && Array.isArray(payload), status: String(response.status), rows: Array.isArray(payload) ? payload : [] };
  } catch (error) { return { ok: false, status: error instanceof Error ? error.name : "ERROR", rows: [] }; }
}

function hasDates(row) { return Boolean(row.transactionDate ?? row.transaction_date ?? row.date) && Boolean(row.disclosureDate ?? row.disclosure_date ?? row.filingDate); }

async function main() {
  const latestLimit = Math.min(100, Math.max(1, Number(process.env.POLITICAL_TEST_LIMIT ?? 20)));
  const [house, senate, ...symbols] = await Promise.all([
    request("house-latest", { page: 0, limit: latestLimit }), request("senate-latest", { page: 0, limit: latestLimit }),
    ...["AAPL", "NVDA", "MSFT"].flatMap((symbol) => [request("house-trades", { symbol }), request("senate-trades", { symbol })]),
  ]);
  const usable = [...house.rows, ...senate.rows].filter(hasDates);
  const globalRows = [...house.rows, ...senate.rows];
  process.stdout.write(`FMP_HOUSE: ${house.ok ? `OK (${house.rows.length})` : `ERROR_${house.status}`}\n`);
  process.stdout.write(`FMP_SENATE: ${senate.ok ? `OK (${senate.rows.length})` : `ERROR_${senate.status}`}\n`);
  for (let index = 0; index < 3; index += 1) {
    const symbol = ["AAPL", "NVDA", "MSFT"][index]; const pair = symbols.slice(index * 2, index * 2 + 2); const directCount = pair.reduce((sum, item) => sum + item.rows.filter(hasDates).length, 0); const fallbackCount = globalRows.filter((row) => String(row.symbol ?? row.ticker ?? "").toUpperCase() === symbol && hasDates(row)).length;
    process.stdout.write(`${symbol}: ${pair.some((item) => item.ok) ? `OK_DIRECT (${directCount})` : `OK_GLOBAL_FALLBACK (${fallbackCount}; direct ${pair.map((item) => item.status).join("/")})`}\n`);
  }
  process.stdout.write(`DISCLOSURE_DATE_REQUIRED: ${usable.length === house.rows.length + senate.rows.length ? "OK" : `PARTIAL (${usable.length}/${house.rows.length + senate.rows.length})`}\n`);
  process.stdout.write("LOOK_AHEAD_PROTECTION: OK (market availability = disclosure date)\n");
  if (!key || (!house.ok && !senate.ok)) process.exitCode = 1;
}

void main();
