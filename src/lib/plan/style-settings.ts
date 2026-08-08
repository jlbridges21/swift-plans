/**
 * Project-level plan style settings — applied at render / derive time,
 * never baked into room geometry.
 *
 * Relative-import friendly for check scripts (.ts extensions).
 */

export type LabelSizeStep = "sm" | "md" | "lg";

export type PlanStyleSettings = {
  wallExteriorIn: number;
  wallInteriorIn: number;
  showRoomDimensions: boolean;
  showRoomAreas: boolean;
  showTotalArea: boolean;
  showRoomFills: boolean;
  showFloorTexture: boolean;
  showDoorSwings: boolean;
  labelSize: LabelSizeStep;
};

export const DEFAULT_PLAN_STYLE: PlanStyleSettings = {
  wallExteriorIn: 6,
  wallInteriorIn: 4.5,
  showRoomDimensions: true,
  showRoomAreas: true,
  showTotalArea: true,
  showRoomFills: true,
  showFloorTexture: true,
  showDoorSwings: true,
  labelSize: "md",
};

export const LABEL_SIZE_PX: Record<LabelSizeStep, number> = {
  sm: 12,
  md: 16,
  lg: 20,
};

export function normalizePlanStyle(
  raw: unknown,
): PlanStyleSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PLAN_STYLE };
  const o = raw as Record<string, unknown>;
  const labelSize =
    o.labelSize === "sm" || o.labelSize === "md" || o.labelSize === "lg"
      ? o.labelSize
      : DEFAULT_PLAN_STYLE.labelSize;
  const wallExteriorIn =
    typeof o.wallExteriorIn === "number" && o.wallExteriorIn > 0
      ? o.wallExteriorIn
      : DEFAULT_PLAN_STYLE.wallExteriorIn;
  const wallInteriorIn =
    typeof o.wallInteriorIn === "number" && o.wallInteriorIn > 0
      ? o.wallInteriorIn
      : DEFAULT_PLAN_STYLE.wallInteriorIn;
  const bool = (v: unknown, d: boolean) =>
    typeof v === "boolean" ? v : d;
  return {
    wallExteriorIn,
    wallInteriorIn,
    showRoomDimensions: bool(o.showRoomDimensions, true),
    showRoomAreas: bool(o.showRoomAreas, true),
    showTotalArea: bool(o.showTotalArea, true),
    showRoomFills: bool(o.showRoomFills, true),
    showFloorTexture: bool(o.showFloorTexture, true),
    showDoorSwings: bool(o.showDoorSwings, true),
    labelSize,
  };
}
