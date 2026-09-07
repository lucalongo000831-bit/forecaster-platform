import { expect, test } from "@playwright/test";

const assets = ["NVDA", "AAPL", "MSFT", "STLAM.MI", "SPY", "QQQ", "BTC-USD", "ETH-USD"];

test.beforeEach(async ({ page }, testInfo) => {
  const seed = `${testInfo.project.name}:${testInfo.title}`
    .split("")
    .reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 0);
  const isolatedIp = `198.51.100.${(seed % 200) + 1}`;
  await page.route("**/api/analysis/technical-chart?**", async (route) => {
    await route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": isolatedIp } });
  });
});

test("technical chart API serves the deterministic cross-asset matrix", async ({ request }, testInfo) => {
  for (const [index, symbol] of assets.entries()) {
    const response = await request.get(`/api/analysis/technical-chart?symbol=${encodeURIComponent(symbol)}&timeframe=1D`, { headers: { "x-forwarded-for": `198.51.${100 + testInfo.project.name.length}.${index + 10}` } });
    expect(response.status(), symbol).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ data: { symbol, timeframe: "1D", modelVersion: "technical-v2.0.0", bars: expect.any(Array), pricePolicy: symbol.endsWith("-USD") ? "RAW_OHLC" : "ADJUSTED_OHLC" }, meta: { providerRequestId: "deterministic-e2e-provider" } });
    expect(body.data.bars.length).toBeGreaterThan(100);
    const weekdays = new Set(body.data.bars.slice(-45).map((bar: { timestamp: string }) => new Date(bar.timestamp).getUTCDay()));
    if (symbol.endsWith("-USD")) { expect(weekdays.has(0)).toBe(true); expect(weekdays.has(6)).toBe(true); }
    else { expect(weekdays.has(0)).toBe(false); expect(weekdays.has(6)).toBe(false); }
  }
});

test("technical workspace is responsive, persistent and indicator changes never refetch", async ({ page }) => {
  let technicalRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/analysis/technical-chart?")) technicalRequests += 1; });
  await page.goto("/instrument/nasdaqgs/nvda/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Technical chart", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add comparison", exact: true })).toBeVisible();
  const chart = page.getByTestId("technical-terminal-chart");
  await expect(chart).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  await expect(page.getByText("Corporate-action adjusted OHLC")).toBeVisible();
  await expect(page.getByLabel("Technical confluence summary").getByText("VOLATILITY", { exact: true })).toBeVisible();
  const initialRequests = technicalRequests;

  await page.getByLabel("Indicator type").selectOption("RSI");
  await page.getByLabel("Indicator period").fill("14");
  await page.getByRole("button", { name: "Add indicator" }).click();
  await expect(page.getByText("RSI 14", { exact: true })).toBeVisible();
  await page.getByLabel("EMA 20 period").fill("34");
  await expect(page.getByText("EMA 34", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await page.getByRole("button", { name: "EMA 34", exact: false }).first().click();
  await page.getByLabel("Indicator type").selectOption("SMA");
  await page.getByLabel("Indicator period").fill("0");
  await page.getByRole("button", { name: "Add indicator" }).click();
  await expect(page.locator(".technical-indicator-error")).toContainText("whole number from 2 to 250");
  await page.getByLabel("Indicator type").selectOption("VWAP");
  await page.getByRole("button", { name: "Add indicator" }).click();
  await expect(page.locator(".technical-indicator-error")).toContainText("only on verified intraday data");
  expect(technicalRequests).toBe(initialRequests);

  await chart.hover();
  await page.mouse.wheel(0, -250);
  const chartBox = await chart.boundingBox();
  if (chartBox) {
    await page.mouse.move(chartBox.x + chartBox.width * .7, chartBox.y + 210);
    await page.mouse.down();
    await page.mouse.move(chartBox.x + chartBox.width * .55, chartBox.y + 210);
    await page.mouse.up();
  }
  await page.getByRole("button", { name: "View", exact: true }).click();
  expect(technicalRequests).toBe(initialRequests);

  await page.getByLabel("Compare symbol").fill("SPY");
  await page.getByLabel("Compare symbol").press("Enter");
  await expect(page.getByRole("button", { name: "SPY ×" })).toBeVisible();
  await expect.poll(() => technicalRequests).toBe(initialRequests + 1);

  await page.getByRole("button", { name: "Level", exact: true }).click();
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  await chart.click({ position: { x: Math.max(60, (box?.width ?? 600) * .55), y: Math.min(250, Math.max(120, (box?.height ?? 500) * .3)) } });
  await expect(page.getByText(/^Level \d/)).toBeVisible();
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await expect(chart).toHaveAttribute("data-drawing-tool", "trend");
  await chart.click({ position: { x: 120, y: 180 } });
  await expect(page.getByText("Anchor 1/2 selected · choose next point")).toBeVisible();
  await page.waitForTimeout(600);
  await chart.click({ position: { x: Math.max(210, (box?.width ?? 600) * .78), y: 210 } });
  await expect(page.getByText(/^Trend line \d/)).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Line", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("RSI 14", { exact: true })).toBeVisible();
  await expect(page.getByText("EMA 34", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "SPY ×" })).toBeVisible();
  await expect(page.getByText(/^Level \d/)).toBeVisible();
  const afterReload = technicalRequests;
  await page.getByRole("button", { name: "Delete drawing 1" }).click();
  await page.getByRole("button", { name: "Clear timeframe" }).click();
  await expect(page.getByText("No drawings saved for 1D.")).toBeVisible();
  expect(technicalRequests).toBe(afterReload);
  const workspace = await page.getByTestId("technical-chart-workspace").boundingBox();
  expect(workspace?.width ?? 0).toBeLessThanOrEqual((page.viewportSize()?.width ?? 1440) + 1);
});

test("technical preferences reject corrupt state and reset only after confirmation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("kairo:technical-chart:v1:NVDA", "{not-json"));
  await page.goto("/instrument/nasdaqgs/nvda/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Candles", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Reset local workspace" }).click();
  await expect(page.getByRole("button", { name: "Confirm reset local workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm reset local workspace" }).click();
  await expect(page.getByText("EMA 20", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kairo:technical-chart:v1:NVDA"))).toBe("{not-json");
  expect(await page.evaluate(() => localStorage.getItem("kairo:technical:v3:NVDA"))).toContain('"version":3');
});

test("Technical V2 derives locally, persists advanced drawings and reuses multi-chart requests", async ({ page }) => {
  let technicalRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/analysis/technical-chart?")) technicalRequests += 1; });
  await page.goto("/instrument/nasdaqgs/nvda/technical", { waitUntil: "domcontentloaded" });
  const chart = page.getByTestId("technical-terminal-chart").first();
  await expect(chart).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  const baseline = technicalRequests;

  await page.getByRole("button", { name: "Heikin Ashi", exact: true }).click();
  await expect(page.getByText("HEIKIN ASHI · DERIVED")).toBeVisible();
  await page.getByText("Auto S/R", { exact: true }).click();
  await page.getByText("Volume Profile", { exact: true }).click();
  await expect(page.getByText("Estimated from bar OHLCV")).toBeVisible();
  expect(technicalRequests).toBe(baseline);

  await page.getByRole("button", { name: "Fibonacci retracement", exact: true }).click();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  await chart.click({ position: { x: 130, y: 170 } });
  await page.waitForTimeout(350);
  await chart.click({ position: { x: Math.max(240, (box?.width ?? 700) * .72), y: 250 } });
  await expect(page.getByText(/^Fibonacci retracement 1$/)).toBeVisible();
  await page.getByRole("button", { name: "Fibonacci extension", exact: true }).click();
  await chart.click({ position: { x: 110, y: 160 } });
  await page.waitForTimeout(250);
  await chart.click({ position: { x: 210, y: 230 } });
  await page.waitForTimeout(250);
  await chart.click({ position: { x: Math.max(260, (box?.width ?? 700) * .76), y: 190 } });
  await expect(page.getByText(/^Fibonacci extension 2$/)).toBeVisible();
  await page.getByRole("button", { name: "Anchored VWAP", exact: true }).click();
  await chart.click({ position: { x: 190, y: 210 } });
  await expect(page.getByText(/^Anchored VWAP 3$/)).toBeVisible();
  await page.getByRole("button", { name: "Horizontal ray", exact: true }).click();
  await chart.click({ position: { x: 175, y: 205 } });
  await expect(page.getByText(/^Horizontal ray 4$/)).toBeVisible();
  await page.getByRole("button", { name: "Rectangle / zone", exact: true }).click();
  await chart.click({ position: { x: 130, y: 170 } });
  await page.waitForTimeout(250);
  await chart.click({ position: { x: Math.max(250, (box?.width ?? 700) * .7), y: 260 } });
  await expect(page.getByText(/^Rectangle \/ zone 5$/)).toBeVisible();
  expect(technicalRequests).toBe(baseline);

  await page.getByRole("button", { name: "4 chart layout" }).click();
  await expect(page.getByTestId("technical-terminal-chart")).toHaveCount(4);
  await expect(page.getByTestId("technical-terminal-chart").nth(3)).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  expect(technicalRequests).toBeLessThanOrEqual(baseline + 3);
  await page.getByRole("button", { name: /Maximize NVDA panel/ }).first().click();
  await expect(page.getByTestId("technical-terminal-chart")).toHaveCount(1);
  await page.getByRole("button", { name: /Restore NVDA panel/ }).click();
  await expect(page.getByTestId("technical-terminal-chart")).toHaveCount(4);
  await page.getByRole("button", { name: "1 chart layout" }).click();
  await expect(page.getByTestId("technical-terminal-chart")).toHaveCount(1);
  await page.getByRole("button", { name: "2V chart layout" }).click();
  await expect(page.getByTestId("technical-terminal-chart")).toHaveCount(2);
  await page.getByRole("button", { name: "4 chart layout" }).click();
  await expect(page.getByTestId("technical-terminal-chart")).toHaveCount(4);

  await page.getByRole("button", { name: "Apply Swing template", exact: true }).click();
  await expect(page.getByText("Swing template applied.")).toBeVisible();
  await page.getByLabel("Template name").fill("Desk setup");
  await page.getByRole("button", { name: "Save custom template" }).click();
  await expect(page.getByText("Desk setup saved locally.")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Apply Desk setup template", exact: true })).toBeVisible();
  await expect(page.getByText(/^Fibonacci retracement 1$/)).toBeVisible();
  await expect(page.getByText(/^Fibonacci extension 2$/)).toBeVisible();
  await expect(page.getByText(/^Anchored VWAP 3$/)).toBeVisible();
  await expect(page.getByText(/^Horizontal ray 4$/)).toBeVisible();
  await expect(page.getByText(/^Rectangle \/ zone 5$/)).toBeVisible();
});

test("Technical V3 migrates valid V1 state and preserves legacy drawings", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("kairo:technical-chart:v1:NVDA", JSON.stringify({
    version: 1,
    chartType: "line",
    timeframe: "4h",
    indicators: [{ id: "rsi", kind: "RSI", period: 14, color: "#e05e72", enabled: true }],
    comparisons: [],
    drawings: { "4h": [{ id: "legacy", type: "horizontal", points: [{ timestamp: "2026-01-05T14:00:00.000Z", price: 120 }] }] },
  })));
  await page.goto("/instrument/nasdaqgs/nvda/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Line", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "4h", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("RSI 14", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Level 120\.00$/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kairo:technical-chart:v1:NVDA"))).toContain('"version":1');
  expect(await page.evaluate(() => localStorage.getItem("kairo:technical:v3:NVDA"))).toContain('"version":3');
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(/^Level 120\.00$/)).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kairo:technical:v3:NVDA") ?? "{}").drawings["NVDA:4h"])).toHaveLength(1);
});

test("Technical V3 overlays, profiles and structure template derive locally without provider refetch", async ({ page }) => {
  let technicalRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/analysis/technical-chart?")) technicalRequests += 1; });
  await page.goto("/instrument/nasdaqgs/nvda/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("technical-terminal-chart").first()).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  await expect(page.getByLabel("Multi-timeframe market structure matrix")).toBeVisible();
  await expect(page.getByLabel("Multi-timeframe market structure matrix").getByText("15m", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Multi-timeframe market structure matrix").getByText("1D", { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  const baseline = technicalRequests;

  await page.getByText("Market Structure", { exact: true }).click();
  await page.getByText("MTF S/R", { exact: true }).click();
  await page.getByText("Divergences", { exact: true }).click();
  await page.getByLabel("Market structure label density").selectOption("ALL");
  await page.getByRole("button", { name: "+ Fixed Range", exact: true }).click();
  await expect(page.getByRole("button", { name: "Toggle FIXED profile" })).toBeVisible();
  await page.getByRole("button", { name: "+ Anchored", exact: true }).click();
  await expect(page.getByRole("button", { name: "Toggle ANCHORED profile" })).toBeVisible();
  expect(technicalRequests).toBe(baseline);

  await page.getByRole("button", { name: "Apply Structure template", exact: true }).click();
  await expect(page.getByTestId("technical-terminal-chart")).toHaveCount(4);
  await expect(page.getByTestId("technical-terminal-chart").nth(3)).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  expect(technicalRequests).toBe(baseline);
});

test("Technical V3 migration is idempotent and preserves the original V2 key", async ({ page }) => {
  const v2 = { version: 2, layout: "single", activePanelId: "panel-1", panels: [{ id: "panel-1", symbol: "NVDA", timeframe: "1D", chartType: "line", indicators: [{ id: "volume", kind: "VOLUME", color: "#5267e8", enabled: true }], comparisons: [] }], links: { crosshair: true, symbol: false, timeframe: false }, features: { autoSupportResistance: true, volumeProfile: false, confluence: true }, drawings: { "NVDA:1D": [{ id: "v2-drawing", type: "horizontal", points: [{ timestamp: "2026-01-05T00:00:00.000Z", price: 120 }], visible: true, createdAt: "2026-01-05T00:00:00.000Z" }] }, customTemplates: [] };
  await page.addInitScript((source) => localStorage.setItem("kairo:technical:v2:NVDA", JSON.stringify(source)), v2);
  await page.goto("/instrument/nasdaqgs/nvda/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Line", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Level 120.00", { exact: true })).toHaveCount(1);
  const originalV2 = await page.evaluate(() => localStorage.getItem("kairo:technical:v2:NVDA"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Level 120.00", { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("kairo:technical:v2:NVDA"))).toBe(originalV2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kairo:technical:v3:NVDA") ?? "{}").drawings["NVDA:1D"])).toHaveLength(1);
});

test("Technical V3 uses honest crypto session semantics and typed server alert authentication", async ({ page }) => {
  let technicalRequests = 0;
  let alertRequest: Record<string, unknown> | null = null;
  page.on("request", (request) => { if (request.url().includes("/api/analysis/technical-chart?")) technicalRequests += 1; });
  await page.route("**/api/account/alerts", async (route) => {
    alertRequest = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "Authentication required" } }) });
  });
  await page.goto("/instrument/crypto/btc-usd/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("technical-terminal-chart").first()).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  await page.waitForTimeout(500);
  const baseline = technicalRequests;
  await page.getByText("Session Levels", { exact: true }).click();
  await expect(page.getByLabel("Session analytics")).toContainText("Crypto trades 24/7");
  await page.getByLabel("Technical alert condition").selectOption("TECH_BOS_CONFIRMED");
  await page.getByRole("button", { name: "Activate monitoring", exact: true }).click();
  await expect(page.getByLabel("Technical alert builder").getByRole("status")).toHaveText("Authentication required");
  expect(alertRequest).toMatchObject({ type: "TECH_BOS_CONFIRMED", symbol: "BTC-USD", timeframe: "1D", parameters: { direction: "EITHER" } });
  expect(technicalRequests).toBe(baseline);
});

test("technical endpoint rejects invalid symbols and timeframes", async ({ request }) => {
  const invalidSymbol = await request.get("/api/analysis/technical-chart?symbol=%3Cscript%3E&timeframe=1D");
  const invalidTimeframe = await request.get("/api/analysis/technical-chart?symbol=NVDA&timeframe=2h");
  expect(invalidSymbol.status()).toBe(400);
  expect(invalidTimeframe.status()).toBe(400);
});
