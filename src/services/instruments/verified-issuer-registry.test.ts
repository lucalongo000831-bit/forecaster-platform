import { describe, expect, it } from "vitest";
import { verifiedIssuerByLegalName, verifiedIssuerByListing } from "./verified-issuer-registry";

describe("verified issuer registry", () => {
  it("maps all verified Stellantis listings to one economic issuer", () => {
    const milan = verifiedIssuerByListing("STLAM.MI");
    const paris = verifiedIssuerByListing("STLAP.PA");
    const nyse = verifiedIssuerByListing("STLA");

    expect(milan?.cik).toBe("0001605484");
    expect(paris).toBe(milan);
    expect(nyse).toBe(milan);
    expect(verifiedIssuerByLegalName("Stellantis NV")).toBe(milan);
    expect(milan?.isin).toBe("NL00150001Q9");
    expect(milan?.lei).toBe("549300LKT9PW7ZIBDF31");
    expect(milan?.issuerProviderSymbols.yahoo).toBe("STLA");
  });
});
