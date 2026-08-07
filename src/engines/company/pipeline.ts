import type { CompanyPipelineStage, PipelineStageStatus } from "@/types";

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
    return {
      data: null,
      error,
      stage: { name, status: "failed", durationMs: Date.now() - startedAt, message: "Stage unavailable; the remaining analysis continued." },
    };
  }
}

export function notApplicableStage<T>(name: string, message: string): StageResult<T> {
  return { data: null, error: null, stage: { name, status: "not-applicable", durationMs: 0, message } };
}
