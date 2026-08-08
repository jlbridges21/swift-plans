/**
 * Hit-test assertions for selection-first editor interaction.
 * Run: npm run check:hit-test
 *   or: node --experimental-strip-types scripts/check-hit-test.ts
 *
 * Relative imports only — the @/ alias does not resolve under plain Node.
 */

import {
  emptyHitSelection,
  hitTest,
  MIN_HIT_PX,
  type HitSelectionState,
  type HitTarget,
} from "../src/lib/plan/hit-test.ts";
import { deriveWallsFromRooms } from "../src/lib/plan/derive-walls.ts";
import { createEmptyFloorGeometry } from "../src/types/plan-geometry.ts";
import type {
  FloorGeometry,
  PlanPoint,
  PlanRoom,
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
  if (condition) ok(label);
  else fail(label, detail || "assertion failed");
}

function assertKind(
  target: HitTarget,
  kind: HitTarget["kind"],
  label: string,
): void {
  assert(target.kind === kind, label, `got ${target.kind}`);
}

function rectRoom(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): PlanRoom {
  return {
    id,
    name: id,
    type: "living_room",
    category: "living",
    polygon: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    labelAnchor: { x: x + w / 2, y: y + h / 2 },
    nameCustom: false,
  };
}

function geo(rooms: PlanRoom[], extra?: Partial<FloorGeometry>): FloorGeometry {
  const base = createEmptyFloorGeometry("hit-test");
  const walls = deriveWallsFromRooms(rooms);
  return {
    ...base,
    ...extra,
    rooms,
    walls,
    doors: extra?.doors ?? [],
    windows: extra?.windows ?? [],
    openings: extra?.openings ?? [],
    stairs: extra?.stairs ?? [],
  };
}

const PPI = 1; // 1 px per inch → slopIn = MIN_HIT_PX/2 = 22"

function sel(patch: Partial<HitSelectionState>): HitSelectionState {
  return { ...emptyHitSelection(), ...patch };
}

// Fixture: room A (0,0)–(100,80), room B (200,0)–(280,80)
const roomA = rectRoom("A", 0, 0, 100, 80);
const roomB = rectRoom("B", 200, 0, 80, 80);

const geometryWithStairs = geo([roomA, roomB], {
  stairs: [
    {
      id: "stair1",
      origin: { x: 30, y: 20 },
      widthIn: 36,
      depthIn: 40,
      rotationDeg: 0,
      direction: "up",
    },
  ],
});

const bigA = rectRoom("A", 0, 0, 200, 160);
const bigB = rectRoom("B", 400, 0, 160, 160);
const bigGeo = geo([bigA, bigB]);
const bigWithDoor = geo([bigA, bigB], {
  doors: [
    {
      id: "door1",
      roomId: "A",
      edgeIndex: 1,
      offsetIn: 60,
      widthIn: 32,
      hingeEnd: "start",
      swingSide: 1,
    },
  ],
});

// Mid of top wall (y=0), far from corners
const wallMidTop: PlanPoint = { x: 100, y: 0 };
const labelA = bigA.labelAnchor;
const cornerA: PlanPoint = { x: 0, y: 0 };
const insideB: PlanPoint = { x: 480, y: 80 };
const emptyPt: PlanPoint = { x: -400, y: -400 };

// ---------------------------------------------------------------------------
// 1. Nothing selected, point on room wall → ROOM
// ---------------------------------------------------------------------------
{
  const t = hitTest(bigGeo, wallMidTop, emptyHitSelection(), PPI);
  assertKind(t, "room", "1: wall hit → room");
  assert(t.kind === "room" && t.roomId === "A", "1: room A");
}

// ---------------------------------------------------------------------------
// 2. Nothing selected, point on label → ROOM
// ---------------------------------------------------------------------------
{
  const t = hitTest(bigGeo, labelA, emptyHitSelection(), PPI);
  assertKind(t, "room", "2: label hit → room");
  assert(t.kind === "room" && t.roomId === "A", "2: room A");
}

// ---------------------------------------------------------------------------
// 3. Nothing selected, point on corner → ROOM
// ---------------------------------------------------------------------------
{
  const t = hitTest(bigGeo, cornerA, emptyHitSelection(), PPI);
  assertKind(t, "room", "3: corner hit → room");
  assert(t.kind === "room" && t.roomId === "A", "3: room A");
}

// ---------------------------------------------------------------------------
// 4. Room selected, reshape OFF, corner → room (move), not vertex
// ---------------------------------------------------------------------------
{
  const t = hitTest(
    bigGeo,
    cornerA,
    sel({ selectedRoomId: "A", reshape: false }),
    PPI,
  );
  assertKind(t, "room", "4: corner + reshape off → room");
  assert(t.kind === "room" && t.roomId === "A", "4: room A");
}

// ---------------------------------------------------------------------------
// 5. Room selected, reshape ON, corner → vertex
// ---------------------------------------------------------------------------
{
  const t = hitTest(
    bigGeo,
    cornerA,
    sel({ selectedRoomId: "A", reshape: true }),
    PPI,
  );
  assertKind(t, "vertex", "5: corner + reshape on → vertex");
  assert(
    t.kind === "vertex" && t.roomId === "A" && t.vertexIndex === 0,
    "5: vertex 0",
  );
}

// ---------------------------------------------------------------------------
// 6. Room selected, mid wall → wall
// ---------------------------------------------------------------------------
{
  const t = hitTest(
    bigGeo,
    wallMidTop,
    sel({ selectedRoomId: "A", reshape: false }),
    PPI,
  );
  assertKind(t, "wall", "6: mid wall → wall");
  assert(t.kind === "wall" && t.roomId === "A", "6: wall of A");
}

// ---------------------------------------------------------------------------
// 7. Room A selected, point inside B → B
// ---------------------------------------------------------------------------
{
  const t = hitTest(bigGeo, insideB, sel({ selectedRoomId: "A" }), PPI);
  assertKind(t, "room", "7: other room");
  assert(t.kind === "room" && t.roomId === "B", "7: room B");
}

// ---------------------------------------------------------------------------
// 8. Empty canvas → pan from every selection state
// ---------------------------------------------------------------------------
{
  const states: HitSelectionState[] = [
    emptyHitSelection(),
    sel({ selectedRoomId: "A" }),
    sel({ selectedRoomId: "A", reshape: true }),
    sel({ selectedRoomId: "A", labelSelected: true }),
    sel({ selectedStairsId: "stair1" }),
    sel({ selectedOpeningId: "door1", selectedRoomId: "A" }),
  ];
  for (const [i, state] of states.entries()) {
    const t = hitTest(bigWithDoor, emptyPt, state, PPI);
    assertKind(t, "pan", `8.${i}: empty → pan`);
  }
}

// ---------------------------------------------------------------------------
// 9. Zoom invariance: 30 screen-px from wall
// ---------------------------------------------------------------------------
{
  // 15 screen-px from the top floor edge — inside the 22px (half of 44) slop
  // at every zoom, so the resolved kind stays wall.
  const zooms = [0.5, 1, 4];
  const kinds: HitTarget["kind"][] = [];
  for (const ppi of zooms) {
    const world: PlanPoint = { x: 100, y: 0 + 15 / ppi };
    const t = hitTest(bigGeo, world, sel({ selectedRoomId: "A" }), ppi);
    kinds.push(t.kind);
  }
  assert(
    kinds[0] === kinds[1] && kinds[1] === kinds[2],
    "9: zoom invariance",
    `kinds=${kinds.join(",")}`,
  );
  assert(
    kinds.every((k) => k === "wall"),
    "9: all resolve to wall",
    `kinds=${kinds.join(",")}`,
  );
}

// ---------------------------------------------------------------------------
// 10. Overlapping candidates resolve by documented priority
// ---------------------------------------------------------------------------
{
  const t = hitTest(
    bigGeo,
    cornerA,
    sel({ selectedRoomId: "A", reshape: true }),
    PPI,
  );
  assertKind(t, "vertex", "10: reshape priority vertex > wall");

  const tLabel = hitTest(
    bigGeo,
    labelA,
    sel({ selectedRoomId: "A", labelSelected: true }),
    PPI,
  );
  assertKind(tLabel, "label", "10: labelSelected → label");

  const tRoom = hitTest(
    bigGeo,
    labelA,
    sel({ selectedRoomId: "A", labelSelected: false }),
    PPI,
  );
  assertKind(tRoom, "room", "10: label not selected → room");
}

// ---------------------------------------------------------------------------
// 11. Openings and stairs only under documented conditions
// ---------------------------------------------------------------------------
{
  const doorPt: PlanPoint = { x: 200, y: 60 + 16 };
  const t0 = hitTest(bigWithDoor, doorPt, emptyHitSelection(), PPI);
  assertKind(t0, "room", "11: nothing selected → room not opening");

  const t1 = hitTest(
    bigWithDoor,
    doorPt,
    sel({ selectedRoomId: "A" }),
    PPI,
  );
  assertKind(t1, "opening", "11: room selected → opening");
  assert(
    t1.kind === "opening" && t1.openingId === "door1",
    "11: door1",
  );

  const stairPt: PlanPoint = { x: 48, y: 40 };
  const t2 = hitTest(geometryWithStairs, stairPt, emptyHitSelection(), PPI);
  assertKind(t2, "room", "11: nothing selected stairs→room");

  const t3 = hitTest(
    geometryWithStairs,
    stairPt,
    sel({ selectedRoomId: "A" }),
    PPI,
  );
  assertKind(t3, "stairs", "11: room selected → stairs");

  const orphan = geo([], {
    stairs: [
      {
        id: "orphan",
        origin: { x: 500, y: 500 },
        widthIn: 36,
        depthIn: 48,
        rotationDeg: 0,
        direction: "up",
      },
    ],
  });
  const t4 = hitTest(
    orphan,
    { x: 518, y: 524 },
    emptyHitSelection(),
    PPI,
  );
  assertKind(t4, "stairs", "11: orphan stairs selectable");
}

assert(MIN_HIT_PX === 44, "MIN_HIT_PX is 44");

console.log("");
console.log(
  failed === 0
    ? "All hit-test assertions passed."
    : `${failed} hit-test assertion(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
