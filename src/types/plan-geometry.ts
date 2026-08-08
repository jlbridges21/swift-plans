/**
 * Floor geometry document — the shape of one floor's JSONB payload.
 * schemaVersion lets us evolve the format without a hard cutover.
 *
 * Units: all coordinates and lengths are inches.
 * Drawing space uses the same inches 1:1 (see plan-style tokens).
 *
 * Known Phase 2 gaps (intentional for now):
 * - No shared-wall / T-junction graph yet — walls are independent centerlines.
 * - Rooms do not list their bounding wall ids.
 * Phase 2 should add junction/adjacency without breaking these attachment fields.
 */

export type PlanPoint = { x: number; y: number };

export type WallKind = "exterior" | "interior";

/** Which end of an opening along the wall direction is the hinge. */
export type HingeSide = "start" | "end";

/**
 * Swing into the room on the left (+1) or right (-1) of the wall direction
 * when walking from opening-start toward opening-end.
 */
export type SwingSide = 1 | -1;

export type PlanRoomType =
  | "living_room"
  | "dining_room"
  | "bedroom"
  | "hallway"
  | "entry"
  | "kitchen"
  | "bathroom"
  | "laundry"
  | "closet"
  | "garage";

export type PlanRoomCategory = "living" | "wet" | "service";

export type PlanWall = {
  /** Stable id — doors/windows reference this. */
  id: string;
  /** Centerline polyline in inches. */
  centerline: PlanPoint[];
  /** Filled wall thickness in inches. */
  thickness: number;
  kind: WallKind;
  /** True for a closed exterior shell loop. */
  closed: boolean;
};

export type PlanRoom = {
  id: string;
  name: string;
  type: PlanRoomType;
  /** Tonal fill category (living / wet / service). */
  category: PlanRoomCategory;
  /** Interior floor polygon (inside face of walls). */
  polygon: PlanPoint[];
  /** Label anchor; required for L-shapes where centroid is unreliable. */
  labelAnchor: PlanPoint;
};

export type PlanDoor = {
  id: string;
  /** Host wall id. */
  wallId: string;
  /** Distance along wall centerline from its start to the opening's start end. */
  offset: number;
  /** Opening width along the wall, inches. */
  width: number;
  hingeSide: HingeSide;
  swingSide: SwingSide;
  /** Exterior entry vs interior passage (affects opening cut weight). */
  exterior: boolean;
};

export type PlanWindow = {
  id: string;
  wallId: string;
  /** Distance along wall centerline to the window's start end. */
  offset: number;
  width: number;
};

/** Pass-through opening (cased opening without a door leaf). */
export type PlanOpening = {
  id: string;
  wallId: string;
  offset: number;
  width: number;
};

export type PlanStairs = {
  id: string;
  /** Outline of the stair run / well. */
  polygon: PlanPoint[];
  /** Direction of ascent as a unit-ish vector in plan space. */
  direction: PlanPoint;
};

/** Free-floating annotation not tied to a room centroid. */
export type PlanLabel = {
  id: string;
  text: string;
  at: PlanPoint;
  kind: "note" | "dimension" | "area";
};

export type FloorGeometry = {
  schemaVersion: 1;
  meta: {
    title: string;
    /** Content bounds before sheet margin. */
    bounds: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
  };
  walls: PlanWall[];
  rooms: PlanRoom[];
  doors: PlanDoor[];
  windows: PlanWindow[];
  openings: PlanOpening[];
  stairs: PlanStairs[];
  labels: PlanLabel[];
};

/** Default empty-canvas bounds in inches (40' × 30'). Avoids NaN viewBox. */
export const EMPTY_GEOMETRY_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 480,
  maxY: 360,
} as const;

/** Valid empty geometry document for a brand-new floor. */
export function createEmptyFloorGeometry(title = ""): FloorGeometry {
  return {
    schemaVersion: 1,
    meta: {
      title,
      bounds: { ...EMPTY_GEOMETRY_BOUNDS },
    },
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    openings: [],
    stairs: [],
    labels: [],
  };
}

export function isEmptyFloorGeometry(geometry: FloorGeometry): boolean {
  return (
    geometry.walls.length === 0 &&
    geometry.rooms.length === 0 &&
    geometry.doors.length === 0 &&
    geometry.windows.length === 0 &&
    geometry.openings.length === 0 &&
    geometry.stairs.length === 0 &&
    geometry.labels.length === 0
  );
}
