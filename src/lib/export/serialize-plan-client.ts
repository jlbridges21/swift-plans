/**
 * Client-safe PlanDocument → SVG serialization (react-dom/server.browser).
 * Same PlanDrawing renderer as the editor and the Node check serializer.
 */

"use client";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
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

export type SerializePlanOptions = {
  style?: PlanStyleSettings;
  branding?: PlanBranding | null;
  branded?: boolean;
};

export function serializePlanSvgClient(
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
