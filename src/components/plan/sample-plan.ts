/**
 * Hand-authored sample plan for /debug/plan-style.
 * Coordinates are inches in drawing space (1 unit = 1 inch).
 * This is artwork, not live geometry — hardcoded on purpose.
 */

import type { RoomType } from "@/lib/plan-style/tokens";
import { planTokens } from "@/lib/plan-style/tokens";
import type { Point } from "@/components/plan/geometry";

export type SampleRoom = {
  id: string;
  name: string;
  type: RoomType;
  /** Interior floor polygon (inside face of walls). */
  polygon: Point[];
  /** Optional label anchor; defaults to centroid. */
  labelAt?: Point;
};

export type SampleWall = {
  id: string;
  /** Wall centerline. */
  centerline: Point[];
  closed?: boolean;
  kind: "exterior" | "interior";
};

export type SampleDoor = {
  id: string;
  hinge: Point;
  latch: Point;
  /** +1 = swing to the left of hinge→latch; -1 = to the right. */
  swingSide: 1 | -1;
  exterior?: boolean;
};

export type SampleWindow = {
  id: string;
  a: Point;
  b: Point;
  wallKind: "exterior" | "interior";
};

const EX = planTokens.wallExterior;
const IN = planTokens.wallInterior;

/**
 * Linear scale on the authored sketch so living area lands near ~1,450 sq ft.
 * Wall thicknesses (EX/IN) are NOT scaled — they stay real-world inches.
 */
const S = 1.2;
function pt(x: number, y: number): Point {
  return { x: x * S, y: y * S };
}

/**
 * Footprint after scale: main ~50'×38' with east-attached ~24'×24' garage.
 * Non-rectangular: L-shaped living room + L-shaped walk-in closet.
 */
export const sampleRooms: SampleRoom[] = [
  {
    id: "primary",
    name: "Primary Bedroom",
    type: "bedroom",
    polygon: [pt(12, 12), pt(180, 12), pt(180, 156), pt(12, 156)],
    labelAt: pt(96, 78),
  },
  {
    id: "wic",
    name: "Walk-In Closet",
    type: "closet",
    polygon: [
      pt(180, 12),
      pt(264, 12),
      pt(264, 96),
      pt(228, 96),
      pt(228, 156),
      pt(180, 156),
    ],
    labelAt: pt(216, 64),
  },
  {
    id: "ensuite",
    name: "Bathroom",
    type: "bathroom",
    polygon: [pt(228, 96), pt(312, 96), pt(312, 156), pt(228, 156)],
    labelAt: pt(270, 126),
  },
  {
    id: "bath2",
    name: "Bathroom",
    type: "bathroom",
    polygon: [pt(312, 12), pt(384, 12), pt(384, 84), pt(312, 84)],
    labelAt: pt(348, 48),
  },
  {
    id: "bed3",
    name: "Bedroom 3",
    type: "bedroom",
    polygon: [pt(384, 12), pt(492, 12), pt(492, 144), pt(384, 144)],
    labelAt: pt(438, 72),
  },
  {
    id: "bed2",
    name: "Bedroom 2",
    type: "bedroom",
    polygon: [pt(384, 144), pt(492, 144), pt(492, 276), pt(384, 276)],
    labelAt: pt(438, 210),
  },
  {
    id: "living",
    name: "Living Room",
    type: "living_room",
    polygon: [
      pt(12, 168),
      pt(300, 168),
      pt(300, 276),
      pt(192, 276),
      pt(192, 360),
      pt(12, 360),
    ],
    labelAt: pt(120, 230),
  },
  {
    id: "dining",
    name: "Dining Room",
    type: "dining_room",
    polygon: [pt(192, 276), pt(300, 276), pt(300, 360), pt(192, 360)],
    labelAt: pt(246, 318),
  },
  {
    id: "kitchen",
    name: "Kitchen",
    type: "kitchen",
    polygon: [pt(300, 168), pt(372, 168), pt(372, 276), pt(300, 276)],
    labelAt: pt(336, 222),
  },
  {
    id: "laundry",
    name: "Laundry",
    type: "laundry",
    polygon: [pt(372, 168), pt(432, 168), pt(432, 228), pt(372, 228)],
    labelAt: pt(402, 198),
  },
  {
    id: "hall",
    name: "Hallway",
    type: "hallway",
    polygon: [pt(312, 84), pt(384, 84), pt(384, 156), pt(312, 156)],
    labelAt: pt(348, 120),
  },
  {
    id: "garage",
    name: "Garage",
    type: "garage",
    polygon: [pt(510, 156), pt(732, 156), pt(732, 372), pt(510, 372)],
    labelAt: pt(621, 264),
  },
];

/** Outer face of the building envelope (for warm-variant shadow). */
export const sampleFootprintOuter: Point[] = [
  pt(0, 0),
  pt(504, 0),
  pt(504, 144),
  pt(744, 144),
  pt(744, 384),
  pt(0, 384),
];

/**
 * Exterior centerline — closed loop around house + garage.
 * Inset ~half exterior thickness from the outer face (then scaled with plan).
 */
const exteriorCenterline: Point[] = [
  pt(3, 3),
  pt(501, 3),
  pt(501, 147),
  pt(741, 147),
  pt(741, 381),
  pt(3, 381),
];

export const sampleWalls: SampleWall[] = [
  {
    id: "ext-shell",
    kind: "exterior",
    closed: true,
    centerline: exteriorCenterline,
  },
  {
    id: "w-primary-east",
    kind: "interior",
    centerline: [pt(180, 6), pt(180, 162)],
  },
  {
    id: "w-wic-ensuite",
    kind: "interior",
    centerline: [pt(180, 96), pt(312, 96)],
  },
  {
    id: "w-ensuite-east",
    kind: "interior",
    centerline: [pt(228, 96), pt(228, 162)],
  },
  {
    id: "w-suite-south",
    kind: "interior",
    centerline: [pt(6, 162), pt(312, 162)],
  },
  {
    id: "w-bath-hall",
    kind: "interior",
    centerline: [pt(312, 6), pt(312, 162)],
  },
  {
    id: "w-bath-south",
    kind: "interior",
    centerline: [pt(312, 84), pt(384, 84)],
  },
  {
    id: "w-bed-west",
    kind: "interior",
    centerline: [pt(384, 6), pt(384, 282)],
  },
  {
    id: "w-bed-split",
    kind: "interior",
    centerline: [pt(384, 144), pt(498, 144)],
  },
  {
    id: "w-living-east",
    kind: "interior",
    centerline: [pt(300, 162), pt(300, 378)],
  },
  {
    id: "w-dining-north",
    kind: "interior",
    centerline: [pt(192, 276), pt(300, 276)],
  },
  {
    id: "w-living-jog",
    kind: "interior",
    centerline: [pt(192, 276), pt(192, 378)],
  },
  {
    id: "w-kitchen-east",
    kind: "interior",
    centerline: [pt(372, 162), pt(372, 282)],
  },
  {
    id: "w-laundry-south",
    kind: "interior",
    centerline: [pt(372, 228), pt(438, 228)],
  },
  {
    id: "w-laundry-east",
    kind: "interior",
    centerline: [pt(432, 162), pt(432, 228)],
  },
  {
    id: "w-garage-west",
    kind: "exterior",
    centerline: [pt(501, 147), pt(501, 381)],
  },
];

export const sampleDoors: SampleDoor[] = [
  {
    id: "entry",
    hinge: pt(72, 381),
    latch: pt(108, 381),
    swingSide: -1,
    exterior: true,
  },
  {
    id: "d-primary",
    hinge: pt(96, 162),
    latch: pt(128, 162),
    swingSide: -1,
  },
  {
    id: "d-wic",
    hinge: pt(180, 48),
    latch: pt(180, 78),
    swingSide: 1,
  },
  {
    id: "d-ensuite",
    hinge: pt(228, 120),
    latch: pt(228, 148),
    swingSide: -1,
  },
  {
    id: "d-bath2",
    hinge: pt(330, 84),
    latch: pt(360, 84),
    swingSide: 1,
  },
  {
    id: "d-bed3",
    hinge: pt(384, 48),
    latch: pt(384, 80),
    swingSide: 1,
  },
  {
    id: "d-bed2",
    hinge: pt(384, 180),
    latch: pt(384, 212),
    swingSide: 1,
  },
  {
    id: "d-laundry",
    hinge: pt(372, 188),
    latch: pt(372, 216),
    swingSide: -1,
  },
  {
    id: "d-garage",
    hinge: pt(501, 300),
    latch: pt(501, 336),
    swingSide: 1,
  },
];

export const sampleWindows: SampleWindow[] = [
  { id: "win-primary-n", a: pt(48, 3), b: pt(120, 3), wallKind: "exterior" },
  { id: "win-primary-w", a: pt(3, 48), b: pt(3, 120), wallKind: "exterior" },
  { id: "win-bed3-n", a: pt(408, 3), b: pt(468, 3), wallKind: "exterior" },
  { id: "win-bed3-e", a: pt(501, 36), b: pt(501, 108), wallKind: "exterior" },
  { id: "win-bed2-e", a: pt(501, 180), b: pt(501, 252), wallKind: "exterior" },
  { id: "win-living-w", a: pt(3, 216), b: pt(3, 300), wallKind: "exterior" },
  { id: "win-living-s", a: pt(144, 381), b: pt(216, 381), wallKind: "exterior" },
  { id: "win-dining-s", a: pt(216, 381), b: pt(276, 381), wallKind: "exterior" },
  { id: "win-kitchen-n", a: pt(318, 162), b: pt(354, 162), wallKind: "interior" },
  { id: "win-garage-e", a: pt(741, 216), b: pt(741, 312), wallKind: "exterior" },
  { id: "win-garage-s", a: pt(560, 381), b: pt(680, 381), wallKind: "exterior" },
];

export const samplePlanMeta = {
  title: "Sample Residence — ~1,450 sq ft",
  bounds: { minX: 0, minY: 0, maxX: 744 * S, maxY: 384 * S },
  exteriorThickness: EX,
  interiorThickness: IN,
};
