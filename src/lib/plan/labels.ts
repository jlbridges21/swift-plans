/**
 * Room label position helpers (document inches).
 */

import type { PlanPoint, PlanRoom } from "../../types/plan-geometry";
import { planTokens } from "../plan-style/tokens";

export function roomCentroid(room: PlanRoom): PlanPoint {
  const poly = room.polygon;
  if (poly.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
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
  return roomCentroid(room);
}

/**
 * Rough uppercase text width in document inches for plan SVG labels.
 * Tuned for PLAN_FONT_FAMILY at typical label sizes — not exact metrics.
 */
export function estimateLabelTextWidth(text: string, fontSize: number): number {
  // letter-spacing on names is ~0.1em; treat average advance as ~0.62em
  return text.length * fontSize * 0.62;
}
