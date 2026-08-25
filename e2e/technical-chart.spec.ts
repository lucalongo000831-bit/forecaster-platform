import { expect, test } from "@playwright/test";

const assets = ["NVDA", "AAPL", "MSFT", "STLAM.MI", "SPY", "QQQ", "BTC-USD", "ETH-USD"];

test("technical chart API serves the deterministic cross-asset matrix", async ({ request }, testInfo) => {
  for (const [index, symbol] of assets.entries()) {
    const response = await request.get(`/api/analysis/technical-chart?symbol=${encodeURIComponent(symbol)}&timeframe=1D`, { headers: { "x-forwarded-for": `198.51.${100 + testInfo.project.name.length}.${index + 10}` } });
    expect(response.status(), symbol).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ data: { symbol, timeframe: "1D", modelVersion: "technical-v1.0.0", bars: expect.any(Array), pricePolicy: symbol.endsWith("-USD") ? "RAW_OHLC" : "ADJUSTED_OHLC" }, meta: { providerRequestId: "deterministic-e2e-provider" } });
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
  const chart = page.getByTestId("technical-terminal-chart");
  await expect(chart).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  await expect(page.getByText("Corporate-action adjusted OHLC")).toBeVisible();
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
  await expect(page.getByText("Start selected · choose the end point")).toBeVisible();
  await page.waitForTimeout(600);
  await chart.click({ position: { x: Math.max(210, (box?.width ?? 600) * .78), y: 210 } });
  await expect(page.getByText(/^Trend \d/)).toBeVisible();

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
  expect(await page.evaluate(() => localStorage.getItem("kairo:technical-chart:v1:NVDA"))).not.toBe("{not-json");
});

test("technical endpoint rejects invalid symbols and timeframes", async ({ request }) => {
  const invalidSymbol = await request.get("/api/analysis/technical-chart?symbol=%3Cscript%3E&timeframe=1D");
  const invalidTimeframe = await request.get("/api/analysis/technical-chart?symbol=NVDA&timeframe=2h");
  expect(invalidSymbol.status()).toBe(400);
  expect(invalidTimeframe.status()).toBe(400);
});
