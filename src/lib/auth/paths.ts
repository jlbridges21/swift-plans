/**
 * Allow only same-origin relative paths for post-auth redirects.
 *
 * String-prefix checks alone are insufficient: WHATWG URL parsing for http(s)
 * treats `\` as `/`, so a path like `/\evil.com` resolves to a different origin
 * (`https://evil.com/`). Always resolve against the request origin and verify
 * the result stays on that origin.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/dashboard",
  origin = "http://localhost",
): string {
  if (!next) {
    return fallback;
  }

  // Reject backslashes, tabs, newlines, and other ASCII control characters
  // before URL resolution can reinterpret them.
  if (/[\u0000-\u001f\u007f\\]/.test(next)) {
    return fallback;
  }

  if (!next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  let resolved: URL;
  let base: URL;
  try {
    base = new URL(origin);
    resolved = new URL(next, base);
  } catch {
    return fallback;
  }

  if (resolved.origin !== base.origin) {
    return fallback;
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
