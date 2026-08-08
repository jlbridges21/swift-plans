/**
 * Plan-render design tokens.
 *
 * The plan is a document on light "paper" — independent of app UI chrome and
 * prefers-color-scheme. Do not wire these to --sp-* tokens.
 *
 * Drawing space: 1 user unit = 1 inch (same numeric unit as stored measurements).
 */

export type RoomCategory = "living" | "wet" | "service";

export type FloorTexture = "plank" | "tile" | "none";

/** Map common room types → tonal fill category. */
export const ROOM_TYPE_CATEGORY = {
  living_room: "living",
  dining_room: "living",
  bedroom: "living",
  hallway: "living",
  entry: "living",
  kitchen: "wet",
  bathroom: "wet",
  laundry: "wet",
  closet: "service",
  garage: "service",
} as const satisfies Record<string, RoomCategory>;

export type RoomType = keyof typeof ROOM_TYPE_CATEGORY;

/** Floor material hatch — separate from tonal fill category. */
export function floorTextureForRoomType(type: RoomType): FloorTexture {
  switch (type) {
    case "living_room":
    case "dining_room":
    case "bedroom":
    case "entry":
      return "plank";
    case "bathroom":
    case "kitchen":
    case "laundry":
      return "tile";
    case "garage":
    case "closet":
    case "hallway":
      return "none";
  }
}

/**
 * Literal font stack for plan SVG text.
 * Must NOT use CSS custom properties — exports serialize these attributes as-is.
 */
export const PLAN_FONT_FAMILY =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

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

  sheetMargin: 48,

  doorSwing: {
    stroke: 1.1,
  },

  window: {
    insetRatio: 0.28,
    stroke: 1.1,
  },
} as const;

export type PlanTokens = typeof planTokens;
