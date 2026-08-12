import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/schemas/env", () => ({ getServerEnvironment: () => ({ CRON_SECRET: "test-cron-secret" }) }));

describe("cron authorization", () => {
  beforeEach(() => vi.resetModules());

  it("rejects a missing bearer secret", async () => {
    const { assertCronRequest } = await import("./cron-auth");
    expect(() => assertCronRequest(new Request("https://example.test/api/cron/data-v2"))).toThrow("Cron non autorizzato");
  });

  it("rejects an invalid bearer secret", async () => {
    const { assertCronRequest } = await import("./cron-auth");
    expect(() => assertCronRequest(new Request("https://example.test/api/cron/data-v2", { headers: { authorization: "Bearer wrong" } }))).toThrow("Cron non autorizzato");
  });

  it("accepts the configured bearer secret without exposing it", async () => {
    const { assertCronRequest } = await import("./cron-auth");
    expect(() => assertCronRequest(new Request("https://example.test/api/cron/data-v2", { headers: { authorization: "Bearer test-cron-secret" } }))).not.toThrow();
  });
});
