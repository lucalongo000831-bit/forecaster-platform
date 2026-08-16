import { expect, test } from "@playwright/test";

const mockedSearch = { data: [{ symbol: "KAIRO.MI", name: "Kairo Test Instrument", type: "Stock", venue: "Milan", price: 214.3, currency: "EUR", href: "/instrument/milan/kairo.mi/overview", source: "yahoo" }], meta: { source: "yahoo" } };
const chartPoint = (day: number, close: number) => ({ timestamp: `2026-08-${String(day).padStart(2, "0")}T20:00:00.000Z`, open: close - 1, high: close + 2, low: close - 2, close, volume: 10_000_000 });

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
  await page.goto("/instrument/nasdaqgs/nvda/seasonality", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Seasonality intelligence" })).toBeVisible({ timeout: 80_000 });
  for (const heading of ["Seasonality charts", "Correlation", "Trade stats", "Historical trade table", "Monthly matrix", "Daily", "Weekly", "Monthly"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Current year remains separate from every historical average/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Seasonality V2 chart with .* real-data series/ })).toBeVisible();
  await page.getByRole("button", { name: "Short", exact: true }).click();
  await expect(page.getByText(/SHORT · 20Y historical average/).first()).toBeVisible({ timeout: 60_000 });
  const matrix = page.getByRole("region", { name: "Monthly matrix" });
  await matrix.getByRole("button", { name: "5Y", exact: true }).click();
  await expect(matrix.getByText("Summary uses 5 completed years")).toBeVisible();
  await page.getByLabel("About Correlation").click();
  await expect(page.getByText(/Pearson correlation is calculated only over the observed current-year segment/)).toBeVisible();
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
    const warmup = await request.get(path);
    expect(warmup.ok()).toBeTruthy();
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
  const analysis = await request.get("/api/company/AAPL/analysis", { headers: { "x-forwarded-for": "198.51.100.200" }, timeout: 60_000 });
  expect([200, 404, 429, 502, 503, 504]).toContain(analysis.status());
  const payload = await analysis.json();

  if (!analysis.ok()) {
    expect(payload).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } });
    return;
  }

  expect(payload).toMatchObject({ data: { symbol: "AAPL", applicable: true, modelVersion: expect.any(String), reportVersion: expect.any(String) } });
  await page.goto("/instrument/nasdaq/aapl/analysis", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByText("Company Intelligence").first()).toBeVisible();
  await expect(page.getByText("Downside prima dell’upside")).toBeVisible();
  await expect(page.getByText("Multipli, reverse DCF e DCF")).toBeVisible();
  await expect(page.getByText("Rischi, red flag e tesi short")).toBeVisible();
  await expect(page.getByText("Fonti, metodologia e limiti")).toBeVisible();

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
