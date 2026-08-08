/**
 * Axis-aligned polygon editing + opening remaps when vertices change.
 * Relative imports use .ts extensions for node --experimental-strip-types.
 */

import {
  pointInPolygon,
  polygonAreaSqIn,
} from "../../components/plan/geometry.ts";
import type {
  FloorGeometry,
  PlanDoor,
  PlanOpening,
  PlanPoint,
  PlanRoom,
  PlanWindow,
  RoomEdgeAnchor,
} from "../../types/plan-geometry.ts";
import { interiorLabelPoint } from "./labels.ts";
import { clampOpeningToEdge, roomEdge } from "./openings.ts";

const EPS = 1e-6;
const MIN_EDGE_IN = 1;
const MIN_AREA_SQ_IN = 1;

function nearly(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

function copyPoly(poly: PlanPoint[]): PlanPoint[] {
  return poly.map((p) => ({ x: p.x, y: p.y }));
}

/** True when every edge is horizontal or vertical. */
export function isAxisAlignedPolygon(poly: PlanPoint[]): boolean {
  if (poly.length < 4) return false;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const h = nearly(a.y, b.y) && !nearly(a.x, b.x);
    const v = nearly(a.x, b.x) && !nearly(a.y, b.y);
    if (!h && !v) return false;
  }
  return true;
}

function segmentsProperIntersect(
  a1: PlanPoint,
  a2: PlanPoint,
  b1: PlanPoint,
  b2: PlanPoint,
): boolean {
  // Ortho-only intersection (proper overlap of interiors)
  const aH = nearly(a1.y, a2.y);
  const bH = nearly(b1.y, b2.y);
  if (aH === bH) {
    // Parallel — treat colinear overlap as intersection if ranges overlap interior
    if (aH) {
      if (!nearly(a1.y, b1.y)) return false;
      const a0 = Math.min(a1.x, a2.x);
      const a1x = Math.max(a1.x, a2.x);
      const b0 = Math.min(b1.x, b2.x);
      const b1x = Math.max(b1.x, b2.x);
      return Math.min(a1x, b1x) - Math.max(a0, b0) > EPS;
    }
    if (!nearly(a1.x, b1.x)) return false;
    const a0 = Math.min(a1.y, a2.y);
    const a1y = Math.max(a1.y, a2.y);
    const b0 = Math.min(b1.y, b2.y);
    const b1y = Math.max(b1.y, b2.y);
    return Math.min(a1y, b1y) - Math.max(a0, b0) > EPS;
  }
  // One H one V — crossing
  const h1 = aH ? a1 : b1;
  const h2 = aH ? a2 : b2;
  const v1 = aH ? b1 : a1;
  const v2 = aH ? b2 : a2;
  const y = h1.y;
  const x = v1.x;
  const xLo = Math.min(h1.x, h2.x);
  const xHi = Math.max(h1.x, h2.x);
  const yLo = Math.min(v1.y, v2.y);
  const yHi = Math.max(v1.y, v2.y);
  return x > xLo + EPS && x < xHi - EPS && y > yLo + EPS && y < yHi - EPS;
}

export function polygonSelfIntersects(poly: PlanPoint[]): boolean {
  const n = poly.length;
  if (n < 4) return true;
  for (let i = 0; i < n; i += 1) {
    const a1 = poly[i]!;
    const a2 = poly[(i + 1) % n]!;
    for (let j = i + 1; j < n; j += 1) {
      // Skip adjacent edges and the same edge
      if (j === i) continue;
      if (j === (i + 1) % n || i === (j + 1) % n) continue;
      // Also skip the closing adjacency when i=0 and j=n-1
      if ((i === 0 && j === n - 1) || (j === 0 && i === n - 1)) continue;
      const b1 = poly[j]!;
      const b2 = poly[(j + 1) % n]!;
      if (segmentsProperIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

export function isValidRoomPolygon(poly: PlanPoint[]): boolean {
  if (poly.length < 4) return false;
  if (!isAxisAlignedPolygon(poly)) return false;
  if (polygonAreaSqIn(poly) < MIN_AREA_SQ_IN) return false;
  if (polygonSelfIntersects(poly)) return false;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_EDGE_IN) return false;
  }
  return true;
}

/**
 * Move vertex `index` to (x,y), adjusting neighbours so both incident edges
 * stay axis-aligned.
 */
export function moveOrthoVertex(
  poly: PlanPoint[],
  index: number,
  x: number,
  y: number,
): PlanPoint[] | null {
  const n = poly.length;
  if (index < 0 || index >= n) return null;
  const prev = (index - 1 + n) % n;
  const next = (index + 1) % n;
  const out = copyPoly(poly);
  const cur = poly[index]!;
  const pPrev = poly[prev]!;
  const pNext = poly[next]!;

  out[index] = { x, y };

  // Keep prev→index edge ortho
  if (nearly(pPrev.y, cur.y)) {
    out[prev] = { x: pPrev.x, y };
  } else {
    out[prev] = { x, y: pPrev.y };
  }

  // Keep index→next edge ortho
  if (nearly(pNext.y, cur.y)) {
    out[next] = { x: pNext.x, y };
  } else {
    out[next] = { x, y: pNext.y };
  }

  if (!isValidRoomPolygon(out)) return null;
  return out;
}

/** Insert a vertex on edge `edgeIndex` at parametric distance `offsetIn`. */
export function insertOrthoVertex(
  poly: PlanPoint[],
  edgeIndex: number,
  offsetIn: number,
): { polygon: PlanPoint[]; newVertexIndex: number } | null {
  const n = poly.length;
  if (edgeIndex < 0 || edgeIndex >= n) return null;
  const a = poly[edgeIndex]!;
  const b = poly[(edgeIndex + 1) % n]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < MIN_EDGE_IN * 2) return null;
  const t = Math.min(len - MIN_EDGE_IN, Math.max(MIN_EDGE_IN, offsetIn));
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const p = { x: a.x + ux * t, y: a.y + uy * t };
  // Snap to exact axis
  if (nearly(a.y, b.y)) p.y = a.y;
  else p.x = a.x;

  const polygon = [
    ...poly.slice(0, edgeIndex + 1),
    p,
    ...poly.slice(edgeIndex + 1),
  ];
  if (!isValidRoomPolygon(polygon)) return null;
  return { polygon, newVertexIndex: edgeIndex + 1 };
}

export function deleteOrthoVertex(
  poly: PlanPoint[],
  index: number,
): PlanPoint[] | null {
  if (poly.length <= 4) return null;
  const n = poly.length;
  if (index < 0 || index >= n) return null;
  // After deletion, prev and next must form an ortho edge — may need to
  // project so they share x or y.
  const out = poly.filter((_, i) => i !== index);
  let pIdx: number;
  let nIdx: number;
  if (index === 0) {
    pIdx = out.length - 1;
    nIdx = 0;
  } else {
    pIdx = index - 1;
    nIdx = index % out.length;
  }
  const A = out[pIdx]!;
  const B = out[nIdx]!;
  if (!nearly(A.x, B.x) && !nearly(A.y, B.y)) {
    // Force ortho: align B.x to A.x (vertical) — may break; try both
    const tryV = copyPoly(out);
    tryV[nIdx] = { x: A.x, y: B.y };
    if (isValidRoomPolygon(tryV)) return tryV;
    const tryH = copyPoly(out);
    tryH[nIdx] = { x: B.x, y: A.y };
    if (isValidRoomPolygon(tryH)) return tryH;
    return null;
  }
  if (!isValidRoomPolygon(out)) return null;
  return out;
}

type OpeningLike = RoomEdgeAnchor & { id: string };

function remapOpeningsOnInsert<T extends OpeningLike>(
  openings: T[],
  roomId: string,
  edgeIndex: number,
  splitAt: number,
  oldEdgeLen: number,
): T[] {
  const result: T[] = [];
  for (const op of openings) {
    if (op.roomId !== roomId) {
      result.push(op);
      continue;
    }
    if (op.edgeIndex < edgeIndex) {
      result.push(op);
      continue;
    }
    if (op.edgeIndex > edgeIndex) {
      result.push({ ...op, edgeIndex: op.edgeIndex + 1 });
      continue;
    }
    // On split edge: opening start at offsetIn
    const start = op.offsetIn;
    const end = op.offsetIn + op.widthIn;
    if (end <= splitAt + EPS) {
      // Entirely on first half
      result.push(op);
    } else if (start >= splitAt - EPS) {
      // Entirely on second half
      result.push({
        ...op,
        edgeIndex: edgeIndex + 1,
        offsetIn: start - splitAt,
      });
    } else {
      // Straddles split — keep on the half with more of the opening
      const onFirst = splitAt - start;
      const onSecond = end - splitAt;
      if (onFirst >= onSecond) {
        result.push({
          ...op,
          widthIn: Math.max(MIN_EDGE_IN, onFirst),
        });
      } else {
        result.push({
          ...op,
          edgeIndex: edgeIndex + 1,
          offsetIn: 0,
          widthIn: Math.max(MIN_EDGE_IN, onSecond),
        });
      }
    }
    void oldEdgeLen;
  }
  return result;
}

function remapOpeningsOnDelete<T extends OpeningLike>(
  openings: T[],
  roomId: string,
  deletedVertex: number,
  polyBefore: PlanPoint[],
): T[] {
  const n = polyBefore.length;
  const prevEdge = (deletedVertex - 1 + n) % n; // edge ending at deleted vertex
  const nextEdge = deletedVertex; // edge starting at deleted vertex
  const prevLen = (() => {
    const a = polyBefore[prevEdge]!;
    const b = polyBefore[deletedVertex]!;
    return Math.hypot(b.x - a.x, b.y - a.y);
  })();

  const result: T[] = [];
  for (const op of openings) {
    if (op.roomId !== roomId) {
      result.push(op);
      continue;
    }
    if (op.edgeIndex === nextEdge) {
      // Move onto merged edge with offset += prevLen
      result.push({
        ...op,
        edgeIndex: prevEdge > deletedVertex ? prevEdge - 1 : prevEdge,
        offsetIn: op.offsetIn + prevLen,
      });
      continue;
    }
    if (op.edgeIndex === prevEdge) {
      const newIndex = prevEdge > deletedVertex ? prevEdge - 1 : prevEdge;
      result.push({ ...op, edgeIndex: newIndex });
      continue;
    }
    let ei = op.edgeIndex;
    if (ei > deletedVertex) ei -= 1;
    // When deletedVertex is 0, edges after wrap — handled by > deletedVertex
    result.push({ ...op, edgeIndex: ei });
  }
  return result;
}

function applyOpeningLists(
  geometry: FloorGeometry,
  doors: PlanDoor[],
  windows: PlanWindow[],
  openings: PlanOpening[],
): FloorGeometry {
  return { ...geometry, doors, windows, openings };
}

function clampAllForRoom(
  geometry: FloorGeometry,
  roomId: string,
): FloorGeometry {
  const room = geometry.rooms.find((r) => r.id === roomId);
  if (!room) return geometry;

  const mapOp = <T extends OpeningLike>(list: T[]): T[] => {
    const out: T[] = [];
    for (const op of list) {
      if (op.roomId !== roomId) {
        out.push(op);
        continue;
      }
      const edge = roomEdge(room, op.edgeIndex);
      if (!edge) continue;
      const clamped = clampOpeningToEdge(op.offsetIn, op.widthIn, edge.length);
      if (!clamped) continue;
      out.push({ ...op, offsetIn: clamped.offsetIn, widthIn: clamped.widthIn });
    }
    return out;
  };

  return applyOpeningLists(
    geometry,
    mapOp(geometry.doors),
    mapOp(geometry.windows),
    mapOp(geometry.openings),
  );
}

function replaceRoomPolygon(
  geometry: FloorGeometry,
  roomId: string,
  polygon: PlanPoint[],
  labelMode: "keep" | "reset-if-outside" | "reset",
): FloorGeometry {
  return {
    ...geometry,
    rooms: geometry.rooms.map((r) => {
      if (r.id !== roomId) return r;
      let labelAnchor = r.labelAnchor;
      if (labelMode === "reset") {
        labelAnchor = interiorLabelPoint(polygon);
      } else if (labelMode === "reset-if-outside") {
        if (!pointInPolygon(labelAnchor, [polygon])) {
          labelAnchor = interiorLabelPoint(polygon);
        }
      }
      return { ...r, polygon, labelAnchor };
    }),
  };
}

export function setRoomPolygonOrtho(
  geometry: FloorGeometry,
  roomId: string,
  polygon: PlanPoint[],
): FloorGeometry | null {
  if (!isValidRoomPolygon(polygon)) return null;
  let next = replaceRoomPolygon(geometry, roomId, polygon, "reset-if-outside");
  next = clampAllForRoom(next, roomId);
  return next;
}

export function moveRoomVertex(
  geometry: FloorGeometry,
  roomId: string,
  vertexIndex: number,
  x: number,
  y: number,
): FloorGeometry | null {
  const room = geometry.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const polygon = moveOrthoVertex(room.polygon, vertexIndex, x, y);
  if (!polygon) return null;
  return setRoomPolygonOrtho(geometry, roomId, polygon);
}

export function insertRoomVertex(
  geometry: FloorGeometry,
  roomId: string,
  edgeIndex: number,
  offsetIn: number,
): FloorGeometry | null {
  const room = geometry.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const edge = roomEdge(room, edgeIndex);
  if (!edge) return null;
  const inserted = insertOrthoVertex(room.polygon, edgeIndex, offsetIn);
  if (!inserted) return null;

  const doors = remapOpeningsOnInsert(
    geometry.doors,
    roomId,
    edgeIndex,
    Math.min(edge.length - MIN_EDGE_IN, Math.max(MIN_EDGE_IN, offsetIn)),
    edge.length,
  );
  const windows = remapOpeningsOnInsert(
    geometry.windows,
    roomId,
    edgeIndex,
    Math.min(edge.length - MIN_EDGE_IN, Math.max(MIN_EDGE_IN, offsetIn)),
    edge.length,
  );
  const openings = remapOpeningsOnInsert(
    geometry.openings,
    roomId,
    edgeIndex,
    Math.min(edge.length - MIN_EDGE_IN, Math.max(MIN_EDGE_IN, offsetIn)),
    edge.length,
  );

  let next = applyOpeningLists(geometry, doors, windows, openings);
  next = replaceRoomPolygon(next, roomId, inserted.polygon, "keep");
  next = clampAllForRoom(next, roomId);
  return next;
}

export function deleteRoomVertex(
  geometry: FloorGeometry,
  roomId: string,
  vertexIndex: number,
): FloorGeometry | null {
  const room = geometry.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const polygon = deleteOrthoVertex(room.polygon, vertexIndex);
  if (!polygon) return null;

  const doors = remapOpeningsOnDelete(
    geometry.doors,
    roomId,
    vertexIndex,
    room.polygon,
  );
  const windows = remapOpeningsOnDelete(
    geometry.windows,
    roomId,
    vertexIndex,
    room.polygon,
  );
  const openings = remapOpeningsOnDelete(
    geometry.openings,
    roomId,
    vertexIndex,
    room.polygon,
  );

  let next = applyOpeningLists(geometry, doors, windows, openings);
  next = replaceRoomPolygon(next, roomId, polygon, "reset-if-outside");
  next = clampAllForRoom(next, roomId);
  return next;
}

export function snapOrthoPoint(
  point: PlanPoint,
  targets: PlanPoint[],
  thresholdIn: number,
): PlanPoint {
  let x = point.x;
  let y = point.y;
  let bestX = thresholdIn;
  let bestY = thresholdIn;
  for (const t of targets) {
    const dx = Math.abs(t.x - point.x);
    const dy = Math.abs(t.y - point.y);
    if (dx < bestX) {
      bestX = dx;
      x = t.x;
    }
    if (dy < bestY) {
      bestY = dy;
      y = t.y;
    }
  }
  return { x, y };
}

export function collectSnapTargets(
  geometry: FloorGeometry,
  excludeRoomId: string,
): PlanPoint[] {
  const pts: PlanPoint[] = [];
  for (const room of geometry.rooms) {
    if (room.id === excludeRoomId) continue;
    for (const p of room.polygon) pts.push(p);
  }
  return pts;
}

export type { PlanRoom };
