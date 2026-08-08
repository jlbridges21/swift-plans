/**
 * Shared export constants.
 *
 * Raster pixel density is computed dynamically (see raster-scale.ts).
 * EXPORT_PX_PER_IN is the SVG serialization density and the Print preset target
 * before iOS-safe clamping.
 */

/** Pixels per plan inch used when serializing SVG width/height attributes. */
export const EXPORT_PX_PER_IN = 8;

/**
 * Markers the editor overlay uses — must never appear in exports.
 */
export const EDITOR_CHROME_MARKERS = [
  "data-editor-overlay",
  "data-room-hit",
  "data-wall-hit",
  "data-opening-hit",
  "data-stairs-hit",
  "data-label-hit",
  "data-vertex-hit",
  "data-edge-insert",
] as const;
