/**
 * Plan-render design tokens.
 *
 * The plan is a document on light "paper" — independent of app UI chrome and
 * prefers-color-scheme. Do not wire these to --sp-* tokens.
 *
 * Drawing space: 1 user unit = 1 inch (same numeric unit as stored measurements).
 * Real-world inches map 1:1 into SVG user space; the viewBox then scales the
 * whole sheet responsively. Feet/inches formatting is display-only.
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
  /** Sheet / export ground — warm off-white, never pure white. */
  paper: "#f5f0e6",

  /** Soft charcoal ink for walls and primary structure — never pure black. */
  ink: "#2c2a26",

  /** Secondary ink for room labels. */
  inkMuted: "#5c574e",

  /** Tertiary ink for dimensions and light annotations. */
  inkSubtle: "#8a8478",

  /**
   * Stroke hierarchy (named so weight intent stays obvious in code):
   * walls are FILLED polygons; these strokes are for symbols and annotations.
   */
  stroke: {
    /** Heaviest non-fill line — reserved for rare emphasis (north arrow, etc.). */
    emphasis: 2.5,
    /** Fixture / symbol lines: door leaf, window panes, stair treads. */
    fixture: 1.25,
    /** Annotation lines: dimension ticks, light guides, hatch. */
    annotation: 0.75,
  },

  /** Exterior wall thickness in drawing inches (filled polygon width). */
  wallExterior: 6,
  /** Interior wall thickness in drawing inches. */
  wallInterior: 4.5,

  /** Room fills — tonal warm greys, very low contrast against paper. */
  fill: {
    living: "rgba(44, 42, 38, 0.035)",
    wet: "rgba(44, 42, 38, 0.065)",
    service: "rgba(44, 42, 38, 0.05)",
  },

  /**
   * Floor texture stroke opacity (~3–4%). Reads as flooring, not a loud hatch.
   * Applied directly to pattern strokes — do not multiply up.
   */
  textureOpacity: 0.035,

  /** Plank spacing in drawing inches (wide). */
  plankSpacing: 22,
  /** Tile grid spacing in drawing inches (finer). */
  tileSpacing: 14,

  typography: {
    /** Room name — geometric sans, uppercase, tracked. */
    labelSize: 16,
    labelLetterSpacing: "0.1em",
    labelWeight: 600,
    /** Dimension line under the label (e.g. 12' 6" × 10' 0"). */
    dimensionSize: 12,
    /** Room area and total floor area. */
    areaSize: 11,
    totalAreaSize: 18,
  },

  /** Empty margin around the building footprint in the viewBox (inches). */
  sheetMargin: 48,

  /** Door swing arc radius uses opening width; leaf/arc use fixture stroke. */
  doorSwing: {
    /** Arc + leaf stroke weight. */
    stroke: 1.1,
  },

  /** Window: parallel lines inset into the wall thickness. */
  window: {
    /** Inset from wall faces toward centerline, as a fraction of thickness. */
    insetRatio: 0.28,
    stroke: 1.1,
  },
} as const;

export type PlanTokens = typeof planTokens;
