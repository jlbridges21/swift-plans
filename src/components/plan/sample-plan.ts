/**
 * Hand-authored sample floor geometry for /debug/plan-style.
 * Coordinates are inches. This is artwork — hardcoded on purpose.
 *
 * Value import of splitWallsForOpenings only — keeps Node strip-types working.
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
 * Typed floor geometry document (schemaVersion 3 — room-edge openings).
 */
export const sampleFloorGeometry: FloorGeometry = {
  schemaVersion: 3,
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
      type: "primary_bedroom",
      category: "living",
      polygon: [pt(12, 12), pt(180, 12), pt(180, 156), pt(12, 156)],
      labelAnchor: pt(96, 78),
    },
    {
      id: "wic",
      name: "Walk-In Closet",
      type: "walk_in_closet",
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
      category: "service",
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
    // Living south edge (index 4): (192,360)→(12,360). Entry near x=72–108.
    {
      id: "entry",
      roomId: "living",
      edgeIndex: 4,
      offsetIn: len(192 - 108),
      widthIn: len(36),
      hingeEnd: "end",
      swingSide: -1,
    },
    // Primary south (index 2): (180,156)→(12,156). Door near x=90.
    {
      id: "d-primary",
      roomId: "primary",
      edgeIndex: 2,
      offsetIn: len(180 - 122),
      widthIn: len(32),
      hingeEnd: "start",
      swingSide: -1,
    },
    // Primary east (index 1): (180,12)→(180,156). Door near y=48.
    {
      id: "d-wic",
      roomId: "primary",
      edgeIndex: 1,
      offsetIn: len(48 - 12),
      widthIn: len(30),
      hingeEnd: "start",
      swingSide: 1,
    },
    // Ensuite east (index 1): (312,96)→(312,156).
    {
      id: "d-ensuite",
      roomId: "ensuite",
      edgeIndex: 1,
      offsetIn: len(120 - 96),
      widthIn: len(28),
      hingeEnd: "start",
      swingSide: -1,
    },
    // Bath2 south (index 2): (384,84)→(312,84).
    {
      id: "d-bath2",
      roomId: "bath2",
      edgeIndex: 2,
      offsetIn: len(384 - 360),
      widthIn: len(30),
      hingeEnd: "start",
      swingSide: 1,
    },
    // Bed3 west (index 3): (384,144)→(384,12).
    {
      id: "d-bed3",
      roomId: "bed3",
      edgeIndex: 3,
      offsetIn: len(144 - 80),
      widthIn: len(32),
      hingeEnd: "start",
      swingSide: 1,
    },
    // Bed2 west (index 3): (384,276)→(384,144).
    {
      id: "d-bed2",
      roomId: "bed2",
      edgeIndex: 3,
      offsetIn: len(276 - 212),
      widthIn: len(32),
      hingeEnd: "start",
      swingSide: 1,
    },
    // Kitchen east (index 1): (372,168)→(372,276).
    {
      id: "d-laundry",
      roomId: "kitchen",
      edgeIndex: 1,
      offsetIn: len(188 - 168),
      widthIn: len(28),
      hingeEnd: "start",
      swingSide: -1,
    },
    // Garage west (index 3): (510,372)→(510,156).
    {
      id: "d-garage",
      roomId: "garage",
      edgeIndex: 3,
      offsetIn: len(372 - 336),
      widthIn: len(36),
      hingeEnd: "start",
      swingSide: 1,
    },
  ],
  windows: [
    {
      id: "win-primary-n",
      roomId: "primary",
      edgeIndex: 0,
      offsetIn: len(48 - 12),
      widthIn: len(72),
    },
    {
      id: "win-primary-w",
      roomId: "primary",
      edgeIndex: 3,
      offsetIn: len(156 - 120),
      widthIn: len(72),
    },
    {
      id: "win-bed3-n",
      roomId: "bed3",
      edgeIndex: 0,
      offsetIn: len(24),
      widthIn: len(60),
    },
    {
      id: "win-bed3-e",
      roomId: "bed3",
      edgeIndex: 1,
      offsetIn: len(24),
      widthIn: len(72),
    },
    {
      id: "win-bed2-e",
      roomId: "bed2",
      edgeIndex: 1,
      offsetIn: len(24),
      widthIn: len(72),
    },
    {
      id: "win-living-w",
      roomId: "living",
      edgeIndex: 5,
      offsetIn: len(60),
      widthIn: len(84),
    },
    {
      id: "win-living-s",
      roomId: "living",
      edgeIndex: 4,
      offsetIn: len(40),
      widthIn: len(72),
    },
    {
      id: "win-dining-s",
      roomId: "dining",
      edgeIndex: 2,
      offsetIn: len(20),
      widthIn: len(60),
    },
    {
      id: "win-kitchen-n",
      roomId: "kitchen",
      edgeIndex: 0,
      offsetIn: len(16),
      widthIn: len(24),
    },
    {
      id: "win-garage-e",
      roomId: "garage",
      edgeIndex: 1,
      offsetIn: len(40),
      widthIn: len(96),
    },
    {
      id: "win-garage-s",
      roomId: "garage",
      edgeIndex: 2,
      offsetIn: len(40),
      widthIn: len(120),
    },
  ],
  openings: [],
  stairs: [],
  labels: [],
};
