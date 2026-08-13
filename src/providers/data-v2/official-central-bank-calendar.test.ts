import { describe, expect, it } from "vitest";
import { parseEcbMeetings, parseFederalReserveMeetings } from "./official-adapters";

describe("official central-bank calendars", () => {
  it("normalizes FOMC decision dates from the official document", () => {
    const html = '<a id="42828">2026 FOMC Meetings</a><div class="row fomc-meeting"><div class="fomc-meeting__month"><strong>September</strong></div><div class="fomc-meeting__date">15-16*</div></div><div>Future Year:</div><div>Last Update: July 29, 2026</div>';
    expect(parseFederalReserveMeetings(html, "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm")).toMatchObject([{ centralBank: "FEDERAL_RESERVE", meetingStart: "2026-09-15", decisionDate: "2026-09-16", decisionTime: "2026-09-16T18:00:00.000Z", status: "SCHEDULED" }]);
  });

  it("keeps only ECB monetary-policy decision days", () => {
    const html = '<meta property="article:published_time" content="2026-08-11"><dt>09/09/2026</dt><dd>Governing Council of the ECB: monetary policy meeting (Day 1)</dd><dt>10/09/2026</dt><dd>Governing Council of the ECB: monetary policy meeting (Day 2), followed by press conference</dd><dt>30/09/2026</dt><dd>non-monetary policy meeting</dd>';
    expect(parseEcbMeetings(html, "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html")).toMatchObject([{ centralBank: "ECB", meetingStart: "2026-09-09", decisionDate: "2026-09-10", decisionTime: "2026-09-10T12:15:00.000Z", status: "SCHEDULED" }]);
  });
});
