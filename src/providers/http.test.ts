import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./coordinator", () => ({
  coordinatedProviderRequest: vi.fn(async (_provider: string, task: () => Promise<Response>) => task()),
}));

import { ProviderError } from "./errors";
import { providerRequest } from "./http";

const schema = z.object({ ok: z.boolean() });

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function request(retries = 0) {
  return providerRequest({
    provider: "massive",
    operation: "quote-audit",
    url: new URL("https://api.massive.com/v3/snapshot?ticker=AAPL"),
    schema,
    retries,
    timeoutMs: 100,
  });
}

describe("provider HTTP authorization semantics", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a valid Massive response", async () => {
    vi.mocked(fetch).mockResolvedValue(response(200, { ok: true }));
    await expect(request()).resolves.toEqual({ ok: true });
  });

  it("classifies 401 as a non-retryable authentication failure", async () => {
    vi.mocked(fetch).mockResolvedValue(response(401, { status: "NOT_AUTHORIZED" }));
    const error = await request(2).catch((value: unknown) => value);
    expect(error).toMatchObject<Partial<ProviderError>>({ code: "UNAUTHORIZED", retryable: false, status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("classifies 403 as a non-retryable entitlement failure", async () => {
    vi.mocked(fetch).mockResolvedValue(response(403, { status: "NOT_AUTHORIZED" }));
    const error = await request(2).catch((value: unknown) => value);
    expect(error).toMatchObject<Partial<ProviderError>>({ code: "PLAN_RESTRICTED", retryable: false, status: 403 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("classifies 429 as a retryable rate limit", async () => {
    vi.mocked(fetch).mockResolvedValue(response(429, { status: "ERROR" }));
    const error = await request().catch((value: unknown) => value);
    expect(error).toMatchObject<Partial<ProviderError>>({ code: "RATE_LIMITED", retryable: true, status: 429 });
  });

  it("classifies 5xx as a retryable upstream failure", async () => {
    vi.mocked(fetch).mockResolvedValue(response(503, { status: "ERROR" }));
    const error = await request().catch((value: unknown) => value);
    expect(error).toMatchObject<Partial<ProviderError>>({ code: "UPSTREAM_UNAVAILABLE", retryable: true, status: 503 });
  });

  it("rejects malformed successful responses", async () => {
    vi.mocked(fetch).mockResolvedValue(response(200, { unexpected: true }));
    const error = await request().catch((value: unknown) => value);
    expect(error).toMatchObject<Partial<ProviderError>>({ code: "INVALID_RESPONSE", retryable: false });
  });

  it("classifies aborts as retryable timeouts", async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException("Timed out", "AbortError"));
    const error = await request().catch((value: unknown) => value);
    expect(error).toMatchObject<Partial<ProviderError>>({ code: "TIMEOUT", retryable: true, status: 504 });
  });
});
