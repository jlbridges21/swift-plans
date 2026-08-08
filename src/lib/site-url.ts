/**
 * Absolute site origin for OAuth and email redirectTo URLs.
 * Prefer NEXT_PUBLIC_SITE_URL; fall back to localhost in development.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  throw new Error(
    "Missing NEXT_PUBLIC_SITE_URL. Set it to your deployed origin (e.g. https://your-app.vercel.app).",
  );
}
