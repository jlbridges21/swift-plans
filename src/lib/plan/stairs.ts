/**
 * Stairs footprint helpers.
 */

import type {
  PlanPoint,
  PlanStairs,
  StairRotationDeg,
} from "../../types/plan-geometry";

/** Compute the 4-corner polygon for a stair (CCW), applying rotation about origin. */
export function stairsPolygon(stairs: PlanStairs): PlanPoint[] {
  const { origin, widthIn, depthIn, rotationDeg } = stairs;
  const local: PlanPoint[] = [
    { x: 0, y: 0 },
    { x: widthIn, y: 0 },
    { x: widthIn, y: depthIn },
    { x: 0, y: depthIn },
  ];
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return local.map((p) => ({
    x: origin.x + p.x * cos - p.y * sin,
    y: origin.y + p.x * sin + p.y * cos,
  }));
}

/** Unit direction of ascent in plan space (along +depth before rotation). */
export function stairsDirectionVector(stairs: PlanStairs): PlanPoint {
  const rad = (stairs.rotationDeg * Math.PI) / 180;
  // Local "up the run" is +Y (depth)
  return {
    x: -Math.sin(rad),
    y: Math.cos(rad),
  };
}

export function nextStairRotation(
  current: StairRotationDeg,
): StairRotationDeg {
  const next = (current + 90) % 360;
  return next as StairRotationDeg;
}

export function newStairsId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `stairs-${crypto.randomUUID()}`
    : `stairs-${Date.now()}`;
}
