import { expect, test } from "@playwright/test";

test("prepare the deterministic Pattern route", async ({ request }) => {
  const startedAt = performance.now();
  const response = await request.get("/instrument/nasdaqgs/nvda/pattern");
  const durationMs = Math.round(performance.now() - startedAt);

  expect(response.status(), "Pattern route warm-up must return a successful application response").toBe(200);
  console.log(JSON.stringify({ event: "pattern_route_warmup", durationMs, status: response.status() }));
});
