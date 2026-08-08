import {
  doorSwingPaths,
  formatRoomDimensions,
  pointsToPath,
  polygonAreaSqIn,
  polygonCentroid,
  sqInToSqFt,
  wallPolygonFromCenterline,
  windowPaneLines,
} from "@/components/plan/geometry";
import {
  sampleDoors,
  sampleFootprintOuter,
  samplePlanMeta,
  sampleRooms,
  sampleWalls,
  sampleWindows,
} from "@/components/plan/sample-plan";
import {
  planTokens,
  ROOM_TYPE_CATEGORY,
  type RoomCategory,
} from "@/lib/plan-style/tokens";

export type PlanVariantId = "minimal" | "warm" | "textured";

type PlanVariantStyle = {
  id: PlanVariantId;
  paper: string;
  ink: string;
  inkMuted: string;
  inkSubtle: string;
  fills: Record<RoomCategory, string>;
  showShadow: boolean;
  showHatch: boolean;
  wallInk: string;
  labelWeight: number;
};

const variants: Record<PlanVariantId, PlanVariantStyle> = {
  minimal: {
    id: "minimal",
    paper: "#fbfaf7",
    ink: "#2a2824",
    inkMuted: "#6a655c",
    inkSubtle: "#9a9488",
    fills: {
      living: "rgba(42, 40, 36, 0.015)",
      wet: "rgba(42, 40, 36, 0.03)",
      service: "rgba(42, 40, 36, 0.02)",
    },
    showShadow: false,
    showHatch: false,
    wallInk: "#2a2824",
    labelWeight: 500,
  },
  warm: {
    id: "warm",
    paper: planTokens.paper,
    ink: planTokens.ink,
    inkMuted: planTokens.inkMuted,
    inkSubtle: planTokens.inkSubtle,
    fills: { ...planTokens.fill },
    showShadow: true,
    showHatch: false,
    wallInk: planTokens.ink,
    labelWeight: 600,
  },
  textured: {
    id: "textured",
    paper: "#f5f0e6",
    ink: "#2c2a26",
    inkMuted: "#5c574e",
    inkSubtle: "#8a8478",
    fills: {
      living: "rgba(44, 42, 38, 0.035)",
      wet: "rgba(44, 42, 38, 0.065)",
      service: "rgba(44, 42, 38, 0.05)",
    },
    showShadow: false,
    showHatch: true,
    wallInk: "#2c2a26",
    labelWeight: 600,
  },
};

function footprintOuterPath(): string {
  return pointsToPath(sampleFootprintOuter, true);
}

function hatchPatternId(variant: PlanVariantId, category: RoomCategory): string {
  return `hatch-${variant}-${category}`;
}

type PlanDrawingProps = {
  variant: PlanVariantId;
};

export function PlanDrawing({ variant }: PlanDrawingProps) {
  const style = variants[variant];
  const margin = planTokens.sheetMargin;
  const { bounds } = samplePlanMeta;
  const viewMinX = bounds.minX - margin;
  const viewMinY = bounds.minY - margin;
  const viewW = bounds.maxX - bounds.minX + margin * 2;
  const viewH = bounds.maxY - bounds.minY + margin * 2;

  const livingRooms = sampleRooms.filter((r) => r.type !== "garage");
  const totalLivingSqFt = livingRooms.reduce(
    (sum, room) => sum + sqInToSqFt(polygonAreaSqIn(room.polygon)),
    0,
  );

  return (
    <svg
      viewBox={`${viewMinX} ${viewMinY} ${viewW} ${viewH}`}
      role="img"
      aria-label={`${samplePlanMeta.title} — ${variant} style`}
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        background: style.paper,
      }}
    >
      <defs>
        {style.showHatch ? (
          <>
            <pattern
              id={hatchPatternId(variant, "living")}
              width="18"
              height="18"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(12)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="18"
                stroke={style.ink}
                strokeWidth={planTokens.stroke.annotation}
                opacity={planTokens.hatchOpacity * 12}
              />
            </pattern>
            <pattern
              id={hatchPatternId(variant, "wet")}
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 0 7 H 14 M 7 0 V 14"
                fill="none"
                stroke={style.ink}
                strokeWidth={planTokens.stroke.annotation}
                opacity={planTokens.hatchOpacity * 14}
              />
            </pattern>
            <pattern
              id={hatchPatternId(variant, "service")}
              width="16"
              height="16"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-18)"
            >
              <line
                x1="0"
                y1="0"
                x2="16"
                y2="0"
                stroke={style.ink}
                strokeWidth={planTokens.stroke.annotation}
                opacity={planTokens.hatchOpacity * 12}
              />
            </pattern>
          </>
        ) : null}

        {style.showShadow ? (
          <filter
            id={`shadow-${variant}`}
            x="-5%"
            y="-5%"
            width="120%"
            height="120%"
          >
            <feDropShadow
              dx="4"
              dy="6"
              stdDeviation="5"
              floodColor={planTokens.footprintShadow}
              floodOpacity="1"
            />
          </filter>
        ) : null}
      </defs>

      {/* Paper ground */}
      <rect
        x={viewMinX}
        y={viewMinY}
        width={viewW}
        height={viewH}
        fill={style.paper}
      />

      {style.showShadow ? (
        <path
          d={footprintOuterPath()}
          fill={style.paper}
          filter={`url(#shadow-${variant})`}
        />
      ) : null}

      {/* Room fills */}
      {sampleRooms.map((room) => {
        const category = ROOM_TYPE_CATEGORY[room.type];
        return (
          <g key={`fill-${room.id}`}>
            <path
              d={pointsToPath(room.polygon)}
              fill={style.fills[category]}
              stroke="none"
            />
            {style.showHatch ? (
              <path
                d={pointsToPath(room.polygon)}
                fill={`url(#${hatchPatternId(variant, category)})`}
                stroke="none"
              />
            ) : null}
          </g>
        );
      })}

      {/* Walls — filled mitered polygons; exterior drawn after interior so shell wins at edges */}
      {sampleWalls
        .filter((w) => w.kind === "interior")
        .map((wall) => {
          const poly = wallPolygonFromCenterline(
            wall.centerline,
            samplePlanMeta.interiorThickness,
            Boolean(wall.closed),
          );
          return (
            <path
              key={wall.id}
              d={pointsToPath(poly)}
              fill={style.wallInk}
              stroke="none"
            />
          );
        })}
      {sampleWalls
        .filter((w) => w.kind === "exterior")
        .map((wall) => {
          const poly = wallPolygonFromCenterline(
            wall.centerline,
            samplePlanMeta.exteriorThickness,
            Boolean(wall.closed),
          );
          return (
            <path
              key={wall.id}
              d={pointsToPath(poly)}
              fill={style.wallInk}
              stroke="none"
            />
          );
        })}

      {/* Windows */}
      {sampleWindows.map((win) => {
        const thickness =
          win.wallKind === "exterior"
            ? samplePlanMeta.exteriorThickness
            : samplePlanMeta.interiorThickness;
        const [a1, b1, a2, b2] = windowPaneLines(
          win.a,
          win.b,
          thickness,
          planTokens.window.insetRatio,
        );
        return (
          <g
            key={win.id}
            fill="none"
            stroke={style.ink}
            strokeWidth={planTokens.window.stroke}
            strokeLinecap="square"
          >
            <line x1={a1.x} y1={a1.y} x2={b1.x} y2={b1.y} />
            <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} />
          </g>
        );
      })}

      {/* Doors */}
      {sampleDoors.map((door) => {
        const { leaf, arc } = doorSwingPaths(
          door.hinge,
          door.latch,
          door.swingSide,
        );
        return (
          <g
            key={door.id}
            fill="none"
            stroke={style.ink}
            strokeWidth={planTokens.doorSwing.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={arc} />
            <path d={leaf} />
            {/* Opening throat — clear the wall visually with paper-colored butt */}
            <line
              x1={door.hinge.x}
              y1={door.hinge.y}
              x2={door.latch.x}
              y2={door.latch.y}
              stroke={style.paper}
              strokeWidth={
                door.exterior
                  ? samplePlanMeta.exteriorThickness * 0.85
                  : samplePlanMeta.interiorThickness * 0.85
              }
              strokeLinecap="butt"
            />
            {/* Redraw leaf/arc above the cut */}
            <path d={arc} />
            <path d={leaf} />
          </g>
        );
      })}

      {/* Labels */}
      {sampleRooms.map((room) => {
        const at = room.labelAt ?? polygonCentroid(room.polygon);
        const area = Math.round(sqInToSqFt(polygonAreaSqIn(room.polygon)));
        const dims = formatRoomDimensions(room.polygon);
        return (
          <text
            key={`label-${room.id}`}
            x={at.x}
            y={at.y}
            textAnchor="middle"
            fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
          >
            <tspan
              x={at.x}
              dy="0"
              fill={style.inkMuted}
              fontSize={planTokens.typography.labelSize}
              fontWeight={style.labelWeight}
              letterSpacing={planTokens.typography.labelLetterSpacing}
            >
              {room.name.toUpperCase()}
            </tspan>
            <tspan
              x={at.x}
              dy="16"
              fill={style.inkSubtle}
              fontSize={planTokens.typography.dimensionSize}
              fontWeight={400}
              letterSpacing="0.04em"
            >
              {dims}
            </tspan>
            <tspan
              x={at.x}
              dy="14"
              fill={style.inkSubtle}
              fontSize={planTokens.typography.areaSize}
              fontWeight={400}
            >
              {area} SQ FT
            </tspan>
          </text>
        );
      })}

      {/* Total living area — considered placement below the sheet title area */}
      <text
        x={bounds.minX + margin * 0.15}
        y={bounds.maxY + margin * 0.55}
        fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
        fill={style.inkMuted}
        fontSize={planTokens.typography.totalAreaSize}
        fontWeight={600}
        letterSpacing="0.08em"
      >
        TOTAL LIVING AREA  {Math.round(totalLivingSqFt).toLocaleString()} SQ FT
      </text>
    </svg>
  );
}

export const planVariantCopy: Record<
  PlanVariantId,
  { title: string; intent: string }
> = {
  minimal: {
    title: "Minimal editorial",
    intent:
      "Near-white ground, hairline presence, typography carries hierarchy — the plan as a quiet layout document.",
  },
  warm: {
    title: "Warm architectural",
    intent:
      "Soft paper tone, tonal room fills, subtle footprint shadow, slightly heavier poché — classic realtor presentation.",
  },
  textured: {
    title: "Textured",
    intent:
      "Category-aware floor hatching at very low opacity — tile grids in wet rooms, plank lines in living space — the most ‘designed’ reading.",
  },
};
