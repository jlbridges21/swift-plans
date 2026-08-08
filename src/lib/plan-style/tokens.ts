/**
 * Plan-render design tokens.
 *
 * The plan is a document on light "paper" — independent of app UI chrome and
 * prefers-color-scheme. Do not wire these to --sp-* tokens.
 *
 * Drawing space: 1 user unit = 1 inch (same numeric unit as stored measurements).
 *
 * Room type → category / texture: src/lib/plan/room-types.ts (single source).
 */

export type RoomCategory = "living" | "wet" | "service";

/**
 * Literal font stack for plan SVG text.
 * Must NOT use CSS custom properties — exports serialize these attributes as-is.
 * Face is self-hosted IBM Plex Sans SemiBold (see plan-font.ts).
 */
export { PLAN_FONT_FAMILY } from "./plan-font.ts";

export const planTokens = {
  /** Sheet / export ground — cool white; ties to brand, never themed. */
  paper: "#ffffff",

  /** Wall / structure ink — brand navy. */
  ink: "#0f172a",

  /** Room labels — navy. */
  inkMuted: "#0f172a",

  /** Dimensions and secondary annotations — brand gray. */
  inkSubtle: "#64748b",

  /**
   * Stroke hierarchy (named so weight intent stays obvious in code):
   * walls are FILLED polygons; these strokes are for symbols and annotations.
   */
  stroke: {
    emphasis: 2.5,
    fixture: 1.25,
    annotation: 0.75,
  },

  /** Lighter navy tint for symbol/annotation strokes when needed as a color. */
  symbol: "#334155",

  wallExterior: 6,
  wallInterior: 4.5,

  /**
   * Room fills — extremely low-contrast cool tints from brand light gray / light blue.
   * Tonal only — never colorful.
   */
  fill: {
    living: "rgba(248, 250, 252, 0.95)",
    wet: "rgba(239, 246, 255, 0.9)",
    service: "rgba(248, 250, 252, 0.7)",
  },

  /** Floor texture stroke opacity (~3–4%). */
  textureOpacity: 0.035,

  plankSpacing: 22,
  tileSpacing: 14,

  typography: {
    labelSize: 16,
    labelLetterSpacing: "0.1em",
    labelWeight: 600,
    dimensionSize: 12,
    areaSize: 11,
    totalAreaSize: 18,
  },

  /**
   * Label layout inside small rooms (document inches / font sizes).
   * Widths are compared against estimated uppercase text width.
   */
  labelFit: {
    /** Horizontal padding deducted from room AABB when measuring fit. */
    paddingIn: 8,
    /** Floor font size when the name is still too wide (then allow overflow). */
    minNameSize: 10,
    /** Line spacing between name / dims / area tspans. */
    dimLineDy: 16,
    areaLineDy: 14,
  },

  /**
   * How far a dragged label may leave the room AABB (inches).
   * Keeps labels near their room without hard-clipping to the polygon.
   */
  labelDragMaxOutsetIn: 36,

  /** Hit radius for label drag handles in document inches (scaled in editor). */
  labelHitRadiusIn: 14,

  sheetMargin: 72,

  doorSwing: {
    stroke: 1.1,
  },

  window: {
    insetRatio: 0.28,
    stroke: 1.1,
  },
} as const;

export type PlanTokens = typeof planTokens;
