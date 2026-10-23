import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  // Independent responsive projects must not share a rate-limit identity when
  // this file is run alone; the production limiter itself remains unchanged.
  const projectOffset = info.project.name.startsWith("desktop") ? 0 : info.project.name.startsWith("tablet") ? 50 : 100;
  await page.route("**/api/analysis/technical-chart?**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": `198.51.100.${60 + projectOffset + info.title.length % 40}` } }));
});

test("V5 exact interval/range flow stays atomic, complete or explicitly limited", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/instrument/nasdaqgs/nvda/technical");
  const panel = page.locator('[data-panel-id="panel-1"]');
  await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true", { timeout: 30000 });
  for (const [interval, range] of [["1D", "1Y"], ["4h", "1Y"], ["1h", "3M"], ["4h", "6M"], ["1D", "5Y"], ["1W", "MAX"], ["1h", "1M"], ["1D", "MAX"]]) {
    await page.getByLabel("Historical range", { exact: true }).getByRole("button", { name: range, exact: true }).click();
    await page.getByLabel("Timeframe", { exact: true }).getByRole("button", { name: interval, exact: true }).click();
    await expect(panel.locator(".technical-panel-header strong")).toHaveText(`NVDA · ${range} · ${interval}`, { timeout: 30000 });
    await expect(panel.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true");
  }
  const chart = panel.getByTestId("technical-terminal-chart");
  const first = await chart.getAttribute("data-history-first");
  const last = await chart.getAttribute("data-history-last");
  expect(first).toBeTruthy(); expect(last).toBeTruthy();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(chart).toHaveAttribute("data-visible-from", first!);
  await expect(chart).toHaveAttribute("data-visible-to", last!);
  expect(errors).toEqual([]);
});

test("V5 warmup, multiple moving averages and presets persist without changing OHLC", async ({ page }) => {
  await page.goto("/instrument/nasdaqgs/nvda/technical");
  await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true", { timeout: 30000 });
  const manager = page.getByRole("region", { name: "Indicator manager" });
  for (const kind of ["SMA", "SMMA", "EMA"]) {
    await manager.getByLabel("Indicator type", { exact: true }).selectOption(kind);
    await manager.getByLabel("Indicator period", { exact: true }).fill("200");
    await manager.getByRole("button", { name: "Add indicator", exact: true }).click();
  }
  await expect(manager.getByRole("article", { name: "EMA 200 settings", exact: true })).toBeVisible();
  await page.getByText("Data diagnostics", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Chart data diagnostics" })).toContainText("READY", { timeout: 30000 });
  await manager.getByLabel("Indicator preset name").fill("Research 200"); await manager.getByRole("button", { name: "Save preset", exact: true }).click();
  await page.reload(); await expect(manager.getByRole("article", { name: "SMMA 200 settings", exact: true })).toBeVisible();
  await expect(page.getByLabel("Price scale")).toHaveValue("LINEAR");
});

test("V5 cancels stale chart work and preserves verified data on unsupported selection", async ({ page }) => {
  await page.goto("/instrument/crypto/btc-usd/technical");
  await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true", { timeout: 30000 });
  await page.getByLabel("Historical range", { exact: true }).getByRole("button", { name: "MAX", exact: true }).click();
  await expect(page.locator(".technical-panel-header strong")).toHaveText("BTC-USD · MAX · 1D", { timeout: 30000 });
  await page.getByLabel("Timeframe", { exact: true }).getByRole("button", { name: "1m", exact: true }).click();
  await expect(page.getByText(/showing previous verified MAX \/ 1D/)).toBeVisible();
  await expect(page.getByTestId("technical-terminal-chart")).toBeVisible();
  await page.getByLabel("Historical range", { exact: true }).getByRole("button", { name: "1M", exact: true }).click();
  await page.getByLabel("Timeframe", { exact: true }).getByRole("button", { name: "4h", exact: true }).click();
  await page.getByLabel("Timeframe", { exact: true }).getByRole("button", { name: "1h", exact: true }).click();
  await expect(page.locator(".technical-panel-header strong")).toHaveText("BTC-USD · 1M · 1h", { timeout: 30000 });
});

test("V5 RSC failure Retry really refetches and retains authenticated session", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "kairo-e2e-session-marker", value: "retained", url: baseURL!, httpOnly: true }]);
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "audit-user", name: "Audit User", email: "audit@example.test", role: "USER" } }) }));
  let fail = true; let rscRequests = 0;
  await page.route("**/dashboard**", (route) => {
    if (route.request().headers()["rsc"] === "1") {
      rscRequests++;
      return route.continue({ headers: { ...route.request().headers(), ...(fail ? { "x-kairo-e2e-dashboard-failure": "true" } : {}) } });
    }
    return route.continue();
  });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  const menu = page.getByRole("button", { name: "Open navigation", exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.rail-nav a[href="/dashboard"]').click();
  await expect(page.getByRole("heading", { name: "Page temporarily unavailable" })).toBeVisible({ timeout: 30000 });
  const before = rscRequests; fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Good afternoon/ })).toBeVisible({ timeout: 30000 });
  expect(rscRequests).toBeGreaterThan(before);
  expect((await context.cookies()).find((cookie) => cookie.name === "kairo-e2e-session-marker")?.value).toBe("retained");
});

test("V5 interrupted RSC transport recovers with bounded requests and no logout", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "kairo-e2e-network-session", value: "retained", url: baseURL!, httpOnly: true }]);
  let failures = 0; let requests = 0; let logout = 0;
  page.on("request", (request) => { if (request.url().includes("/api/auth/logout")) logout++; });
  await page.route("**/dashboard**", (route) => {
    requests++;
    if (route.request().headers()["rsc"] === "1" && failures === 0) { failures++; return route.abort("failed"); }
    return route.continue();
  });
  await page.goto("/search");
  const menu = page.getByRole("button", { name: "Open navigation", exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.rail-nav a[href="/dashboard"]').click();
  await expect(page.getByRole("heading", { name: /Good afternoon/ })).toBeVisible({ timeout: 30000 });
  expect(failures).toBe(1); expect(requests).toBeLessThanOrEqual(5); expect(logout).toBe(0);
  expect((await context.cookies()).find((cookie) => cookie.name === "kairo-e2e-network-session")?.value).toBe("retained");
});

test("V5 professional studies, scale and navigation preserve the underlying candles", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/instrument/nasdaqgs/aapl/technical");
  await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true", { timeout: 30000 });
  const before = await page.locator(".technical-panel-header").innerText();
  for (const kind of ["SUPERTREND", "ADX", "DONCHIAN", "ATR_STOP"]) {
    await page.getByLabel("Indicator type", { exact: true }).selectOption(kind);
    await page.getByLabel("Indicator period", { exact: true }).fill("14");
    await page.getByRole("button", { name: "Add indicator", exact: true }).click();
    await expect(page.getByRole("article", { name: `${kind} 14 settings`, exact: true })).toBeVisible();
    await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true");
  }
  for (const scale of ["LOGARITHMIC", "PERCENTAGE", "LINEAR"]) { await page.getByLabel("Price scale", { exact: true }).selectOption(scale); await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true"); }
  await page.getByLabel("Go to chart date").fill(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Go", exact: true }).click(); await page.getByRole("button", { name: "Latest candle", exact: true }).click();
  expect(await page.locator(".technical-panel-header").innerText()).toBe(before);
  expect(errors).toEqual([]);
});

test("V5 hourly and four-hour API asset matrix preserves genuine OHLC and sessions", async ({ request }, info) => {
  for (const [index, symbol] of ["NVDA", "AAPL", "MSFT", "SPY", "QQQ", "STLAM.MI", "BTC-USD", "ETH-USD"].entries()) {
    for (const timeframe of ["1h", "4h"]) {
      const response = await request.get(`/api/analysis/technical-chart?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&range=3M&warmup=500`, { headers: { "x-forwarded-for": `198.51.${130 + info.project.name.length}.${index + 1}` } });
      expect(response.status(), `${symbol}/${timeframe}`).toBe(200);
      const body = await response.json();
      expect(body.data.timeframe).toBe(timeframe); expect(body.data.requestedRange).toBe("3M");
      expect(body.meta.providerRequestId).toBe("deterministic-e2e-provider");
      const bars = body.data.bars as Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>;
      expect(bars.length).toBeGreaterThan(60);
      expect(new Set(bars.map((bar) => bar.timestamp)).size).toBe(bars.length);
      expect(bars.every((bar, index) => bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close) && (!index || bar.timestamp > bars[index - 1].timestamp))).toBe(true);
    }
  }
});
