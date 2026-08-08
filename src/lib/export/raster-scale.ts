/**
 * Safe raster dimensions for iOS Safari (and desktop).
 *
 * iOS Safari roughly caps canvas at ~16.7 megapixels total and ~8192px on a side.
 * Above that it often yields a BLANK canvas with no exception. These limits keep
 * headroom under those ceilings.
 */

/** Max width or height for a raster export canvas (px). */
export const RASTER_MAX_SIDE_PX = 4096;

/**
 * Max width×height for a raster export canvas (px²).
 * ~12MP — under Safari’s ~16.7MP area cap with headroom.
 */
export const RASTER_MAX_AREA_PX = 12_000_000;

/**
 * Aspirational pixels per plan-inch before clamping.
 * Print matches the historical EXPORT_PX_PER_IN default (8).
 */
export const RASTER_PRESET_PX_PER_IN = {
  web: 2,
  mls: 4,
  print: 8,
} as const;

export type RasterPreset = keyof typeof RASTER_PRESET_PX_PER_IN;

export const RASTER_PRESET_LABELS: Record<RasterPreset, string> = {
  web: "Web",
  mls: "MLS",
  print: "Print",
};

export type RasterSize = {
  widthPx: number;
  heightPx: number;
  /** Effective px per plan-inch after clamp. */
  pxPerIn: number;
  /** Multiplier vs the SVG’s intrinsic EXPORT_PX_PER_IN sizing. */
  scaleFromSvg: number;
  clamped: boolean;
};

/**
 * Compute raster pixel size for a plan whose SVG was serialized at
 * `svgPxPerIn` (typically EXPORT_PX_PER_IN = 8).
 *
 * Never upscales past the Print preset’s target density.
 */
export function computeRasterSize(
  planWidthIn: number,
  planHeightIn: number,
  preset: RasterPreset,
  svgPxPerIn: number,
): RasterSize {
  const wIn = Math.max(planWidthIn, 1e-6);
  const hIn = Math.max(planHeightIn, 1e-6);
  const targetPpi = RASTER_PRESET_PX_PER_IN[preset];

  let widthPx = wIn * targetPpi;
  let heightPx = hIn * targetPpi;

  let scale = 1;
  if (widthPx > RASTER_MAX_SIDE_PX) {
    scale = Math.min(scale, RASTER_MAX_SIDE_PX / widthPx);
  }
  if (heightPx > RASTER_MAX_SIDE_PX) {
    scale = Math.min(scale, RASTER_MAX_SIDE_PX / heightPx);
  }
  const area = widthPx * heightPx;
  if (area * scale * scale > RASTER_MAX_AREA_PX) {
    scale = Math.min(scale, Math.sqrt(RASTER_MAX_AREA_PX / area));
  }

  widthPx = Math.max(1, Math.floor(widthPx * scale));
  heightPx = Math.max(1, Math.floor(heightPx * scale));

  // Re-check after floor rounding
  if (widthPx > RASTER_MAX_SIDE_PX) widthPx = RASTER_MAX_SIDE_PX;
  if (heightPx > RASTER_MAX_SIDE_PX) heightPx = RASTER_MAX_SIDE_PX;
  while (
    widthPx * heightPx > RASTER_MAX_AREA_PX &&
    (widthPx > 1 || heightPx > 1)
  ) {
    if (widthPx >= heightPx && widthPx > 1) widthPx -= 1;
    else if (heightPx > 1) heightPx -= 1;
    else break;
  }

  const pxPerIn = widthPx / wIn;
  const scaleFromSvg = pxPerIn / Math.max(svgPxPerIn, 1e-6);
  const clamped = scale < 1 - 1e-9;

  return { widthPx, heightPx, pxPerIn, scaleFromSvg, clamped };
}

/** Assert helpers for check scripts. */
export function rasterSizeWithinLimits(size: RasterSize): boolean {
  return (
    size.widthPx <= RASTER_MAX_SIDE_PX &&
    size.heightPx <= RASTER_MAX_SIDE_PX &&
    size.widthPx * size.heightPx <= RASTER_MAX_AREA_PX &&
    size.widthPx >= 1 &&
    size.heightPx >= 1
  );
}
