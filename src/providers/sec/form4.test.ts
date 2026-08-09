import { describe, expect, it } from "vitest";
import { parseSecForm4 } from "./form4";

describe("SEC Form 4 parser", () => {
  it("normalizes a non-derivative acquisition", () => {
    const xml = `<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>DOE JANE</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>1</isDirector><officerTitle>CEO</officerTitle></reportingOwnerRelationship></reportingOwner><nonDerivativeTransaction><transactionDate><value>2026-08-01</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>100</value></transactionShares><transactionPricePerShare><value>12.50</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></ownershipDocument>`;
    const [transaction] = parseSecForm4(xml, { filingDate: "2026-08-02", accessionNumber: "x", sourceUrl: "https://www.sec.gov/Archives/edgar/data/x" });
    expect(transaction).toMatchObject({ owner: "DOE JANE", shares: 100, price: 12.5, acquiredDisposed: "A" });
  });
});
