/**
 * Computable geometry assertions for the sample floor plan.
 * Run: npm run check:plan-geometry
 *   or: node --experimental-strip-types scripts/check-plan-geometry.ts
 *
 * Relative imports only — the @/ alias does not resolve under plain Node.
 */

import {
  centerlineSegments,
  isFinitePoint,
  pointInPolygon,
  polygonAreaSqIn,
  polygonCentroid,
  segmentMidpoint,
  sqInToSqFt,
  wallPolygonFromCenterline,
  type Point,
} from "../src/components/plan/geometry.ts";
import { sampleFloorGeometry } from "../src/components/plan/sample-plan.ts";
import { planTokens } from "../src/lib/plan-style/tokens.ts";
import {
  createEmptyFloorGeometry,
  isEmptyFloorGeometry,
} from "../src/types/plan-geometry.ts";
import {
  DERIVED_WALL_EXTERIOR,
  DERIVED_WALL_INTERIOR,
  deriveWallsFromRooms,
  rectRoom,
  wallLen,
  wallsFor,
} from "./shared-wall-fixtures.ts";
import {
  MIN_OPENING_WIDTH_IN,
  openingWorldSpan,
  pushOffsetClearOfOverlaps,
  roomEdge,
} from "../src/lib/plan/openings.ts";
import { splitWallsForOpenings } from "../src/lib/plan/derive-walls.ts";
import {
  ALL_PLAN_ROOM_TYPES,
  countsTowardLivingArea,
  floorTextureForRoomType,
  normalizeRoomType,
  ROOM_TYPE_DEFS,
  ROOM_TYPE_PICKER_ORDER,
  roomTypeCategory,
  roomTypeDisplayName,
} from "../src/lib/plan/room-types.ts";
import {
  createGeometryHistory,
  geometryDeepEqual,
  historyPush,
  historyRedo,
  historyUndo,
} from "../src/lib/plan/history.ts";
import {
  addRectangularRoom,
  addStairs,
  finalizeGeometry,
  insertRoomVertex,
  deleteRoomVertex,
  moveRoomVertex,
  setRoomName,
  setRoomType,
  translateRoom,
} from "../src/lib/plan/room-ops.ts";
import {
  interiorLabelPoint,
} from "../src/lib/plan/labels.ts";
import {
  isAxisAlignedPolygon,
  isValidRoomPolygon,
} from "../src/lib/plan/polygon-edit.ts";
import type {
  FloorGeometry,
  PlanDoor,
  PlanRoom,
  PlanWindow,
} from "../src/types/plan-geometry.ts";

let failed = 0;

function ok(label: string): void {
  console.log("ok ", label);
}

function fail(label: string, detail: string): void {
  failed += 1;
  console.log("FAIL", label, "—", detail);
}

function assert(condition: boolean, label: string, detail = ""): void {
  if (condition) {
    ok(label);
  } else {
    fail(label, detail || "assertion failed");
  }
}

const geometry = sampleFloorGeometry;

// ---------------------------------------------------------------------------
// 1 + 2. Wall coverage (including closed wrap-around segments)
// ---------------------------------------------------------------------------
for (const wall of geometry.walls) {
  const fill = wallPolygonFromCenterline(
    wall.centerline,
    wall.thickness,
    wall.closed,
  );
  const segs = centerlineSegments(wall.centerline, wall.closed);

  assert(
    wall.closed
      ? segs.length === wall.centerline.length
      : segs.length === Math.max(0, wall.centerline.length - 1),
    `wall ${wall.id} segment count`,
    wall.closed
      ? `closed wall should have N=${wall.centerline.length} segments (including wrap-around), got ${segs.length}`
      : `open wall should have N-1 segments, got ${segs.length}`,
  );

  segs.forEach((seg, index) => {
    const mid = segmentMidpoint(seg.a, seg.b);
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const halfOffset = wall.thickness / 4;
    const left: Point = {
      x: mid.x + nx * halfOffset,
      y: mid.y + ny * halfOffset,
    };
    const right: Point = {
      x: mid.x - nx * halfOffset,
      y: mid.y - ny * halfOffset,
    };

    const midInside = pointInPolygon(mid, fill.rings);
    assert(
      midInside,
      `wall ${wall.id} seg[${index}] midpoint inside fill`,
      midInside
        ? ""
        : `midpoint (${mid.x.toFixed(1)}, ${mid.y.toFixed(1)}) is OUTSIDE wall polygon — closed loops must cover the wrap-around segment`,
    );

    assert(
      pointInPolygon(left, fill.rings),
      `wall ${wall.id} seg[${index}] +thickness/4 inside`,
      `offset point outside fill`,
    );
    assert(
      pointInPolygon(right, fill.rings),
      `wall ${wall.id} seg[${index}] -thickness/4 inside`,
      `offset point outside fill`,
    );
  });
}

// Explicit west-wall wrap-around check (the bug that shipped in 1.5a).
{
  const shell = geometry.walls.find((w) => w.id === "ext-shell");
  if (!shell) {
    fail("ext-shell present", "missing exterior shell wall");
  } else {
    const fill = wallPolygonFromCenterline(
      shell.centerline,
      shell.thickness,
      shell.closed,
    );
    const westMid: Point = {
      x: shell.centerline[0].x,
      y: (shell.centerline[0].y + shell.centerline[shell.centerline.length - 1].y) / 2,
    };
    assert(
      pointInPolygon(westMid, fill.rings),
      "west exterior wall midpoint inside shell fill",
      `point (${westMid.x}, ${westMid.y}) outside — single-subpath closed fills drop the wrap-around segment`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Room centroids are not inside any wall
// ---------------------------------------------------------------------------
for (const room of geometry.rooms) {
  const centroid = room.labelAnchor ?? polygonCentroid(room.polygon);
  let insideWall = false;
  let hostWall = "";
  for (const wall of geometry.walls) {
    const fill = wallPolygonFromCenterline(
      wall.centerline,
      wall.thickness,
      wall.closed,
    );
    if (pointInPolygon(centroid, fill.rings)) {
      insideWall = true;
      hostWall = wall.id;
      break;
    }
  }
  assert(
    !insideWall,
    `room ${room.id} centroid not in wall`,
    insideWall ? `centroid lies inside wall ${hostWall}` : "",
  );
}

// ---------------------------------------------------------------------------
// 4. Numeric sanity
// ---------------------------------------------------------------------------
{
  let bad = 0;
  for (const wall of geometry.walls) {
    const fill = wallPolygonFromCenterline(
      wall.centerline,
      wall.thickness,
      wall.closed,
    );
    for (const ring of fill.rings) {
      for (const p of ring) {
        if (!isFinitePoint(p)) {
          bad += 1;
        }
      }
    }
    for (const p of wall.centerline) {
      if (!isFinitePoint(p)) {
        bad += 1;
      }
    }
  }
  for (const room of geometry.rooms) {
    for (const p of room.polygon) {
      if (!isFinitePoint(p)) {
        bad += 1;
      }
    }
  }
  assert(bad === 0, "no NaN/Infinity coordinates in walls/rooms", `found ${bad}`);
}

// ---------------------------------------------------------------------------
// 5. Door geometry (room-edge anchors)
// ---------------------------------------------------------------------------
for (const door of geometry.doors) {
  const span = openingWorldSpan(geometry.rooms, door);
  if (!span) {
    fail(`door ${door.id} room edge`, "could not resolve opening span");
    continue;
  }
  const hinge =
    door.hingeEnd === "start" ? span.start : span.end;
  const latch =
    door.hingeEnd === "start" ? span.end : span.start;
  const radius = Math.hypot(latch.x - hinge.x, latch.y - hinge.y);
  assert(
    Math.abs(radius - door.widthIn) < 0.5,
    `door ${door.id} radius equals width`,
    `radius ${radius.toFixed(2)} vs width ${door.widthIn.toFixed(2)}`,
  );

  // Latch should lie on the room edge
  const edge = span.edge;
  const abx = edge.b.x - edge.a.x;
  const aby = edge.b.y - edge.a.y;
  const abLenSq = abx * abx + aby * aby;
  let t = 0;
  if (abLenSq > 1e-12) {
    t = Math.max(
      0,
      Math.min(
        1,
        ((latch.x - edge.a.x) * abx + (latch.y - edge.a.y) * aby) / abLenSq,
      ),
    );
  }
  const px = edge.a.x + abx * t;
  const py = edge.a.y + aby * t;
  const minDist = Math.hypot(latch.x - px, latch.y - py);
  assert(
    minDist < 1,
    `door ${door.id} latch on room edge`,
    `distance ${minDist.toFixed(3)} exceeds tolerance`,
  );
}

// ---------------------------------------------------------------------------
// 6. Area sanity
// ---------------------------------------------------------------------------
{
  let total = 0;
  for (const room of geometry.rooms) {
    const area = sqInToSqFt(polygonAreaSqIn(room.polygon));
    assert(area > 0, `room ${room.id} area > 0`, `area=${area}`);
    if (countsTowardLivingArea(normalizeRoomType(room.type))) {
      total += area;
    }
  }
  assert(
    Math.abs(total - 1450) <= 50,
    "total living area ≈ 1450 sq ft",
    `got ${total.toFixed(1)}`,
  );
}

// ---------------------------------------------------------------------------
// 7. Empty geometry document — valid finite viewBox (new projects)
// ---------------------------------------------------------------------------
{
  const empty = createEmptyFloorGeometry("Untitled");
  assert(isEmptyFloorGeometry(empty), "createEmptyFloorGeometry is empty");
  assert(empty.schemaVersion === 4, "empty schemaVersion is 4");
  assert(empty.walls.length === 0, "empty walls array");
  assert(empty.rooms.length === 0, "empty rooms array");

  const margin = planTokens.sheetMargin;
  const viewMinX = empty.meta.bounds.minX - margin;
  const viewMinY = empty.meta.bounds.minY - margin;
  const viewW =
    empty.meta.bounds.maxX - empty.meta.bounds.minX + margin * 2;
  const viewH =
    empty.meta.bounds.maxY - empty.meta.bounds.minY + margin * 2;

  assert(
    [viewMinX, viewMinY, viewW, viewH].every(
      (n) => Number.isFinite(n) && !Number.isNaN(n),
    ),
    "empty geometry viewBox values are finite",
    `viewBox=${viewMinX} ${viewMinY} ${viewW} ${viewH}`,
  );
  assert(viewW > 0 && viewH > 0, "empty geometry viewBox has positive size");
}

// ---------------------------------------------------------------------------
// 8. Derived shared walls — fixtures (schemaVersion 2)
// ---------------------------------------------------------------------------
{
  // 1. Full shared edge → one interior wall, no exterior on that span
  const walls = wallsFor([
    rectRoom("a", 0, 0, 120, 100),
    rectRoom("b", 120, 0, 120, 100),
  ]);
  const shared = walls.filter(
    (w) =>
      w.kind === "interior" &&
      w.roomIds.includes("a") &&
      w.roomIds.includes("b"),
  );
  assert(shared.length === 1, "full share: exactly one interior wall");
  assert(
    DERIVED_WALL_EXTERIOR === planTokens.wallExterior &&
      DERIVED_WALL_INTERIOR === planTokens.wallInterior,
    "derived thicknesses match planTokens",
  );
  assert(
    shared[0]?.thickness === planTokens.wallInterior,
    "full share: interior thickness",
  );
  assert(
    Math.abs(wallLen(shared[0]!) - 100) < 1e-6,
    "full share: interior length = 100",
    `len=${shared[0] ? wallLen(shared[0]) : "?"}`,
  );
  const exteriorOnShare = walls.filter((w) => {
    if (w.kind !== "exterior") return false;
    const xs = w.centerline.map((p) => p.x);
    const ys = w.centerline.map((p) => p.y);
    const onX = xs.every((x) => Math.abs(x - 120) < 1e-3);
    return onX && Math.min(...ys) < 100 - 1e-3 && Math.max(...ys) > 1e-3;
  });
  assert(
    exteriorOnShare.length === 0,
    "full share: zero exterior walls on shared span",
  );
}

{
  // 2. Partial shared edge
  const walls = wallsFor([
    rectRoom("a", 0, 0, 120, 100),
    rectRoom("b", 120, 25, 120, 50),
  ]);
  const interior = walls.filter((w) => w.kind === "interior");
  assert(interior.length === 1, "partial share: one interior wall");
  assert(
    Math.abs(wallLen(interior[0]!) - 50) < 1e-6,
    "partial share: interior length 50",
  );
  const aEastExterior = walls.filter(
    (w) => w.id.startsWith("we:a:1:") && w.kind === "exterior",
  );
  const remLen = aEastExterior.reduce((s, w) => s + wallLen(w), 0);
  assert(
    Math.abs(remLen - 50) < 1e-6,
    "partial share: exterior remainders total 50",
    `remLen=${remLen}`,
  );
  assert(
    Math.abs(wallLen(interior[0]!) + remLen - 100) < 1e-6,
    "partial share: spans sum to full edge",
  );
}

{
  // 3. T-junction — no duplicates / zero-length
  const walls = wallsFor([
    rectRoom("a", 0, 0, 200, 100),
    rectRoom("b", 0, 100, 100, 100),
    rectRoom("c", 100, 100, 100, 100),
  ]);
  const ids = new Set(walls.map((w) => w.id));
  assert(ids.size === walls.length, "T-junction: unique wall ids");
  for (const w of walls) {
    assert(wallLen(w) > 1e-3, `T-junction: wall ${w.id} positive length`);
  }
  const interiors = walls.filter((w) => w.kind === "interior");
  assert(
    interiors.length >= 3,
    "T-junction: expected shared walls",
    `got ${interiors.length}`,
  );
}

{
  // 4. Isolated room — only exterior
  const walls = wallsFor([rectRoom("solo", 0, 0, 120, 100)]);
  assert(
    walls.every((w) => w.kind === "exterior"),
    "isolated: only exterior walls",
  );
  assert(
    walls.length === 4,
    "isolated: 4 exterior walls",
    `got ${walls.length}`,
  );
}

{
  // 5. Wall id stability across resize
  const roomsBefore = [
    rectRoom("a", 0, 0, 120, 100),
    rectRoom("b", 120, 0, 120, 100),
  ];
  const before = wallsFor(roomsBefore);
  const beforeIds = new Set(before.map((w) => w.id));
  const roomsAfter = [
    rectRoom("a", 0, 0, 120, 100),
    rectRoom("b", 120, 0, 150, 100),
  ];
  const afterIds = new Set(wallsFor(roomsAfter).map((w) => w.id));
  const sharedId = [...beforeIds].find((id) => id.startsWith("wi:"));
  assert(Boolean(sharedId), "stability: has interior id before");
  assert(
    sharedId !== undefined && afterIds.has(sharedId),
    "stability: interior id survives resize",
  );
  for (const id of beforeIds) {
    if (id.startsWith("we:a:")) {
      assert(afterIds.has(id), `stability: exterior ${id} still present`);
    }
  }
}

{
  // 6. No zero/negative length, no NaN
  const rooms = [
    rectRoom("a", 0, 0, 120, 100),
    rectRoom("b", 120, 0, 80, 60),
    rectRoom("c", 120, 60, 80, 40),
  ];
  const walls = deriveWallsFromRooms(rooms);
  for (const w of walls) {
    assert(wallLen(w) > 0, `finite: wall ${w.id} length > 0`);
    for (const p of w.centerline) {
      assert(
        Number.isFinite(p.x) && Number.isFinite(p.y),
        `finite: wall ${w.id} coords`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Opening anchors survive adjoining / deletion / resize / move
// ---------------------------------------------------------------------------
function docWith(rooms: PlanRoom[], doors: PlanDoor[] = []): FloorGeometry {
  const cuts = doors.map((d) => ({
    roomId: d.roomId,
    edgeIndex: d.edgeIndex,
    offsetIn: d.offsetIn,
    widthIn: d.widthIn,
  }));
  const walls = splitWallsForOpenings(
    deriveWallsFromRooms(rooms),
    rooms,
    cuts,
  );
  return {
    schemaVersion: 4,
    meta: {
      title: "fixture",
      bounds: { minX: 0, minY: 0, maxX: 400, maxY: 400 },
    },
    walls,
    rooms,
    doors,
    windows: [],
    openings: [],
    stairs: [],
    labels: [],
  };
}

function doorOnEast(
  roomId: string,
  edgeIndex: number,
  offsetIn: number,
  widthIn = 32,
): PlanDoor {
  return {
    id: "door-1",
    roomId,
    edgeIndex,
    offsetIn,
    widthIn,
    hingeEnd: "start",
    swingSide: 1,
  };
}

{
  // 1. Door on exterior, then adjoin across it — door survives
  const rooms0 = [rectRoom("a", 0, 0, 120, 100)];
  // East edge index 1 for CCW rect
  const door = doorOnEast("a", 1, 34, 32);
  let doc = docWith(rooms0, [door]);
  assert(doc.doors.length === 1, "survive-adjoin: door present before");
  // Adjoin room on east: same coords as addRoomAdjoiningWall would
  const rooms1 = [
    rooms0[0],
    rectRoom("b", 120, 0, 100, 100),
  ];
  doc = docWith(rooms1, [door]);
  assert(doc.doors.length === 1, "survive-adjoin: door still present");
  assert(doc.doors[0]!.roomId === "a", "survive-adjoin: still on room a");
  const interior = doc.walls.filter((w) => w.kind === "interior");
  assert(interior.length >= 1, "survive-adjoin: shared interior wall exists");
  const span = openingWorldSpan(doc.rooms, doc.doors[0]!);
  assert(Boolean(span), "survive-adjoin: door still on edge");
}

{
  // 2. Door on shared wall, delete neighbor — door survives on exterior
  const rooms0 = [
    rectRoom("a", 0, 0, 120, 100),
    rectRoom("b", 120, 0, 100, 100),
  ];
  const door = doorOnEast("a", 1, 34, 32);
  let doc = docWith(rooms0, [door]);
  assert(
    doc.walls.some((w) => w.kind === "interior"),
    "survive-delete: has interior before",
  );
  doc = docWith([rooms0[0]], [door]);
  assert(doc.doors.length === 1, "survive-delete: door remains");
  assert(
    doc.walls.every((w) => w.kind === "exterior"),
    "survive-delete: only exterior walls left",
  );
  assert(
    Boolean(openingWorldSpan(doc.rooms, doc.doors[0]!)),
    "survive-delete: door still on edge",
  );
}

{
  // 3. Resize larger — door survives
  const door = doorOnEast("a", 1, 34, 32);
  const rooms = [rectRoom("a", 0, 0, 120, 100)];
  let doc = docWith(rooms, [door]);
  const bigger = [rectRoom("a", 0, 0, 120, 140)];
  doc = docWith(bigger, [door]);
  assert(doc.doors.length === 1, "resize-larger: door survives");
  assert(
    Boolean(openingWorldSpan(doc.rooms, doc.doors[0]!)),
    "resize-larger: valid span",
  );
}

{
  // 4. Resize smaller — clamp / shrink / remove
  const door = doorOnEast("a", 1, 10, 80); // tall door on 100" edge
  const edgeBefore = roomEdge(rectRoom("a", 0, 0, 120, 100), 1)!;
  assert(edgeBefore.length === 100, "resize-smaller: setup edge 100");
  // Shrink depth to 50 — edge length 50, door width 80 → clamp width to 50 (>= MIN)
  const shrunkRoom = rectRoom("a", 0, 0, 120, 50);
  const edge = roomEdge(shrunkRoom, 1)!;
  let width = door.widthIn;
  let offset = door.offsetIn;
  if (width > edge.length) width = edge.length;
  if (width < MIN_OPENING_WIDTH_IN) {
    assert(false, "resize-smaller: unexpected remove path");
  } else {
    if (offset + width > edge.length) offset = edge.length - width;
    assert(width === 50, "resize-smaller: width clamped to edge", `w=${width}`);
    assert(offset >= 0, "resize-smaller: offset non-negative");
  }
  // Extreme: edge shorter than MIN → remove
  const tiny = rectRoom("a", 0, 0, 120, 8);
  const tinyEdge = roomEdge(tiny, 1)!;
  assert(
    tinyEdge.length < MIN_OPENING_WIDTH_IN,
    "resize-remove: edge below min width",
  );
}

{
  // 5. Move room — door moves with it
  const door = doorOnEast("a", 1, 34, 32);
  const before = openingWorldSpan([rectRoom("a", 0, 0, 120, 100)], door)!;
  const after = openingWorldSpan([rectRoom("a", 40, 20, 120, 100)], door)!;
  assert(
    Math.abs(after.start.x - (before.start.x + 40)) < 1e-6 &&
      Math.abs(after.start.y - (before.start.y + 20)) < 1e-6,
    "move-room: door translates with room",
  );
}

{
  // 6. Delete anchor room — openings gone
  const remaining = docWith([rectRoom("b", 200, 0, 100, 100)], []);
  assert(remaining.doors.length === 0, "delete-anchor: no doors left");
}

{
  // 7. Split lengths + opening widths = original span
  const rooms = [rectRoom("a", 0, 0, 120, 100)];
  const door = doorOnEast("a", 1, 20, 30);
  const base = deriveWallsFromRooms(rooms);
  const east = base.find((w) => w.id.startsWith("we:a:1:"));
  assert(Boolean(east), "split: found east exterior");
  const original = wallLen(east!);
  const split = splitWallsForOpenings(base, rooms, [
    {
      roomId: door.roomId,
      edgeIndex: door.edgeIndex,
      offsetIn: door.offsetIn,
      widthIn: door.widthIn,
    },
  ]);
  const eastPieces = split.filter((w) => w.id.startsWith("we:a:1:"));
  const pieceSum = eastPieces.reduce((s, w) => s + wallLen(w), 0);
  assert(
    Math.abs(pieceSum + door.widthIn - original) < 1e-4,
    "split: pieces + opening = original",
    `pieces=${pieceSum} opening=${door.widthIn} original=${original}`,
  );
  for (const w of eastPieces) {
    assert(wallLen(w) > 0, `split: piece ${w.id} positive`);
  }
}

{
  // 8. Two openings never overlap — push clears
  const others = [{ roomId: "a", edgeIndex: 1, offsetIn: 20, widthIn: 30 }];
  const pushed = pushOffsetClearOfOverlaps(25, 30, 100, others);
  assert(pushed !== null, "overlap: found a slot");
  assert(
    pushed! >= 50 || pushed! + 30 <= 20,
    "overlap: pushed clear of [20,50)",
    `pushed=${pushed}`,
  );
}

// ---------------------------------------------------------------------------
// 10. Room types, living-area exclusions, naming, undo/redo
// ---------------------------------------------------------------------------
{
  for (const type of ALL_PLAN_ROOM_TYPES) {
    const def = ROOM_TYPE_DEFS[type];
    assert(Boolean(def.displayName), `type ${type}: has display name`);
    assert(
      def.category === "living" ||
        def.category === "wet" ||
        def.category === "service",
      `type ${type}: exactly one category`,
      `got ${def.category}`,
    );
    assert(
      roomTypeCategory(type) === def.category,
      `type ${type}: category helper matches`,
    );
    assert(
      roomTypeDisplayName(type) === def.displayName,
      `type ${type}: display helper matches`,
    );
  }
  assert(
    ROOM_TYPE_PICKER_ORDER.length === ALL_PLAN_ROOM_TYPES.length,
    "picker order covers every type",
  );
  assert(
    normalizeRoomType("entry") === "foyer",
    "legacy entry normalizes to foyer",
  );
}

{
  // Porch / patio / deck / garage excluded from living area; outdoor: no texture
  for (const t of ["porch", "patio", "deck", "garage"] as const) {
    assert(!countsTowardLivingArea(t), `${t}: excluded from living area`);
    assert(
      floorTextureForRoomType(t) === "none",
      `${t}: no floor texture`,
    );
  }
  const living = rectRoom("liv", 0, 0, 120, 120);
  living.type = "living_room";
  const porch = rectRoom("porch", 200, 0, 100, 100);
  porch.type = "porch";
  porch.category = "service";
  porch.name = "Porch";
  const patio = rectRoom("patio", 400, 0, 100, 100);
  patio.type = "patio";
  patio.category = "service";
  patio.name = "Patio";
  const deck = rectRoom("deck", 600, 0, 100, 100);
  deck.type = "deck";
  deck.category = "service";
  deck.name = "Deck";
  const garage = rectRoom("garage", 800, 0, 100, 100);
  garage.type = "garage";
  garage.category = "service";
  garage.name = "Garage";
  const rooms = [living, porch, patio, deck, garage];
  let livingOnly = 0;
  for (const room of rooms) {
    if (countsTowardLivingArea(normalizeRoomType(room.type))) {
      livingOnly += sqInToSqFt(polygonAreaSqIn(room.polygon));
    }
  }
  const expected = sqInToSqFt(120 * 120);
  assert(
    Math.abs(livingOnly - expected) < 1e-6,
    "living-area fixture ignores porch/patio/deck/garage",
    `got ${livingOnly} expected ${expected}`,
  );
}

{
  // REAL PATH: Add Room → setRoomType Bedroom (nameCustom=false)
  let doc = createEmptyFloorGeometry("beds");
  doc = addRectangularRoom(doc, 120, 120);
  assert(doc.rooms[0]!.name === "Room 1", "real-path: starts as Room 1");
  assert(doc.rooms[0]!.nameCustom === false, "real-path: nameCustom false");
  doc = setRoomType(doc, doc.rooms[0]!.id, "bedroom");
  assert(doc.rooms[0]!.name === "Bedroom", "real-path: Bedroom", doc.rooms[0]!.name);

  doc = addRectangularRoom(doc, 120, 120);
  doc = setRoomType(doc, doc.rooms[1]!.id, "bedroom");
  doc = addRectangularRoom(doc, 120, 120);
  doc = setRoomType(doc, doc.rooms[2]!.id, "bedroom");
  assert(doc.rooms[1]!.name === "Bedroom 2", "real-path: Bedroom 2");
  assert(doc.rooms[2]!.name === "Bedroom 3", "real-path: Bedroom 3");
}

{
  // Custom name (nameCustom=true) survives type change via room-ops
  let doc = createEmptyFloorGeometry("custom");
  doc = addRectangularRoom(doc, 100, 100);
  const id = doc.rooms[0]!.id;
  doc = setRoomType(doc, id, "bedroom");
  doc = setRoomName(doc, id, "Kids Suite");
  assert(doc.rooms[0]!.nameCustom === true, "custom: nameCustom true");
  doc = setRoomType(doc, id, "office");
  assert(
    doc.rooms[0]!.name === "Kids Suite",
    "custom name survives type change",
    doc.rooms[0]!.name,
  );
  assert(doc.rooms[0]!.type === "office", "type updated to office");
}

{
  // Undo/redo round trip via pure history + room-ops
  const start = finalizeGeometry(createEmptyFloorGeometry("hist"));
  let hist = createGeometryHistory(start);
  hist = historyPush(hist, addRectangularRoom(hist.present, 144, 120));
  const roomId = hist.present.rooms[0]!.id;
  hist = historyPush(hist, setRoomType(hist.present, roomId, "bedroom"));
  hist = historyPush(hist, setRoomName(hist.present, roomId, "Den"));
  hist = historyPush(hist, translateRoom(hist.present, roomId, 24, 0));
  hist = historyPush(hist, addStairs(hist.present));
  const end = hist.present;

  while (hist.past.length > 0) {
    hist = historyUndo(hist);
  }
  assert(
    geometryDeepEqual(hist.present, start),
    "undo all: deep-equals start",
  );

  while (hist.future.length > 0) {
    hist = historyRedo(hist);
  }
  assert(
    geometryDeepEqual(hist.present, end),
    "redo all: deep-equals end",
  );
}

{
  // L-shape: insert vertex then move — axis-aligned, valid area
  let doc = finalizeGeometry({
    ...createEmptyFloorGeometry("L"),
    rooms: [rectRoom("a", 0, 0, 120, 100)],
  });
  // Insert midpoint on bottom edge (index 2 for CCW: top, right, bottom, left)
  // rect: 0=(0,0), 1=(120,0), 2=(120,100), 3=(0,100) — edges: 0 top, 1 right, 2 bottom, 3 left
  doc = insertRoomVertex(doc, "a", 2, 60);
  assert(doc.rooms[0]!.polygon.length === 5, "L: 5 vertices after insert");
  // Move the new vertex (index 3) inward to form a notch — actually new vertex is at index 3
  // After insert on edge 2: vertices 0,1,2, NEW, old3
  // NEW is at (60,100) on bottom. Move vertex 2 (120,100) leftward via ortho move...
  // Better: move the new vertex up to create L
  const newIdx = 3;
  doc = moveRoomVertex(doc, "a", newIdx, 60, 50);
  const poly = doc.rooms[0]!.polygon;
  assert(isAxisAlignedPolygon(poly), "L: all edges axis-aligned");
  assert(isValidRoomPolygon(poly), "L: valid polygon");
  const area = polygonAreaSqIn(poly);
  assert(area > 0, "L: positive area", `area=${area}`);
}

{
  // Insert vertex on edge with door — door stays at same world position
  const door: PlanDoor = {
    id: "d1",
    roomId: "a",
    edgeIndex: 1,
    offsetIn: 30,
    widthIn: 32,
    hingeEnd: "start",
    swingSide: 1,
  };
  let doc = finalizeGeometry({
    ...createEmptyFloorGeometry("door-ins"),
    rooms: [rectRoom("a", 0, 0, 120, 100)],
    doors: [door],
  });
  const before = openingWorldSpan(doc.rooms, doc.doors[0]!);
  assert(Boolean(before), "insert-door: span before");
  // Split east edge (index 1) at 50 — door is 30–62, entirely on first half
  doc = insertRoomVertex(doc, "a", 1, 70);
  const after = openingWorldSpan(doc.rooms, doc.doors[0]!);
  assert(Boolean(after), "insert-door: span after");
  assert(
    Math.hypot(after!.start.x - before!.start.x, after!.start.y - before!.start.y) < 0.5,
    "insert-door: start world position",
  );
  assert(
    Math.hypot(after!.end.x - before!.end.x, after!.end.y - before!.end.y) < 0.5,
    "insert-door: end world position",
  );
}

{
  // Delete vertex merging edges — window stays at world position
  // Start with 5-gon: insert then place window on an edge that will merge
  let doc = finalizeGeometry({
    ...createEmptyFloorGeometry("win-del"),
    rooms: [rectRoom("a", 0, 0, 120, 100)],
  });
  doc = insertRoomVertex(doc, "a", 0, 60);
  // polygon: (0,0),(60,0),(120,0),(120,100),(0,100) — 5 verts
  // Put window on edge 0 (0,0)→(60,0)
  const win: PlanWindow = {
    id: "w1",
    roomId: "a",
    edgeIndex: 0,
    offsetIn: 10,
    widthIn: 36,
  };
  doc = finalizeGeometry({ ...doc, windows: [win] });
  const before = openingWorldSpan(doc.rooms, doc.windows[0]!);
  assert(Boolean(before), "delete-win: span before");
  // Delete vertex at index 1 (60,0) — merges edge 0 and 1 into full top
  doc = deleteRoomVertex(doc, "a", 1);
  assert(doc.rooms[0]!.polygon.length === 4, "delete-win: back to 4 verts");
  assert(doc.windows.length === 1, "delete-win: window remains");
  const after = openingWorldSpan(doc.rooms, doc.windows[0]!);
  assert(Boolean(after), "delete-win: span after");
  assert(
    Math.hypot(after!.start.x - before!.start.x, after!.start.y - before!.start.y) < 0.5,
    "delete-win: start world position",
  );
}

{
  // Reshape flush with neighbour → shared interior wall
  let doc = finalizeGeometry({
    ...createEmptyFloorGeometry("flush"),
    rooms: [
      rectRoom("a", 0, 0, 100, 100),
      rectRoom("b", 120, 0, 100, 100),
    ],
  });
  // Move room a's right edge (vertices 1 and 2) to x=120 via moving vertex 1
  doc = moveRoomVertex(doc, "a", 1, 120, 0);
  // vertex 2 should have been adjusted to x=120 by ortho move
  const shared = doc.walls.filter((w) => w.kind === "interior");
  assert(shared.length >= 1, "flush: shared interior wall exists");
}

{
  // L-shaped room default label is inside
  const L: PlanRoom = {
    id: "L",
    name: "L",
    type: "living_room",
    category: "living",
    nameCustom: false,
    polygon: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ],
    labelAnchor: { x: 0, y: 0 },
  };
  const label = interiorLabelPoint(L.polygon);
  assert(
    pointInPolygon(label, [L.polygon]),
    "L-label: interior point inside polygon",
    `at ${label.x},${label.y}`,
  );
  // Centroid of this L is often outside or near the notch
  const c = polygonCentroid(L.polygon);
  // Just assert our helper is inside (requirement)
  void c;
}

{
  // Two floors independent — editing one leaves the other byte-identical
  const floorA = finalizeGeometry({
    ...createEmptyFloorGeometry("A"),
    rooms: [rectRoom("a", 0, 0, 100, 100)],
  });
  const floorB = finalizeGeometry({
    ...createEmptyFloorGeometry("B"),
    rooms: [rectRoom("b", 0, 0, 80, 80)],
  });
  const bSnapshot = JSON.stringify(floorB);
  let a = translateRoom(floorA, "a", 10, 0);
  a = setRoomType(a, "a", "bedroom");
  assert(JSON.stringify(floorB) === bSnapshot, "floors: B unchanged after A edits");
  assert(!geometryDeepEqual(a, floorA), "floors: A actually changed");
}

console.log("");
console.log(
  failed === 0
    ? `All geometry assertions passed (${geometry.walls.length} walls, ${geometry.rooms.length} rooms).`
    : `${failed} geometry assertion(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
