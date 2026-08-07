/**
 * Canonicalizes external links originating from untrusted provider data.
 * Only credential-free HTTPS destinations are eligible for navigation.
 */
export function safeExternalHttpsUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
