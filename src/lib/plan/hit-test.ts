/**
 * Deterministic editor hit testing (pure — no DOM / React).
 *
 * Priority when resolving overlapping candidates (highest first):
 *
 * 1. Vertex / edge-insert of the selected room — only when reshape === true
 * 2. Opening belonging to the selected room (or whose roomId is selected)
 * 3. Label of the selected room — only when labelSelected === true
 * 4. Wall that belongs to the selected room (roomIds includes it)
 * 5. Stairs — only when selectedStairsId matches, OR selected room is null and
 *    the point is not inside any room, OR the selected room contains the stairs
 *    hit (stairs treated as a sub-element of the selected room’s area)
 * 6. Room containing the point (or within edge slop) — prefers selected room
 *    when still under the pointer; otherwise the topmost room by stable id order
 * 7. Empty canvas → pan
 *
 * When nothing is selected, steps 1–5 are skipped for sub-elements: a hit on a
 * room’s wall, label, corner, or fill always yields that room. Stairs that lie
 * entirely outside every room remain selectable.
 *
 * Hit slop is MIN_HIT_PX screen pixels, converted via pixelsPerInch so targets
 * feel the same at every zoom. Effective touch size is at least 44px.
 */

import { pointInPolygon } from "../../components/plan/geometry.ts";
import { listOpenings, openingWorldSpan } from "./openings.ts";
import { stairsPolygon } from "./stairs.ts";
import type {
  FloorGeometry,
  PlanPoint,
  PlanRoom,
  PlanWall,
} from "../../types/plan-geometry.ts";

/** Minimum interactive target size in screen pixels. */
export const MIN_HIT_PX = 44;

export type HitSelectionState = {
  selectedRoomId: string | null;
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedStairsId: string | null;
  /** True when the room label is the active sub-selection (Move label). */
  labelSelected: boolean;
  /** Reshape mode for the currently selected room. */
  reshape: boolean;
};

export type HitTarget =
  | { kind: "pan" }
  | { kind: "room"; roomId: string }
  | { kind: "wall"; wallId: string; roomId: string }
  | { kind: "opening"; openingId: string; roomId: string }
  | { kind: "stairs"; stairsId: string }
  | { kind: "label"; roomId: string }
  | { kind: "vertex"; roomId: string; vertexIndex: number }
  | { kind: "edge-insert"; roomId: string; edgeIndex: number };

function dist(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function distPointToSegment(
  p: PlanPoint,
  a: PlanPoint,
  b: PlanPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function distPointToPolyline(
  p: PlanPoint,
  pts: PlanPoint[],
  closed: boolean,
): number {
  if (pts.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    best = Math.min(best, distPointToSegment(p, pts[i]!, pts[i + 1]!));
  }
  if (closed && pts.length > 2) {
    best = Math.min(
      best,
      distPointToSegment(p, pts[pts.length - 1]!, pts[0]!),
    );
  }
  return best;
}

function roomContainsPoint(room: PlanRoom, p: PlanPoint): boolean {
  return pointInPolygon(p, [room.polygon]);
}

function roomEdgeSlop(room: PlanRoom, p: PlanPoint, slopIn: number): boolean {
  const poly = room.polygon;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (distPointToSegment(p, a, b) <= slopIn) return true;
  }
  return false;
}

function wallBelongsToRoom(wall: PlanWall, roomId: string): boolean {
  return wall.roomIds.includes(roomId);
}

function findRoomAtPoint(
  geometry: FloorGeometry,
  p: PlanPoint,
  slopIn: number,
  preferRoomId: string | null,
): PlanRoom | null {
  if (preferRoomId) {
    const preferred = geometry.rooms.find((r) => r.id === preferRoomId);
    if (
      preferred &&
      (roomContainsPoint(preferred, p) || roomEdgeSlop(preferred, p, slopIn))
    ) {
      return preferred;
    }
  }
  // Stable: first room in document order that contains / near-edges the point
  for (const room of geometry.rooms) {
    if (roomContainsPoint(room, p) || roomEdgeSlop(room, p, slopIn)) {
      return room;
    }
  }
  return null;
}

function hitVertex(
  room: PlanRoom,
  p: PlanPoint,
  slopIn: number,
): number | null {
  let best: { i: number; d: number } | null = null;
  for (let i = 0; i < room.polygon.length; i += 1) {
    const d = dist(p, room.polygon[i]!);
    if (d <= slopIn && (!best || d < best.d)) best = { i, d };
  }
  return best ? best.i : null;
}

function hitEdgeInsert(
  room: PlanRoom,
  p: PlanPoint,
  slopIn: number,
): number | null {
  let best: { i: number; d: number } | null = null;
  for (let i = 0; i < room.polygon.length; i += 1) {
    const a = room.polygon[i]!;
    const b = room.polygon[(i + 1) % room.polygon.length]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const d = dist(p, mid);
    // Only mid-edge inserts — skip if closer to a vertex
    const toA = dist(p, a);
    const toB = dist(p, b);
    if (toA <= slopIn || toB <= slopIn) continue;
    if (d <= slopIn && (!best || d < best.d)) best = { i, d };
  }
  return best ? best.i : null;
}

/**
 * @param pixelsPerInch screen pixels per document inch at the current zoom
 */
export function hitTest(
  geometry: FloorGeometry,
  worldPoint: PlanPoint,
  selection: HitSelectionState,
  pixelsPerInch: number,
): HitTarget {
  const ppi = Math.max(pixelsPerInch, 1e-6);
  const slopIn = MIN_HIT_PX / 2 / ppi; // 22px radius → 44px diameter
  const p = worldPoint;
  const {
    selectedRoomId,
    selectedOpeningId,
    selectedStairsId,
    labelSelected,
    reshape,
  } = selection;

  // --- Nothing selected: rooms only (and orphan stairs) ---
  if (!selectedRoomId && !selectedOpeningId && !selectedStairsId) {
    const room = findRoomAtPoint(geometry, p, slopIn, null);
    if (room) return { kind: "room", roomId: room.id };

    for (const stair of geometry.stairs) {
      const poly = stairsPolygon(stair);
      if (
        pointInPolygon(p, [poly]) ||
        distPointToPolyline(p, poly, true) <= slopIn
      ) {
        return { kind: "stairs", stairsId: stair.id };
      }
    }
    return { kind: "pan" };
  }

  // --- Stairs selected (no room): stairs drag / other room / pan ---
  if (selectedStairsId && !selectedRoomId) {
    const stair = geometry.stairs.find((s) => s.id === selectedStairsId);
    if (stair) {
      const poly = stairsPolygon(stair);
      if (
        pointInPolygon(p, [poly]) ||
        distPointToPolyline(p, poly, true) <= slopIn
      ) {
        return { kind: "stairs", stairsId: stair.id };
      }
    }
    const room = findRoomAtPoint(geometry, p, slopIn, null);
    if (room) return { kind: "room", roomId: room.id };
    return { kind: "pan" };
  }

  // --- Opening selected without room parent in state: treat via room ---
  const activeRoomId =
    selectedRoomId ??
    (selectedOpeningId
      ? listOpenings(geometry).find((o) => o.id === selectedOpeningId)?.roomId ??
        null
      : null);

  if (!activeRoomId) {
    const room = findRoomAtPoint(geometry, p, slopIn, null);
    if (room) return { kind: "room", roomId: room.id };
    return { kind: "pan" };
  }

  const selectedRoom = geometry.rooms.find((r) => r.id === activeRoomId);
  if (!selectedRoom) {
    const room = findRoomAtPoint(geometry, p, slopIn, null);
    if (room) return { kind: "room", roomId: room.id };
    return { kind: "pan" };
  }

  const onSelectedRoom =
    roomContainsPoint(selectedRoom, p) ||
    roomEdgeSlop(selectedRoom, p, slopIn);

  const nearVertexIndex = hitVertex(selectedRoom, p, slopIn);

  // 1. Reshape handles (vertices / edge inserts)
  if (reshape && onSelectedRoom) {
    if (nearVertexIndex !== null) {
      return {
        kind: "vertex",
        roomId: selectedRoom.id,
        vertexIndex: nearVertexIndex,
      };
    }
    const ei = hitEdgeInsert(selectedRoom, p, slopIn);
    if (ei !== null) {
      return { kind: "edge-insert", roomId: selectedRoom.id, edgeIndex: ei };
    }
  }

  // When reshape is off, a corner hit is whole-room move — not wall/vertex.
  const cornerBlocksSubelements =
    !reshape && nearVertexIndex !== null && onSelectedRoom;

  // 2. Openings of selected room
  if (!cornerBlocksSubelements && (onSelectedRoom || selectedOpeningId)) {
    let bestOp: { id: string; d: number } | null = null;
    for (const op of listOpenings(geometry)) {
      if (op.roomId !== selectedRoom.id) continue;
      const span = openingWorldSpan(geometry.rooms, op);
      if (!span) continue;
      const d = distPointToSegment(p, span.start, span.end);
      const half = Math.max(slopIn, 2);
      if (d <= half && (!bestOp || d < bestOp.d)) {
        bestOp = { id: op.id, d };
      }
    }
    if (bestOp) {
      return {
        kind: "opening",
        openingId: bestOp.id,
        roomId: selectedRoom.id,
      };
    }
  }

  // 3. Label (only when explicitly selected for move)
  if (labelSelected && onSelectedRoom) {
    if (dist(p, selectedRoom.labelAnchor) <= Math.max(slopIn, 14)) {
      return { kind: "label", roomId: selectedRoom.id };
    }
  }

  // 4. Walls of selected room (skip when on a corner — room move wins).
  //    Exterior centerlines sit outside the floor face, so proximity to the
  //    selected room’s polygon edges also counts; the closest belonging
  //    wall (by centerline) wins.
  if (onSelectedRoom && !cornerBlocksSubelements) {
    let edgeDist = Infinity;
    const poly = selectedRoom.polygon;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      edgeDist = Math.min(edgeDist, distPointToSegment(p, a, b));
    }

    let bestWall: { id: string; d: number; half: number } | null = null;
    for (const wall of geometry.walls) {
      if (!wallBelongsToRoom(wall, selectedRoom.id)) continue;
      const half = Math.max(wall.thickness / 2, slopIn);
      const d = distPointToPolyline(p, wall.centerline, wall.closed);
      if (!bestWall || d < bestWall.d) {
        bestWall = { id: wall.id, d, half };
      }
    }
    if (
      bestWall &&
      (bestWall.d <= bestWall.half || edgeDist <= slopIn)
    ) {
      return {
        kind: "wall",
        wallId: bestWall.id,
        roomId: selectedRoom.id,
      };
    }
  }

  // 5. Stairs overlapping selected room area
  if (onSelectedRoom) {
    for (const stair of geometry.stairs) {
      const poly = stairsPolygon(stair);
      if (
        pointInPolygon(p, [poly]) ||
        distPointToPolyline(p, poly, true) <= slopIn
      ) {
        return { kind: "stairs", stairsId: stair.id };
      }
    }
  }

  // 6. Rooms
  if (onSelectedRoom) {
    return { kind: "room", roomId: selectedRoom.id };
  }

  const other = findRoomAtPoint(geometry, p, slopIn, null);
  if (other) return { kind: "room", roomId: other.id };

  // Orphan stairs outside rooms
  for (const stair of geometry.stairs) {
    const poly = stairsPolygon(stair);
    if (
      pointInPolygon(p, [poly]) ||
      distPointToPolyline(p, poly, true) <= slopIn
    ) {
      return { kind: "stairs", stairsId: stair.id };
    }
  }

  return { kind: "pan" };
}

/** Empty / default selection for hit tests. */
export function emptyHitSelection(): HitSelectionState {
  return {
    selectedRoomId: null,
    selectedWallId: null,
    selectedOpeningId: null,
    selectedStairsId: null,
    labelSelected: false,
    reshape: false,
  };
}
