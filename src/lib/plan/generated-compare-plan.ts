/**
 * Programmatic “small house” built via room-ops for /debug/plan-compare.
 */

import {
  addDoorOnRoomEdge,
  addOpeningOnRoomEdge,
  addRectangularRoom,
  addRoomAdjoiningEdge,
  addStairs,
  addWindowOnRoomEdge,
  finalizeGeometry,
  insertRoomVertex,
  moveRoomVertex,
  setRoomType,
  translateStairs,
} from "@/lib/plan/room-ops";
import { DEFAULT_PLAN_STYLE } from "@/lib/plan/style-settings";
import {
  createEmptyFloorGeometry,
  type FloorGeometry,
} from "@/types/plan-geometry";

/**
 * Realistic small plan:
 * living + kitchen (east) + bedroom (south, L-shaped),
 * entry door, kitchen window, cased opening, stairs.
 */
export function buildGeneratedComparePlan(): FloorGeometry {
  let doc = createEmptyFloorGeometry("Generated house");

  // Living — 16' × 14'
  doc = addRectangularRoom(doc, 192, 168);
  const livingId = doc.rooms[0]!.id;
  doc = setRoomType(doc, livingId, "living_room");

  // Kitchen on living's east edge (edge 1)
  doc = addRoomAdjoiningEdge(doc, livingId, 1, 120, 144);
  const kitchenId = doc.rooms[doc.rooms.length - 1]!.id;
  doc = setRoomType(doc, kitchenId, "kitchen");

  // Bedroom on living's south edge (edge 2)
  doc = addRoomAdjoiningEdge(doc, livingId, 2, 144, 120);
  const bedId = doc.rooms[doc.rooms.length - 1]!.id;
  doc = setRoomType(doc, bedId, "bedroom");

  // L-shape: insert mid south edge of bedroom, pull south for bump-out
  const bed = doc.rooms.find((r) => r.id === bedId)!;
  // After adjoin, bedroom is axis-aligned rect: edges 0–3
  const southEdge = 2;
  const southLen = Math.hypot(
    bed.polygon[(southEdge + 1) % bed.polygon.length]!.x -
      bed.polygon[southEdge]!.x,
    bed.polygon[(southEdge + 1) % bed.polygon.length]!.y -
      bed.polygon[southEdge]!.y,
  );
  doc = insertRoomVertex(doc, bedId, southEdge, southLen * 0.45);
  const bed2 = doc.rooms.find((r) => r.id === bedId)!;
  if (bed2.polygon.length >= 5) {
    const idx = southEdge + 1;
    const p = bed2.polygon[idx]!;
    doc = moveRoomVertex(doc, bedId, idx, p.x, p.y + 48);
  }

  // Entry door on living west (edge 3)
  doc = addDoorOnRoomEdge(doc, livingId, 3, 60);

  // Kitchen window on east exterior (kitchen edge facing east)
  const kitchen = doc.rooms.find((r) => r.id === kitchenId)!;
  let kitchenEast = 1;
  for (let i = 0; i < kitchen.polygon.length; i += 1) {
    const a = kitchen.polygon[i]!;
    const b = kitchen.polygon[(i + 1) % kitchen.polygon.length]!;
    if (Math.abs(a.x - b.x) < 1e-6 && a.x > kitchen.polygon[0]!.x + 10) {
      kitchenEast = i;
      break;
    }
  }
  doc = addWindowOnRoomEdge(doc, kitchenId, kitchenEast, 36);

  // Cased opening on living→kitchen shared edge (living east, edge 1)
  doc = addOpeningOnRoomEdge(doc, livingId, 1, 48);

  doc = addStairs(doc);
  if (doc.stairs[0]) {
    const living = doc.rooms.find((r) => r.id === livingId)!;
    const cx =
      living.polygon.reduce((s, p) => s + p.x, 0) / living.polygon.length;
    const cy =
      living.polygon.reduce((s, p) => s + p.y, 0) / living.polygon.length;
    const stair = doc.stairs[0]!;
    doc = translateStairs(
      doc,
      stair.id,
      cx - stair.origin.x - stair.widthIn / 2,
      cy - stair.origin.y - 24,
    );
  }

  return finalizeGeometry(doc, {
    wallExteriorIn: DEFAULT_PLAN_STYLE.wallExteriorIn,
    wallInteriorIn: DEFAULT_PLAN_STYLE.wallInteriorIn,
  });
}
