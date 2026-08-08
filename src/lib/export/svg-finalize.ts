/**
 * Shared SVG markup finalization for export serializers.
 */

import type { PlanBranding } from "@/lib/plan/branding";
import { EMPTY_BRANDING } from "@/lib/plan/branding";

export function brandingForExport(
  branded: boolean,
  branding: PlanBranding | null | undefined,
): PlanBranding {
  if (!branded || !branding) return EMPTY_BRANDING;
  return {
    ...branding,
    logoUrl: null,
  };
}

export function finalizeStandaloneSvg(markup: string): string {
  let svg = markup.trim();
  if (!svg.startsWith("<?xml")) {
    svg = `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
  }
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}
