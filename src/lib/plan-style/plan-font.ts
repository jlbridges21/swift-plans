/**
 * Plan label font — self-hosted IBM Plex Sans SemiBold (OFL).
 * Same face on screen and in exported SVG (data-URI @font-face).
 */

import {
  PLAN_FONT_FAMILY_NAME,
  PLAN_FONT_WOFF2_BASE64,
} from "./plan-font-data.ts";

export { PLAN_FONT_FAMILY_NAME };

/** CSS font-family value used in SVG text attributes. */
export const PLAN_FONT_FAMILY = `'${PLAN_FONT_FAMILY_NAME}', ui-sans-serif, system-ui, sans-serif`;

export function planFontDataUri(): string {
  return `data:font/woff2;base64,${PLAN_FONT_WOFF2_BASE64}`;
}

/** @font-face CSS block for embedding inside SVG <defs><style>. */
export function planFontFaceCss(): string {
  return `@font-face{font-family:'${PLAN_FONT_FAMILY_NAME}';font-style:normal;font-weight:100 900;font-display:block;src:url(${planFontDataUri()}) format('woff2');}`;
}

/** Public URL for on-screen @font-face (editor). */
export const PLAN_FONT_PUBLIC_PATH = "/fonts/plan-label.woff2";

export function planFontFaceCssForScreen(): string {
  return `@font-face{font-family:'${PLAN_FONT_FAMILY_NAME}';font-style:normal;font-weight:100 900;font-display:swap;src:url('${PLAN_FONT_PUBLIC_PATH}') format('woff2');}`;
}
