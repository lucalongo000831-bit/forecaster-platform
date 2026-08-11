import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { ProviderGatewayV2 } from "./gateway-v2";

describe("ProviderGatewayV2", () => {
  it("single-flights identical concurrent requests", async () => {
    const gateway = new ProviderGatewayV2();
    let release!: () => void;
    const task = vi.fn(async () => { await new Promise<void>((resolve) => { release = resolve; }); return { value: 1 }; });
    const input = { provider: "test", dataset: "quote", operation: "read", requestKey: crypto.randomUUID(), schema: z.object({ value: z.number() }), task };
    const first = gateway.execute(input); const second = gateway.execute(input);
    await Promise.resolve(); release();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("serves an explicit LKG fallback after a provider failure", async () => {
    const gateway = new ProviderGatewayV2();
    const result = await gateway.execute({ provider: "fallback-test", dataset: "calendar", operation: "read", requestKey: crypto.randomUUID(), schema: z.object({ count: z.number() }), retryCount: 0, task: async () => { throw new Error("503"); }, fallback: async () => ({ count: 15 }) });
    expect(result).toMatchObject({ data: { count: 15 }, status: "STALE", isFallback: true });
  });

  it("opens a circuit after repeated transient failures", async () => {
    const gateway = new ProviderGatewayV2(); const provider = `circuit-${crypto.randomUUID()}`;
    for (let index = 0; index < 3; index += 1) await gateway.execute({ provider, dataset: "test", operation: "read", requestKey: String(index), schema: z.object({}), retryCount: 0, task: async () => { throw new Error("503"); }, fallback: async () => ({}) });
    expect(gateway.state(provider).state).toBe("OFFLINE");
  });
});
