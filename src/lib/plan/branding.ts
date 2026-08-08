/**
 * Branding applied at plan render / export time — never stored in geometry.
 */

export type PlanBranding = {
  companyName: string | null;
  logoUrl: string | null;
  /** Optional data URI for logo (used when serializing standalone SVG). */
  logoDataUri: string | null;
  website: string | null;
  footerText: string | null;
};

export const EMPTY_BRANDING: PlanBranding = {
  companyName: null,
  logoUrl: null,
  logoDataUri: null,
  website: null,
  footerText: null,
};

export function brandingHasContent(b: PlanBranding | null | undefined): boolean {
  if (!b) return false;
  return Boolean(
    (b.companyName && b.companyName.trim()) ||
      b.logoUrl ||
      b.logoDataUri ||
      (b.website && b.website.trim()) ||
      (b.footerText && b.footerText.trim()),
  );
}
