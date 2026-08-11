import { describe, expect, it } from "vitest";
import { providerPayloadHash } from "./snapshot-repository";

describe("raw provider record idempotency", () => {
  it("uses a deterministic payload fingerprint independent of object key order", () => {
    expect(providerPayloadHash({ symbol: "AAPL", value: 10 })).toBe(providerPayloadHash({ value: 10, symbol: "AAPL" }));
  });

  it("changes the fingerprint when the source fact changes", () => {
    expect(providerPayloadHash({ symbol: "AAPL", value: 10 })).not.toBe(providerPayloadHash({ symbol: "AAPL", value: 11 }));
  });
});
