import "server-only";

export interface RequestContext {
  requestId: string;
  startedAt: number;
  ip: string;
}

function cleanHeader(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first && first.length <= 64 ? first.replace(/[^a-fA-F0-9:.[\]-]/g, "") : null;
}

export function requestIpFromHeaders(headers: Pick<Headers, "get">): string {
  return cleanHeader(headers.get("x-forwarded-for")) ?? cleanHeader(headers.get("x-real-ip")) ?? "unknown";
}

export function createRequestContext(request: Request): RequestContext {
  return {
    requestId: crypto.randomUUID(),
    startedAt: Date.now(),
    ip: requestIpFromHeaders(request.headers),
  };
}
