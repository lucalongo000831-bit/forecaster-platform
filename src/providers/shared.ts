export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function textValue(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function numericValue(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replaceAll(",", "")) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function isoDate(value: string | number | null): string | null {
  if (value === null) return null;
  const date = typeof value === "number" ? new Date(value > 10_000_000_000 ? value : value * 1_000) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
