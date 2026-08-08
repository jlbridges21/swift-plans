import { planTokens } from "@/lib/plan-style/tokens";
import {
  EMPTY_GEOMETRY_BOUNDS,
  type FloorGeometry,
  type PlanPoint,
  type PlanRoom,
  type PlanWall,
} from "@/types/plan-geometry";

const ROOM_GAP_IN = 36; // 3' clear gap between standalone rooms
const FIRST_ORIGIN: PlanPoint = { x: 48, y: 48 };

function roomWallId(roomId: string): string {
  return `wall-${roomId}`;
}

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
export function recomputeBounds(geometry: FloorGeometry): FloorGeometry["meta"]["bounds"] {
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

function withBounds(geometry: FloorGeometry): FloorGeometry {
  return {
    ...geometry,
    meta: {
      ...geometry.meta,
      bounds: recomputeBounds(geometry),
    },
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
  const half = planTokens.wallExterior / 2;
  let maxX = -Infinity;
  for (const room of geometry.rooms) {
    for (const p of room.polygon) maxX = Math.max(maxX, p.x);
  }
  for (const wall of geometry.walls) {
    for (const p of wall.centerline) maxX = Math.max(maxX, p.x + half);
  }
  return { x: maxX + ROOM_GAP_IN + half, y: FIRST_ORIGIN.y };
}

function buildRoomGeometry(
  roomId: string,
  name: string,
  origin: PlanPoint,
  widthIn: number,
  depthIn: number,
): { room: PlanRoom; wall: PlanWall } {
  const half = planTokens.wallExterior / 2;
  const { x: ox, y: oy } = origin;
  const polygon: PlanPoint[] = [
    { x: ox, y: oy },
    { x: ox + widthIn, y: oy },
    { x: ox + widthIn, y: oy + depthIn },
    { x: ox, y: oy + depthIn },
  ];
  const centerline: PlanPoint[] = [
    { x: ox - half, y: oy - half },
    { x: ox + widthIn + half, y: oy - half },
    { x: ox + widthIn + half, y: oy + depthIn + half },
    { x: ox - half, y: oy + depthIn + half },
  ];
  return {
    room: {
      id: roomId,
      name,
      type: "living_room",
      category: "living",
      polygon,
      labelAnchor: { x: ox + widthIn / 2, y: oy + depthIn / 2 },
    },
    wall: {
      id: roomWallId(roomId),
      centerline,
      thickness: planTokens.wallExterior,
      kind: "exterior",
      closed: true,
    },
  };
}

/** Axis-aligned width × depth of a room polygon (inches). */
export function roomSizeInches(room: PlanRoom): { width: number; depth: number } {
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
  const roomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `room-${Date.now()}`;
  const name = `Room ${nextRoomNumber(geometry)}`;
  const origin = nextOrigin(geometry);
  const { room, wall } = buildRoomGeometry(
    roomId,
    name,
    origin,
    widthIn,
    depthIn,
  );
  return withBounds({
    ...geometry,
    schemaVersion: 1,
    rooms: [...geometry.rooms, room],
    walls: [...geometry.walls, wall],
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
  const { room, wall } = buildRoomGeometry(
    roomId,
    existing.name,
    origin,
    widthIn,
    depthIn,
  );
  // Preserve type/category from existing room
  room.type = existing.type;
  room.category = existing.category;

  return withBounds({
    ...geometry,
    schemaVersion: 1,
    rooms: geometry.rooms.map((r) => (r.id === roomId ? room : r)),
    walls: geometry.walls.map((w) =>
      w.id === roomWallId(roomId) ? wall : w,
    ),
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
  return withBounds({
    ...geometry,
    schemaVersion: 1,
    rooms: geometry.rooms.map((r) =>
      r.id === roomId
        ? {
            ...r,
            polygon: r.polygon.map(shift),
            labelAnchor: shift(r.labelAnchor),
          }
        : r,
    ),
    walls: geometry.walls.map((w) =>
      w.id === roomWallId(roomId)
        ? { ...w, centerline: w.centerline.map(shift) }
        : w,
    ),
  });
}

export function deleteRoom(
  geometry: FloorGeometry,
  roomId: string,
): FloorGeometry {
  return withBounds({
    ...geometry,
    schemaVersion: 1,
    rooms: geometry.rooms.filter((r) => r.id !== roomId),
    walls: geometry.walls.filter((w) => w.id !== roomWallId(roomId)),
  });
}

export { roomWallId };
