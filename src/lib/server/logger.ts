import "server-only";

type LogLevel = "info" | "warn" | "error";

const SAFE_FIELDS = new Set(["requestId", "operation", "provider", "symbol", "code", "durationMs", "cache", "status", "job", "modelVersion"]);

function sanitize(fields: Record<string, unknown>) {
  const sanitized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (!SAFE_FIELDS.has(key)) continue;
    if (typeof value === "string") {
      sanitized[key] = value.replace(/[\r\n\t]/g, " ").slice(0, 160);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function structuredLog(level: LogLevel, message: string, fields: Record<string, unknown> = {}) {
  const entry = JSON.stringify({ level, message: message.slice(0, 120), timestamp: new Date().toISOString(), ...sanitize(fields) });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
