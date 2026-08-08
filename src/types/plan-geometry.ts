/**
 * Floor geometry document — the shape of one floor's JSONB payload.
 * schemaVersion lets us evolve the format without a hard cutover.
 *
 * Units: all coordinates and lengths are inches.
 *
 * schemaVersion 2: rooms authoritative; walls derived (derive-walls.ts).
 * schemaVersion 3: openings anchored to room edges (not derived wall ids).
 * schemaVersion 4: PlanRoom.nameCustom — whether the user authored the name
 * (auto names including "Room N" stay false so setRoomType can rename).
 *
 * Room types: src/lib/plan/room-types.ts (single source of truth).
 */

export type PlanPoint = { x: number; y: number };

export type WallKind = "exterior" | "interior";

export type HingeEnd = "start" | "end";

export type SwingSide = 1 | -1;

export type {
  PlanRoomCategory,
  PlanRoomType,
} from "../lib/plan/room-types.ts";

import type {
  PlanRoomCategory,
  PlanRoomType,
} from "../lib/plan/room-types.ts";

export type PlanWall = {
  id: string;
  centerline: PlanPoint[];
  thickness: number;
  kind: WallKind;
  closed: boolean;
  roomIds: string[];
};

export type PlanRoom = {
  id: string;
  name: string;
  type: PlanRoomType;
  category: PlanRoomCategory;
  polygon: PlanPoint[];
  labelAnchor: PlanPoint;
  /**
   * True only when the user typed a custom name.
   * False for auto names (type display names / "Room N").
   * When false, setRoomType replaces the name.
   */
  nameCustom: boolean;
};

export type RoomEdgeAnchor = {
  roomId: string;
  edgeIndex: number;
  offsetIn: number;
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

export type PlanOpening = RoomEdgeAnchor & {
  id: string;
};

export type StairRotationDeg = 0 | 90 | 180 | 270;

export type PlanStairs = {
  id: string;
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
  schemaVersion: 1 | 2 | 3 | 4;
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
    schemaVersion: 4,
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
