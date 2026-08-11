import type { QualityGateInput, QualityGateResult } from "@/types";

export function evaluateQualityGate(input: QualityGateInput): QualityGateResult {
  const reasons: string[] = [];
  const maximumCoverageDrop = input.maximumCoverageDrop ?? 35;
  const suspiciousEmpty = input.sourceSucceeded
    && input.candidateRecordCount === 0
    && (input.previousRecordCount ?? 0) > 0
    && !input.allowVerifiedEmpty;
  const coverageDrop = input.previousCoverage !== null && input.candidateCoverage !== null
    ? input.previousCoverage - input.candidateCoverage
    : null;

  if (!input.sourceSucceeded) reasons.push("SOURCE_REFRESH_FAILED");
  if (!input.schemaValid) reasons.push("SCHEMA_INVALID");
  if (suspiciousEmpty) reasons.push("SUSPICIOUS_EMPTY_RESPONSE");
  if (coverageDrop !== null && coverageDrop > maximumCoverageDrop) reasons.push("COVERAGE_DROP");

  return {
    accepted: reasons.length === 0,
    status: reasons.length === 0 ? "AVAILABLE" : input.sourceSucceeded ? "PARTIAL" : "SOURCE_UNAVAILABLE",
    reasons,
    suspiciousEmpty,
    coverageDrop,
  };
}

export function verifiedCount(count: number, sourceSucceeded: boolean) {
  return sourceSucceeded ? { value: count, status: "AVAILABLE" as const } : { value: null, status: "SOURCE_UNAVAILABLE" as const };
}

export function effectiveComponentWeights<T extends string>(components: Array<{ key: T; weight: number; value: number | null }>) {
  const available = components.filter((component) => component.value !== null);
  const total = available.reduce((sum, component) => sum + component.weight, 0);
  return available.map((component) => ({ ...component, effectiveWeight: total > 0 ? component.weight / total : 0 }));
}
