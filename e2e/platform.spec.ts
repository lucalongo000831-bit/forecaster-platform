import { expect, test, type Page } from "@playwright/test";
import { SEASONALITY_HISTORICAL_WINDOWS, analyzeSeasonality, type SeasonalityAnalysis, type SeasonalityAssetClass } from "../src/engines/seasonality";
import type { MarketChartPoint } from "../src/types";

const mockedSearch = { data: [{ symbol: "KAIRO.MI", name: "Kairo Test Instrument", type: "Stock", venue: "Milan", price: 214.3, currency: "EUR", href: "/instrument/milan/kairo.mi/overview", source: "yahoo" }], meta: { source: "yahoo" } };
const chartPoint = (day: number, close: number) => ({ timestamp: `2026-08-${String(day).padStart(2, "0")}T20:00:00.000Z`, open: close - 1, high: close + 2, low: close - 2, close, volume: 10_000_000 });
const SEASONALITY_AUDIT_NOW = new Date("2026-08-20T12:00:00.000Z");
const seasonalityAuditCache = new Map<string, SeasonalityAnalysis>();

function seasonalityAuditHistory(assetClass: SeasonalityAssetClass): MarketChartPoint[] {
  const rows: MarketChartPoint[] = [];
  const fromYear = assetClass === "CRYPTO" ? 2018 : 1990;
  let price = assetClass === "CRYPTO" ? 8_000 : 40;
  for (let date = new Date(Date.UTC(fromYear, 0, 1)); date <= SEASONALITY_AUDIT_NOW; date = new Date(date.getTime() + 86_400_000)) {
    if (assetClass !== "CRYPTO" && [0, 6].includes(date.getUTCDay())) continue;
    const open = price;
    price *= 1 + Math.sin((date.getUTCDate() + date.getUTCMonth()) / 5) * 0.001 + 0.00025;
    rows.push({ timestamp: date.toISOString(), open, high: Math.max(open, price) * 1.003, low: Math.min(open, price) * 0.997, close: price, adjustedClose: price, volume: 1_000_000 });
  }
  return rows;
}

function seasonalityAuditAnalysis(symbol: string) {
  const normalized = symbol.toUpperCase();
  const cached = seasonalityAuditCache.get(normalized);
  if (cached) return cached;
  const assetClass: SeasonalityAssetClass = normalized.endsWith("-USD") ? "CRYPTO" : normalized === "SPY" ? "ETF" : "EQUITY";
  const analysis = analyzeSeasonality(normalized, seasonalityAuditHistory(assetClass), {
    assetClass,
    windows: [...SEASONALITY_HISTORICAL_WINDOWS],
    now: SEASONALITY_AUDIT_NOW,
    rangeStart: "01-01",
    rangeEnd: "12-31",
    side: "LONG",
    includeCycles: true,
    includeCorrelations: true,
    includeTradeStats: true,
    includeTable: true,
  }, "e2e-audit", "generated-fixture");
  seasonalityAuditCache.set(normalized, analysis);
  return analysis;
}

async function mockSeasonalityAnalysis(page: Page) {
  await page.route("**/api/analysis/seasonality?**", async (route) => {
    const symbol = new URL(route.request().url()).searchParams.get("symbol") ?? "NVDA";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: seasonalityAuditAnalysis(symbol), meta: { source: "e2e-audit" } }) });
  });
}

test("dashboard, navigation and legal disclosure render", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Good afternoon/i })).toBeVisible();
  const navigationToggle = page.getByRole("button", { name: /Open navigation|Toggle navigation/ }).first();
  const viewportWidth = page.viewportSize()?.width ?? 1280;
  if (viewportWidth < 700 && await navigationToggle.isVisible()) await navigationToggle.click();
  if (viewportWidth >= 1200 || viewportWidth < 700) await expect(page.getByRole("link", { name: "Watchlists", exact: true })).toBeVisible();
  else await expect(page.locator('a[href="/watchlists"]').first()).toBeAttached();
  await page.goto("/legal/disclaimer");
  await expect(page.getByRole("heading", { name: /Financial disclaimer/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not financial advice", exact: true })).toBeVisible();
});

test("real search interaction returns encoded instrument navigation", async ({ page }) => {
  await page.route("**/api/market/search?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockedSearch) }));
  await page.goto("/search");
  const response = page.waitForResponse((candidate) => candidate.url().includes("/api/market/search?q=KAIRO"));
  await page.getByPlaceholder("Search company, symbol or theme").fill("KAIRO");
  await response;
  const result = page.getByRole("row", { name: /KAIRO\.MI Kairo Test Instrument/i });
  await expect(result.getByRole("link", { name: "Open", exact: true })).toHaveAttribute("href", "/instrument/milan/kairo.mi/overview");
});

test("instrument workspace changes chart period and exposes research tabs", async ({ page }) => {
  await page.route("**/api/market/chart?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { symbol: "AAPL", currency: "USD", exchange: "NASDAQ", range: "1M", interval: "1d", previousClose: 210, isDelayed: true, asOf: "2026-08-06T20:00:00.000Z", points: [chartPoint(4, 211), chartPoint(5, 213), chartPoint(6, 214)] }, meta: { source: "yahoo" } }) }));
  await page.goto("/instrument/nasdaq/aapl/chart");
  await expect(page.getByText(/Interactive Price Chart/i)).toBeVisible();
  await page.getByRole("button", { name: "1M", exact: true }).click();
  await expect(page.locator("main").getByText(/OHLCV history/i)).toContainText(/Yahoo Finance|delayed/i);
  for (const path of ["signal", "fundamentals/analysis", "seasonality", "targets", "forecast", "news"]) await expect(page.locator(`a[href$="/${path}"]`).first()).toBeAttached();
});

test("seasonality v2 renders and recalculates across responsive projects", async ({ page }) => {
  await mockSeasonalityAnalysis(page);
  await page.goto("/instrument/nasdaqgs/nvda/seasonality", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Seasonality intelligence" })).toBeVisible({ timeout: 80_000 });
  for (const heading of ["Seasonality charts", "Correlation", "Trade stats", "Historical trade table", "Monthly matrix", "Daily Average", "Weekly Average", "Monthly Average"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Current year remains separate from every historical average/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Seasonality V2 chart with .* real-data series/ })).toBeVisible();
  const matrix = page.getByRole("region", { name: "Monthly matrix" });
  await matrix.getByRole("button", { name: "5Y", exact: true }).click();
  await expect(matrix.getByText("Summary uses 5 completed years")).toBeVisible();
  await page.getByLabel("About Correlation").click();
  await expect(page.getByText(/Pearson correlation is calculated only over the observed current-year segment/)).toBeVisible();

  const daily = page.getByRole("region", { name: "Daily Average" });
  const weekly = page.getByRole("region", { name: "Weekly Average" });
  const monthly = page.getByRole("region", { name: "Monthly Average" });
  await daily.getByRole("button", { name: "Configure average series" }).click();
  const selector = page.getByRole("dialog", { name: "Configure average series" });
  await selector.getByRole("switch", { name: "10 years", exact: true }).click();
  await expect(daily.getByLabel("Daily Average visible series legend")).not.toContainText("10Y historical average");
  await expect(weekly.getByLabel("Weekly Average visible series legend")).not.toContainText("10Y historical average");
  await expect(monthly.getByLabel("Monthly Average visible series legend")).not.toContainText("10Y historical average");
  await page.keyboard.press("Escape");
  await weekly.getByRole("button", { name: "Configure average series" }).click();
  await expect(page.getByRole("switch", { name: "10 years", exact: true })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch", { name: "10 years", exact: true }).click();
  await expect(weekly.getByLabel("Weekly Average visible series legend")).toContainText("10Y historical average");
});

test("seasonality average selector respects ETF and crypto availability", async ({ page }) => {
  await mockSeasonalityAnalysis(page);
  const route = async (path: string, heading: "Daily Average" | "Weekly Average") => {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 80_000 });
    await page.getByRole("region", { name: heading, exact: true }).getByRole("button", { name: "Configure average series" }).click();
    await expect(page.getByRole("dialog", { name: "Configure average series" })).toBeVisible();
  };

  await route("/instrument/nasdaqgs/nvda/seasonality", "Daily Average");
  await page.getByRole("button", { name: "Show all available" }).click();
  await expect(page.getByRole("switch", { name: "25 years", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  for (const path of ["/instrument/nasdaq/aapl/seasonality", "/instrument/us/spy/seasonality"]) {
    await route(path, "Daily Average");
    await expect(page.getByRole("switch", { name: "25 years", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
  }

  for (const path of ["/instrument/crypto/btc-usd/seasonality", "/instrument/crypto/eth-usd/seasonality"]) {
    await route(path, "Weekly Average");
    await expect(page.getByRole("switch", { name: "25 years", exact: true })).toBeDisabled();
    await expect(page.getByRole("region", { name: "Weekly Average" })).toContainText("Sat");
    await expect(page.getByRole("region", { name: "Weekly Average" })).toContainText("Sun");
    await page.keyboard.press("Escape");
  }

  await route("/instrument/nasdaqgs/nvda/seasonality", "Daily Average");
  await expect(page.getByRole("switch", { name: "25 years", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("private pages expose controlled unauthenticated or empty states", async ({ page, request }) => {
  const accountResponse = await request.get("/api/account/watchlists");
  expect([401, 503]).toContain(accountResponse.status());
  const pages = [
    ["/watchlists", /Your watchlists/i, /Workspace unavailable|Create your first private watchlist/i],
    ["/portfolio", /Your portfolio/i, /Private workspace unavailable|Create a portfolio to start/i],
    ["/alerts", /Alerts & notifications/i, /Alert workspace unavailable|No alert rules configured/i],
    ["/settings", /Make Kairo yours/i, /No active session|Sessione non disponibile/i],
  ] as const;
  for (const [path, heading, state] of pages) {
    await expect.poll(async () => {
      try {
        const warmup = await request.get(path, { timeout: 60_000 });
        return warmup.ok();
      } catch {
        return false;
      }
    }, { timeout: 120_000 }).toBe(true);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText(state).first()).toBeVisible();
  }
});

test("calendar, backtest and invalid ticker produce controlled UI/API states", async ({ page, request }) => {
  await page.goto("/calendar"); await expect(page.getByRole("heading", { name: /Market calendar/i })).toBeVisible();
  await page.goto("/backtest"); await expect(page.getByRole("heading", { name: /Backtest, without hindsight/i })).toBeVisible();
  const invalid = await request.get("/api/market/quote?symbol=%20%3Cscript%3E"); expect(invalid.status()).toBe(400);
});

test("global symbol matrix never exposes an unhandled server crash", async ({ request }) => {
  const symbols = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "^GSPC", "^IXIC", "BTC-USD", "ETH-USD", "ENI.MI", "STLAM.MI"];
  for (const symbol of symbols) {
    const response = await request.get(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`);
    expect([200, 404, 429, 502, 503, 504]).toContain(response.status());
    const body = await response.json(); expect(body).toMatchObject(response.ok() ? { data: expect.any(Object) } : { error: expect.any(Object) });
  }
});

test("company intelligence renders a complete cached flow or a controlled provider state", async ({ page, request }) => {
  const reactErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && /react|hydration|same key|unique key/i.test(message.text())) reactErrors.push(message.text()); });
  page.on("pageerror", (error) => reactErrors.push(error.message));
  const analysis = await request.get("/api/company/AAPL/analysis", { headers: { "x-forwarded-for": "198.51.100.200" }, timeout: 60_000 });
  expect([200, 404, 429, 502, 503, 504]).toContain(analysis.status());
  const payload = await analysis.json();

  if (!analysis.ok()) {
    expect(payload).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } });
    return;
  }

  expect(payload).toMatchObject({ data: { symbol: "AAPL", applicable: true, modelVersion: expect.any(String), reportVersion: expect.any(String) } });
  await page.goto("/instrument/nasdaq/aapl/analysis", { waitUntil: "domcontentloaded", timeout: 60_000 });
  const companyIntelligence = page.getByText("Company Intelligence").first();
  const controlledProviderState = page.getByRole("heading", { name: "Market data temporarily unavailable" });
  await expect(companyIntelligence.or(controlledProviderState)).toBeVisible({ timeout: 30_000 });
  if (await controlledProviderState.isVisible()) {
    await expect(page.getByText("The provider did not respond and no safe fallback could be loaded.")).toBeVisible();
    expect(reactErrors).toEqual([]);
    return;
  }
  await expect(page.getByText("Downside prima dell’upside")).toBeVisible();
  await expect(page.getByText("Multipli, reverse DCF e DCF")).toBeVisible();
  await expect(page.getByText("Rischi, red flag e tesi short")).toBeVisible();
  await expect(page.getByText("Fonti, metodologia e limiti")).toBeVisible();
  expect(reactErrors).toEqual([]);

  const pdf = await request.get("/api/company/AAPL/report?format=pdf", { headers: { "x-forwarded-for": "198.51.100.201" }, timeout: 60_000 });
  expect([200, 401, 429, 502, 503, 504]).toContain(pdf.status());
  if (pdf.ok()) {
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 8).toString()).toContain("%PDF-1.4");
  } else {
    expect(await pdf.json()).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } });
  }
});

test("non-company instruments never receive fabricated corporate analysis", async ({ request }) => {
  for (const symbol of ["SPY", "^GSPC", "BTC-USD"]) {
    const response = await request.get(`/api/company/${encodeURIComponent(symbol)}/analysis`, { headers: { "x-forwarded-for": `198.51.100.${210 + symbol.length}` }, timeout: 60_000 });
    expect([200, 404, 429, 502, 503, 504]).toContain(response.status());
    const payload = await response.json();
    if (response.ok()) expect(payload).toMatchObject({ data: { applicable: false, verdict: "INSUFFICIENT_DATA" } });
    else expect(payload).toMatchObject({ error: { code: expect.any(String) } });
  }
});
