import {
  deriveWallsFromRooms,
  exteriorWallFloorSpan,
} from "./derive-walls";
import {
  EMPTY_GEOMETRY_BOUNDS,
  type FloorGeometry,
  type PlanPoint,
  type PlanRoom,
} from "@/types/plan-geometry";

const ROOM_GAP_IN = 36; // 3' clear gap between standalone rooms
const FIRST_ORIGIN: PlanPoint = { x: 48, y: 48 };

function aabb(points: PlanPoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Recompute content bounds from rooms + walls (or empty defaults). */
export function recomputeBounds(
  geometry: FloorGeometry,
): FloorGeometry["meta"]["bounds"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const consider = (p: PlanPoint) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  for (const room of geometry.rooms) {
    for (const p of room.polygon) consider(p);
  }
  for (const wall of geometry.walls) {
    const half = wall.thickness / 2;
    for (const p of wall.centerline) {
      consider({ x: p.x - half, y: p.y - half });
      consider({ x: p.x + half, y: p.y + half });
    }
  }

  if (!Number.isFinite(minX)) {
    return { ...EMPTY_GEOMETRY_BOUNDS };
  }
  return { minX, minY, maxX, maxY };
}

/** Re-derive walls from rooms and refresh bounds. Always schemaVersion 2. */
export function finalizeGeometry(geometry: FloorGeometry): FloorGeometry {
  const walls = deriveWallsFromRooms(geometry.rooms);
  const next: FloorGeometry = {
    ...geometry,
    schemaVersion: 2,
    walls,
  };
  return {
    ...next,
    meta: {
      ...next.meta,
      bounds: recomputeBounds(next),
    },
  };
}

/**
 * Migrate v1 documents (per-room wall rings) to v2 (derived walls).
 * Lossless for rooms; discards stored walls and recomputes.
 */
export function migrateGeometry(geometry: FloorGeometry): {
  geometry: FloorGeometry;
  didMigrate: boolean;
} {
  if (geometry.schemaVersion >= 2) {
    // Re-derive so stored walls cannot drift from rooms
    return { geometry: finalizeGeometry(geometry), didMigrate: false };
  }
  return {
    geometry: finalizeGeometry({
      ...geometry,
      walls: [],
    }),
    didMigrate: true,
  };
}

function nextRoomNumber(geometry: FloorGeometry): number {
  let max = 0;
  for (const room of geometry.rooms) {
    const match = /^Room\s+(\d+)$/i.exec(room.name);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

function nextOrigin(geometry: FloorGeometry): PlanPoint {
  if (geometry.rooms.length === 0) {
    return { ...FIRST_ORIGIN };
  }
  let maxX = -Infinity;
  for (const room of geometry.rooms) {
    for (const p of room.polygon) maxX = Math.max(maxX, p.x);
  }
  return { x: maxX + ROOM_GAP_IN, y: FIRST_ORIGIN.y };
}

function newRoomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `room-${Date.now()}`;
}

function buildRectRoom(
  roomId: string,
  name: string,
  origin: PlanPoint,
  widthIn: number,
  depthIn: number,
  existing?: Pick<PlanRoom, "type" | "category">,
): PlanRoom {
  const { x: ox, y: oy } = origin;
  // CCW rectangle
  const polygon: PlanPoint[] = [
    { x: ox, y: oy },
    { x: ox + widthIn, y: oy },
    { x: ox + widthIn, y: oy + depthIn },
    { x: ox, y: oy + depthIn },
  ];
  return {
    id: roomId,
    name,
    type: existing?.type ?? "living_room",
    category: existing?.category ?? "living",
    polygon,
    labelAnchor: { x: ox + widthIn / 2, y: oy + depthIn / 2 },
  };
}

/** Axis-aligned width × depth of a room polygon (inches). */
export function roomSizeInches(room: PlanRoom): {
  width: number;
  depth: number;
} {
  const box = aabb(room.polygon);
  return { width: box.maxX - box.minX, depth: box.maxY - box.minY };
}

export function roomOrigin(room: PlanRoom): PlanPoint {
  const box = aabb(room.polygon);
  return { x: box.minX, y: box.minY };
}

export function addRectangularRoom(
  geometry: FloorGeometry,
  widthIn: number,
  depthIn: number,
): FloorGeometry {
  const room = buildRectRoom(
    newRoomId(),
    `Room ${nextRoomNumber(geometry)}`,
    nextOrigin(geometry),
    widthIn,
    depthIn,
  );
  return finalizeGeometry({
    ...geometry,
    rooms: [...geometry.rooms, room],
  });
}

/**
 * Attach a new room to an exterior wall, sharing the floor-edge span exactly.
 * Width is along the wall; depth is outward from the existing room.
 */
export function addRoomAdjoiningWall(
  geometry: FloorGeometry,
  wallId: string,
  widthIn: number,
  depthIn: number,
): FloorGeometry {
  const wall = geometry.walls.find((w) => w.id === wallId);
  if (!wall || wall.kind !== "exterior" || wall.roomIds.length !== 1) {
    return geometry;
  }

  const span = exteriorWallFloorSpan(geometry.rooms, wallId);
  if (!span || span.length < 1e-3) return geometry;

  const { a, b, outward } = span;
  const wallLen = span.length;
  const useWidth = Math.min(widthIn, wallLen);
  const ux = (b.x - a.x) / wallLen;
  const uy = (b.y - a.y) / wallLen;

  // Shared edge starts at `a`, length useWidth along the wall
  const s0 = { x: a.x, y: a.y };
  const s1 = { x: a.x + ux * useWidth, y: a.y + uy * useWidth };
  const n = outward;
  // CCW: s0 → s0+n*depth → s1+n*depth → s1
  const polygon: PlanPoint[] = [
    s0,
    { x: s0.x + n.x * depthIn, y: s0.y + n.y * depthIn },
    { x: s1.x + n.x * depthIn, y: s1.y + n.y * depthIn },
    s1,
  ];

  const room: PlanRoom = {
    id: newRoomId(),
    name: `Room ${nextRoomNumber(geometry)}`,
    type: "living_room",
    category: "living",
    polygon,
    labelAnchor: {
      x: (s0.x + s1.x) / 2 + (n.x * depthIn) / 2,
      y: (s0.y + s1.y) / 2 + (n.y * depthIn) / 2,
    },
  };

  return finalizeGeometry({
    ...geometry,
    rooms: [...geometry.rooms, room],
  });
}

export function resizeRoom(
  geometry: FloorGeometry,
  roomId: string,
  widthIn: number,
  depthIn: number,
): FloorGeometry {
  const existing = geometry.rooms.find((r) => r.id === roomId);
  if (!existing) return geometry;
  const origin = roomOrigin(existing);
  const room = buildRectRoom(
    roomId,
    existing.name,
    origin,
    widthIn,
    depthIn,
    existing,
  );
  return finalizeGeometry({
    ...geometry,
    rooms: geometry.rooms.map((r) => (r.id === roomId ? room : r)),
  });
}

export function translateRoom(
  geometry: FloorGeometry,
  roomId: string,
  dx: number,
  dy: number,
): FloorGeometry {
  if (dx === 0 && dy === 0) return geometry;
  const shift = (p: PlanPoint): PlanPoint => ({ x: p.x + dx, y: p.y + dy });
  return finalizeGeometry({
    ...geometry,
    rooms: geometry.rooms.map((r) =>
      r.id === roomId
        ? {
            ...r,
            polygon: r.polygon.map(shift),
            labelAnchor: shift(r.labelAnchor),
          }
        : r,
    ),
  });
}

export function deleteRoom(
  geometry: FloorGeometry,
  roomId: string,
): FloorGeometry {
  return finalizeGeometry({
    ...geometry,
    rooms: geometry.rooms.filter((r) => r.id !== roomId),
  });
}

/** Whether "Add Room Here" is offered for this wall. */
export function canAdjoinWall(geometry: FloorGeometry, wallId: string): boolean {
  const wall = geometry.walls.find((w) => w.id === wallId);
  return Boolean(wall && wall.kind === "exterior" && wall.roomIds.length === 1);
}
