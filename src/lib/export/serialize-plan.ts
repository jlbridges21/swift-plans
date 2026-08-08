/**
 * Serialize PlanDocument to a standalone SVG string (one renderer).
 * Used by Node check scripts (jiti). The editor uses serialize-plan-client.ts
 * because Next.js App Router cannot import react-dom/server in RSC/route graphs.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanDrawing, planViewBox } from "@/components/plan/PlanDrawing";
import type { PlanBranding } from "@/lib/plan/branding";
import { planFontFaceCss } from "@/lib/plan-style/plan-font";
import {
  DEFAULT_PLAN_STYLE,
  type PlanStyleSettings,
} from "@/lib/plan/style-settings";
import type { FloorGeometry } from "@/types/plan-geometry";
import { EXPORT_PX_PER_IN } from "@/lib/export/constants";
import {
  brandingForExport,
  finalizeStandaloneSvg,
} from "@/lib/export/svg-finalize";

export { EXPORT_PX_PER_IN, EDITOR_CHROME_MARKERS } from "@/lib/export/constants";
export { exportFilename, slugifyFilenamePart } from "@/lib/export/filename";

export type SerializePlanOptions = {
  style?: PlanStyleSettings;
  branding?: PlanBranding | null;
  branded?: boolean;
};

export function serializePlanSvg(
  geometry: FloorGeometry,
  options: SerializePlanOptions = {},
): string {
  const style = options.style ?? DEFAULT_PLAN_STYLE;
  const branded = options.branded === true;
  const branding = brandingForExport(branded, options.branding);
  const vb = planViewBox(geometry, style);
  const widthPx = Math.round(vb.width * EXPORT_PX_PER_IN);
  const heightPx = Math.round(vb.height * EXPORT_PX_PER_IN);

  const markup = renderToStaticMarkup(
    React.createElement(PlanDrawing, {
      geometry,
      style,
      branding: branded ? branding : null,
      embedFont: true,
      fontFaceCss: planFontFaceCss(),
      exportWidthPx: widthPx,
      exportHeightPx: heightPx,
    }),
  );

  return finalizeStandaloneSvg(markup);
}
