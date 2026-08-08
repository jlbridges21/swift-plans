/**
 * Resolve openings to world geometry + host wall thickness for rendering.
 */

import type {
  FloorGeometry,
  PlanDoor,
  PlanPoint,
  PlanWall,
  RoomEdgeAnchor,
} from "../../types/plan-geometry.ts";
import { openingWorldSpan } from "./openings.ts";
import { DERIVED_WALL_EXTERIOR, DERIVED_WALL_INTERIOR } from "./derive-walls.ts";

export type ResolvedOpeningGeom = {
  start: PlanPoint;
  end: PlanPoint;
  thickness: number;
  /** Unit along start→end. */
  dir: PlanPoint;
};

/** Find a derived (or hand) wall covering this opening for thickness. */
export function wallForOpening(
  geometry: FloorGeometry,
  anchor: RoomEdgeAnchor,
): PlanWall | null {
  const span = openingWorldSpan(geometry.rooms, anchor);
  if (!span) return null;
  const mid = {
    x: (span.start.x + span.end.x) / 2,
    y: (span.start.y + span.end.y) / 2,
  };

  let best: PlanWall | null = null;
  let bestDist = Infinity;
  for (const wall of geometry.walls) {
    if (
      wall.roomIds.length > 0 &&
      !wall.roomIds.includes(anchor.roomId)
    ) {
      continue;
    }
    if (wall.centerline.length < 2) continue;
    for (let i = 0; i < wall.centerline.length - 1; i += 1) {
      const a = wall.centerline[i];
      const b = wall.centerline[i + 1];
      const ab = { x: b.x - a.x, y: b.y - a.y };
      const lenSq = ab.x * ab.x + ab.y * ab.y || 1;
      const t = Math.max(
        0,
        Math.min(1, ((mid.x - a.x) * ab.x + (mid.y - a.y) * ab.y) / lenSq),
      );
      const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
      const dist = Math.hypot(mid.x - proj.x, mid.y - proj.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = wall;
      }
    }
  }
  return best;
}

export function resolveOpeningGeom(
  geometry: FloorGeometry,
  anchor: RoomEdgeAnchor,
): ResolvedOpeningGeom | null {
  const span = openingWorldSpan(geometry.rooms, anchor);
  if (!span) return null;
  const wall = wallForOpening(geometry, anchor);
  const thickness =
    wall?.thickness ??
    (wall?.kind === "interior"
      ? DERIVED_WALL_INTERIOR
      : DERIVED_WALL_EXTERIOR);
  // Prefer wall thickness; if no wall found use exterior default
  const thick = wall?.thickness ?? DERIVED_WALL_EXTERIOR;
  const dx = span.end.x - span.start.x;
  const dy = span.end.y - span.start.y;
  const len = Math.hypot(dx, dy) || 1;
  void thickness;
  return {
    start: span.start,
    end: span.end,
    thickness: thick,
    dir: { x: dx / len, y: dy / len },
  };
}

export function doorHingeLatchFromAnchor(
  geometry: FloorGeometry,
  door: PlanDoor,
): { hinge: PlanPoint; latch: PlanPoint; thickness: number } | null {
  const geom = resolveOpeningGeom(geometry, door);
  if (!geom) return null;
  if (door.hingeEnd === "start") {
    return {
      hinge: geom.start,
      latch: geom.end,
      thickness: geom.thickness,
    };
  }
  return {
    hinge: geom.end,
    latch: geom.start,
    thickness: geom.thickness,
  };
}
