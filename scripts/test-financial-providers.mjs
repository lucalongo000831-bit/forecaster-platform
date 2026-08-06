#!/usr/bin/env node

import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if (error?.code !== "ENOENT") {
    process.exitCode = 1;
  }
}

const STATUS = {
  configured: "CONFIGURATO",
  missing: "NON CONFIGURATO",
  unauthorized: "NON AUTORIZZATO",
  rateLimited: "RATE LIMITED",
  unavailable: "PROVIDER NON DISPONIBILE",
};

function credential(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: STATUS.unauthorized };
  }

  if (response.status === 429) {
    return { status: STATUS.rateLimited };
  }

  if (!response.ok) {
    return { status: STATUS.unavailable };
  }

  return { status: STATUS.configured, data: await response.json() };
}

async function testFmp() {
  const apiKey = credential("FMP_API_KEY");
  if (!apiKey) return STATUS.missing;

  try {
    const result = await requestJson(
      "https://financialmodelingprep.com/stable/quote-short?symbol=AAPL",
      { headers: { apikey: apiKey } },
    );

    if (result.status !== STATUS.configured) return result.status;
    if (Array.isArray(result.data)) return STATUS.configured;

    const message = String(result.data?.["Error Message"] ?? result.data?.message ?? "");
    return /api.?key|unauthor/i.test(message) ? STATUS.unauthorized : STATUS.unavailable;
  } catch {
    return STATUS.unavailable;
  }
}

async function testAlphaVantage() {
  const apiKey = credential("ALPHA_VANTAGE_API_KEY");
  if (!apiKey) return STATUS.missing;

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", "IBM");
  url.searchParams.set("apikey", apiKey);

  try {
    const result = await requestJson(url);
    if (result.status !== STATUS.configured) return result.status;

    if (result.data?.["Global Quote"] && Object.keys(result.data["Global Quote"]).length > 0) {
      return STATUS.configured;
    }

    const message = String(
      result.data?.Note ?? result.data?.Information ?? result.data?.["Error Message"] ?? "",
    );
    if (/rate|frequency|call limit/i.test(message)) return STATUS.rateLimited;
    if (/api.?key|invalid|unauthor/i.test(message)) return STATUS.unauthorized;
    return STATUS.unavailable;
  } catch {
    return STATUS.unavailable;
  }
}

async function testMassive() {
  const apiKey = credential("MASSIVE_API_KEY");
  if (!apiKey) return STATUS.missing;

  try {
    const result = await requestJson(
      "https://api.massive.com/v2/aggs/ticker/AAPL/prev?adjusted=true",
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (result.status !== STATUS.configured) return result.status;
    if (result.data?.status === "OK" || Array.isArray(result.data?.results)) {
      return STATUS.configured;
    }

    const message = String(result.data?.error ?? result.data?.message ?? "");
    if (/limit|too many/i.test(message)) return STATUS.rateLimited;
    if (/api.?key|auth|permission|forbidden/i.test(message)) return STATUS.unauthorized;
    return STATUS.unavailable;
  } catch {
    return STATUS.unavailable;
  }
}

const results = [
  ["FMP", await testFmp()],
  ["ALPHA VANTAGE", await testAlphaVantage()],
  ["MASSIVE", await testMassive()],
];

for (const [provider, status] of results) {
  console.log(`${provider}: ${status}`);
}

if (results.some(([, status]) => status !== STATUS.configured)) {
  process.exitCode = 1;
}
