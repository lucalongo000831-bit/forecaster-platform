import "server-only";

import { isDeterministicE2EProviderEnabled } from "./deterministic-e2e-provider";

type ProviderNetworkAudit = {
  installed: boolean;
  blockedAttempts: number;
  hosts: Record<string, number>;
};

const auditKey = Symbol.for("kairo.deterministic-e2e.provider-network-audit");
const providerHosts = [
  "alphavantage.co",
  "api.coingecko.com",
  "api.massive.com",
  "api.nasdaq.com",
  "bargotrades.com",
  "capitolexposed.com",
  "eodhd.com",
  "financialmodelingprep.com",
  "finnhub.io",
  "finance.yahoo.com",
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "sec.gov",
];

function state(): ProviderNetworkAudit {
  const root = globalThis as typeof globalThis & { [auditKey]?: ProviderNetworkAudit };
  root[auditKey] ??= { installed: false, blockedAttempts: 0, hosts: {} };
  return root[auditKey];
}

function hostname(input: Parameters<typeof fetch>[0]) {
  try {
    if (typeof input === "string" || input instanceof URL) return new URL(input).hostname.toLowerCase();
    return new URL(input.url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isProviderHost(host: string) {
  return providerHosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function installDeterministicE2EProviderNetworkGuard() {
  if (!isDeterministicE2EProviderEnabled()) return;
  const audit = state();
  if (audit.installed) return;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const host = hostname(input);
    if (host && isProviderHost(host)) {
      audit.blockedAttempts += 1;
      audit.hosts[host] = (audit.hosts[host] ?? 0) + 1;
      throw new Error(`Deterministic E2E isolation blocked an unexpected provider request to ${host}.`);
    }
    return originalFetch(input, init);
  };
  audit.installed = true;
}

export function deterministicE2ENetworkAudit() {
  const audit = state();
  return { enabled: isDeterministicE2EProviderEnabled(), installed: audit.installed, blockedAttempts: audit.blockedAttempts, hosts: { ...audit.hosts } };
}
