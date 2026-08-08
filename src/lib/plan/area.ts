import {
  polygonAreaSqIn,
  sqInToSqFt,
} from "@/components/plan/geometry";
import type { FloorGeometry } from "@/types/plan-geometry";

/**
 * Living area in sq ft (excludes garage). Returns null when there are no rooms
 * so the dashboard can show an em dash.
 */
export function livingAreaSqFt(geometry: FloorGeometry): number | null {
  if (geometry.rooms.length === 0) {
    return null;
  }
  return geometry.rooms
    .filter((room) => room.type !== "garage")
    .reduce((sum, room) => sum + sqInToSqFt(polygonAreaSqIn(room.polygon)), 0);
}
