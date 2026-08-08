/**
 * Snap a dragged room so edges/corners meet other rooms with exact coincidence.
 *
 * Threshold is specified in SCREEN pixels and converted to document inches by
 * the caller (thresholdIn = px * viewBoxWidth / viewportWidthPx) so snap feel
 * stays consistent across zoom levels.
 */

import type { FloorGeometry, PlanPoint, PlanRoom } from "../../types/plan-geometry.ts";
import { stairsPolygon } from "./stairs.ts";

/**
 * Screen-space snap distance in CSS pixels.
 * Increase for “stickier” snap; decrease for finer control.
 */
export const ROOM_SNAP_THRESHOLD_PX = 12;

export type SnapGuide =
  | { kind: "x"; x: number }
  | { kind: "y"; y: number };

type Seg = { a: PlanPoint; b: PlanPoint; axis: "h" | "v" };

function roomSegments(room: PlanRoom, dx = 0, dy = 0): Seg[] {
  const poly = room.polygon;
  const segs: Seg[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = { x: poly[i].x + dx, y: poly[i].y + dy };
    const b = {
      x: poly[(i + 1) % poly.length].x + dx,
      y: poly[(i + 1) % poly.length].y + dy,
    };
    if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) >= 1e-6) {
      segs.push({ a, b, axis: "h" });
    } else if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) >= 1e-6) {
      segs.push({ a, b, axis: "v" });
    }
  }
  return segs;
}

function polySegments(poly: PlanPoint[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) >= 1e-6) {
      segs.push({ a, b, axis: "h" });
    } else if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) >= 1e-6) {
      segs.push({ a, b, axis: "v" });
    }
  }
  return segs;
}

function roomCorners(room: PlanRoom, dx = 0, dy = 0): PlanPoint[] {
  return room.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function intervalsOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  const loA = Math.min(a0, a1);
  const hiA = Math.max(a0, a1);
  const loB = Math.min(b0, b1);
  const hiB = Math.max(b0, b1);
  return Math.min(hiA, hiB) - Math.max(loA, loB) > 1e-6;
}

function snapSegmentsToRooms(
  movingSegs: Seg[],
  movingCorners: PlanPoint[],
  otherRooms: PlanRoom[],
  dx: number,
  dy: number,
  thresholdIn: number,
): { dx: number; dy: number; guides: SnapGuide[] } {
  if (otherRooms.length === 0 || thresholdIn <= 0) {
    return { dx, dy, guides: [] };
  }
  const otherSegs = otherRooms.flatMap((r) => roomSegments(r));
  const otherCorners = otherRooms.flatMap((r) => roomCorners(r));

  let bestDx = dx;
  let bestDy = dy;
  let bestXScore = thresholdIn;
  let bestYScore = thresholdIn;
  const guides: SnapGuide[] = [];
  let snapX: number | null = null;
  let snapY: number | null = null;

  for (const ms of movingSegs) {
    for (const os of otherSegs) {
      if (ms.axis !== os.axis) continue;
      if (ms.axis === "h") {
        const gap = os.a.y - ms.a.y;
        if (Math.abs(gap) < bestYScore) {
          const m0 = Math.min(ms.a.x, ms.b.x);
          const m1 = Math.max(ms.a.x, ms.b.x);
          const o0 = Math.min(os.a.x, os.b.x);
          const o1 = Math.max(os.a.x, os.b.x);
          if (
            intervalsOverlap(m0, m1, o0, o1) ||
            Math.abs(m1 - o0) < thresholdIn ||
            Math.abs(o1 - m0) < thresholdIn
          ) {
            bestYScore = Math.abs(gap);
            bestDy = dy + gap;
            snapY = os.a.y;
          }
        }
      } else {
        const gap = os.a.x - ms.a.x;
        if (Math.abs(gap) < bestXScore) {
          const m0 = Math.min(ms.a.y, ms.b.y);
          const m1 = Math.max(ms.a.y, ms.b.y);
          const o0 = Math.min(os.a.y, os.b.y);
          const o1 = Math.max(os.a.y, os.b.y);
          if (
            intervalsOverlap(m0, m1, o0, o1) ||
            Math.abs(m1 - o0) < thresholdIn ||
            Math.abs(o1 - m0) < thresholdIn
          ) {
            bestXScore = Math.abs(gap);
            bestDx = dx + gap;
            snapX = os.a.x;
          }
        }
      }
    }
  }

  for (const mc of movingCorners) {
    for (const oc of otherCorners) {
      const gx = oc.x - mc.x;
      const gy = oc.y - mc.y;
      if (Math.abs(gx) < bestXScore) {
        bestXScore = Math.abs(gx);
        bestDx = dx + gx;
        snapX = oc.x;
      }
      if (Math.abs(gy) < bestYScore) {
        bestYScore = Math.abs(gy);
        bestDy = dy + gy;
        snapY = oc.y;
      }
    }
  }

  if (snapX !== null && bestXScore < thresholdIn) {
    guides.push({ kind: "x", x: snapX });
  } else {
    bestDx = dx;
  }
  if (snapY !== null && bestYScore < thresholdIn) {
    guides.push({ kind: "y", y: snapY });
  } else {
    bestDy = dy;
  }

  return { dx: bestDx, dy: bestDy, guides };
}

/**
 * Given a proposed translation, return a snapped translation and overlay guides.
 * Snapped coordinates are exact (no residual gap).
 */
export function snapRoomTranslation(
  geometry: FloorGeometry,
  roomId: string,
  dx: number,
  dy: number,
  thresholdIn: number,
): { dx: number; dy: number; guides: SnapGuide[] } {
  const room = geometry.rooms.find((r) => r.id === roomId);
  if (!room || thresholdIn <= 0) {
    return { dx, dy, guides: [] };
  }
  const others = geometry.rooms.filter((r) => r.id !== roomId);
  return snapSegmentsToRooms(
    roomSegments(room, dx, dy),
    roomCorners(room, dx, dy),
    others,
    dx,
    dy,
    thresholdIn,
  );
}

/** Snap stairs footprint edges/corners to nearby room edges. */
export function snapStairsTranslation(
  geometry: FloorGeometry,
  stairsId: string,
  dx: number,
  dy: number,
  thresholdIn: number,
): { dx: number; dy: number; guides: SnapGuide[] } {
  const stair = geometry.stairs.find((s) => s.id === stairsId);
  if (!stair || thresholdIn <= 0) {
    return { dx, dy, guides: [] };
  }
  const moved = {
    ...stair,
    origin: { x: stair.origin.x + dx, y: stair.origin.y + dy },
  };
  const poly = stairsPolygon(moved);
  return snapSegmentsToRooms(
    polySegments(poly),
    poly,
    geometry.rooms,
    dx,
    dy,
    thresholdIn,
  );
}
