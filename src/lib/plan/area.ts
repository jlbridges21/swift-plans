import {
  polygonAreaSqIn,
  sqInToSqFt,
} from "@/components/plan/geometry";
import type { FloorGeometry } from "@/types/plan-geometry";
import { countsTowardLivingArea, normalizeRoomType } from "@/lib/plan/room-types";

/**
 * Living area in sq ft. Excludes garage, porch, patio, and deck
 * (see countsTowardLivingArea in room-types.ts). Returns null when there
 * are no rooms so the dashboard can show an em dash.
 */
export function livingAreaSqFt(geometry: FloorGeometry): number | null {
  if (geometry.rooms.length === 0) {
    return null;
  }
  return geometry.rooms
    .filter((room) => countsTowardLivingArea(normalizeRoomType(room.type)))
    .reduce((sum, room) => sum + sqInToSqFt(polygonAreaSqIn(room.polygon)), 0);
}
