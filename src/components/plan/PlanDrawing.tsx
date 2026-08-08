import {
  doorSwingPaths,
  formatRoomDimensions,
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
  planTokens,
} from "@/lib/plan-style/tokens";
import { livingAreaSqFt } from "@/lib/plan/area";
import {
  estimateLabelTextWidth,
  roomAabb,
} from "@/lib/plan/labels";
import {
  floorTextureForRoomType,
  normalizeRoomType,
} from "@/lib/plan/room-types";
import {
  doorHingeLatchFromAnchor,
  resolveOpeningGeom,
} from "@/lib/plan/resolve-opening";
import { stairsDirectionVector, stairsPolygon } from "@/lib/plan/stairs";
import {
  isEmptyFloorGeometry,
  type FloorGeometry,
  type PlanRoom,
} from "@/types/plan-geometry";

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

type PlanDocumentProps = {
  geometry: FloorGeometry;
};

type LabelLayout = {
  showDims: boolean;
  showArea: boolean;
  nameSize: number;
};

function labelLayoutForRoom(room: PlanRoom): LabelLayout {
  const box = roomAabb(room);
  const avail =
    box.maxX - box.minX - planTokens.labelFit.paddingIn * 2;
  const name = room.name.toUpperCase();
  const dims = formatRoomDimensions(room.polygon);
  const area = `${Math.round(sqInToSqFt(polygonAreaSqIn(room.polygon)))} SQ FT`;

  let nameSize = planTokens.typography.labelSize;
  const nameFits = (size: number) =>
    estimateLabelTextWidth(name, size) <= Math.max(avail, 1);

  while (nameSize > planTokens.labelFit.minNameSize && !nameFits(nameSize)) {
    nameSize -= 1;
  }

  const dimsW = estimateLabelTextWidth(dims, planTokens.typography.dimensionSize);
  const areaW = estimateLabelTextWidth(area, planTokens.typography.areaSize);
  const showDims = dimsW <= avail;
  const showArea = showDims && areaW <= avail;

  return { showDims, showArea, nameSize };
}

/**
 * Pure document layers (no SVG root, no editing chrome).
 * Safe to place inside an editor camera SVG or a standalone PlanDrawing.
 */
export function PlanDocument({ geometry }: PlanDocumentProps) {
  const { bounds, title } = geometry.meta;
  const margin = planTokens.sheetMargin;
  const empty = isEmptyFloorGeometry(geometry);

  const livingSqFt = livingAreaSqFt(geometry);
  const totalLivingSqFt = livingSqFt ?? 0;

  const texturedRooms = geometry.rooms.filter(
    (room) =>
      floorTextureForRoomType(normalizeRoomType(room.type)) !== "none",
  );

  return (
    <g aria-label={title || "Floor plan"}>
      <defs>
        {texturedRooms.map((room) => {
          const texture = floorTextureForRoomType(
            normalizeRoomType(room.type),
          );
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
          {floorTextureForRoomType(normalizeRoomType(room.type)) !==
          "none" ? (
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
        const geom = resolveOpeningGeom(geometry, win);
        if (!geom) return null;
        const [a1, b1, a2, b2] = windowPaneLines(
          geom.start,
          geom.end,
          geom.thickness,
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
        const resolved = doorHingeLatchFromAnchor(geometry, door);
        if (!resolved) return null;
        const { hinge, latch, thickness } = resolved;
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
            {/* Clears residual fill on hand-authored samples; no-op on true gaps */}
            <line
              x1={hinge.x}
              y1={hinge.y}
              x2={latch.x}
              y2={latch.y}
              stroke={planTokens.paper}
              strokeWidth={thickness * 0.85}
              strokeLinecap="butt"
            />
            <path d={arc} />
            <path d={leaf} />
          </g>
        );
      })}

      {/* Plain openings: gap only — no symbol */}

      {geometry.stairs.map((stair) => {
        const poly = stairsPolygon(stair);
        const dir = stairsDirectionVector(stair);
        const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
        const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
        const arrowLen = Math.min(stair.widthIn, stair.depthIn) * 0.35;
        const tip = {
          x: cx + dir.x * arrowLen,
          y: cy + dir.y * arrowLen,
        };
        // Tread lines perpendicular to ascent
        const px = -dir.y;
        const py = dir.x;
        const halfW = stair.widthIn * 0.4;
        const treadCount = Math.max(3, Math.round(stair.depthIn / 12));
        const treads = [];
        for (let i = 1; i < treadCount; i += 1) {
          const t = i / treadCount;
          const ox = poly[0].x + (poly[3].x - poly[0].x) * t;
          const oy = poly[0].y + (poly[3].y - poly[0].y) * t;
          // Along width from left side of run
          const along = {
            x: (poly[1].x - poly[0].x) * t + poly[0].x,
            y: (poly[1].y - poly[0].y) * t + poly[0].y,
          };
          // Better: interpolate along depth edges
          const left = {
            x: poly[0].x + (poly[3].x - poly[0].x) * t,
            y: poly[0].y + (poly[3].y - poly[0].y) * t,
          };
          const right = {
            x: poly[1].x + (poly[2].x - poly[1].x) * t,
            y: poly[1].y + (poly[2].y - poly[1].y) * t,
          };
          void ox;
          void oy;
          void along;
          void halfW;
          void px;
          void py;
          treads.push(
            <line
              key={`tread-${stair.id}-${i}`}
              x1={left.x}
              y1={left.y}
              x2={right.x}
              y2={right.y}
              stroke={planTokens.symbol}
              strokeWidth={planTokens.stroke.annotation}
            />,
          );
        }
        return (
          <g key={stair.id}>
            <path
              d={pointsToPath(poly)}
              fill="none"
              stroke={planTokens.ink}
              strokeWidth={planTokens.stroke.fixture}
            />
            {treads}
            <line
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              stroke={planTokens.ink}
              strokeWidth={planTokens.stroke.fixture}
              strokeLinecap="round"
            />
            <text
              x={cx}
              y={cy - 8}
              textAnchor="middle"
              fontFamily={PLAN_FONT_FAMILY}
              fill={planTokens.inkMuted}
              fontSize={11}
              fontWeight={600}
            >
              {stair.direction.toUpperCase()}
            </text>
          </g>
        );
      })}

      {geometry.rooms.map((room) => {
        const at = room.labelAnchor;
        const area = Math.round(sqInToSqFt(polygonAreaSqIn(room.polygon)));
        const dims = formatRoomDimensions(room.polygon);
        const layout = labelLayoutForRoom(room);
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
              fontSize={layout.nameSize}
              fontWeight={planTokens.typography.labelWeight}
              letterSpacing={planTokens.typography.labelLetterSpacing}
            >
              {room.name.toUpperCase()}
            </tspan>
            {layout.showDims ? (
              <tspan
                x={at.x}
                dy={planTokens.labelFit.dimLineDy}
                fill={planTokens.inkSubtle}
                fontSize={planTokens.typography.dimensionSize}
                fontWeight={400}
                letterSpacing="0.04em"
              >
                {dims}
              </tspan>
            ) : null}
            {layout.showArea ? (
              <tspan
                x={at.x}
                dy={planTokens.labelFit.areaLineDy}
                fill={planTokens.inkSubtle}
                fontSize={planTokens.typography.areaSize}
                fontWeight={400}
              >
                {area} SQ FT
              </tspan>
            ) : null}
          </text>
        );
      })}

      {!empty && livingSqFt !== null ? (
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
    </g>
  );
}

type PlanDrawingProps = {
  geometry: FloorGeometry;
};

/** Standalone document renderer (debug / export). No editing chrome. */
export function PlanDrawing({ geometry }: PlanDrawingProps) {
  const { minX: viewMinX, minY: viewMinY, width: viewW, height: viewH } =
    planViewBox(geometry);
  const { title } = geometry.meta;

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
      <rect
        x={viewMinX}
        y={viewMinY}
        width={viewW}
        height={viewH}
        fill={planTokens.paper}
      />
      <PlanDocument geometry={geometry} />
    </svg>
  );
}
