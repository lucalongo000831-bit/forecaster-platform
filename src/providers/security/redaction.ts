const REDACTED = "[REDACTED]";

const sensitiveNames = new Set([
  "apikey",
  "registrationkey",
  "userid",
  "token",
  "apitoken",
  "xopenfigiapikey",
  "authorization",
  "cookie",
  "setcookie",
  "credential",
  "secret",
]);

function normalizedName(name: string) {
  return name.toLowerCase().replace(/[-_]/g, "");
}

export function isSensitiveProviderCredentialName(name: string) {
  return sensitiveNames.has(normalizedName(name));
}

function redactUrl(input: string | URL) {
  try {
    const url = new URL(input.toString());
    for (const name of Array.from(url.searchParams.keys())) {
      if (isSensitiveProviderCredentialName(name)) url.searchParams.set(name, REDACTED);
    }
    return url.toString();
  } catch {
    return "[INVALID_URL]";
  }
}

function redactHeaders(input: HeadersInit) {
  const output: Record<string, string> = {};
  const headers = new Headers(input);
  headers.forEach((value, name) => {
    output[name] = isSensitiveProviderCredentialName(name) ? REDACTED : value;
  });
  return output;
}

function redactBody(input: unknown, seen = new WeakSet<object>()): unknown {
  if (!input || typeof input !== "object") return input;
  if (seen.has(input)) return "[CIRCULAR]";
  seen.add(input);

  if (Array.isArray(input)) return input.map((value) => redactBody(value, seen));

  return Object.fromEntries(
    Object.entries(input).map(([name, value]) => [
      name,
      isSensitiveProviderCredentialName(name) ? REDACTED : redactBody(value, seen),
    ]),
  );
}

export interface ProviderRequestLogInput {
  url?: string | URL;
  headers?: HeadersInit;
  body?: unknown;
}

export interface RedactedProviderRequest {
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export function redactProviderRequest(input: ProviderRequestLogInput): RedactedProviderRequest {
  return {
    ...(input.url ? { url: redactUrl(input.url) } : {}),
    ...(input.headers ? { headers: redactHeaders(input.headers) } : {}),
    ...(input.body !== undefined ? { body: redactBody(input.body) } : {}),
  };
}

export const providerRedactionMarker = REDACTED;
