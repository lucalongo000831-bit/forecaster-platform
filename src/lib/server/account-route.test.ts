import { describe, expect, it } from "vitest";
import { AppError } from "./app-error";
import { parseJsonBody } from "./account-route";

async function capture(request: Request, maximum?: number) {
  try {
    await parseJsonBody(request, maximum);
    throw new Error("Expected parseJsonBody to reject");
  } catch (error) {
    return error;
  }
}

describe("parseJsonBody", () => {
  it("parses a bounded JSON request", async () => {
    const request = new Request("https://kairo.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol: "AAPL" }),
    });
    await expect(parseJsonBody(request)).resolves.toEqual({ symbol: "AAPL" });
  });

  it("rejects a body that exceeds the actual byte limit without Content-Length", async () => {
    const request = new Request("https://kairo.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(128) }),
    });
    const error = await capture(request, 32);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(413);
  });

  it("rejects unsupported media types and malformed JSON", async () => {
    const unsupported = await capture(new Request("https://kairo.test/api", { method: "POST", body: "{}" }));
    expect((unsupported as AppError).status).toBe(415);

    const malformed = await capture(new Request("https://kairo.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    expect((malformed as AppError).status).toBe(400);
  });
});
