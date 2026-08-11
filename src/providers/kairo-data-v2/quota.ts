import type { ProviderQuotaPolicy } from "./types";

const unverifiedQuota = (provider: ProviderQuotaPolicy["provider"]): ProviderQuotaPolicy => ({
  provider,
  requestsPerMinute: null,
  requestsPerHour: null,
  requestsPerDay: null,
  burstLimit: null,
  reservedRequests: null,
  enabled: false,
  notes: "Limiti e piano da verificare prima dell'attivazione operativa.",
});

export const providerQuotaPolicies: readonly ProviderQuotaPolicy[] = [
  unverifiedQuota("fred"),
  unverifiedQuota("bls"),
  unverifiedQuota("bea"),
  unverifiedQuota("eia"),
  unverifiedQuota("marketaux"),
  unverifiedQuota("openfigi"),
];
