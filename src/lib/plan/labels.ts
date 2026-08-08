/**
 * Room label position helpers (document inches).
 */

import {
  pointInPolygon,
  polygonCentroid,
} from "../../components/plan/geometry.ts";
import type { PlanPoint, PlanRoom } from "../../types/plan-geometry.ts";
import { planTokens } from "../plan-style/tokens.ts";

export function roomCentroid(room: PlanRoom): PlanPoint {
  return polygonCentroid(room.polygon);
}

export function roomAabb(room: PlanRoom): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of room.polygon) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function distToEdges(point: PlanPoint, poly: PlanPoint[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    // Distance to axis-aligned segment
    if (Math.abs(a.y - b.y) < 1e-6) {
      const xLo = Math.min(a.x, b.x);
      const xHi = Math.max(a.x, b.x);
      const cx = Math.min(xHi, Math.max(xLo, point.x));
      min = Math.min(min, Math.hypot(point.x - cx, point.y - a.y));
    } else if (Math.abs(a.x - b.x) < 1e-6) {
      const yLo = Math.min(a.y, b.y);
      const yHi = Math.max(a.y, b.y);
      const cy = Math.min(yHi, Math.max(yLo, point.y));
      min = Math.min(min, Math.hypot(point.x - a.x, point.y - cy));
    }
  }
  return min;
}

/**
 * Point guaranteed inside the polygon for label placement.
 * Prefer centroid when inside; otherwise scan a coarse grid and pick the
 * interior sample furthest from any edge.
 */
export function interiorLabelPoint(poly: PlanPoint[]): PlanPoint {
  if (poly.length === 0) return { x: 0, y: 0 };
  const c = polygonCentroid(poly);
  if (pointInPolygon(c, [poly])) return c;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const steps = 12;
  let best: PlanPoint = c;
  let bestScore = -1;
  for (let iy = 0; iy <= steps; iy += 1) {
    for (let ix = 0; ix <= steps; ix += 1) {
      const p = {
        x: minX + ((maxX - minX) * ix) / steps,
        y: minY + ((maxY - minY) * iy) / steps,
      };
      if (!pointInPolygon(p, [poly])) continue;
      const score = distToEdges(p, poly);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  return best;
}

/** Clamp a label anchor so it stays near the room. */
export function clampLabelAnchor(
  room: PlanRoom,
  anchor: PlanPoint,
): PlanPoint {
  const box = roomAabb(room);
  const pad = planTokens.labelDragMaxOutsetIn;
  return {
    x: Math.min(box.maxX + pad, Math.max(box.minX - pad, anchor.x)),
    y: Math.min(box.maxY + pad, Math.max(box.minY - pad, anchor.y)),
  };
}

export function defaultLabelAnchor(room: PlanRoom): PlanPoint {
  return interiorLabelPoint(room.polygon);
}

/**
 * Rough uppercase text width in document inches for plan SVG labels.
 * Tuned for PLAN_FONT_FAMILY at typical label sizes — not exact metrics.
 */
export function estimateLabelTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.62;
}
