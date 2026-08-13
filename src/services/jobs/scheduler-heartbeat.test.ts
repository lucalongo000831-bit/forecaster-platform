import { describe, expect, it } from "vitest";
import { classifyHeartbeat } from "./scheduler-heartbeat";

const now = new Date("2026-08-12T12:00:00Z");
describe("scheduler heartbeat classification", () => {
  it("detects healthy, late, missed and failed jobs", () => {
    expect(classifyHeartbeat({ enabled: true, lastStartedAt: new Date("2026-08-12T11:50:00Z"), lastStatus: "COMPLETED", expectedMinutes: 15 }, now)).toBe("HEALTHY");
    expect(classifyHeartbeat({ enabled: true, lastStartedAt: new Date("2026-08-12T11:40:00Z"), lastStatus: "COMPLETED", expectedMinutes: 15 }, now)).toBe("LATE");
    expect(classifyHeartbeat({ enabled: true, lastStartedAt: new Date("2026-08-12T11:20:00Z"), lastStatus: "COMPLETED", expectedMinutes: 15 }, now)).toBe("MISSED");
    expect(classifyHeartbeat({ enabled: true, lastStartedAt: now, lastStatus: "FAILED", expectedMinutes: 15 }, now)).toBe("FAILED");
  });

  it("keeps a daily Hobby-compatible job healthy inside its expected cadence", () => {
    const now = new Date("2026-08-12T12:00:00.000Z");
    expect(classifyHeartbeat({ enabled: true, lastStartedAt: new Date("2026-08-11T13:00:00.000Z"), lastStatus: "COMPLETED", expectedMinutes: 1_440 }, now)).toBe("HEALTHY");
  });
});
