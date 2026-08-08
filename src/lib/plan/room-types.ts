/**
 * Single source of truth for room types: display names, categories,
 * living-area inclusion, floor texture, and picker order.
 *
 * Check scripts import this via relative path — no @/ aliases.
 */

export type PlanRoomCategory = "living" | "wet" | "service";

export type FloorTexture = "plank" | "tile" | "none";

export type RoomTypeDef = {
  displayName: string;
  category: PlanRoomCategory;
  /** When false, excluded from TOTAL LIVING AREA. */
  countsTowardLivingArea: boolean;
  floorTexture: FloorTexture;
};

/**
 * Full product room-type list.
 * Outdoor types (porch/patio/deck) and garage are excluded from living area
 * and use no floor texture.
 */
export const ROOM_TYPE_DEFS = {
  bedroom: {
    displayName: "Bedroom",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
  primary_bedroom: {
    displayName: "Primary Bedroom",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
  bathroom: {
    displayName: "Bathroom",
    category: "wet",
    countsTowardLivingArea: true,
    floorTexture: "tile",
  },
  half_bath: {
    displayName: "Half Bath",
    category: "wet",
    countsTowardLivingArea: true,
    floorTexture: "tile",
  },
  kitchen: {
    displayName: "Kitchen",
    category: "wet",
    countsTowardLivingArea: true,
    floorTexture: "tile",
  },
  living_room: {
    displayName: "Living Room",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
  family_room: {
    displayName: "Family Room",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
  dining_room: {
    displayName: "Dining Room",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
  office: {
    displayName: "Office",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
  laundry: {
    displayName: "Laundry",
    category: "wet",
    countsTowardLivingArea: true,
    floorTexture: "tile",
  },
  pantry: {
    displayName: "Pantry",
    category: "wet",
    countsTowardLivingArea: true,
    floorTexture: "tile",
  },
  closet: {
    displayName: "Closet",
    category: "service",
    countsTowardLivingArea: true,
    floorTexture: "none",
  },
  walk_in_closet: {
    displayName: "Walk-In Closet",
    category: "service",
    countsTowardLivingArea: true,
    floorTexture: "none",
  },
  hallway: {
    displayName: "Hallway",
    category: "service",
    countsTowardLivingArea: true,
    floorTexture: "none",
  },
  garage: {
    displayName: "Garage",
    category: "service",
    countsTowardLivingArea: false,
    floorTexture: "none",
  },
  bonus_room: {
    displayName: "Bonus Room",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
  sunroom: {
    displayName: "Sunroom",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
  mudroom: {
    displayName: "Mudroom",
    category: "wet",
    countsTowardLivingArea: true,
    floorTexture: "tile",
  },
  foyer: {
    displayName: "Foyer",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
  porch: {
    displayName: "Porch",
    category: "service",
    countsTowardLivingArea: false,
    floorTexture: "none",
  },
  patio: {
    displayName: "Patio",
    category: "service",
    countsTowardLivingArea: false,
    floorTexture: "none",
  },
  deck: {
    displayName: "Deck",
    category: "service",
    countsTowardLivingArea: false,
    floorTexture: "none",
  },
  other: {
    displayName: "Other",
    category: "living",
    countsTowardLivingArea: true,
    floorTexture: "plank",
  },
} as const satisfies Record<string, RoomTypeDef>;

export type PlanRoomType = keyof typeof ROOM_TYPE_DEFS;

/** Every known type — order matches object insertion (not picker order). */
export const ALL_PLAN_ROOM_TYPES = Object.keys(
  ROOM_TYPE_DEFS,
) as PlanRoomType[];

/**
 * Picker chip order: common labeling choices first, outdoor / rare last.
 * Not alphabetical.
 */
export const ROOM_TYPE_PICKER_ORDER: readonly PlanRoomType[] = [
  "bedroom",
  "primary_bedroom",
  "bathroom",
  "half_bath",
  "kitchen",
  "living_room",
  "dining_room",
  "family_room",
  "office",
  "laundry",
  "closet",
  "walk_in_closet",
  "hallway",
  "garage",
  "foyer",
  "mudroom",
  "pantry",
  "bonus_room",
  "sunroom",
  "porch",
  "patio",
  "deck",
  "other",
] as const;

/** Legacy stored type strings → current PlanRoomType. */
const LEGACY_ROOM_TYPES: Record<string, PlanRoomType> = {
  entry: "foyer",
};

export function isPlanRoomType(value: string): value is PlanRoomType {
  return Object.prototype.hasOwnProperty.call(ROOM_TYPE_DEFS, value);
}

export function normalizeRoomType(value: string): PlanRoomType {
  if (isPlanRoomType(value)) return value;
  const mapped = LEGACY_ROOM_TYPES[value];
  if (mapped) return mapped;
  return "other";
}

export function roomTypeDisplayName(type: PlanRoomType): string {
  return ROOM_TYPE_DEFS[type].displayName;
}

export function roomTypeCategory(type: PlanRoomType): PlanRoomCategory {
  return ROOM_TYPE_DEFS[type].category;
}

export function countsTowardLivingArea(type: PlanRoomType): boolean {
  return ROOM_TYPE_DEFS[type].countsTowardLivingArea;
}

export function floorTextureForRoomType(type: PlanRoomType): FloorTexture {
  return ROOM_TYPE_DEFS[type].floorTexture;
}

/** Escape for RegExp from a display name. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `name` matches the auto label for `type` (Base or Base N). */
export function isAutoGeneratedRoomName(
  name: string,
  type: PlanRoomType,
): boolean {
  const base = roomTypeDisplayName(type);
  if (name === base) return true;
  return new RegExp(`^${escapeRegExp(base)} \\d+$`).test(name);
}

/**
 * Next auto name for a type: "Bedroom", then "Bedroom 2", "Bedroom 3", …
 * `excludeRoomId` is omitted from the conflict set (the room being labeled).
 */
export function nextAutoRoomName(
  rooms: ReadonlyArray<{ id: string; type: PlanRoomType; name: string }>,
  type: PlanRoomType,
  excludeRoomId?: string,
): string {
  const base = roomTypeDisplayName(type);
  const used = new Set(
    rooms
      .filter((r) => r.type === type && r.id !== excludeRoomId)
      .map((r) => r.name),
  );
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
