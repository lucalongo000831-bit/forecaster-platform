import { describe, expect, it } from "vitest";
import { safeExternalHttpsUrl } from "./safe-url";

describe("safeExternalHttpsUrl", () => {
  it("accepts credential-free HTTPS URLs", () => {
    expect(safeExternalHttpsUrl("https://investor.example.com/company?q=1")).toBe("https://investor.example.com/company?q=1");
  });

  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "file:///tmp/report",
    "vbscript:msgbox(1)",
    "https://user:password@example.com",
    "/relative/path",
    "not a url",
  ])("rejects unsafe external destination %s", (value) => {
    expect(safeExternalHttpsUrl(value)).toBeNull();
  });

  it("preserves null and empty provider values as unavailable", () => {
    expect(safeExternalHttpsUrl(null)).toBeNull();
    expect(safeExternalHttpsUrl("  ")).toBeNull();
  });
});
