/**
 * Hand-authored sample floor geometry for /debug/plan-style.
 * Coordinates are inches. This is artwork — hardcoded on purpose.
 *
 * No runtime imports — only `import type` (erased by Node type-stripping)
 * so scripts/check-plan-geometry.ts can load this under plain Node.
 */

import type { FloorGeometry, PlanPoint } from "../../types/plan-geometry";

const EX = 6;
const IN = 4.5;

/**
 * Linear scale so living area lands near ~1,450 sq ft.
 * Wall thicknesses are NOT scaled.
 */
const S = 1.2;
function pt(x: number, y: number): PlanPoint {
  return { x: x * S, y: y * S };
}
function len(n: number): number {
  return n * S;
}

const exteriorCenterline: PlanPoint[] = [
  pt(3, 3),
  pt(501, 3),
  pt(501, 147),
  pt(741, 147),
  pt(741, 381),
  pt(3, 381),
];

/**
 * Typed floor geometry document (schemaVersion 1).
 */
export const sampleFloorGeometry: FloorGeometry = {
  schemaVersion: 1,
  meta: {
    title: "Sample Residence — ~1,450 sq ft",
    bounds: { minX: 0, minY: 0, maxX: 744 * S, maxY: 384 * S },
  },
  walls: [
    {
      id: "ext-shell",
      kind: "exterior",
      closed: true,
      thickness: EX,
      roomIds: [],
      centerline: exteriorCenterline,
    },
    {
      id: "w-primary-east",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(180, 6), pt(180, 162)],
    },
    {
      id: "w-wic-ensuite",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(180, 96), pt(312, 96)],
    },
    {
      id: "w-ensuite-east",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(228, 96), pt(228, 162)],
    },
    {
      id: "w-suite-south",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(6, 162), pt(312, 162)],
    },
    {
      id: "w-bath-hall",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(312, 6), pt(312, 162)],
    },
    {
      id: "w-bath-south",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(312, 84), pt(384, 84)],
    },
    {
      id: "w-bed-west",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(384, 6), pt(384, 282)],
    },
    {
      id: "w-bed-split",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(384, 144), pt(498, 144)],
    },
    {
      id: "w-living-east",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(300, 162), pt(300, 378)],
    },
    {
      id: "w-dining-north",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(192, 276), pt(300, 276)],
    },
    {
      id: "w-living-jog",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(192, 276), pt(192, 378)],
    },
    {
      id: "w-kitchen-east",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(372, 162), pt(372, 282)],
    },
    {
      id: "w-laundry-south",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(372, 228), pt(438, 228)],
    },
    {
      id: "w-laundry-east",
      kind: "interior",
      closed: false,
      thickness: IN,
      roomIds: [],
      centerline: [pt(432, 162), pt(432, 228)],
    },
    {
      id: "w-garage-west",
      kind: "exterior",
      closed: false,
      thickness: EX,
      roomIds: [],
      centerline: [pt(501, 147), pt(501, 381)],
    },
  ],
  rooms: [
    {
      id: "primary",
      name: "Primary Bedroom",
      type: "bedroom",
      category: "living",
      polygon: [pt(12, 12), pt(180, 12), pt(180, 156), pt(12, 156)],
      labelAnchor: pt(96, 78),
    },
    {
      id: "wic",
      name: "Walk-In Closet",
      type: "closet",
      category: "service",
      polygon: [
        pt(180, 12),
        pt(264, 12),
        pt(264, 96),
        pt(228, 96),
        pt(228, 156),
        pt(180, 156),
      ],
      labelAnchor: pt(216, 64),
    },
    {
      id: "ensuite",
      name: "Bathroom",
      type: "bathroom",
      category: "wet",
      polygon: [pt(228, 96), pt(312, 96), pt(312, 156), pt(228, 156)],
      labelAnchor: pt(270, 126),
    },
    {
      id: "bath2",
      name: "Bathroom",
      type: "bathroom",
      category: "wet",
      polygon: [pt(312, 12), pt(384, 12), pt(384, 84), pt(312, 84)],
      labelAnchor: pt(348, 48),
    },
    {
      id: "bed3",
      name: "Bedroom 3",
      type: "bedroom",
      category: "living",
      polygon: [pt(384, 12), pt(492, 12), pt(492, 144), pt(384, 144)],
      labelAnchor: pt(438, 72),
    },
    {
      id: "bed2",
      name: "Bedroom 2",
      type: "bedroom",
      category: "living",
      polygon: [pt(384, 144), pt(492, 144), pt(492, 276), pt(384, 276)],
      labelAnchor: pt(438, 210),
    },
    {
      id: "living",
      name: "Living Room",
      type: "living_room",
      category: "living",
      polygon: [
        pt(12, 168),
        pt(300, 168),
        pt(300, 276),
        pt(192, 276),
        pt(192, 360),
        pt(12, 360),
      ],
      labelAnchor: pt(120, 230),
    },
    {
      id: "dining",
      name: "Dining Room",
      type: "dining_room",
      category: "living",
      polygon: [pt(192, 276), pt(300, 276), pt(300, 360), pt(192, 360)],
      labelAnchor: pt(246, 318),
    },
    {
      id: "kitchen",
      name: "Kitchen",
      type: "kitchen",
      category: "wet",
      polygon: [pt(300, 168), pt(372, 168), pt(372, 276), pt(300, 276)],
      labelAnchor: pt(336, 222),
    },
    {
      id: "laundry",
      name: "Laundry",
      type: "laundry",
      category: "wet",
      polygon: [pt(372, 168), pt(432, 168), pt(432, 228), pt(372, 228)],
      labelAnchor: pt(402, 198),
    },
    {
      id: "hall",
      name: "Hallway",
      type: "hallway",
      category: "living",
      polygon: [pt(312, 84), pt(384, 84), pt(384, 156), pt(312, 156)],
      labelAnchor: pt(348, 120),
    },
    {
      id: "garage",
      name: "Garage",
      type: "garage",
      category: "service",
      polygon: [pt(510, 156), pt(732, 156), pt(732, 372), pt(510, 372)],
      labelAnchor: pt(621, 264),
    },
  ],
  doors: [
    // ext-shell path to south segment start = 1116; then west from x=741.
    // Opening latch@108 then hinge@72 → hingeSide end.
    {
      id: "entry",
      wallId: "ext-shell",
      offset: len(1116 + (741 - 108)),
      width: len(36),
      hingeSide: "end",
      swingSide: -1,
      exterior: true,
    },
    {
      id: "d-primary",
      wallId: "w-suite-south",
      offset: len(96 - 6),
      width: len(32),
      hingeSide: "start",
      swingSide: -1,
      exterior: false,
    },
    {
      id: "d-wic",
      wallId: "w-primary-east",
      offset: len(48 - 6),
      width: len(30),
      hingeSide: "start",
      swingSide: 1,
      exterior: false,
    },
    {
      id: "d-ensuite",
      wallId: "w-ensuite-east",
      offset: len(120 - 96),
      width: len(28),
      hingeSide: "start",
      swingSide: -1,
      exterior: false,
    },
    {
      id: "d-bath2",
      wallId: "w-bath-south",
      offset: len(330 - 312),
      width: len(30),
      hingeSide: "start",
      swingSide: 1,
      exterior: false,
    },
    {
      id: "d-bed3",
      wallId: "w-bed-west",
      offset: len(48 - 6),
      width: len(32),
      hingeSide: "start",
      swingSide: 1,
      exterior: false,
    },
    {
      id: "d-bed2",
      wallId: "w-bed-west",
      offset: len(180 - 6),
      width: len(32),
      hingeSide: "start",
      swingSide: 1,
      exterior: false,
    },
    {
      id: "d-laundry",
      wallId: "w-kitchen-east",
      offset: len(188 - 162),
      width: len(28),
      hingeSide: "start",
      swingSide: -1,
      exterior: false,
    },
    {
      id: "d-garage",
      wallId: "w-garage-west",
      offset: len(300 - 147),
      width: len(36),
      hingeSide: "start",
      swingSide: 1,
      exterior: false,
    },
  ],
  windows: [
    {
      id: "win-primary-n",
      wallId: "ext-shell",
      offset: len(48 - 3),
      width: len(72),
    },
    // West wrap-around: length before wrap = 1854, then down from y=381.
    {
      id: "win-primary-w",
      wallId: "ext-shell",
      offset: len(1854 + (381 - 120)),
      width: len(72),
    },
    {
      id: "win-bed3-n",
      wallId: "ext-shell",
      offset: len(408 - 3),
      width: len(60),
    },
    {
      id: "win-bed3-e",
      wallId: "ext-shell",
      offset: len(498 + (36 - 3)),
      width: len(72),
    },
    {
      id: "win-bed2-e",
      wallId: "w-garage-west",
      offset: len(180 - 147),
      width: len(72),
    },
    {
      id: "win-living-w",
      wallId: "ext-shell",
      offset: len(1854 + (381 - 300)),
      width: len(84),
    },
    {
      id: "win-living-s",
      wallId: "ext-shell",
      offset: len(1116 + (741 - 216)),
      width: len(72),
    },
    {
      id: "win-dining-s",
      wallId: "ext-shell",
      offset: len(1116 + (741 - 276)),
      width: len(60),
    },
    {
      id: "win-kitchen-n",
      wallId: "w-suite-south",
      offset: len(280 - 6),
      width: len(24),
    },
    {
      id: "win-garage-e",
      wallId: "ext-shell",
      offset: len(882 + (216 - 147)),
      width: len(96),
    },
    {
      id: "win-garage-s",
      wallId: "ext-shell",
      offset: len(1116 + (741 - 680)),
      width: len(120),
    },
  ],
  openings: [],
  stairs: [],
  labels: [],
};
