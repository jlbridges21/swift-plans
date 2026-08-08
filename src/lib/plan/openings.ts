/**
 * Room-edge opening helpers: resolve, clamp, overlap push.
 * Relative-import friendly (type-only from plan-geometry).
 */

import type {
  FloorGeometry,
  PlanDoor,
  PlanOpening,
  PlanPoint,
  PlanRoom,
  PlanWindow,
  RoomEdgeAnchor,
} from "../../types/plan-geometry";

/** Minimum opening width kept after clamp; below this the opening is removed. */
export const MIN_OPENING_WIDTH_IN = 12;

const EPS = 1e-6;

export type ResolvedEdge = {
  a: PlanPoint;
  b: PlanPoint;
  length: number;
  /** Unit direction a → b. */
  dir: PlanPoint;
  /** Outward normal for CCW polygon. */
  outward: PlanPoint;
  /** Inward (into room) = -outward. */
  inward: PlanPoint;
};

export type AnyOpening =
  | (PlanDoor & { kind: "door" })
  | (PlanWindow & { kind: "window" })
  | (PlanOpening & { kind: "opening" });

export function roomEdge(
  room: PlanRoom,
  edgeIndex: number,
): ResolvedEdge | null {
  const poly = room.polygon;
  if (edgeIndex < 0 || edgeIndex >= poly.length) return null;
  const a = poly[edgeIndex];
  const b = poly[(edgeIndex + 1) % poly.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < EPS) return null;
  const dir = { x: dx / length, y: dy / length };
  // CCW: outward is right of a→b
  const outward = { x: dir.y, y: -dir.x };
  return {
    a: { ...a },
    b: { ...b },
    length,
    dir,
    outward,
    inward: { x: -outward.x, y: -outward.y },
  };
}

export function pointAlongEdge(
  edge: ResolvedEdge,
  dist: number,
): PlanPoint {
  return {
    x: edge.a.x + edge.dir.x * dist,
    y: edge.a.y + edge.dir.y * dist,
  };
}

/** World-space start/end of an opening on its room edge. */
export function openingWorldSpan(
  rooms: PlanRoom[],
  anchor: RoomEdgeAnchor,
): { start: PlanPoint; end: PlanPoint; edge: ResolvedEdge } | null {
  const room = rooms.find((r) => r.id === anchor.roomId);
  if (!room) return null;
  const edge = roomEdge(room, anchor.edgeIndex);
  if (!edge) return null;
  const start = pointAlongEdge(edge, anchor.offsetIn);
  const end = pointAlongEdge(edge, anchor.offsetIn + anchor.widthIn);
  return { start, end, edge };
}

export function listOpenings(geometry: FloorGeometry): AnyOpening[] {
  return [
    ...geometry.doors.map((d) => ({ ...d, kind: "door" as const })),
    ...geometry.windows.map((w) => ({ ...w, kind: "window" as const })),
    ...geometry.openings.map((o) => ({ ...o, kind: "opening" as const })),
  ];
}

function clampOne(
  anchor: RoomEdgeAnchor,
  edgeLen: number,
): RoomEdgeAnchor | null {
  if (edgeLen < MIN_OPENING_WIDTH_IN) return null;
  let width = anchor.widthIn;
  if (width > edgeLen) width = edgeLen;
  if (width < MIN_OPENING_WIDTH_IN) return null;
  let offset = anchor.offsetIn;
  if (offset < 0) offset = 0;
  if (offset + width > edgeLen) offset = edgeLen - width;
  if (offset < 0) return null;
  return { ...anchor, offsetIn: offset, widthIn: width };
}

/**
 * Clamp openings to their edges after resize. Removes openings that cannot fit.
 */
export function clampOpeningsInGeometry(
  geometry: FloorGeometry,
): FloorGeometry {
  const roomsById = new Map(geometry.rooms.map((r) => [r.id, r]));

  const clampList = <T extends RoomEdgeAnchor>(items: T[]): T[] => {
    const out: T[] = [];
    for (const item of items) {
      const room = roomsById.get(item.roomId);
      if (!room) continue;
      const edge = roomEdge(room, item.edgeIndex);
      if (!edge) continue;
      const next = clampOne(item, edge.length);
      if (next) out.push({ ...item, ...next });
    }
    return out;
  };

  return {
    ...geometry,
    doors: clampList(geometry.doors),
    windows: clampList(geometry.windows),
    openings: clampList(geometry.openings),
  };
}

/** Openings on the same room edge, excluding `excludeId`. */
export function openingsOnSameEdge(
  geometry: FloorGeometry,
  roomId: string,
  edgeIndex: number,
  excludeId?: string,
): RoomEdgeAnchor[] {
  return listOpenings(geometry)
    .filter(
      (o) =>
        o.roomId === roomId &&
        o.edgeIndex === edgeIndex &&
        o.id !== excludeId,
    )
    .map(({ roomId: r, edgeIndex: e, offsetIn, widthIn }) => ({
      roomId: r,
      edgeIndex: e,
      offsetIn,
      widthIn,
    }));
}

function intervalsOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  return Math.min(a1, b1) - Math.max(a0, b0) > EPS;
}

/**
 * Push `offsetIn` so [offset, offset+width] does not overlap siblings.
 * Prefers the nearest valid slot; returns null if none fits.
 */
export function pushOffsetClearOfOverlaps(
  offsetIn: number,
  widthIn: number,
  edgeLen: number,
  others: RoomEdgeAnchor[],
): number | null {
  if (widthIn > edgeLen + EPS) return null;
  const sorted = [...others].sort((a, b) => a.offsetIn - b.offsetIn);

  const fits = (off: number) => {
    if (off < -EPS || off + widthIn > edgeLen + EPS) return false;
    for (const o of sorted) {
      if (
        intervalsOverlap(off, off + widthIn, o.offsetIn, o.offsetIn + o.widthIn)
      ) {
        return false;
      }
    }
    return true;
  };

  const clamped = Math.max(0, Math.min(offsetIn, edgeLen - widthIn));
  if (fits(clamped)) return clamped;

  // Candidate slots: 0, just after each other, just before each other
  const candidates: number[] = [0, edgeLen - widthIn];
  for (const o of sorted) {
    candidates.push(o.offsetIn + o.widthIn);
    candidates.push(o.offsetIn - widthIn);
  }

  let best: number | null = null;
  let bestDist = Infinity;
  for (const raw of candidates) {
    const off = Math.max(0, Math.min(raw, edgeLen - widthIn));
    if (!fits(off)) continue;
    const dist = Math.abs(off - clamped);
    if (dist < bestDist) {
      bestDist = dist;
      best = off;
    }
  }
  return best;
}

export function newOpeningId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}`;
}
