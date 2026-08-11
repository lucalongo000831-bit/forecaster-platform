import { describe, expect, it } from "vitest";
import { providerRedactionMarker, redactProviderRequest } from "./redaction";

describe("redactProviderRequest", () => {
  it("redacts provider credentials in query parameters", () => {
    const request = redactProviderRequest({
      url: "https://provider.example/data?api_key=SECRET&apikey=SECRET&api_token=SECRET&symbol=AAPL",
    });

    const url = new URL(request.url!);
    expect(url.searchParams.get("api_key")).toBe(providerRedactionMarker);
    expect(url.searchParams.get("apikey")).toBe(providerRedactionMarker);
    expect(url.searchParams.get("api_token")).toBe(providerRedactionMarker);
    expect(url.searchParams.get("symbol")).toBe("AAPL");
  });

  it("redacts credentials in request bodies without removing diagnostic fields", () => {
    const request = redactProviderRequest({
      body: {
        registrationkey: "SECRET",
        UserID: "SECRET",
        seriesid: ["LNS14000000"],
        nested: { apiKey: "SECRET", method: "GetDatasetList" },
      },
    });

    expect(request.body).toEqual({
      registrationkey: providerRedactionMarker,
      UserID: providerRedactionMarker,
      seriesid: ["LNS14000000"],
      nested: { apiKey: providerRedactionMarker, method: "GetDatasetList" },
    });
  });

  it("redacts OpenFIGI and authorization headers", () => {
    const request = redactProviderRequest({
      headers: {
        "Content-Type": "application/json",
        "X-OPENFIGI-APIKEY": "SECRET",
        Authorization: "Bearer SECRET",
      },
    });

    expect(request.headers).toEqual({
      authorization: providerRedactionMarker,
      "content-type": "application/json",
      "x-openfigi-apikey": providerRedactionMarker,
    });
  });
});
