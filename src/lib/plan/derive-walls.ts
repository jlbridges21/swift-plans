/**
 * Derive walls from room polygons.
 *
 * Rooms are authoritative. Walls are recomputed deterministically from edges.
 * Only axis-aligned (orthogonal) edges participate in shared-wall detection.
 *
 * ---------------------------------------------------------------------------
 * Wall id scheme (STABLE — doors/windows will attach to these ids):
 *
 *   Interior: `wi:{roomIdA}:{roomIdB}:{spanIndex}`
 *     - roomIdA < roomIdB lexicographically
 *     - spanIndex is 0-based among interior spans for this room pair,
 *       ordered by (axis 'h'|'v', constant coordinate, start along edge)
 *
 *   Exterior: `we:{roomId}:{edgeIndex}:{subIndex}`
 *     - edgeIndex is the polygon edge index (vertex i → vertex i+1)
 *     - subIndex is 0-based among exterior remainders on that edge,
 *       ordered from the edge start vertex toward the end vertex
 *
 * Orphan risk for future attachments:
 *   - Deleting a bordering room removes interior ids that included it
 *   - Inserting/removing polygon vertices shifts exterior edgeIndex
 *   - A newly adjoining room that splits an exterior edge shifts subIndex
 *     and may convert a span to interior (id kind changes)
 * ---------------------------------------------------------------------------
 *
 * TODO: Non-orthogonal edges skip overlap detection and stay exterior.
 */

import type {
  PlanPoint,
  PlanRoom,
  PlanWall,
} from "../../types/plan-geometry";

/** Must match planTokens.wallExterior / wallInterior (no runtime import — Node checks). */
export const DERIVED_WALL_EXTERIOR = 6;
export const DERIVED_WALL_INTERIOR = 4.5;

const EPS = 1e-6;
const MIN_LEN = 1e-3;

type Axis = "h" | "v";

type RoomEdge = {
  roomId: string;
  edgeIndex: number;
  a: PlanPoint;
  b: PlanPoint;
  axis: Axis | "diag";
  /** Parameterization along axis: start <= end in document space. */
  t0: number;
  t1: number;
  /** Constant coordinate (y for h, x for v). */
  c: number;
};

type Interval = { t0: number; t1: number; otherRoomId: string };

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

function pointAlong(edge: RoomEdge, t: number): PlanPoint {
  if (edge.axis === "h") {
    return { x: t, y: edge.c };
  }
  return { x: edge.c, y: t };
}

function outwardNormal(a: PlanPoint, b: PlanPoint): PlanPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // CCW polygon: interior is left of a→b; outward is right = (dy, -dx)
  return { x: dy / len, y: -dx / len };
}

function collectEdges(rooms: PlanRoom[]): RoomEdge[] {
  const edges: RoomEdge[] = [];
  for (const room of rooms) {
    const poly = room.polygon;
    const n = poly.length;
    for (let i = 0; i < n; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) < MIN_LEN) continue;

      if (nearlyEqual(dy, 0) && !nearlyEqual(dx, 0)) {
        const t0 = Math.min(a.x, b.x);
        const t1 = Math.max(a.x, b.x);
        edges.push({
          roomId: room.id,
          edgeIndex: i,
          a,
          b,
          axis: "h",
          t0,
          t1,
          c: a.y,
        });
      } else if (nearlyEqual(dx, 0) && !nearlyEqual(dy, 0)) {
        const t0 = Math.min(a.y, b.y);
        const t1 = Math.max(a.y, b.y);
        edges.push({
          roomId: room.id,
          edgeIndex: i,
          a,
          b,
          axis: "v",
          t0,
          t1,
          c: a.x,
        });
      } else {
        // TODO: non-orthogonal — treat as exterior, no overlap detection
        edges.push({
          roomId: room.id,
          edgeIndex: i,
          a,
          b,
          axis: "diag",
          t0: 0,
          t1: Math.hypot(dx, dy),
          c: 0,
        });
      }
    }
  }
  return edges;
}

function overlapInterval(
  a: RoomEdge,
  b: RoomEdge,
): { t0: number; t1: number } | null {
  if (a.axis === "diag" || b.axis === "diag") return null;
  if (a.axis !== b.axis) return null;
  if (!nearlyEqual(a.c, b.c)) return null;
  const t0 = Math.max(a.t0, b.t0);
  const t1 = Math.min(a.t1, b.t1);
  if (t1 - t0 < MIN_LEN) return null;
  return { t0, t1 };
}

/** Subtract covered intervals from [t0,t1]; return remainders sorted. */
function subtractIntervals(
  t0: number,
  t1: number,
  covered: { t0: number; t1: number }[],
): { t0: number; t1: number }[] {
  const sorted = [...covered].sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);
  const out: { t0: number; t1: number }[] = [];
  let cursor = t0;
  for (const iv of sorted) {
    const c0 = Math.max(iv.t0, t0);
    const c1 = Math.min(iv.t1, t1);
    if (c1 <= c0) continue;
    if (c0 - cursor >= MIN_LEN) {
      out.push({ t0: cursor, t1: c0 });
    }
    cursor = Math.max(cursor, c1);
  }
  if (t1 - cursor >= MIN_LEN) {
    out.push({ t0: cursor, t1 });
  }
  return out;
}

function wallLength(centerline: PlanPoint[]): number {
  if (centerline.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < centerline.length - 1; i += 1) {
    total += Math.hypot(
      centerline[i + 1].x - centerline[i].x,
      centerline[i + 1].y - centerline[i].y,
    );
  }
  return total;
}

/**
 * Compute the full wall set for a list of rooms.
 * Interior walls use interior thickness on the shared edge.
 * Exterior walls use exterior thickness; centerline offset outward by half thickness.
 */
export function deriveWallsFromRooms(rooms: PlanRoom[]): PlanWall[] {
  const edges = collectEdges(rooms);
  const ortho = edges.filter((e) => e.axis !== "diag");
  const diag = edges.filter((e) => e.axis === "diag");

  // Interior spans: emit once per room pair (sorted ids)
  type InteriorCand = {
    roomA: string;
    roomB: string;
    axis: Axis;
    c: number;
    t0: number;
    t1: number;
  };
  const interiorCands: InteriorCand[] = [];

  for (let i = 0; i < ortho.length; i += 1) {
    for (let j = i + 1; j < ortho.length; j += 1) {
      const ea = ortho[i];
      const eb = ortho[j];
      if (ea.roomId === eb.roomId) continue;
      const ov = overlapInterval(ea, eb);
      if (!ov) continue;
      const [roomA, roomB] =
        ea.roomId < eb.roomId
          ? [ea.roomId, eb.roomId]
          : [eb.roomId, ea.roomId];
      interiorCands.push({
        roomA,
        roomB,
        axis: ea.axis as Axis,
        c: ea.c,
        t0: ov.t0,
        t1: ov.t1,
      });
    }
  }

  // Dedupe identical spans (same pair/axis/c/t0/t1) — two edges can match once
  const seenInterior = new Set<string>();
  const uniqueInterior: InteriorCand[] = [];
  for (const cand of interiorCands) {
    const key = `${cand.roomA}|${cand.roomB}|${cand.axis}|${cand.c}|${cand.t0}|${cand.t1}`;
    if (seenInterior.has(key)) continue;
    seenInterior.add(key);
    uniqueInterior.push(cand);
  }

  uniqueInterior.sort((a, b) => {
    if (a.roomA !== b.roomA) return a.roomA.localeCompare(b.roomA);
    if (a.roomB !== b.roomB) return a.roomB.localeCompare(b.roomB);
    if (a.axis !== b.axis) return a.axis.localeCompare(b.axis);
    if (a.c !== b.c) return a.c - b.c;
    return a.t0 - b.t0;
  });

  const walls: PlanWall[] = [];
  const pairSpanIndex = new Map<string, number>();

  for (const cand of uniqueInterior) {
    const pairKey = `${cand.roomA}|${cand.roomB}`;
    const spanIndex = pairSpanIndex.get(pairKey) ?? 0;
    pairSpanIndex.set(pairKey, spanIndex + 1);

    const p0 =
      cand.axis === "h"
        ? { x: cand.t0, y: cand.c }
        : { x: cand.c, y: cand.t0 };
    const p1 =
      cand.axis === "h"
        ? { x: cand.t1, y: cand.c }
        : { x: cand.c, y: cand.t1 };

    const centerline = [p0, p1];
    if (wallLength(centerline) < MIN_LEN) continue;

    walls.push({
      id: `wi:${cand.roomA}:${cand.roomB}:${spanIndex}`,
      centerline,
      thickness: DERIVED_WALL_INTERIOR,
      kind: "interior",
      closed: false,
      roomIds: [cand.roomA, cand.roomB],
    });
  }

  // Cover map per edge for exterior remainders
  const coverByEdge = new Map<string, Interval[]>();
  const edgeKey = (e: RoomEdge) => `${e.roomId}:${e.edgeIndex}`;

  for (const ea of ortho) {
    for (const eb of ortho) {
      if (ea.roomId === eb.roomId) continue;
      const ov = overlapInterval(ea, eb);
      if (!ov) continue;
      const list = coverByEdge.get(edgeKey(ea)) ?? [];
      list.push({ t0: ov.t0, t1: ov.t1, otherRoomId: eb.roomId });
      coverByEdge.set(edgeKey(ea), list);
    }
  }

  const halfExt = DERIVED_WALL_EXTERIOR / 2;

  for (const edge of ortho) {
    const covered = (coverByEdge.get(edgeKey(edge)) ?? []).map((iv) => ({
      t0: iv.t0,
      t1: iv.t1,
    }));
    const remainders = subtractIntervals(edge.t0, edge.t1, covered);
    remainders.forEach((rem, subIndex) => {
      // Build segment in polygon edge direction for consistent outward normal
      const alongStart = pointAlong(edge, rem.t0);
      const alongEnd = pointAlong(edge, rem.t1);
      // Orient from edge.a toward edge.b
      const edgeDirPositive =
        edge.axis === "h"
          ? edge.b.x >= edge.a.x
          : edge.b.y >= edge.a.y;
      const rawA = edgeDirPositive ? alongStart : alongEnd;
      const rawB = edgeDirPositive ? alongEnd : alongStart;
      const n = outwardNormal(edge.a, edge.b);
      const centerline: PlanPoint[] = [
        { x: rawA.x + n.x * halfExt, y: rawA.y + n.y * halfExt },
        { x: rawB.x + n.x * halfExt, y: rawB.y + n.y * halfExt },
      ];
      if (wallLength(centerline) < MIN_LEN) return;

      walls.push({
        id: `we:${edge.roomId}:${edge.edgeIndex}:${subIndex}`,
        centerline,
        thickness: DERIVED_WALL_EXTERIOR,
        kind: "exterior",
        closed: false,
        roomIds: [edge.roomId],
      });
    });
  }

  // Non-orthogonal: full edge as exterior (no split)
  for (const edge of diag) {
    const n = outwardNormal(edge.a, edge.b);
    const centerline: PlanPoint[] = [
      { x: edge.a.x + n.x * halfExt, y: edge.a.y + n.y * halfExt },
      { x: edge.b.x + n.x * halfExt, y: edge.b.y + n.y * halfExt },
    ];
    if (wallLength(centerline) < MIN_LEN) continue;
    walls.push({
      id: `we:${edge.roomId}:${edge.edgeIndex}:0`,
      centerline,
      thickness: DERIVED_WALL_EXTERIOR,
      kind: "exterior",
      closed: false,
      roomIds: [edge.roomId],
    });
  }

  return walls;
}

/** Parse an exterior wall id into room/edge/sub indices. */
export function parseExteriorWallId(
  id: string,
): { roomId: string; edgeIndex: number; subIndex: number } | null {
  // we:{roomId}:{edgeIndex}:{subIndex} — roomId may contain colons (uuid does not)
  if (!id.startsWith("we:")) return null;
  const parts = id.split(":");
  if (parts.length < 4) return null;
  const subIndex = Number(parts[parts.length - 1]);
  const edgeIndex = Number(parts[parts.length - 2]);
  const roomId = parts.slice(1, -2).join(":");
  if (!roomId || !Number.isFinite(edgeIndex) || !Number.isFinite(subIndex)) {
    return null;
  }
  return { roomId, edgeIndex, subIndex };
}

/**
 * Floor-edge segment (inside face) for an exterior wall, before thickness offset.
 * Used by "Add Room Here" so the new room shares exact coordinates.
 */
export function exteriorWallFloorSpan(
  rooms: PlanRoom[],
  wallId: string,
): {
  roomId: string;
  a: PlanPoint;
  b: PlanPoint;
  outward: PlanPoint;
  length: number;
} | null {
  const parsed = parseExteriorWallId(wallId);
  if (!parsed) return null;
  const room = rooms.find((r) => r.id === parsed.roomId);
  if (!room) return null;
  const poly = room.polygon;
  if (parsed.edgeIndex < 0 || parsed.edgeIndex >= poly.length) return null;

  const a = poly[parsed.edgeIndex];
  const b = poly[(parsed.edgeIndex + 1) % poly.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const isH = nearlyEqual(dy, 0) && !nearlyEqual(dx, 0);
  const isV = nearlyEqual(dx, 0) && !nearlyEqual(dy, 0);
  if (!isH && !isV) {
    // Diagonal: whole edge is the span
    const len = Math.hypot(dx, dy);
    return {
      roomId: room.id,
      a: { ...a },
      b: { ...b },
      outward: outwardNormal(a, b),
      length: len,
    };
  }

  const edge: RoomEdge = isH
    ? {
        roomId: room.id,
        edgeIndex: parsed.edgeIndex,
        a,
        b,
        axis: "h",
        t0: Math.min(a.x, b.x),
        t1: Math.max(a.x, b.x),
        c: a.y,
      }
    : {
        roomId: room.id,
        edgeIndex: parsed.edgeIndex,
        a,
        b,
        axis: "v",
        t0: Math.min(a.y, b.y),
        t1: Math.max(a.y, b.y),
        c: a.x,
      };

  // Recompute cover on this edge only
  const all = collectEdges(rooms).filter((e) => e.axis !== "diag");
  const covered: { t0: number; t1: number }[] = [];
  for (const other of all) {
    if (other.roomId === edge.roomId) continue;
    const ov = overlapInterval(edge, other);
    if (ov) covered.push(ov);
  }
  const remainders = subtractIntervals(edge.t0, edge.t1, covered);
  const rem = remainders[parsed.subIndex];
  if (!rem) return null;

  const edgeDirPositive = isH ? b.x >= a.x : b.y >= a.y;
  const alongStart = pointAlong(edge, rem.t0);
  const alongEnd = pointAlong(edge, rem.t1);
  const rawA = edgeDirPositive ? alongStart : alongEnd;
  const rawB = edgeDirPositive ? alongEnd : alongStart;
  return {
    roomId: room.id,
    a: rawA,
    b: rawB,
    outward: outwardNormal(a, b),
    length: Math.hypot(rawB.x - rawA.x, rawB.y - rawA.y),
  };
}
