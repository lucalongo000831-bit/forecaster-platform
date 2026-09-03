import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("live health probe", () => {
  it("returns an uncacheable empty success response", () => {
    const response = GET();

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
