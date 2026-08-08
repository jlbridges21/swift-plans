/**
 * Shared-wall derivation fixtures.
 * Run via check-plan-geometry.ts (relative imports only).
 */

import {
  DERIVED_WALL_EXTERIOR,
  DERIVED_WALL_INTERIOR,
  deriveWallsFromRooms,
} from "../src/lib/plan/derive-walls.ts";
import { planTokens } from "../src/lib/plan-style/tokens.ts";
import type { PlanRoom, PlanWall } from "../src/types/plan-geometry.ts";

export function rectRoom(
  id: string,
  x: number,
  y: number,
  w: number,
  d: number,
): PlanRoom {
  return {
    id,
    name: id,
    type: "living_room",
    category: "living",
    polygon: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + d },
      { x, y: y + d },
    ],
    labelAnchor: { x: x + w / 2, y: y + d / 2 },
  };
}

export function wallsFor(rooms: PlanRoom[]): PlanWall[] {
  return deriveWallsFromRooms(rooms);
}

export function wallLen(wall: PlanWall): number {
  if (wall.centerline.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < wall.centerline.length - 1; i += 1) {
    const a = wall.centerline[i];
    const b = wall.centerline[i + 1];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export {
  DERIVED_WALL_EXTERIOR,
  DERIVED_WALL_INTERIOR,
  deriveWallsFromRooms,
  planTokens,
};
