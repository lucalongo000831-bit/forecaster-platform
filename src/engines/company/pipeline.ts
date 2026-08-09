import type { CompanyPipelineStage, PipelineStageStatus } from "@/types";
import { ProviderError } from "@/providers";

export interface StageResult<T> {
  data: T | null;
  stage: CompanyPipelineStage;
  error: unknown | null;
}

export async function runCompanyStage<T>(name: string, task: () => Promise<T>, options?: { empty?: (value: T) => boolean; emptyStatus?: PipelineStageStatus }): Promise<StageResult<T>> {
  const startedAt = Date.now();
  try {
    const data = await task();
    const empty = options?.empty?.(data) ?? (data === null || data === undefined);
    return {
      data: empty ? null : data,
      error: null,
      stage: {
        name,
        status: empty ? options?.emptyStatus ?? "unavailable" : "complete",
        durationMs: Date.now() - startedAt,
        message: empty ? "Required data was not available from configured providers." : null,
      },
    };
  } catch (error) {
    const message = error instanceof ProviderError
      ? error.code === "RATE_LIMITED" ? "Provider rate limit reached; fallback data was not available."
        : error.code === "PLAN_RESTRICTED" || error.code === "UNAUTHORIZED" ? "Configured provider plan does not expose this dataset."
          : error.code === "NOT_FOUND" ? "The requested field was not reported by the configured providers."
            : error.code === "UNSUPPORTED_SYMBOL" ? "The provider cannot map this listing or identifier."
              : "Provider temporarily unavailable after controlled retries."
      : "Stage unavailable; the remaining analysis continued.";
    return {
      data: null,
      error,
      stage: { name, status: "failed", durationMs: Date.now() - startedAt, message },
    };
  }
}

export function notApplicableStage<T>(name: string, message: string): StageResult<T> {
  return { data: null, error: null, stage: { name, status: "not-applicable", durationMs: 0, message } };
}
