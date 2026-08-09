import { describe, expect, it } from "vitest";
import { MAX_GLOBAL_BRIEF_BYTES, parseGlobalMarketBrief, sanitizeBriefText } from "./global-market-brief-parser";

const complete = `STATUS: YELLOW\nSYSTEMIC_STRESS: NO\nRISK_TREND: STABLE\nSUMMARY:\nGlobal risk remains elevated but contained.\nVOLATILITY:\nAbove normal.\nCREDIT:\nOrderly.\nLIQUIDITY:\nNo major stress.\nRATES:\nMeaningful uncertainty.\nMARKET_BREADTH:\nMixed.\nCROSS_ASSET:\nContained.\nMACRO:\nUpcoming releases.\nGEOPOLITICS:\nElevated uncertainty.\nMAIN_RISKS:\nRates and geopolitics.\nSTABILIZING_FACTORS:\nCredit and liquidity.\nESCALATION_TRIGGERS:\nCombined deterioration.\nFINAL_VIEW:\nYellow alert.`;

describe("global market brief parser", () => {
  it("parses a complete scheduled report", () => { const parsed = parseGlobalMarketBrief(complete); expect(parsed.status).toBe("YELLOW"); expect(parsed.systemicStress).toBe("NONE"); expect(parsed.riskTrend).toBe("STABLE"); expect(parsed.sections.marketBreadth).toBe("Mixed."); expect(parsed.missingSections).toEqual([]); });
  it("marks missing macro without inventing it", () => { const parsed = parseGlobalMarketBrief(complete.replace("MACRO:\nUpcoming releases.\n", "")); expect(parsed.sections.macro).toBe("Not provided."); expect(parsed.missingSections).toContain("macro"); });
  it("accepts a missing systemic field", () => { expect(parseGlobalMarketBrief(complete.replace("SYSTEMIC_STRESS: NO\n", "")).systemicStress).toBe("UNAVAILABLE"); });
  it("accepts underscore, spaces, hashes and hyphen separators", () => { const parsed = parseGlobalMarketBrief("# status - green\n## systemic stress - none\nmarket breadth - Ampia\nfinal_view: Costruttiva"); expect(parsed.status).toBe("GREEN"); expect(parsed.systemicStress).toBe("NONE"); expect(parsed.sections.marketBreadth).toBe("Ampia"); expect(parsed.sections.finalView).toBe("Costruttiva"); });
  it("handles lowercase, CRLF, Italian and English text", () => { const parsed = parseGlobalMarketBrief("status: yellow\r\nsystemic_stress: no\r\nsummary:\r\nRischio elevato ma contenuto.\r\nfinal view:\r\nRisk remains contained."); expect(parsed.sections.summary).toContain("Rischio"); expect(parsed.sections.finalView).toContain("Risk"); });
  it("removes unsafe control characters while retaining plain text", () => { expect(sanitizeBriefText("Hello\u0000<script>alert(1)</script>")).toBe("Hello<script>alert(1)</script>"); });
  it("rejects oversized input", () => { expect(() => sanitizeBriefText("x".repeat(MAX_GLOBAL_BRIEF_BYTES + 1))).toThrow(/100 KB/); });
});
