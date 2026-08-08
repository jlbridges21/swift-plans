import {
  doorHingeAndLatch,
  doorSwingPaths,
  formatRoomDimensions,
  openingEndpoints,
  pointsToPath,
  polygonAreaSqIn,
  ringsToPath,
  roomLongAxisDegrees,
  sqInToSqFt,
  wallPolygonFromCenterline,
  windowPaneLines,
} from "@/components/plan/geometry";
import {
  PLAN_FONT_FAMILY,
  floorTextureForRoomType,
  planTokens,
} from "@/lib/plan-style/tokens";
import {
  isEmptyFloorGeometry,
  type FloorGeometry,
} from "@/types/plan-geometry";

type PlanDrawingProps = {
  geometry: FloorGeometry;
};

function wallById(geometry: FloorGeometry, wallId: string) {
  const wall = geometry.walls.find((w) => w.id === wallId);
  if (!wall) {
    throw new Error(`Unknown wall id: ${wallId}`);
  }
  return wall;
}

/** Finite viewBox parts for empty and non-empty documents. */
export function planViewBox(geometry: FloorGeometry): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const margin = planTokens.sheetMargin;
  const { bounds } = geometry.meta;
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    width: bounds.maxX - bounds.minX + margin * 2,
    height: bounds.maxY - bounds.minY + margin * 2,
  };
}

export function PlanDrawing({ geometry }: PlanDrawingProps) {
  const { minX: viewMinX, minY: viewMinY, width: viewW, height: viewH } =
    planViewBox(geometry);
  const { bounds, title } = geometry.meta;
  const margin = planTokens.sheetMargin;
  const empty = isEmptyFloorGeometry(geometry);

  const livingRooms = geometry.rooms.filter((r) => r.type !== "garage");
  const totalLivingSqFt = livingRooms.reduce(
    (sum, room) => sum + sqInToSqFt(polygonAreaSqIn(room.polygon)),
    0,
  );

  const texturedRooms = geometry.rooms.filter(
    (room) => floorTextureForRoomType(room.type) !== "none",
  );

  return (
    <svg
      viewBox={`${viewMinX} ${viewMinY} ${viewW} ${viewH}`}
      role="img"
      aria-label={title || "Floor plan"}
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        background: planTokens.paper,
      }}
    >
      <defs>
        {texturedRooms.map((room) => {
          const texture = floorTextureForRoomType(room.type);
          if (texture === "plank") {
            const spacing = planTokens.plankSpacing;
            const rotation = roomLongAxisDegrees(room.polygon);
            return (
              <pattern
                key={`tex-${room.id}`}
                id={`tex-${room.id}`}
                width={spacing}
                height={spacing}
                patternUnits="userSpaceOnUse"
                patternTransform={`rotate(${rotation})`}
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2={spacing}
                  stroke={planTokens.symbol}
                  strokeWidth={planTokens.stroke.annotation}
                  opacity={planTokens.textureOpacity}
                />
              </pattern>
            );
          }
          const spacing = planTokens.tileSpacing;
          return (
            <pattern
              key={`tex-${room.id}`}
              id={`tex-${room.id}`}
              width={spacing}
              height={spacing}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M 0 ${spacing / 2} H ${spacing} M ${spacing / 2} 0 V ${spacing}`}
                fill="none"
                stroke={planTokens.symbol}
                strokeWidth={planTokens.stroke.annotation}
                opacity={planTokens.textureOpacity}
              />
            </pattern>
          );
        })}
      </defs>

      <rect
        x={viewMinX}
        y={viewMinY}
        width={viewW}
        height={viewH}
        fill={planTokens.paper}
      />

      {empty ? (
        <text
          x={(bounds.minX + bounds.maxX) / 2}
          y={(bounds.minY + bounds.maxY) / 2}
          textAnchor="middle"
          fontFamily={PLAN_FONT_FAMILY}
          fill={planTokens.inkSubtle}
          fontSize={14}
        >
          Empty floor plan — add your first room next
        </text>
      ) : null}
      {geometry.rooms.map((room) => (
        <g key={`fill-${room.id}`}>
          <path
            d={pointsToPath(room.polygon)}
            fill={planTokens.fill[room.category]}
            stroke="none"
          />
          {floorTextureForRoomType(room.type) !== "none" ? (
            <path
              d={pointsToPath(room.polygon)}
              fill={`url(#tex-${room.id})`}
              stroke="none"
            />
          ) : null}
        </g>
      ))}

      {geometry.walls
        .filter((w) => w.kind === "interior")
        .map((wall) => {
          const fill = wallPolygonFromCenterline(
            wall.centerline,
            wall.thickness,
            wall.closed,
          );
          return (
            <path
              key={wall.id}
              d={ringsToPath(fill.rings)}
              fill={planTokens.ink}
              fillRule="evenodd"
              stroke="none"
            />
          );
        })}
      {geometry.walls
        .filter((w) => w.kind === "exterior")
        .map((wall) => {
          const fill = wallPolygonFromCenterline(
            wall.centerline,
            wall.thickness,
            wall.closed,
          );
          return (
            <path
              key={wall.id}
              d={ringsToPath(fill.rings)}
              fill={planTokens.ink}
              fillRule="evenodd"
              stroke="none"
            />
          );
        })}

      {geometry.windows.map((win) => {
        const wall = wallById(geometry, win.wallId);
        const { start, end } = openingEndpoints(
          wall.centerline,
          win.offset,
          win.width,
          wall.closed,
        );
        const [a1, b1, a2, b2] = windowPaneLines(
          start,
          end,
          wall.thickness,
          planTokens.window.insetRatio,
        );
        return (
          <g
            key={win.id}
            fill="none"
            stroke={planTokens.symbol}
            strokeWidth={planTokens.window.stroke}
            strokeLinecap="square"
          >
            <line x1={a1.x} y1={a1.y} x2={b1.x} y2={b1.y} />
            <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} />
          </g>
        );
      })}

      {geometry.doors.map((door) => {
        const wall = wallById(geometry, door.wallId);
        const { hinge, latch } = doorHingeAndLatch(
          wall.centerline,
          door.offset,
          door.width,
          door.hingeSide,
          wall.closed,
        );
        const { leaf, arc } = doorSwingPaths(hinge, latch, door.swingSide);
        return (
          <g
            key={door.id}
            fill="none"
            stroke={planTokens.symbol}
            strokeWidth={planTokens.doorSwing.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line
              x1={hinge.x}
              y1={hinge.y}
              x2={latch.x}
              y2={latch.y}
              stroke={planTokens.paper}
              strokeWidth={wall.thickness * 0.85}
              strokeLinecap="butt"
            />
            <path d={arc} />
            <path d={leaf} />
          </g>
        );
      })}

      {geometry.rooms.map((room) => {
        const at = room.labelAnchor;
        const area = Math.round(sqInToSqFt(polygonAreaSqIn(room.polygon)));
        const dims = formatRoomDimensions(room.polygon);
        return (
          <text
            key={`label-${room.id}`}
            x={at.x}
            y={at.y}
            textAnchor="middle"
            fontFamily={PLAN_FONT_FAMILY}
          >
            <tspan
              x={at.x}
              dy="0"
              fill={planTokens.inkMuted}
              fontSize={planTokens.typography.labelSize}
              fontWeight={planTokens.typography.labelWeight}
              letterSpacing={planTokens.typography.labelLetterSpacing}
            >
              {room.name.toUpperCase()}
            </tspan>
            <tspan
              x={at.x}
              dy="16"
              fill={planTokens.inkSubtle}
              fontSize={planTokens.typography.dimensionSize}
              fontWeight={400}
              letterSpacing="0.04em"
            >
              {dims}
            </tspan>
            <tspan
              x={at.x}
              dy="14"
              fill={planTokens.inkSubtle}
              fontSize={planTokens.typography.areaSize}
              fontWeight={400}
            >
              {area} SQ FT
            </tspan>
          </text>
        );
      })}

      {!empty ? (
        <text
          x={bounds.minX + margin * 0.15}
          y={bounds.maxY + margin * 0.55}
          fontFamily={PLAN_FONT_FAMILY}
          fill={planTokens.inkMuted}
          fontSize={planTokens.typography.totalAreaSize}
          fontWeight={600}
          letterSpacing="0.08em"
        >
          TOTAL LIVING AREA  {Math.round(totalLivingSqFt).toLocaleString()} SQ FT
        </text>
      ) : null}
    </svg>
  );
}
