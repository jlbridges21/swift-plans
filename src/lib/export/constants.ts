/** Pixels per plan inch for raster/export sizing (letter-ish print density). */
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
