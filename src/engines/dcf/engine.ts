import { clamp } from "@/engines/shared/statistics";
import { DCF_MODEL_VERSION, type DcfAnalysis, type DcfInput, type DcfScenario } from "./types";

const unsupportedTypes = ["ETF", "INDEX", "CRYPTOCURRENCY", "MUTUALFUND", "CURRENCY"];

function project(input: DcfInput, name: DcfScenario["name"], growth: number, terminalGrowth: number, discountRate: number): DcfScenario {
  const years = input.forecastYears ?? 5;
  let cashFlow = input.freeCashFlow as number;
  let presentValue = 0;
  for (let year = 1; year <= years; year += 1) {
    cashFlow *= 1 + growth;
    presentValue += cashFlow / (1 + discountRate) ** year;
  }
  const terminalValue = cashFlow * (1 + terminalGrowth) / (discountRate - terminalGrowth);
  const enterpriseValue = presentValue + terminalValue / (1 + discountRate) ** years;
  const equityValue = enterpriseValue - (input.netDebt ?? 0);
  const fairValuePerShare = Math.max(0, equityValue / (input.sharesOutstanding as number) * (1 - (input.marginOfSafety ?? 0.1)));
  return { name, explicitGrowth: growth, terminalGrowth, discountRate, enterpriseValue, equityValue, fairValuePerShare };
}

export function analyzeDcf(input: DcfInput): DcfAnalysis {
  const available = [input.freeCashFlow, input.netDebt, input.sharesOutstanding, input.historicalGrowth, input.stockBasedCompensation].filter((value) => value !== null).length;
  const completeness = available / 5 * 100;
  const warnings: string[] = [];
  const type = input.instrumentType.toUpperCase();
  if (unsupportedTypes.some((candidate) => type.includes(candidate))) warnings.push(`DCF non applicabile al tipo strumento ${input.instrumentType}.`);
  if (input.freeCashFlow === null || input.freeCashFlow <= 0) warnings.push("Free cash flow assente o non positivo: DCF non affidabile.");
  if (input.sharesOutstanding === null || input.sharesOutstanding <= 0) warnings.push("Numero di azioni non disponibile.");
  if (completeness < 40) warnings.push("Completezza degli input insufficiente.");
  const applicable = warnings.length === 0;
  const assumptions = ["Periodo esplicito di 5 anni.", `Margine di sicurezza ${((input.marginOfSafety ?? 0.1) * 100).toFixed(0)}%.`, "Crescita e tassi limitati a intervalli prudenti; nessuna ipotesi estrema automatica."];
  if (!applicable) return { applicable, modelVersion: DCF_MODEL_VERSION, calculatedAt: new Date().toISOString(), completeness, scenarios: [], sensitivity: [], assumptions, warnings };

  const baseGrowth = clamp(input.historicalGrowth ?? 0.04, -0.02, 0.1);
  const scenarios = [
    project(input, "BEAR", clamp(baseGrowth - 0.04, -0.05, 0.05), 0.01, 0.12),
    project(input, "BASE", baseGrowth, 0.0225, 0.1),
    project(input, "BULL", clamp(baseGrowth + 0.035, 0, 0.13), 0.03, 0.085),
  ];
  const sensitivity = [0.085, 0.1, 0.115].flatMap((discountRate) => [0.01, 0.02, 0.03].map((terminalGrowth) => {
    const result = project(input, "BASE", baseGrowth, terminalGrowth, discountRate);
    return { discountRate, terminalGrowth, fairValuePerShare: result.fairValuePerShare };
  }));
  if (input.stockBasedCompensation === null) warnings.push("Stock-based compensation non disponibile: non sottratta separatamente.");
  return { applicable, modelVersion: DCF_MODEL_VERSION, calculatedAt: new Date().toISOString(), completeness, scenarios, sensitivity, assumptions, warnings };
}
