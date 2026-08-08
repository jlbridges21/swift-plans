/**
 * Floor geometry document — the shape of one floor's JSONB payload.
 * schemaVersion lets us evolve the format without a hard cutover.
 *
 * Units: all coordinates and lengths are inches.
 *
 * schemaVersion 2: rooms authoritative; walls derived (derive-walls.ts).
 * schemaVersion 3: openings anchored to room edges (not derived wall ids),
 * so they survive adjoining / neighbor deletion. Walls still derived; opening
 * gaps are cut into derived spans at finalize time.
 *
 * Room types live in src/lib/plan/room-types.ts (single source of truth).
 * Expanding the type union does not bump schemaVersion — stored shape is
 * unchanged; legacy values like `entry` normalize to `foyer` on load.
 */

export type PlanPoint = { x: number; y: number };

export type WallKind = "exterior" | "interior";

/**
 * Which end of an opening span (along the room edge from start→end vertex)
 * holds the door hinge.
 */
export type HingeEnd = "start" | "end";

/**
 * Swing into the room on the left (+1) or right (-1) of the wall direction
 * when walking from opening-start toward opening-end.
 * Default +1 = into the anchor room for a CCW polygon.
 */
export type SwingSide = 1 | -1;

export type {
  PlanRoomCategory,
  PlanRoomType,
} from "../lib/plan/room-types";

import type {
  PlanRoomCategory,
  PlanRoomType,
} from "../lib/plan/room-types";

export type PlanWall = {
  /**
   * Derived id (see derive-walls.ts). Opening-split segments append `~{i}`
   * to the parent span id. Openings themselves do NOT store wall ids.
   */
  id: string;
  /** Centerline polyline in inches. */
  centerline: PlanPoint[];
  /** Filled wall thickness in inches. */
  thickness: number;
  kind: WallKind;
  /** True for a closed exterior shell loop. Derived walls are open segments. */
  closed: boolean;
  /**
   * Rooms this wall borders.
   * Exterior: one room id. Interior: two room ids (shared wall).
   */
  roomIds: string[];
};

export type PlanRoom = {
  id: string;
  name: string;
  type: PlanRoomType;
  category: PlanRoomCategory;
  /** Interior floor polygon (inside face of walls). */
  polygon: PlanPoint[];
  labelAnchor: PlanPoint;
};

/**
 * Anchor for doors / windows / openings on a room polygon edge.
 * Survives wall-id churn when neighbors are added or deleted.
 */
export type RoomEdgeAnchor = {
  roomId: string;
  /** Polygon edge index: vertex i → vertex i+1. */
  edgeIndex: number;
  /** Inches along the edge from the start vertex to the opening's start. */
  offsetIn: number;
  /** Opening width along the edge, inches. */
  widthIn: number;
};

export type PlanDoor = RoomEdgeAnchor & {
  id: string;
  hingeEnd: HingeEnd;
  swingSide: SwingSide;
};

export type PlanWindow = RoomEdgeAnchor & {
  id: string;
};

/** Pass-through opening (gap with no leaf or panes). */
export type PlanOpening = RoomEdgeAnchor & {
  id: string;
};

export type StairRotationDeg = 0 | 90 | 180 | 270;

export type PlanStairs = {
  id: string;
  /** Anchor corner of the un-rotated axis-aligned footprint. */
  origin: PlanPoint;
  widthIn: number;
  depthIn: number;
  rotationDeg: StairRotationDeg;
  direction: "up" | "down";
};

export type PlanLabel = {
  id: string;
  text: string;
  at: PlanPoint;
  kind: "note" | "dimension" | "area";
};

export type FloorGeometry = {
  schemaVersion: 1 | 2 | 3;
  meta: {
    title: string;
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

export const EMPTY_GEOMETRY_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 480,
  maxY: 360,
} as const;

export function createEmptyFloorGeometry(title = ""): FloorGeometry {
  return {
    schemaVersion: 3,
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
