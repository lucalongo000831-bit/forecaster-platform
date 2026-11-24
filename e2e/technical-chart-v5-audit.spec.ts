import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  const project = info.project.name.startsWith("desktop") ? 0 : info.project.name.startsWith("tablet") ? 1 : 2;
  await page.setViewportSize(project === 0 ? { width: 1440, height: 900 } : project === 1 ? { width: 768, height: 1024 } : { width: 390, height: 844 });
  await page.route("**/api/analysis/technical-chart?**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": `198.19.${project + 1}.${20 + info.title.length % 180}` } }));
});
test.afterEach(async ({ request }) => {
  const response = await request.get("/api/testing/provider-audit"); expect(response.status()).toBe(200);
  const { data } = await response.json();
  expect(data).toMatchObject({ enabled: true, installed: true, blockedAttempts: 0, hosts: {} });
});
const chart = (page: Page) => page.getByTestId("technical-terminal-chart");
async function choose(page: Page, interval: string, range: string) {
  await page.getByLabel("Historical range", { exact: true }).getByRole("button", { name: range, exact: true }).click();
  await page.getByLabel("Timeframe", { exact: true }).getByRole("button", { name: interval, exact: true }).click();
  await expect(page.locator('[data-panel-id="panel-1"] .technical-panel-header strong')).toHaveText(`NVDA · ${range} · ${interval}`, { timeout: 30000 });
  await expect(chart(page)).toHaveAttribute("data-chart-ready", "true");
}
for (const range of ["1Y", "5Y", "10Y", "MAX"]) test(`independent Fit All domain, zoom, stable chart and indicator edits / ${range}`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/instrument/nasdaqgs/nvda/technical");
  await expect(chart(page)).toHaveAttribute("data-chart-ready", "true", { timeout: 30000 });
  await choose(page, "1D", range);
  const plot = page.locator(".technical-chart-canvas");
  const originalChart = await plot.locator(".tv-lightweight-charts").elementHandle();
  expect(originalChart).not.toBeNull();
  const domain = () => plot.evaluate((element) => ({ from: Number(element.getAttribute("data-visible-logical-from")), to: Number(element.getAttribute("data-visible-logical-to")), ready: element.hasAttribute("data-visible-logical-from") }));
  const count = Number((await chart(page).getAttribute("aria-label"))!.match(/(\d+) verified OHLCV/)![1]);
  // Logical-domain arithmetic scales with bar count. Eight double-precision
  // ULPs is < 1e-10 of a candle here, not a pixel/bar clipping allowance.
  const epsilon = 8 * Number.EPSILON * Math.max(1, count);
  await page.getByLabel("Go to chart date").fill("2026-09-01"); await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect.poll(async () => (await domain()).to - (await domain()).from).toBeLessThan(count - 1);
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect.poll(async () => (await domain()).ready).toBe(true);
  await expect.poll(async () => (await domain()).from).toBeLessThanOrEqual(epsilon);
  await expect.poll(async () => (await domain()).to).toBeGreaterThanOrEqual(count - 1 - epsilon);
  await page.getByLabel("Indicator type", { exact: true }).selectOption("EMA");
  const originalEmaCount = await page.getByRole("article", { name: "EMA 20 settings", exact: true }).count();
  await page.getByLabel("Indicator period", { exact: true }).fill("20"); await page.getByRole("button", { name: "Add indicator", exact: true }).click();
  await expect(page.getByRole("article", { name: "EMA 20 settings", exact: true })).toHaveCount(originalEmaCount + 1);
  await expect(page.getByRole("article", { name: "EMA 20 settings", exact: true }).last()).toBeVisible();
  await expect(chart(page)).toHaveAttribute("data-chart-ready", "true");
  expect(await plot.locator(".tv-lightweight-charts").evaluate((el, original) => el === original, originalChart)).toBe(true);
  await expect.poll(async () => (await domain()).from).toBeLessThanOrEqual(epsilon);
  await expect.poll(async () => (await domain()).to).toBeGreaterThanOrEqual(count - 1 - epsilon);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("independent exact slow and pending-switch sequence: latest selection wins", async ({ page }) => {
  await page.goto("/instrument/nasdaqgs/nvda/technical"); await expect(chart(page)).toHaveAttribute("data-chart-ready", "true", { timeout: 30000 });
  const sequence = [["1D", "1Y"], ["1h", "3M"], ["4h", "6M"], ["1D", "5Y"], ["1W", "MAX"], ["1h", "1M"], ["4h", "1Y"], ["1D", "MAX"]];
  for (const [interval, range] of sequence) await choose(page, interval, range);
  await page.route("**/api/analysis/technical-chart?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!route.request().isNavigationRequest()) await route.fallback();
  });
  for (const [interval, range] of sequence.slice(1)) {
    await page.getByLabel("Historical range", { exact: true }).getByRole("button", { name: range, exact: true }).click();
    await page.getByLabel("Timeframe", { exact: true }).getByRole("button", { name: interval, exact: true }).click();
  }
  await expect(page.locator('[data-panel-id="panel-1"] .technical-panel-header strong')).toHaveText("NVDA · MAX · 1D", { timeout: 30000 });
  await expect(chart(page)).toHaveAttribute("data-chart-ready", "true");
  await expect(page.getByText(/showing previous verified/)).toHaveCount(0);
});

for (const failure of ["500", "429", "invalid", "empty", "disconnect"] as const) test(`isolates ${failure} history failure and retains the verified chart`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/instrument/nasdaqgs/nvda/technical"); await expect(chart(page)).toHaveAttribute("data-chart-ready", "true", { timeout: 30000 });
  const before = await chart(page).getAttribute("data-history-first"); let calls = 0;
  await page.route("**/api/analysis/technical-chart?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("range") !== "5Y" || query.get("symbol") !== "NVDA") return route.fallback();
    calls++;
    if (failure === "disconnect") return route.abort("failed");
    if (failure === "500" || failure === "429") return route.fulfill({ status: Number(failure), json: { error: { message: "Controlled audit provider failure" } } });
    return route.fulfill({ json: { data: { symbol: "NVDA", timeframe: "1D", bars: failure === "empty" ? [] : [{ timestamp: "invalid", open: 10, high: 2, low: 1, close: 3, volume: -1 }] } } });
  });
  await page.getByLabel("Historical range", { exact: true }).getByRole("button", { name: "5Y", exact: true }).click();
  await expect(page.getByText(/showing previous verified 1Y \/ 1D/)).toBeVisible();
  await expect(page.getByText("Latest 5Y request failed. Last verified snapshot remains visible.")).toBeVisible({ timeout: 10000 });
  await expect(chart(page)).toHaveAttribute("data-history-first", before!);
  expect(calls).toBe(failure === "invalid" || failure === "empty" ? 1 : 2);
  expect(errors).toEqual([]);
});

test("independent NVDA daily and BTC four-hour panes retain their own studies and range", async ({ page }) => {
  await page.goto("/instrument/nasdaqgs/nvda/technical"); await expect(chart(page)).toHaveAttribute("data-chart-ready", "true", { timeout: 30000 });
  await choose(page, "1D", "5Y");
  await page.getByLabel("Indicator type", { exact: true }).selectOption("EMA"); await page.getByLabel("Indicator period", { exact: true }).fill("200"); await page.getByRole("button", { name: "Add indicator", exact: true }).click();
  await page.getByRole("button", { name: "2V chart layout", exact: true }).click();
  const a = page.locator('[data-panel-id="panel-1"]'), b = page.locator('[data-panel-id="panel-2"]');
  await b.locator(".technical-panel-header").click();
  await page.getByLabel("Panel symbol", { exact: true }).fill("BTC-USD");
  await page.getByLabel("Timeframe", { exact: true }).getByRole("button", { name: "4h", exact: true }).click();
  await page.getByLabel("Historical range", { exact: true }).getByRole("button", { name: "3M", exact: true }).click();
  await expect(b.locator(".technical-panel-header strong")).toHaveText("BTC-USD · 3M · 4h", { timeout: 30000 });
  await page.getByLabel("Indicator type", { exact: true }).selectOption("SMMA"); await page.getByLabel("Indicator period", { exact: true }).fill("50"); await page.getByRole("button", { name: "Add indicator", exact: true }).click();
  await expect(a.locator(".technical-panel-header strong")).toHaveText("NVDA · 5Y · 1D");
  await expect(a.getByTestId("technical-terminal-chart")).toHaveAttribute("aria-label", /NVDA.*EMA/);
  await expect(b.getByTestId("technical-terminal-chart")).toHaveAttribute("aria-label", /BTC-USD.*SMMA/);
  await a.locator(".technical-panel-header").click();
  await expect(page.getByRole("article", { name: "EMA 200 settings", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "SMMA 50 settings", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(a.locator(".technical-panel-header strong")).toHaveText("NVDA · 5Y · 1D", { timeout: 30000 });
  await expect(b.locator(".technical-panel-header strong")).toHaveText("BTC-USD · 3M · 4h", { timeout: 30000 });
});
