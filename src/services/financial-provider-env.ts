import "server-only";

import { getServerEnvironment } from "@/schemas/env";

export type FinancialProviderConfiguration = {
  fmpConfigured: boolean;
  alphaVantageConfigured: boolean;
  massiveConfigured: boolean;
};

export type FinancialProviderName = "fmp" | "alphaVantage" | "massive";

const environmentVariableByProvider: Record<FinancialProviderName, string> = {
  fmp: "FMP_API_KEY",
  alphaVantage: "ALPHA_VANTAGE_API_KEY",
  massive: "MASSIVE_API_KEY",
};

function hasValue(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function getFinancialProviderConfiguration(): FinancialProviderConfiguration {
  return {
    fmpConfigured: hasValue(environmentVariableByProvider.fmp),
    alphaVantageConfigured: hasValue(environmentVariableByProvider.alphaVantage),
    massiveConfigured: hasValue(environmentVariableByProvider.massive),
  };
}

export function requireFinancialProviderCredential(provider: FinancialProviderName): string {
  const env = getServerEnvironment();
  const value = provider === "fmp" ? env.FMP_API_KEY : provider === "alphaVantage" ? env.ALPHA_VANTAGE_API_KEY : env.MASSIVE_API_KEY;

  if (!value) {
    throw new Error("Variabile mancante");
  }

  return value;
}
