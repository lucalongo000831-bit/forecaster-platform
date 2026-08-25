import { expect, test, type Page } from "@playwright/test";
import { analyzePattern, type PatternAnalysis, type PatternAssetClass, type PatternLookback } from "../src/engines/pattern";
import type { MarketChartPoint } from "../src/types";

const histories = new Map<string, MarketChartPoint[]>();
const analyses = new Map<string, PatternAnalysis>();

function assetClass(symbol: string): PatternAssetClass {
  if (symbol.endsWith("-USD")) return "CRYPTO";
  if (symbol === "SPY") return "ETF";
  return "EQUITY";
}

function history(symbol: string) {
  const cached = histories.get(symbol);
  if (cached) return cached;
  const crypto = assetClass(symbol) === "CRYPTO";
  const rows: MarketChartPoint[] = [];
  let timestamp = Date.parse("2007-01-01T00:00:00.000Z");
  let close = crypto ? 250 : 40;
  while (rows.length < 4_800) {
    const date = new Date(timestamp);
    if (crypto || ![0, 6].includes(date.getUTCDay())) {
      const index = rows.length;
      close *= Math.exp(0.0002 + Math.sin(index / 17) * .004 + Math.cos(index / 53) * .002 + Math.sin(index / 211) * .001);
      rows.push({ timestamp: date.toISOString(), open: close * .998, high: close * 1.012, low: close * .987, close, adjustedClose: close, volume: 1_000_000 + index });
    }
    timestamp += 86_400_000;
  }
  histories.set(symbol, rows);
  return rows;
}

function analysisFor(symbol: string, lookback: PatternLookback, referenceDate?: string) {
  const key = `${symbol}:${lookback}:${referenceDate ?? "LATEST"}`;
  const cached = analyses.get(key);
  if (cached) return cached;
  const analysis = analyzePattern(symbol, history(symbol), { assetClass: assetClass(symbol), lookback, referenceDate, minimumSimilarity: 0, topK: 20 });
  analyses.set(key, analysis);
  return analysis;
}

async function mockPattern(page: Page) {
  await page.route("**/api/analysis/pattern?**", async (route) => {
    const url = new URL(route.request().url());
    const symbol = (url.searchParams.get("symbol") ?? "NVDA").toUpperCase();
    const lookback = (url.searchParams.get("lookback") ?? "1M") as PatternLookback;
    const referenceDate = url.searchParams.get("referenceDate") ?? undefined;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: analysisFor(symbol, lookback, referenceDate), meta: { source: "e2e-pattern-v2" } }) });
  });
}

const paths = [
  ["NVDA", "/instrument/nasdaqgs/nvda/pattern"],
  ["AAPL", "/instrument/nasdaq/aapl/pattern"],
  ["MSFT", "/instrument/nasdaqgs/msft/pattern"],
  ["STLAM.MI", "/instrument/bit/stlam.mi/pattern"],
  ["SPY", "/instrument/us/spy/pattern"],
  ["QQQ", "/instrument/us/qqq/pattern"],
  ["BTC-USD", "/instrument/crypto/btc-usd/pattern"],
  ["ETH-USD", "/instrument/crypto/eth-usd/pattern"],
] as const;

test("Pattern V2 latest research experience works for equities, ETF and crypto", async ({ page }) => {
  await mockPattern(page);
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  for (const [symbol, path] of paths) {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByRole("heading", { name: "Pattern Intelligence" })).toBeVisible({ timeout: 80_000 });
    await expect(page.getByTestId("pattern-main-chart")).toBeVisible();
    const chart = page.getByTestId("pattern-main-chart").locator('[data-chart-engine="lightweight-charts"]');
    await expect(chart).toHaveAttribute("data-chart-ready", "true");
    const box = await chart.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual((page.viewportSize()?.width ?? 1440) + 1);
    await expect(page.getByTestId("pattern-probability-card")).toContainText("Robustness");
    await expect(page.getByTestId("most-correlated-card")).toContainText("Max Rise");
    await expect(page.getByRole("heading", { name: "Correlated Past Events" })).toBeVisible();
    await expect(page.getByText("pattern-v2.0.0").first()).toBeVisible();
    await expect(page.getByText(new RegExp(symbol === "BTC-USD" ? "24/7|CRYPTO" : "Pattern Intelligence", "i")).first()).toBeVisible();
  }
  expect(consoleErrors.filter((message) => /hydration|react|uncaught|typeerror|referenceerror/i.test(message))).toEqual([]);
});

test("Pattern V2 recalculates historical as-of and lookback while Single Events stays local", async ({ page }) => {
  await mockPattern(page);
  let patternRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/analysis/pattern?")) patternRequests += 1; });
  await page.goto("/instrument/nasdaqgs/nvda/pattern", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Pattern Intelligence" })).toBeVisible({ timeout: 80_000 });
  const chart = page.getByTestId("pattern-main-chart").locator('[data-chart-engine="lightweight-charts"]');
  await expect(chart).toHaveAttribute("data-chart-ready", "true");
  const baseline = patternRequests;
  const singles = page.getByRole("switch", { name: "Single Events" });
  await singles.click();
  await expect(singles).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/individual paths visible/)).toBeVisible();
  expect(patternRequests).toBe(baseline);
  await singles.click();
  expect(patternRequests).toBe(baseline);
  await chart.getByRole("button", { name: "Reset chart view" }).click();
  expect(patternRequests).toBe(baseline);

  await page.getByRole("combobox", { name: "Lookback" }).selectOption("3M");
  await expect(page.getByRole("combobox", { name: "Lookback" })).toHaveValue("3M");
  expect(patternRequests).toBeGreaterThan(baseline);
  const afterLookback = patternRequests;
  await page.getByRole("button", { name: "Previous valid reference date" }).click();
  await expect(page.getByText("Historical", { exact: true })).toBeVisible();
  expect(patternRequests).toBeGreaterThan(afterLookback);
  await expect(page.getByTestId("pattern-main-chart")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Correlated Past Events" })).toBeVisible();
});

test("Pattern calendar, help and correlated row selection are keyboard accessible", async ({ page }) => {
  await mockPattern(page);
  await page.goto("/instrument/crypto/btc-usd/pattern", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Pattern Intelligence" })).toBeVisible({ timeout: 80_000 });
  await page.getByRole("button", { name: "Open reference date calendar" }).click();
  const calendar = page.getByTestId("pattern-calendar");
  await expect(calendar).toBeVisible();
  await expect(calendar.getByText("Sun", { exact: true })).toBeVisible();
  expect(await calendar.locator("button:not([disabled])").count()).toBeGreaterThan(3);
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();

  await page.getByRole("button", { name: "Learn about Pattern strength" }).click();
  await expect(page.getByRole("dialog", { name: "Pattern strength" })).toContainText("Strong");
  await page.getByRole("button", { name: "Close help" }).click();
  const selectable = page.locator('tr[tabindex="0"]').nth(1);
  if (await selectable.count()) {
    await selectable.focus();
    await page.keyboard.press("Enter");
    await expect(selectable).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/Selected historical event/)).toBeVisible();
  }
});
